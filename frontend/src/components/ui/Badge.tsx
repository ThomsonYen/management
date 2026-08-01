import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info'
export type BadgeVariant = 'soft' | 'solid' | 'outline'
export type BadgeSize = 'sm' | 'md'

const toneClasses: Record<BadgeVariant, Record<BadgeTone, string>> = {
  soft: {
    neutral: 'bg-inset text-fg-muted border-border',
    accent:  'bg-accent-1 text-accent-fg border-accent-2',
    success: 'bg-success-bg text-success border-success/30',
    warning: 'bg-warning-bg text-warning border-warning/30',
    danger:  'bg-danger-bg text-danger border-danger/30',
    info:    'bg-info-bg text-info border-info/30',
  },
  solid: {
    neutral: 'bg-fg-muted text-app border-transparent',
    accent:  'bg-accent text-fg-on-accent border-transparent',
    success: 'bg-success text-white border-transparent',
    warning: 'bg-warning text-white border-transparent',
    danger:  'bg-danger text-white border-transparent',
    info:    'bg-info text-white border-transparent',
  },
  outline: {
    neutral: 'text-fg-muted border-border',
    accent:  'text-accent border-accent/40',
    success: 'text-success border-success/40',
    warning: 'text-warning border-warning/40',
    danger:  'text-danger border-danger/40',
    info:    'text-info border-info/40',
  },
}

const sizeClasses: Record<BadgeSize, string> = {
  sm: 'text-2xs h-4 px-1.5 gap-1',
  md: 'text-xs h-5 px-2 gap-1',
}

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
  variant?: BadgeVariant
  size?: BadgeSize
  children?: ReactNode
}

export function Badge({ tone = 'neutral', variant = 'soft', size = 'md', className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-xs font-medium border whitespace-nowrap',
        sizeClasses[size],
        toneClasses[variant][tone],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  )
}
