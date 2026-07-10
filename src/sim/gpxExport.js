// Export a simulator's route and settings as GPX 1.1.
//
// The routed geometry goes in <trk>, the key waypoints (build mode) in <wpt>,
// and one versioned JSON config blob - everything needed to recreate the
// simulator (build waypoints/router + all options) - in a <trk><extensions>
// block *beside* the route, not inside every point. Standard GPX tools see a
// clean track/waypoints; TrackBox reads the blob back on import to restore the
// full config. `options`/`build` are serialized wholesale, so new config fields
// are exported automatically without changes here (forward-compatible).

const TB_NS = 'https://trackbox.flespi.io/gpx/1'
export const TB_CONFIG_VERSION = 1

const ESC = { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }
function esc(v) {
  return String(v).replace(/[<>&'"]/g, (c) => ESC[c])
}

function isoTime(tsSec) {
  const d = new Date(tsSec * 1000)
  return Number.isFinite(d.getTime()) ? d.toISOString() : null
}

// JSON inside an XML text node - CDATA avoids per-char escaping; guard the only
// sequence that could close the section early.
function cdata(text) {
  return `<![CDATA[${String(text).replace(/]]>/g, ']]]]><![CDATA[>')}]]>`
}

/* Re-importable config blob. Transport is intentionally omitted - it can hold
   channel credentials that shouldn't travel in a shareable file. */
function simConfig(sim) {
  const src = sim.source || {}
  return {
    v: TB_CONFIG_VERSION,
    name: sim.name,
    color: sim.color,
    source: {
      format: src.format,
      fileName: src.fileName,
      hasTimes: src.hasTimes,
      hasSpeeds: src.hasSpeeds,
      build: src.build || null,
    },
    options: sim.options || {},
  }
}

export function simToGpx(sim) {
  const src = sim.source || {}
  const points = src.points || []
  const wps = (src.build && src.build.waypoints) || []
  const now = isoTime(Date.now() / 1000)
  const name = esc(sim.name || 'route')
  const L = []

  L.push('<?xml version="1.0" encoding="UTF-8"?>')
  L.push(
    '<gpx version="1.1" creator="TrackBox" ' +
      'xmlns="http://www.topografix.com/GPX/1/1" ' +
      `xmlns:trackbox="${TB_NS}">`,
  )
  L.push('  <metadata>')
  L.push(`    <name>${name}</name>`)
  if (now) L.push(`    <time>${now}</time>`)
  L.push('  </metadata>')

  // Key waypoints (build mode) as plain <wpt>; dwell seconds in extensions.
  wps.forEach((w, i) => {
    L.push(`  <wpt lat="${esc(w.lat)}" lon="${esc(w.lon)}">`)
    L.push(`    <name>WP${i + 1}</name>`)
    if (w.sec > 0) {
      L.push('    <extensions>')
      L.push(`      <trackbox:dwell>${esc(w.sec)}</trackbox:dwell>`)
      L.push('    </extensions>')
    }
    L.push('  </wpt>')
  })

  L.push('  <trk>')
  L.push(`    <name>${name}</name>`)
  L.push('    <extensions>')
  L.push(`      <trackbox:sim>${cdata(JSON.stringify(simConfig(sim)))}</trackbox:sim>`)
  L.push('    </extensions>')
  L.push('    <trkseg>')
  for (const p of points) {
    const open = `      <trkpt lat="${esc(p.lat)}" lon="${esc(p.lon)}"`
    const inner = []
    if (Number.isFinite(p.altitude)) inner.push(`<ele>${esc(p.altitude)}</ele>`) // ele before time (GPX schema)
    const t = Number.isFinite(p.timestamp) ? isoTime(p.timestamp) : null
    if (t) inner.push(`<time>${t}</time>`)
    L.push(inner.length ? `${open}>${inner.join('')}</trkpt>` : `${open} />`)
  }
  L.push('    </trkseg>')
  L.push('  </trk>')
  L.push('</gpx>')
  return L.join('\n')
}

/* Filesystem-safe file name derived from the simulator name. */
export function gpxFileName(sim) {
  const base = (sim.name || 'route').replace(/[^\w.-]+/g, '_').slice(0, 60) || 'route'
  return `${base}.gpx`
}
