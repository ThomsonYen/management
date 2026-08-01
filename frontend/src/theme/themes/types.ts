import type { ColorScheme } from '../tokens/colors'
import type { TypographyConfig } from '../tokens/typography'
import type { RadiiConfig } from '../tokens/radii'
import type { ShadowsConfig } from '../tokens/shadows'

export interface ThemePreset {
  name: string             // stable id, used in localStorage
  label: string            // shown in the theme picker
  description?: string
  colors: {
    light: ColorScheme
    dark: ColorScheme
  }
  typography: TypographyConfig
  radii?: Partial<RadiiConfig>
  shadows?: Partial<ShadowsConfig>
}
