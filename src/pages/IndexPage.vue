<template>
  <q-page class="sim-page">
    <!-- Desktop: list left / map right (row-reverse keeps map DOM-first).
         Mobile: map on top, list below (column). -->
    <div class="sim-body" :class="mobile ? 'is-mobile' : 'is-desktop'">
      <div class="sim-map-col" :class="mobile ? 'm-map' : 'd-map'">
        <SimMap ref="map" :simulators="simulators" />
      </div>
      <div class="sim-list" :class="mobile ? 'm-list' : 'd-list'">
        <!-- Toolbar sits only above the simulator list, not over the map. -->
        <div class="sim-toolbar row items-center wrap q-gutter-sm q-px-sm q-py-sm">
          <q-btn
            id="tour-add"
            color="primary"
            unelevated
            dense
            :padding="mobile ? undefined : 'xs sm'"
            icon="mdi-plus"
            :label="mobile ? undefined : 'Add'"
            :round="mobile"
            no-caps
            @click="openCreate"
          >
            <q-tooltip>Add simulator</q-tooltip>
          </q-btn>
          <q-space />
          <!-- Affected-count label, to the left of the combined control. -->
          <span v-if="playPauseCount" class="text-caption text-grey-7 q-mr-xs">
            {{ playPauseLabel }}
          </span>
          <!-- Combined play/pause-all + stop control. -->
          <q-btn-group unelevated>
            <q-btn
              id="tour-startall"
              unelevated
              dense
              :padding="mobile ? 'xs' : 'xs sm'"
              :color="store.runningCount ? 'orange' : 'positive'"
              :icon="store.runningCount ? 'mdi-pause' : 'mdi-play'"
              :disable="!simulators.length"
              @click="store.playPauseAll"
            >
              <q-tooltip>{{ playPauseTip }}</q-tooltip>
            </q-btn>
            <q-btn
              unelevated
              dense
              color="grey-8"
              :padding="mobile ? 'xs' : 'xs sm'"
              icon="mdi-stop"
              :disable="!store.runningCount && !store.pausedCount"
              @click="confirmStopAll"
            >
              <q-tooltip>Stop all (resets to start)</q-tooltip>
            </q-btn>
          </q-btn-group>
        </div>
        <q-scroll-area class="sim-list-scroll" :thumb-style="thumbStyle" :bar-style="barStyle">
          <div class="q-pa-sm">
            <div v-if="!simulators.length" class="text-center text-grey-6 q-pa-lg">
              <q-icon name="mdi-map-marker-radius-outline" size="48px" class="q-mb-sm" />
              <div>No simulators yet.</div>
              <div class="text-caption">Click “Add simulator” and upload a route.</div>
            </div>
            <SimulatorCard
              v-for="sim in simulators"
              :key="sim.id"
              :sim="sim"
              @edit="openEdit"
            />
          </div>
        </q-scroll-area>
      </div>
    </div>

    <SimulatorDialog
      v-model="dialog"
      :edit-id="editId"
      :edit-sim="editSim"
      @save="onSave"
    />
  </q-page>
</template>

<script>
import { defineComponent } from 'vue'
import { mapState } from 'pinia'
import { useAuthStore } from '../stores/auth'
import { useSimulatorsStore } from '../stores/simulators'
import SimulatorCard from '../components/SimulatorCard.vue'
import SimulatorDialog from '../components/SimulatorDialog.vue'
import SimMap from '../components/SimMap.vue'

