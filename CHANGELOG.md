# Changelog

All notable changes to TrackBox are documented here. This file is bundled into
the app and shown in Settings → “What’s new”.

## [1.1.1]

### Added
- Web: log in via a token URL — `/#/token/<flespi-token>` signs in and redirects
  to the app (the token is removed from browser history).

## [1.1.0]

### Added
- Web: banner offering the desktop download, tailored to the visitor’s OS
  (light & dark themes).
- Map: many more basemaps — CARTO light/dark (theme-following), OpenTopoMap,
  CyclOSM, Humanitarian, Esri Topographic, and extra satellite sources (Esri
  Clarity, USGS) — each toggleable in Settings → Map layers.
- Map: optional street/place labels overlay on satellite basemaps — toggle
  “Street labels” in the basemap menu, with a choice of source: Esri (roads +
  labels), or OSM/CARTO labels-only in light or dark text.
- Map: “Configure layers…” shortcut in the basemap menu opens the layer settings.
- Map: custom tile-URL layer with `{z}/{x}/{y}` validation.
- In-app changelog (this window) — open it from the version in the title bar or
  Settings → “What’s new”; also shown automatically once after an update.
- Settings: collapsible sections.

### Fixed
- Satellite/raster tiles now upscale past their native zoom instead of blanking
  out at maximum zoom, staying in sync with the tracks.
- Basemap no longer freezes during zoom after switching layers (the tile layer is
  updated in place instead of recreated, preserving its zoom animation).

## [1.0.7]

### Added
- macOS: signed universal (Apple Silicon + Intel) desktop build in CI.

## [1.0.6]

### Changed
- Check for updates from the title-bar version; releases stay draft until the
  update manifest is ready.

## [1.0.5]

### Fixed
- Updater dialog never showed (dynamic Quasar import).

## [1.0.4]

### Added
- Update checks: periodic and manual (Settings and tray).

## [1.0.3]

### Added
- Basemap switcher, smoother map, route-builder UX.

## [1.0.2]

### Added
- Signed desktop auto-updater.
