<template>
  <q-dialog :model-value="modelValue" :maximized="maximized" @update:model-value="close" persistent>
    <q-card :style="cardStyle" class="column no-wrap">
      <q-card-section class="row items-center q-pb-none col-auto">
        <div class="text-h6">{{ editId ? 'Edit simulator' : 'New simulator' }}</div>
        <q-space />
        <q-btn icon="mdi-help-circle" flat round dense @click="showTour">
          <q-tooltip>Show tour</q-tooltip>
        </q-btn>
        <q-btn icon="mdi-close" flat round dense @click="close" />
      </q-card-section>

      <q-card-section class="scroll col" :style="scrollStyle">
        <q-input v-model="form.name" label="Name" dense outlined class="q-mb-md" />

        <!-- Route -->
        <div class="text-subtitle2 q-mb-xs">Route</div>
        <q-btn-toggle
          id="tour-route-mode"
          v-model="routeMode"
          spread
          no-caps
          unelevated
          toggle-color="primary"
          class="q-mb-sm rb-route-toggle"
          :options="[
            { label: 'Build by roads', value: 'build', icon: 'mdi-routes' },
            { label: 'Upload file', value: 'file', icon: 'mdi-file-upload' },
          ]"
        />

        <template v-if="routeMode === 'file'">
          <div class="row q-col-gutter-sm items-center">
            <div class="col">
              <q-file
                v-model="file"
                label="Upload route file"
                dense
                outlined
                accept=".json,.geojson,.gpx,.kml,.xml,application/json,application/gpx+xml"
                @update:model-value="onFile"
              >
                <template #prepend><q-icon name="mdi-paperclip" /></template>
              </q-file>
            </div>
            <div class="col-auto">
              <q-select
                v-model="format"
                :options="formatOptions"
                dense
                outlined
                emit-value
                map-options
                style="min-width: 150px"
                label="Format"
                @update:model-value="reparse"
              />
            </div>
          </div>
          <div class="row items-center q-mt-xs">
            <q-btn flat dense no-caps size="sm" icon="mdi-map-marker-path" label="Load sample route" @click="loadSample" />
            <q-space />
            <div v-if="parseError" class="text-caption text-negative">{{ parseError }}</div>
          </div>
          <!-- Read-only preview of the loaded track (with the Loop toggle on it). -->
          <RouteBuilderMap
            v-if="parsed"
            class="q-mt-sm"
            :waypoints="[]"
            :route-points="parsed.points"
            :loop="form.options.loop"
            :interactive="false"
            @update:loop="form.options.loop = $event"
          />
        </template>

        <template v-else>
          <div class="row q-col-gutter-sm">
            <q-select
              class="col"
              v-model="routerProvider"
              :options="routerOptions"
              dense
              outlined
              emit-value
              map-options
              label="Router"
              @update:model-value="onProviderChange"
            />
            <q-select
              class="col"
              v-model="routerProfile"
              :options="profileOptions"
              dense
              outlined
              emit-value
              map-options
              label="Profile"
              @update:model-value="onProfileChange"
            />
          </div>
          <q-banner v-if="needsKey && !hasKey" dense class="bg-amber-1 text-amber-10 rounded-borders q-mt-sm">
            <template #avatar><q-icon name="mdi-key-alert" color="amber-9" /></template>
            No API key for this provider. Add it in
            <b>Settings</b> (gear icon, left drawer).
            <q-btn
              v-if="keyUrl"
              flat
              dense
              no-caps
              size="sm"
              color="primary"
              label="get key"
              icon-right="mdi-open-in-new"
              @click.stop="openKeyUrl"
            />
          </q-banner>
          <RouteBuilderMap
            class="q-mt-sm"
            :waypoints="waypoints"
            :route-points="parsed ? parsed.points : []"
            :loop="form.options.loop"
            :interactive="true"
            @add="addWaypoint"
            @move="moveWaypoint"
            @update:loop="form.options.loop = $event"
          />
          <div class="row items-center q-mt-xs">
            <q-btn flat dense no-caps size="sm" icon="mdi-undo" label="Undo" :disable="!waypoints.length" @click="undoWaypoint" />
            <q-btn flat dense no-caps size="sm" icon="mdi-delete-sweep" label="Clear" :disable="!waypoints.length" @click="clearWaypoints" />
            <q-space />
            <q-spinner v-if="building" size="18px" color="primary" class="q-mr-sm" />
            <div v-else-if="buildError" class="text-caption text-negative">{{ buildError }}</div>
            <div class="text-caption text-grey-7 q-ml-sm">{{ waypoints.length }} waypoints</div>
          </div>

        </template>

        <!-- Route stats (map / file) — kept above the stops list. -->
        <div class="row items-center q-mt-xs">
          <div v-if="parsed" class="text-caption text-positive">
            {{ parsed.points.length }} points · {{ distanceKm }} km
            <span v-if="parsed.hasTimes"> · has timestamps</span>
          </div>
          <div v-else-if="routeMissing" class="text-caption text-negative">
            <q-icon name="mdi-alert-circle-outline" size="14px" /> Add a route to continue —
            upload a file or build one by roads.
          </div>
        </div>

        <!-- Per-waypoint stops (collapsible): vehicle waits (speed 0) at placed points. -->
        <q-expansion-item
          v-if="waypoints.length"
          dense
          icon="mdi-bus-stop"
          :label="`Stops (${waypoints.length})`"
          class="q-mt-sm"
        >
          <div class="text-caption text-grey-6 q-mb-xs q-mt-xs">
            Stop at a waypoint: how many seconds to wait there (0 = drive through).
            Doors open at stops if "Open doors at stops" is on.
          </div>
          <div
            v-for="(w, i) in waypoints"
            :key="i"
            class="row items-center no-wrap q-col-gutter-sm q-mb-xs rb-wp-row"
            :class="{
              'rb-wp-dragging': dragIndex === i,
              'rb-wp-drop-before': dragOverIndex === i && !dragOverAfter,
              'rb-wp-drop-after': dragOverIndex === i && dragOverAfter,
            }"
            @dragover.prevent="onWpDragOver(i, $event)"
            @dragleave="onWpDragLeave(i)"
            @drop.prevent="onWpDrop"
          >
            <div class="col-auto column">
              <q-btn
                flat dense round size="xs" icon="mdi-chevron-up"
                :disable="i === 0"
                @click="moveWaypointOrder(i, -1)"
              />
              <q-btn
                flat dense round size="xs" icon="mdi-chevron-down"
                :disable="i === waypoints.length - 1"
                @click="moveWaypointOrder(i, 1)"
              />
            </div>
            <div class="col-auto">
              <div
                class="rb-wp-badge rb-wp-handle"
                draggable="true"
                @dragstart="onWpDragStart(i, $event)"
                @dragend="onWpDragEnd"
              >
                {{ i + 1 }}
                <q-tooltip>Drag to reorder</q-tooltip>
              </div>
            </div>
            <div
              class="col text-caption text-grey-7 ellipsis rb-wp-handle"
              draggable="true"
              @dragstart="onWpDragStart(i, $event)"
              @dragend="onWpDragEnd"
            >
              {{ w.lat.toFixed(5) }}, {{ w.lon.toFixed(5) }}
              <q-tooltip>Drag to reorder</q-tooltip>
            </div>
            <q-input
              style="width: 104px"
              type="number"
              min="0"
              :model-value="w.sec"
              label="wait sec"
              dense
              outlined
              @update:model-value="(v) => setWaypointSec(i, v)"
            />
          </div>
        </q-expansion-item>

        <!-- Route-wide automatic stops (applies to any route) -->
        <q-item
          clickable
          v-ripple
          class="q-px-sm rounded-borders q-mt-xs"
          @click="form.options.trafficLights = !form.options.trafficLights"
        >
          <q-item-section avatar>
            <q-avatar
              size="md"
              font-size="24px"
              icon="mdi-traffic-light"
              :color="form.options.trafficLights ? 'primary' : 'grey-4'"
              :text-color="form.options.trafficLights ? 'white' : 'grey-7'"
              :class="{ 'rb-tl-off': !form.options.trafficLights }"
            />
          </q-item-section>
          <q-item-section>
            <q-item-label>
              Traffic-light stops near turns ·
              <span :class="form.options.trafficLights ? 'text-primary' : 'text-grey-6'">
                {{ form.options.trafficLights ? 'On' : 'Off' }}
              </span>
            </q-item-label>
            <q-item-label caption>Adds short automatic stops at some sharp turns.</q-item-label>
          </q-item-section>
        </q-item>

        <q-separator class="q-my-md" />

        <!-- Transport / protocol (descriptor-driven) -->
        <div id="tour-transport" class="text-subtitle2 q-mb-xs">Send via</div>
        <q-select
          :model-value="form.transport.type"
          :options="transportOptions"
          emit-value
          map-options
          dense
          outlined
          label="Protocol"
          class="q-mb-sm"
          @update:model-value="onTransportChange"
        >
          <template #prepend><ProtocolIcon :icon="selectedTransportIcon" /></template>
          <template #option="scope">
            <q-item v-bind="scope.itemProps">
              <q-item-section avatar>
                <ProtocolIcon :icon="scope.opt.icon" />
              </q-item-section>
              <q-item-section>{{ scope.opt.label }}</q-item-section>
            </q-item>
          </template>
        </q-select>

        <!-- Config fields generated from the selected transport's descriptor -->
        <template v-for="f in visibleTransportFields" :key="f.key">
          <q-btn-toggle
            v-if="f.type === 'btnToggle'"
            :model-value="form.transport[f.key]"
            spread
            no-caps
            dense
            class="q-mb-sm"
            toggle-color="secondary"
            :options="f.options"
            @update:model-value="(v) => (form.transport[f.key] = v)"
          />
          <q-toggle
            v-else-if="f.type === 'toggle'"
            v-model="form.transport[f.key]"
            :label="f.label"
            dense
            class="q-mb-sm"
          />
          <q-input
            v-else
            v-model="form.transport[f.key]"
            :type="f.type === 'number' ? 'number' : 'text'"
            :label="f.label + (f.required ? ' *' : '')"
            :placeholder="f.placeholder"
            :hint="f.hint"
            :error="fieldInvalid(f)"
            error-message="Required"
            dense
            outlined
            class="q-mb-sm"
          />
        </template>

        <!-- Web build over HTTPS can't reach a plain-HTTP channel (mixed content). -->
        <q-banner
          v-if="httpMixedContentWarn"
          dense
          class="bg-amber-2 text-amber-10 rounded-borders q-mb-sm"
        >
          <template #avatar><q-icon name="mdi-lock-alert" color="amber-9" /></template>
          You're using the web app (HTTPS), so it can't POST to a plain-HTTP channel —
          the browser blocks mixed content. Enable <b>SSL</b> on the flespi channel and
          use its <code>https://</code> URL. (The desktop app has no such restriction.)
        </q-banner>

        <q-separator class="q-my-md" />

        <!-- Options -->
        <div class="text-subtitle2 q-mb-sm">Playback</div>
        <q-select
          v-model="form.options.speedMode"
          :options="speedModeOptions"
          emit-value
          map-options
          dense
          outlined
          label="Speed mode"
          :hint="speedModeHint"
          class="q-mb-md"
        />
        <div class="row q-col-gutter-md items-start">
          <q-input
            class="col-12 col-sm-6"
            v-model.number="form.options.speedKmh"
            type="number"
            :label="form.options.speedMode === 'constant' ? 'Speed (km/h)' : 'Cruise speed (km/h)'"
            dense
            outlined
            :disable="usesRouteSpeed"
            :hint="usesRouteSpeed ? 'Using route data' : ''"
          />
          <q-input
            v-if="usesRouteSpeed"
            class="col-12 col-sm-6"
            v-model.number="form.options.timeMultiplier"
            type="number"
            label="Playback speed ×"
            dense
            outlined
          />
          <q-input
            class="col-12 col-sm-6"
            v-model.number="form.options.sendInterval"
            type="number"
            label="Send interval (s)"
            dense
            outlined
          />
          <q-input
            class="col-12 col-sm-6"
            v-model.number="form.options.satellites"
            type="number"
            label="Satellites"
            dense
            outlined
          />
          <q-input
            class="col-12 col-sm-6"
            v-model.number="form.options.turnDeg"
            type="number"
            label="Report on turn (°)"
            dense
            outlined
            hint="Extra message when heading changes this much (0 = off)"
          />
        </div>

        <q-separator class="q-my-md" />

        <!-- Vehicle state -->
        <q-expansion-item
          id="tour-vehicle"
          dense
          icon="mdi-car-cog"
          :label="`Vehicle state${activeParamKeys.length ? ' (' + activeParamKeys.length + ')' : ''}`"
        >
          <div class="q-pa-sm">
            <!-- Items have no v-close-popup, so the menu stays open while you add
                 several parameters; each added one just drops out of the list (no flicker).
                 The list shrinks as items are added, so we re-anchor the menu after each add. -->
            <q-btn
              outline
              no-caps
              dense
              color="primary"
              icon="mdi-plus"
              label="Add parameter"
              class="full-width"
              :disable="!paramAddOptions.length"
            >
              <q-menu ref="addMenu" fit>
                <q-list dense style="min-width: 220px">
                  <q-item
                    v-for="opt in paramAddOptions"
                    :key="opt.value"
                    clickable
                    @click="addParam(opt.value)"
                  >
                    <q-item-section>{{ opt.label }}</q-item-section>
                  </q-item>
                </q-list>
              </q-menu>
            </q-btn>
            <div
              v-for="key in activeParamKeys"
              :key="key"
              class="row items-center no-wrap q-col-gutter-sm q-mt-xs"
            >
              <div class="col">
                <div class="text-body2">{{ paramLabel(key) }}</div>
                <div class="text-caption text-grey-6">{{ key }}</div>
              </div>
              <!-- Auto control: always reserve the slot so the value editors stay aligned across rows -->
              <div class="col-auto rb-param-auto">
                <q-btn
                  v-if="paramCanAuto(key)"
                  flat
                  dense
                  round
                  size="sm"
                  :color="isAuto(key) ? ($q.dark.isActive ? 'light-green-13' : 'light-green-9') : 'grey-6'"
                  :icon="isAuto(key) ? 'mdi-refresh-auto' : 'mdi-cursor-pointer'"
                  @click="setAuto(key, !isAuto(key))"
                >
                  <q-tooltip>
                    {{ isAuto(key)
                      ? 'Auto: derived from motion/stops — click to set manually'
                      : 'Manual value — click to auto-derive from motion/stops' }}
                  </q-tooltip>
                </q-btn>
              </div>
              <!-- Value editor: fixed-width slot keeps every row's control in the same column -->
              <div class="col-auto rb-param-value">
                <q-toggle
                  v-if="paramType(key) === 'bool'"
                  :model-value="!!form.options.vehicleParams[key]"
                  :disable="isAuto(key)"
                  dense
                  @update:model-value="(v) => setParamVal(key, v)"
                />
                <q-slider
                  v-else-if="paramType(key) === 'percent'"
                  :model-value="Number(form.options.vehicleParams[key]) || 0"
                  :min="0"
                  :max="100"
                  label
                  dense
                  :disable="isAuto(key)"
                  @update:model-value="(v) => setParamVal(key, v)"
                />
                <q-input
                  v-else
                  type="number"
                  :model-value="form.options.vehicleParams[key]"
                  dense
                  outlined
                  :disable="isAuto(key)"
                  @update:model-value="(v) => setParamVal(key, Number(v))"
                />
              </div>
              <q-btn flat dense round size="sm" icon="mdi-close" @click="removeParam(key)" />
            </div>
          </div>
        </q-expansion-item>

        <q-expansion-item dense label="Extra message parameters (JSON)" class="q-mt-sm">
          <q-input
            v-model="form.options.extraParamsText"
            type="textarea"
            dense
            outlined
            autogrow
            placeholder='{ "engine.ignition.status": true, "battery.voltage": 12.6 }'
            :error="!!extraError"
            :error-message="extraError"
          />
        </q-expansion-item>
      </q-card-section>

      <q-card-actions align="right" class="col-auto">
        <q-btn flat label="Cancel" @click="close" />
        <q-btn id="tour-save" unelevated color="primary" label="Save" @click="save" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script>