export default defineComponent({
  name: 'IndexPage',
  components: { SimulatorCard, SimulatorDialog, SimMap },
  setup() {
    const store = useSimulatorsStore()
    store.load()
    return { store }
  },
  data() {
    return {
      dialog: false,
      editId: null,
      // QScrollArea renders its own thumb — neutral grey works in both themes.
      thumbStyle: {
        right: '2px',
        borderRadius: '8px',
        backgroundColor: 'rgba(128, 128, 128, 0.55)',
        width: '6px',
        opacity: '0.75',
      },
      barStyle: {
        right: '1px',
        borderRadius: '8px',
        backgroundColor: 'transparent',
        width: '9px',
      },
    }
  },
  mounted() {
    // Already connected (e.g. session-restored token) — pull cloud-backed sims now.
    if (this.socketConnected) this.store.subscribeCloud()
  },
  watch: {
    socketConnected(val) {
      if (val) this.store.subscribeCloud()
      else this.store.markCloudDisconnected()
    },
    mobile() {
      // Layout changed (orientation / resize) — let Leaflet remeasure.
      this.$nextTick(() => this.$refs.map && this.$refs.map.invalidate())
    },
  },
  computed: {
    ...mapState(useAuthStore, {
      socketConnected: (s) => s.socketConnected,
    }),
    simulators() {
      return this.store.simulators
    },
    editSim() {
      return this.editId ? this.store.byId(this.editId) : null
    },
    mobile() {
      return this.$q.screen.lt.md
    },
    playPauseTip() {
      if (this.store.runningCount) return 'Pause all (keeps positions)'
      if (this.store.pausedCount) return 'Resume paused'
      return 'Start all'
    },
    // How many sims the play/pause click affects right now.
    playPauseCount() {
      if (this.store.runningCount) return this.store.runningCount
      if (this.store.pausedCount) return this.store.pausedCount
      return this.simulators.length
    },
    // Show "x/y" when only some sims are affected, just "x" when all are.
    playPauseBadge() {
      const n = this.playPauseCount
      const total = this.simulators.length
      return n < total ? `${n}/${total}` : `${n}`
    },
    // Count + matching status word, e.g. "2/3 running" / "1 paused" / "3 idle".
    playPauseLabel() {
      const word = this.store.runningCount
        ? 'running'
        : this.store.pausedCount
          ? 'paused'
          : 'idle'
      return `${this.playPauseBadge} ${word}`
    },
  },
  methods: {
    openCreate() {
      this.editId = null
      this.dialog = true
    },
    openEdit(id) {
      this.editId = id
      this.dialog = true
    },
    onSave({ id, def }) {
      if (id) this.store.updateSimulator(id, def)
      else this.store.addSimulator(def)
      this.$nextTick(() => this.$refs.map && this.$refs.map.invalidate())
    },
    confirmStopAll() {
      const active = this.simulators.filter(
        (s) => s.runtime.status === 'running' || s.runtime.status === 'paused',
      ).length
      if (!active) {
        this.store.stopAll()
        return
      }
      this.$q
        .dialog({
          title: 'Stop all',
          message:
            `Stop ${active} active simulator${active > 1 ? 's' : ''}? This resets them — ` +
            `playback restarts from the beginning. Use Pause all to keep positions.`,
          cancel: true,
          ok: { label: 'Stop all', color: 'negative' },
          persistent: true,
        })
        .onOk(() => this.store.stopAll())
    },
  },
})
</script>

<style scoped>
.sim-page {
  display: flex;
  flex-direction: column;
  /* minus app header, minus the docked log panel (0 when closed) */
  height: calc(100vh - 50px - var(--log-h, 0px));
}
.sim-toolbar {
  flex: 0 0 auto;
  border-bottom: 1px solid rgba(128, 128, 128, 0.2);
}
.sim-body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
}
/* Desktop: list on the left, map on the right (map is DOM-first → row-reverse). */
.sim-body.is-desktop {
  flex-direction: row-reverse;
}
/* Mobile: map on top, list below. */
.sim-body.is-mobile {
  flex-direction: column;
}

/* Both columns clip their content so neither can overlap the other on resize. */
.sim-map-col,
.sim-list {
  position: relative;
  overflow: hidden;
  min-width: 0;
  min-height: 0;
}
/* The list column stacks its own toolbar above the scrolling cards. */
.sim-list {
  display: flex;
  flex-direction: column;
}
.sim-list-scroll {
  flex: 1 1 auto;
  min-height: 0;
}

.d-map {
  flex: 1 1 auto;
}
.d-list {
  flex: 0 0 380px;
  max-width: 50vw;
  border-right: 1px solid rgba(128, 128, 128, 0.2);
}

.m-map {
  flex: 0 0 45vh;
}
.m-list {
  flex: 1 1 auto;
  border-top: 1px solid rgba(128, 128, 128, 0.2);
}
</style>
