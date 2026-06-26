// Single source of truth for the app's display name: package.json "productName".
//
// JS/Vue/PWA-runtime read it via the __APP_PRODUCT__ Vite define (quasar.config
// rawDefine). The two static platform manifests can't read package.json at build
// time, so this script stamps the name into them. It does a targeted value
// replacement (no reformatting) and only writes when the value actually changes,
// so it's a no-op in normal dev/build. Wired into the dev/build commands.
//
// To rename the app: edit "productName" in package.json — that's the only place.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = (p) => fileURLToPath(new URL('../' + p, import.meta.url))
const name = JSON.parse(readFileSync(root('package.json'), 'utf8')).productName || 'App'

function stamp(file, patterns) {
  const path = root(file)
  const orig = readFileSync(path, 'utf8')
  let out = orig
  for (const re of patterns) out = out.replace(re, (_m, prefix) => prefix + JSON.stringify(name))
  if (out !== orig) {
    writeFileSync(path, out)
    console.log(`[sync-app-name] ${file} → ${name}`)
  }
}

// Tauri: bundle productName + window title.
stamp('src-tauri/tauri.conf.json', [/("productName":\s*)"[^"]*"/, /("title":\s*)"[^"]*"/])
// PWA manifest: name + short_name.
stamp('src-pwa/manifest.json', [/("name":\s*)"[^"]*"/, /("short_name":\s*)"[^"]*"/])
