/*
 * Lightweight in-app log buffer for diagnostics.
 *
 * A reactive ring buffer of the most recent entries (capped at MAX). Anything in
 * the app can record an event — sends, errors, cloud sync, connection changes —
 * and the user can review/copy them from Settings → Diagnostics to figure out
 * why something isn't working. Mirrored to the console in dev.
 *
 *   import { logInfo, logError } from 'src/log'
 *   logInfo('send', 'Device 1: 3 messages via http')
 *   logError('route', 'TomTom: missing valid authentication credentials')
 */

import { reactive } from 'vue'

const MAX = 200

// Reactive, newest-last. Read `logState.entries` in components.
export const logState = reactive({ entries: [] })

let seq = 0

export function addLog(level, src, msg) {
  const entry = { id: ++seq, t: Date.now(), level, src: src || '', msg: String(msg) }
  const list = logState.entries
  list.push(entry)
  if (list.length > MAX) list.splice(0, list.length - MAX) // keep only the last MAX
  if (process.env.DEV) {
    const fn = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'
    console[fn](`[${src}] ${msg}`)
  }
  return entry
}

export const logDebug = (src, msg) => addLog('debug', src, msg)
export const logInfo = (src, msg) => addLog('info', src, msg)
export const logWarn = (src, msg) => addLog('warn', src, msg)
export const logError = (src, msg) => addLog('error', src, msg)

export function clearLogs() {
  logState.entries.splice(0)
}

/* Whole buffer as plain text — for the Copy button. */
export function logsToText() {
  return logState.entries
    .map(
      (e) =>
        `${new Date(e.t).toISOString()} ${e.level.toUpperCase().padEnd(5)} ` +
        `${e.src ? '[' + e.src + '] ' : ''}${e.msg}`,
    )
    .join('\n')
}
