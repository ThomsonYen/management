import type { ThemePreset } from './types'

// Warm, cozy variant. Stone neutrals, softer accent.
export const notionWarm: ThemePreset = {
  name: 'notion-warm',
  label: 'Notion (Warm)',
  description: 'Warmer stone neutrals with amber accent.',
  colors: {
    light: {
      bgApp:         '250 249 246',
      bgSurface:     '255 254 251',
      bgElevated:    '255 254 251',
      bgOverlay:     '255 255 255',
      bgInset:       '245 243 238',

      fgDefault:     '41 37 36',
      fgMuted:       '87 83 78',
      fgSubtle:      '120 113 108',
      fgFaint:       '168 162 158',
      fgOnAccent:    '255 251 235',

      borderDefault: '231 224 213',
      borderStrong:  '214 206 194',
      borderSubtle:  '245 240 230',

      accent1:       '254 243 199',
      accent2:       '253 230 138',
      accent:        '217 119 6',
      accentHover:   '180 83 9',
      accentActive:  '146 64 14',
      accentFg:      '120 53 15',

      danger:        '190 18 60',
      dangerBg:      '255 241 242',
      warning:       '202 138 4',
      warningBg:     '254 249 195',
      success:       '22 163 74',
      successBg:     '220 252 231',
      info:          '30 64 175',
      infoBg:        '224 231 255',

      focusRing:     '217 119 6',
    },
    dark: {
      bgApp:         '20 18 15',
      bgSurface:     '32 28 24',
      bgElevated:    '41 37 32',
      bgOverlay:     '48 44 38',
      bgInset:       '26 22 19',

      fgDefault:     '245 240 232',
      fgMuted:       '180 172 162',
      fgSubtle:      '136 128 118',
      fgFaint:       '100 92 84',
      fgOnAccent:    '30 20 10',

      borderDefault: '58 50 42',
      borderStrong:  '75 66 56',
      borderSubtle:  '42 36 30',

      accent1:       '58 32 6',
      accent2:       '82 45 10',
      accent:        '245 158 11',
      accentHover:   '251 191 36',
      accentActive:  '253 224 71',
      accentFg:      '254 243 199',

      danger:        '251 113 133',
      dangerBg:      '60 20 30',
      warning:       '250 204 21',
      warningBg:     '58 44 8',
      success:       '74 222 128',
      successBg:     '20 46 30',
      info:          '129 140 248',
      infoBg:        '30 30 60',

      focusRing:     '251 191 36',
    },
  },
  typography: {
    fontSans: "'Inter var', Inter, ui-sans-serif, system-ui, -apple-system, sans-serif",
    fontMono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    featureSettings: "'cv11', 'ss01'",
    fontImportUrl: 'https://rsms.me/inter/inter.css',
  },
}
