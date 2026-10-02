import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Clock, TrendingDown, TrendingUp } from 'lucide-react'
import { fetchPersonProgress, fetchPersons, fetchRecentlyDone } from '../api'
import type { PersonProgress, Todo } from '../types'
import { useTimezone, useTodoDefaults } from '../SettingsContext'
import { useSession } from '../hooks/useSession'
import { getTodayString, getDateString, formatDayLabel } from '../dateUtils'

// "Hours worked" = the estimated hours of todos assigned to the owner's person
// and marked done that day (the same measure the Progress page charts).

const HISTORY_DAYS = 28
const CHART_DAYS = 14
const LIST_PREVIEW = 5
// 14 day columns, a divider, then 3 wider average columns.
const GRID_COLS = `repeat(${CHART_DAYS}, minmax(0, 1fr)) 10px repeat(3, minmax(0, 1.8fr))`

/** YYYY-MM-DD `n` days before `day` (pure calendar arithmetic, DST-proof). */
function shiftDay(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d - n)).toISOString().slice(0, 10)
}

function weekdayName(day: string, plural = false): string {
  const [y, m, d] = day.split('-').map(Number)
  const name = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, { timeZone: 'UTC', weekday: 'long' })
  return plural ? `${name}s` : name
}

const fmt = (h: number) => `${Number.isInteger(Math.round(h * 10) / 10) ? Math.round(h) : h.toFixed(1)}h`

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)


/** Today's done hours/todos for the owner's own person, plus the averages
 *  they are compared against. Shared by the full card and the compact readout. */
export function useHoursToday() {
  const { timezone } = useTimezone()
  const { defaults } = useTodoDefaults()
  const session = useSession()
  const { data: persons = [] } = useQuery({ queryKey: ['persons'], queryFn: fetchPersons })
  const today = getTodayString(timezone)

  // The owner's own person: the login's linked person, else the default assignee.
  const meId = session.person_id
    ?? persons.find((p) => p.name === defaults.assigneeName)?.id
    ?? null

  // History for the averages and the chart. Today's own total is not taken from
  // here (that needed a todo refetch and then this refetch); see doneToday.
  const { data: progress = [] } = useQuery<PersonProgress[]>({
    queryKey: ['person-progress', 'day', timezone, shiftDay(today, HISTORY_DAYS + 1)],
    queryFn: () => fetchPersonProgress('day', shiftDay(today, HISTORY_DAYS + 1), timezone),
    refetchInterval: 5 * 60_000,
  })

  // Re-derive today whenever any ['todos', …] cache changes, so an optimistic
  // "done" (TodoCard, Must Do, follow-ups) shows up the moment it is clicked.
  const queryClient = useQueryClient()
  const [cacheTick, setCacheTick] = useState(0)
  useEffect(() => queryClient.getQueryCache().subscribe((e) => {
    if (e.type === 'updated' && e.query.queryKey[0] === 'todos') setCacheTick((n) => n + 1)
  }), [queryClient])

  // Today's finished todos. `since` is a UTC-midnight bound a day early so the
  // local day is always covered; the exact local-day match happens client-side.
  // The ['recently-done'] prefix is invalidated wherever a todo is marked done.
  const { data: recentlyDone = [] } = useQuery<Todo[]>({
    queryKey: ['recently-done', { since: shiftDay(today, 1), limit: 200 }],
    queryFn: () => fetchRecentlyDone({ since: shiftDay(today, 1), limit: 200 }),
  })
  // Server list of today's done todos, overlaid with the live todo caches:
  // a todo just ticked done (optimistic, no done_at yet) counts at once, and one
  // just reopened drops out. Follow-ups never count — waiting is not your work.
  const doneToday = useMemo(() => {
    const live = new Map<number, Todo>()
    queryClient.getQueriesData<Todo[]>({ queryKey: ['todos'] })
      .forEach(([, list]) => list?.forEach((t) => live.set(t.id, t)))
    const mine = (t: Todo) => t.assignee_id === meId && !t.is_followup
    const out = new Map<number, Todo>()
    for (const t of recentlyDone) {
      if (!mine(t) || !t.done_at || getDateString(t.done_at, timezone) !== today) continue
      const cur = live.get(t.id)
      if (cur && cur.status !== 'done') continue
      out.set(t.id, cur ? { ...t, ...cur, done_at: t.done_at } : t)
    }
    for (const t of live.values()) {
      if (out.has(t.id) || t.status !== 'done' || !mine(t)) continue
      if (t.done_at && getDateString(t.done_at, timezone) !== today) continue
      out.set(t.id, { ...t, done_at: t.done_at ?? new Date().toISOString() })
    }
    return [...out.values()].sort((a, b) => (b.done_at ?? '').localeCompare(a.done_at ?? ''))
    // cacheTick: re-read the caches after any todo cache update
  }, [recentlyDone, meId, timezone, today, queryClient, cacheTick])

  const stats = useMemo(() => {
    const mine = progress.find((p) => p.person_id === meId)
    const byDay = new Map(mine?.buckets.map((b) => [b.period, b]) ?? [])
    const hoursOn = (day: string) => byDay.get(day)?.total_hours ?? 0

    const past = Array.from({ length: HISTORY_DAYS }, (_, i) => shiftDay(today, i + 1))
    const activePast = past.map(hoursOn).filter((h) => h > 0)
    const sameWeekday = past.filter((_, i) => (i + 1) % 7 === 0).map(hoursOn).filter((h) => h > 0)
    const last7 = past.slice(0, 7).map(hoursOn).filter((h) => h > 0)

    const todayHours = doneToday.reduce((sum, t) => sum + (t.estimated_hours || 0), 0)
    return {
      todayHours,
      todayTasks: doneToday.length,
      avg: mean(activePast),
      activeDays: activePast.length,
      weekdayAvg: sameWeekday.length ? mean(sameWeekday) : null,
      avg7: last7.length ? mean(last7) : null,
      best: Math.max(0, ...activePast),
      chart: Array.from({ length: CHART_DAYS }, (_, i) => {
        const day = shiftDay(today, CHART_DAYS - 1 - i)
        return day === today
          ? { day, hours: todayHours, tasks: doneToday.length }
          : { day, hours: hoursOn(day), tasks: byDay.get(day)?.task_count ?? 0 }
      }),
    }
  }, [progress, meId, today, doneToday])

  return { meId, today, timezone, doneToday, stats }
}