import { defineComponent } from 'vue'
import { FORMATS, parseRoute } from '../sim/parsers'
import {
  availableTransports,
  transportDefaults,
  transportFields,
  transportValid,
} from '../sim/transports'
import { buildRoute } from '../sim/geo'
import { sampleRouteParsed } from '../sim/sampleRoute'
import {
  ROUTERS,
  defaultProfile,
  providerNeedsKey,
  fetchRoadRoute,
  routeError,
} from '../sim/routing'
import { useSettingsStore } from '../stores/settings'
import { isTauri, openExternal } from '../platform'
import { logError } from '../log'
import { PARAM_GROUPS, paramByKey, paramLabel as paramLabelOf } from '../sim/vehicleParams'
import RouteBuilderMap from './RouteBuilderMap.vue'
import ProtocolIcon from './ProtocolIcon.vue'
import { runDialogTour, maybeStartDialogTour } from '../tour'

function blankForm() {
  return {
    name: '',
    transport: transportDefaults('device'),
    options: {
      speedKmh: 50,
      sendInterval: 10,
      timeMultiplier: 1,
      satellites: 12,
      loop: false,
      speedMode: 'auto',
      turnDeg: 20,
      vehicleParams: {},
      autoParams: {},
      trafficLights: false,
      extraParamsText: '',
    },
  }
}

