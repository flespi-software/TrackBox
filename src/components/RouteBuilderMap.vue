<template>
  <div class="rb-wrap" :class="{ 'rb-fullscreen': fullscreen }">
    <div ref="mapEl" class="rb-map" />
    <!-- Empty-state call to action: build mode with no points placed yet. -->
    <div v-if="interactive && !waypoints.length" class="rb-empty-hint">
      <q-icon name="mdi-map-marker-plus-outline" size="26px" />
      <span>Click the map to drop waypoints</span>
    </div>
    <div v-if="zoomHint && !fullscreen" class="rb-zoom-hint">Use Ctrl + scroll to zoom</div>
    <div class="rb-hint">
      {{
        interactive
          ? 'Click to add waypoints \u00B7 drag to adjust \u00B7 Ctrl+scroll or +/- to zoom'
          : 'Route preview \u00B7 Ctrl+scroll or +/- to zoom'
      }}
    </div>
    <q-btn
      class="rb-fs-btn"
      round
      dense
      color="white"
      text-color="grey-9"
      size="sm"
      :icon="fullscreen ? 'mdi-fullscreen-exit' : 'mdi-fullscreen'"
      @click="toggleFullscreen"
    >
      <q-tooltip>{{ fullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen map' }}</q-tooltip>
    </q-btn>
    <q-btn
      class="rb-loop-btn"
      round
      dense
      :color="loop ? 'primary' : 'white'"
      :text-color="loop ? 'white' : 'grey-9'"
      size="sm"
      :icon="loop ? 'mdi-go-kart-track' : 'mdi-ray-start-arrow'"
      @click="$emit('update:loop', !loop)"
    >
      <q-tooltip>{{ loop ? 'Looped route' : 'One-way route' }}</q-tooltip>
    </q-btn>
  </div>
</template>

<script>
import { defineComponent } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  basemap,
  isImagery,
  LABELS_SOURCES,
  MAX_LABEL_LAYERS,
  MAX_ZOOM,
  BLANK_TILE,
} from '../sim/mapTiles'
import { useSettingsStore } from '../stores/settings'

function dotIcon(color, n) {
  return L.divIcon({
    className: 'rb-marker',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    html: `<div class="rb-marker-inner" style="background:${color}">${n}</div>`,
  })
}

export default defineComponent({
  name: 'RouteBuilderMap',
  props: {
    waypoints: { type: Array, default: () => [] },
    routePoints: { type: Array, default: () => [] },
    color: { type: String, default: '#1e88e5' },
    loop: { type: Boolean, default: false },
    // false = read-only preview (file mode): no click-to-add, just show the route.
    interactive: { type: Boolean, default: true },
  },
  emits: ['add', 'move', 'update:loop'],
  setup() {
    const settings = useSettingsStore()
    settings.load()
    return { settings }
  },
  data() {
    return {
      map: null,
      markers: [],
      routeLine: null,
      tileLayer: null,
      labelsLayers: [],
      fullscreen: false,
      zoomHint: false,
    }
  },
  mounted() {
    // Wheel-zoom off while embedded so scrolling the dialog doesn't zoom the map
    // (use the +/- control or go fullscreen, which re-enables wheel zoom).
    this.map = L.map(this.$refs.mapEl, { zoomControl: true, scrollWheelZoom: false }).setView(
      [54.6872, 25.2797],
      12,
    )
    this.applyTiles()
    this.applyLabels()
    this.map.on('click', (e) => {
      if (this.interactive) this.$emit('add', { lat: e.latlng.lat, lon: e.latlng.lng })
    })
    // Dialog open animation: ensure the map measures its real size.
    this.$nextTick(() => this.map.invalidateSize())
    setTimeout(() => this.map && this.map.invalidateSize(), 350)
    // Allow one auto-fit if we open with an existing route (editing); never auto-fit
    // on waypoints added later while building.
    this._allowInitialFit = this.routePoints.length > 1
    this.renderWaypoints()
    this.renderRoute()
    // Ctrl/Cmd + wheel zooms toward the cursor while embedded; plain scroll is left
    // to the dialog (and shows a hint). Fullscreen keeps native wheel zoom.
    this._onWheel = (e) => {
      if (this.fullscreen) return
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault() // also stops the browser's ctrl+wheel page zoom
        const pt = this.map.mouseEventToContainerPoint(e)
        const delta = e.deltaY < 0 ? 1 : -1
        this.map.setZoomAround(this.map.containerPointToLatLng(pt), this.map.getZoom() + delta)
      } else {
        this.zoomHint = true
        clearTimeout(this._hintTimer)
        this._hintTimer = setTimeout(() => (this.zoomHint = false), 1200)
      }
    }
    this.$refs.mapEl.addEventListener('wheel', this._onWheel, { passive: false })
    this._onKey = (e) => {
      if (e.key === 'Escape' && this.fullscreen) this.toggleFullscreen()
    }
    window.addEventListener('keydown', this._onKey)
  },
  beforeUnmount() {
    clearTimeout(this._hintTimer)
    if (this._onWheel && this.$refs.mapEl) this.$refs.mapEl.removeEventListener('wheel', this._onWheel)
    window.removeEventListener('keydown', this._onKey)
    if (this.map) {
      try {
        this.map.stop()
      } catch {
        // ignore
      }
      this.map.remove()
      this.map = null
    }
  },
  watch: {
    'settings.mapStyle'() {
      this.applyTiles()
      this.applyLabels()
    },
    'settings.customTileUrl'() {
      this.applyTiles()
    },
    'settings.showLabels'() {
      this.applyLabels()
    },
    'settings.labelsSource'() {
      this.applyLabels()
    },
    waypoints: {
      handler() {
        this.renderWaypoints()
      },
      deep: true,
    },
    routePoints: {
      handler() {
        this.renderRoute()
      },
      deep: true,
    },
  },
  methods: {
    applyTiles() {
      if (!this.map) return
      const b = basemap(this.settings.mapStyle, this.settings.customTileUrl)
      if (this.tileLayer) {
        // Update in place, not recreate: a fresh layer on each switch loses its
        // zoom-animation transition and freezes the basemap during zoom.
        const opts = this.tileLayer.options
        opts.maxNativeZoom = b.options.maxNativeZoom
        opts.subdomains = b.options.subdomains || 'abc'
        if (this._attribution) this.map.attributionControl.removeAttribution(this._attribution)
        this._attribution = b.options.attribution
        this.map.attributionControl.addAttribution(this._attribution)
        this.tileLayer.setUrl(b.url)
      } else {
        // Manage attribution manually (below) so Leaflet doesn't also auto-register
        // it and leave a stale entry on switch.
        const { attribution, ...opts } = b.options
        this.tileLayer = L.tileLayer(b.url, opts).addTo(this.map)
        this.tileLayer.bringToBack()
        this._attribution = attribution
        this.map.attributionControl.addAttribution(attribution)
      }
    },
    // Transparent street/place labels over imagery - same technique as SimMap:
    // created once at mount pointing at a blank tile, flipped to the chosen
    // source via setUrl so the layers never get recreated (keeps zoom animation)
    // and issue no requests while hidden. Honours the global labels settings.
    applyLabels() {
      if (!this.map) return
      if (!this.labelsLayers.length) {
        this.labelsLayers = Array.from({ length: MAX_LABEL_LAYERS }, () => {
          const layer = L.tileLayer(BLANK_TILE, {
            maxZoom: MAX_ZOOM,
            maxNativeZoom: 19,
            subdomains: 'abcd',
          }).addTo(this.map)
          layer.bringToFront()
          return layer
        })
      }
      const want = this.settings.showLabels && isImagery(this.settings.mapStyle)
      const src = LABELS_SOURCES[this.settings.labelsSource] || LABELS_SOURCES.esri
      this.labelsLayers.forEach((l, i) => {
        l.setUrl(want ? src.overlays[i] || BLANK_TILE : BLANK_TILE)
        if (want) l.bringToFront()
      })
      const attr = want ? src.attribution : null
      if (this._labelsAttr !== attr) {
        if (this._labelsAttr) this.map.attributionControl.removeAttribution(this._labelsAttr)
        if (attr) this.map.attributionControl.addAttribution(attr)
        this._labelsAttr = attr
      }
    },
    toggleFullscreen() {
      this.fullscreen = !this.fullscreen
      // Wheel zoom only makes sense fullscreen (no dialog to scroll behind it).
      if (this.map) {
        if (this.fullscreen) this.map.scrollWheelZoom.enable()
        else this.map.scrollWheelZoom.disable()
      }
      // Let the DOM resize before Leaflet re-measures, then fit the route.
      this.$nextTick(() => {
        if (!this.map) return
        this.map.invalidateSize()
        if (this.routeLine) {
          this.map.fitBounds(this.routeLine.getBounds(), { padding: [40, 40], animate: false })
        }
      })
      setTimeout(() => this.map && this.map.invalidateSize(), 250)
    },
    renderWaypoints() {
      if (!this.map) return
      this.markers.forEach((m) => m.remove())
      this.markers = this.waypoints.map((w, i) => {
        const m = L.marker([w.lat, w.lon], {
          icon: dotIcon(this.color, i + 1),
          draggable: true,
        }).addTo(this.map)
        m.on('dragend', () => {
          const ll = m.getLatLng()
          this.$emit('move', { index: i, lat: ll.lat, lon: ll.lng })
        })
        return m
      })
      if (this.waypoints.length === 1) {
        this.map.panTo([this.waypoints[0].lat, this.waypoints[0].lon])
      }
    },
    renderRoute() {
      if (!this.map) return
      if (this.routeLine) {
        this.routeLine.remove()
        this.routeLine = null
      }
      if (this.routePoints.length > 1) {
        this.routeLine = L.polyline(
          this.routePoints.map((p) => [p.lat, p.lon]),
          { color: this.color, weight: 4, opacity: 0.8 },
        ).addTo(this.map)
        // Fit only for the read-only preview, or once when opening an existing route -
        // not on every waypoint added while building (that zooms the map out from
        // under the user). Non-animated: the dialog can close right after building,
        // and tearing down the map mid zoom-animation crashes Leaflet.
        if (!this.interactive || this._allowInitialFit) {
          this.map.fitBounds(this.routeLine.getBounds(), { padding: [25, 25], animate: false })
          this._allowInitialFit = false
        }
      }
    },
  },
})
</script>

<style lang="scss">
.rb-wrap {
  position: relative;
  width: 100%;
  height: 300px;
  border-radius: 6px;
  overflow: hidden;
}
.rb-wrap.rb-fullscreen {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  border-radius: 0;
  z-index: 9000; // above Quasar dialog (~6000)
}
.rb-fs-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 600;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
}
.rb-loop-btn {
  position: absolute;
  top: 48px;
  right: 8px;
  z-index: 600;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
}
.rb-map {
  width: 100%;
  height: 100%;
  z-index: 0;
}
.rb-hint {
  position: absolute;
  bottom: 6px;
  left: 6px;
  z-index: 500;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  pointer-events: none;
}
.rb-zoom-hint {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 600;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  padding: 8px 16px;
  border-radius: 6px;
  pointer-events: none;
}
.rb-empty-hint {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 550;
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: calc(100% - 24px);
  background: var(--q-primary);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  padding: 6px 14px;
  border-radius: 18px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  pointer-events: none;
}
.rb-marker-inner {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
}
</style>
