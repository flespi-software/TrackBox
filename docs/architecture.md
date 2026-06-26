# TrackBox — how it works

Detailed notes on the internals. For the overview and how to run/build, see the
[README](../README.md).

## Sending into flespi (transports)

Three send methods, each a self-contained module under `src/sim/transports/`:

1. **Device (REST)** — `POST /gw/devices/{selector}/messages` via the authenticated
   connector. Targets a device by `ident` (IMEI) or numeric `id`. Most reliable from the
   browser; no channel needed.
2. **HTTP channel** — `POST` a JSON message array to the channel endpoint
   (`gw.flespi.io:<port>` from the channel card).
   ⚠️ When the app is served over **https**, the browser blocks requests to a plain
   `http://` endpoint (mixed content). Enable SSL on the channel and use its `https://`
   URL, or run the app locally over `http://localhost`. The Tauri desktop build uses
   native HTTP and isn't subject to this.
3. **MQTT channel** — publish to the channel's subscribe topic over the flespi MQTT
   broker (WSS) using the already-connected session. Create an *mqtt* channel with the
   *flespi MQTT broker* configuration; set its subscribe topic (e.g.
   `devices/ingest/{ident}`) and use the same here. The device ident can come from the
   topic or from the payload (toggle "include ident in payload"). Topics must not start
   with `flespi/`.

A failed send surfaces a readable reason on the card and in the in-app log
(Settings → Diagnostics → View logs). A bare "Network error" means the request never got
a response — offline, unreachable host/port, CORS, or HTTP blocked on an HTTPS page.

## How movement works

Each route is preprocessed into segments carrying a `duration`. A single clock advances
in real time (scaled by the playback multiplier), the current position is interpolated
along the segment, and the reported `position.speed` matches the actual ground speed of
the marker. The engine also derives realistic telemetry (rpm, gear, odometer, fuel,
doors at stops, pedals) for parameters flagged "auto".

`src/sim/`:

- `geo.js` — haversine / bearing / route building & sampling
- `parsers.js` — route file parsers (flespi-json / geojson / gpx / kml)
- `routers/` — road-route providers (OSRM, Valhalla, Mapbox, GraphHopper, TomTom, …) for
  building a route by clicking roads
- `routeCodec.js` — polyline compression of routes for storage / cloud sync
- `engine.js` — the per-device playback engine (position, telemetry, doors, pedals)
- `transports/` — the flespi send methods
- `vehicleParams.js` — the configurable vehicle-state parameters

`src/stores/simulators.js` — Pinia store orchestrating engines, persistence, and cloud
sync.

## Persistence & cloud sync

- Simulator definitions live in **IndexedDB** (localforage) — localStorage's ~5 MB limit
  was too small for routes; routes are polyline-compressed (`routeCodec.js`). The small
  playback state (position / progress) stays in `LocalStorage` so it can be written
  synchronously on unload. The shared store layer is `src/storage.js` (`appStore(name)`).
- A running simulator is saved periodically and on quit; on next launch it comes back
  **paused** at its last position.
- Optional **per-flow cloud sync**: each simulator can be published to the flespi MQTT
  broker as a retained message under `xflespifront/trackbox/simulators/<id>`, scoped to
  the account by cid (the subscription filters on `userProperties.cid` and uses No Local
  so a device doesn't echo its own publishes). Toggling sync off keeps the flow locally.

## Diagnostics

An in-app ring buffer (last 200 entries) records sends, errors, cloud sync, and broker
connect/disconnect. Open it from **Settings → Diagnostics → View logs** — a dockable
bottom panel with level filters and a Copy button. Source: `src/log.js`,
`src/components/LogViewer.vue`.

## Desktop / AppImage

The desktop build wraps the SPA via Tauri (needs the Rust toolchain). The HTTP transport
and external links use Tauri's native HTTP/shell (`src/platform.js`), so the HTTP channel
works without the browser CORS/mixed-content limit. Login uses a token-paste dialog (the
web OAuth popup can't return into a webview). Secrets (token, API keys) are kept in an
encrypted Stronghold vault.

`scripts/build-appimage.sh` runs the bundler inside an Ubuntu 24.04 LTS container
(glibc 2.39) so the binary stays compatible with older distros. Two non-obvious things it
handles, both required for the AppImage to actually render on other machines:

- **`crossorigin` strip** (`quasar.config.js`): WebKitGTK blocks `crossorigin` module
  scripts served over the `tauri://` protocol → blank window. The Vite config strips the
  attribute from `index.html`.
- **libwayland repack** (`scripts/repack-appimage-no-wayland.sh`, run automatically after
  the build): linuxdeploy bundles an old `libwayland-client` that conflicts with modern
  Wayland/Mesa → `EGL_BAD_PARAMETER`, blank window. The script drops the bundled
  `libwayland-*` so the host's are used.

The window is opaque (`transparent: false` in `tauri.conf.json`) — window transparency
triggers a fatal EGL path on some GPUs. For distros older than glibc 2.39, build a
`.deb`/`.rpm` instead (`tauri build --bundles deb`); those use the **system** webkit and
avoid the bundled-GL issues entirely.
