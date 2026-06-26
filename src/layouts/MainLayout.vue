<template>
  <q-layout view="lHh Lpr LFf">
    <q-header v-if="!hidePanels" elevated :class="{ 'is-titlebar': isTauri }">
      <q-toolbar data-tauri-drag-region class="titlebar">
        <q-btn id="tour-menu" flat dense round icon="mdi-menu" aria-label="Menu" @click="toggleLeftDrawer" />
        <q-toolbar-title class="titlebar-title" data-tauri-drag-region>
          <img src="TrackBox.png" class="titlebar-logo" alt="" data-tauri-drag-region />
          {{ product }} <sup>{{ version }}</sup>
        </q-toolbar-title>
        <q-space v-if="isTauri" />

        <q-btn flat dense round icon="mdi-help-circle" @click="startTour">
          <q-tooltip>Show tour</q-tooltip>
        </q-btn>

        <q-btn
          id="tour-theme"
          flat
          dense
          round
          :icon="$q.dark.isActive ? 'mdi-weather-night' : 'mdi-weather-sunny'"
          @click="toggleDark"
        >
          <q-tooltip>{{ $q.dark.isActive ? 'Light mode' : 'Dark mode' }}</q-tooltip>
        </q-btn>

        <!-- Custom window controls (desktop / Tauri only) -->
        <template v-if="isTauri">
          <q-btn
            flat
            dense
            icon="mdi-power"
            class="titlebar-btn q-ml-sm"
            aria-label="Quit"
            @click="requestQuit"
          >
            <q-tooltip>Quit (closing the window hides to tray)</q-tooltip>
          </q-btn>
          <q-btn
            flat
            dense
            icon="mdi-window-minimize"
            class="titlebar-btn"
            aria-label="Minimize"
            @click="winMinimize"
          />
          <q-btn
            flat
            dense
            :icon="maximized ? 'mdi-window-restore' : 'mdi-window-maximize'"
            class="titlebar-btn"
            aria-label="Maximize"
            @click="winToggleMaximize"
          />
          <q-btn
            flat
            dense
            icon="mdi-window-close"
            class="titlebar-btn win-close"
            aria-label="Close"
            @click="winClose"
          />
        </template>
      </q-toolbar>
    </q-header>

    <q-drawer v-if="!hidePanels" v-model="leftDrawerOpen" show-if-above bordered>
      <div class="drawer-login">
        <LoginButton />
      </div>
      <DrawerContent
        class="drawer-body"
        :vault-locked="vaultLocked"
        @open-settings="settingsDialog = true"
        @unlock-vault="vaultDialog = true"
        @open-licenses="licensesDialog = true"
      />
    </q-drawer>

    <q-page-container>
      <router-view />
    </q-page-container>

    <q-dialog v-model="settingsDialog">
      <q-card style="width: 420px; max-width: 95vw">
        <q-card-section class="row items-center q-pb-none">
          <div class="text-subtitle1 text-bold">Settings</div>
          <q-space />
          <q-btn icon="mdi-close" flat round dense v-close-popup />
        </q-card-section>
        <q-card-section>
          <RouterKeysSettings />
        </q-card-section>
        <q-card-section v-if="isTauri" class="q-pt-none">
          <q-separator class="q-mb-md" />
          <div class="text-subtitle2 q-mb-sm">Security</div>
          <q-btn
            outline
            color="primary"
            icon="mdi-shield-key-outline"
            label="Change master password"
            no-caps
            :disable="vaultLocked"
            @click="changePwdDialog = true"
          />
          <div v-if="vaultLocked" class="text-caption text-grey-6 q-mt-xs">
            Unlock the vault first.
          </div>
        </q-card-section>
        <q-card-section class="q-pt-none">
          <q-separator class="q-mb-md" />
          <div class="text-subtitle2 q-mb-sm">About</div>
          <div class="row q-gutter-sm">
            <q-btn
              outline
              color="primary"
              icon="mdi-help-circle"
              label="Show tour"
              no-caps
              @click="startTour"
            />
            <q-btn
              outline
              color="primary"
              icon="mdi-scale-balance"
              label="Open-source licenses"
              no-caps
              @click="licensesDialog = true"
            />
          </div>
        </q-card-section>
        <q-card-section class="q-pt-none">
          <q-separator class="q-mb-md" />
          <div class="text-subtitle2 q-mb-sm">Diagnostics</div>
          <q-btn
            outline
            color="primary"
            icon="mdi-text-box-search-outline"
            label="View logs"
            no-caps
            @click="settingsDialog = false; logsDialog = true"
          />
          <div class="text-caption text-grey-6 q-mt-xs">
            Recent in-app events (sends, errors, sync) — handy when something doesn't work.
          </div>
        </q-card-section>
      </q-card>
    </q-dialog>

    <MasterPassword v-model="vaultDialog" @unlocked="onVaultUnlocked" />
    <ChangePassword v-model="changePwdDialog" />
    <AboutLicenses v-model="licensesDialog" />
    <LogViewer v-model="logsDialog" />

    <!-- Resize handles for the frameless desktop window -->
    <template v-if="isTauri">
      <div class="rsz rsz-n" @mousedown.prevent="resize('North')" />
      <div class="rsz rsz-s" @mousedown.prevent="resize('South')" />
      <div class="rsz rsz-e" @mousedown.prevent="resize('East')" />
      <div class="rsz rsz-w" @mousedown.prevent="resize('West')" />
      <div class="rsz rsz-ne" @mousedown.prevent="resize('NorthEast')" />
      <div class="rsz rsz-nw" @mousedown.prevent="resize('NorthWest')" />
      <div class="rsz rsz-se" @mousedown.prevent="resize('SouthEast')" />
      <div class="rsz rsz-sw" @mousedown.prevent="resize('SouthWest')" />
    </template>
  </q-layout>
