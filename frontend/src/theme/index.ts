import { linearEmerald } from './themes/linear-emerald'
import { notionWarm } from './themes/notion-warm'
import { vercelDark } from './themes/vercel-dark'
import { COLOR_VAR_MAP, type ColorScheme } from './tokens/colors'
import type { ThemePreset } from './themes/types'

export * from './tokens/typography'
export type { ThemePreset } from './themes/types'

// ─── Registry ────────────────────────────────────────────────────────────────
// Adding a new theme: create a file in themes/, import it, and add it here.

export const THEMES = {
  'linear-emerald': linearEmerald,
  'notion-warm':    notionWarm,
  'vercel-dark':    vercelDark,
} as const satisfies Record<string, ThemePreset>

export type ThemeName = keyof typeof THEMES

export const DEFAULT_THEME: ThemeName = 'linear-emerald'

export function listThemes(): { name: ThemeName; label: string; description?: string }[] {
  return Object.entries(THEMES).map(([name, preset]) => ({
    name: name as ThemeName,
    label: preset.label,
    description: preset.description,
  }))
}

// ─── Apply ───────────────────────────────────────────────────────────────────

const LS_KEY = 'theme.variant.v1'

let importedFontUrls = new Set<string>()

function ensureFontImport(url: string | undefined) {
  if (!url || importedFontUrls.has(url)) return
  importedFontUrls.add(url)
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = url
  link.dataset.themeFont = 'true'
  document.head.appendChild(link)
}

function emitColorVars(scheme: ColorScheme, target: 'light' | 'dark'): string {
  const selector = target === 'light' ? ':root' : '.dark'
  const lines: string[] = []
  ;(Object.keys(COLOR_VAR_MAP) as (keyof ColorScheme)[]).forEach((key) => {
    lines.push(`  ${COLOR_VAR_MAP[key]}: ${scheme[key]};`)
  })
  return `${selector} {\n${lines.join('\n')}\n}`
}

const STYLE_ID = 'theme-variables'

function ensureStyleTag(): HTMLStyleElement {
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = STYLE_ID
    document.head.appendChild(el)
  }
  return el
}

export function applyTheme(name: ThemeName): void {
  const preset = THEMES[name] ?? THEMES[DEFAULT_THEME]

  // 1) color CSS variables (light + dark)
  const css = [
    emitColorVars(preset.colors.light, 'light'),
    emitColorVars(preset.colors.dark, 'dark'),
    // typography onto :root
    `:root {
  --font-sans: ${preset.typography.fontSans};
  --font-mono: ${preset.typography.fontMono ?? 'ui-monospace, monospace'};
  --font-feature-settings: ${preset.typography.featureSettings ?? 'normal'};
}`,
  ].join('\n')
  ensureStyleTag().textContent = css

  // 2) optional font import
  ensureFontImport(preset.typography.fontImportUrl)

  // 3) persist choice
  try { localStorage.setItem(LS_KEY, name) } catch { /* ignore */ }

  // 4) mark active theme on <html> (useful for third-party integrations / debugging)
  document.documentElement.dataset.theme = name
}

export function getSavedTheme(): ThemeName {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw && raw in THEMES) return raw as ThemeName
  } catch { /* ignore */ }
  return DEFAULT_THEME
}

// Apply the saved theme synchronously as soon as this module is imported,
// so the first paint has real CSS variables (not the Tailwind defaults).
applyTheme(getSavedTheme())
