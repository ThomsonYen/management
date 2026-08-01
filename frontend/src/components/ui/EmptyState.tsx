import type { ComponentType, ReactNode } from 'react'
import { cn } from './cn'

export interface EmptyStateProps {
  icon?: ComponentType<{ size?: number; className?: string }>
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center py-10 px-4', className)}>
      {Icon && (
        <div className="mb-3 h-10 w-10 rounded-full bg-inset flex items-center justify-center text-fg-subtle">
          <Icon size={20} />
        </div>
      )}
      <div className="text-md font-semibold text-fg">{title}</div>
      {description && (
        <div className="mt-1 text-sm text-fg-muted max-w-sm">{description}</div>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
