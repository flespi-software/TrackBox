// Shared helpers for routing provider modules.

import axios from 'axios'

export { axios }

/* Normalize a provider error into a readable message. */
export function routeError(e, fallback = 'Routing failed') {
  return (
    e?.response?.data?.error?.message ||
    e?.response?.data?.detailedError?.message || // TomTom shape
    e?.response?.data?.message ||
    e?.response?.data?.error ||
    e?.message ||
    fallback
  )
}

/*
 * Decode an encoded polyline (Google/Valhalla style).
 * precision: 5 for Google/OSRM-encoded, 6 for Valhalla. Returns [{lat, lon}].
 */
export function decodePolyline(encoded, precision = 5) {
  let index = 0
  let lat = 0
  let lng = 0
  const coordinates = []
  const factor = Math.pow(10, precision)
  while (index < encoded.length) {
    let shift = 0
    let result = 0
    let byte
    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    lat += result & 1 ? ~(result >> 1) : result >> 1
    shift = 0
    result = 0
    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    lng += result & 1 ? ~(result >> 1) : result >> 1
    coordinates.push({ lat: lat / factor, lon: lng / factor })
  }
  return coordinates
}

// ---- HERE flexible polyline decoder ----
// Reference implementation: https://github.com/heremaps/flexible-polyline

const FP_DECODING_TABLE = [
  62, -1, -1, -1, 63, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 52, 53, 54, 55, 56, 57, 58, 59,
  60, 61, -1, -1, -1, -1, -1, -1, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
  18, 19, 20, 21, 22, 23, 24, 25, -1, -1, -1, -1, -1, -1, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35,
  36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51,
]

function fpDecodeChar(char) {
  return FP_DECODING_TABLE[char.charCodeAt(0) - 45]
}

function fpDecodeUnsigned(encoded) {
  let result = 0
  let shift = 0
  const list = []
  for (const char of encoded) {
    const value = fpDecodeChar(char)
    result |= (value & 0x1f) << shift
    if ((value & 0x20) === 0) {
      list.push(result)
      result = 0
      shift = 0
    } else {
      shift += 5
    }
  }
  return list
}

function fpToSigned(val) {
  let res = val
  if (res & 1) res = ~res
  res >>= 1
  return res
}

/* Decode a HERE flexible polyline string into [{lat, lon, altitude?}]. */
export function decodeFlexiblePolyline(encoded) {
  const decoder = fpDecodeUnsigned(encoded)
  const header = decoder[1]
  const precision = header & 15
  const thirdDim = (header >> 4) & 7
  const thirdDimPrecision = (header >> 7) & 15
  const factorDegree = Math.pow(10, precision)
  const factorZ = Math.pow(10, thirdDimPrecision)
  let lat = 0
  let lng = 0
  let z = 0
  const res = []
  let i = 2
  while (i < decoder.length) {
    lat += fpToSigned(decoder[i]) / factorDegree
    lng += fpToSigned(decoder[i + 1]) / factorDegree
    if (thirdDim) {
      z += fpToSigned(decoder[i + 2]) / factorZ
      res.push({ lat, lon: lng, altitude: z })
      i += 3
    } else {
      res.push({ lat, lon: lng })
      i += 2
    }
  }
  return res
}

/*
 * Shared Valhalla-style request (used by valhalla + stadia, which share the API).
 * opts: { url, costing, waypoints, params? }
 */
export async function valhallaRoute({ url, costing, waypoints, params = {} }) {
  const body = {
    locations: waypoints.map((w) => ({ lat: w.lat, lon: w.lon })),
    costing,
    directions_options: { units: 'kilometers' },
  }
  const { data } = await axios.post(url, body, { params, timeout: 25000 })
  const trip = data.trip
  if (!trip || !trip.legs || !trip.legs.length) {
    throw new Error((trip && trip.status_message) || 'No route found')
  }
  let points = []
  for (const leg of trip.legs) {
    points = points.concat(decodePolyline(leg.shape, 6))
  }
  return { points, distance: (trip.summary?.length || 0) * 1000 }
}
