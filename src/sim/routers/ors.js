// OpenRouteService (HeiGIT). Free API key. Verified live (CORS *).
import { axios } from './util'

export default {
  value: 'ors',
  label: 'OpenRouteService (key)',
  needsKey: true,
  keyUrl: 'https://account.heigit.org/signup',
  profiles: [
    { value: 'driving-car', label: 'Car' },
    { value: 'cycling-regular', label: 'Bike' },
    { value: 'foot-walking', label: 'Foot' },
  ],
  async fetchRoute({ profile, apiKey, waypoints }) {
    if (!apiKey || !apiKey.trim()) throw new Error('OpenRouteService API key is required')
    const url = `https://api.openrouteservice.org/v2/directions/${profile}/geojson`
    const body = { coordinates: waypoints.map((w) => [w.lon, w.lat]) }
    const { data } = await axios.post(url, body, {
      headers: { Authorization: apiKey.trim(), 'Content-Type': 'application/json' },
      timeout: 20000,
    })
    const feature = data.features && data.features[0]
    if (!feature) throw new Error('No route found')
    return {
      points: feature.geometry.coordinates.map(([lon, lat]) => ({ lat, lon })),
      distance: feature.properties?.summary?.distance,
    }
  },
}
