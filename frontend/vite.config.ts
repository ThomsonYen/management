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
  return yaml.load(content) as { todo_done_fade_seconds: number }
}

export default defineConfig({
  plugins: [react()],
  define: {
    __FRONTEND_CONFIG__: JSON.stringify(getFrontendConfig()),
  },
  server: {
    proxy: {
      '/api': {
        target: `http://localhost:${getBackendPort()}`,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
})
