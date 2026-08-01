import { cn } from './cn'

export function Divider({ orientation = 'horizontal', className }: {
  orientation?: 'horizontal' | 'vertical'
  className?: string
}) {
  return orientation === 'horizontal'
    ? <hr className={cn('border-0 h-px bg-border w-full', className)} />
    : <span className={cn('inline-block w-px h-4 bg-border align-middle', className)} />
}
