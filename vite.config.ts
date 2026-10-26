/// <reference types="vitest/config" />
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import securityHeaders from './security-headers.json' with { type: 'json' }

// Explicitly enumerate every model file so each shard is precached by name
// (a "/models/" prefix alone does not guarantee shards are cached).
const MODEL_DIRS = ['router-v2', 'lemon-v1', 'crops-v2']
const modelFiles = MODEL_DIRS.flatMap((d) => {
  const dir = `public/models/${d}`
  return existsSync(dir)
    ? readdirSync(dir).filter((f) => f.endsWith('.json') || f.endsWith('.bin')).sort().map((f) => `models/${d}/${f}`)
    : []
})

// SHA-256 of every model file, compiled into the (hashed) JS bundle; the app
// refuses any model file whose bytes don't match (src/security/integrity.ts).
function modelIntegrity(): Plugin {
  const id = 'virtual:model-integrity'
  return {
    name: 'model-integrity',
    resolveId: (s) => (s === id ? '\0' + id : undefined),
    load(s) {
      if (s !== '\0' + id) return
      const table: Record<string, string> = {}
      for (const f of modelFiles) {
        table[`/${f}`] = 'sha256-' + createHash('sha256').update(readFileSync(`public/${f}`)).digest('base64')
      }
      return `export default ${JSON.stringify(table)}`
    },
  }
}

// Accounts are optional; if a Supabase project is configured, the CSP must allow exactly
// that origin, otherwise sign-in would silently fail (or someone might loosen the CSP by hand).
function assertAuthCsp(): Plugin {
  let devServer = false
  return {
    name: 'assert-auth-csp',
    config(_c, env) { devServer = env.command === 'serve' && !env.isPreview }, // dev server sends no security headers
    configResolved(c) {
      if (devServer) return
      const url = c.env.VITE_SUPABASE_URL as string | undefined
      if (url && !securityHeaders['Content-Security-Policy'].includes(`connect-src 'self' ${url} `))
        throw new Error(`VITE_SUPABASE_URL is set but the CSP does not allow ${url}. Run: node scripts/set-auth-csp.mjs`)
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    modelIntegrity(),
    assertAuthCsp(),
    VitePWA({
      registerType: 'prompt', // never reload mid-scan: a new version takes over on next launch
      includeAssets: ['icons/*.png', 'icons/*.svg', ...modelFiles],
      manifest: {
        name: 'CropGuard',
        short_name: 'CropGuard',
        description: 'Offline plant-leaf disease screening. Photos stay on your device.',
        theme_color: '#2f6b3a',
        background_color: '#f7f6f1',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,woff2}'],
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/\.well-known\//], // security.txt must stay a text file
        cleanupOutdatedCaches: true,
        // one self-contained sw.js: the CSP's Trusted Types rule (sent with sw.js too)
        // blocks importScripts(), which the default split Workbox runtime relies on
        inlineWorkboxRuntime: true,
      },
    }),
  ],
  // same headers as production (vercel.json), so the CSP is exercised before deploy
  preview: { headers: securityHeaders },
  test: {
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
  },
})
