import { useState, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { cn } from './cn'

// Lightweight, CSS-only tooltip. Wraps a single child.
// For anything richer (positioning collisions, portal, arrows), swap in a floating-ui-based impl.

export interface TooltipProps {
  content: ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
  children: ReactElement
  disabled?: boolean
}

export function Tooltip({ content, side = 'top', children, disabled }: TooltipProps) {
  const [open, setOpen] = useState(false)
  if (disabled || !isValidElement(children)) return children

  const position = {
    top:    'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
    left:   'right-full top-1/2 -translate-y-1/2 mr-1.5',
    right:  'left-full top-1/2 -translate-y-1/2 ml-1.5',
  }[side]

  return (
    <span className="relative inline-flex">
      {cloneElement(children as ReactElement<any>, {
        onMouseEnter: () => setOpen(true),
        onMouseLeave: () => setOpen(false),
        onFocus:      () => setOpen(true),
        onBlur:       () => setOpen(false),
      })}
      {open && (
        <span
          role="tooltip"
          className={cn(
            'pointer-events-none absolute z-50 whitespace-nowrap',
            'bg-fg text-app text-2xs px-2 py-1 rounded-md shadow-popover',
            position,
          )}
        >
          {content}
        </span>
      )}
    </span>
  )
}
