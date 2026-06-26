// Stadia Maps — hosted Valhalla. Free API key. Implemented per docs (untested without key).
import { valhallaRoute } from './util'

export default {
  value: 'stadia',
  label: 'Stadia Maps (key)',
  needsKey: true,
  keyUrl: 'https://client.stadiamaps.com/signup/',
  profiles: [
    { value: 'auto', label: 'Car' },
    { value: 'bicycle', label: 'Bike' },
    { value: 'pedestrian', label: 'Foot' },
    { value: 'truck', label: 'Truck' },
    { value: 'bus', label: 'Bus' },
  ],
  async fetchRoute({ profile, apiKey, waypoints }) {
    if (!apiKey || !apiKey.trim()) throw new Error('Stadia Maps API key is required')
    return valhallaRoute({
      url: 'https://api.stadiamaps.com/route/v1',
      costing: profile,
      waypoints,
      params: { api_key: apiKey.trim() },
    })
  },
}
