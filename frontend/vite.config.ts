import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function getBackendPort(): number {
  const configPath = path.resolve(__dirname, '../project_config.yaml')
  const content = fs.readFileSync(configPath, 'utf-8')
  const match = content.match(/port:\s*(\d+)/)
  return match ? parseInt(match[1], 10) : 8001
}

function getFrontendConfig() {
  const configPath = path.resolve(__dirname, '_frontend_config.yaml')
  const content = fs.readFileSync(configPath, 'utf-8')
  return yaml.load(content) as { todo_done_fade_seconds: number; unfocus_fade_seconds: number; goal_day_box_height_px: number }
}

const keyPath = path.resolve(__dirname, 'dev.localhost-key.pem')
const certPath = path.resolve(__dirname, 'dev.localhost.pem')
const httpsConfig = fs.existsSync(keyPath) && fs.existsSync(certPath)
  ? { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) }
  : undefined

function hstsPlugin() {
  return {
    name: 'hsts-header',
    configureServer(server: import('vite').ViteDevServer) {
      server.middlewares.use((_req, res, next) => {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
        next()
      })
    },
  }
}

const DEV_HOST = 'dev.localhost'
const DEV_PORT = 5173

// Precache the app shell aggressively; never SW-cache /api — live data belongs
// to TanStack Query, and SW-cached authed JSON would go stale and leak across logins.
const pwaPlugin = VitePWA({
  registerType: 'autoUpdate',
  manifest: {
    name: 'Management',
    short_name: 'Management',
    display: 'standalone',
    start_url: '/',
    scope: '/',
    background_color: '#fafaf9', // linear-emerald light bgApp
    theme_color: '#fafaf9',
    icons: [
      { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/pwa-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: {
    // The single SPA bundle is ~2.1 MB; it must be precached for offline launch.
    maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
    navigateFallback: '/index.html',
    navigateFallbackDenylist: [/^\/api\//],
    runtimeCaching: [
      { urlPattern: /^\/api\//, handler: 'NetworkOnly' },
      {
        // Theme font stylesheets + font files (Google Fonts) — cache so the
        // installed app keeps its typography offline.
        urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'theme-fonts',
          expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
        },
      },
    ],
  },
})

export default defineConfig({
  plugins: [react(), pwaPlugin, ...(httpsConfig ? [hstsPlugin()] : [])],
  define: {
    __FRONTEND_CONFIG__: JSON.stringify(getFrontendConfig()),
    __APP_VERSION__: JSON.stringify(
      JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8')).version
    ),
  },
  server: {
    host: DEV_HOST,
    port: DEV_PORT,
    ...(httpsConfig ? { https: httpsConfig } : {}),
    proxy: {
      '/api': {
        target: `http://localhost:${getBackendPort()}`,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
})
