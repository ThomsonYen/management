import type { ThemePreset } from './types'

// Cool, high-contrast, vibrant. Blue accent.
export const vercelDark: ThemePreset = {
  name: 'vercel-dark',
  label: 'Vercel (Cool)',
  description: 'Cool zinc neutrals with a vibrant blue accent.',
  colors: {
    light: {
      bgApp:         '250 250 250',
      bgSurface:     '255 255 255',
      bgElevated:    '255 255 255',
      bgOverlay:     '255 255 255',
      bgInset:       '244 244 245',

      fgDefault:     '9 9 11',
      fgMuted:       '82 82 91',
      fgSubtle:      '113 113 122',
      fgFaint:       '161 161 170',
      fgOnAccent:    '255 255 255',

      borderDefault: '228 228 231',
      borderStrong:  '212 212 216',
      borderSubtle:  '244 244 245',

      accent1:       '239 246 255',
      accent2:       '219 234 254',
      accent:        '37 99 235',
      accentHover:   '29 78 216',
      accentActive:  '30 64 175',
      accentFg:      '30 58 138',

      danger:        '220 38 38',
      dangerBg:      '254 242 242',
      warning:       '217 119 6',
      warningBg:     '254 243 199',
      success:       '22 163 74',
      successBg:     '220 252 231',
      info:          '8 145 178',
      infoBg:        '207 250 254',

      focusRing:     '59 130 246',
    },
    dark: {
      bgApp:         '0 0 0',
      bgSurface:     '17 17 17',
      bgElevated:    '26 26 26',
      bgOverlay:     '38 38 38',
      bgInset:       '10 10 10',

      fgDefault:     '250 250 250',
      fgMuted:       '163 163 163',
      fgSubtle:      '115 115 115',
      fgFaint:       '82 82 82',
      fgOnAccent:    '255 255 255',

      borderDefault: '38 38 38',
      borderStrong:  '64 64 64',
      borderSubtle:  '26 26 26',

      accent1:       '15 23 42',
      accent2:       '30 41 59',
      accent:        '59 130 246',
      accentHover:   '96 165 250',
      accentActive:  '147 197 253',
      accentFg:      '191 219 254',

      danger:        '248 113 113',
      dangerBg:      '60 20 20',
      warning:       '250 204 21',
      warningBg:     '60 40 10',
      success:       '52 211 153',
      successBg:     '12 46 33',
      info:          '34 211 238',
      infoBg:        '18 46 58',

      focusRing:     '96 165 250',
    },
  },
  typography: {
    fontSans: "'Geist', 'Inter var', Inter, ui-sans-serif, system-ui, -apple-system, sans-serif",
    fontMono: "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
    featureSettings: "'ss01'",
    fontImportUrl: 'https://rsms.me/inter/inter.css',
  },
}
