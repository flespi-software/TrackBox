// Geoapify Routing API. Free API key. Implemented per docs (untested without key).
import { axios } from './util'

export default {
  value: 'geoapify',
  label: 'Geoapify (key)',
  needsKey: true,
  keyUrl: 'https://myprojects.geoapify.com/register',
  profiles: [
    { value: 'drive', label: 'Car' },
    { value: 'bicycle', label: 'Bike' },
    { value: 'walk', label: 'Foot' },
  ],
  async fetchRoute({ profile, apiKey, waypoints }) {
    if (!apiKey || !apiKey.trim()) throw new Error('Geoapify API key is required')
    const wp = waypoints.map((w) => `${w.lat},${w.lon}`).join('|')
    const { data } = await axios.get('https://api.geoapify.com/v1/routing', {
      params: { waypoints: wp, mode: profile, apiKey: apiKey.trim() },
      timeout: 20000,
    })
    const feature = data.features && data.features[0]
    if (!feature) throw new Error('No route found')
    const g = feature.geometry
    const coords = g.type === 'MultiLineString' ? g.coordinates.flat() : g.coordinates
    return {
      points: coords.map(([lon, lat]) => ({ lat, lon })),
      distance: feature.properties?.distance,
    }
  },
}
