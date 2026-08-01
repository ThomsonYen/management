import type { ReactNode } from 'react'
import { textRoles } from '../../theme/tokens/typography'
import { cn } from './cn'

export interface PageHeaderProps {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-4 mb-6', className)}>
      <div className="min-w-0">
        <h1 className={cn(textRoles.pageTitle, 'm-0')}>{title}</h1>
        {description && (
          <p className={cn(textRoles.bodyMuted, 'mt-1 m-0')}>{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  )
}
