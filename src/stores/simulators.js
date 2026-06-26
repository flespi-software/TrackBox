import { defineStore, acceptHMRUpdate } from 'pinia'
import { LocalStorage } from 'quasar'
import { buildRoute, boundsOf } from '../sim/geo'
import { SimEngine } from '../sim/engine'
import { sendMessages, transportNeedsLogin } from '../sim/transports'
import { encodeSource, decodeSource } from '../sim/routeCodec'
import { appStore } from '../storage'
import { logInfo, logWarn, logError } from '../log'
import { useAuthStore } from './auth'

// Non-reactive runtime engine instances, keyed by simulator id.
const engines = new Map()

// Cloud-sync internal flags (non-reactive).
let cloudSubscribed = false
let applyingCloud = false // suppress re-publish while applying incoming cloud data
let loadStarted = false // guard the async load() against re-entry

const STORAGE_KEY = 'trackbox-simulators'
const STATE_KEY = 'trackbox-state' // last playback state (position/progress), per id
const CLOUD_BASE = 'xflespifront/trackbox/simulators'

// Simulators (with compressed routes) live in IndexedDB — localStorage's ~5 MB
// synchronous string store can't hold more than a handful of routes. The small,
// frequently-written playback STATE_KEY stays in localStorage (sync, survives
// the beforeunload handler where async IndexedDB writes wouldn't complete).
const simDB = appStore('simulators')

let lastStateSave = 0

/* Serializable shape stored locally and in the cloud (no runtime fields).
   The route is compressed here, so both IndexedDB and the MQTT payload stay small. */
function serializeSim(s) {
  return {
    id: s.id,
    name: s.name,
    color: s.color,
    hideTrack: s.hideTrack || false,
    cloudSync: s.cloudSync || false, // per-flow: publish this sim to the broker
    source: encodeSource(s.source),
    transport: s.transport,
    options: s.options,
  }
}

/* IndexedDB's structured clone can't serialize Vue's reactive proxies (source/
   transport/options are reactive store state), so round-trip to plain objects
   before writing. The MQTT path is fine — it goes through JSON.stringify. */
function plainSnapshot(simulators) {
  return JSON.parse(JSON.stringify(simulators.map(serializeSim)))
}

/* Turn a transport/axios send failure into a reason the user can act on. */
function describeSendError(e) {
  const reason = e?.response?.data?.errors?.[0]?.reason
  if (reason) return reason // flespi rejected it — show its reason
  const status = e?.response?.status
  if (status) return `HTTP ${status}${e.response.statusText ? ' ' + e.response.statusText : ''}`
  const msg = e?.message || String(e)
  // axios reports "Network Error" with no response — the request never reached
  // the server. Spell out the likely causes since the bare message is opaque.
  if (/network error/i.test(msg)) {
    return 'Network error — no response from the channel (offline, host/port unreachable, CORS, or HTTP blocked on an HTTPS page). The desktop app avoids browser CORS/mixed-content limits.'
  }
  return msg
}

const PALETTE = [
  '#e53935', '#1e88e5', '#43a047', '#fb8c00', '#8e24aa',
  '#00acc1', '#fdd835', '#6d4c41', '#3949ab', '#d81b60',
]

function newId() {
  return Date.now().toString(36) + Math.random().toString(16).slice(2, 8)
}

function freshRuntime() {
  return {
    status: 'idle', // idle | running | paused | done
    position: null, // { lat, lon }
    direction: 0,
    speed: 0,
    progress: 0,
    distance: 0,
    sentCount: 0,
    lastSentAt: null,
    lastError: null,
    lastSent: null, // last built message (so cards can show the actual sent state)
    overrides: {}, // live manual overrides set from the card (win over auto)
  }
}

