// Offline acceptance test (spec §29) in real Chrome: load online, wait for
// "AI ready offline", go offline, reload, scan from gallery and camera, check
// history. Run: npm run build && npx vite preview & npm run test:e2e
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'
mkdirSync('test-results', { recursive: true })
const URL = process.env.E2E_URL ?? 'http://localhost:4173/'
const browser = await chromium.launch({ channel: 'chrome', headless: true,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, permissions: ['camera'],
  reducedMotion: 'reduce' }) // screenshots show the settled screen, not a frame mid-animation
const page = await ctx.newPage()
// any CSP / Trusted Types violation surfaces as a console error and fails the run.
// One is expected and wanted: tfjs-core's Long.js probes WebAssembly inside a
// try/catch and falls back to JS when the CSP (deliberately) blocks it.
await page.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => {
  if (e.blockedURI === 'wasm-eval') return
  console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI} ${e.sourceFile}:${e.lineNumber}`)
}))
const log = []
page.on('console', m => { if (m.type() === 'error') log.push('console error: ' + m.text()) })
const t = Date.now()
const first = await page.goto(URL)
const hdr = first.headers()
const security = { csp: /require-trusted-types-for/.test(hdr['content-security-policy'] ?? ''), coep: hdr['cross-origin-embedder-policy'] }
await page.getByText(/works offline|Everything still works/).waitFor({ timeout: 90000 })
const online = { readyMs: Date.now() - t }
online.cached = await page.evaluate(async () => {
  const urls = (await Promise.all((await caches.keys()).map(async k => (await (await caches.open(k)).keys()).map(r => new URL(r.url).pathname)))).flat()
  return { total: urls.length, models: urls.filter(u => u.startsWith('/models/')).sort() }
})
await page.screenshot({ path: 'test-results/1-home-online.png' })

// ---- go offline (airplane mode) and reload
await ctx.setOffline(true)
const offlineReq = []
page.on('request', r => offlineReq.push(r.url().replace(URL, '/')))
page.on('requestfailed', r => log.push('FAILED offline: ' + r.url()))
await page.reload()
await page.getByText(/works offline|Everything still works/).waitFor({ timeout: 60000 })
await page.screenshot({ path: 'test-results/2-home-offline.png' })

// ---- lemon scan from gallery
await page.getByRole('button', { name: /Check a leaf/ }).click()
await page.locator('input[type=file]').setInputFiles(process.env.E2E_PHOTO ?? 'tests/e2e/healthy-lemon.jpg')
await page.getByRole('button', { name: 'Check this leaf' }).click()
await page.locator('.verdict').waitFor({ timeout: 30000 }) // plant identified automatically, no picker
const verdict = (await page.locator('.verdict').innerText()).split('\n').filter(Boolean).slice(0, 3).join(' | ')
const meta = await page.locator('.fine-print').last().innerText()
await page.screenshot({ path: 'test-results/3-result-offline.png', fullPage: true })

// ---- camera capture path (Chrome fake camera), still offline
const plantLine = await page.locator('.plant-line').innerText()
await page.getByRole('button', { name: 'Check another leaf' }).click()
await page.getByRole('button', { name: 'Take photo' }).waitFor({ timeout: 15000 })
await page.screenshot({ path: 'test-results/4-camera.png' })
await page.getByRole('button', { name: 'Take photo' }).click()
await page.getByRole('button', { name: 'Check this leaf' }).click()
// the fake camera shows a test pattern, not a plant: expect "Which plant is this?"
await page.locator('.verdict, h1:has-text("Which plant is this?")').first().waitFor({ timeout: 30000 })
const askedForPlant = await page.getByRole('heading', { name: 'Which plant is this?' }).isVisible()
if (askedForPlant) await page.getByRole('button', { name: /^Lemon/ }).first().click()
await page.locator('.verdict').waitFor({ timeout: 30000 })
const cameraOutcome = (await page.locator('.verdict').innerText()).split('\n').filter(Boolean).slice(2, 5).join(' | ')

// ---- farmer mode + video upload, still offline
await page.getByRole('button', { name: 'Home' }).click()
await page.getByRole('radio', { name: /Farmer/ }).click()
await page.getByRole('button', { name: /Check a leaf/ }).click()
// make a real 2-second video in the browser (canvas + MediaRecorder) from the test photo
const webm = await page.evaluate(async (src) => {
  const img = new Image(); img.src = src; await img.decode()
  const c = document.createElement('canvas'); c.width = 640; c.height = 640
  const ctx = c.getContext('2d'); const rec = new MediaRecorder(c.captureStream(15), { mimeType: 'video/webm' })
  const parts = []; rec.ondataavailable = (e) => parts.push(e.data); rec.start()
  const t0 = performance.now()
  while (performance.now() - t0 < 2000) { const d = Math.sin((performance.now() - t0) / 200) * 6; ctx.drawImage(img, d, d, 640, 640); await new Promise((r) => setTimeout(r, 60)) }
  rec.stop(); await new Promise((r) => (rec.onstop = r))
  const buf = await new Blob(parts, { type: 'video/webm' }).arrayBuffer()
  return Array.from(new Uint8Array(buf))
}, 'data:image/jpeg;base64,' + (await import('node:fs')).readFileSync(process.env.E2E_PHOTO ?? 'tests/e2e/healthy-lemon.jpg').toString('base64'))
await page.locator('input[type=file]').setInputFiles({ name: 'leaf.webm', mimeType: 'video/webm', buffer: Buffer.from(webm) })
await page.getByText(/Video captured/).waitFor({ timeout: 30000 })
await page.getByRole('button', { name: 'Check this leaf' }).click()
await page.locator('.verdict, h1:has-text("Which plant is this?"), h1:has-text("needs retaking")').first().waitFor({ timeout: 30000 })
if (await page.getByRole('heading', { name: 'Which plant is this?' }).isVisible()) await page.getByRole('button', { name: /^Lemon/ }).first().click()
await page.locator('.verdict').waitFor({ timeout: 30000 })
const videoMeta = await page.locator('.fine-print').last().innerText()
const farmerPanel = await page.locator('.panel.farmer').count()
await page.screenshot({ path: 'test-results/5-video-farmer.png', fullPage: true })

// ---- two photos in one check, still offline
await page.getByRole('button', { name: 'Home' }).click()
await page.getByRole('button', { name: /Check a leaf/ }).click()
const photo = process.env.E2E_PHOTO ?? 'tests/e2e/healthy-lemon.jpg'
await page.locator('input[type=file]').setInputFiles([photo, photo])
await page.getByRole('button', { name: 'Check 2 photos' }).click()
await page.locator('.verdict, h1:has-text("Which plant is this?")').first().waitFor({ timeout: 30000 })
if (await page.getByRole('heading', { name: 'Which plant is this?' }).isVisible()) await page.getByRole('button', { name: /^Lemon/ }).first().click()
await page.locator('.verdict').waitFor({ timeout: 30000 })
const multiMeta = await page.locator('.fine-print').last().innerText()

// ---- history offline
await page.getByRole('button', { name: 'Home' }).click()
await page.getByRole('button', { name: 'History' }).first().click()
await page.locator('.list-row').first().waitFor({ timeout: 10000 })
const historyCount = await page.locator('.list-row').count()
await page.screenshot({ path: 'test-results/6-history.png' })

// Probes: these must be refused by the browser (they log violations, so drop those lines)
const before = log.length
Object.assign(security, await page.evaluate(() => {
  let trustedTypesBlocksHtml = false
  try { document.createElement('div').innerHTML = '<img src=x onerror=alert(1)>' } catch { trustedTypesBlocksHtml = true }
  return { crossOriginIsolated, trustedTypesBlocksHtml }
}))
await page.waitForTimeout(300)
log.splice(before)
console.log(JSON.stringify({ security, online, offline: { verdict, plantLine, meta, askedForPlant, cameraOutcome, videoMeta, multiMeta, farmerPanel, historyCount,
  requestsWhileOffline: [...new Set(offlineReq)].filter(u => !u.startsWith('blob:') && !u.startsWith('data:')) }, errors: log }, null, 2))
await browser.close()
const fail = !security.csp || !security.crossOriginIsolated || !security.trustedTypesBlocksHtml || !verdict || !/Lemon/.test(plantLine) || !/sharpest frames/.test(videoMeta) || !/combining your 2 photos/.test(multiMeta) || historyCount < 3 || log.length > 0
if (fail) { console.error('E2E FAILED'); process.exit(1) }
console.log('E2E PASSED')
