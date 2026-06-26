// BRouter — public instance. No API key. Verified live (CORS *).
// Returns GeoJSON with [lon, lat, altitude].
import { axios } from './util'

export default {
  value: 'brouter',
  label: 'BRouter (no key)',
  needsKey: false,
  profiles: [
    { value: 'car-fast', label: 'Car' },
    { value: 'trekking', label: 'Bike' },
    { value: 'hiking-mountain', label: 'Foot' },
  ],
  async fetchRoute({ profile, waypoints }) {
    const lonlats = waypoints.map((w) => `${w.lon},${w.lat}`).join('|')
    const { data } = await axios.get('https://brouter.de/brouter', {
      params: { lonlats, profile, alternativeidx: 0, format: 'geojson' },
      timeout: 25000,
    })
    const feature = data.features && data.features[0]
    if (!feature) throw new Error('No route found')
    const coords = feature.geometry.coordinates
    return {
      points: coords.map((c) => ({
        lat: c[1],
        lon: c[0],
        altitude: Number.isFinite(c[2]) ? c[2] : undefined,
      })),
      distance: Number(feature.properties && feature.properties['track-length']) || undefined,
    }
  },
}
