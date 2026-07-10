// Shared tick source for every SimEngine. One metronome drives all running
// simulators, so N sims cost one worker, not N. A Web Worker keeps timers firing
// at ~real rate when the tab is backgrounded (main-thread timers get throttled),
// so messages keep sending. Falls back to setInterval when Workers are missing
// (SSR/restricted) or silently broken — behaviour identical, just bg-throttled.
// This keeps the web build's background reliability without breaking desktop/PWA.

import { TICK_MS } from './constants'

const subs = new Set()
let worker = null
let intervalId = null
let watchdog = null

// Copy first: a callback may unsubscribe (pause) mid-iteration; one engine
// throwing must not stop the others.
function fire() {
  for (const cb of [...subs]) {
    try { cb() } catch { /* engine error is self-contained */ }
  }
}

function useInterval() {
  if (intervalId) return
  intervalId = setInterval(fire, TICK_MS)
}

function ensureRunning() {
  if (worker || intervalId) return
  if (typeof Worker === 'undefined') { useInterval(); return }
  try {
    worker = new Worker(new URL('./clock.worker.js', import.meta.url))
    let alive = false
    worker.onmessage = () => { alive = true; fire() }
    worker.onerror = () => { teardownWorker(); useInterval() }
    worker.postMessage({ type: 'start', tickMs: TICK_MS })
    // Watchdog: if the worker produced no tick shortly after start (silent
    // failure on some webview), fall back to setInterval. Runs in the
    // foreground at startup, so it isn't throttled.
    watchdog = setTimeout(() => {
      watchdog = null
      if (!alive && subs.size) { teardownWorker(); useInterval() }
    }, 1000)
  } catch {
    worker = null
    useInterval()
  }
}

function teardownWorker() {
  if (watchdog) { clearTimeout(watchdog); watchdog = null }
  if (worker) {
    worker.onmessage = worker.onerror = null
    try { worker.postMessage({ type: 'stop' }) } catch { /* already dead */ }
    worker.terminate()
    worker = null
  }
}

function stopIfIdle() {
  if (subs.size) return
  teardownWorker()
  if (intervalId) { clearInterval(intervalId); intervalId = null }
}

/* Subscribe a per-tick callback; returns an unsubscribe fn. */
export function subscribeTick(cb) {
  subs.add(cb)
  ensureRunning()
  return () => {
    subs.delete(cb)
    stopIfIdle()
  }
}