export default defineComponent({
  name: 'SimulatorDialog',
  components: { RouteBuilderMap, ProtocolIcon },
  props: {
    modelValue: { type: Boolean, default: false },
    editId: { type: String, default: null },
    editSim: { type: Object, default: null },
  },
  emits: ['update:modelValue', 'save'],
  setup() {
    const settings = useSettingsStore()
    settings.load()
    return { settings }
  },
  data() {
    return {
      form: blankForm(),
      file: null,
      format: 'auto',
      parsed: null,
      parseError: '',
      validated: false, // set on a Save attempt → reveals required-field errors
      formatOptions: FORMATS,
      // road-route builder
      routeMode: 'build', // build | file
      routerProvider: 'osrm',
      routerProfile: 'routed-car',
      waypoints: [],
      dragIndex: null, // waypoint being dragged
      dragOverIndex: null, // waypoint row currently hovered as drop target
      dragOverAfter: false, // true when hovering the lower half (drop below)
      building: false,
      buildError: '',
      buildTimer: null,
    }
  },
  computed: {
    transportOptions() {
      return availableTransports(isTauri).map((t) => ({
        label: t.label,
        value: t.value,
        icon: t.icon,
      }))
    },
    visibleTransportFields() {
      return transportFields(this.form.transport.type).filter(
        (f) => !f.when || f.when(this.form.transport),
      )
    },
    // A browser build served over HTTPS can't POST to a plain-HTTP channel
    // (mixed-content block). The Tauri desktop build uses native HTTP — no limit.
    httpMixedContentWarn() {
      return (
        this.form.transport.type === 'http' &&
        !isTauri &&
        typeof window !== 'undefined' &&
        window.location.protocol === 'https:'
      )
    },
    selectedTransportIcon() {
      const o = this.transportOptions.find((x) => x.value === this.form.transport.type)
      return (o && o.icon) || 'mdi-send'
    },
    maximized() {
      return this.$q.screen.lt.sm
    },
    cardStyle() {
      return this.maximized ? 'width: 100%; max-width: 100%' : 'width: 560px; max-width: 96vw'
    },
    scrollStyle() {
      return this.maximized ? '' : 'max-height: 70vh'
    },
    needsKey() {
      return providerNeedsKey(this.routerProvider)
    },
    keyUrl() {
      return (ROUTERS.find((r) => r.value === this.routerProvider) || {}).keyUrl || '#'
    },
    hasKey() {
      return !!this.settings.keyFor(this.routerProvider)
    },
    routerOptions() {
      // Disable providers whose required API key isn't set (configure in Settings).
      return ROUTERS.map((r) => {
        const blocked = r.needsKey && !this.settings.keyFor(r.value)
        return {
          value: r.value,
          label: blocked ? `${r.label} — no key` : r.label,
          disable: blocked,
        }
      })
    },
    profileOptions() {
      const r = ROUTERS.find((x) => x.value === this.routerProvider)
      return r ? r.profiles.map((p) => ({ label: p.label, value: p.value })) : []
    },
    activeParamKeys() {
      return Object.keys(this.form.options.vehicleParams || {})
    },
    paramAddOptions() {
      const active = new Set(this.activeParamKeys)
      const opts = []
      for (const g of PARAM_GROUPS) {
        for (const p of g.params) {
          if (!active.has(p.key)) opts.push({ label: `${g.label}: ${p.label}`, value: p.key })
        }
      }
      return opts
    },
    distanceKm() {
      if (!this.parsed) return 0
      return (buildRoute(this.parsed.points, { speedKmh: 50 }).totalDistance / 1000).toFixed(2)
    },
    speedModeOptions() {
      return [
        { label: 'Auto — use route data if present', value: 'auto' },
        { label: 'Simulate — natural, slows on turns', value: 'simulate' },
        { label: 'Constant speed', value: 'constant' },
      ]
    },
    routeHasData() {
      return !!(this.parsed && (this.parsed.hasTimes || this.parsed.hasSpeeds))
    },
    usesRouteSpeed() {
      return this.form.options.speedMode === 'auto' && this.routeHasData
    },
    speedModeHint() {
      const mode = this.form.options.speedMode
      if (mode === 'simulate') return 'Realistic profile — brakes for corners, accelerates after'
      if (mode === 'constant') return 'Fixed speed for the whole route'
      // auto
      if (this.parsed && this.parsed.hasTimes) return 'Following route timestamps'
      if (this.parsed && this.parsed.hasSpeeds) return 'Following per-point speed from the route'
      return 'No speed in route — simulating natural driving'
    },
    extraError() {
      const t = (this.form.options.extraParamsText || '').trim()
      if (!t) return ''
      try {
        const v = JSON.parse(t)
        if (typeof v !== 'object' || Array.isArray(v)) return 'Must be a JSON object'
        return ''
      } catch {
        return 'Invalid JSON'
      }
    },
    routeMissing() {
      return this.validated && !this.parsed
    },
  },
  beforeUnmount() {
    if (this.buildTimer) clearTimeout(this.buildTimer)
  },
  watch: {
    modelValue(v) {
      if (v) {
        this.init()
        // Show the dialog tour the first time it's opened.
        maybeStartDialogTour()
      }
    },
    routeMode() {
      // Switching source clears the current route until rebuilt/reloaded.
      this.parsed = null
      this.parseError = ''
      this.buildError = ''
      if (this.routeMode === 'build' && this.waypoints.length >= 2) this.scheduleBuild()
    },
    'form.options.loop'() {
      // Re-route the return leg along roads when toggling loop in build mode.
      if (this.routeMode === 'build' && this.waypoints.length >= 2) this.scheduleBuild()
    },
  },
  methods: {
    showTour() {
      runDialogTour()
    },
    init() {
      // routing builder defaults / remembered prefs
      this.validated = false
      this.routeMode = 'build' // default to building by roads
      this.waypoints = []
      this.building = false
      this.buildError = ''
      this.settings.load()
      this.routerProvider = this.settings.routerProvider || 'osrm'
      // Fall back to a no-key provider if the saved one has no key set.
      if (providerNeedsKey(this.routerProvider) && !this.settings.keyFor(this.routerProvider)) {
        this.routerProvider = 'osrm'
      }
      this.routerProfile = this.settings.routerProfile || defaultProfile(this.routerProvider)
      if (this.editSim) {
        const s = this.editSim
        this.form = {
          name: s.name,
          transport: { ...transportDefaults(s.transport.type), ...s.transport },
          options: {
            ...blankForm().options,
            ...s.options,
            // Clone collections so editing doesn't mutate the live sim before Save.
            vehicleParams: { ...(s.options.vehicleParams || {}) },
            autoParams: { ...(s.options.autoParams || {}) },
            extraParamsText: s.options.extraParams ? JSON.stringify(s.options.extraParams, null, 2) : '',
          },
        }
        this.parsed = {
          points: s.source.points,
          hasTimes: s.source.hasTimes,
          hasSpeeds: s.source.hasSpeeds,
          format: s.source.format,
        }
        this.format = s.source.format || 'auto'
        this.file = null
        this.parseError = ''
        // Restore the road-builder state so editing (and loop re-routing) works.
        if (s.source.build) {
          this.routeMode = 'build'
          this.routerProvider = s.source.build.provider || this.routerProvider
          this.routerProfile = s.source.build.profile || defaultProfile(this.routerProvider)
          this.waypoints = (s.source.build.waypoints || []).map((w) => ({
            lat: w.lat,
            lon: w.lon,
            sec: Math.max(0, Number(w.sec) || 0),
          }))
        } else {
          this.routeMode = 'file' // editing a file-uploaded route
        }
      } else {
        this.form = blankForm()
        this.parsed = null
        this.file = null
        this.format = 'auto'
        this.parseError = ''
      }
    },
    onTransportChange(type) {
      // Reset config to the new transport's defaults, keeping a shared ident.
      const ident = this.form.transport.ident
      const next = transportDefaults(type)
      if ('ident' in next && ident) next.ident = ident
      this.form.transport = next
    },
    async onFile(f) {
      if (!f) return
      try {
        this._lastText = await f.text()
        this._lastName = f.name
        if (!this.form.name) this.form.name = f.name.replace(/\.[^.]+$/, '')
        this.reparse()
      } catch (e) {
        this.parseError = e.message
        this.parsed = null
      }
    },
    reparse() {
      if (!this._lastText) return
      try {
        this.parsed = parseRoute(this._lastName || '', this._lastText, this.format)
        this.parseError = ''
      } catch (e) {
        this.parseError = e.message
        this.parsed = null
      }
    },
    loadSample() {
      this.parsed = sampleRouteParsed()
      this._lastText = null
      this._lastName = 'sample-vilnius'
      this.file = null
      if (!this.form.name) this.form.name = 'Sample device'
    },
    // ---- road-route builder ----
    onProviderChange() {
      this.routerProfile = defaultProfile(this.routerProvider)
      this.settings.setRouterDefaults(this.routerProvider, this.routerProfile)
      this.scheduleBuild()
    },
    onProfileChange() {
      this.settings.setRouterDefaults(this.routerProvider, this.routerProfile)
      this.scheduleBuild()
    },
    openKeyUrl() {
      openExternal(this.keyUrl)
    },
    // ---- vehicle state ----
    paramLabel(key) {
      return paramLabelOf(key)
    },
    paramType(key) {
      const p = paramByKey(key)
      return p ? p.type : 'number'
    },
    // Whether this parameter can be auto-derived (has an "Auto" checkbox).
    paramCanAuto(key) {
      return !!(paramByKey(key) || {}).auto
    },
    isAuto(key) {
      return !!(this.form.options.autoParams || {})[key]
    },
    setAuto(key, v) {
      const next = { ...(this.form.options.autoParams || {}) }
      if (v) next[key] = true
      else delete next[key]
      this.form.options.autoParams = next
    },
    addParam(key) {
      if (!key) return
      const p = paramByKey(key)
      this.form.options.vehicleParams = {
        ...this.form.options.vehicleParams,
        [key]: p ? p.default : 0,
      }
      // The list just got shorter; re-anchor the menu so it stays attached to the button.
      this.$nextTick(() => this.$refs.addMenu?.updatePosition())
    },
    setParamVal(key, v) {
      this.form.options.vehicleParams = { ...this.form.options.vehicleParams, [key]: v }
    },
    removeParam(key) {
      const next = { ...this.form.options.vehicleParams }
      delete next[key]
      this.form.options.vehicleParams = next
      const auto = { ...(this.form.options.autoParams || {}) }
      if (key in auto) {
        delete auto[key]
        this.form.options.autoParams = auto
      }
    },
    // ---- waypoints & stops ----
    addWaypoint(w) {
      // Default to a 1-minute dwell at each placed waypoint (set to 0 to drive through).
      this.waypoints.push({ ...w, sec: 60 })
      this.scheduleBuild()
    },
    moveWaypoint({ index, lat, lon }) {
      if (this.waypoints[index]) {
        this.waypoints.splice(index, 1, { ...this.waypoints[index], lat, lon })
        this.scheduleBuild()
      }
    },
    setWaypointSec(index, v) {
      if (!this.waypoints[index]) return
      const sec = Math.max(0, Number(v) || 0)
      this.waypoints.splice(index, 1, { ...this.waypoints[index], sec })
    },
    // Reorder a waypoint in the list; the route is built through the waypoints in
    // order, so rebuild after moving.
    reorderWaypoint(from, to) {
      if (from == null || to == null || from === to) return
      if (to < 0 || to >= this.waypoints.length) return
      const arr = this.waypoints.slice()
      const [w] = arr.splice(from, 1)
      arr.splice(to, 0, w)
      this.waypoints = arr
      this.scheduleBuild()
    },
    // Up/down arrows (delta -1 / +1).
    moveWaypointOrder(index, delta) {
      this.reorderWaypoint(index, index + delta)
    },
    // Drag-and-drop reordering (handle = the numbered badge).
    onWpDragStart(i, ev) {
      this.dragIndex = i
      if (ev.dataTransfer) {
        ev.dataTransfer.effectAllowed = 'move'
        ev.dataTransfer.setData('text/plain', String(i)) // Firefox needs data set
        // Drag the whole row, not just the grabbed handle.
        const row = ev.currentTarget.closest('.rb-wp-row')
        if (row) ev.dataTransfer.setDragImage(row, 0, row.offsetHeight / 2)
      }
    },
    // Highlight above/below the hovered row depending on which half the cursor is in.
    onWpDragOver(i, ev) {
      const r = ev.currentTarget.getBoundingClientRect()
      this.dragOverIndex = i
      this.dragOverAfter = ev.clientY - r.top > r.height / 2
    },
    onWpDragLeave(i) {
      if (this.dragOverIndex === i) this.dragOverIndex = null
    },
    onWpDrop() {
      const from = this.dragIndex
      let to = this.dragOverIndex
      const after = this.dragOverAfter
      this.dragIndex = null
      this.dragOverIndex = null
      if (from == null || to == null) return
      to += after ? 1 : 0 // insert below the hovered row when in its lower half
      if (from < to) to -= 1 // removing `from` shifts later indices left
      this.reorderWaypoint(from, to)
    },
    onWpDragEnd() {
      this.dragIndex = null
      this.dragOverIndex = null
    },
    // Map each waypoint with a dwell to the nearest built route point and emit
    // engine stops [{ at: 0..1 fraction, sec }]. Build routes carry no inherent
    // time, so injecting dwell here is correct (no double-counting).
    buildStopsFromWaypoints() {
      const pts = this.parsed?.points || []
      const n = pts.length
      if (n < 2) return []
      const stops = []
      for (const w of this.waypoints) {
        const sec = Math.max(0, Number(w.sec) || 0)
        if (sec <= 0) continue
        let best = 0
        let bestD = Infinity
        for (let i = 0; i < n; i++) {
          const d = (pts[i].lat - w.lat) ** 2 + (pts[i].lon - w.lon) ** 2
          if (d < bestD) {
            bestD = d
            best = i
          }
        }
        stops.push({ at: best / (n - 1), sec })
      }
      return stops
    },
    undoWaypoint() {
      this.waypoints.pop()
      this.scheduleBuild()
    },
    clearWaypoints() {
      this.waypoints = []
      this.parsed = null
      this.buildError = ''
    },
    scheduleBuild() {
      if (this.buildTimer) clearTimeout(this.buildTimer)
      this.buildTimer = setTimeout(() => this.doBuild(), 450)
    },
    async doBuild() {
      if (this.routeMode !== 'build') return
      if (this.waypoints.length < 2) {
        this.parsed = null
        this.buildError = ''
        return
      }
      this.building = true
      this.buildError = ''
      try {
        const opts = {
          provider: this.routerProvider,
          profile: this.routerProfile,
          apiKey: this.settings.keyFor(this.routerProvider),
        }
        const res = await fetchRoadRoute({ ...opts, waypoints: this.waypoints })
        let points = res.points
        // Loop: route the return leg (last -> first) along roads so the loop closes nicely.
        if (this.form.options.loop && this.waypoints.length >= 2) {
          const first = this.waypoints[0]
          const last = this.waypoints[this.waypoints.length - 1]
          try {
            const back = await fetchRoadRoute({ ...opts, waypoints: [last, first] })
            // drop the first coord of the return leg (duplicates the current end)
            points = points.concat(back.points.slice(1))
          } catch {
            // Return leg failed — keep the open route; the engine will straight-close it.
            this.buildError = 'Return leg not routed; loop will close with a straight line'
          }
        }
        this.parsed = { format: 'geojson', points, hasTimes: false, hasSpeeds: false }
      } catch (e) {
        this.parsed = null
        this.buildError = routeError(e, 'Routing failed')
        logError('route', `${this.routerProvider}/${this.routerProfile}: ${this.buildError}`)
      } finally {
        this.building = false
      }
    },
    // A visible required transport field that's still empty (only flags after a
    // Save attempt, then clears reactively as the user fills it).
    fieldInvalid(f) {
      if (!this.validated || !f || !f.required) return false
      if (f.when && !f.when(this.form.transport)) return false
      const v = this.form.transport[f.key]
      return v === undefined || v === null || String(v).trim() === ''
    },
    save() {
      // Reveal which requirement is unmet instead of a silently-disabled button.
      this.validated = true
      if (!this.parsed) {
        this.$q.notify({
          type: 'warning',
          message: 'Add a route first — upload a file or build one by roads.',
        })
        return
      }
      if (this.extraError) {
        this.$q.notify({ type: 'warning', message: `Extra params: ${this.extraError}` })
        return
      }
      if (!transportValid(this.form.transport)) {
        this.$q.notify({ type: 'warning', message: 'Fill the highlighted required fields (*).' })
        return
      }
      const extra = (this.form.options.extraParamsText || '').trim()
      const def = {
        name: this.form.name,
        source: {
          format: this.parsed.format,
          fileName:
            this.routeMode === 'build'
              ? `roads · ${this.routerProvider}/${this.routerProfile}`
              : this._lastName || '',
          points: this.parsed.points,
          hasTimes: this.parsed.hasTimes,
          hasSpeeds: this.parsed.hasSpeeds,
          // Keep waypoints + provider so editing / loop re-routing works later.
          build:
            this.routeMode === 'build'
              ? {
                  provider: this.routerProvider,
                  profile: this.routerProfile,
                  waypoints: this.waypoints.map((w) => ({
                    lat: w.lat,
                    lon: w.lon,
                    sec: Math.max(0, Number(w.sec) || 0),
                  })),
                }
              : undefined,
        },
        transport: { ...this.form.transport },
        options: {
          speedKmh: Number(this.form.options.speedKmh) || 50,
          sendInterval: Math.max(1, Number(this.form.options.sendInterval) || 10),
          timeMultiplier: Number(this.form.options.timeMultiplier) || 1,
          satellites: Number(this.form.options.satellites) || 12,
          loop: !!this.form.options.loop,
          speedMode: this.form.options.speedMode || 'auto',
          turnDeg: Math.max(0, Number(this.form.options.turnDeg) || 0),
          vehicleParams: { ...(this.form.options.vehicleParams || {}) },
          // Only keep auto flags for parameters that are still present.
          autoParams: Object.fromEntries(
            Object.keys(this.form.options.vehicleParams || {})
              .filter((k) => this.isAuto(k))
              .map((k) => [k, true]),
          ),
          // Build mode: dwell at the waypoints you placed. File mode: stops are
          // auto-detected from the route's own timestamps by the engine.
          stops: this.routeMode === 'build' ? this.buildStopsFromWaypoints() : [],
          trafficLights: !!this.form.options.trafficLights,
          extraParams: extra ? JSON.parse(extra) : null,
        },
      }
      this.$emit('save', { id: this.editId, def })
      this.close()
    },
    close() {
      this.$emit('update:modelValue', false)
    },
  },
})
</script>

