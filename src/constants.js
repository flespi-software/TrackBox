// Shared app-wide constants.

// Releases host. Keep in sync with tauri.conf.json > plugins.updater.endpoints
// (the updater reads its own endpoint there; this mirror is for web links).
export const GITHUB_REPO = 'flespi-software/TrackBox'

// Latest-release page; GitHub highlights the asset matching the visitor's OS.
export const RELEASES_LATEST_URL = `https://github.com/${GITHUB_REPO}/releases/latest`