/* Default option set merged into every simulator. */
function defaultOptions() {
  return {
    speedKmh: 50, // cruise (simulate) / fixed (constant) speed
    sendInterval: 10, // wall-clock seconds between messages
    timeMultiplier: 1, // playback speed when following route-derived speed
    loop: false,
    // 'auto' = use route data (timestamps/speed) if present, else simulate;
    // 'simulate' = natural profile that slows on turns; 'constant' = fixed speed.
    speedMode: 'auto',
    // Extra report when heading changes by this many degrees (0 = off) — gives
    // denser points through turns/interchanges.
    turnDeg: 20,
    satellites: 12,
    // Vehicle-state parameters injected into every message (ignition, doors,
    // seatbelt, pedals, …): { 'engine.ignition.status': true, ... }
    vehicleParams: {},
    // Per-parameter automatic control: { 'headlight.status': true, ... }. A key
    // flagged true is derived from motion/stops by the engine instead of the
    // manual value in vehicleParams.
    autoParams: {},
    // Stops along the route: [{ at: 0..1 fraction, sec }]. Derived from waypoint
    // dwell (build mode); file-mode stops are auto-detected by the engine.
    stops: [],
    trafficLights: false, // short auto-stops at some sharp turns
    extraParams: null,
  }
}

/* Migrate older saved options to the current model. */
function migrateOptions(o = {}) {
  const opts = { ...defaultOptions(), ...o }
  if (o.speedMode == null && o.useTimestamps != null) {
    opts.speedMode = o.useTimestamps ? 'auto' : 'constant'
  }
  delete opts.useTimestamps
  // Drop the old global auto toggles — replaced by per-parameter autoParams.
  delete opts.autoSim
  delete opts.autoDoors
  return opts
}

