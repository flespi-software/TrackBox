// Catalog of vehicle-state parameters that can be injected into simulated
// messages. Names/types/units are the flespi normalized parameters (from
// /gw/message-parameters). Booleans render as toggles, percent as 0..100
// sliders, number as a numeric input.

// `auto: true` marks a parameter the engine can derive from motion/stops — those
// get an "Auto" checkbox in the dialog (and the SimEngine derives them per-param).
export const PARAM_GROUPS = [
  {
    label: 'Engine & movement',
    params: [
      { key: 'engine.ignition.status', label: 'Ignition', type: 'bool', default: true, auto: true },
      { key: 'movement.status', label: 'Movement', type: 'bool', default: true, auto: true },
      { key: 'engine.rpm', label: 'Engine RPM', type: 'number', unit: 'rpm', default: 850, min: 0, max: 8000, step: 50, auto: true },
      { key: 'can.handbrake.status', label: 'Handbrake', type: 'bool', default: false },
      { key: 'can.reverse.gear.status', label: 'Reverse gear', type: 'bool', default: false },
      { key: 'can.gear', label: 'Gear', type: 'number', default: 0, min: -1, max: 8, step: 1, auto: true },
    ],
  },
  {
    label: 'Telemetry',
    params: [
      { key: 'can.vehicle.speed', label: 'Speed (CAN)', type: 'number', unit: 'km/h', default: 0, min: 0, max: 250, step: 1, auto: true },
      { key: 'vehicle.mileage', label: 'Mileage', type: 'number', unit: 'km', default: 0, min: 0, max: 1e6, step: 1, auto: true },
      { key: 'can.vehicle.mileage', label: 'Mileage (CAN)', type: 'number', unit: 'km', default: 0, min: 0, max: 1e6, step: 1, auto: true },
      { key: 'can.fuel.consumed', label: 'Fuel consumed', type: 'number', unit: 'l', default: 0, min: 0, max: 1e5, step: 1, auto: true },
      { key: 'can.engine.coolant.temperature', label: 'Coolant temp', type: 'number', unit: '°C', default: 22, min: -40, max: 130, step: 1, auto: true },
      { key: 'engine.motorhours', label: 'Engine hours', type: 'number', unit: 'h', default: 0, min: 0, max: 1e5, step: 1, auto: true },
    ],
  },
  {
    label: 'Doors',
    params: [
      { key: 'can.front.left.door.status', label: 'Front-left door', type: 'bool', default: false, auto: true },
      { key: 'can.front.right.door.status', label: 'Front-right door', type: 'bool', default: false, auto: true },
      { key: 'can.rear.left.door.status', label: 'Rear-left door', type: 'bool', default: false, auto: true },
      { key: 'can.rear.right.door.status', label: 'Rear-right door', type: 'bool', default: false, auto: true },
      { key: 'can.trunk.status', label: 'Trunk', type: 'bool', default: false, auto: true },
      { key: 'can.hood.status', label: 'Hood', type: 'bool', default: false, auto: true },
    ],
  },
  {
    label: 'Seatbelt',
    params: [
      // false = not buckled (per flespi description)
      { key: 'can.seatbelt.status', label: 'Driver seatbelt', type: 'bool', default: true, auto: true },
    ],
  },
  {
    label: 'Lights',
    params: [{ key: 'headlight.status', label: 'Headlights', type: 'bool', default: false, auto: true }],
  },
  {
    label: 'Pedals',
    params: [
      { key: 'can.pedal.brake.status', label: 'Brake pedal', type: 'bool', default: false, auto: true },
      { key: 'can.pedal.clutch.status', label: 'Clutch pedal', type: 'bool', default: false, auto: true },
      { key: 'can.accelerator.pedal.position', label: 'Accelerator', type: 'percent', unit: '%', default: 0, auto: true },
      { key: 'can.brake.pedal.level', label: 'Brake level', type: 'percent', unit: '%', default: 0, auto: true },
    ],
  },
  {
    label: 'Fuel',
    params: [
      { key: 'fuel.level', label: 'Fuel level', type: 'percent', unit: '%', default: 80, auto: true },
      { key: 'can.fuel.level', label: 'Fuel level (CAN)', type: 'percent', unit: '%', default: 80 },
    ],
  },
]

export const ALL_PARAMS = PARAM_GROUPS.flatMap((g) => g.params)

export function paramByKey(key) {
  return ALL_PARAMS.find((p) => p.key === key)
}

export function paramLabel(key) {
  const p = paramByKey(key)
  return p ? p.label : key
}
