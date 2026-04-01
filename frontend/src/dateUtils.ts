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
