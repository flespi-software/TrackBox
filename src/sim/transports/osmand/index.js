// OsmAnd protocol — HTTPS GET to the channel URI with query params.
// flespi expects: speed in km/h, timestamp in seconds, altitude in meters,
// bearing in degrees. No login needed. Browser-capable where the channel host
// allows it (same CORS/mixed-content caveat as the HTTP channel); always works
// under Tauri via native HTTP. Carries position only — OsmAnd has no fields for
// doors/pedals/etc. (use device/HTTP/MQTT transports for rich params).

import { httpGet } from '../../../platform'
import icon from './icon.svg?raw'

function baseUrl(raw) {
  let u = (raw || '').trim()
  if (!u) throw new Error('OsmAnd channel URL is not set')
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`
  return u
}

export default {
  value: 'osmand',
  label: 'OsmAnd (HTTP)',
  icon, // monochrome OsmAnd logo (Simple Icons, CC0)
  needsLogin: false,
  native: false,
  defaults: { channelUrl: '', ident: '' },
  fields: [
    {
      key: 'channelUrl',
      type: 'text',
      label: 'OsmAnd channel URL',
      placeholder: 'chXXXX.flespi.gw:443',
      required: true,
      hint: 'From the channel card (OsmAnd protocol). Sent as an HTTP GET.',
    },
    { key: 'ident', type: 'text', label: 'Device ident (id)', required: true },
  ],
  summary: (t) => `OsmAnd ${t.channelUrl || '?'} (${t.ident || '?'})`,
  async send(ctx, t, messages) {
    const base = baseUrl(t.channelUrl)
    const sep = base.includes('?') ? '&' : '?'
    const id = (t.ident || '').trim()
    for (const m of messages) {
      const p = new URLSearchParams({ id })
      const set = (k, v) => v != null && p.set(k, String(v))
      set('lat', m['position.latitude'])
      set('lon', m['position.longitude'])
      set('timestamp', m.timestamp != null ? Math.round(m.timestamp) : undefined)
      set('speed', m['position.speed']) // km/h
      set('bearing', m['position.direction'])
      set('altitude', m['position.altitude'])
      await httpGet(`${base}${sep}${p.toString()}`)
    }
    return { sent: messages.length }
  },
}
