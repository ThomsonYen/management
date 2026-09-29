import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
 Calendar,
 ChevronDown,
 ChevronLeft,
 ChevronRight,
 ChevronsDownUp,
 ChevronsLeft,
 ChevronsRight,
 ChevronsUpDown,
 Maximize2,
 Minus,
 Plus,
} from 'lucide-react'
import { fetchDailyGoals, upsertDailyGoal } from '../api'
import type { DailyGoal } from '../api'
import { useHotkeys, useTimezone } from '../SettingsContext'
import { useHotkey } from '../hooks/useHotkey'
import { useDebouncedFn } from '../hooks/useDebouncedFn'
import { getTodayString } from '../dateUtils'
import NoteEditor from '../components/NoteEditor'
import EnlargedNote from '../components/EnlargedNote'
import SaveIndicator, { type SaveState } from '../components/SaveIndicator'
import { useIsDesktop } from '../hooks/useMediaQuery'
import { config } from '../config'

// ─── Helpers ────────────────────────────────────────────────────────────────

function addDays(dateStr: string, days: number): string {
 // Parse and serialize in UTC consistently. Using local-time getters/setters here
 // but toISOString() (UTC) below causes the day increment to cancel out in
 // timezones east of UTC (local midnight is the previous UTC day), which makes
 // dateRange() loop forever and freezes the page.
 const d = new Date(dateStr + 'T00:00:00Z')
 d.setUTCDate(d.getUTCDate() + days)
 return d.toISOString().slice(0, 10)
}

function getDayName(dateStr: string): string {
 return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' })
}

