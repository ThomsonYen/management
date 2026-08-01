/** @type {import('tailwindcss').Config} */
// All design tokens live in src/theme/. This file just exposes those tokens
// to Tailwind's utility classes so the app can write `bg-surface`, `text-fg`, etc.
// The actual values come from CSS variables set by src/theme/index.ts (applyTheme).

const withVar = (name) => `rgb(var(${name}) / <alpha-value>)`

module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Surfaces
        app:      withVar('--bg-app'),
        surface:  withVar('--bg-surface'),
        elevated: withVar('--bg-elevated'),
        overlay:  withVar('--bg-overlay'),
        inset:    withVar('--bg-inset'),

        // Text
        fg: {
          DEFAULT:     withVar('--fg-default'),
          muted:       withVar('--fg-muted'),
          subtle:      withVar('--fg-subtle'),
          faint:       withVar('--fg-faint'),
          'on-accent': withVar('--fg-on-accent'),
        },

        // Borders — use the `border-XXX` slug via `border-strong`, `border-subtle`.
        // Base `border-border` reads from `--border-default`.
        border: {
          DEFAULT: withVar('--border-default'),
          strong:  withVar('--border-strong'),
          subtle:  withVar('--border-subtle'),
        },

        // Accent (brand)
        accent: {
          DEFAULT: withVar('--accent'),
          hover:   withVar('--accent-hover'),
          active:  withVar('--accent-active'),
          fg:      withVar('--accent-fg'),
          1:       withVar('--accent-1'),
          2:       withVar('--accent-2'),
        },

        // Semantic tones
        danger:  { DEFAULT: withVar('--danger'),  bg: withVar('--danger-bg')  },
        warning: { DEFAULT: withVar('--warning'), bg: withVar('--warning-bg') },
        success: { DEFAULT: withVar('--success'), bg: withVar('--success-bg') },
        info:    { DEFAULT: withVar('--info'),    bg: withVar('--info-bg')    },
      },
      borderRadius: {
        xs:    '3px',
        sm:    '4px',
        md:    '6px',
        lg:    '8px',
        xl:    '12px',
        '2xl': '16px',
      },
      boxShadow: {
        xs:      '0 1px 0 rgb(0 0 0 / 0.04)',
        sm:      '0 1px 2px rgb(0 0 0 / 0.04), 0 1px 1px rgb(0 0 0 / 0.03)',
        md:      '0 2px 4px rgb(0 0 0 / 0.04), 0 4px 8px rgb(0 0 0 / 0.04)',
        lg:      '0 4px 12px rgb(0 0 0 / 0.06), 0 8px 24px rgb(0 0 0 / 0.06)',
        popover: '0 0 0 1px rgb(0 0 0 / 0.06), 0 8px 24px rgb(0 0 0 / 0.12)',
        overlay: '0 0 0 1px rgb(0 0 0 / 0.06), 0 24px 48px rgb(0 0 0 / 0.16)',
      },
      fontSize: {
        '2xs': ['10px', '14px'],
        xs:    ['11px', '16px'],
        sm:    ['13px', '18px'],
        base:  ['14px', '20px'],
        md:    ['15px', '22px'],
        lg:    ['16px', '24px'],
        xl:    ['18px', '26px'],
        '2xl': ['22px', '28px'],
        '3xl': ['28px', '34px'],
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      ringColor: {
        DEFAULT: withVar('--focus-ring'),
      },
      transitionTimingFunction: {
        'out-quart': 'cubic-bezier(0.25, 1, 0.5, 1)',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}
