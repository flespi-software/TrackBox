<template>
  <div class="column">
    <div class="col scroll scroll-area">
      <!-- Connection: login + MQTT status in one compact card -->
      <q-card flat bordered class="drawer-card q-ma-sm">
        <q-card-section class="row items-center no-wrap q-pa-sm">
          <q-icon
            :name="token ? 'mdi-key' : 'mdi-key-off'"
            :color="token ? 'positive' : 'grey'"
            size="sm"
            class="q-mr-sm"
          />
          <div class="col">
            <div class="text-body2">{{ token ? 'Logged in' : 'Not logged in' }}</div>
            <div v-if="token" class="text-caption text-grey-6">
              MQTT {{ socketConnected ? 'connected' : 'connecting…' }}
            </div>
          </div>
          <q-icon
            v-if="token"
            :name="socketConnected ? 'mdi-lan-connect' : 'mdi-lan-pending'"
            :color="socketConnected ? 'positive' : 'orange'"
            size="sm"
          >
            <q-tooltip>MQTT {{ socketConnected ? 'connected' : 'connecting…' }}</q-tooltip>
          </q-icon>
        </q-card-section>
      </q-card>

      <!-- Vault locked warning (desktop) -->
      <q-banner v-if="vaultLocked" dense class="bg-amber-2 text-amber-10 q-mx-sm rounded-borders">
        <template #avatar><q-icon name="mdi-shield-off-outline" color="amber-9" /></template>
        Secret vault is locked — login and API keys won't be saved.
        <template #action>
          <q-btn flat dense no-caps label="Unlock" @click="$emit('unlock-vault')" />
        </template>
      </q-banner>

      <!-- Fleet summary -->
      <q-card flat bordered class="drawer-card q-ma-sm">
        <q-card-section class="q-pa-sm">
          <div class="text-caption text-grey-6 q-mb-xs">Fleet</div>
          <div class="row items-center fleet-row">
            <div class="col">Simulators</div>
            <span class="stat">{{ sims.length }}</span>
          </div>
          <div class="row items-center fleet-row">
            <div class="col">Running</div>
            <span class="stat" :class="{ 'text-positive': running > 0 }">{{ running }}</span>
          </div>
          <div class="row items-center fleet-row">
            <div class="col">Messages sent</div>
            <span class="stat">{{ totalSent }}</span>
          </div>
          <div class="row items-center fleet-row">
            <div class="col">Distance</div>
            <span class="stat">{{ totalKm }} km</span>
          </div>
          <div class="row items-center fleet-row" :class="{ 'text-negative': errors > 0 }">
            <div class="col">Errors</div>
            <span class="stat">{{ errors }}</span>
          </div>
        </q-card-section>
      </q-card>

    </div>

    <!-- Footer: settings, then copyright pinned to the very bottom edge -->
    <div class="drawer-bottom">
      <q-separator />
      <q-item clickable @click="$emit('open-settings')">
        <q-item-section avatar><q-icon name="mdi-cog-outline" /></q-item-section>
        <q-item-section>Settings</q-item-section>
      </q-item>
      <q-separator />
      <div class="text-caption text-grey-6 text-right q-px-md q-py-xs">
        © flespi ·
        <a class="licenses-link" @click="$emit('open-licenses')">MIT license</a>
      </div>
    </div>
  </div>
</template>

<script>
import { defineComponent } from 'vue'
import { mapState } from 'pinia'
import { useAuthStore } from '../stores/auth'
import { useSimulatorsStore } from '../stores/simulators'

export default defineComponent({
  name: 'DrawerContent',
  props: {
    vaultLocked: { type: Boolean, default: false },
  },
  emits: ['open-settings', 'unlock-vault', 'open-licenses'],
  setup() {
    return { store: useSimulatorsStore() }
  },
  computed: {
    ...mapState(useAuthStore, {
      token: (s) => s.token,
      socketConnected: (s) => s.socketConnected,
    }),
    sims() {
      return this.store.simulators
    },
    running() {
      return this.store.runningCount
    },
    totalSent() {
      return this.sims.reduce((a, s) => a + (s.runtime.sentCount || 0), 0)
    },
    totalKm() {
      return (this.sims.reduce((a, s) => a + (s.runtime.distance || 0), 0) / 1000).toFixed(1)
    },
    errors() {
      return this.sims.filter((s) => s.runtime.lastError).length
    },
  },
})
</script>

<style scoped>
.stat {
  font-weight: 600;
}
.fleet-row {
  padding: 2px 0;
  font-size: 13px;
}
/* Scrolls only when content exceeds the available space; footer stays pinned. */
.scroll-area {
  min-height: 0;
}
.drawer-bottom {
  flex-shrink: 0;
}
.licenses-link {
  cursor: pointer;
  text-decoration: underline;
}
.licenses-link:hover {
  color: var(--q-primary);
}
</style>
