// flespi MQTT-protocol channel — publish to the channel's subscribe topic over
// the flespi MQTT broker (the already-connected session). Needs login.

import icon from './icon.svg?raw'

export default {
  value: 'mqtt',
  label: 'MQTT channel',
  icon, // monochrome MQTT logo (Simple Icons, CC0)
  needsLogin: true,
  native: false,
  defaults: { mqttTopic: 'devices/ingest/{ident}', ident: '', identInPayload: false },
  fields: [
    {
      key: 'mqttTopic',
      type: 'text',
      label: 'MQTT topic',
      required: true,
      hint: "Channel's subscribe topic. {ident} is substituted.",
    },
    { key: 'ident', type: 'text', label: 'Device ident', required: true },
    { key: 'identInPayload', type: 'toggle', label: 'Also include ident in JSON payload' },
  ],
  summary: (t) =>
    `MQTT ${(t.mqttTopic || 'devices/ingest/{ident}').replace('{ident}', t.ident || '?')}`,
  async send(ctx, t, messages) {
    const ident = (t.ident || '').trim()
    const topic = (t.mqttTopic || 'devices/ingest/{ident}').replace(/\{ident\}/g, ident)
    if (topic.startsWith('flespi/')) {
      throw new Error("MQTT topic must not start with 'flespi/'")
    }
    for (const m of messages) {
      const payload = t.identInPayload ? { ident, ...m } : m
      await ctx.connector.socket.publish(topic, JSON.stringify(payload), { qos: 1 })
    }
    return { published: messages.length, topic }
  },
}
