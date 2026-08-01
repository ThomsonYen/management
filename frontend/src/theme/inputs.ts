// SINGLE SOURCE OF TRUTH for input/textarea/select styling.
// To restyle every form field in the app, edit this file.

export const inputBase =
  'block bg-surface text-fg placeholder:text-fg-faint ' +
  'border border-border rounded-md ' +
  'transition-colors duration-150 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:border-accent ' +
  'disabled:opacity-60 disabled:cursor-not-allowed'

export const inputSizes = {
  sm: 'h-7 px-2 text-sm',
  md: 'h-8 px-2.5 text-sm',
  lg: 'h-10 px-3 text-md',
} as const

export type InputSize = keyof typeof inputSizes

export const inputInvalid =
  'border-danger focus-visible:ring-danger/40 focus-visible:border-danger'

// Textarea sizes: same paddings, but height is content-driven
export const textareaSize = 'px-2.5 py-1.5 text-sm min-h-[3rem]'

// Native <select> gets a caret background so it matches theme in dark mode
export const selectCaret =
  "appearance-none bg-no-repeat bg-[right_0.5rem_center] pr-8 " +
  "bg-[url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23a1a1aa' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")]"
