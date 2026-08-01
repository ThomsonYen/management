import type { HTMLAttributes } from 'react'
import { cn } from './cn'

export interface KbdProps extends HTMLAttributes<HTMLElement> {
  children: React.ReactNode
}

export function Kbd({ className, children, ...rest }: KbdProps) {
  return (
    <kbd
      className={cn(
        'inline-flex items-center rounded-sm border border-border bg-inset text-fg-muted',
        'text-2xs px-1.5 h-5 font-mono',
        className,
      )}
      {...rest}
    >
      {children}
    </kbd>
  )
}
