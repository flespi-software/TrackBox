<template>
  <q-footer
    v-if="modelValue"
    class="log-panel"
    :class="{ dragging }"
    :style="{ height: height + 'px' }"
  >
    <!-- Drag the top edge to resize (up to 50% of the viewport). -->
    <div class="log-resize" @mousedown.prevent="startDrag" />

    <div class="log-toolbar row items-center no-wrap q-px-sm">
      <q-icon name="mdi-text-box-search-outline" size="18px" class="q-mr-xs" />
      <span class="text-weight-medium">Logs</span>
      <q-badge color="grey-6" class="q-ml-xs">{{ logState.entries.length }}/200</q-badge>
      <q-space />
      <q-btn-toggle
        v-model="filter"
        dense
        unelevated
        no-caps
        size="sm"
        toggle-color="primary"
        :options="filterOptions"
        class="q-mr-sm"
      />
      <q-btn flat dense round size="sm" icon="mdi-content-copy" @click="copy">
        <q-tooltip>Copy</q-tooltip>
      </q-btn>
      <q-btn flat dense round size="sm" icon="mdi-delete-sweep" @click="clear">
        <q-tooltip>Clear</q-tooltip>
      </q-btn>
      <q-btn flat dense round size="sm" icon="mdi-close" @click="close">
        <q-tooltip>Close</q-tooltip>
      </q-btn>
    </div>

    <div class="log-body">
      <div v-if="!shown.length" class="text-grey-6 q-pa-sm">
        No log entries{{ filter === 'all' ? ' yet' : ' at this level' }}.
      </div>
      <div
        v-for="e in shown"
        :key="e.id"
        class="log-row row no-wrap items-baseline"
        :class="rowClass(e.level)"
      >
        <span class="log-time">{{ fmt(e.t) }}</span>
        <span class="log-level" :class="levelClass(e.level)">{{ e.level.toUpperCase() }}</span>
        <span v-if="e.src" class="log-src">{{ e.src }}</span>
        <span class="log-msg">{{ e.msg }}</span>
      </div>
    </div>
  </q-footer>
</template>

<script>
import { defineComponent } from 'vue'
import { copyToClipboard } from 'quasar'
import { logState, clearLogs, logsToText } from '../log'

// Remembered across opens within the session.
let savedHeight = 120

export default defineComponent({
  name: 'LogViewer',
  props: {
    modelValue: { type: Boolean, default: false },
  },
  emits: ['update:modelValue'],
  data() {
    return {
      logState,
      filter: 'all',
      filterOptions: [
        { label: 'All', value: 'all' },
        { label: 'Info', value: 'info' },
        { label: 'Warn', value: 'warn' },
        { label: 'Err', value: 'error' },
      ],
      height: savedHeight,
      minHeight: 84, // toolbar + ~1 line
      dragging: false,
    }
  },
  computed: {
    shown() {
      const list =
        this.filter === 'all'
          ? logState.entries
          : logState.entries.filter((e) => e.level === this.filter)
      // Newest first for quick scanning.
      return [...list].reverse()
    },
  },
  mounted() {
    this.syncLayoutVar()
  },
  beforeUnmount() {
    this.endDrag()
    document.documentElement.style.setProperty('--log-h', '0px')
  },
  watch: {
    modelValue() {
      this.syncLayoutVar()
    },
    height() {
      this.syncLayoutVar()
    },
  },
  methods: {
    // Publish the open panel height so the page can shrink by exactly that much
    // (the layout offsets the page-container; the page's own fixed height must too).
    syncLayoutVar() {
      const h = this.modelValue ? this.height : 0
      document.documentElement.style.setProperty('--log-h', h + 'px')
    },
    fmt(t) {
      return new Date(t).toLocaleTimeString()
    },
    levelClass(level) {
      return {
        error: 'text-negative',
        warn: 'text-warning',
        info: 'text-primary',
        debug: 'text-grey-6',
      }[level]
    },
    rowClass(level) {
      return level === 'error' ? 'log-row-error' : ''
    },
    startDrag(e) {
      this.dragging = true
      this._startY = e.clientY
      this._startH = this.height
      window.addEventListener('mousemove', this.onDrag)
      window.addEventListener('mouseup', this.endDrag)
    },
    onDrag(e) {
      const dy = this._startY - e.clientY // drag up → taller
      const max = Math.round(window.innerHeight * 0.5)
      this.height = Math.min(max, Math.max(this.minHeight, this._startH + dy))
    },
    endDrag() {
      if (!this.dragging) return
      this.dragging = false
      savedHeight = this.height
      window.removeEventListener('mousemove', this.onDrag)
      window.removeEventListener('mouseup', this.endDrag)
    },
    async copy() {
      try {
        await copyToClipboard(logsToText())
        this.$q.notify({ message: 'Logs copied', icon: 'mdi-content-copy', timeout: 1200 })
      } catch {
        this.$q.notify({ type: 'negative', message: 'Copy failed' })
      }
    },
    clear() {
      clearLogs()
    },
    close() {
      this.$emit('update:modelValue', false)
    },
  },
})
</script>

<style scoped>
.log-panel {
  display: flex;
  flex-direction: column;
  padding: 0;
  border-top: 1px solid rgba(128, 128, 128, 0.35);
  box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.18);
}
/* Override q-footer's default primary background/text. */
.body--light .log-panel {
  background: #fff;
  color: rgba(0, 0, 0, 0.82);
}
.body--dark .log-panel {
  background: #1d1d1d;
  color: #fff;
}
.log-panel.dragging {
  user-select: none;
}
.log-resize {
  position: absolute;
  top: -3px;
  left: 0;
  right: 0;
  height: 7px;
  cursor: ns-resize;
  z-index: 1;
}
.log-resize:hover {
  background: rgba(128, 128, 128, 0.25);
}
.log-toolbar {
  flex: 0 0 auto;
  height: 36px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.2);
}
.log-body {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 2px 8px 6px;
}
.log-row {
  font-family: 'Roboto Mono', monospace;
  font-size: 12px;
  line-height: 1.5;
  gap: 8px;
  padding: 0 0;
  white-space: pre-wrap;
  word-break: break-word;
}
.log-row-error {
  background: rgba(193, 0, 21, 0.07);
  border-radius: 3px;
}
.log-time {
  flex: 0 0 auto;
  opacity: 0.6;
}
.log-level {
  flex: 0 0 42px;
  font-weight: 700;
}
.log-src {
  flex: 0 0 auto;
  opacity: 0.7;
}
.log-msg {
  flex: 1 1 auto;
}
</style>
