import { defineStore, acceptHMRUpdate } from 'pinia'
import { SessionStorage } from 'quasar'
import { useMiscStore } from './misc'
import { isTauri } from '../platform'
import { secureStore } from '../secureStore'
import { logInfo, logWarn } from '../log'

const TOKEN_SECRET = 'flespi-token'

export const useAuthStore = defineStore('auth', {
  /* this.$connector and this.$region is already attached by boot/flespi-io.js */

  state: () => ({
    httpOnline: undefined, // application is available by HTTP flag; set to false if failed to get favicon by HTTP
    socketConnected: undefined, // MQTT socket connected flag; initially set to undefined so that Offline corpse won't apper at F5 (after reload)
    token: '',
    cid: 0,
  }),
  getters: {},
  actions: {
    setSocketConnected(connected) {
      // Log only real transitions (skip the undefined init/clear state).
      if (connected !== this.socketConnected) {
        if (connected === true) logInfo('mqtt', 'broker connected')
        else if (connected === false) logWarn('mqtt', 'broker disconnected')
      }
      this.socketConnected = connected
    },
    /* Resolve and cache the account id (cid) the current token belongs to.
       Used to scope MQTT subscriptions to our own account's messages. */
    async ensureCid() {
      if (this.cid) return this.cid
      if (!this.token) return 0
      try {
        const resp = await this.$connector.http.get('platform/customer')
        const id = resp && resp.data && resp.data.result && resp.data.result[0] && resp.data.result[0].id
        if (id) this.cid = id
      } catch (e) {
        logWarn('auth', `cid fetch failed: ${e?.message || e}`)
      }
      return this.cid
    },
    setHttpOnline(online) {
      this.httpOnline = online
    },
    async checkConnection() {
      try {
        // checking HTTP availability of the application
        const resp = await this.$connector.http.external.get(
          `./icons/favicon-16x16.png?_=${new Date().getTime()}`,
        )
        if (resp.status === 200 && !this.httpOnline) {
          // HTTP is back online
          this.setHttpOnline(true)
        }
      } catch (e) {
        if (process.env.DEV) {
          console.log(e)
        }
        if (this.httpOnline) {
          // HTTP has gone to offlie
          this.setHttpOnline(false)
        }
      }
    },
    async setToken(token) {
      /* setup mqtt handlers */
      await this.$connector.socket.off('connect')
      await this.$connector.socket.on('connect', () => {
        this.setSocketConnected(true)
      })

      this.$connector.socket.off('error')
      this.$connector.socket.on('error', (e) => {
        if (e && (e.code === 134 || e.code === 135 || e.code === 138)) {
          this.clearToken()
        } else {
          this.setSocketConnected(false)
        }
      })
      this.$connector.socket.off('close')
      this.$connector.socket.on('close', () => {
        this.setSocketConnected(false)
      })
      this.$connector.socket.off('disconnect')
      this.$connector.socket.on('disconnect', () => {
        this.setSocketConnected(false)
      })
      this.$connector.socket.off('end')
      this.$connector.socket.on('end', () => {
        this.setSocketConnected()
      })

      /* check if the token is valid */
      if (!token || token.length === 0 || token === 'FlespiToken ') {
        this.clearToken()
        return
      }
      let tokenHash = token.replace('FlespiToken ', '')
      if (!tokenHash.match(/^[a-z0-9]+$/i)) {
        this.clearToken()
        return
      }

      /* set token to mqtt connector */
      this.$connector.token = `FlespiToken ${tokenHash}`
      /* store token for internal usage */
      this.token = tokenHash
      /* store token into session storage so that after F5 auto-login may occur */
      useMiscStore().setToStore({ store: SessionStorage, name: 'token', value: this.token })
      /* desktop: persist securely in the encrypted vault for auto-login across restarts */
      if (isTauri) await secureStore.set(TOKEN_SECRET, this.token)
      // console.log(this.$connector.auth.getInfo().then(a => { console.log(a) }))
    },

    clearToken() {
      /* clears flespi token and application stops conneting over MQTT */
      useMiscStore().setToStore({ store: SessionStorage, name: 'token', value: null })
      if (isTauri) secureStore.remove(TOKEN_SECRET)
      this.$connector.token = ''
      this.token = ''
      this.cid = 0
      /* set connected flags to undefined */
      this.setHttpOnline()
      this.setSocketConnected()
    },
  },
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useAuthStore, import.meta.hot))
}
