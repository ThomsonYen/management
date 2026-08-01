// Semantic color slugs used across the app.
// Every theme preset must supply values for both light and dark.
// Values are stored as "R G B" strings so Tailwind can consume them via `rgb(var(--x) / <alpha>)`.

export interface ColorScheme {
  // Surfaces (backgrounds, layered)
  bgApp: string        // page background
  bgSurface: string    // primary card/panel surface
  bgElevated: string   // popovers, dropdowns, modals
  bgOverlay: string    // top-most overlays
  bgInset: string      // recessed areas (search bars, inputs)

  // Text
  fgDefault: string
  fgMuted: string
  fgSubtle: string
  fgFaint: string
  fgOnAccent: string

  // Borders
  borderDefault: string
  borderStrong: string
  borderSubtle: string

  // Accent (brand)
  accent1: string      // tint bg
  accent2: string      // tint bg strong
  accent: string       // primary
  accentHover: string  // hover
  accentActive: string // pressed
  accentFg: string     // on tint bg

  // Semantic tones
  danger: string
  dangerBg: string
  warning: string
  warningBg: string
  success: string
  successBg: string
  info: string
  infoBg: string

  // Focus ring
  focusRing: string
}

// Map of internal token key -> CSS variable name emitted onto :root / .dark.
// Keep in sync with tailwind.config.cjs colors extension.
export const COLOR_VAR_MAP: Record<keyof ColorScheme, string> = {
  bgApp: '--bg-app',
  bgSurface: '--bg-surface',
  bgElevated: '--bg-elevated',
  bgOverlay: '--bg-overlay',
  bgInset: '--bg-inset',
  fgDefault: '--fg-default',
  fgMuted: '--fg-muted',
  fgSubtle: '--fg-subtle',
  fgFaint: '--fg-faint',
  fgOnAccent: '--fg-on-accent',
  borderDefault: '--border-default',
  borderStrong: '--border-strong',
  borderSubtle: '--border-subtle',
  accent1: '--accent-1',
  accent2: '--accent-2',
  accent: '--accent',
  accentHover: '--accent-hover',
  accentActive: '--accent-active',
  accentFg: '--accent-fg',
  danger: '--danger',
  dangerBg: '--danger-bg',
  warning: '--warning',
  warningBg: '--warning-bg',
  success: '--success',
  successBg: '--success-bg',
  info: '--info',
  infoBg: '--info-bg',
  focusRing: '--focus-ring',
}
