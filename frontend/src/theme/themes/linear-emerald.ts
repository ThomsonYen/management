import type { ThemePreset } from './types'

// Default theme: Linear/Notion-style modern-minimal with emerald accent.
export const linearEmerald: ThemePreset = {
  name: 'linear-emerald',
  label: 'Linear (Emerald)',
  description: 'Modern minimal, near-black dark mode, emerald accent.',
  colors: {
    light: {
      bgApp:         '250 250 249',
      bgSurface:     '255 255 255',
      bgElevated:    '255 255 255',
      bgOverlay:     '255 255 255',
      bgInset:       '245 245 244',

      fgDefault:     '24 24 27',
      fgMuted:       '75 75 84',
      fgSubtle:      '100 100 110',
      fgFaint:       '138 138 148',
      fgOnAccent:    '255 255 255',

      borderDefault: '220 220 224',
      borderStrong:  '200 200 205',
      borderSubtle:  '232 232 235',

      accent1:       '236 253 245',
      accent2:       '209 250 229',
      accent:        '16 185 129',
      accentHover:   '5 150 105',
      accentActive:  '4 120 87',
      accentFg:      '6 78 59',

      danger:        '220 38 38',
      dangerBg:      '254 242 242',
      warning:       '217 119 6',
      warningBg:     '254 243 199',
      success:       '5 150 105',
      successBg:     '209 250 229',
      info:          '37 99 235',
      infoBg:        '219 234 254',

      focusRing:     '16 185 129',
    },
    dark: {
      bgApp:         '10 10 10',
      bgSurface:     '20 20 22',
      bgElevated:    '28 28 30',
      bgOverlay:     '36 36 40',
      bgInset:       '15 15 17',

      fgDefault:     '240 240 240',
      fgMuted:       '185 185 190',
      fgSubtle:      '150 150 158',
      fgFaint:       '122 122 130',
      fgOnAccent:    '8 15 12',

      borderDefault: '52 52 56',
      borderStrong:  '75 75 80',
      borderSubtle:  '42 42 46',

      accent1:       '6 46 33',
      accent2:       '8 63 45',
      accent:        '16 185 129',
      accentHover:   '52 211 153',
      accentActive:  '110 231 183',
      accentFg:      '167 243 208',

      danger:        '248 113 113',
      dangerBg:      '60 20 20',
      warning:       '251 191 36',
      warningBg:     '60 40 10',
      success:       '52 211 153',
      successBg:     '12 46 33',
      info:          '96 165 250',
      infoBg:        '18 32 62',

      focusRing:     '52 211 153',
    },
  },
  typography: {
    fontSans: "'Inter var', Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
    fontMono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    featureSettings: "'cv11', 'ss01', 'ss03'",
    fontImportUrl: 'https://rsms.me/inter/inter.css',
  },
}
