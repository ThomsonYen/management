import { Badge, type BadgeSize } from './Badge'

// Small purpose-specific wrapper for todo status states.

const map: Record<string, { tone: 'success' | 'warning' | 'danger' | 'neutral'; label: string }> = {
  done:     { tone: 'success', label: 'Done' },
  blocked:  { tone: 'warning', label: 'Blocked' },
  overdue:  { tone: 'danger',  label: 'Overdue' },
  todo:     { tone: 'neutral', label: 'Todo' },
}

export function StatusBadge({ status, size = 'md' }: { status: string; size?: BadgeSize }) {
  const info = map[status.toLowerCase()] ?? { tone: 'neutral' as const, label: status }
  return <Badge tone={info.tone} variant="soft" size={size}>{info.label}</Badge>
}
