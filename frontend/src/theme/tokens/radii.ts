// Radius scale. To rebalance corner roundness across the app, edit this file
// (a theme preset can override individual steps via `radii`).
//
// applyTheme() writes each step to `--radius-<step>` on :root, and Tailwind's
// `rounded-*` utilities read them through `calc(var(--radius-<step>) * var(--radius-k))`.
// Where the browser supports `corner-shape: squircle`, index.css turns every
// rounded corner into a squircle and raises --radius-k so the curve keeps the
// same visual size (a squircle at the same radius looks noticeably squarer).
//
// Shape language: containers (cards, panels, modals, inputs, buttons) are
// squircles; small tokens and toggles (badges, chips, segmented controls, the
// active tab indicator) are ovals — `rounded-full`, which stays a true stadium.

export interface RadiiConfig {
  xs: string   // tiny marks (kbd, inline code)
  sm: string   // small controls
  md: string   // buttons, inputs (default)
  lg: string   // cards
  xl: string   // modals, popovers, sheets
  '2xl': string
}

export const DEFAULT_RADII: RadiiConfig = {
  xs: '4px',
  sm: '6px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  '2xl': '20px',
}

export const RADIUS_STEPS = Object.keys(DEFAULT_RADII) as (keyof RadiiConfig)[]
