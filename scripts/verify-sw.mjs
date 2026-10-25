// Post-build check: every model file must be listed by name in the SW precache manifest.
import { readdirSync, readFileSync, existsSync } from 'node:fs'
const sw = readFileSync('dist/sw.js', 'utf8')
let missing = 0, total = 0
for (const d of ['router-v2', 'lemon-v1', 'crops-v2']) {
  const dir = `public/models/${d}`
  if (!existsSync(dir)) { console.warn(`! ${dir} missing`); missing++; continue }
  for (const f of readdirSync(dir)) {
    if (!/\.(json|bin)$/.test(f)) continue
    total++
    if (!sw.includes(`models/${d}/${f}`)) { console.error(`NOT PRECACHED: models/${d}/${f}`); missing++ }
  }
}
console.log(`${total - missing}/${total} model files precached`)
process.exit(missing ? 1 : 0)
