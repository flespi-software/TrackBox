// OSRM — FOSSGIS public instance. No API key. Verified live (CORS *).
import { axios } from './util'

export default {
  value: 'osrm',
  label: 'OSRM (FOSSGIS, no key)',
  needsKey: false,
  profiles: [
    { value: 'routed-car', label: 'Car' },
    { value: 'routed-bike', label: 'Bike' },
    { value: 'routed-foot', label: 'Foot' },
  ],
  async fetchRoute({ profile, waypoints }) {
    const coords = waypoints.map((w) => `${w.lon},${w.lat}`).join(';')
    const url = `https://routing.openstreetmap.de/${profile}/route/v1/driving/${coords}`
    const { data } = await axios.get(url, {
      params: { overview: 'full', geometries: 'geojson', steps: false },
      timeout: 20000,
    })
    if (data.code !== 'Ok' || !data.routes || !data.routes.length) {
      throw new Error(data.message || data.code || 'No route found')
    }
    const route = data.routes[0]
    return {
      points: route.geometry.coordinates.map(([lon, lat]) => ({ lat, lon })),
      distance: route.distance,
    }
  },
}
