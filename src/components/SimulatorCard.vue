<template>
  <q-card flat bordered class="sim-card q-mb-sm">
    <q-card-section class="q-pb-xs">
      <div class="row items-center no-wrap">
        <q-icon name="mdi-circle" :style="{ color: sim.color }" size="14px" class="q-mr-sm cursor-pointer">
          <q-tooltip>Change track color</q-tooltip>
          <q-popup-proxy transition-show="scale" transition-hide="scale">
            <q-color
              :model-value="sim.color"
              no-header
              no-footer
              default-view="palette"
              :palette="palette"
              @update:model-value="(c) => store.setColor(sim.id, c)"
            />
          </q-popup-proxy>
        </q-icon>
        <div class="text-subtitle1 ellipsis">{{ sim.name }}</div>
        <q-space />
        <q-chip dense square :color="statusColor" text-color="white" class="q-ml-sm">
          {{ sim.runtime.status }}
        </q-chip>
        <q-btn
          v-if="sim.runtime.status !== 'running'"
          dense
          flat
          round
          size="sm"
          color="positive"
          icon="mdi-play"
          :disable="loginBlocked"
          @click="store.start(sim.id)"
        >
          <q-tooltip>
            {{ loginBlocked ? 'Login required' : sim.runtime.status === 'paused' ? 'Resume' : 'Start' }}
          </q-tooltip>
        </q-btn>
        <q-btn
          v-else
          dense
          flat
          round
          size="sm"
          color="orange"
          icon="mdi-pause"
          @click="store.pause(sim.id)"
        >
          <q-tooltip>Pause</q-tooltip>
        </q-btn>
        <q-btn
          dense
          flat
          round
          size="sm"
          color="grey-7"
          icon="mdi-stop"
          :disable="sim.runtime.status === 'idle'"
          @click="confirmStop"
        >
          <q-tooltip>Stop / reset</q-tooltip>
        </q-btn>
        <q-btn dense flat round size="sm" color="grey-7" icon="mdi-dots-vertical">
          <q-tooltip>More</q-tooltip>
          <q-menu auto-close anchor="bottom right" self="top right" class="sim-menu">
            <q-list dense>
              <q-item clickable v-close-popup @click="$emit('edit', sim.id)">
                <q-item-section side>
                  <q-icon name="mdi-pencil-outline" size="18px" />
                </q-item-section>
                <q-item-section>Edit</q-item-section>
              </q-item>
              <q-separator />
              <q-item clickable v-close-popup class="text-negative" @click="confirmDelete">
                <q-item-section side>
                  <q-icon name="mdi-delete-outline" size="18px" color="negative" />
                </q-item-section>
                <q-item-section>Delete</q-item-section>
              </q-item>
            </q-list>
          </q-menu>
        </q-btn>
      </div>
      <div class="text-caption text-grey-6 ellipsis">
        <ProtocolIcon :icon="transportIcon" size="14px" /> {{ summary }}
      </div>
      <div v-if="loginBlocked" class="text-caption text-negative q-mt-xs">
        <q-icon name="mdi-login-variant" size="14px" /> Login required for this transport
      </div>
    </q-card-section>

    <q-card-section class="q-py-none">
      <q-linear-progress
        :value="sim.runtime.progress"
        :color="sim.color ? undefined : 'primary'"
        track-color="grey-3"
        size="6px"
        rounded
        :style="{ color: sim.color }"
      />
      <div class="row q-mt-xs text-caption text-grey-7">
        <div class="col">{{ (sim.runtime.progress * 100).toFixed(0) }}%</div>
        <div class="col text-center">{{ sim.runtime.speed.toFixed(0) }} km/h</div>
        <div class="col text-right">{{ (sim.runtime.distance / 1000).toFixed(2) }} km</div>
      </div>
      <!-- Always render this row (placeholder when idle) so the card height
           doesn't jump once coordinates start coming in. -->
      <div class="text-caption text-grey-6 q-mt-xs">
        <template v-if="sim.runtime.position">
          {{ sim.runtime.position.lat.toFixed(5) }}, {{ sim.runtime.position.lon.toFixed(5) }}
        </template>
        <template v-else>&nbsp;</template>
      </div>
    </q-card-section>

    <div v-if="sim.runtime.lastError" class="q-px-md q-pb-xs">
      <q-banner dense class="bg-red-1 text-red-9 rounded-borders text-caption">
        <template #avatar><q-icon name="mdi-alert" color="red" /></template>
        {{ sim.runtime.lastError }}
      </q-banner>
    </div>

    <!-- Collapsed actions (always visible): sent count · sync · visibility · expand -->
    <q-card-actions align="between" class="q-pt-none">
      <div class="text-caption text-grey-6">
        <q-icon name="mdi-upload" size="14px" /> {{ sim.runtime.sentCount }}
        <span v-if="sim.runtime.lastSentAt"> · {{ ago }}</span>
      </div>
      <div>
        <q-btn
          v-if="token"
          dense
          flat
          round
          :icon="sim.cloudSync ? 'mdi-cloud-check' : 'mdi-cloud-off-outline'"
          :color="sim.cloudSync ? 'light-green-7' : 'grey-6'"
          @click="store.setSimCloud(sim.id, !sim.cloudSync)"
        >
          <q-tooltip>
            {{ sim.cloudSync
              ? 'Synced to cloud — click to keep this flow local only'
              : 'Local only — click to sync this flow to the cloud' }}
          </q-tooltip>
        </q-btn>
        <q-btn
          dense
          flat
          round
          :icon="sim.hideTrack ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
          :color="sim.hideTrack ? 'grey-6' : 'grey-7'"
          @click="store.toggleTrack(sim.id)"
        >
          <q-tooltip>{{ sim.hideTrack ? 'Show on map' : 'Hide on map' }}</q-tooltip>
        </q-btn>
        <q-btn
          dense
          flat
          round
          color="grey-7"
          :icon="expanded ? 'mdi-chevron-up' : 'mdi-chevron-down'"
          @click="expanded = !expanded"
        >
          <q-tooltip>{{ expanded ? 'Less' : 'More' }}</q-tooltip>
        </q-btn>
      </div>
    </q-card-actions>

    <!-- Expanded: live speed, sent parameters, edit / delete -->
    <q-slide-transition>
      <div v-show="expanded">
        <q-separator />

        <!-- Live speed control -->
        <q-card-section class="q-py-sm">
          <div class="row items-center no-wrap">
            <div class="text-caption text-grey-7 q-mr-sm" style="width: 64px">
              {{ usesRouteSpeed ? 'Speed ×' : 'km/h' }}
            </div>
            <q-slider
              v-if="usesRouteSpeed"
              :model-value="sim.options.timeMultiplier"
              :min="0.5"
              :max="50"
              :step="0.5"
              dense
              label
              :label-value="sim.options.timeMultiplier + '×'"
              @update:model-value="(v) => store.setTimeMultiplier(sim.id, v)"
            />
            <q-slider
              v-else
              :model-value="sim.options.speedKmh"
              :min="5"
              :max="200"
              :step="5"
              dense
              label
              @update:model-value="(v) => store.setSpeed(sim.id, v)"
            />
          </div>
        </q-card-section>

        <!-- Sent vehicle-state parameters (doors, seatbelt, pedals, …) -->
        <q-card-section v-if="boolParams.length" class="q-py-none q-pb-sm">
          <div class="text-caption text-grey-6 q-mb-xs">Sent parameters</div>
          <div class="row items-center q-gutter-xs">
            <q-chip
              v-for="key in boolParams"
              :key="key"
              dense
              clickable
              :icon="chipValue(key) ? 'mdi-check-circle' : 'mdi-circle-outline'"
              :color="chipValue(key) ? 'primary' : 'grey-7'"
              text-color="white"
              @click="toggleParam(key)"
            >
              {{ paramLabel(key) }}
            </q-chip>
          </div>
        </q-card-section>
      </div>
    </q-slide-transition>
  </q-card>