function formatDate(dateStr: string): string {
 return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatDateFull(dateStr: string): string {
 return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function dateRange(from: string, to: string): string[] {
 const dates: string[] = []
 let cur = from
 while (cur <= to) {
 dates.push(cur)
 cur = addDays(cur, 1)
 }
 return dates
}

// ─── Per-day todo counting (for header badges) ───────────────────────────────

function countTodos(content: string): { done: number; total: number } {
 let done = 0
 let total = 0
 for (const line of content.split('\n')) {
 const m = line.match(/^\s*-\s+\[([ xX])\]/)
 if (m) {
 total++
 if (m[1] !== ' ') done++
 }
 }
 return { done, total }
}

// ─── Look ───────────────────────────────────────────────────────────────────

/** One colour per weekday (Sunday first), shown as a dot beside the day name. */
const WEEKDAY_DOTS = [
 'bg-sky-400',
 'bg-violet-400',
 'bg-emerald-400',
 'bg-amber-400',
 'bg-rose-400',
 'bg-teal-400',
 'bg-orange-400',
]

function weekdayDot(dateStr: string): string {
 return WEEKDAY_DOTS[new Date(dateStr + 'T00:00:00').getDay()]
}

const toolbarGroup = 'inline-flex items-center gap-0.5 p-1 rounded-xl bg-surface border border-border shadow-xs'
const toolbarButton =
 'inline-flex items-center justify-center gap-1 h-9 md:h-8 min-w-9 md:min-w-8 px-2 rounded-lg text-sm font-medium ' +
 'text-fg-muted hover:text-fg hover:bg-inset active:bg-border-subtle transition-colors ' +
 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ' +
 'disabled:opacity-40 disabled:pointer-events-none select-none'
const cardIconButton =
 'inline-flex items-center justify-center h-8 w-8 md:h-7 md:w-7 rounded-md text-fg-subtle hover:text-fg hover:bg-inset transition-colors ' +
 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50'

/** "Before − 2 +": how many days to show on one side of the anchor. */
function DayStepper({ label, value, onChange, hint }: { label: string; value: number; onChange: (n: number) => void; hint: string }) {
 return (
 <div className="flex items-center" role="group" aria-label={`Days ${hint}`}>
 <span className="px-1.5 text-xs font-medium text-fg-subtle">{label}</span>
 <button
 type="button"
 onClick={() => onChange(Math.max(0, value - 1))}
 disabled={value === 0}
 title={`Show one day fewer ${hint}`}
 aria-label={`Show one day fewer ${hint}`}
 className={toolbarButton}
 >
 <Minus size={14} />
 </button>
 <span className="w-6 text-center text-sm font-semibold tabular-nums text-fg" aria-live="polite">{value}</span>
 <button
 type="button"
 onClick={() => onChange(value + 1)}
 title={`Show one day more ${hint}`}
 aria-label={`Show one day more ${hint}`}
 className={toolbarButton}
 >
 <Plus size={14} />
 </button>
 </div>
 )
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function WeeklyGoalsPage() {
 const { timezone } = useTimezone()
 const isDesktop = useIsDesktop()
 const todayStr = getTodayString(timezone)

 const [anchor, setAnchor] = useState(() => todayStr)
 const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
 const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
 const [dayHeights, setDayHeights] = useState<Map<string, number>>(() => new Map())
 const [daysBefore, setDaysBefore] = useState(() => {
 const saved = localStorage.getItem('goalDaysBefore')
 return saved ? parseInt(saved) : 2
 })
 const [daysAfter, setDaysAfter] = useState(() => {
 const saved = localStorage.getItem('goalDaysAfter')
 return saved ? parseInt(saved) : 6
 })

 useEffect(() => { localStorage.setItem('goalDaysBefore', String(daysBefore)) }, [daysBefore])
 useEffect(() => { localStorage.setItem('goalDaysAfter', String(daysAfter)) }, [daysAfter])

 const rangeFrom = useMemo(() => addDays(anchor, -daysBefore), [anchor, daysBefore])
 const rangeTo = useMemo(() => addDays(anchor, daysAfter), [anchor, daysAfter])
 const dates = useMemo(() => dateRange(rangeFrom, rangeTo), [rangeFrom, rangeTo])

 // Source of truth: per-day content map.
 const [dayContent, setDayContent] = useState<Map<string, string>>(() => new Map())
 const dayContentRef = useRef(dayContent)
 dayContentRef.current = dayContent
 const lastServerGoals = useRef<Map<string, string>>(new Map())
 const datesRef = useRef(dates)
 datesRef.current = dates
 const [dirty, setDirty] = useState(false)

 const { data: goals } = useQuery({
 queryKey: ['daily-goals', rangeFrom, rangeTo],
 queryFn: () => fetchDailyGoals(rangeFrom, rangeTo),
 })

 // Build dayContent from server data
 useEffect(() => {
 if (!goals) return
 const m = new Map<string, string>()
 for (const g of goals) {
 if (g.content) m.set(g.date, g.content)
 }
 lastServerGoals.current = m
 setDayContent(m)
 setDirty(false)
 }, [goals, dates])

 // Save mutation: diff each day against last known server value.
 // We don't invalidate the query on success — the local dayContent is the source of
 // truth while editing, and a refetch would stomp on in-flight keystrokes (causing
 // the cursor to jump and recent characters to be lost). Instead we update
 // lastServerGoals.current with exactly what was saved.
 const saveMutation = useMutation({
 mutationFn: async () => {
 const saved: Array<[string, string]> = []
 const promises: Promise<DailyGoal>[] = []
 const cur = dayContentRef.current
 for (const date of datesRef.current) {
 const newContent = cur.get(date) || ''
 const oldContent = lastServerGoals.current.get(date) || ''
 if (newContent !== oldContent) {
 saved.push([date, newContent])
 promises.push(upsertDailyGoal(date, newContent))
 }
 }
 await Promise.all(promises)
 return saved
 },
 onSuccess: (saved) => {
 for (const [date, content] of saved) {
 if (content) lastServerGoals.current.set(date, content)
 else lastServerGoals.current.delete(date)
 }
 setDirty(false)
 },
 })

 const save = useCallback(() => saveMutation.mutate(), [saveMutation])

 // Edits autosave a moment after typing stops (and at least every 3s while
 // typing); the save reads dayContentRef, which is current by the time it fires.
 const autosave = useDebouncedFn(() => saveMutation.mutate(), { idleMs: 800, maxMs: 3000 })

 // Update a single day; called by each day's editor and the enlarged view.
 const updateDay = useCallback((date: string, content: string) => {
 setDayContent((prev) => {
 if ((prev.get(date) || '') === content) return prev
 const next = new Map(prev)
 if (content) next.set(date, content)
 else next.delete(date)
 return next
 })
 setDirty(true)
 autosave.call()
 }, [autosave])

 // Enlarge mode: one day's goals full screen. The hotkey opens the anchor day.
 const [enlargedDate, setEnlargedDate] = useState<string | null>(null)
 const closeEnlarged = useCallback(() => setEnlargedDate(null), [])
 const { bindings } = useHotkeys()
 useHotkey(bindings.toggleNoteEnlarge, useCallback(() => setEnlargedDate(anchor), [anchor]), { skipInputCheck: true })

 // Save on Cmd+S
 useEffect(() => {
 const handler = (e: KeyboardEvent) => {
 if ((e.metaKey || e.ctrlKey) && e.key === 's') {
 e.preventDefault()
 save()
 }
 }
 window.addEventListener('keydown', handler)
 return () => window.removeEventListener('keydown', handler)
 }, [save])

 // Save on unmount (navigating away)
 useEffect(() => {
 return () => {
 const cur = dayContentRef.current
 const currentDates = datesRef.current
 const promises: Promise<DailyGoal>[] = []
 for (const date of currentDates) {
 const newContent = cur.get(date) || ''
 const oldContent = lastServerGoals.current.get(date) || ''
 if (newContent !== oldContent) promises.push(upsertDailyGoal(date, newContent))
 }
 if (promises.length > 0) Promise.all(promises)
 }
 }, [])

 const shiftAnchor = useCallback((days: number) => setAnchor((a) => addDays(a, days)), [])
 const goToToday = useCallback(() => setAnchor(todayStr), [todayStr])

 const isAnchorToday = anchor === todayStr

 const saveState: SaveState =
 saveMutation.isPending ? 'saving' :
 dirty ? 'unsaved' :
 saveMutation.isSuccess ? 'saved' :
 'idle'

 return (
 <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
 <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 mb-6">
 <div className="min-w-0">
 <h2 className="hidden md:block text-2xl font-semibold tracking-tight text-fg">Goals</h2>
 <p className="text-sm text-fg-muted mt-1 flex flex-wrap items-center gap-x-2">
 <span>{formatDateFull(rangeFrom)} &ndash; {formatDateFull(rangeTo)}</span>
 <span className="text-fg-subtle">&middot; {dates.length} days</span>
 <SaveIndicator state={saveState} />
 </p>
 </div>

 <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
 <nav aria-label="Move through days" className={`${toolbarGroup} w-full sm:w-auto justify-between`}>
 <button type="button" onClick={() => shiftAnchor(-7)} title="Back one week" aria-label="Back one week" className={toolbarButton}>
 <ChevronsLeft size={16} />
 <span className="hidden sm:inline pr-0.5">Week</span>
 </button>
 <button type="button" onClick={() => shiftAnchor(-1)} title="Back one day" aria-label="Back one day" className={toolbarButton}>
 <ChevronLeft size={16} />
 <span className="hidden sm:inline pr-0.5">Day</span>
 </button>
 <button
 type="button"
 onClick={goToToday}
 title="Center on today"
 aria-pressed={isAnchorToday}
 className={`${toolbarButton} px-3 ${isAnchorToday ? '!bg-accent-1 !text-accent-fg' : ''}`}
 >
 <Calendar size={14} />
 Today
 </button>
 <button type="button" onClick={() => shiftAnchor(1)} title="Forward one day" aria-label="Forward one day" className={toolbarButton}>
 <span className="hidden sm:inline pl-0.5">Day</span>
 <ChevronRight size={16} />
 </button>
 <button type="button" onClick={() => shiftAnchor(7)} title="Forward one week" aria-label="Forward one week" className={toolbarButton}>
 <span className="hidden sm:inline pl-0.5">Week</span>
 <ChevronsRight size={16} />
 </button>
 </nav>

 <div className={`${toolbarGroup} w-full sm:w-auto justify-between`}>
 <DayStepper label="Before" value={daysBefore} onChange={setDaysBefore} hint="before" />
 <span className="w-px h-5 bg-border mx-1" aria-hidden />
 <DayStepper label="After" value={daysAfter} onChange={setDaysAfter} hint="after" />
 </div>
 </div>
 </div>

 <div className="w-full min-w-0 space-y-3">
 {dates.map((date) => {
 const isAnchor = date === anchor
 const isToday = date === todayStr
 const isCollapsed = collapsed.has(date)
 const isExpanded = expanded.has(date)
 const content = dayContent.get(date) || ''
 const { done: doneCount, total: totalCount } = countTodos(content)
 const allDone = totalCount > 0 && doneCount === totalCount

 return (
 <div
 key={date}
 className={`rounded-xl border bg-surface transition-[opacity,box-shadow,border-color] duration-200 ${
 isToday
 ? 'goal-today'
 : isAnchor
 ? 'border-accent/60 ring-4 ring-accent/10 shadow-sm'
 : 'border-border shadow-xs opacity-75 hover:opacity-100 focus-within:opacity-100'
 }`}
 >
 <div
 onClick={() => setAnchor(date)}
 title={isAnchor ? undefined : 'Center the view on this day'}
 className={`flex items-center justify-between gap-2 pl-2 pr-2 py-1.5 cursor-pointer select-none ${
 isCollapsed ? '' : 'border-b border-border-subtle'
 } ${isToday ? 'goal-today-header' : ''}`}
 >
 <div className="flex items-center gap-2 min-w-0">
 <button
 type="button"
 onClick={(e) => {
 e.stopPropagation()
 setCollapsed(prev => {
 const next = new Set(prev)
 if (next.has(date)) next.delete(date); else next.add(date)
 return next
 })
 }}
 title={isCollapsed ? 'Show this day' : 'Fold this day'}
 aria-label={isCollapsed ? 'Show this day' : 'Fold this day'}
 aria-expanded={!isCollapsed}
 className={cardIconButton}
 >
 {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
 </button>
 <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isToday ? 'bg-accent' : weekdayDot(date)}`} aria-hidden />
 <span className={isToday ? 'text-base font-bold text-accent-fg' : 'text-sm font-semibold text-fg'}>{getDayName(date)}</span>
 <span className={`text-sm ${isToday ? 'text-fg-muted font-medium' : 'text-fg-subtle'}`}>{formatDate(date)}</span>
 {isToday && (
 <span className="inline-flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wider text-fg-on-accent bg-accent px-2 py-0.5 rounded-full shadow-sm">
 <span className="relative flex h-1.5 w-1.5" aria-hidden>
 <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
 <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
 </span>
 Today
 </span>
 )}
 </div>
 <div className="flex items-center gap-1">
 {totalCount > 0 && (
 <span
 className={`mr-1.5 flex items-center gap-1.5 text-xs font-medium tabular-nums ${allDone ? 'text-success' : 'text-fg-subtle'}`}
 title={`${doneCount} of ${totalCount} done`}
 >
 <span className="hidden sm:block w-12 h-1.5 rounded-full bg-inset overflow-hidden">
 <span className="block h-full rounded-full bg-success transition-[width]" style={{ width: `${(doneCount / totalCount) * 100}%` }} />
 </span>
 {doneCount}/{totalCount}
 </span>
 )}
 <button
 type="button"
 onClick={(e) => {
 e.stopPropagation()
 setExpanded(prev => {
 const next = new Set(prev)
 if (next.has(date)) next.delete(date); else next.add(date)
 return next
 })
 }}
 className={cardIconButton}
 title={isExpanded ? 'Back to the usual height' : 'Show all of this day'}
 aria-label={isExpanded ? 'Back to the usual height' : 'Show all of this day'}
 >
 {isExpanded ? <ChevronsDownUp size={15} /> : <ChevronsUpDown size={15} />}
 </button>
 <button
 type="button"
 onClick={(e) => {
 e.stopPropagation()
 setEnlargedDate(date)
 }}
 className={cardIconButton}
 title="Enlarge: only this day's goals"
 aria-label="Enlarge this day"
 >
 <Maximize2 size={14} />
 </button>
 </div>
 </div>

 {!isCollapsed && (
 <div className="relative">
 <div
 className="px-5 py-3 min-h-[48px] overflow-y-auto"
 style={isExpanded ? undefined : { maxHeight: isDesktop ? (dayHeights.get(date) ?? config.goal_day_box_height_px) : Math.min(dayHeights.get(date) ?? config.goal_day_box_height_px, 320) }}
 >
 <NoteEditor value={content} onChange={(md) => updateDay(date, md)} placeholder="Goals for the day…" />
 </div>
 {!isExpanded && (
 <div
 title="Drag to resize"
 className="hidden md:flex h-2.5 cursor-row-resize items-center justify-center hover:bg-inset transition-colors rounded-b-xl"
 onMouseDown={(e) => {
 e.preventDefault()
 const startY = e.clientY
 const startH = dayHeights.get(date) ?? config.goal_day_box_height_px
 const onMove = (ev: MouseEvent) => {
 const newH = Math.max(60, startH + ev.clientY - startY)
 setDayHeights(prev => new Map(prev).set(date, newH))
 }
 const onUp = () => {
 window.removeEventListener('mousemove', onMove)
 window.removeEventListener('mouseup', onUp)
 }
 window.addEventListener('mousemove', onMove)
 window.addEventListener('mouseup', onUp)
 }}
 >
 <div className="w-10 h-1 rounded-full bg-border" />
 </div>
 )}
 </div>
 )}
 </div>
 )
 })}
 </div>
 {enlargedDate && (
 <EnlargedNote
 title={`${getDayName(enlargedDate)}, ${formatDate(enlargedDate)}`}
 value={dayContent.get(enlargedDate) || ''}
 onChange={(md) => updateDay(enlargedDate, md)}
 saveState={saveState}
 onClose={closeEnlarged}
 />
 )}
 </div>
 )
}
