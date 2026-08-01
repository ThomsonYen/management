import { cn } from './cn'

export interface SegmentOption<T extends string> {
  value: T
  label: React.ReactNode
}

export interface SegmentedControlProps<T extends string> {
  value: T
  onChange: (v: T) => void
  options: SegmentOption<T>[]
  size?: 'sm' | 'md'
  className?: string
}

export function SegmentedControl<T extends string>({ value, onChange, options, size = 'sm', className }: SegmentedControlProps<T>) {
  const heights = { sm: 'h-7', md: 'h-8' }
  const paddings = { sm: 'px-2.5 text-xs', md: 'px-3 text-sm' }
  return (
    <div className={cn(
      'inline-flex items-center bg-inset border border-border rounded-md p-0.5 gap-0.5',
      heights[size],
      className,
    )}>
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              'inline-flex items-center rounded-sm h-full font-medium transition-colors',
              paddings[size],
              active
                ? 'bg-surface text-fg shadow-xs'
                : 'text-fg-muted hover:text-fg',
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
