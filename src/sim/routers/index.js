// Routing provider registry.
//
// Each provider is a self-contained module exporting a descriptor:
//   { value, label, needsKey, keyUrl?, profiles: [{value,label}], fetchRoute() }
//
// To DISABLE a provider, just remove (or comment out) its line in PROVIDERS
// below — nothing else needs to change. To ADD one, drop a new module in this
// folder and add it to the list.

import osrm from './osrm'
import valhalla from './valhalla'
import brouter from './brouter'
import ors from './ors'
import graphhopper from './graphhopper'
import mapbox from './mapbox'
import geoapify from './geoapify'
import tomtom from './tomtom'
import here from './here'
import stadia from './stadia'

const PROVIDERS = [
  osrm, // no key
  valhalla, // no key
  brouter, // no key
  ors, // key
  graphhopper, // key
  mapbox, // key
  geoapify, // key
  tomtom, // key
  here, // key
  stadia, // key
]

const MAP = Object.fromEntries(PROVIDERS.map((p) => [p.value, p]))

/* Public list used by the UI (no fetchRoute exposed). */
export const ROUTERS = PROVIDERS.map((p) => ({
  value: p.value,
  label: p.label,
  needsKey: p.needsKey,
  keyUrl: p.keyUrl,
  profiles: p.profiles,
}))

export function getProvider(value) {
  return MAP[value] || null
}

export function defaultProfile(provider) {
  const p = MAP[provider]
  return p ? p.profiles[0].value : ''
}

export function providerNeedsKey(provider) {
  const p = MAP[provider]
  return !!(p && p.needsKey)
}

/*
 * Fetch a road-snapped route through waypoints with the chosen provider.
 * { provider, profile, apiKey, waypoints } -> { points: [{lat,lon}], distance }
 */
export async function fetchRoadRoute({ provider, profile, apiKey, waypoints }) {
  const p = MAP[provider]
  if (!p) throw new Error(`Unknown routing provider: ${provider}`)
  const wp = (waypoints || []).filter((w) => Number.isFinite(w.lat) && Number.isFinite(w.lon))
  if (wp.length < 2) throw new Error('Add at least 2 waypoints')
  return p.fetchRoute({ profile: profile || p.profiles[0].value, apiKey, waypoints: wp })
}
