// Route file parsers. Each returns a normalized list of points:
//   [{ lat, lon, timestamp?(unix seconds), altitude?, extra? }, ...]
//
// Supported formats:
//   - flespi-json : flespi messages — a bare array [{...}], a single object,
//                   or a raw REST response {"result":[{...}]} (the `result`
//                   wrapper is unwrapped). Coordinates may be flat dotted
//                   ("position.latitude") or nested (position.latitude).
//   - geojson     : LineString / MultiLineString / Point features
//   - gpx         : <trkpt>/<rtept>/<wpt> with optional <ele>, <time>
//   - kml         : <LineString>, <gx:Track>, <Point> coordinates

export const FORMATS = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'flespi-json', label: 'flespi messages (JSON)' },
  { value: 'geojson', label: 'GeoJSON' },
  { value: 'gpx', label: 'GPX' },
  { value: 'kml', label: 'KML' },
]

function toTs(v) {
  if (v == null) return undefined
  if (typeof v === 'number') return v > 1e12 ? v / 1000 : v // ms -> s
  const t = Date.parse(v)
  return Number.isFinite(t) ? t / 1000 : undefined
}

/* Detect format from filename + content. Returns a format value (not 'auto'). */
export function detectFormat(fileName = '', text = '') {
  const name = fileName.toLowerCase()
  if (name.endsWith('.gpx')) return 'gpx'
  if (name.endsWith('.kml')) return 'kml'
  if (name.endsWith('.geojson')) return 'geojson'
  const trimmed = text.trimStart()
  if (trimmed.startsWith('<')) {
    if (/<gpx[\s>]/i.test(text)) return 'gpx'
    if (/<kml[\s>]/i.test(text)) return 'kml'
    return /<trkpt|<rtept|<wpt/i.test(text) ? 'gpx' : 'kml'
  }
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    if (/"type"\s*:\s*"(Feature|FeatureCollection|LineString|Point|MultiLineString|GeometryCollection)"/.test(text))
      return 'geojson'
    return 'flespi-json'
  }
  return 'flespi-json'
}

/* Main entry: parse text into points using the given (or detected) format. */
export function parseRoute(fileName, text, format = 'auto') {
  const fmt = format === 'auto' ? detectFormat(fileName, text) : format
  let points
  switch (fmt) {
    case 'flespi-json':
      points = parseFlespiJson(text)
      break
    case 'geojson':
      points = parseGeoJson(text)
      break
    case 'gpx':
      points = parseGpx(text)
      break
    case 'kml':
      points = parseKml(text)
      break
    default:
      throw new Error(`Unknown format: ${fmt}`)
  }
  points = points.filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon))
  if (!points.length) throw new Error('No valid coordinates found in the file')
  const hasTimes = points.length > 1 && points.every((p) => Number.isFinite(p.timestamp))
  const hasSpeeds =
    points.length > 1 &&
    points.every((p) => Number.isFinite(p.speed)) &&
    points.some((p) => p.speed > 0)
  return { format: fmt, points, hasTimes, hasSpeeds }
}

// ---- flespi messages JSON ----

function pick(obj, flatKey, nestedPath) {
  if (obj[flatKey] != null) return obj[flatKey]
  let cur = obj
  for (const k of nestedPath) {
    if (cur == null) return undefined
    cur = cur[k]
  }
  return cur
}

function parseFlespiJson(text) {
  let data = JSON.parse(text)
  if (data && Array.isArray(data.result)) data = data.result // raw API response
  if (!Array.isArray(data)) data = [data]
  return data
    .map((m) => {
      const lat = pick(m, 'position.latitude', ['position', 'latitude'])
      const lon = pick(m, 'position.longitude', ['position', 'longitude'])
      if (lat == null || lon == null) return null
      const altitude = pick(m, 'position.altitude', ['position', 'altitude'])
      const speed = pick(m, 'position.speed', ['position', 'speed'])
      return {
        lat: Number(lat),
        lon: Number(lon),
        timestamp: toTs(m.timestamp ?? m['server.timestamp']),
        altitude: altitude != null ? Number(altitude) : undefined,
        speed: speed != null ? Number(speed) : undefined, // km/h
        extra: m,
      }
    })
    .filter(Boolean)
}

// ---- GeoJSON ----

