import { AlarmClock, ArrowUp, Ban, Flag, Flame } from 'lucide-react'

// Round status icons for places with no room for labelled badges (Focus list cards, Must Do rows).
// Each carries a tooltip so the word is still there on hover.

export const statusIconClass = 'w-5 h-5 rounded-full grid place-items-center shrink-0'

const IMPORTANCE_OPTIONS = ['low', 'medium', 'high', 'critical']

export function BlockedIcon() {
  return (
    <span title="Blocked" aria-label="Blocked" className={`${statusIconClass} bg-danger-bg text-danger`}>
      <Ban size={11} strokeWidth={2.5} />
    </span>
  )
}

export function OverdueIcon() {
  return (
    <span title="Overdue" aria-label="Overdue" className={`${statusIconClass} bg-danger-bg text-danger`}>
      <AlarmClock size={11} strokeWidth={2.5} />
    </span>
  )
}

/**
 * Critical: flame on the Aurora gradient. High: arrow on soft orange. Low/medium: a faint flag, given
 * `lowClass` to control when it shows (omit it to render nothing for low/medium).
 * With `onChange`, the icon is the control: an invisible native select covers it, so the picker opens
 * on the icon and nothing reflows.
 */
export function ImportanceIcon({ importance, onChange, lowClass }: {
  importance: string
  onChange?: (importance: string) => void
  lowClass?: string
}) {
  const isLow = importance !== 'high' && importance !== 'critical'
  if (isLow && lowClass === undefined) return null
  const label = `${importance[0].toUpperCase()}${importance.slice(1)} importance`
  return (
    <label
      title={onChange ? `${label} (click to change)` : label}
      className={`relative ${statusIconClass} ${onChange ? 'cursor-pointer transition-[opacity,box-shadow] hover:ring-2 hover:ring-accent/30 focus-within:ring-2 focus-within:ring-accent/50' : ''} ${
        importance === 'critical'
          ? 'prio-critical-solid'
          : importance === 'high'
          ? 'bg-prio-high-bg text-prio-high'
          : `text-fg-faint hover:text-fg ${lowClass}`
      }`}
    >
      {importance === 'critical' ? <Flame size={11} strokeWidth={2.5} />
        : importance === 'high' ? <ArrowUp size={11} strokeWidth={2.75} />
        : <Flag size={11} />}
      {onChange && (
        <select
          value={importance}
          onChange={(e) => onChange(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Importance: ${importance}`}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer appearance-none"
        >
          {IMPORTANCE_OPTIONS.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      )}
    </label>
  )
}
