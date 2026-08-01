import { cn } from './cn'

export function Progress({ value, max = 100, className }: {
  value: number
  max?: number
  className?: string
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div className={cn('h-1.5 w-full bg-inset rounded-full overflow-hidden', className)}>
      <div
        className="h-full bg-accent rounded-full transition-all duration-200"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
