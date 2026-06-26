// Transport/protocol registry.
//
// Each protocol is a self-contained module exporting a descriptor:
//   { value, label, icon, needsLogin, native, defaults, fields, summary, send }
//   - needsLogin: requires a flespi token (device REST, MQTT channel)
//   - native:     requires raw TCP/UDP → Tauri desktop only (e.g. Wialon IPS,
//                 Teltonika). Browser builds hide these.
//   - fields:     declarative config rendered generically by SimulatorDialog
//                 ({ key, type: text|number|toggle|btnToggle|select, label,
//                    required?, when?(t), options?, hint?, placeholder? })
//
// To DISABLE a protocol, remove its line from TRANSPORTS_LIST below.
// To ADD one, drop a module in this folder and add it to the list.

import device from './device'
import http from './http'
import mqtt from './mqtt'
import osmand from './osmand'

const TRANSPORTS_LIST = [device, http, mqtt, osmand]

const MAP = Object.fromEntries(TRANSPORTS_LIST.map((t) => [t.value, t]))

/* UI list (descriptors). Filter by platform: native protocols need Tauri. */
export const TRANSPORTS = TRANSPORTS_LIST

export function availableTransports(isTauri) {
  return TRANSPORTS_LIST.filter((t) => !t.native || isTauri)
}

export function getTransport(value) {
  return MAP[value] || null
}

export function transportNeedsLogin(value) {
  const t = MAP[value]
  return !!(t && t.needsLogin)
}

export function transportDefaults(value) {
  const t = MAP[value]
  return t ? { type: value, ...structuredClone(t.defaults || {}) } : { type: value }
}

export function transportFields(value) {
  const t = MAP[value]
  return t ? t.fields || [] : []
}

export function transportSummary(transport) {
  const t = MAP[transport.type]
  return t ? t.summary(transport) : transport.type
}

/* Validate a transport config against its required (visible) fields. */
export function transportValid(transport) {
  const t = MAP[transport.type]
  if (!t) return false
  return (t.fields || []).every((f) => {
    if (f.when && !f.when(transport)) return true
    if (!f.required) return true
    const v = transport[f.key]
    return v !== undefined && v !== null && String(v).trim() !== ''
  })
}

/*
 * Send a batch of messages through the configured transport.
 * ctx: { connector }, transport: config object, messages: flespi message objects.
 */
export async function sendMessages(ctx, transport, messages) {
  const t = MAP[transport.type]
  if (!t) throw new Error(`Unknown transport: ${transport.type}`)
  return t.send(ctx, transport, messages)
}
