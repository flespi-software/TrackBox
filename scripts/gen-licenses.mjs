// Generate the third-party license list (production dependency graph) into
// src/third-party-licenses.json, which the in-app "Open-source licenses" screen
// imports. Most permissive licenses (MIT/BSD/ISC/Apache) require shipping their
// notice/text, so we read each package's LICENSE file and bundle it.
//
// Run via `npm run gen-licenses`; also wired into the dev/build commands so the
// list stays current when dependencies change.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const root = fileURLToPath(new URL('..', import.meta.url))
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

const LICENSE_FILES = [
  'LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE', 'LICENCE.md', 'LICENCE.txt',
  'license', 'license.md', 'COPYING', 'COPYING.md',
]

function resolvePkgJson(name) {
  const direct = join(root, 'node_modules', name, 'package.json')
  if (existsSync(direct)) return direct
  try {
    return require.resolve(`${name}/package.json`, { paths: [root] })
  } catch {
    return null
  }
}

function licenseOf(pj) {
  if (typeof pj.license === 'string') return pj.license
  if (pj.license && pj.license.type) return pj.license.type
  if (Array.isArray(pj.licenses)) return pj.licenses.map((l) => l.type || l).join(', ')
  return 'UNKNOWN'
}

const seen = new Set()
const out = []
const queue = Object.keys(pkg.dependencies || {})

while (queue.length) {
  const name = queue.shift()
  if (seen.has(name)) continue
  seen.add(name)
  const pjPath = resolvePkgJson(name)
  if (!pjPath) continue
  let pj
  try {
    pj = JSON.parse(readFileSync(pjPath, 'utf8'))
  } catch {
    continue
  }
  const dir = dirname(pjPath)
  let licenseText = ''
  for (const f of LICENSE_FILES) {
    const p = join(dir, f)
    if (existsSync(p)) {
      licenseText = readFileSync(p, 'utf8').trim()
      break
    }
  }
  const repo =
    pj.homepage ||
    (pj.repository && (typeof pj.repository === 'string' ? pj.repository : pj.repository.url)) ||
    ''
  out.push({
    name: pj.name || name,
    version: pj.version || '',
    license: licenseOf(pj),
    homepage: repo.replace(/^git\+/, '').replace(/\.git$/, ''),
    licenseText,
  })
  for (const d of Object.keys(pj.dependencies || {})) if (!seen.has(d)) queue.push(d)
}

out.sort((a, b) => a.name.localeCompare(b.name))
writeFileSync(join(root, 'src/third-party-licenses.json'), JSON.stringify(out) + '\n')
console.log(`[gen-licenses] ${out.length} packages → src/third-party-licenses.json`)
