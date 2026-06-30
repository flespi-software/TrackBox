// Desktop auto-update via tauri-plugin-updater (GitHub Releases).
//
// On startup the app fetches plugins.updater.endpoints (latest.json on the GitHub
// release), and if a newer signed build exists, offers to download + install it.
// The release pipeline (.github/workflows/desktop.yml) signs artifacts with the
// TAURI_SIGNING_PRIVATE_KEY secret and publishes latest.json next to them; the
// matching public key is in src-tauri/tauri.conf.json → plugins.updater.pubkey.

import { isTauri } from './platform'

export const UPDATER_ENABLED = true

export async function checkForUpdates({ notifyNoUpdate = false } = {}) {
  if (!isTauri || !UPDATER_ENABLED) return
  const { Dialog, Notify, Loading } = await import('quasar')
  try {
    const { check } = await import('@tauri-apps/plugin-updater')
    const update = await check()
    if (!update) {
      if (notifyNoUpdate) {
        Notify.create({ message: "You're on the latest version", icon: 'mdi-check', timeout: 2000 })
      }
      return
    }
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
    if (process.env.DEV) console.log('[updater]', e)
  }
}
