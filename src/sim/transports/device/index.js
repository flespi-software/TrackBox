// Device (REST) — POST /gw/devices/{selector}/messages via the authenticated
// connector. Not a wire protocol; registers messages straight into a device.

function deviceSelector(t) {
  if (t.deviceBy === 'id' && t.deviceId) return String(t.deviceId).trim()
  return `configuration.ident=${(t.ident || '').trim()}`
}

export default {
  value: 'device',
  label: 'Device (REST)',
  icon: 'mdi-developer-board', // flespi's device icon
  needsLogin: true,
  native: false, // works in browser
  defaults: { deviceBy: 'ident', ident: '', deviceId: '' },
  fields: [
    {
      key: 'deviceBy',
      type: 'btnToggle',
      label: 'Target by',
      options: [
        { label: 'Ident (IMEI)', value: 'ident' },
        { label: 'Device id', value: 'id' },
      ],
    },
    {
      key: 'ident',
      type: 'text',
      label: 'Device ident / IMEI',
      required: true,
      when: (t) => t.deviceBy !== 'id',
      hint: 'POST /gw/devices/configuration.ident=<ident>/messages',
    },
    { key: 'deviceId', type: 'number', label: 'Device id', required: true, when: (t) => t.deviceBy === 'id' },
  ],
  summary: (t) =>
    t.deviceBy === 'id' ? `Device id ${t.deviceId || '?'}` : `Device ident ${t.ident || '?'}`,
  async send(ctx, t, messages) {
    const resp = await ctx.connector.http.post(`/gw/devices/${deviceSelector(t)}/messages`, messages)
    const data = resp && resp.data
    if (data && data.errors && data.errors.length) {
      throw new Error(data.errors.map((e) => e.reason).join('; '))
    }
    return data
  },
}
