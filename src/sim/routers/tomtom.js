// TomTom Routing API. Free API key. Implemented per docs (untested without key).
import { axios } from './util'

export default {
  value: 'tomtom',
  label: 'TomTom (key)',
  needsKey: true,
  keyUrl: 'https://developer.tomtom.com/user/register',
  profiles: [
    { value: 'car', label: 'Car' },
    { value: 'bicycle', label: 'Bike' },
    { value: 'pedestrian', label: 'Foot' },
  ],
  async fetchRoute({ profile, apiKey, waypoints }) {
    if (!apiKey || !apiKey.trim()) throw new Error('TomTom API key is required')
    const locs = waypoints.map((w) => `${w.lat},${w.lon}`).join(':')
    const url = `https://api.tomtom.com/routing/1/calculateRoute/${encodeURIComponent(locs)}/json`
    const { data } = await axios.get(url, {
      params: { key: apiKey.trim(), travelMode: profile, routeRepresentation: 'polyline' },
      timeout: 20000,
    })
    const route = data.routes && data.routes[0]
    if (!route) throw new Error('No route found')
    let points = []
    for (const leg of route.legs || []) {
      points = points.concat(leg.points.map((p) => ({ lat: p.latitude, lon: p.longitude })))
    }
    return { points, distance: route.summary?.lengthInMeters }
  },
}
