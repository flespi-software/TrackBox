// Basemap tiles: free, no API key, CORS-enabled providers. Registry-driven so
// new layers are one entry. `default: true` layers are on out of the box; the
// rest are opt-in via settings. The two CARTO layers are the theme defaults —
// switching the app theme flips between them (see settings.syncCartoBasemap).

// Zoom the map allows. Beyond a layer's maxNativeZoom, Leaflet upscales the last
// native tile so raster stays in sync with vector tracks instead of blanking out.
export const MAX_ZOOM = 21

export const CARTO_LIGHT = 'carto-light'
export const CARTO_DARK = 'carto-dark'

export const BASEMAPS = [
  {
    value: CARTO_LIGHT,
    label: 'CARTO (light default)',
    default: true,
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    maxNativeZoom: 20,
    subdomains: 'abcd',
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
  },
  {
    value: CARTO_DARK,
    label: 'CARTO (dark default)',
    default: true,
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    maxNativeZoom: 20,
    subdomains: 'abcd',
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
  },
  {
    value: 'osm',
    label: 'OpenStreetMap',
    default: true,
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    maxNativeZoom: 19,
    subdomains: 'abc',
    attribution: '&copy; OpenStreetMap contributors',
  },
  {
    value: 'satellite',
    label: 'Satellite (Esri)',
    default: true,
    imagery: true,
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maxNativeZoom: 19,
    attribution: 'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics',
  },
  {
    value: 'esri-clarity',
    label: 'Satellite — Esri Clarity (global)',
    default: false,
    imagery: true,
    url: 'https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maxNativeZoom: 19,
    attribution: 'Tiles &copy; Esri (Clarity)',
  },
  {
    value: 'usgs-imagery',
    label: 'Satellite — USGS (US only)',
    default: false,
    imagery: true,
    url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}',
    maxNativeZoom: 16,
    attribution: 'Imagery &copy; USGS — The National Map',
  },
  {
    value: 'opentopo',
    label: 'OpenTopoMap',
    default: false,
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    maxNativeZoom: 17,
    subdomains: 'abc',
    attribution: '&copy; OpenTopoMap (CC-BY-SA)',
  },
  {
    value: 'cyclosm',
    label: 'CyclOSM',
    default: false,
    url: 'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
    maxNativeZoom: 20,
    subdomains: 'abc',
    attribution: '&copy; CyclOSM, OpenStreetMap contributors',
  },
  {
    value: 'hot',
    label: 'Humanitarian',
    default: false,
    url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    maxNativeZoom: 19,
    subdomains: 'ab',
    attribution: '&copy; OpenStreetMap contributors, HOT',
  },
  {
    value: 'esri-topo',
    label: 'Esri Topographic',
    default: false,
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    maxNativeZoom: 19,
    attribution: 'Tiles &copy; Esri',
  },
]

// Values enabled by default (both CARTO themes + OSM + Satellite).
export const DEFAULT_BASEMAPS = BASEMAPS.filter((b) => b.default).map((b) => b.value)

// The CARTO layer matching the current app theme.
export function cartoFor(dark) {
  return dark ? CARTO_DARK : CARTO_LIGHT
}
export function isCarto(style) {
  return style === CARTO_LIGHT || style === CARTO_DARK
}

// Whether a basemap is aerial/satellite imagery (labels overlay makes sense there).
export function isImagery(style) {
  const def = BASEMAPS.find((b) => b.value === style)
  return !!(def && def.imagery)
}

// Transparent label overlays for imagery — free, no key. Rendered above the
// basemap but below the tracks. Each source lists 1-2 overlay tile URLs.
export const LABELS_SOURCES = {
  esri: {
    label: 'Esri (roads + labels)',
    overlays: [
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    ],
    attribution: 'Labels &copy; Esri',
  },
  osm: {
    // CARTO labels are rendered from OpenStreetMap data. CARTO's naming is
    // inverted: `dark_only_labels` = light/white text (for dark basemaps), which
    // reads well over satellite. Labelled here by the text colour users see.
    label: 'OSM / CARTO (light text)',
    overlays: ['https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png'],
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
  },
  'osm-dark': {
    // `light_only_labels` = dark text (for light basemaps) — suits lighter
    // terrain or a darker-text preference.
    label: 'OSM / CARTO (dark text)',
    overlays: ['https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png'],
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
  },
}
export const LABELS_DEFAULT = 'esri'
export const MAX_LABEL_LAYERS = 2 // most overlays any single source uses

// 1×1 transparent PNG — label layers point here when hidden, so they issue no
// network requests while staying mounted (and thus zoom-animated).
export const BLANK_TILE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

// Switcher options: enabled built-ins (registry order) + "Custom" when a URL is set.
export function mapStyles(customUrl, enabled) {
  const on = enabled && enabled.length ? enabled : DEFAULT_BASEMAPS
  const list = BASEMAPS.filter((b) => on.includes(b.value)).map(({ value, label }) => ({
    value,
    label,
  }))
  if (customUrl) list.push({ value: 'custom', label: 'Custom' })
  return list
}

export function basemap(style, customUrl) {
  // User-supplied template ({z}/{x}/{y}); native zoom unknown, so allow the full
  // range and let the provider 404 past its own limit.
  if (style === 'custom' && customUrl) {
    return { url: customUrl, options: { maxZoom: MAX_ZOOM, attribution: 'Custom tiles' } }
  }
  const def = BASEMAPS.find((b) => b.value === style) || BASEMAPS[0]
  const options = {
    maxZoom: MAX_ZOOM,
    maxNativeZoom: def.maxNativeZoom,
    attribution: def.attribution,
  }
  if (def.subdomains) options.subdomains = def.subdomains
  return { url: def.url, options }
}
