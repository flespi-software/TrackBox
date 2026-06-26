// Backward-compatible facade. The actual providers live in ./routers/* and are
// wired together in ./routers/index.js (edit that file to enable/disable them).
export {
  ROUTERS,
  getProvider,
  defaultProfile,
  providerNeedsKey,
  fetchRoadRoute,
} from './routers/index'
export { routeError } from './routers/util'
