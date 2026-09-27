import { cn } from './cn'

/** The Tracker mark. Same file as the favicon and home-screen icons (public/logo.svg). */
export function AppLogo({ className }: { className?: string }) {
  return <img src="/logo.svg" alt="" aria-hidden="true" className={cn('rounded-lg flex-shrink-0', className)} />
}
