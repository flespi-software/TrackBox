// Desktop auto-update via tauri-plugin-updater (GitHub Releases).
//
// DISABLED until you have a repo + release pipeline. To enable:
//   1. set UPDATER_ENABLED = true below
//   2. src-tauri/tauri.conf.json → plugins.updater.endpoints = your latest.json URL
//   3. `npx tauri signer generate` → paste the public key into plugins.updater.pubkey,
//      keep the private key as a CI secret (TAURI_SIGNING_PRIVATE_KEY)
//   4. src-tauri/tauri.conf.json → bundle.createUpdaterArtifacts = true
//   5. publish releases (e.g. via tauri-apps/tauri-action) so latest.json + signed
//      artifacts land on the GitHub release.

import { isTauri } from './platform'

export const UPDATER_ENABLED = false

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
