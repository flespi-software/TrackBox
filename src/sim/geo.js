// Geospatial helpers and route preprocessing for the GPS simulator.

const R = 6371008.8 // mean Earth radius, meters
const toRad = (d) => (d * Math.PI) / 180
const toDeg = (r) => (r * 180) / Math.PI

/* Great-circle distance between two {lat, lon} points, in meters. */
export function haversine(a, b) {
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const la1 = toRad(a.lat)
  const la2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/* Initial bearing from a to b, in degrees 0..360 (0 = north). */
export function bearing(a, b) {
  const la1 = toRad(a.lat)
  const la2 = toRad(b.lat)
  const dLon = toRad(b.lon - a.lon)
  const y = Math.sin(dLon) * Math.cos(la2)
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

/* Linear interpolation between two points (good enough for short segments). */
export function lerpPoint(a, b, f) {
  return {
    lat: a.lat + (b.lat - a.lat) * f,
    lon: a.lon + (b.lon - a.lon) * f,
  }
}

/* Bounding box of a list of points: { minLat, minLon, maxLat, maxLon }. */
export function boundsOf(points) {
  if (!points || !points.length) return null
  let minLat = Infinity,
    minLon = Infinity,
    maxLat = -Infinity,
    maxLon = -Infinity
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat
    if (p.lat > maxLat) maxLat = p.lat
    if (p.lon < minLon) minLon = p.lon
    if (p.lon > maxLon) maxLon = p.lon
  }
  return { minLat, minLon, maxLat, maxLon }
}

// Vehicle dynamics for the simulated speed profile (rough but natural).
const A_LATERAL = 2.5 // m/s² comfortable cornering acceleration
const A_ACCEL = 1.2 // m/s² acceleration
const A_DECEL = 2.2 // m/s² braking
const V_FLOOR = 3 / 3.6 // never below ~3 km/h (m/s)
// Replay stop auto-detection: a segment slower than this for at least this long
// is treated as a real stop (doors may open) without altering the timeline.
const STOP_DETECT_KMH = 3
const STOP_DETECT_SEC = 30

/*
 * Per-vertex speed limit (m/s) from corner sharpness, then smoothed by an
 * acceleration/braking pass so the car slows *before* a turn and speeds up
 * *after* it — like a real driver. Capped at the cruise speed.
 */
function simulateProfile(pts, segLen, cruiseMps) {
  const n = pts.length
  const vlim = new Array(n).fill(cruiseMps)
  for (let i = 1; i < n - 1; i++) {
    const b1 = bearing(pts[i - 1], pts[i])
    const b2 = bearing(pts[i], pts[i + 1])
    let dev = Math.abs(b2 - b1) % 360
    if (dev > 180) dev = 360 - dev // 0..180° deflection at the vertex
    const theta = (dev * Math.PI) / 180
    if (theta < 0.02) continue // basically straight
    // Estimate corner radius from the shorter adjacent half-segment.
    const d = Math.min(segLen[i - 1], segLen[i]) / 2
    const radius = d / Math.tan(theta / 2)
    const vCorner = Math.sqrt(A_LATERAL * Math.max(radius, 0.5))
    vlim[i] = Math.max(V_FLOOR, Math.min(cruiseMps, vCorner))
  }
  const v = vlim.slice()
  // forward: limit how fast we can accelerate out of a slow point
  for (let i = 1; i < n; i++) {
    v[i] = Math.min(v[i], Math.sqrt(v[i - 1] * v[i - 1] + 2 * A_ACCEL * segLen[i - 1]))
  }
  // backward: brake early enough for the upcoming slow point
  for (let i = n - 2; i >= 0; i--) {
    v[i] = Math.min(v[i], Math.sqrt(v[i + 1] * v[i + 1] + 2 * A_DECEL * segLen[i]))
  }
  return v
}

/*
 * Build a route ready for time-based playback.
 *
 * points: [{ lat, lon, timestamp?, speed?(km/h), altitude?, extra? }, ...]
 * opts: { speedKmh (cruise/constant), speedMode, loop }
 *   speedMode: 'auto'     — replay timestamps if present, else use per-point
 *                           speeds if present, else simulate a natural profile
 *              'simulate' — always simulate a natural profile (slows on turns)
 *              'constant' — fixed speedKmh everywhere
 *
 * Each segment carries a duration (seconds) plus vStart/vEnd (km/h), so a single
 * clock drives playback and the reported speed varies smoothly within a segment.
 */
export function buildRoute(
  points,
  { speedKmh = 50, speedMode = 'auto', loop = false, stops = [], trafficLights = false } = {},
) {
  const pts = (points || []).filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon))
  const hasTimes = pts.length > 1 && pts.every((p) => Number.isFinite(p.timestamp))
  const hasSpeeds =
    pts.length > 1 && pts.every((p) => Number.isFinite(p.speed)) && pts.some((p) => p.speed > 0)
  const cruiseMps = Math.max(0.3, (speedKmh || 50) / 3.6)

  // Decide where speed comes from.
  let source // 'replay' | 'speeds' | 'simulate' | 'constant'
  if (speedMode === 'constant') source = 'constant'
  else if (speedMode === 'simulate') source = 'simulate'
  else if (hasTimes) source = 'replay'
  else if (hasSpeeds) source = 'speeds'
  else source = 'simulate'

  // Segment lengths (parallel to pts).
  const segLen = []
  for (let i = 0; i < pts.length - 1; i++) segLen.push(haversine(pts[i], pts[i + 1]))

  // Per-vertex speed (m/s) for the non-replay sources.
  let vtx = null
  if (source === 'speeds') {
    vtx = pts.map((p) => Math.max(V_FLOOR, p.speed / 3.6))
  } else if (source === 'simulate') {
    vtx = simulateProfile(pts, segLen, cruiseMps)
  } else if (source === 'constant') {
    vtx = pts.map(() => cruiseMps)
  }

  const segments = []
  let totalDistance = 0
  let cursorTime = 0

  const pushSegment = (a, b, length, duration, vStartKmh, vEndKmh) => {
    segments.push({
      a,
      b,
      length,
      bearing: length > 0 ? bearing(a, b) : 0,
      duration,
      vStart: vStartKmh,
      vEnd: vEndKmh,
      startTime: cursorTime,
      endTime: cursorTime + duration,
    })
    cursorTime += duration
    totalDistance += length
  }

  // A stop: vehicle dwells at a point (speed 0) for `sec` seconds.
  // kind: 'stop' (a real stop — doors may open) | 'light' (traffic light).
  const pushDwell = (p, sec, bearingDeg, kind) => {
    segments.push({
      a: p,
      b: p,
      length: 0,
      bearing: bearingDeg,
      duration: sec,
      vStart: 0,
      vEnd: 0,
      kind,
      startTime: cursorTime,
      endTime: cursorTime + sec,
    })
    cursorTime += sec
  }

  // Map dwell positions (vertex index) -> { sec, kind }.
  const dwellAt = {}
  for (const s of stops || []) {
    if (!s || !(s.sec > 0)) continue
    const idx = Math.max(0, Math.min(pts.length - 1, Math.round((s.at || 0) * (pts.length - 1))))
    dwellAt[idx] = { sec: (dwellAt[idx]?.sec || 0) + s.sec, kind: 'stop' }
  }
  // Traffic lights: short stops at some sharp turns (deterministic so rebuilds
  // keep the same lights). Skip vertices that already have a real stop.
  if (trafficLights) {
    for (let i = 1; i < pts.length - 1; i++) {
      if (dwellAt[i]) continue
      const b1 = bearing(pts[i - 1], pts[i])
      const b2 = bearing(pts[i], pts[i + 1])
      let dev = Math.abs(b2 - b1) % 360
      if (dev > 180) dev = 360 - dev
      // ~45% of turns sharper than 45°, picked deterministically by index.
      if (dev >= 45 && (i * 2654435761) % 100 < 45) {
        dwellAt[i] = { sec: 12, kind: 'light' }
      }
    }
  }

  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    const length = segLen[i]
    let duration
    let vStart
    let vEnd
    if (source === 'replay') {
      duration = Math.max(0.001, b.timestamp - a.timestamp)
      const v = (length / duration) * 3.6
      vStart = v
      vEnd = v
    } else {
      const avg = Math.max(V_FLOOR, (vtx[i] + vtx[i + 1]) / 2)
      duration = length / avg
      vStart = vtx[i] * 3.6
      vEnd = vtx[i + 1] * 3.6
    }
    if (length === 0 && duration < 0.001 && !dwellAt[i + 1] && !dwellAt[i]) continue // skip degenerate point
    if (dwellAt[i] && i === 0) pushDwell(a, dwellAt[i].sec, length > 0 ? bearing(a, b) : 0, dwellAt[i].kind)
    pushSegment(a, b, length, duration, vStart, vEnd)
    // Auto-detect stops in timestamped routes: the wait is already in the
    // timeline (long duration, ~0 speed), so flag the segment instead of adding
    // a dwell — this drives doors without double-counting the pause.
    if (source === 'replay' && vStart < STOP_DETECT_KMH && duration >= STOP_DETECT_SEC) {
      const seg = segments[segments.length - 1]
      seg.isStop = true
      seg.kind = 'stop'
    }
    if (dwellAt[i + 1]) pushDwell(b, dwellAt[i + 1].sec, segments[segments.length - 1].bearing, dwellAt[i + 1].kind)
  }

  // Close the loop: connect the last point back to the first so playback wraps
  // smoothly instead of teleporting. Road-built loops are already closed at
  // build time, so this only adds a leg when there's a real gap (files).
  if (loop && segments.length) {
    const a = pts[pts.length - 1]
    const b = pts[0]
    const length = haversine(a, b)
    if (length > 0.5) {
      const last = segments[segments.length - 1]
      const vKmh = source === 'replay' ? cruiseMps * 3.6 : last.vEnd
      const closeMps = Math.max(V_FLOOR, vKmh / 3.6)
      pushSegment(a, b, length, length / closeMps, vKmh, segments[0].vStart)
    }
  }

  return {
    points: pts,
    segments,
    hasTimes,
    hasSpeeds,
    source,
    replay: source === 'replay',
    // Whether playback follows route-derived speed (so a time multiplier makes
    // sense) vs. a user-set cruise speed.
    usesRouteSpeed: source === 'replay' || source === 'speeds',
    totalDistance, // meters
    totalDuration: cursorTime, // seconds
    bounds: boundsOf(pts),
  }
}

