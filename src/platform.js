// Platform abstraction: web / PWA vs. Tauri desktop.
//
// In Tauri we route certain network calls through the native HTTP plugin, which
// bypasses the webview's CORS / mixed-content restrictions — this is what makes
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
    // ignore — resize is best-effort
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
