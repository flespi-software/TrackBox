<template>
  <div class="sim-map-wrap">
    <div ref="mapEl" class="sim-map" />
    <q-btn
      class="fit-btn"
      round
      dense
      color="white"
      text-color="primary"
      icon="mdi-fit-to-page-outline"
      size="sm"
      @click="fitAll"
    >
      <q-tooltip>Fit all routes</q-tooltip>
    </q-btn>
    <q-btn
      class="layers-btn"
      round
      dense
      color="white"
      text-color="primary"
      icon="mdi-layers"
      size="sm"
    >
      <q-tooltip>Basemap</q-tooltip>
      <q-menu anchor="bottom right" self="top right">
        <q-list dense style="min-width: 170px">
          <q-item
            v-for="s in mapStyles"
            :key="s.value"
            clickable
            v-close-popup
            @click="settings.setMapStyle(s.value)"
          >
            <q-item-section side>
              <q-icon
                :name="settings.mapStyle === s.value ? 'mdi-check' : 'mdi-checkbox-blank-circle-outline'"
                :color="settings.mapStyle === s.value ? 'primary' : 'grey-5'"
                size="18px"
              />
            </q-item-section>
            <q-item-section>{{ s.label }}</q-item-section>
          </q-item>
          <template v-if="isImagery">
            <q-separator class="q-my-xs" />
            <q-item clickable @click="settings.setShowLabels(!settings.showLabels)">
              <q-item-section side>
                <q-icon
                  :name="settings.showLabels ? 'mdi-checkbox-marked' : 'mdi-checkbox-blank-outline'"
                  :color="settings.showLabels ? 'primary' : 'grey-5'"
                  size="18px"
                />
              </q-item-section>
              <q-item-section>Street labels</q-item-section>
            </q-item>
            <q-item
              v-for="src in labelsSources"
              v-show="settings.showLabels"
              :key="src.value"
              clickable
              :inset-level="0.4"
              @click="settings.setLabelsSource(src.value)"
            >
              <q-item-section side>
                <q-icon
                  :name="settings.labelsSource === src.value ? 'mdi-radiobox-marked' : 'mdi-radiobox-blank'"
                  :color="settings.labelsSource === src.value ? 'primary' : 'grey-5'"
                  size="16px"
                />
              </q-item-section>
              <q-item-section class="text-caption">{{ src.label }}</q-item-section>
            </q-item>
          </template>
          <q-separator class="q-my-xs" />
          <q-item clickable v-close-popup @click="settings.openSettings('mapLayers')">
            <q-item-section side>
              <q-icon name="mdi-cog-outline" size="18px" color="grey-6" />
            </q-item-section>
            <q-item-section class="text-grey-7">Configure layers...</q-item-section>
          </q-item>
        </q-list>
      </q-menu>
    </q-btn>
  </div>
</template>

<script>
import { defineComponent } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  basemap,
  mapStyles as styleOptions,
  isImagery,
  LABELS_SOURCES,
  MAX_LABEL_LAYERS,
  MAX_ZOOM,
  BLANK_TILE,
} from '../sim/mapTiles'
import { useSettingsStore } from '../stores/settings'

function arrowIcon(color, dir) {
  return L.divIcon({
    className: 'sim-marker',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    html: `<div class="sim-marker-inner" style="transform:rotate(${dir || 0}deg)">
      <svg viewBox="0 0 24 24" width="26" height="26">
        <circle cx="12" cy="12" r="11" fill="${color}" stroke="#fff" stroke-width="2"/>
        <path d="M12 4 L17 18 L12 14.5 L7 18 Z" fill="#fff"/>
      </svg></div>`,
  })
}

// Numbered badge for a waypoint placed during route configuration.
function waypointIcon(color, label) {
  return L.divIcon({
    className: 'sim-wp-marker',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    html: `<div class="sim-wp-badge" style="background:${color}">${label}</div>`,
  })
}

