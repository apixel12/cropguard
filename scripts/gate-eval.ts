// Runs the app's real quality gate (src/ml/qualityGate.ts) over generated stress sets.
import { readFileSync } from 'node:fs'
import { analyzePixels } from '../src/ml/qualityGate.ts'
const dir = process.argv[2]
const index = JSON.parse(readFileSync(`${dir}/index.json`, 'utf8'))
const S = 160 * 160 * 4
const out: Record<string, unknown> = {}
for (const [name, { file, n }] of Object.entries<{ file: string; n: number }>(index)) {
  const buf = new Uint8ClampedArray(readFileSync(`${dir}/${file}`))
  let rejected = 0
  const why: Record<string, number> = {}
  for (let i = 0; i < n; i++) {
    const r = analyzePixels(buf.subarray(i * S, (i + 1) * S), 160, 160, 224, 224)
    if (!r.ok) rejected++
    for (const k of r.issues) why[k] = (why[k] ?? 0) + 1
  }
  out[name] = { rejected: rejected / n, why }
  console.log(`${name.padEnd(34)} gate rejects ${(100 * rejected / n).toFixed(0).padStart(3)}%  ${JSON.stringify(why)}`)
}