export default function HoursTodayCard({ onOpenTodo }: { onOpenTodo?: (id: number) => void }) {
  const { meId, today, timezone, doneToday, stats } = useHoursToday()
  const [showAll, setShowAll] = useState(false)

  const [hover, setHover] = useState<number | null>(null)

  if (meId === null) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-5 flex items-start gap-3">
        <Clock size={16} className="text-fg-subtle shrink-0 mt-0.5" />
        <p className="text-sm text-fg-muted">
          Set yourself as the default assignee in <span className="font-medium text-fg">Settings → Todo defaults</span> to
          see the hours you've completed today against your averages.
        </p>
      </div>
    )
  }

  const { todayHours, todayTasks, avg, activeDays, weekdayAvg, avg7, best, chart } = stats
  const delta = todayHours - avg
  const hasAvg = activeDays > 0
  const pctOfAvg = hasAvg && avg > 0 ? Math.round((todayHours / avg) * 100) : null
  const averages = [
    { key: '4wk', short: '4-wk', hours: hasAvg ? avg : null, name: '4-week average', hint: `${activeDays} active days` },
    { key: 'wd', short: weekdayName(today).slice(0, 3), hours: weekdayAvg, name: `${weekdayName(today, true)} average`, hint: 'last 4 weeks' },
    { key: '7d', short: '7-day', hours: avg7, name: 'Last 7 days average', hint: `best day ${fmt(best)}` },
  ]
  // Headroom so the value labels above the average bars never clip.
  const scaleMax = Math.max(...averages.map((a) => a.hours ?? 0), ...chart.map((c) => c.hours), 1) * 1.2
  const barMax = Math.max(todayHours, avg, 1) * 1.15
  const hovered = hover === null
    ? null
    : hover < CHART_DAYS
      ? (() => {
          const c = chart[hover]
          const when = c.day === today ? 'Today' : `${weekdayName(c.day).slice(0, 3)} ${formatDayLabel(c.day, timezone)}`
          return `${when} · ${fmt(c.hours)} · ${c.tasks} ${c.tasks === 1 ? 'todo' : 'todos'}`
        })()
      : (() => {
          const a = averages[hover - CHART_DAYS]
          return a.hours !== null ? `${a.name} · ${fmt(a.hours)} · ${a.hint}` : `${a.name} · no data yet`
        })()

  return (
    <div className="relative rounded-xl border border-border bg-surface shadow-sm overflow-hidden">
      <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-accent" />

      <div className="pl-6 pr-5 pt-4 pb-2 flex items-center gap-2 border-b border-border-subtle bg-accent-1/40">
        <Clock size={16} className="text-accent shrink-0" />
        <h3 className="text-sm font-bold text-fg uppercase tracking-wide whitespace-nowrap">Done Today</h3>
      </div>

      <div className="pl-6 pr-5 pt-5 pb-5 flex flex-col gap-5">
        {/* Hero number + delta */}
        <div className="flex items-end gap-4 flex-wrap">
          <div className="flex items-baseline gap-1.5">
            <span className="text-5xl font-bold tracking-tight text-fg tabular-nums leading-none">
              {Number.isInteger(Math.round(todayHours * 10) / 10) ? Math.round(todayHours) : todayHours.toFixed(1)}
            </span>
            <span className="text-lg font-semibold text-fg-muted">h</span>
          </div>
          <div className="pb-1 flex flex-col gap-1">
            {hasAvg && (
              <span
                className={`inline-flex items-center gap-1 self-start rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
                  delta >= 0 ? 'bg-success-bg text-success' : 'bg-inset text-fg-muted'
                }`}
              >
                {delta >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {delta >= 0 ? '+' : '−'}{fmt(Math.abs(delta))} vs avg
              </span>
            )}
            <span className="text-xs text-fg-subtle">
              {todayTasks} {todayTasks === 1 ? 'todo' : 'todos'} done{pctOfAvg !== null && ` · ${pctOfAvg}% of a typical day`}
            </span>
          </div>
        </div>

        {/* Today vs average meter */}
        {hasAvg && (
          <div>
            <div className="relative h-2.5 rounded-full bg-inset overflow-visible">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width] duration-700 ease-out"
                style={{ width: `${(todayHours / barMax) * 100}%` }}
              />
              <div
                className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-fg-muted"
                style={{ left: `${(avg / barMax) * 100}%` }}
                title={`4-week average: ${fmt(avg)}`}
              />
            </div>
            <div className="relative h-4 mt-1 text-[11px] text-fg-subtle tabular-nums">
              <span
                className="absolute -translate-x-1/2 whitespace-nowrap"
                style={{ left: `${Math.min(Math.max((avg / barMax) * 100, 12), 88)}%` }}
              >
                avg {fmt(avg)}
              </span>
            </div>
          </div>
        )}

        {/* Today's finished todos, newest first */}
        {doneToday.length > 0 && (
          <div>
            <ul className="-mx-2">
              {(showAll ? doneToday : doneToday.slice(0, LIST_PREVIEW)).map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => onOpenTodo?.(t.id)}
                    className="w-full flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-inset/60 transition-colors"
                  >
                    <span className="shrink-0 grid place-items-center w-4 h-4 rounded-full bg-success-bg text-success">
                      <Check size={11} strokeWidth={3} />
                    </span>
                    <span className="text-sm text-fg truncate">{t.title}</span>
                    {t.project_name && (
                      <span className="text-xs text-fg-subtle truncate shrink min-w-0 hidden 2xl:inline">{t.project_name}</span>
                    )}
                    <span className="ml-auto pl-2 text-xs font-medium text-fg-muted tabular-nums shrink-0">{fmt(t.estimated_hours)}</span>
                  </button>
                </li>
              ))}
            </ul>
            {doneToday.length > LIST_PREVIEW && (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="mt-1 text-xs font-medium text-fg-subtle hover:text-fg transition-colors"
              >
                {showAll ? 'Show less' : `Show ${doneToday.length - LIST_PREVIEW} more`}
              </button>
            )}
          </div>
        )}

        {/* Last 14 days, then the three averages as their own bars on the same scale */}
        <div>
          <div className="flex items-center justify-between gap-3 mb-2 h-4">
            <span className="text-[11px] font-medium uppercase tracking-wider text-fg-subtle whitespace-nowrap">Last {CHART_DAYS} days</span>
            <span className="text-[11px] text-fg-muted tabular-nums truncate">{hovered ?? ''}</span>
          </div>
          <div className="relative h-28" onMouseLeave={() => setHover(null)}>
            {hasAvg && (
              <div
                aria-hidden
                className="absolute left-0 right-0 border-t border-dashed border-fg-subtle/60 pointer-events-none z-10"
                style={{ bottom: `${(avg / scaleMax) * 100}%` }}
              />
            )}
            <div className="absolute inset-0 grid items-end gap-x-[2px]" style={{ gridTemplateColumns: GRID_COLS }}>
              {chart.map((c, i) => {
                const isToday = c.day === today
                return (
                  <div key={c.day} className="h-full flex items-end cursor-default" onMouseEnter={() => setHover(i)}>
                    <div
                      className={`w-full rounded-t-[4px] transition-all duration-300 ${
                        isToday ? 'bg-accent' : hover === i ? 'bg-accent/60' : 'bg-accent/30'
                      }`}
                      style={{ height: c.hours > 0 ? `max(3px, ${(c.hours / scaleMax) * 100}%)` : '2px', opacity: c.hours > 0 ? 1 : 0.5 }}
                    />
                  </div>
                )
              })}
              <div aria-hidden className="h-full flex justify-center">
                <div className="w-px h-full bg-border-subtle" />
              </div>
              {averages.map((a, j) => {
                const i = CHART_DAYS + j
                return (
                  <div key={a.key} className="h-full flex flex-col justify-end items-center cursor-default" onMouseEnter={() => setHover(i)}>
                    <span className="text-[11px] font-semibold text-fg tabular-nums leading-none mb-1">
                      {a.hours !== null ? fmt(a.hours) : '—'}
                    </span>
                    <div
                      className={`w-full rounded-t-[4px] transition-all duration-300 ${hover === i ? 'bg-fg-muted/70' : 'bg-fg-subtle/45'}`}
                      style={{ height: a.hours ? `max(3px, ${(a.hours / scaleMax) * 100}%)` : '2px' }}
                    />
                  </div>
                )
              })}
            </div>
          </div>
          <div className="grid gap-x-[2px] mt-1.5 text-[11px] text-fg-subtle" style={{ gridTemplateColumns: GRID_COLS }}>
            <div className="flex justify-between" style={{ gridColumn: `1 / span ${CHART_DAYS}` }}>
              <span>{formatDayLabel(chart[0].day, timezone)}</span>
              <span className="font-semibold text-accent">Today</span>
            </div>
            <span />
            {averages.map((a) => (
              <span key={a.key} className="text-center font-medium whitespace-nowrap">{a.short}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Activity-style ring for a page header: it fills as today's done hours
 *  approach a typical day (the 4-week average) and closes with a check when
 *  you reach it; past that a darker second lap starts. Beside it: todos done,
 *  hours done and the average. Updates the moment a todo is ticked done. */
export function HoursTodayInline({ className = '' }: { className?: string }) {
  const { meId, stats } = useHoursToday()
  if (meId === null) {
    return (
      <span
        title="Set yourself as the default assignee in Settings → Todo defaults to track hours done today"
        className={`inline-flex items-center gap-1.5 text-xs text-fg-subtle ${className}`}
      >
        <Clock size={13} className="shrink-0" />Set a default assignee to track today
      </span>
    )
  }
  const { todayHours, todayTasks, avg, activeDays } = stats
  const hasAvg = activeDays > 0 && avg > 0
  // Without history yet, measure against a 6h day so the ring still moves.
  const typical = hasAvg ? avg : 6
  const ratio = todayHours / typical
  const firstLap = Math.min(ratio, 1)
  const secondLap = Math.min(Math.max(ratio - 1, 0), 1)
  const reached = ratio >= 1

  const size = 30
  const stroke = 4.5
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const arc = (frac: number) => ({ strokeDasharray: c, strokeDashoffset: c * (1 - frac) })
  const summary = `Today: ${fmt(todayHours)} done (${todayTasks} ${todayTasks === 1 ? 'todo' : 'todos'}) · ` +
    (hasAvg ? `${Math.round(ratio * 100)}% of your typical day (${fmt(avg)})` : 'no history yet — measured against a 6h day')

  return (
    <span title={summary} className={`inline-flex items-center gap-2.5 ${className}`}>
    <span role="img" aria-label={summary} className="relative inline-grid place-items-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-accent/15" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
          className="stroke-accent motion-safe:transition-[stroke-dashoffset] motion-safe:duration-700 ease-out"
          style={arc(firstLap)}
        />
        {secondLap > 0 && (
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
            className="stroke-accent-active motion-safe:transition-[stroke-dashoffset] motion-safe:duration-700 ease-out"
            style={arc(secondLap)}
          />
        )}
      </svg>
      {reached && <Check size={13} strokeWidth={3.5} className="absolute text-accent" aria-hidden />}
    </span>
    <span aria-hidden className="text-sm text-fg-muted tabular-nums whitespace-nowrap">
      <span className="font-semibold text-fg">{todayTasks}</span> {todayTasks === 1 ? 'todo' : 'todos'}
      <span className="text-fg-faint"> · </span>
      <span className="font-semibold text-fg">{fmt(todayHours)}</span> done
      {hasAvg && <><span className="text-fg-faint"> · </span>avg {fmt(avg)}</>}
    </span>
    </span>
  )
}
