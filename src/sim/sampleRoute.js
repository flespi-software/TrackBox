// A small demo loop (≈ central Vilnius) used by the "Load sample route" button.
// No timestamps → plays back at the configured constant speed.
const coords = [
  [54.6872, 25.2797],
  [54.6885, 25.2835],
  [54.6901, 25.2868],
  [54.6918, 25.2901],
  [54.6932, 25.2949],
  [54.6925, 25.3005],
  [54.6902, 25.3032],
  [54.6874, 25.3028],
  [54.6851, 25.2998],
  [54.6839, 25.2951],
  [54.6845, 25.2901],
  [54.6856, 25.2851],
  [54.6872, 25.2797],
]

export function sampleRouteParsed() {
  return {
    format: 'geojson',
    hasTimes: false,
    points: coords.map(([lat, lon]) => ({ lat, lon })),
  }
}
