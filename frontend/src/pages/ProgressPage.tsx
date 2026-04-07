import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { fetchPersonProgress } from '../api'
import type { PersonProgress } from '../types'

type Granularity = 'day' | 'week' | 'month'

const DEFAULT_COUNTS: Record<Granularity, number> = { day: 14, week: 8, month: 6 }

function formatPeriodLabel(period: string, granularity: Granularity): string {
  if (granularity === 'day') {
    const d = new Date(period + 'T00:00:00')
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }
  if (granularity === 'week') {
    return period.replace(/^\d{4}-/, '')
  }
  const [y, m] = period.split('-')
  const d = new Date(Number(y), Number(m) - 1, 1)
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}

function heatColor(hours: number, maxHours: number): string {
  if (hours === 0 || maxHours === 0) return ''
  const ratio = hours / maxHours
  if (ratio < 0.25) return 'bg-green-100 dark:bg-green-900/30'
  if (ratio < 0.5) return 'bg-green-200 dark:bg-green-800/40'
  if (ratio < 0.75) return 'bg-green-300 dark:bg-green-700/50'
  return 'bg-green-400 dark:bg-green-600/60'
}

function getCurrentPeriodKey(granularity: Granularity): string {
  const now = new Date()
  if (granularity === 'day') {
    return now.toISOString().slice(0, 10)
  }
  if (granularity === 'week') {
    // ISO week calculation
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
  }
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export default function ProgressPage() {
  const [granularity, setGranularity] = useState<Granularity>(() => {
    const saved = localStorage.getItem('progress-granularity')
    if (saved === 'day' || saved === 'week' || saved === 'month') return saved
    return 'week'
  })
  const [counts, setCounts] = useState<Record<Granularity, number>>(() => {
    try {
      const saved = localStorage.getItem('progress-counts')
      if (saved) return { ...DEFAULT_COUNTS, ...JSON.parse(saved) }
    } catch { /* ignore */ }
    return { ...DEFAULT_COUNTS }
  })
  const [pageOffset, setPageOffset] = useState(0) // 0 = most recent, 1 = one page back, etc.

  const count = counts[granularity]

  const { data: progress = [], isLoading } = useQuery<PersonProgress[]>({
    queryKey: ['person-progress', granularity],
    queryFn: () => fetchPersonProgress(granularity),
  })

  // Collect all unique periods, sorted chronologically
  const allPeriods = useMemo(() => {
    const set = new Set<string>()
    for (const p of progress) {
      for (const b of p.buckets) set.add(b.period)
    }
    return Array.from(set).sort()
  }, [progress])

  // Slice to show `count` periods ending at the current page window
  const visiblePeriods = useMemo(() => {
    const currentKey = getCurrentPeriodKey(granularity)
    // Find the index of the current period (or the last one <= current)
    let endIdx = allPeriods.length
    for (let i = allPeriods.length - 1; i >= 0; i--) {
      if (allPeriods[i] <= currentKey) {
        endIdx = i + 1
        break
      }
    }
    // Apply page offset
    const pageEnd = endIdx - pageOffset * count
    const pageStart = Math.max(0, pageEnd - count)
    return allPeriods.slice(pageStart, Math.max(pageStart, pageEnd))
  }, [allPeriods, granularity, count, pageOffset])

  const canGoNewer = pageOffset > 0
  const canGoOlder = useMemo(() => {
    const currentKey = getCurrentPeriodKey(granularity)
    let endIdx = allPeriods.length
    for (let i = allPeriods.length - 1; i >= 0; i--) {
      if (allPeriods[i] <= currentKey) { endIdx = i + 1; break }
    }
    const pageEnd = endIdx - pageOffset * count
    return pageEnd - count > 0
  }, [allPeriods, granularity, count, pageOffset])

  // Build lookup: personId -> period -> bucket
  const lookup = useMemo(() => {
    const m = new Map<number, Map<string, { task_count: number; total_hours: number }>>()
    for (const p of progress) {
      const bm = new Map<string, { task_count: number; total_hours: number }>()
      for (const b of p.buckets) bm.set(b.period, b)
      m.set(p.person_id, bm)
    }
    return m
  }, [progress])

  // Max hours in any visible cell (for heat coloring)
  const maxHours = useMemo(() => {
    let max = 0
    const periodSet = new Set(visiblePeriods)
    for (const p of progress) {
      for (const b of p.buckets) {
        if (periodSet.has(b.period) && b.total_hours > max) max = b.total_hours
      }
    }
    return max
  }, [progress, visiblePeriods])

  // Column totals for visible periods
  const columnTotals = useMemo(() => {
    const totals = new Map<string, { count: number; hours: number }>()
    for (const period of visiblePeriods) {
      let c = 0, h = 0
      for (const p of progress) {
        const b = lookup.get(p.person_id)?.get(period)
        if (b) { c += b.task_count; h += b.total_hours }
      }
      totals.set(period, { count: c, hours: h })
    }
    return totals
  }, [visiblePeriods, progress, lookup])

  // Visible-window totals per person
  const visibleTotals = useMemo(() => {
    const periodSet = new Set(visiblePeriods)
    const m = new Map<number, { count: number; hours: number }>()
    for (const p of progress) {
      let c = 0, h = 0
      for (const b of p.buckets) {
        if (periodSet.has(b.period)) { c += b.task_count; h += b.total_hours }
      }
      m.set(p.person_id, { count: c, hours: h })
    }
    return m
  }, [progress, visiblePeriods])

  const totalTasks = Array.from(visibleTotals.values()).reduce((s, v) => s + v.count, 0)
  const totalHours = Array.from(visibleTotals.values()).reduce((s, v) => s + v.hours, 0)

  const granularityOptions: Granularity[] = ['day', 'week', 'month']

  const handleCountChange = (val: string) => {
    const n = parseInt(val, 10)
    if (n > 0 && n <= 365) {
      setCounts((prev) => {
        const next = { ...prev, [granularity]: n }
        localStorage.setItem('progress-counts', JSON.stringify(next))
        return next
      })
      setPageOffset(0)
    }
  }

  const handleGranularityChange = (g: Granularity) => {
    setGranularity(g)
    localStorage.setItem('progress-granularity', g)
    setPageOffset(0)
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Progress</h1>
        <div className="flex items-center gap-4">
          {/* Period count */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-500 dark:text-slate-400">Show</label>
            <input
              type="number"
              min={1}
              max={365}
              value={count}
              onChange={(e) => handleCountChange(e.target.value)}
              className="w-16 px-2 py-1.5 text-sm rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-center"
            />
            <span className="text-sm text-slate-500 dark:text-slate-400">{granularity}s</span>
          </div>
          {/* Granularity toggle */}
          <div className="flex items-center gap-1 bg-slate-200 dark:bg-slate-800 rounded-lg p-1">
            {granularityOptions.map((g) => (
              <button
                key={g}
                onClick={() => handleGranularityChange(g)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  granularity === g
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {g.charAt(0).toUpperCase() + g.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">People</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{progress.length}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">Tasks Completed</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{totalTasks}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">Total Hours</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{totalHours.toFixed(1)}</p>
        </div>
      </div>

      {isLoading ? (
        <p className="text-slate-500 dark:text-slate-400">Loading...</p>
      ) : progress.length === 0 ? (
        <div className="text-center py-16 text-slate-500 dark:text-slate-400">
          No completed tasks found for this period.
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          {/* Pagination controls */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 dark:border-slate-800">
            <button
              onClick={() => setPageOffset((p) => p + 1)}
              disabled={!canGoOlder}
              className="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={16} /> Older
            </button>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {visiblePeriods.length > 0
                ? `${formatPeriodLabel(visiblePeriods[0], granularity)} — ${formatPeriodLabel(visiblePeriods[visiblePeriods.length - 1], granularity)}`
                : 'No data'}
            </span>
            <button
              onClick={() => setPageOffset((p) => Math.max(0, p - 1))}
              disabled={!canGoNewer}
              className="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Newer <ChevronRight size={16} />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <th className="sticky left-0 z-10 bg-slate-50 dark:bg-slate-900 text-left px-4 py-3 font-semibold text-slate-700 dark:text-slate-300 min-w-[140px]">
                    Person
                  </th>
                  {visiblePeriods.map((period) => (
                    <th
                      key={period}
                      className="px-3 py-3 font-medium text-slate-500 dark:text-slate-400 text-center whitespace-nowrap min-w-[80px]"
                    >
                      {formatPeriodLabel(period, granularity)}
                    </th>
                  ))}
                  <th className="sticky right-0 z-10 bg-slate-50 dark:bg-slate-900 px-4 py-3 font-semibold text-slate-700 dark:text-slate-300 text-center min-w-[90px]">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {progress.map((person) => {
                  const personBuckets = lookup.get(person.person_id)!
                  const pTotals = visibleTotals.get(person.person_id)!
                  return (
                    <tr
                      key={person.person_id}
                      className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30"
                    >
                      <td className="sticky left-0 z-10 bg-white dark:bg-slate-900 px-4 py-3 font-medium text-slate-900 dark:text-white whitespace-nowrap">
                        {person.person_name}
                      </td>
                      {visiblePeriods.map((period) => {
                        const bucket = personBuckets.get(period)
                        const cnt = bucket?.task_count ?? 0
                        const hrs = bucket?.total_hours ?? 0
                        return (
                          <td
                            key={period}
                            className={`px-3 py-3 text-center ${heatColor(hrs, maxHours)}`}
                          >
                            {cnt > 0 ? (
                              <div>
                                <span className="font-medium text-slate-900 dark:text-white">{cnt}</span>
                                <span className="text-slate-400 dark:text-slate-500 text-xs ml-1">
                                  {hrs.toFixed(1)}h
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-300 dark:text-slate-700">-</span>
                            )}
                          </td>
                        )
                      })}
                      <td className="sticky right-0 z-10 bg-white dark:bg-slate-900 px-4 py-3 text-center font-semibold">
                        <span className="text-slate-900 dark:text-white">{pTotals.count}</span>
                        <span className="text-slate-400 dark:text-slate-500 text-xs ml-1">
                          {pTotals.hours.toFixed(1)}h
                        </span>
                      </td>
                    </tr>
                  )
                })}
                {/* Column totals row */}
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700">
                  <td className="sticky left-0 z-10 bg-slate-50 dark:bg-slate-800/50 px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">
                    Total
                  </td>
                  {visiblePeriods.map((period) => {
                    const col = columnTotals.get(period)!
                    return (
                      <td key={period} className="px-3 py-3 text-center font-semibold">
                        <span className="text-slate-700 dark:text-slate-300">{col.count}</span>
                        <span className="text-slate-400 dark:text-slate-500 text-xs ml-1">
                          {col.hours.toFixed(1)}h
                        </span>
                      </td>
                    )
                  })}
                  <td className="sticky right-0 z-10 bg-slate-50 dark:bg-slate-800/50 px-4 py-3 text-center font-bold">
                    <span className="text-slate-900 dark:text-white">{totalTasks}</span>
                    <span className="text-slate-400 dark:text-slate-500 text-xs ml-1">
                      {totalHours.toFixed(1)}h
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