</template>

<script>
import { defineComponent, ref, computed, watch, onMounted } from 'vue'
import { useQuasar, LocalStorage } from 'quasar'
import { useRoute } from 'vue-router'
import LoginButton from 'src/components/widgets/LoginButton.vue'
import RouterKeysSettings from 'src/components/RouterKeysSettings.vue'
import DrawerContent from 'src/components/DrawerContent.vue'
import MasterPassword from 'src/components/MasterPassword.vue'
import ChangePassword from 'src/components/ChangePassword.vue'
import AboutLicenses from 'src/components/AboutLicenses.vue'
import LogViewer from 'src/components/LogViewer.vue'
import { runTour, maybeStartFirstRunTour } from 'src/tour'

const THEME_KEY = 'trackbox-theme' // persisted 'dark' | 'light' preference
import { isTauri, getAppWindow, startResize, quitApp } from 'src/platform'
import { secureStore } from 'src/secureStore'
import { checkForUpdates } from 'src/updater'
import { useSettingsStore } from 'src/stores/settings'
import { useAuthStore } from 'src/stores/auth'
import { useSimulatorsStore } from 'src/stores/simulators'

export default defineComponent({
  name: 'MainLayout',

  components: {
    LoginButton,
    RouterKeysSettings,
    DrawerContent,
    MasterPassword,
    ChangePassword,
    AboutLicenses,
    LogViewer,
  },

  setup() {
    const $q = useQuasar()
    const route = useRoute()
    const leftDrawerOpen = ref(false)
    const settingsDialog = ref(false)
    const changePwdDialog = ref(false)
    const licensesDialog = ref(false)
    const logsDialog = ref(false)
    const startTour = () => {
      settingsDialog.value = false
      runTour($q)
    }

    const hidePanels = computed(
      () => route.query.hidepanels === '1' || route.query.hidepanels === 'true',
    )

    // Theme: an explicit ?theme= query wins; otherwise restore the saved
    // preference; otherwise fall back to the quasar.config default (dark).
    if (route.query.theme === 'light') $q.dark.set(false)
    else if (route.query.theme === 'dark') $q.dark.set(true)
    else {
      const saved = LocalStorage.getItem(THEME_KEY)
      if (saved === 'light') $q.dark.set(false)
      else if (saved === 'dark') $q.dark.set(true)
    }

    // Encrypted vault (desktop): prompt to unlock at startup, then load secrets.
    const vaultDialog = ref(secureStore.needsUnlock)
    const vaultLocked = ref(secureStore.needsUnlock)
    const onVaultUnlocked = async () => {
      const auth = useAuthStore()
      vaultLocked.value = false
      // Restore/persist the token first and independently, so a keys failure
      // can't block auto-login (and vice-versa).
      try {
        const stored = await secureStore.get('flespi-token')
        if (process.env.DEV) console.log('[vault] stored token present:', !!stored, 'in-memory:', !!auth.token)
        if (auth.token) {
          // Logged in before unlocking the vault — persist the token now.
          await secureStore.set('flespi-token', auth.token)
        } else if (stored) {
          await auth.setToken(stored)
          if (process.env.DEV) console.log('[vault] setToken done, token set:', !!auth.token)
        }
      } catch (e) {
        if (process.env.DEV) console.log('[vault] token restore failed', e)
      }
      try {
        await useSettingsStore().loadKeys()
      } catch (e) {
        if (process.env.DEV) console.log('[vault] keys load failed', e)
      }
    }
    // Warn when the user skips the vault — secrets won't be persisted.
    watch(vaultDialog, (open) => {
      if (!open && secureStore.needsUnlock) {
        vaultLocked.value = true
        $q.notify({
          message: 'Secret vault locked',
          caption: "Login and API keys won't be saved this session.",
          color: 'warning',
          textColor: 'dark',
          icon: 'mdi-shield-off-outline',
          timeout: 6000,
          actions: [
            { label: 'Unlock', color: 'dark', handler: () => (vaultDialog.value = true) },
            { label: 'Dismiss', color: 'dark' },
          ],
        })
      }
    })

    // In-app Quit always confirms (the tray menu's Quit exits immediately).
    const requestQuit = () => {
      const sims = useSimulatorsStore()
      const running = sims.runningCount
      $q.dialog({
        title: 'Quit',
        message:
          running > 0
            ? `${running} simulator${running > 1 ? 's are' : ' is'} running and will stop sending. Quit?`
            : 'Are you sure you want to quit?',
        cancel: true,
        persistent: true,
        ok: { label: 'Quit', color: 'negative' },
      }).onOk(() => {
        // Persist playback state now — beforeunload may not fire on a Tauri quit.
        sims.saveState()
        quitApp()
      })
    }

    onMounted(async () => {
      checkForUpdates()
      // First-run interactive tour (once; re-runnable from Settings → Show tour).
      if (!hidePanels.value) maybeStartFirstRunTour($q)
      if (!isTauri) return
      // Keep the tray tooltip (and macOS title) showing the running count.
      try {
        const { TrayIcon } = await import('@tauri-apps/api/tray')
        const store = useSimulatorsStore()
        watch(
          () => store.runningCount,
          async (n) => {
            const tray = await TrayIcon.getById('main-tray')
            if (!tray) return
            await tray.setTooltip(n > 0 ? `${__APP_PRODUCT__} — ${n} running` : __APP_PRODUCT__)
            try {
              await tray.setTitle(n > 0 ? String(n) : '')
            } catch {
              // setTitle is macOS-only
            }
          },
          { immediate: true },
        )
      } catch (e) {
        if (process.env.DEV) console.log('[tray] tooltip', e)
      }
    })

    // Custom window controls for the frameless Tauri window.
    const winPromise = isTauri ? getAppWindow() : null
    const maximized = ref(false)
    const withWin = async (fn) => {
      const w = await winPromise
      if (w) fn(w)
    }
    if (winPromise) {
      winPromise.then(async (w) => {
        if (!w) return
        try {
          maximized.value = await w.isMaximized()
          await w.onResized(async () => {
            maximized.value = await w.isMaximized()
          })
        } catch {
          // ignore — window state is best-effort
        }
      })
    }

    return {
      product: __APP_PRODUCT__,
      version: __APP_VERSION__,
      leftDrawerOpen,
      settingsDialog,
      changePwdDialog,
      licensesDialog,
      logsDialog,
      startTour,
      hidePanels,
      isTauri,
      maximized,
      vaultDialog,
      vaultLocked,
      onVaultUnlocked,
      requestQuit,
      resize: (dir) => startResize(dir),
      winMinimize: () => withWin((w) => w.minimize()),
      winToggleMaximize: () => withWin((w) => w.toggleMaximize()),
      winClose: () => withWin((w) => w.close()),
      toggleLeftDrawer() {
        leftDrawerOpen.value = !leftDrawerOpen.value
      },
      toggleDark() {
        $q.dark.toggle()
        LocalStorage.set(THEME_KEY, $q.dark.isActive ? 'dark' : 'light')
      },
    }
  },
})
</script>

