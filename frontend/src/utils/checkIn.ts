import type { Person } from '../types'
import { daysSinceDate, formatDayLabel } from '../dateUtils'

/** Fallback cadence when a person has no explicit interval (mirrors the backend default). */
export const DEFAULT_CHECK_IN_INTERVAL = 2

export type CheckInState =
  | 'ok' // checked in recently enough
  | 'due' // cadence elapses today
  | 'overdue' // past cadence
  | 'never' // no check-in ever recorded

export interface CheckInInfo {
  state: CheckInState
  /** Calendar days since the last check-in, or null if there has never been one. */
  daysSince: number | null
  interval: number
}

/**
 * Derive check-in status for a person. Computed for everyone; callers decide
 * whether to act on it (only direct reports raise dashboard warnings).
 */
export function getCheckInState(person: Person, timezone: string): CheckInInfo {
  const interval = person.check_in_interval_days ?? DEFAULT_CHECK_IN_INTERVAL
  if (!person.last_check_in_date) {
    return { state: 'never', daysSince: null, interval }
  }
  const daysSince = daysSinceDate(person.last_check_in_date, timezone)
  if (daysSince >= interval) return { state: 'overdue', daysSince, interval }
  if (daysSince === interval - 1) return { state: 'due', daysSince, interval }
  return { state: 'ok', daysSince, interval }
}

/** True when this person should be surfaced as needing attention on the dashboard. */
export function needsCheckIn(person: Person, timezone: string): boolean {
  if (!person.is_direct_report) return false
  return getCheckInState(person, timezone).state !== 'ok'
}

/** Human summary, e.g. "Last check-in Aug 5 · 4 days ago" or "Never checked in". */
export function describeCheckIn(person: Person, timezone: string): string {
  if (!person.last_check_in_date) return 'Never checked in'
  const days = daysSinceDate(person.last_check_in_date, timezone)
  const when =
    days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`
  return `Last check-in ${formatDayLabel(person.last_check_in_date, timezone)} · ${when}`
}

/** Sort helper: most overdue first, then never-checked-in, then by name. */
export function compareCheckInUrgency(
  a: Person,
  b: Person,
  timezone: string,
): number {
  const ia = getCheckInState(a, timezone)
  const ib = getCheckInState(b, timezone)
  // "never" outranks any finite gap.
  const overdueA = ia.daysSince === null ? Infinity : ia.daysSince - ia.interval
  const overdueB = ib.daysSince === null ? Infinity : ib.daysSince - ib.interval
  if (overdueA !== overdueB) return overdueB - overdueA
  return a.name.localeCompare(b.name)
}