// Stable key for a simulator's configured waypoints (rebuild markers only on change).
function waypointKey(sim) {
  const wps = (sim.source.build && sim.source.build.waypoints) || []
  return wps.map((w) => `${w.lat},${w.lon},${w.sec}`).join('|')
}

export default defineComponent({
  name: 'SimMap',
  props: {
    simulators: { type: Array, default: () => [] },
  },
  setup() {
    const settings = useSettingsStore()
    settings.load() // ensure the persisted basemap style is available
    return { settings }
  },
  data() {
    return {
      map: null,
      layers: {}, // id -> { polyline, marker }
      tileLayer: null,
      labelsLayers: [], // transparent street/place overlays (satellite only)
      fittedOnce: false,
      zooming: false,
      pendingReconcile: false,
    }
  },
  mounted() {
    this.map = L.map(this.$refs.mapEl, {
      zoomControl: true,
      attributionControl: true,
      // Canvas renderer: redraws routes at the new projection on every zoom instead
      // of relying on the SVG pane's animation transform (which intermittently failed
      // to reset, leaving the track at the wrong scale). Also faster for big routes.
      preferCanvas: true,
    }).setView([54.6872, 25.2797], 6)
    // Don't add/remove layers mid zoom-animation - that triggers Leaflet's
    // "_animateZoom on null map" crash. Defer reconcile until the zoom settles.
    this.map.on('zoomstart', () => {
      this.zooming = true
    })
    this.map.on('zoomend', () => {
      this.zooming = false
      if (this.pendingReconcile) {
        this.pendingReconcile = false
        this.reconcile()
      }
    })
    this.applyTiles()
    this.applyLabels()
    this.$nextTick(() => this.map.invalidateSize())
    this.reconcile()
    // Keep the map sized to its container (drawer toggle, window resize, panel
    // changes) - otherwise Leaflet shows grey unrendered strips.
    this._ro = new ResizeObserver(() => this.onResize())
    this._ro.observe(this.$refs.mapEl)
  },
  beforeUnmount() {
    if (this._ro) {
      this._ro.disconnect()
      this._ro = null
    }
    if (this._raf) cancelAnimationFrame(this._raf)
    if (this._resizeTimer) clearTimeout(this._resizeTimer)
    if (this.map) {
      try {
        this.map.stop() // cancel any in-flight pan/zoom animation
      } catch {
        // ignore
      }
      this.map.remove()
      this.map = null
    }
  },
  watch: {
    signature: {
      handler() {
        this.reconcile()
      },
      deep: true,
    },
    'settings.mapStyle'() {
      this.applyTiles()
      this.applyLabels() // labels only render over imagery basemaps
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
  },
  computed: {
    // Enabled built-in basemaps plus the user's custom layer when a URL is set.
    mapStyles() {
      return styleOptions(this.settings.customTileUrl, this.settings.enabledBasemaps)
    },
    // Active basemap is aerial imagery - where the labels overlay is offered.
    isImagery() {
      return isImagery(this.settings.mapStyle)
    },
    // Available label providers for the picker under the "Street labels" toggle.
    labelsSources() {
      return Object.entries(LABELS_SOURCES).map(([value, s]) => ({ value, label: s.label }))
    },
    // Recomputed whenever structure or any marker position changes.
    signature() {
      return this.simulators.map((s) => ({
        id: s.id,
        color: s.color,
        n: s.source.points.length,
        pos: s.runtime.position,
        dir: s.runtime.direction,
        status: s.runtime.status,
        hide: s.hideTrack,
        wp: waypointKey(s),
      }))
    },
  },
  methods: {
    onResize() {
      // Coalesce a burst of resize events (the drawer's open/close animation
      // fires one per frame) into a single invalidateSize once motion settles.
      // Invalidating every frame forces Leaflet to relayout + reload tiles, which
      // starves the drawer's CSS transition and makes it stutter.
      if (this._resizeTimer) clearTimeout(this._resizeTimer)
      this._resizeTimer = setTimeout(() => {
        this._resizeTimer = null
        if (!this.map) return
        // Resizing mid-zoom can desync vector layers - wait for the zoom to settle.
        if (this.zooming) return this.onResize()
        this.map.invalidateSize({ animate: false })
      }, 160)
    },
    applyTiles() {
      if (!this.map) return
      const b = basemap(this.settings.mapStyle, this.settings.customTileUrl)
      if (this.tileLayer) {
        // Update the layer in place instead of recreating it. A fresh L.tileLayer
        // on every switch loses its zoom-animation transition, so the basemap
        // freezes during zoom while the (persistent) canvas tracks keep gliding.
        const opts = this.tileLayer.options
        opts.maxNativeZoom = b.options.maxNativeZoom
        opts.subdomains = b.options.subdomains || 'abc'
        if (this._attribution) this.map.attributionControl.removeAttribution(this._attribution)
        this._attribution = b.options.attribution
        this.map.attributionControl.addAttribution(this._attribution)
        this.tileLayer.setUrl(b.url) // redraws tiles with the updated options
      } else {
        // Manage attribution manually (below) - keep it out of the layer options
        // so Leaflet doesn't also auto-register it and leave a stale entry on switch.
        const { attribution, ...opts } = b.options
        this.tileLayer = L.tileLayer(b.url, opts).addTo(this.map)
        this.tileLayer.bringToBack()
        this._attribution = attribution
        this.map.attributionControl.addAttribution(attribution)
      }
    },
    // Transparent street/place overlay - above the basemap, below the tracks
    // (which live in the higher overlay pane). The layers are created once at
    // mount pointing at a blank tile (zero network), then flipped to the real
    // provider via setUrl when wanted. A tile layer added after the map inits
    // doesn't zoom-animate, so we never recreate them - setUrl reuses the same
    // (animating) layer, exactly like applyTiles does for the basemap.
    applyLabels() {
      if (!this.map) return
      if (!this.labelsLayers.length) {
        this.labelsLayers = Array.from({ length: MAX_LABEL_LAYERS }, () => {
          const layer = L.tileLayer(BLANK_TILE, {
            maxZoom: MAX_ZOOM,
            maxNativeZoom: 19,
            subdomains: 'abcd', // for the {s} in CARTO label URLs
          }).addTo(this.map)
          layer.bringToFront() // above the basemap within the tile pane
          return layer
        })
      }
      const want = this.settings.showLabels && isImagery(this.settings.mapStyle)
      const src = LABELS_SOURCES[this.settings.labelsSource] || LABELS_SOURCES.esri
      // Point each layer at the source overlay (spare layers stay blank).
      this.labelsLayers.forEach((l, i) => {
        l.setUrl(want ? src.overlays[i] || BLANK_TILE : BLANK_TILE) // no-op if unchanged
        if (want) l.bringToFront()
      })
      // Attribution reflects the visible source only.
      const attr = want ? src.attribution : null
      if (this._labelsAttr !== attr) {
        if (this._labelsAttr) this.map.attributionControl.removeAttribution(this._labelsAttr)
        if (attr) this.map.attributionControl.addAttribution(attr)
        this._labelsAttr = attr
      }
    },
    reconcile() {
      if (!this.map) return
      // Avoid mutating layers during a zoom animation (crash + jitter).
      if (this.zooming) {
        this.pendingReconcile = true
        return
      }
      const seen = new Set()
      for (const sim of this.simulators) {
        seen.add(sim.id)
        let entry = this.layers[sim.id]
        if (!entry) {
          entry = {}
          this.layers[sim.id] = entry
        }
        // Route polyline (track) - can be hidden per simulator.
        const latlngs = sim.source.points.map((p) => [p.lat, p.lon])
        if (sim.hideTrack) {
          if (entry.polyline) {
            entry.polyline.remove()
            entry.polyline = null
            entry.pointCount = 0
          }
        } else if (!entry.polyline || entry.pointCount !== latlngs.length || entry.color !== sim.color) {
          if (entry.polyline) entry.polyline.remove()
          entry.polyline = L.polyline(latlngs, {
            color: sim.color,
            weight: 3,
            opacity: 0.7,
          }).addTo(this.map)
          entry.polyline.bindTooltip(sim.name, { sticky: true })
          entry.pointCount = latlngs.length
          entry.color = sim.color
        }
        // Configured waypoints (placed during route building) - numbered badges.
        const wps = (!sim.hideTrack && sim.source.build && sim.source.build.waypoints) || []
        const wpKey = waypointKey(sim)
        if (!wps.length) {
          if (entry.waypoints) {
            entry.waypoints.forEach((m) => m.remove())
            entry.waypoints = null
            entry.wpKey = ''
          }
        } else if (entry.wpKey !== wpKey || entry.wpColor !== sim.color) {
          if (entry.waypoints) entry.waypoints.forEach((m) => m.remove())
          entry.waypoints = wps.map((w, i) => {
            const m = L.marker([w.lat, w.lon], {
              icon: waypointIcon(sim.color, i + 1),
              keyboard: false,
              zIndexOffset: -500, // keep below the moving arrow marker
            }).addTo(this.map)
            const stop = w.sec > 0 ? ` \u00B7 ${w.sec}s stop` : ''
            m.bindTooltip(`Waypoint ${i + 1}${stop}`, { direction: 'top', offset: [0, -10] })
            return m
          })
          entry.wpKey = wpKey
          entry.wpColor = sim.color
        }

        // Moving marker (also hidden when the track is hidden)
        const pos = sim.hideTrack ? null : sim.runtime.position
        if (pos) {
          if (!entry.marker) {
            entry.marker = L.marker([pos.lat, pos.lon], {
              icon: arrowIcon(sim.color, sim.runtime.direction),
            }).addTo(this.map)
            entry.marker.bindTooltip(sim.name, { direction: 'top', offset: [0, -12] })
          } else {
            entry.marker.setLatLng([pos.lat, pos.lon])
            entry.marker.setIcon(arrowIcon(sim.color, sim.runtime.direction))
          }
        } else if (entry.marker) {
          entry.marker.remove()
          entry.marker = null
        }
      }
      // Drop removed simulators
      for (const id of Object.keys(this.layers)) {
        if (!seen.has(id)) {
          const e = this.layers[id]
          if (e.polyline) e.polyline.remove()
          if (e.marker) e.marker.remove()
          if (e.waypoints) e.waypoints.forEach((m) => m.remove())
          delete this.layers[id]
        }
      }
      if (!this.fittedOnce && this.simulators.length) {
        this.fitAll()
        this.fittedOnce = true
      }
    },
    fitAll() {
      if (!this.map) return
      const polylines = Object.values(this.layers)
        .map((e) => e.polyline)
        .filter(Boolean)
      if (!polylines.length) return
      let bounds = polylines[0].getBounds()
      for (let i = 1; i < polylines.length; i++) bounds = bounds.extend(polylines[i].getBounds())
      if (bounds.isValid()) this.map.fitBounds(bounds, { padding: [30, 30], animate: false })
    },
    invalidate() {
      if (this.map) this.map.invalidateSize()
    },
  },
})
</script>

<style lang="scss">
.sim-map-wrap {
  position: relative;
  height: 100%;
  width: 100%;
}
.sim-map {
  height: 100%;
  width: 100%;
  min-height: 360px;
  z-index: 0;
}
.fit-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 500;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
}
.layers-btn {
  position: absolute;
  top: 50px;
  right: 10px;
  z-index: 500;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
}
.sim-marker-inner {
  transition: transform 0.2s linear;
}
.sim-wp-badge {
  box-sizing: border-box;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid #fff;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 14px;
  text-align: center;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
}
</style>
