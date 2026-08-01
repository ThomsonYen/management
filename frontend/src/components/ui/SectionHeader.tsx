import type { ReactNode } from 'react'
import { textRoles } from '../../theme/tokens/typography'
import { cn } from './cn'

export interface SectionHeaderProps {
  title: ReactNode
  count?: number
  action?: ReactNode
  className?: string
}

export function SectionHeader({ title, count, action, className }: SectionHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between gap-3 mb-2', className)}>
      <div className="flex items-baseline gap-2 min-w-0">
        <h2 className={cn(textRoles.sectionHeader, 'm-0')}>{title}</h2>
        {typeof count === 'number' && (
          <span className={cn(textRoles.meta, 'shrink-0')}>{count}</span>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
