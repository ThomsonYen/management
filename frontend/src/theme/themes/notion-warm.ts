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
      fgMuted:       '80 74 68',
      fgSubtle:      '108 100 92',
      fgFaint:       '145 138 130',
      fgOnAccent:    '255 251 235',

      borderDefault: '220 212 200',
      borderStrong:  '200 192 178',
      borderSubtle:  '235 228 215',

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
      warningVivid:  '202 138 4',
      success:       '22 163 74',
      successBg:     '220 252 231',
      info:          '30 64 175',
      infoBg:        '224 231 255',

      prioCritical:  '168 30 100',
      prioCriticalBg:'253 240 247',
      prioHigh:      '190 75 20',
      prioHighBg:    '255 237 213',

      wait:          '91 84 196',
      waitBg:        '240 239 252',
      waitBorder:    '207 204 240',

      focusRing:     '217 119 6',
    },
    dark: {
      bgApp:         '20 18 15',
      bgSurface:     '32 28 24',
      bgElevated:    '41 37 32',
      bgOverlay:     '48 44 38',
      bgInset:       '26 22 19',

      fgDefault:     '245 240 232',
      fgMuted:       '190 182 172',
      fgSubtle:      '155 146 135',
      fgFaint:       '128 120 110',
      fgOnAccent:    '30 20 10',

      borderDefault: '72 62 52',
      borderStrong:  '92 82 70',
      borderSubtle:  '55 48 40',

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
      warningVivid:  '250 204 21',
      success:       '74 222 128',
      successBg:     '20 46 30',
      info:          '129 140 248',
      infoBg:        '30 30 60',

      prioCritical:  '240 120 180',
      prioCriticalBg:'58 20 42',
      prioHigh:      '251 146 60',
      prioHighBg:    '60 32 12',

      wait:          '170 170 245',
      waitBg:        '36 34 60',
      waitBorder:    '62 60 100',

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
