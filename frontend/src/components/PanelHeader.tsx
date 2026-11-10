import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ChevronDown } from 'lucide-react'

export type PanelTone = 'warning' | 'info' | 'wait' | 'accent'

// Full class strings so Tailwind keeps them
const TONES: Record<PanelTone, { band: string; tile: string }> = {
  warning: { band: 'from-warning-bg/90 via-warning-bg/40', tile: 'bg-warning-bg text-warning-vivid ring-warning-vivid/30' },
  info: { band: 'from-info-bg/90 via-info-bg/40', tile: 'bg-info-bg text-info ring-info/30' },
  wait: { band: 'from-wait-bg/90 via-wait-bg/40', tile: 'bg-wait-bg text-wait ring-wait-border' },
  accent: { band: 'from-accent-1 via-accent-1/40', tile: 'bg-accent-1 text-accent ring-accent/30' },
}

/** Rounded tile holding a panel's icon, tinted by tone. */
export function PanelIcon({ icon: Icon, tone, filled = false }: { icon: LucideIcon; tone: PanelTone; filled?: boolean }) {
  return (
    <span className={`shrink-0 w-6 h-6 rounded-md grid place-items-center ring-1 ring-inset ${TONES[tone].tile}`}>
      <Icon size={14} strokeWidth={2.25} fill={filled ? 'currentColor' : 'none'} />
    </span>
  )
}

/** Small rounded count shown on the right of a header. */
export function HeaderPill({ children, tone, title }: { children: ReactNode; tone?: 'warning'; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 h-5 px-2 rounded-full text-[11px] font-semibold tabular-nums whitespace-nowrap ring-1 ring-inset ${
        tone === 'warning' ? 'bg-warning-bg text-warning ring-warning/30' : 'bg-surface/80 text-fg-muted ring-border-subtle'
      }`}
    >
      {children}
    </span>
  )
}

/**
 * Header bar shared by the Focus page panels: tinted gradient band, icon tile,
 * title, and pills on the right. With `onToggle` the whole bar collapses the
 * panel and shows a chevron.
 */
export default function PanelHeader({ icon, tone, title, filledIcon, children, onToggle, open = true, className = '' }: {
  icon: LucideIcon
  tone: PanelTone
  title: string
  filledIcon?: boolean
  /** Pills and buttons on the right */
  children?: ReactNode
  onToggle?: () => void
  open?: boolean
  className?: string
}) {
  const body = (
    <>
      <PanelIcon icon={icon} tone={tone} filled={filledIcon} />
      <h3 className="text-[13px] font-bold text-fg uppercase tracking-[0.06em] whitespace-nowrap">{title}</h3>
      <span className="flex-1" />
      {children}
      {onToggle && (
        <ChevronDown size={15} className={`shrink-0 text-fg-faint transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      )}
    </>
  )
  const cls = `shrink-0 w-full flex items-center gap-2.5 pl-4 pr-3.5 py-2.5 text-left bg-gradient-to-r ${TONES[tone].band} to-transparent ${
    open ? 'border-b border-border-subtle' : ''
  } ${className}`
  return onToggle ? (
    <button type="button" onClick={onToggle} aria-expanded={open} className={cls}>{body}</button>
  ) : (
    <div className={cls}>{body}</div>
  )
}
