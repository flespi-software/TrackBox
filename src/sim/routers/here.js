// HERE Routing API v8. Free API key. Implemented per docs (untested without key).
// Geometry is returned as a HERE flexible polyline.
import { axios, decodeFlexiblePolyline } from './util'

export default {
  value: 'here',
  label: 'HERE (key)',
  needsKey: true,
  keyUrl: 'https://platform.here.com/sign-up',
  profiles: [
    { value: 'car', label: 'Car' },
    { value: 'bicycle', label: 'Bike' },
    { value: 'pedestrian', label: 'Foot' },
  ],
  async fetchRoute({ profile, apiKey, waypoints }) {
    if (!apiKey || !apiKey.trim()) throw new Error('HERE API key is required')
    const params = new URLSearchParams()
    params.append('transportMode', profile)
    params.append('origin', `${waypoints[0].lat},${waypoints[0].lon}`)
    params.append('destination', `${waypoints[waypoints.length - 1].lat},${waypoints[waypoints.length - 1].lon}`)
    waypoints.slice(1, -1).forEach((w) => params.append('via', `${w.lat},${w.lon}`))
    params.append('return', 'polyline,summary')
    params.append('apikey', apiKey.trim())
    const { data } = await axios.get(`https://router.hereapi.com/v8/routes?${params.toString()}`, {
      timeout: 20000,
    })
    const route = data.routes && data.routes[0]
    if (!route) throw new Error((data.notices && data.notices[0]?.title) || 'No route found')
    let points = []
    let distance = 0
    for (const section of route.sections || []) {
      points = points.concat(decodeFlexiblePolyline(section.polyline))
      distance += section.summary?.length || 0
    }
    return { points, distance }
  },
}
