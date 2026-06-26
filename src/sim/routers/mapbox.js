// Mapbox Directions API. Access token. Implemented per docs (untested without token).
import { axios } from './util'

export default {
  value: 'mapbox',
  label: 'Mapbox (token)',
  needsKey: true,
  keyUrl: 'https://account.mapbox.com/auth/signup/',
  profiles: [
    { value: 'driving', label: 'Car' },
    { value: 'driving-traffic', label: 'Car (traffic)' },
    { value: 'cycling', label: 'Bike' },
    { value: 'walking', label: 'Foot' },
  ],
  async fetchRoute({ profile, apiKey, waypoints }) {
    if (!apiKey || !apiKey.trim()) throw new Error('Mapbox access token is required')
    const coords = waypoints.map((w) => `${w.lon},${w.lat}`).join(';')
    const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coords}`
    const { data } = await axios.get(url, {
      params: { geometries: 'geojson', overview: 'full', access_token: apiKey.trim() },
      timeout: 20000,
    })
    const route = data.routes && data.routes[0]
    if (!route) throw new Error(data.message || 'No route found')
    return {
      points: route.geometry.coordinates.map(([lon, lat]) => ({ lat, lon })),
      distance: route.distance,
    }
  },
}
