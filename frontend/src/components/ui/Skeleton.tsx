import { cn } from './cn'

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse bg-inset rounded-md', className)} />
}
