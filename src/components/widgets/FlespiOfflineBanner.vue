<template>
  <!-- Shown under the login button when flespi is unreachable, so a backend
       outage reads as a clear "retry" state instead of a silent failed login. -->
  <q-banner v-if="show" dense class="flespi-offline-banner text-white">
    <template #avatar>
      <q-icon name="mdi-cloud-alert-outline" color="white" />
    </template>
    Can't reach flespi.
    <template #action>
      <q-btn
        flat
        dense
        no-caps
        color="white"
        label="Retry"
        :loading="checking"
        @click="retry"
      />
    </template>
  </q-banner>
</template>

<script>
import { defineComponent } from 'vue'
import { mapState, mapActions } from 'pinia'
import { useAuthStore } from '../../stores/auth'

export default defineComponent({
  name: 'FlespiOfflineBanner',
  data() {
    return { checking: false }
  },
  computed: {
    ...mapState(useAuthStore, {
      flespiOnline: (s) => s.flespiOnline,
      token: (s) => s.token,
    }),
    // Only nag before login, and only once a probe has confirmed flespi is down.
    show() {
      return !this.token && this.flespiOnline === false
    },
  },
  methods: {
    ...mapActions(useAuthStore, ['pingFlespi']),
    async retry() {
      if (this.checking) return
      this.checking = true
      try {
        await this.pingFlespi()
      } finally {
        this.checking = false
      }
    },
  },
  mounted() {
    // Probe on first paint so the banner reflects real reachability at startup.
    if (!this.token && this.flespiOnline === undefined) this.pingFlespi()
  },
})
</script>

<style lang="sass">
.flespi-offline-banner
  margin: 8px
  border-radius: 8px
  background: #c62828
</style>