/*
 * Sample a built route at a given simTime (seconds).
 * hint is the last segment index (monotonic playback optimization).
 * Returns { lat, lon, speedKmh, direction, altitude, segIndex, extra }.
 */
export function sampleRoute(route, simTime, hint = 0) {
  const segs = route.segments
  if (!segs.length) {
    const p = route.points[0] || { lat: 0, lon: 0 }
    return { lat: p.lat, lon: p.lon, speedKmh: 0, direction: 0, altitude: p.altitude, segIndex: 0, dwell: false, dwellKind: null, extra: p.extra }
  }
  const t = Math.max(0, Math.min(simTime, route.totalDuration))

  let i = Math.max(0, Math.min(hint, segs.length - 1))
  if (segs[i].startTime > t) i = 0
  while (i < segs.length - 1 && segs[i].endTime < t) i++

  const seg = segs[i]
  const f = seg.duration > 0 ? (t - seg.startTime) / seg.duration : 1
  const ff = Math.max(0, Math.min(1, f))
  const pos = lerpPoint(seg.a, seg.b, ff)
  // Interpolate speed across the segment for natural accel/decel; fall back to
  // the segment average if endpoint speeds aren't available.
  const speedKmh = Number.isFinite(seg.vStart)
    ? seg.vStart + (seg.vEnd - seg.vStart) * ff
    : seg.duration > 0
      ? (seg.length / seg.duration) * 3.6
      : 0
  const altitude = interpScalar(seg.a.altitude, seg.b.altitude, f)

  const dwell = (seg.length === 0 && seg.duration > 0.0001) || seg.isStop === true
  return {
    lat: pos.lat,
    lon: pos.lon,
    speedKmh,
    direction: seg.bearing,
    altitude,
    segIndex: i,
    dwell,
    dwellKind: dwell ? seg.kind || 'stop' : null,
    extra: f < 0.5 ? seg.a.extra : seg.b.extra,
  }
}

function interpScalar(a, b, f) {
  if (!Number.isFinite(a) && !Number.isFinite(b)) return undefined
  if (!Number.isFinite(a)) return b
  if (!Number.isFinite(b)) return a
  return a + (b - a) * f
}
