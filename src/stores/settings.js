import { defineStore, acceptHMRUpdate } from 'pinia'
import { LocalStorage } from 'quasar'
import { secureStore } from '../secureStore'

// Routing prefs. Provider/profile are plain (non-secret) and live in
// LocalStorage; API keys are secrets and live in secureStore (encrypted vault
// on desktop, namespaced LocalStorage on web).
const PREFS_KEY = 'trackbox-routing'
const KEYS_SECRET = 'router-apiKeys'

function safeParse(raw) {
  try {
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    routerProvider: 'osrm',
    routerProfile: '',
    apiKeys: {}, // loaded from secureStore
    loaded: false,
  }),

  getters: {
    keyFor: (s) => (provider) => s.apiKeys[provider] || '',
  },

  actions: {
    load() {
      if (this.loaded) return
      const p = LocalStorage.getItem(PREFS_KEY) || {}
      this.routerProvider = p.provider || 'osrm'
      this.routerProfile = p.profile || ''
      this.loaded = true
      this.loadKeys()
    },

    /* Load API keys from the secure store; migrate any legacy plaintext keys. */
    async loadKeys() {
      if (secureStore.needsUnlock) return // wait until the vault is unlocked
      const legacy = LocalStorage.getItem(PREFS_KEY) || {}
      const legacyKeys = legacy.apiKeys || (legacy.orsKey ? { ors: legacy.orsKey } : null)
      if (legacyKeys && Object.keys(legacyKeys).length) {
        const existing = await secureStore.get(KEYS_SECRET)
        if (!existing) await secureStore.set(KEYS_SECRET, JSON.stringify(legacyKeys))
        // strip secrets out of plaintext storage
        LocalStorage.set(PREFS_KEY, { provider: this.routerProvider, profile: this.routerProfile })
      }
      const raw = await secureStore.get(KEYS_SECRET)
      this.apiKeys = safeParse(raw)
    },

    persistPrefs() {
      LocalStorage.set(PREFS_KEY, { provider: this.routerProvider, profile: this.routerProfile })
    },

    async setKey(provider, key) {
      this.apiKeys = { ...this.apiKeys, [provider]: key }
      await secureStore.set(KEYS_SECRET, JSON.stringify(this.apiKeys))
    },

    setRouterDefaults(provider, profile) {
      this.routerProvider = provider
      this.routerProfile = profile
      this.persistPrefs()
    },
  },
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useSettingsStore, import.meta.hot))
}
