<template>
  <router-view />
</template>

<script>
import { defineComponent } from 'vue'
import { isTauri } from './platform'

export default defineComponent({
  name: 'App',
  created() {
    // Frame the app (rounded corners + ring + shadow) on desktop and installed
    // PWA, but not in a regular browser tab where it would look odd.
    const standalone =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(display-mode: standalone)').matches
    if (isTauri || standalone) {
      document.documentElement.classList.add('app-framed')
      if (isTauri) document.documentElement.classList.add('app-transparent')
    }
    // Disable the webview context menu ("Inspect element", reload, …) in the
    // desktop release build — kept in dev so the inspector stays available.
    if (isTauri && !process.env.DEV) {
      window.addEventListener('contextmenu', (e) => e.preventDefault())
    }
  },
})
</script>
