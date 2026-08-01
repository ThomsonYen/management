// SINGLE SOURCE OF TRUTH for card, modal, popover surfaces.
// To restyle every card/panel/modal in the app, edit this file.

export const cardBase =
  'bg-surface border border-border rounded-lg'
export const cardPadded = 'p-4'
export const cardInteractive =
  'transition-colors duration-150 hover:border-border-strong cursor-pointer'
export const cardElevated = 'shadow-sm'

export const modalOverlay =
  'fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-4'
export const modalPanel =
  'bg-elevated border border-border rounded-xl shadow-overlay w-full max-h-[90vh] overflow-hidden flex flex-col'
export const modalSizes = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
} as const
export type ModalSize = keyof typeof modalSizes

export const modalHeader = 'px-5 py-3 border-b border-border flex items-center justify-between gap-3'
export const modalBody   = 'px-5 py-4 overflow-y-auto flex-1'
export const modalFooter = 'px-5 py-3 border-t border-border flex items-center justify-end gap-2'

export const popoverPanel =
  'bg-elevated border border-border rounded-lg shadow-popover z-50'

export const menuItem =
  'flex items-center gap-2 w-full px-2.5 py-1.5 text-sm text-fg text-left rounded-md ' +
  'hover:bg-inset focus-visible:outline-none focus-visible:bg-inset ' +
  'disabled:opacity-50 disabled:pointer-events-none'
export const menuSeparator = 'my-1 h-px bg-border'
export const menuLabel = 'px-2.5 py-1 text-2xs font-medium uppercase tracking-wider text-fg-subtle'