function parseGeoJson(text) {
  const data = JSON.parse(text)
  const out = []

  const pushCoord = (c, times, idx) => {
    if (!Array.isArray(c) || c.length < 2) return
    out.push({
      lon: Number(c[0]),
      lat: Number(c[1]),
      altitude: c.length > 2 ? Number(c[2]) : undefined,
      timestamp: times && times[idx] != null ? toTs(times[idx]) : undefined,
    })
  }

  const handleGeometry = (geom, props) => {
    if (!geom) return
    const times =
      (props && (props.coordTimes || props.times || props.timestamps)) || null
    switch (geom.type) {
      case 'Point':
        pushCoord(geom.coordinates, null, 0)
        break
      case 'MultiPoint':
      case 'LineString':
        geom.coordinates.forEach((c, i) => pushCoord(c, times, i))
        break
      case 'MultiLineString':
      case 'Polygon':
        geom.coordinates.forEach((line) => line.forEach((c, i) => pushCoord(c, times, i)))
        break
      case 'GeometryCollection':
        geom.geometries.forEach((g) => handleGeometry(g, props))
        break
    }
  }

  const handleFeature = (f) => handleGeometry(f.geometry, f.properties)

  if (data.type === 'FeatureCollection') data.features.forEach(handleFeature)
  else if (data.type === 'Feature') handleFeature(data)
  else handleGeometry(data, null)

  return out
}

// ---- XML helpers (GPX / KML) ----

function parseXml(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('Invalid XML in route file')
  return doc
}

function localAll(doc, tag) {
  // namespace-agnostic getElementsByTagName
  const lower = doc.getElementsByTagName(tag)
  if (lower.length) return Array.from(lower)
  return Array.from(doc.getElementsByTagNameNS('*', tag))
}

function childText(el, tag) {
  if (!el) return undefined
  const found = el.getElementsByTagName(tag)[0] || el.getElementsByTagNameNS('*', tag)[0]
  return found ? found.textContent.trim() : undefined
}

function parseGpx(text) {
  const doc = parseXml(text)
  let nodes = localAll(doc, 'trkpt')
  if (!nodes.length) nodes = localAll(doc, 'rtept')
  if (!nodes.length) nodes = localAll(doc, 'wpt')
  return nodes.map((n) => {
    const ele = childText(n, 'ele')
    const time = childText(n, 'time')
    // Speed is non-standard in GPX; commonly under <extensions> in m/s.
    const speedRaw = childText(n, 'speed')
    const speedMps = speedRaw != null ? Number(speedRaw) : undefined
    return {
      lat: Number(n.getAttribute('lat')),
      lon: Number(n.getAttribute('lon')),
      altitude: ele != null ? Number(ele) : undefined,
      timestamp: toTs(time),
      speed: Number.isFinite(speedMps) ? speedMps * 3.6 : undefined, // m/s -> km/h
    }
  })
}

function parseCoordTriplet(str) {
  // "lon,lat[,alt]"
  const parts = str.split(',').map((s) => Number(s.trim()))
  if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return null
  return { lon: parts[0], lat: parts[1], altitude: Number.isFinite(parts[2]) ? parts[2] : undefined }
}

function parseKml(text) {
  const doc = parseXml(text)
  const out = []

  // gx:Track — paired <when> and <gx:coord> ("lon lat alt")
  const tracks = localAll(doc, 'Track')
  for (const track of tracks) {
    const whens = Array.from(track.getElementsByTagName('when')).concat(
      Array.from(track.getElementsByTagNameNS('*', 'when')),
    )
    const coords = Array.from(track.getElementsByTagName('coord')).concat(
      Array.from(track.getElementsByTagNameNS('*', 'coord')),
    )
    coords.forEach((c, i) => {
      const parts = c.textContent.trim().split(/\s+/).map(Number)
      if (parts.length < 2) return
      out.push({
        lon: parts[0],
        lat: parts[1],
        altitude: Number.isFinite(parts[2]) ? parts[2] : undefined,
        timestamp: whens[i] ? toTs(whens[i].textContent.trim()) : undefined,
      })
    })
  }
  if (out.length) return out

  // <coordinates> blocks (LineString / Point / Polygon)
  const coordEls = localAll(doc, 'coordinates')
  for (const el of coordEls) {
    el.textContent
      .trim()
      .split(/\s+/)
      .forEach((triplet) => {
        const p = parseCoordTriplet(triplet)
        if (p) out.push(p)
      })
  }
  return out
}
