// Secret storage abstraction.
//
//  - Tauri desktop: encrypted Stronghold vault (must be unlocked with a master
//    password before use).
//  - Web / PWA: namespaced LocalStorage (no OS-level encryption available in a
//    browser — this is the expected best-effort there).
//
// All operations are serialized through a single queue so two vault operations
// never overlap (overlapping writes are a corruption source).

import { isTauri } from './platform'

const WEB_PREFIX = 'trackbox-secure:'
const VAULT_FILE = 'vault.hold'
const CLIENT = 'trackbox'
// The secrets the app keeps in the vault — used to re-key on password change.
const KNOWN_KEYS = ['flespi-token', 'router-apiKeys']

let unlocked = !isTauri // web is always "unlocked"
let vault = null // { stronghold, store }

// Promise-chain mutex: tasks run strictly one after another.
let queue = Promise.resolve()
function withLock(task) {
  const run = queue.then(task, task)
  queue = run.then(
    () => {},
    () => {},
  )
  return run
}

async function vaultPath() {
  // Local (non-roaming) app data: the canonical place for secrets / machine-bound
  // state. Same dir as appData on Linux/macOS; %LOCALAPPDATA% (not Roaming) on
  // Windows. The salt lives here too (see src-tauri/src/lib.rs).
  const { appLocalDataDir, join } = await import('@tauri-apps/api/path')
  return join(await appLocalDataDir(), VAULT_FILE)
}

// ---- internal (already-locked) implementations ----

// Whether a vault file already exists → distinguishes "set a new password" from
// "unlock the existing vault" in the UI. (Tauri only; web has no vault file.)
async function _exists() {
  if (!isTauri) return false
  const { exists } = await import('@tauri-apps/plugin-fs')
  try {
    return await exists(await vaultPath())
  } catch {
    return false
  }
}

async function _unlock(password) {
  if (!isTauri) {
    unlocked = true
    return true
  }
  const { Stronghold } = await import('@tauri-apps/plugin-stronghold')
  const stronghold = await Stronghold.load(await vaultPath(), password)
  let client
  try {
    client = await stronghold.loadClient(CLIENT)
  } catch {
    client = await stronghold.createClient(CLIENT)
  }
  vault = { stronghold, store: client.getStore() }
  unlocked = true
  return true
}

// Re-encrypt the vault with a new master password. Stronghold has no in-place
// rekey, so we build the re-keyed snapshot at a TEMP path first (the live vault
// stays intact), then atomically swap it in. A failure while building leaves
// everything unchanged; only the final rename is a (tiny) commit point.
async function _changePassword(newPassword) {
  if (!isTauri) throw new Error('Master password applies to the desktop app only')
  if (!newPassword) throw new Error('Empty password')
  if (!unlocked || !vault) throw new Error('Unlock the vault first')

  // Snapshot current secrets into memory.
  const snapshot = {}
  for (const k of KNOWN_KEYS) {
    const v = await _get(k)
    if (v != null) snapshot[k] = v
  }

  const { Stronghold } = await import('@tauri-apps/plugin-stronghold')
  const { rename, remove, exists } = await import('@tauri-apps/plugin-fs')
  const path = await vaultPath()
  const tmp = `${path}.new`

  // 1) Build the re-keyed vault at a temp path. Any failure here is safe — the
  //    live vault is untouched.
  try {
    if (await exists(tmp)) await remove(tmp)
    const sh = await Stronghold.load(tmp, newPassword)
    let client
    try {
      client = await sh.loadClient(CLIENT)
    } catch {
      client = await sh.createClient(CLIENT)
    }
    const store = client.getStore()
    for (const [k, v] of Object.entries(snapshot)) {
      await store.insert(k, Array.from(new TextEncoder().encode(v)))
    }
    await sh.save()
    await sh.unload()
  } catch {
    try {
      if (await exists(tmp)) await remove(tmp)
    } catch {
      // ignore cleanup failure
    }
    throw new Error('rekey-failed-safe') // old vault intact
  }

  // 2) Swap in the new vault: release the old one, replace the file.
  try {
    await vault.stronghold.unload()
  } catch {
    // ignore
  }
  vault = null
  unlocked = false
  try {
    if (await exists(path)) await remove(path)
    await rename(tmp, path)
  } catch {
    throw new Error('rekey-failed-unsafe') // file may be inconsistent
  }

  // 3) Load the new vault so the session stays unlocked.
  await _unlock(newPassword)
}

async function _reset() {
  if (!isTauri) {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(WEB_PREFIX))
      .forEach((k) => localStorage.removeItem(k))
    vault = null
    unlocked = true
    return
  }
  const { remove, exists } = await import('@tauri-apps/plugin-fs')
  const path = await vaultPath()
  try {
    if (await exists(path)) await remove(path)
  } catch {
    // ignore — file may not exist
  }
  vault = null
  unlocked = false
}

async function _get(key) {
  if (!isTauri) return localStorage.getItem(WEB_PREFIX + key)
  if (!unlocked || !vault) return null
  const data = await vault.store.get(key)
  if (!data || !data.length) return null
  return new TextDecoder().decode(new Uint8Array(data))
}

async function _remove(key) {
  if (!isTauri) {
    localStorage.removeItem(WEB_PREFIX + key)
    return
  }
  if (!unlocked || !vault) return
  try {
    await vault.store.remove(key)
    await vault.stronghold.save()
  } catch {
    // key may not exist — ignore
  }
}

async function _set(key, value) {
  if (value === undefined || value === null || value === '') return _remove(key)
  if (!isTauri) {
    localStorage.setItem(WEB_PREFIX + key, value)
    return
  }
  if (!unlocked || !vault) return
  await vault.store.insert(key, Array.from(new TextEncoder().encode(value)))
  await vault.stronghold.save()
}

export const secureStore = {
  /* Whether secrets can be read/written right now. */
  get unlocked() {
    return unlocked
  },
  /* Desktop only: a master password is required before secrets are available. */
  get needsUnlock() {
    return isTauri && !unlocked
  },

  /* Desktop: does an encrypted vault file already exist? (set vs unlock UI). */
  vaultExists() {
    return withLock(() => _exists())
  },
  unlock(password) {
    return withLock(() => _unlock(password))
  },
  /* Desktop: re-encrypt the vault with a new master password (must be unlocked). */
  changePassword(newPassword) {
    return withLock(() => _changePassword(newPassword))
  },
  reset() {
    return withLock(() => _reset())
  },
  get(key) {
    return withLock(() => _get(key))
  },
  set(key, value) {
    return withLock(() => _set(key, value))
  },
  remove(key) {
    return withLock(() => _remove(key))
  },
}
