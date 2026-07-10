// Platform abstraction: web / PWA vs. Tauri desktop.
//
// In Tauri we route certain network calls through the native HTTP plugin, which
// bypasses the webview's CORS / mixed-content restrictions - this is what makes
// the flespi HTTP channel (http://gw.flespi.io:<port>) work from the desktop app.

export const isTauri =
  typeof window !== 'undefined' &&
  (!!window.__TAURI_INTERNALS__ || !!window.__TAURI__)

/*
 * POST JSON and return the parsed response body.
 * Tauri: native HTTP (no CORS). Web/PWA: axios.
 * Throws an Error with `.response = { status, data }` on non-2xx (axios-like).
 */
export async function httpPostJson(url, data, { headers = {}, timeout = 15000 } = {}) {
  if (isTauri) {
    const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http')
    const resp = await tauriFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(data),
      connectTimeout: timeout,
    })
    const text = await resp.text()
    let body
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      body = text
    }
    if (!resp.ok) {
      const err = new Error(`HTTP ${resp.status}`)
      err.response = { status: resp.status, data: body }
      throw err
    }
    return body
  }
  const axios = (await import('axios')).default
  const resp = await axios.post(url, data, { headers, timeout })
  return resp.data
}

/* The current Tauri window (for custom title-bar controls), or null on web. */
export async function getAppWindow() {
  if (!isTauri) return null
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    return getCurrentWindow()
  } catch {
    return null
  }
}

/*
 * Start a native window resize drag from an edge/corner (frameless window).
 * direction: 'North' | 'South' | 'East' | 'West' | 'NorthEast' | 'NorthWest'
 *            | 'SouthEast' | 'SouthWest'
 */
export async function startResize(direction) {
  if (!isTauri) return
  try {
    const { getCurrentWindow, ResizeDirection } = await import('@tauri-apps/api/window')
    await getCurrentWindow().startResizeDragging(ResizeDirection[direction])
  } catch {
    // ignore - resize is best-effort
  }
}

/* Fully quit the desktop app (bypasses the close-to-tray behavior). */
export async function quitApp() {
  if (!isTauri) return
  try {
    const { exit } = await import('@tauri-apps/plugin-process')
    await exit(0)
  } catch {
    // ignore
  }
}

/* GET a URL. Tauri: native HTTP (no CORS); web: fetch. Returns response text. */
export async function httpGet(url, { timeout = 15000 } = {}) {
  if (isTauri) {
    const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http')
    const resp = await tauriFetch(url, { method: 'GET', connectTimeout: timeout })
    if (!resp.ok) {
      const err = new Error(`HTTP ${resp.status}`)
      err.response = { status: resp.status }
      throw err
    }
    return resp.text()
  }
  const resp = await fetch(url, { method: 'GET' })
  if (!resp.ok) {
    const err = new Error(`HTTP ${resp.status}`)
    err.response = { status: resp.status }
    throw err
  }
  return resp.text()
}

/* Save text to a file. Tauri: native "Save as" dialog, then write the chosen
   path via the fs plugin (a blob-anchor download is unreliable in the frameless
   webview). Web/PWA: a normal browser download. Returns { saved } where saved is
   'file' (with `path`), 'browser', or 'cancelled' (user dismissed the dialog). */
export async function saveTextFile(filename, text, { mime = 'application/octet-stream', filters } = {}) {
  if (isTauri) {
    try {
      const { save } = await import('@tauri-apps/plugin-dialog')
      const { writeTextFile } = await import('@tauri-apps/plugin-fs')
      const path = await save({ defaultPath: filename, filters })
      if (!path) return { saved: 'cancelled' }
      await writeTextFile(path, text)
      return { saved: 'file', path }
    } catch (e) {
      // Fall through to the browser download as a best-effort backup.
      if (process.env.DEV) console.log('[saveTextFile] native save failed', e)
    }
  }
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return { saved: 'browser', name: filename }
}

/* Open a URL in the user's real browser (system browser under Tauri). */
export async function openExternal(url) {
  if (isTauri) {
    try {
      const { open } = await import('@tauri-apps/plugin-shell')
      await open(url)
      return
    } catch {
      // fall through to window.open
    }
  }
  window.open(url, '_blank', 'noopener')
}
