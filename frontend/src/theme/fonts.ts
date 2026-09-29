// Interface font choices (Settings → Font). 'theme' keeps the active theme's own
// font; any other choice overrides --font-sans for the whole app.
//
// Avenir, Gill Sans, Futura and Helvetica Neue ship with macOS and iOS and can't
// be served from the web, so each Apple font falls back to a close Google Fonts
// match (loaded only when that choice is active) on Windows, Android and Linux.

export interface FontFamilyOption {
  label: string
  /** CSS font-family stack; empty for 'theme' */
  stack: string
  /** Google Fonts stylesheet for the web fallback, if the stack uses one */
  importUrl?: string
  note?: string
}

const gf = (family: string) =>
  `https://fonts.googleapis.com/css2?family=${family}:wght@400;500;600;700&display=swap`

export const FONT_FAMILIES = {
  theme: {
    label: 'Theme default',
    stack: '',
  },
  avenir: {
    label: 'Avenir',
    stack: "'Avenir Next', Avenir, 'Nunito Sans', ui-sans-serif, system-ui, sans-serif",
    importUrl: gf('Nunito+Sans'),
    note: 'Nunito Sans off Apple devices',
  },
  'gill-sans': {
    label: 'Gill Sans',
    stack: "'Gill Sans', 'Gill Sans MT', Lato, ui-sans-serif, system-ui, sans-serif",
    importUrl: gf('Lato'),
    note: 'Lato off Apple devices',
  },
  futura: {
    label: 'Futura',
    stack: "Futura, 'Futura PT', Jost, ui-sans-serif, system-ui, sans-serif",
    importUrl: gf('Jost'),
    note: 'Jost off Apple devices',
  },
  helvetica: {
    label: 'Helvetica Neue',
    stack: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  },
  system: {
    label: 'System',
    stack: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, ui-sans-serif, sans-serif",
    note: 'San Francisco on Apple devices',
  },
  'dm-sans': {
    label: 'DM Sans',
    stack: "'DM Sans', ui-sans-serif, system-ui, sans-serif",
    importUrl: gf('DM+Sans'),
  },
  georgia: {
    label: 'Georgia',
    stack: "Georgia, 'Times New Roman', serif",
    note: 'Serif; your system serif on Android',
  },
} as const satisfies Record<string, FontFamilyOption>

export type FontFamily = keyof typeof FONT_FAMILIES

export const DEFAULT_FONT_FAMILY: FontFamily = 'theme'

export function isFontFamily(v: unknown): v is FontFamily {
  return typeof v === 'string' && v in FONT_FAMILIES
}

const loaded = new Set<string>()

function loadWebFallback(opt: FontFamilyOption): void {
  const url = opt.importUrl
  if (!url || loaded.has(url)) return
  loaded.add(url)
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = url
  document.head.appendChild(link)
}

/** Load every web fallback, so a picker can preview each choice in its own font. */
export function loadAllFontFamilies(): void {
  Object.values(FONT_FAMILIES).forEach(loadWebFallback)
}

// Lowercase height (x-height ÷ font size) of Inter, which the themes use.
// Faces draw their letters at different heights within the same font size
// (Gill Sans is ~13% shorter than Inter), so every other choice is scaled with
// font-size-adjust to this x-height and text looks the same size in any font.
export const REFERENCE_X_HEIGHT = 0.516

// ─── Note font (Settings → Note font) ──────────────────────────────────────
// The font of note bodies and titles, chosen separately from the app font.
// Same choices; 'theme' here means "same as the app font". Applied as
// --font-note on <html>, which the `font-note` utility and editors read.

export const NOTE_FONT_LABELS: Partial<Record<FontFamily, string>> = { theme: 'Same as app font' }

export const DEFAULT_NOTE_FONT_FAMILY: FontFamily = 'georgia'

export function applyNoteFontFamily(family: FontFamily): void {
  const opt: FontFamilyOption = FONT_FAMILIES[family] ?? FONT_FAMILIES.theme
  loadWebFallback(opt)
  const root = document.documentElement.style
  if (opt.stack) root.setProperty('--font-note', opt.stack)
  else root.removeProperty('--font-note')
}

/** Load `family`'s web fallback (if any) and point --font-sans at it. */
export function applyFontFamily(family: FontFamily): void {
  const opt: FontFamilyOption = FONT_FAMILIES[family] ?? FONT_FAMILIES.theme
  loadWebFallback(opt)
  // Inline on <html> so it wins over the theme's --font-sans from applyTheme().
  const root = document.documentElement.style
  if (opt.stack) {
    root.setProperty('--font-sans', opt.stack)
    root.setProperty('font-size-adjust', String(REFERENCE_X_HEIGHT))
  } else {
    root.removeProperty('--font-sans')
    root.removeProperty('font-size-adjust')
  }
}
