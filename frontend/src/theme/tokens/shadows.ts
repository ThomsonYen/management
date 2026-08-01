// Shadow scale. Restrained by default (Linear/Notion-style).
// To make the whole app more/less dramatic, edit this file.

export interface ShadowsConfig {
  xs: string
  sm: string
  md: string
  lg: string
  popover: string
  overlay: string
}

export const DEFAULT_SHADOWS: ShadowsConfig = {
  xs: '0 1px 0 rgb(0 0 0 / 0.04)',
  sm: '0 1px 2px rgb(0 0 0 / 0.04), 0 1px 1px rgb(0 0 0 / 0.03)',
  md: '0 2px 4px rgb(0 0 0 / 0.04), 0 4px 8px rgb(0 0 0 / 0.04)',
  lg: '0 4px 12px rgb(0 0 0 / 0.06), 0 8px 24px rgb(0 0 0 / 0.06)',
  popover: '0 0 0 1px rgb(0 0 0 / 0.06), 0 8px 24px rgb(0 0 0 / 0.12)',
  overlay: '0 0 0 1px rgb(0 0 0 / 0.06), 0 24px 48px rgb(0 0 0 / 0.16)',
}
