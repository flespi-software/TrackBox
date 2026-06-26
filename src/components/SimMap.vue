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
  </div>
</template>

<script>
import { defineComponent } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { basemap } from '../sim/mapTiles'

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
  data() {
    return {
      map: null,
      layers: {}, // id -> { polyline, marker }
      tileLayer: null,
      fittedOnce: false,
      zooming: false,
      pendingReconcile: false,
    }
  },
  mounted() {
    this.map = L.map(this.$refs.mapEl, {
      zoomControl: true,
      attributionControl: true,
    }).setView([54.6872, 25.2797], 6)
    // Don't add/remove layers mid zoom-animation — that triggers Leaflet's
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
    this.$nextTick(() => this.map.invalidateSize())
    this.reconcile()
    // Keep the map sized to its container (drawer toggle, window resize, panel
    // changes) — otherwise Leaflet shows grey unrendered strips.
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
    dark() {
      this.applyTiles()
    },
  },
  computed: {
    dark() {
      return this.$q.dark.isActive
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
        if (this.map) this.map.invalidateSize({ animate: false })
      }, 160)
    },
    applyTiles() {
      if (!this.map) return
      if (this.tileLayer) this.tileLayer.remove()
      const b = basemap(this.dark)
      this.tileLayer = L.tileLayer(b.url, b.options).addTo(this.map)
      this.tileLayer.bringToBack()
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
        // Route polyline (track) — can be hidden per simulator.
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
        // Configured waypoints (placed during route building) — numbered badges.
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
            const stop = w.sec > 0 ? ` · ${w.sec}s stop` : ''
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
