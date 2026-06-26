// GraphHopper Directions API. Free API key. Implemented per docs (untested without key).
import { axios } from './util'

export default {
  value: 'graphhopper',
  label: 'GraphHopper (key)',
  needsKey: true,
  keyUrl: 'https://www.graphhopper.com/dashboard/#/register',
  profiles: [
    { value: 'car', label: 'Car' },
    { value: 'bike', label: 'Bike' },
    { value: 'foot', label: 'Foot' },
  ],
  async fetchRoute({ profile, apiKey, waypoints }) {
    if (!apiKey || !apiKey.trim()) throw new Error('GraphHopper API key is required')
    const params = new URLSearchParams()
    waypoints.forEach((w) => params.append('point', `${w.lat},${w.lon}`))
    params.append('profile', profile)
    params.append('points_encoded', 'false')
    params.append('key', apiKey.trim())
    const { data } = await axios.get(`https://graphhopper.com/api/1/route?${params.toString()}`, {
      timeout: 20000,
    })
    const path = data.paths && data.paths[0]
    if (!path) throw new Error(data.message || 'No route found')
    return {
      points: path.points.coordinates.map(([lon, lat]) => ({ lat, lon })),
      distance: path.distance,
    }
  },
}
