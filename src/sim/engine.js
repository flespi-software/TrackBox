// SimEngine drives one simulated device along a built route.
//
// A single clock (simTime, in route-seconds) advances every tick. Position is
// sampled from the route at simTime; messages are emitted on a wall-clock
// cadence (sendInterval) independent of the playback speed. Map/UI updates run
// on every tick for smooth motion; sends are throttled and batched.

import { sampleRoute } from './geo'

const TICK_MS = 120

/* Smallest angle between two headings, 0..180°. */
function headingDelta(a, b) {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

export class SimEngine {
  // Source-message fields that flespi assigns server-side (or that the transport
  // layer owns) — never forwarded from a replayed file.
  static SOURCE_SKIP = new Set([
    'server.timestamp',
    'channel.id',
    'device.id',
    'device.name',
    'device.type.id',
    'protocol.id',
    'peer',
    'ident',
  ])

  constructor({ route, options, onTick, onSend }) {
    this.route = route
    this.options = options // { sendInterval, timeScale, loop, satellites, extraParams }
    this.onTick = onTick // (state) => void
    this.onSend = onSend // async (messages[]) => void

    this.simTime = 0
    this.segHint = 0
    this.sendAcc = 0
    this.sinceLast = 0 // real seconds since the last sent message
    this.lastSentDir = null // heading at the last sent message
    this.prevSpeed = 0 // km/h, for acceleration
    this.accel = 0 // km/h per second
    this.odometerM = 0 // distance covered (meters) for mileage/fuel
    this.runSec = 0 // engine run time (seconds)
    this.running = false
    this._timer = null
    this._lastReal = 0
    this._sending = false
  }

  start() {
    if (this.running) return
    this.running = true
    this._lastReal = performance.now()
    this.sendAcc = this.options.sendInterval // emit one message immediately
    this.sinceLast = 0
    this.lastSentDir = null
    this.prevSpeed = 0
    this.accel = 0
    // Seed the odometer from the current position so resume continues smoothly.
    const total = this.route.totalDuration || 0
    this.odometerM = total ? (this.simTime / total) * this.route.totalDistance : 0
    this._timer = setInterval(() => this._tick(), TICK_MS)
  }

  pause() {
    this.running = false
    if (this._timer) clearInterval(this._timer)
    this._timer = null
  }

  stop() {
    this.pause()
    this.simTime = 0
    this.segHint = 0
    this.sendAcc = 0
  }

  setOptions(patch) {
    Object.assign(this.options, patch)
  }

  /* Current sampled state without advancing (for initial map placement). */
  snapshot() {
    return sampleRoute(this.route, this.simTime, this.segHint)
  }

  _tick() {
    const now = performance.now()
    const dtReal = (now - this._lastReal) / 1000
    this._lastReal = now

    const total = this.route.totalDuration || 0
    const scale = this.options.timeScale || 1
    this.simTime += dtReal * scale

    let finished = false
    if (total > 0 && this.simTime >= total) {
      if (this.options.loop) {
        this.simTime = this.simTime % total
        this.segHint = 0
      } else {
        this.simTime = total
        finished = true
      }
    }

    const s = sampleRoute(this.route, this.simTime, this.segHint)
    this.segHint = s.segIndex
    // Effective ground speed scales with playback rate so the reported
    // position.speed matches how fast the marker actually moves.
    s.speed = s.speedKmh * scale

    // Motion-derived state for auto telemetry (acceleration, odometer, run time).
    this.accel = dtReal > 0 ? (s.speed - this.prevSpeed) / dtReal : 0
    this.prevSpeed = s.speed
    this.runSec += dtReal
    this.odometerM += (s.speed / 3.6) * dtReal

    this.onTick({
      lat: s.lat,
      lon: s.lon,
      speed: s.speed,
      direction: s.direction,
      altitude: s.altitude,
      progress: total > 0 ? this.simTime / total : 1,
      finished,
    })

    this.sendAcc += dtReal
    this.sinceLast += dtReal

    // Report triggers: regular time interval, OR a significant heading change
    // (denser points through turns/interchanges), with a small floor so curves
    // don't flood the channel.
    let due = this.sendAcc >= this.options.sendInterval
    const turnDeg = this.options.turnDeg || 0
    if (!due && turnDeg > 0 && this.lastSentDir != null) {
      const turnMin = this.options.turnMinInterval || 1
      if (this.sinceLast >= turnMin && headingDelta(s.direction, this.lastSentDir) >= turnDeg) {
        due = true
      }
    }
    if (due) {
      this.sendAcc = 0
      this.sinceLast = 0
      this.lastSentDir = s.direction
      this._emit(s)
    }

    if (finished) {
      this.pause()
      // flush a final point at the destination
      this.lastSentDir = s.direction
      this._emit(s)
    }
  }

  _emit(s) {
    if (this._sending) return false // avoid overlapping sends on slow networks
    const msg = this._buildMessage(s)
    this._sending = true
    Promise.resolve(this.onSend([msg]))
      .catch(() => {})
      .finally(() => {
        this._sending = false
      })
    return true
  }

  /* Send one message right now (off the normal cadence) — used when the user
     changes a live value (e.g. opens a door) so it isn't held back until the
     next scheduled send. No-op when not running; doesn't disturb playback. */
  emitNow() {
    if (!this._timer) return
    // Restart the cadence only if the immediate send actually went out, so a
    // skipped overlap doesn't push the next scheduled send out by an interval.
    if (this._emit(this.snapshot())) this.sendAcc = 0
  }

  _buildMessage(s) {
    const round = (v, d) => (Number.isFinite(v) ? Number(v.toFixed(d)) : undefined)
    const sats = this.options.satellites
    const msg = {}
    // 0) Every parameter carried by the source message (flespi-JSON replay), so
    //    full telemetry from the file (CAN, doors, fuel, …) is forwarded, not
    //    just the position. Simulated geo/time below overrides the source's own.
    if (s.extra && typeof s.extra === 'object') this._mergeSource(msg, s.extra)
    // 1) Simulated position/time (authoritative — the device is "live" now).
    msg.timestamp = Date.now() / 1000
    msg['position.latitude'] = round(s.lat, 6)
    msg['position.longitude'] = round(s.lon, 6)
    msg['position.speed'] = round(s.speed, 2)
    msg['position.direction'] = round(s.direction, 1)
    msg['position.valid'] = true
    if (Number.isFinite(s.altitude)) msg['position.altitude'] = round(s.altitude, 1)
    if (Number.isFinite(sats)) msg['position.satellites'] = sats
    // 2) Configured vehicle params (manual values).
    if (this.options.vehicleParams && typeof this.options.vehicleParams === 'object') {
      Object.assign(msg, this.options.vehicleParams)
    }
    // 3) Per-parameter auto: for keys flagged automatic, override the manual
    //    value with the engine-derived one (telemetry from motion, doors at stops).
    const autoParams = this.options.autoParams
    if (autoParams && typeof autoParams === 'object') {
      const derived = this._deriveAll(s)
      for (const key in autoParams) {
        if (autoParams[key] && key in derived) msg[key] = derived[key]
      }
    }
    // 4) Live manual overrides (card chip clicks) win over auto — the user can
    //    take over any parameter on the fly, even an automatic one.
    if (this.options.manualOverrides && typeof this.options.manualOverrides === 'object') {
      Object.assign(msg, this.options.manualOverrides)
    }
    // 5) User extra params win over everything.
    if (this.options.extraParams && typeof this.options.extraParams === 'object') {
      Object.assign(msg, this.options.extraParams)
    }
    return msg
  }

  /* All parameters the engine can derive from motion/stops (telemetry + doors),
     keyed by param name. Per-parameter auto picks from this. */
  _deriveAll(s) {
    return { ...this._deriveTelemetry(s), ...this._deriveDoors(s) }
  }

  // Copy source-message params into msg. Flattens a nested `position` object
  // into dotted keys, and skips server-side/meta fields that flespi assigns
  // itself (and `ident`, which the transport layer owns) to avoid mis-routing.
  _mergeSource(msg, src) {
    for (const [k, v] of Object.entries(src)) {
      if (SimEngine.SOURCE_SKIP.has(k)) continue
      if (k === 'position' && v && typeof v === 'object' && !Array.isArray(v)) {
        for (const [pk, pv] of Object.entries(v)) msg[`position.${pk}`] = pv
      } else {
        msg[k] = v
      }
    }
  }

  /* Realistic telemetry derived from motion: ignition, movement, rpm, gear,
     mileage, fuel, coolant, engine hours and pedals. */
  _deriveTelemetry(s) {
    const r = (v, d) => Number(v.toFixed(d))
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
    const kmh = s.speed
    const moving = kmh > 1.5
    const km = this.odometerM / 1000
    const accel = this.accel
    const p = {
      'engine.ignition.status': true,
      'movement.status': moving,
      'can.vehicle.speed': r(kmh, 1),
      'engine.rpm': r(clamp(moving ? 900 + kmh * 28 + Math.max(0, accel) * 40 : 820, 700, 4800), 0),
      'can.gear': moving ? (kmh < 15 ? 1 : kmh < 30 ? 2 : kmh < 50 ? 3 : kmh < 70 ? 4 : 5) : 0,
      'vehicle.mileage': r(km, 3),
      'can.vehicle.mileage': r(km, 3),
      'fuel.level': r(clamp(80 - km * 0.12, 5, 100), 1),
      'can.fuel.consumed': r(km * 0.08, 2),
      'can.engine.coolant.temperature': r(Math.min(91, 22 + this.runSec * 0.6), 0),
      'engine.motorhours': r(this.runSec / 3600, 3),
      // Headlights on and driver buckled while driving; off/unbuckled at a stop.
      'headlight.status': moving,
      'can.seatbelt.status': moving,
    }
    // Pedals — acceleration wins over the standstill rule so pulling away from a
    // stop shows the accelerator, never the brake, even while speed is still < 1 km/h.
    if (accel > 0.6) {
      p['can.accelerator.pedal.position'] = r(clamp(18 + accel * 7, 0, 100), 0)
      p['can.pedal.brake.status'] = false
      p['can.brake.pedal.level'] = 0
    } else if (kmh < 1) {
      p['can.accelerator.pedal.position'] = 0
      p['can.pedal.brake.status'] = true
      p['can.brake.pedal.level'] = 35
    } else if (accel < -0.6) {
      p['can.accelerator.pedal.position'] = 0
      p['can.pedal.brake.status'] = true
      p['can.brake.pedal.level'] = r(clamp(-accel * 9, 0, 100), 0)
    } else {
      p['can.accelerator.pedal.position'] = r(clamp(8 + kmh * 0.12, 0, 55), 0)
      p['can.pedal.brake.status'] = false
      p['can.brake.pedal.level'] = 0
    }
    p['can.pedal.clutch.status'] = kmh < 3
    return p
  }

  /* Door states derived from motion. While driving, all doors are closed. At a
     real stop (not a traffic light) a deterministic, varied subset opens — the
     driver door always, plus 0–2 others (by segment index, so it's reproducible
     and differs per stop). Returns every door key so an automatic door also
     gets closed again after the stop. */
  _deriveDoors(s) {
    const out = {
      'can.front.left.door.status': false,
      'can.front.right.door.status': false,
      'can.rear.left.door.status': false,
      'can.rear.right.door.status': false,
      'can.trunk.status': false,
      'can.hood.status': false, // hood stays closed in normal operation
    }
    if (s.dwell && s.dwellKind === 'stop') {
      const h = (((s.segIndex || 0) + 1) * 2654435761) >>> 0
      out['can.front.left.door.status'] = true
      out['can.front.right.door.status'] = !!(h & 1)
      out['can.rear.left.door.status'] = !!(h & 2)
      out['can.rear.right.door.status'] = !!(h & 4)
      out['can.trunk.status'] = !!(h & 8) // trunk opens at some stops (loading)
    }
    return out
  }
}
