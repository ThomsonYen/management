// Single source of truth for badge class strings, used by places that need
// the class string directly (e.g. styling a native <select> to look like a badge).
// Prefer the <Badge> / <ImportanceBadge> primitives when possible.

const IMPORTANCE_CLASSES: Record<string, string> = {
  critical: 'bg-prio-critical-bg text-prio-critical border-prio-critical/30',
  high:     'bg-prio-high-bg text-prio-high border-prio-high/30',
  medium:   'bg-info-bg text-info border-info/30',
  low:      'bg-inset text-fg-muted border-border',
}

export function importanceBadgeClass(importance: string): string {
  return IMPORTANCE_CLASSES[importance] ?? IMPORTANCE_CLASSES.low
}

export const doneBadgeClass = 'bg-success-bg text-success border-success/30'
export const blockedBadgeClass = 'bg-danger-bg text-danger border-danger/30'
