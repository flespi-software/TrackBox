// Desktop auto-update via tauri-plugin-updater (GitHub Releases).
//
// On startup the app fetches plugins.updater.endpoints (latest.json on the GitHub
// release), and if a newer signed build exists, offers to download + install it.
// The release pipeline (.github/workflows/desktop.yml) signs artifacts with the
// TAURI_SIGNING_PRIVATE_KEY secret and publishes latest.json next to them; the
// matching public key is in src-tauri/tauri.conf.json → plugins.updater.pubkey.

import { isTauri } from './platform'
import { logInfo, logError } from './log'

export const UPDATER_ENABLED = true

export async function checkForUpdates({ notifyNoUpdate = false } = {}) {
  if (!isTauri || !UPDATER_ENABLED) return
  const { Dialog, Notify, Loading } = await import('quasar')
  try {
    logInfo('updater', 'checking for updates…')
    const { check } = await import('@tauri-apps/plugin-updater')
    const update = await check()
    if (!update) {
      logInfo('updater', 'no update — on the latest version')
      if (notifyNoUpdate) {
        Notify.create({ message: "You're on the latest version", icon: 'mdi-check', timeout: 2000 })
      }
      return
    }
    logInfo('updater', `update available: ${update.version}`)
    Dialog.create({
      title: 'Update available',
      message: `Version ${update.version} is available.${update.body ? '\n\n' + update.body : ''} Install and restart now?`,
      cancel: true,
      persistent: true,
      ok: { label: 'Install', color: 'primary' },
    }).onOk(async () => {
      try {
        Loading.show({ message: 'Downloading update…' })
        await update.downloadAndInstall()
        const { relaunch } = await import('@tauri-apps/plugin-process')
        await relaunch()
      } catch (e) {
        Loading.hide()
        Notify.create({ color: 'negative', icon: 'mdi-alert', message: `Update failed: ${e?.message || e}` })
      }
    })
  } catch (e) {
    // Surface the reason (silent failures here are why "no update shows up" is hard
    // to diagnose) — into the in-app log, and notify if this was a manual check.
    logError('updater', `check failed: ${e?.message || e}`)
    if (notifyNoUpdate) {
      Notify.create({ color: 'negative', icon: 'mdi-alert', message: `Update check failed: ${e?.message || e}` })
    }
  }
}
