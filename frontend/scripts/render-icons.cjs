// Render the home-screen / PWA PNGs from public/logo.svg.
//
//   cd frontend
//   npm i --no-save playwright && npx playwright install chromium
//   node scripts/render-icons.cjs
//
// apple-touch-icon and pwa-* are full-bleed (the OS rounds the corners);
// the maskable icon shrinks the artwork into Android's safe zone.
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright')

const pub = path.resolve(__dirname, '../public')
const logo = fs.readFileSync(path.join(pub, 'logo.svg'), 'utf8').replace(/<!--[\s\S]*?-->/, '').trim()

// Maskable: keep the tile full-bleed but scale the artwork to 72% around the centre.
const maskable = logo.replace(
  /(<rect[^>]*\/>)([\s\S]*)<\/svg>/,
  (_, rect, art) => `${rect}<g transform="translate(32 32) scale(0.72) translate(-32 -32)">${art}</g></svg>`,
)

const targets = [
  ['apple-touch-icon.png', 180, logo],
  ['pwa-192.png', 192, logo],
  ['pwa-512.png', 512, logo],
  ['pwa-512-maskable.png', 512, maskable],
]

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  for (const [file, size, svg] of targets) {
    await page.setViewportSize({ width: size, height: size })
    await page.setContent(
      `<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
    )
    await page.screenshot({ path: path.join(pub, file), omitBackground: true })
    console.log(`wrote public/${file} (${size}×${size})`)
  }
  await browser.close()
})()
