// Radius scale. To rebalance corner roundness across the app, edit this file
// and the theme file (which can override).

export interface RadiiConfig {
  xs: string   // pills, chips
  sm: string   // small controls (kbd)
  md: string   // buttons, inputs (default)
  lg: string   // cards
  xl: string   // modals, popovers
  '2xl': string
}

export const DEFAULT_RADII: RadiiConfig = {
  xs: '3px',
  sm: '4px',
  md: '6px',
  lg: '8px',
  xl: '12px',
  '2xl': '16px',
}
