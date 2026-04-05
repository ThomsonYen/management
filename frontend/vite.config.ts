import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
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

const keyPath = path.resolve(__dirname, 'localhost-key.pem')
const certPath = path.resolve(__dirname, 'localhost.pem')
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

export default defineConfig({
  plugins: [react(), ...(httpsConfig ? [hstsPlugin()] : [])],
  define: {
    __FRONTEND_CONFIG__: JSON.stringify(getFrontendConfig()),
  },
  server: {
    host: 'localhost',
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
