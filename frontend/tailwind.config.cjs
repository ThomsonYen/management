/** @type {import('tailwindcss').Config} */
// All design tokens live in src/theme/. This file just exposes those tokens
// to Tailwind's utility classes so the app can write `bg-surface`, `text-fg`, etc.
// The actual values come from CSS variables set by src/theme/index.ts (applyTheme).

const withVar = (name) => `rgb(var(${name}) / <alpha-value>)`
const radius = (step) => `calc(var(--radius-${step}) * var(--radius-k, 1))`

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
        warning: { DEFAULT: withVar('--warning'), bg: withVar('--warning-bg'), vivid: withVar('--warning-vivid') },
        success: { DEFAULT: withVar('--success'), bg: withVar('--success-bg') },
        info:    { DEFAULT: withVar('--info'),    bg: withVar('--info-bg')    },
        prio: {
          critical:      withVar('--prio-critical'),
          'critical-bg': withVar('--prio-critical-bg'),
          high:          withVar('--prio-high'),
          'high-bg':     withVar('--prio-high-bg'),
        },
      },
      // Values come from src/theme/tokens/radii.ts via --radius-* (see applyTheme);
      // --radius-k enlarges them where corner-shape: squircle is supported (index.css).
      borderRadius: {
        xs:    radius('xs'),
        sm:    radius('sm'),
        DEFAULT: radius('sm'),
        md:    radius('md'),
        lg:    radius('lg'),
        xl:    radius('xl'),
        '2xl': radius('2xl'),
      },
      boxShadow: {
        xs:      '0 1px 0 rgb(0 0 0 / 0.04)',
        sm:      '0 1px 2px rgb(0 0 0 / 0.04), 0 1px 1px rgb(0 0 0 / 0.03)',
        md:      '0 2px 4px rgb(0 0 0 / 0.04), 0 4px 8px rgb(0 0 0 / 0.04)',
        lg:      '0 4px 12px rgb(0 0 0 / 0.06), 0 8px 24px rgb(0 0 0 / 0.06)',
        popover: '0 0 0 1px rgb(0 0 0 / 0.06), 0 8px 24px rgb(0 0 0 / 0.12)',
        overlay: '0 0 0 1px rgb(0 0 0 / 0.06), 0 24px 48px rgb(0 0 0 / 0.16)',
      },
      fontSize: (() => {
        // Every font-size and line-height scales with --font-scale (default 1).
        // Set --font-scale on :root to shrink/enlarge all typography globally.
        const scale = (px, lh) => [
          `calc(${px}px * var(--font-scale, 1))`,
          `calc(${lh}px * var(--font-scale, 1))`,
        ]
        return {
          '2xs': scale(11, 15),
          xs:    scale(12, 17),
          sm:    scale(14, 20),
          base:  scale(15, 22),
          md:    scale(16, 24),
          lg:    scale(17, 25),
          xl:    scale(19, 27),
          '2xl': scale(24, 30),
          '3xl': scale(30, 36),
        }
      })(),
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
        // Note titles and bodies (Settings → Note font); falls back to the app font.
        note: ['var(--font-note, var(--font-sans))', 'ui-serif', 'Georgia', 'serif'],
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
