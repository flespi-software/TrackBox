/*
 * Compact (de)serialization of a route source for storage and cloud sync.
 *
 * The bulk of a simulator is its `source.points` polyline. Stored as an array of
 * { lat, lon, ... } objects it dwarfs everything else and quickly fills the old
 * 5 MB localStorage. Here we encode the geometry as a Google "encoded polyline"
 * (precision 1e6 ≈ 0.1 m) and carry the optional per-point channels (timestamp /
 * speed / altitude) as delta- or plain arrays — typically a 5–10× reduction.
 *
 * Points that carry a raw passthrough message (`extra`, from flespi-json replay)
 * can't be polyline-compressed without dropping that payload, so those sources are
 * kept verbatim. Decoding also accepts the legacy shape (plain `points`), so data
 * written by older builds (locally or over MQTT) still loads.
 */

const FACTOR = 1e6

function encodeSigned(num, out) {
  let v = num < 0 ? ~(num << 1) : num << 1
  while (v >= 0x20) {
    out.push(String.fromCharCode((0x20 | (v & 0x1f)) + 63))
    v >>= 5
  }
  out.push(String.fromCharCode(v + 63))
}

export function encodePolyline(points) {
  const out = []
  let prevLat = 0
  let prevLon = 0
  for (const p of points) {
    const lat = Math.round(p.lat * FACTOR)
    const lon = Math.round(p.lon * FACTOR)
    encodeSigned(lat - prevLat, out)
    encodeSigned(lon - prevLon, out)
    prevLat = lat
    prevLon = lon
  }
  return out.join('')
}

export function decodePolyline(str) {
  const points = []
  let i = 0
  let lat = 0
  let lon = 0
  const len = str.length
  while (i < len) {
    let shift = 0
    let result = 0
    let b
    do {
      b = str.charCodeAt(i++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    lat += result & 1 ? ~(result >> 1) : result >> 1
    shift = 0
    result = 0
    do {
      b = str.charCodeAt(i++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    lon += result & 1 ? ~(result >> 1) : result >> 1
    points.push({ lat: lat / FACTOR, lon: lon / FACTOR })
  }
  return points
}

function allFinite(points, key) {
  return points.length > 0 && points.every((p) => Number.isFinite(p[key]))
}

function deltaEncode(arr) {
  const out = [arr[0]]
  for (let i = 1; i < arr.length; i++) out.push(arr[i] - arr[i - 1])
  return out
}

function deltaDecode(arr) {
  const out = [arr[0]]
  for (let i = 1; i < arr.length; i++) out.push(out[i - 1] + arr[i])
  return out
}

// Fields kept as-is on both the compressed and the raw form.
function meta(source) {
  return {
    format: source.format,
    fileName: source.fileName,
    hasTimes: source.hasTimes,
    hasSpeeds: source.hasSpeeds,
    totalDistance: source.totalDistance,
    bounds: source.bounds,
    build: source.build,
  }
}

export function encodeSource(source) {
  if (!source) return source
  const points = source.points || []
  // No geometry to compress, or points carry passthrough payloads — keep verbatim.
  if (!points.length || points.some((p) => p && p.extra)) {
    return { ...meta(source), points }
  }
  const geo = { poly: encodePolyline(points) }
  // Channels are all-or-nothing: only stored when every point has the value
  // (matches how hasTimes/hasSpeeds are derived). Timestamps delta-encode well;
  // speed keeps 0.1 km/h, altitude whole metres — both beyond what playback needs.
  if (allFinite(points, 'timestamp')) geo.t = deltaEncode(points.map((p) => p.timestamp))
  if (allFinite(points, 'speed')) geo.s = points.map((p) => Math.round(p.speed * 10) / 10)
  if (allFinite(points, 'altitude')) geo.a = points.map((p) => Math.round(p.altitude))
  return { ...meta(source), geo }
}

export function decodeSource(enc) {
  if (!enc || !enc.geo) return enc // legacy / raw: points already present (or nothing)
  const points = decodePolyline(enc.geo.poly)
  const t = enc.geo.t ? deltaDecode(enc.geo.t) : null
  const s = enc.geo.s || null
  const a = enc.geo.a || null
  for (let i = 0; i < points.length; i++) {
    if (t) points[i].timestamp = t[i]
    if (s) points[i].speed = s[i]
    if (a) points[i].altitude = a[i]
  }
  return { ...meta(enc), points }
}
