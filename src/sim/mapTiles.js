// Basemap tiles. Free, no API key, CORS-enabled providers.
//
// - 'map'       : CARTO basemaps that follow the app theme (light/dark, retina).
// - 'osm'       : standard OpenStreetMap (always light, very readable).
// - 'satellite' : Esri World Imagery (aerial/satellite).

export const MAP_STYLES = [
  { value: 'map', label: 'Map (theme)' },
  { value: 'osm', label: 'OpenStreetMap' },
  { value: 'satellite', label: 'Satellite' },
]

export function basemap(style, dark) {
  if (style === 'osm') {
    return {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      options: {
        maxZoom: 19,
        subdomains: 'abc',
        attribution: '&copy; OpenStreetMap contributors',
      },
    }
  }
  if (style === 'satellite') {
    return {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      options: {
        maxZoom: 19,
        attribution: 'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics',
      },
    }
  }
  // Default: theme-aware CARTO basemap.
  return {
    url: dark
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    options: {
      maxZoom: 20,
      subdomains: 'abcd',
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    },
  }
}