</template>

<script>
import { defineComponent } from 'vue'
import { mapState } from 'pinia'
import { useSimulatorsStore } from '../stores/simulators'
import { useAuthStore } from '../stores/auth'
import { transportSummary, TRANSPORTS } from '../sim/transports'
import { paramByKey, paramLabel as paramLabelOf } from '../sim/vehicleParams'
import ProtocolIcon from './ProtocolIcon.vue'

export default defineComponent({
  name: 'SimulatorCard',
  props: {
    sim: { type: Object, required: true },
  },
  emits: ['edit'],
  components: { ProtocolIcon },
  setup() {
    return { store: useSimulatorsStore() }
  },
  data() {
    return {
      now: Date.now(),
      timerId: null,
      expanded: false,
      // Same swatches the store assigns from, plus extras — 20 fills the picker grid.
      palette: [
        '#e53935', '#1e88e5', '#43a047', '#fb8c00', '#8e24aa',
        '#00acc1', '#fdd835', '#6d4c41', '#3949ab', '#d81b60',
        '#00897b', '#7cb342', '#f4511e', '#5e35b1', '#546e7a',
        '#c0ca33', '#26c6da', '#ab47bc', '#ff7043', '#789262',
      ],
    }
  },
  mounted() {
    this.timerId = setInterval(() => {
      this.now = Date.now()
    }, 1000)
  },
  beforeUnmount() {
    if (this.timerId) clearInterval(this.timerId)
  },
  computed: {
    ...mapState(useAuthStore, { token: (s) => s.token }),
    loginBlocked() {
      return this.store.transportNeedsLogin(this.sim.transport.type) && !this.token
    },
    summary() {
      return transportSummary(this.sim.transport)
    },
    transportIcon() {
      return (TRANSPORTS.find((t) => t.value === this.sim.transport.type) || {}).icon || 'mdi-send'
    },
    usesRouteSpeed() {
      // Playback follows route-derived speed (timestamps or per-point speed) only
      // in 'auto' mode; 'simulate'/'constant' use the cruise/fixed speed slider.
      if (this.sim.options.speedMode !== 'auto') return false
      return !!(this.sim.source.hasTimes || this.sim.source.hasSpeeds)
    },
    statusColor() {
      return (
        {
          running: 'positive',
          paused: 'orange',
          done: 'blue-grey',
          idle: 'grey',
        }[this.sim.runtime.status] || 'grey'
      )
    },
    ago() {
      const s = Math.max(0, Math.round((this.now - this.sim.runtime.lastSentAt) / 1000))
      return s < 60 ? `${s}s ago` : `${Math.round(s / 60)}m ago`
    },
    boolParams() {
      return Object.keys(this.sim.options.vehicleParams || {}).filter(
        (k) => (paramByKey(k) || {}).type === 'bool',
      )
    },
  },
  methods: {
    paramLabel(key) {
      return paramLabelOf(key)
    },
    // Show the live override if set, else the actual last-sent value (auto wins
    // over the configured one), else the configured value before the first send.
    chipValue(key) {
      const ov = this.sim.runtime.overrides
      if (ov && key in ov) return !!ov[key]
      const ls = this.sim.runtime.lastSent
      if (ls && key in ls) return !!ls[key]
      return !!this.sim.options.vehicleParams[key]
    },
    // Clicking a chip is a live manual override — wins over auto, so any param
    // (even an automatic one) can be flipped by hand while simulating.
    toggleParam(key) {
      this.store.setManualOverride(this.sim.id, key, !this.chipValue(key))
    },
    confirmStop() {
      const st = this.sim.runtime.status
      // Only worth confirming while there's live progress to lose.
      if (st !== 'running' && st !== 'paused') {
        this.store.stop(this.sim.id)
        return
      }
      this.$q
        .dialog({
          title: 'Stop simulator',
          message:
            `Stop "${this.sim.name}"? This resets it — playback will restart from the ` +
            `beginning. Use pause instead to keep the current position.`,
          cancel: true,
          ok: { label: 'Stop', color: 'negative' },
          persistent: true,
        })
        .onOk(() => this.store.stop(this.sim.id))
    },
    confirmDelete() {
      this.$q
        .dialog({
          title: 'Delete simulator',
          message: `Remove "${this.sim.name}"?`,
          cancel: true,
          persistent: true,
        })
        .onOk(() => this.store.removeSimulator(this.sim.id))
    },
  },
})
</script>

<style scoped>
.sim-card {
  border-radius: 10px;
}
</style>

<!-- Not scoped: q-menu is teleported to <body>, so scoped styles wouldn't reach it. -->
<style>
.sim-menu {
  border-radius: 8px;
}
.sim-menu .q-list {
  min-width: 136px;
  padding: 4px 0;
}
.sim-menu .q-item {
  min-height: 36px;
  border-radius: 6px;
  margin: 0 4px;
}
</style>