<style scoped>
/* Frameless-window title bar: the toolbar drags the window; buttons stay clickable. */
[data-tauri-drag-region] {
  cursor: default;
  user-select: none;
}
/* App icon sitting next to the title text. */
.titlebar-logo {
  height: 20px;
  width: 20px;
  vertical-align: middle;
  margin-right: 8px;
  margin-bottom: 2px;
}
/* Centered app title so the header reads like a native title bar. */
.is-titlebar .titlebar-title {
  position: absolute;
  left: 0;
  right: 0;
  text-align: center;
  pointer-events: none;
  font-size: 14px;
  font-weight: 500;
}
/* Square, full-height window-control buttons (Windows-style). */
.titlebar-btn {
  border-radius: 0;
  height: 50px;
  min-width: 44px;
}
.titlebar-btn:hover {
  background: rgba(255, 255, 255, 0.14);
}
.win-close:hover {
  background: #e53935;
  color: #fff;
}

.drawer-login {
  height: 50px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--q-primary);
  flex-shrink: 0;
}

.drawer-login :deep(.q-btn) {
  width: 100%;
  height: 100%;
  border-radius: 0;
}

/* Make the drawer a flex column: login bar (fixed) + content (fills, scrolls). */
:deep(.q-drawer__content) {
  display: flex;
  flex-direction: column;
}
.drawer-body {
  flex: 1 1 auto;
  min-height: 0;
}

/* Invisible resize handles for the frameless desktop window. Corners are
   declared after edges so they win where they overlap. */
.rsz {
  position: fixed;
  z-index: 9000;
}
.rsz-n {
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  cursor: ns-resize;
}
.rsz-s {
  bottom: 0;
  left: 0;
  right: 0;
  height: 4px;
  cursor: ns-resize;
}
.rsz-e {
  top: 0;
  bottom: 0;
  right: 0;
  width: 4px;
  cursor: ew-resize;
}
.rsz-w {
  top: 0;
  bottom: 0;
  left: 0;
  width: 4px;
  cursor: ew-resize;
}
.rsz-ne,
.rsz-nw,
.rsz-se,
.rsz-sw {
  width: 12px;
  height: 12px;
  z-index: 9001;
}
.rsz-ne {
  top: 0;
  right: 0;
  cursor: nesw-resize;
}
.rsz-nw {
  top: 0;
  left: 0;
  cursor: nwse-resize;
}
.rsz-se {
  bottom: 0;
  right: 0;
  cursor: nwse-resize;
}
.rsz-sw {
  bottom: 0;
  left: 0;
  cursor: nesw-resize;
}
</style>
