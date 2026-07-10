// Metronome worker: a timer that keeps firing at ~real rate while the page is
// backgrounded (main-thread setInterval gets throttled/frozen by browsers).
// Classic worker (no imports, no module type) for max webview compatibility.
let id = null

self.onmessage = (e) => {
  const { type, tickMs } = e.data || {}
  if (type === 'start') {
    if (id) clearInterval(id)
    id = setInterval(() => self.postMessage('tick'), tickMs || 120)
  } else if (type === 'stop') {
    if (id) clearInterval(id)
    id = null
  }
}