export const useSimulatorsStore = defineStore('simulators', {
  /* this.$connector is attached by boot/flespi-io.js */
  state: () => ({
    simulators: [],
    loaded: false,
  }),

  getters: {
    runningCount: (s) => s.simulators.filter((x) => x.runtime.status === 'running').length,
    pausedCount: (s) => s.simulators.filter((x) => x.runtime.status === 'paused').length,
    byId: (s) => (id) => s.simulators.find((x) => x.id === id),
    // Delegates to the transport registry (each protocol declares needsLogin).
    transportNeedsLogin: () => (type) => transportNeedsLogin(type),
  },

  actions: {
    ctx() {
      return { connector: this.$connector }
    },

    async load() {
      if (this.loaded || loadStarted) return
      loadStarted = true
      let saved = await simDB.getItem(STORAGE_KEY)
      // One-time migration from the old localStorage location (uncompressed).
      let migrated = false
      if (!Array.isArray(saved)) {
        const legacy = LocalStorage.getItem(STORAGE_KEY)
        if (Array.isArray(legacy)) {
          saved = legacy
          migrated = true
        }
      }
      const state = LocalStorage.getItem(STATE_KEY) || {}
      if (Array.isArray(saved)) {
        this.simulators = saved.map((s) => {
          const sim = {
            ...s,
            cloudSync: !!s.cloudSync,
            source: decodeSource(s.source),
            options: migrateOptions(s.options),
            runtime: freshRuntime(),
          }
          // Restore last playback state (position/progress) from a previous session.
          const st = state[s.id]
          if (st) {
            sim.runtime.progress = st.progress || 0
            sim.runtime.position = st.position || null
            sim.runtime.sentCount = st.sentCount || 0
            sim.runtime.distance = (sim.source.totalDistance || 0) * (st.progress || 0)
            // A running/paused sim comes back paused, ready to resume where it left off.
            sim.runtime.status = st.status === 'running' || st.status === 'paused' ? 'paused' : 'idle'
            sim._resume = st.simTime || 0
          }
          return sim
        })
      }
      this.loaded = true
      // Rewrite into IndexedDB in the compressed shape, and only drop the legacy
      // localStorage copy once that write actually succeeded (no data loss on error).
      if (migrated) {
        try {
          await simDB.setItem(STORAGE_KEY, plainSnapshot(this.simulators))
          LocalStorage.remove(STORAGE_KEY)
        } catch (e) {
          if (process.env.DEV) console.log('[migrate]', e)
        }
      }
      if (typeof window !== 'undefined') {
        window.addEventListener('beforeunload', () => this.saveState())
      }
    },

    persist() {
      simDB.setItem(STORAGE_KEY, plainSnapshot(this.simulators)).catch((e) => {
        if (process.env.DEV) console.log('[persist]', e)
      })
    },

    /* Lightweight per-id playback state (position/progress/simTime), throttled. */
    saveState() {
      const map = {}
      for (const s of this.simulators) {
        const engine = engines.get(s.id)
        map[s.id] = {
          simTime: engine ? engine.simTime : s._resume || 0,
          progress: s.runtime.progress,
          status: s.runtime.status,
          sentCount: s.runtime.sentCount,
          position: s.runtime.position,
        }
      }
      LocalStorage.set(STATE_KEY, map)
    },

    scheduleSaveState() {
      const now = Date.now()
      if (now - lastStateSave < 3000) return
      lastStateSave = now
      this.saveState()
    },

    addSimulator(def) {
      const points = def.source.points
      const sim = {
        id: newId(),
        name: def.name || `Device ${this.simulators.length + 1}`,
        color: PALETTE[this.simulators.length % PALETTE.length],
        hideTrack: false,
        cloudSync: def.cloudSync || false,
        source: {
          format: def.source.format,
          fileName: def.source.fileName || '',
          points,
          totalDistance: buildRoute(points, { speedKmh: 50 }).totalDistance,
          bounds: boundsOf(points),
          hasTimes: def.source.hasTimes,
          hasSpeeds: def.source.hasSpeeds,
          build: def.source.build || undefined,
        },
        transport: { ...def.transport },
        options: migrateOptions(def.options),
        runtime: freshRuntime(),
      }
      this.simulators.push(sim)
      this.persist()
      this.cloudPublish(sim)
      return sim.id
    },

    updateSimulator(id, patch) {
      const sim = this.byId(id)
      if (!sim) return
      if (patch.name != null) sim.name = patch.name
      if (patch.source) {
        sim.source = {
          format: patch.source.format,
          fileName: patch.source.fileName || '',
          points: patch.source.points,
          totalDistance: buildRoute(patch.source.points, { speedKmh: 50 }).totalDistance,
          bounds: boundsOf(patch.source.points),
          hasTimes: patch.source.hasTimes,
          hasSpeeds: patch.source.hasSpeeds,
          build: patch.source.build || undefined,
        }
      }
      if (patch.transport) sim.transport = { ...patch.transport }
      if (patch.options) sim.options = { ...sim.options, ...patch.options }
      // Config changed: drop any stale engine so it rebuilds on next start.
      this.stop(id)
      this.persist()
      this.cloudPublish(sim)
    },

    removeSimulator(id) {
      this.stop(id)
      engines.delete(id)
      const wasCloud = this.byId(id)?.cloudSync
      const i = this.simulators.findIndex((s) => s.id === id)
      if (i >= 0) this.simulators.splice(i, 1)
      this.persist()
      if (wasCloud) this.cloudClear(id)
    },

    _ensureEngine(sim) {
      let engine = engines.get(sim.id)
      if (engine) return engine
      const route = buildRoute(sim.source.points, {
        speedKmh: sim.options.speedKmh,
        speedMode: sim.options.speedMode,
        loop: sim.options.loop,
        stops: sim.options.stops,
        trafficLights: sim.options.trafficLights,
      })
      engine = new SimEngine({
        route,
        options: {
          sendInterval: sim.options.sendInterval,
          timeScale: route.usesRouteSpeed ? sim.options.timeMultiplier : 1,
          loop: sim.options.loop,
          turnDeg: sim.options.turnDeg,
          turnMinInterval: 1,
          satellites: sim.options.satellites,
          vehicleParams: { ...(sim.options.vehicleParams || {}) },
          autoParams: { ...(sim.options.autoParams || {}) },
          manualOverrides: { ...(sim.runtime.overrides || {}) },
          extraParams: sim.options.extraParams,
        },
        onTick: (st) => {
          const rt = sim.runtime
          rt.position = { lat: st.lat, lon: st.lon }
          rt.direction = st.direction
          rt.speed = st.speed
          rt.progress = st.progress
          rt.distance = route.totalDistance * st.progress
          if (st.finished) rt.status = 'done'
          this.scheduleSaveState()
        },
        onSend: async (messages) => {
          // The built message reflects the current simulated state (incl.
          // auto-derived doors/telemetry) — surface it so cards show real values.
          if (messages.length) sim.runtime.lastSent = messages[messages.length - 1]
          const prevError = sim.runtime.lastError
          try {
            await sendMessages(this.ctx(), sim.transport, messages)
            sim.runtime.sentCount += messages.length
            sim.runtime.lastSentAt = Date.now()
            // Log only on transition (recovered), not every interval.
            if (prevError) logInfo('send', `${sim.name}: sending recovered`)
            sim.runtime.lastError = null
          } catch (e) {
            const reason = describeSendError(e)
            if (reason !== prevError) logError('send', `${sim.name} (${sim.transport.type}): ${reason}`)
            sim.runtime.lastError = reason
          }
        },
      })
      // Resume from the last saved playback position, if any.
      if (sim._resume) {
        engine.simTime = Math.min(sim._resume, engine.route.totalDuration || 0)
        engine.segHint = 0
        delete sim._resume
      }
      engines.set(sim.id, engine)
      return engine
    },

    start(id) {
      const sim = this.byId(id)
      if (!sim) return
      // Block transports that require a flespi login when not logged in.
      if (this.transportNeedsLogin(sim.transport.type) && !useAuthStore().token) {
        sim.runtime.lastError = 'Login required for this transport'
        logWarn('sim', `${sim.name}: start blocked — login required for ${sim.transport.type}`)
        return
      }
      const resuming = sim.runtime.status === 'paused'
      const engine = this._ensureEngine(sim)
      // Place marker at start immediately.
      const snap = engine.snapshot()
      sim.runtime.position = { lat: snap.lat, lon: snap.lon }
      sim.runtime.status = 'running'
      engine.start()
      logInfo('sim', `${sim.name}: ${resuming ? 'resumed' : 'started'} (${sim.transport.type})`)
    },

    pause(id) {
      const sim = this.byId(id)
      const engine = engines.get(id)
      if (engine) engine.pause()
      if (sim && sim.runtime.status === 'running') {
        sim.runtime.status = 'paused'
        logInfo('sim', `${sim.name}: paused`)
      }
      lastStateSave = 0
      this.saveState()
    },

    stop(id) {
      const sim = this.byId(id)
      const engine = engines.get(id)
      if (engine) {
        engine.stop()
        engines.delete(id)
        if (sim) logInfo('sim', `${sim.name}: stopped`)
      }
      if (sim) {
        delete sim._resume
        sim.runtime.status = 'idle'
        sim.runtime.progress = 0
        sim.runtime.distance = 0
        sim.runtime.speed = 0
        sim.runtime.position = null
        sim.runtime.sentCount = 0
        sim.runtime.lastSentAt = null // stop the "x ago" timer from ticking after stop
        sim.runtime.lastSent = null // chips revert to the configured values
        sim.runtime.overrides = {} // clear live manual overrides
      }
      lastStateSave = 0
      this.saveState()
    },

    startAll() {
      const token = useAuthStore().token
      this.simulators.forEach((s) => {
        if (s.runtime.status === 'running') return
        if (this.transportNeedsLogin(s.transport.type) && !token) return // skip blocked
        this.start(s.id)
      })
    },

    pauseAll() {
      this.simulators.forEach((s) => {
        if (s.runtime.status === 'running') this.pause(s.id)
      })
    },

    /* Single play/pause-all control:
       - something running  -> pause it
       - nothing running but some paused -> resume the paused ones
       - nothing running or paused -> start everything */
    playPauseAll() {
      if (this.runningCount > 0) {
        this.pauseAll()
        return
      }
      const paused = this.simulators.filter((s) => s.runtime.status === 'paused')
      if (paused.length) paused.forEach((s) => this.start(s.id))
      else this.startAll()
    },

    stopAll() {
      this.simulators.forEach((s) => this.stop(s.id))
    },

    /* Live playback-speed control for timestamp-replay routes. */
    setTimeMultiplier(id, mult) {
      const sim = this.byId(id)
      if (!sim) return
      sim.options.timeMultiplier = mult
      const engine = engines.get(id)
      if (engine && engine.route.usesRouteSpeed) engine.setOptions({ timeScale: mult })
      this.persist()
    },

    /* Live speed control (km/h) for constant-speed routes — rebuilds the route
       in place, preserving current progress. */
    setSpeed(id, kmh) {
      const sim = this.byId(id)
      if (!sim) return
      sim.options.speedKmh = kmh
      const engine = engines.get(id)
      if (engine && !engine.route.usesRouteSpeed) {
        const frac = engine.route.totalDuration ? engine.simTime / engine.route.totalDuration : 0
        const route = buildRoute(sim.source.points, {
          speedKmh: kmh,
          speedMode: sim.options.speedMode,
          loop: sim.options.loop,
          stops: sim.options.stops,
          trafficLights: sim.options.trafficLights,
        })
        engine.route = route
        engine.simTime = frac * route.totalDuration
        engine.segHint = 0
      }
      this.persist()
    },

    /* Show/hide this simulator's route polyline on the map (marker stays). */
    toggleTrack(id) {
      const sim = this.byId(id)
      if (!sim) return
      sim.hideTrack = !sim.hideTrack
      this.persist()
    },

    /* Change a simulator's track/marker color. */
    setColor(id, color) {
      const sim = this.byId(id)
      if (!sim || !color) return
      sim.color = color
      this.persist()
      this.cloudPublish(sim)
    },

    /* Live vehicle-state control (ignition, doors, seatbelt, pedals, …). */
    setVehicleParam(id, key, value) {
      const sim = this.byId(id)
      if (!sim) return
      const params = { ...(sim.options.vehicleParams || {}) }
      if (value === undefined || value === null) delete params[key]
      else params[key] = value
      sim.options.vehicleParams = params
      const engine = engines.get(id)
      if (engine) engine.setOptions({ vehicleParams: { ...params } })
      this.persist()
      this.cloudPublish(sim)
    },

    /* Flag a parameter automatic (engine-derived) or manual. Saved per sim. */
    setAutoParam(id, key, value) {
      const sim = this.byId(id)
      if (!sim) return
      const auto = { ...(sim.options.autoParams || {}) }
      if (value) auto[key] = true
      else delete auto[key]
      sim.options.autoParams = auto
      const engine = engines.get(id)
      if (engine) engine.setOptions({ autoParams: { ...auto } })
      this.persist()
      this.cloudPublish(sim)
    },

    /* Live manual override from the card — wins over auto for that key. Held in
       runtime only (not persisted); cleared on stop. */
    setManualOverride(id, key, value) {
      const sim = this.byId(id)
      if (!sim) return
      const ov = { ...(sim.runtime.overrides || {}) }
      ov[key] = value
      sim.runtime.overrides = ov
      const engine = engines.get(id)
      if (engine) {
        engine.setOptions({ manualOverrides: { ...ov } })
        // Push the change out immediately instead of waiting for the next tick.
        engine.emitNow()
      }
    },

    // ---- cloud sync (flespi MQTT broker, retained messages) ----

    cloudTopic(id) {
      return `${CLOUD_BASE}/${id}`
    },

    socket() {
      return this.$connector && this.$connector.socket
    },

    /* Publish one simulator as a retained message (only if it opted into sync). */
    cloudPublish(sim) {
      if (!sim || !sim.cloudSync || applyingCloud) return
      const sock = this.socket()
      if (!sock) return
      try {
        sock.publish(this.cloudTopic(sim.id), JSON.stringify(serializeSim(sim)), {
          retain: true,
          qos: 1,
        })
      } catch (e) {
        logWarn('cloud', `publish failed for ${sim.name}: ${e?.message || e}`)
      }
    },

    /* Clear a simulator's retained message (empty payload deletes it). */
    cloudClear(id) {
      if (applyingCloud) return
      const sock = this.socket()
      if (!sock) return
      try {
        sock.publish(this.cloudTopic(id), '', { retain: true, qos: 1 })
      } catch (e) {
        logWarn('cloud', `clear failed: ${e?.message || e}`)
      }
    },

    /* Turn cloud sync on/off for a single simulator (per-flow). */
    setSimCloud(id, on) {
      const sim = this.byId(id)
      if (!sim) return
      sim.cloudSync = !!on
      this.persist()
      if (on) this.cloudPublish(sim)
      else this.cloudClear(id)
      logInfo('cloud', `${sim.name}: sync ${on ? 'enabled' : 'disabled'}`)
    },

    /* Subscribe to the cloud topic — retained messages load existing sims.
       Always on while the broker is connected so cloud-backed flows get pulled in.
       Scoped to our account: the topic is a shared namespace, so we filter by the
       token's cid (flespi stamps each message's publisher cid in userProperties). */
    async subscribeCloud() {
      if (cloudSubscribed) return
      const auth = useAuthStore()
      if (!auth.socketConnected) return // wait until the broker is connected
      cloudSubscribed = true // guard re-entry across the awaits below
      try {
        const cid = await auth.ensureCid()
        const sock = this.socket()
        // Connection may have dropped, or we couldn't resolve the account — retry later.
        if (!cid || !sock || !auth.socketConnected) {
          cloudSubscribed = false
          return
        }
        const that = this
        sock.subscribe({
          name: this.cloudTopic('+'),
          // No Local (MQTT 5): the broker must not echo our own publishes back to
          // us, otherwise toggling sync/clearing a flow would round-trip into our
          // own handler and mutate/remove the very simulator we just published.
          // userProperties.cid makes flespi deliver only our own account's messages.
          options: { nl: true, properties: { userProperties: { cid: String(cid) } } },
          handler(message, topic) {
            const id = topic.split('/').pop()
            const payload = message == null ? '' : message.toString()
            if (!payload) {
              that.applyCloudDelete(id)
              return
            }
            let cfg
            try {
              cfg = JSON.parse(payload)
            } catch {
              return
            }
            that.applyCloudUpsert(id, cfg)
          },
        })
      } catch (e) {
        cloudSubscribed = false
        logError('cloud', `subscribe failed: ${e?.message || e}`)
      }
    },

    /* Called when the MQTT connection drops so we re-subscribe on reconnect. */
    markCloudDisconnected() {
      cloudSubscribed = false
    },

    /* Upsert a simulator received from the cloud (without re-publishing it). */
    applyCloudUpsert(id, cfg) {
      if (!cfg || !cfg.source || !cfg.transport) return
      const existing = this.byId(id)
      // Don't disrupt a simulator that is currently playing.
      if (existing && (existing.runtime.status === 'running' || existing.runtime.status === 'paused')) {
        return
      }
      applyingCloud = true
      try {
        const source = decodeSource(cfg.source)
        if (existing) {
          existing.name = cfg.name || existing.name
          if (cfg.color) existing.color = cfg.color
          existing.cloudSync = true // it lives in the cloud, so keep syncing it
          existing.source = source
          existing.transport = cfg.transport
          existing.options = { ...defaultOptions(), ...(cfg.options || {}) }
        } else {
          this.simulators.push({
            id,
            name: cfg.name || `Device ${this.simulators.length + 1}`,
            color: cfg.color || PALETTE[this.simulators.length % PALETTE.length],
            cloudSync: true,
            source,
            transport: cfg.transport,
            options: migrateOptions(cfg.options),
            runtime: freshRuntime(),
          })
        }
        this.persist()
      } finally {
        applyingCloud = false
      }
    },

    /* The flow's cloud copy was removed (here or on another device). Keep it
       locally — explicit removal is the card's delete button — just stop syncing. */
    applyCloudDelete(id) {
      const sim = this.byId(id)
      if (!sim || !sim.cloudSync) return
      applyingCloud = true
      try {
        sim.cloudSync = false
        this.persist()
      } finally {
        applyingCloud = false
      }
    },
  },
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useSimulatorsStore, import.meta.hot))
}
