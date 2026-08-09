/** Get today's date as YYYY-MM-DD in the given timezone */
export function getTodayString(timezone: string): string {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const y = parts.find((p) => p.type === 'year')!.value
  const m = parts.find((p) => p.type === 'month')!.value
  const d = parts.find((p) => p.type === 'day')!.value
  return `${y}-${m}-${d}`
}

/** Check if a deadline (YYYY-MM-DD) is overdue given the current date in the timezone */
export function isOverdue(deadline: string | null | undefined, status: string, timezone: string): boolean {
  if (!deadline || status === 'done') return false
  return deadline < getTodayString(timezone)
}

/** Get a Date object representing the start of today in the given timezone */
export function getStartOfToday(timezone: string): Date {
  const todayStr = getTodayString(timezone)
  // Parse as local date components
  const [y, m, d] = todayStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/**
 * Whole calendar days between a YYYY-MM-DD date and today in the given timezone.
 * Positive when the date is in the past. Diffed via Date.UTC so DST transitions
 * can never shift the result by a day.
 */
export function daysSinceDate(dateStr: string, timezone: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  const [ty, tm, td] = getTodayString(timezone).split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(y, m - 1, d)) / 86400000)
}

/** Format a YYYY-MM-DD date for display, e.g. "Aug 5". Year is added if not the current one. */
export function formatDayLabel(dateStr: string, timezone: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const currentYear = Number(getTodayString(timezone).slice(0, 4))
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    ...(y === currentYear ? {} : { year: 'numeric' }),
  })
}

/** Get the day string (YYYY-MM-DD) for a given ISO timestamp in the configured timezone */
export function getDateString(iso: string, timezone: string): string {
  const d = new Date(iso)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d)
  const y = parts.find((p) => p.type === 'year')!.value
  const m = parts.find((p) => p.type === 'month')!.value
  const day = parts.find((p) => p.type === 'day')!.value
  return `${y}-${m}-${day}`
}
