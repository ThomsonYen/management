// SINGLE SOURCE OF TRUTH for button styling.
// To restyle every button in the app, edit this file.

export const buttonBase =
  'inline-flex items-center justify-center gap-1.5 font-medium rounded-md ' +
  'transition-colors duration-150 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-1 focus-visible:ring-offset-app ' +
  'disabled:opacity-50 disabled:pointer-events-none select-none whitespace-nowrap'

export const buttonVariants = {
  primary:   'bg-accent text-fg-on-accent hover:bg-accent-hover active:bg-accent-active',
  secondary: 'bg-inset text-fg border border-border hover:bg-border-subtle hover:border-border-strong',
  ghost:     'text-fg-muted hover:text-fg hover:bg-inset',
  outline:   'border border-border text-fg hover:bg-inset hover:border-border-strong',
  danger:    'bg-danger text-white hover:opacity-90 active:opacity-80',
  soft:      'bg-accent-1 text-accent-fg hover:bg-accent-2 border border-transparent',
  link:      'text-accent hover:underline underline-offset-2 h-auto p-0',
} as const

export type ButtonVariant = keyof typeof buttonVariants

export const buttonSizes = {
  xs: 'h-6 px-2 text-xs',
  sm: 'h-7 px-2.5 text-sm',
  md: 'h-8 px-3 text-sm',
  lg: 'h-10 px-4 text-md',
} as const

export type ButtonSize = keyof typeof buttonSizes

export const iconButtonSizes = {
  xs: 'h-6 w-6',
  sm: 'h-7 w-7',
  md: 'h-8 w-8',
  lg: 'h-10 w-10',
} as const