<style scoped>
.rb-wp-badge {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #1e88e5;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}
/* Drag-to-reorder for stops: the numbered badge is the handle. */
.rb-wp-handle {
  cursor: grab;
}
.rb-wp-handle:active {
  cursor: grabbing;
}
.rb-wp-row {
  transition: opacity 0.15s;
}
.rb-wp-row.rb-wp-dragging {
  opacity: 0.4;
}
.rb-wp-row.rb-wp-drop-before {
  box-shadow: inset 0 2px 0 var(--q-primary);
}
.rb-wp-row.rb-wp-drop-after {
  box-shadow: inset 0 -2px 0 var(--q-primary);
}
/* Fixed slots so the Auto button and value editor line up across every parameter row. */
.rb-param-auto {
  width: 36px;
  display: flex;
  justify-content: center;
}
.rb-param-value {
  width: 120px;
  display: flex;
  justify-content: flex-end;
}
.rb-param-value > * {
  width: 100%;
}
.rb-param-value > .q-toggle {
  width: auto;
}
/* Route mode toggle: neutral track (theme-agnostic), active segment filled primary,
   inactive segments use the normal theme text colour (readable in light and dark). */
.rb-route-toggle {
  border-radius: 6px;
  background: rgba(128, 128, 128, 0.14);
}
/* "Off" state: a diagonal slash across the traffic-light avatar (no crossed icon in MDI). */
.rb-tl-off {
  position: relative;
}
.rb-tl-off::after {
  content: '';
  position: absolute;
  inset: 0;
  margin: auto;
  width: 2px;
  height: 132%;
  border-radius: 2px;
  background: #c10015;
  transform: rotate(45deg);
}
</style>
