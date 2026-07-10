import ConnectionPlugin from 'flespi-io-js/dist/vue3-plugin'
import { boot } from 'quasar/wrappers'
import axios from 'axios'

// Fallback region so the app still mounts when flespi is unreachable at boot.
// Matches the default `eu` entry of https://flespi.io/auth/regions.
const DEFAULT_REGION = {
  name: 'eu',
  rest: 'https://flespi.io',
  'mqtt-ws': 'mqtt.flespi.io:443',
  default: true,
}

async function getRegion() {
  // TrackBox always uses flespi.io - the global entry returns every region.
  // Never throw / never return undefined: a rejected boot leaves a blank window,
  // so on any failure we fall back to DEFAULT_REGION and let the UI come up.
  try {
    const api = await axios.get('https://flespi.io/auth/regions', { timeout: 10000 })
    const list = []
    let region = ''
    const regions =
      api.data &&
      api.data.result &&
      api.data.result.reduce((a, b) => {
        a[b.name || b.region] = b
        list.push({ label: b.name || b.region, value: b.name || b.region, sublabel: b.rest })
        if (b.default && !region) {
          region = b.name || b.region
        }
        return a
      }, {})
    if (!region) {
      region = list[0] && list[0].value
    }
    return (regions && regions[region]) || DEFAULT_REGION
  } catch (e) {
    console.warn('[flespi-io] regions lookup failed, using default region', e)
    return DEFAULT_REGION
  }
}
// Be careful when using SSR for cross-request state pollution
// due to creating a Singleton instance here;
// If any client changes this (global) instance, it might be a
// good idea to move this instance creation inside of the
// "export default () => {}" function below (which runs individually
// for each client)
// const api = axios.create({ baseURL: 'https://api.example.com' })

export default boot(async ({ app, store }) => {
  // Surface render/component errors in logs instead of failing silently into a
  // blank transparent window (there is no error boundary in the tree).
  app.config.errorHandler = (err, instance, info) => {
    console.error('[vue] unhandled error', info, err)
  }
  const path = window.location.hash.split('/')
  let pkgname = __APP_NAME__
  if (path[path.length - 1] === 'support') {
    pkgname = 'support-' + pkgname
  }
  const appident = `${pkgname}-${__APP_VERSION__}${window.location.hostname === 'localhost' ? 'test' : ''}-${Math.random().toString(16).substring(2, 10)}`
  const currentRegion = await getRegion()
  const connectionConfig = {
    httpConfig: { server: currentRegion.rest, headers: { 'x-flespi-app': appident } },
    socketConfig: {
      server: `wss://${currentRegion['mqtt-ws']}`,
      clientId: appident,
      mqttSettings: {
        protocolVersion: 5,
        clean: true,
        wsOptions: { objectMode: false, perMessageDeflate: true },
        resubscribe: false,
        keepalive: 240,
      },
    },
  }
  // properties: { sessionExpiryInterval: 300 },

  app.config.globalProperties.$defaultRegion = currentRegion
  app.use(ConnectionPlugin, connectionConfig)
  store.use(() => ({ $connector: app.config.globalProperties.$connector, $region: currentRegion }))
  // Vue.connector.http.defaults.headers.common['x-flespi-front-app'] = `${pkgname}-${version}-${Math.random().toString(16).substring(2, 8)}`
  // console.log(Vue.connector)
  console.log(JSON.stringify(ConnectionPlugin), app)
  // app.config.globalProperties.$connector.http.update('config', { headers: { 'x-flespi-app': app } })
  // Vue.connector.http.external.interceptors.request.use(
  //   config => {
  //     config.headers['x-flespi-app'] = app
  //     return config
  //   },
  //   error => {
  //     return Promise.reject(error)
  //   }
  // )
  if (window) {
    window.addEventListener('beforeunload', () => {
      app.config.globalProperties.$connector.socket.close(true)
    })
  }

  // for use inside Vue files (Options API) through this.$axios and this.$api

  app.config.globalProperties.$axios = axios
  // ^ ^ ^ this will allow you to use this.$axios (for Vue Options API form)
  //       so you won't necessarily have to import axios in each vue file

  // app.config.globalProperties.$api = api
  // ^ ^ ^ this will allow you to use this.$api (for Vue Options API form)
  //       so you can easily perform requests against your app's API
})

// export { api }
