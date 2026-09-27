// Render the home-screen / PWA PNGs from public/logo.svg.
//
//   cd frontend
//   npm i --no-save playwright && npx playwright install chromium
//   node scripts/render-icons.cjs
//
// Writes public/icons/tracker-<ICON_VERSION>-*.png (see below).
//
// All but the maskable icon are full-bleed (the OS rounds the corners);
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

// Icons live at versioned URLs because iOS caches home-screen icons by URL and
// never refetches one it has seen, even after the app is removed and re-added.
// After changing logo.svg, bump ICON_VERSION and update the references in
// index.html and vite.config.ts (the manifest) to match.
const ICON_VERSION = 'v2'
const targets = [
  [`icons/tracker-${ICON_VERSION}-180.png`, 180, logo],
  [`icons/tracker-${ICON_VERSION}-192.png`, 192, logo],
  [`icons/tracker-${ICON_VERSION}-512.png`, 512, logo],
  [`icons/tracker-${ICON_VERSION}-512-maskable.png`, 512, maskable],
  // Safari also probes this fixed path when a page declares no icon
  ['apple-touch-icon.png', 180, logo],
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
