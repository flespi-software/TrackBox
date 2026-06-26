// Valhalla — FOSSGIS public instance. No API key. Verified live (CORS *).
import { valhallaRoute } from './util'

export default {
  value: 'valhalla',
  label: 'Valhalla (FOSSGIS, no key)',
  needsKey: false,
  profiles: [
    { value: 'auto', label: 'Car' },
    { value: 'bicycle', label: 'Bike' },
    { value: 'pedestrian', label: 'Foot' },
    { value: 'truck', label: 'Truck' },
    { value: 'bus', label: 'Bus' },
    { value: 'motorcycle', label: 'Motorcycle' },
  ],
  async fetchRoute({ profile, waypoints }) {
    return valhallaRoute({
      url: 'https://valhalla1.openstreetmap.de/route',
      costing: profile,
      waypoints,
    })
  },
}
