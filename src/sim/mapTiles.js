// Basemap tiles that follow the app theme.
// CARTO basemaps: free, no API key, CORS-enabled, retina ({r}) support.

export function basemap(dark) {
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
