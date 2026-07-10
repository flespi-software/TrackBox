<template>
  <q-banner
    v-if="visible"
    dense
    :class="['download-banner q-ma-sm rounded-borders', themeClass]"
  >
    <template #avatar>
      <q-icon name="mdi-desktop-classic" :color="accentColor" />
    </template>
    Get the desktop app for {{ osLabel }} — native flespi HTTP channel, secure
    vault and auto-updates.
    <template #action>
      <q-btn
        flat
        dense
        no-caps
        :color="accentColor"
        icon="mdi-download"
        :label="downloadLabel"
        @click="download"
      />
      <q-btn flat dense no-caps :color="accentColor" label="Dismiss" @click="dismiss" />
    </template>
  </q-banner>
</template>

<script>
import { defineComponent, ref, computed } from 'vue'
import { useQuasar, LocalStorage } from 'quasar'
import { isTauri, openExternal } from 'src/platform'
import { RELEASES_LATEST_URL } from 'src/constants'

// Dismissal keyed by app version: web ships with each release, so a version
// bump (= new desktop build) re-surfaces the banner.
const DISMISS_KEY = 'download-banner-dismissed-version'

export default defineComponent({
  name: 'DownloadDesktopBanner',

  setup() {
    const $q = useQuasar()

    // Installed PWA users already "have the app" — skip them.
    const standalone =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(display-mode: standalone)').matches

    const dismissed = LocalStorage.getItem(DISMISS_KEY) === __APP_VERSION__

    const visible = ref(!isTauri && !standalone && !dismissed)

    // Amber warning look, tuned per theme (dark reuses a translucent amber).
    const themeClass = computed(() =>
      $q.dark.isActive ? 'download-banner--dark' : 'bg-amber-2 text-amber-10',
    )
    const accentColor = computed(() => ($q.dark.isActive ? 'amber-4' : 'amber-10'))

    const osLabel = $q.platform.is.mac
      ? 'macOS'
      : $q.platform.is.win
        ? 'Windows'
        : $q.platform.is.linux
          ? 'Linux'
          : 'desktop'

    const downloadLabel =
      osLabel === 'desktop' ? 'Download' : `Download for ${osLabel}`

    function download() {
      openExternal(RELEASES_LATEST_URL)
    }

    function dismiss() {
      LocalStorage.set(DISMISS_KEY, __APP_VERSION__)
      visible.value = false
    }

    return { visible, themeClass, accentColor, osLabel, downloadLabel, download, dismiss }
  },
})
</script>

<style scoped>
/* Dark-theme amber banner: translucent amber fill + light amber text. */
.download-banner--dark {
  background: rgba(255, 193, 7, 0.12);
  color: #ffe082;
}
</style>
