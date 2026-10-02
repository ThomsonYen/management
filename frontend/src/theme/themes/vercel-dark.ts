import type { ThemePreset } from './types'

// Cool zinc neutrals with a clean blue accent. Status colours are clear, bright
// hues on airy, pale tints (not saturated fills), so danger / due-soon / info /
// done read at a glance without shouting. Text on its tint ≥ 4.5:1 in light,
// ≥ 5.5:1 in dark. Due-soon is a golden yellow: deep gold text on a pale-yellow
// tint, since brighter yellow text would be unreadable on white.
export const vercelDark: ThemePreset = {
  name: 'vercel-dark',
  label: 'Vercel (Cool)',
  description: 'Cool zinc neutrals, a clean blue accent and light, clear status colours.',
  colors: {
    light: {
      bgApp:         '250 250 250',
      bgSurface:     '255 255 255',
      bgElevated:    '255 255 255',
      bgOverlay:     '255 255 255',
      bgInset:       '244 244 245',

      fgDefault:     '9 9 11',
      fgMuted:       '75 75 84',
      fgSubtle:      '100 100 110',
      fgFaint:       '138 138 148',
      fgOnAccent:    '255 255 255',

      borderDefault: '220 220 224',
      borderStrong:  '200 200 205',
      borderSubtle:  '232 232 235',

      accent1:       '239 246 255',
      accent2:       '219 234 254',
      accent:        '38 100 222',
      accentHover:   '30 84 194',
      accentActive:  '26 70 164',
      accentFg:      '30 58 138',

      danger:        '204 44 56',
      dangerBg:      '254 242 243',
      warning:       '152 102 0',
      warningBg:     '255 245 204',
      warningVivid:  '236 178 10',
      success:       '22 128 80',
      successBg:     '233 247 239',
      info:          '18 112 156',
      infoBg:        '231 244 250',

      prioCritical:  '190 32 72',
      prioCriticalBg:'253 240 243',
      prioHigh:      '180 76 12',
      prioHighBg:    '255 241 230',

      wait:          '79 70 229',
      waitBg:        '238 242 255',
      waitBorder:    '199 210 254',

      focusRing:     '64 124 236',
    },
    dark: {
      bgApp:         '0 0 0',
      bgSurface:     '17 17 17',
      bgElevated:    '26 26 26',
      bgOverlay:     '38 38 38',
      bgInset:       '10 10 10',

      fgDefault:     '250 250 250',
      fgMuted:       '180 180 180',
      fgSubtle:      '140 140 140',
      fgFaint:       '115 115 115',
      fgOnAccent:    '255 255 255',

      borderDefault: '55 55 55',
      borderStrong:  '78 78 78',
      borderSubtle:  '42 42 42',

      accent1:       '15 23 42',
      accent2:       '30 41 59',
      accent:        '66 132 244',
      accentHover:   '102 158 248',
      accentActive:  '144 186 250',
      accentFg:      '191 219 254',

      danger:        '242 106 112',
      dangerBg:      '52 24 26',
      warning:       '250 204 80',
      warningBg:     '50 42 14',
      warningVivid:  '250 204 80',
      success:       '88 204 146',
      successBg:     '18 44 32',
      info:          '96 184 230',
      infoBg:        '18 38 52',

      prioCritical:  '244 114 150',
      prioCriticalBg:'56 22 34',
      prioHigh:      '248 150 86',
      prioHighBg:    '56 34 18',

      wait:          '165 180 252',
      waitBg:        '28 28 52',
      waitBorder:    '52 52 96',

      focusRing:     '102 158 248',
    },
  },
  typography: {
    fontSans: "'Geist', 'Inter var', Inter, ui-sans-serif, system-ui, -apple-system, sans-serif",
    fontMono: "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
    featureSettings: "'ss01'",
    fontImportUrl: 'https://rsms.me/inter/inter.css',
  },
}
