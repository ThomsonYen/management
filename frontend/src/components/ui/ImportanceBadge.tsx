import { Badge, type BadgeSize } from './Badge'

// Replaces the three duplicated `importanceBadge()` helpers.
// low / medium / high / critical -> semantic tone.

const TONE_MAP = {
  critical: 'danger',
  high:     'warning',
  medium:   'info',
  low:      'neutral',
} as const

type Importance = keyof typeof TONE_MAP

export function ImportanceBadge({ importance, size = 'md', showLabel = true }: {
  importance: string
  size?: BadgeSize
  showLabel?: boolean
}) {
  const key = (importance as Importance) in TONE_MAP ? (importance as Importance) : 'low'
  const tone = TONE_MAP[key]
  return (
    <Badge tone={tone} variant="soft" size={size}>
      {showLabel ? importance : ''}
    </Badge>
  )
}
