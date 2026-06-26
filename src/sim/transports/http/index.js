// flespi HTTP-protocol channel — POST a JSON message array to gw.flespi.io:<port>.
// No login needed. Under Tauri uses native HTTP (bypasses CORS/mixed-content).

import { httpPostJson } from '../../../platform'

function channelUrl(raw) {
  let url = (raw || '').trim()
  if (!url) throw new Error('HTTP channel URL is not set')
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`
  return url
}

export default {
  value: 'http',
  label: 'HTTP channel',
  icon: 'mdi-web',
  needsLogin: false,
  native: false,
  defaults: { channelUrl: '', ident: '' },
  fields: [
    {
      key: 'channelUrl',
      type: 'text',
      label: 'HTTP channel URL',
      placeholder: 'gw.flespi.io:12345',
      required: true,
      hint: 'From the channel card. POSTs a JSON message array here.',
    },
    { key: 'ident', type: 'text', label: 'Device ident', required: true },
  ],
  summary: (t) => `HTTP ${t.channelUrl || '?'} (${t.ident || '?'})`,
  async send(ctx, t, messages) {
    const ident = (t.ident || '').trim()
    const body = messages.map((m) => ({ ident, ...m }))
    return httpPostJson(channelUrl(t.channelUrl), body, { timeout: 15000 })
  },
}
