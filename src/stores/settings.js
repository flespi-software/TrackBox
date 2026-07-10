import { defineStore, acceptHMRUpdate } from 'pinia'
import { LocalStorage } from 'quasar'
import { secureStore } from '../secureStore'
import {
  DEFAULT_BASEMAPS,
  CARTO_LIGHT,
  CARTO_DARK,
  cartoFor,
  isCarto,
  LABELS_DEFAULT,
} from '../sim/mapTiles'

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
    mapStyle: CARTO_LIGHT, // active basemap value (see mapTiles BASEMAPS) or 'custom'
    enabledBasemaps: [...DEFAULT_BASEMAPS], // which built-ins show in the switcher
    customTileUrl: '', // user tile template; enables the 'custom' basemap when set
    showLabels: false, // overlay street/place labels on satellite basemaps
    labelsSource: LABELS_DEFAULT, // which label provider (see LABELS_SOURCES)
    apiKeys: {}, // loaded from secureStore
    loaded: false,
    wantSettings: null, // section to open in Settings ('mapLayers') or true; null = closed
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
      // Migrate the legacy theme-aware 'map' value to the split CARTO layers.
      this.mapStyle = p.mapStyle === 'map' ? CARTO_LIGHT : p.mapStyle || CARTO_LIGHT
      let enabled = Array.isArray(p.enabledBasemaps) ? p.enabledBasemaps : [...DEFAULT_BASEMAPS]
      if (enabled.includes('map')) {
        enabled = enabled.filter((v) => v !== 'map').concat([CARTO_LIGHT, CARTO_DARK])
      }
      this.enabledBasemaps = [...new Set(enabled)]
      this.customTileUrl = p.customTileUrl || ''
      this.showLabels = !!p.showLabels
      this.labelsSource = p.labelsSource || LABELS_DEFAULT
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
        this.persistPrefs()
      }
      const raw = await secureStore.get(KEYS_SECRET)
      this.apiKeys = safeParse(raw)
    },

    persistPrefs() {
      LocalStorage.set(PREFS_KEY, {
        provider: this.routerProvider,
        profile: this.routerProfile,
        mapStyle: this.mapStyle,
        enabledBasemaps: this.enabledBasemaps,
        customTileUrl: this.customTileUrl,
        showLabels: this.showLabels,
        labelsSource: this.labelsSource,
      })
    },

    setShowLabels(on) {
      this.showLabels = on
      this.persistPrefs()
    },

    setLabelsSource(src) {
      this.labelsSource = src
      this.persistPrefs()
    },

    setMapStyle(style) {
      this.mapStyle = style
      this.persistPrefs()
    },

    /* Ask MainLayout to open the Settings dialog, optionally expanding a section
       (e.g. 'mapLayers'). MainLayout watches this flag. */
    openSettings(section) {
      this.wantSettings = section || true
    },

    /* Show/hide a built-in basemap in the switcher; disabling the active one
       falls back to the first still-enabled layer. */
    setBasemapEnabled(value, on) {
      const set = new Set(this.enabledBasemaps)
      on ? set.add(value) : set.delete(value)
      this.enabledBasemaps = [...set]
      if (!on && this.mapStyle === value) this.mapStyle = this.enabledBasemaps[0] || CARTO_LIGHT
      this.persistPrefs()
    },

    /* On app theme change, flip a CARTO basemap to the matching variant - but only
       when a CARTO layer is active and the target variant is still enabled. */
    syncCartoBasemap(dark) {
      if (!isCarto(this.mapStyle)) return
      const target = cartoFor(dark)
      if (this.mapStyle !== target && this.enabledBasemaps.includes(target)) this.setMapStyle(target)
    },

    /* Set/clear the custom tile URL; clearing falls back off the custom basemap. */
    setCustomTileUrl(url) {
      this.customTileUrl = (url || '').trim()
      if (!this.customTileUrl && this.mapStyle === 'custom') this.mapStyle = 'map'
      this.persistPrefs()
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
