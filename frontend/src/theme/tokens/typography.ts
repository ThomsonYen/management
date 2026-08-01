// Named text roles. Every heading/body/label in the app should use one of these.
// To restyle typography app-wide, edit this file.

export const textRoles = {
  pageTitle:     'text-2xl font-semibold tracking-tight text-fg',
  sectionHeader: 'text-md font-semibold text-fg',
  subLabel:      'text-xs font-medium uppercase tracking-wider text-fg-subtle',
  body:          'text-sm text-fg',
  bodyMuted:     'text-sm text-fg-muted',
  meta:          'text-xs text-fg-subtle',
  micro:         'text-2xs text-fg-faint',
  cardTitle:     'text-sm font-semibold text-fg',
  fieldLabel:    'text-xs font-medium text-fg-muted',
  link:          'text-accent hover:underline underline-offset-2',
} as const

export type TextRole = keyof typeof textRoles

// Theme-level typography config. Each preset supplies this.
export interface TypographyConfig {
  fontSans: string
  fontMono?: string
  featureSettings?: string // e.g. "'cv11', 'ss01'"
  fontImportUrl?: string   // optional Google Fonts / rsms.me URL
}
