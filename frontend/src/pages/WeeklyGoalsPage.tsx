import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import MDEditor from '@uiw/react-md-editor'
import { Calendar, ChevronDown, ChevronRight, Maximize2, Minimize2 } from 'lucide-react'
import { fetchDailyGoals, upsertDailyGoal } from '../api'
import type { DailyGoal } from '../api'
import { useTimezone, useTheme, useHotkeys } from '../SettingsContext'
import { getTodayString } from '../dateUtils'
import MarkdownEditor from '../components/MarkdownEditor'
import SaveIndicator, { type SaveState } from '../components/SaveIndicator'
import { config } from '../config'
import { createMdEditorKeyHandler } from '../utils/mdEditorKeyHandler'

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

// ─── Per-day content assembly / disassembly ─────────────────────────────────

function assembleMarkdown(dates: string[], goalMap: Map<string, string>): string {
 return dates
 .map((date) => {
 const header = `## ${getDayName(date)} (${formatDate(date)})`
 const content = goalMap.get(date) || ''
 return content ? `${header}\n${content}` : header
 })
 .join('\n\n')
}

function buildDateLookup(dates: string[]): Map<string, string> {
 const lookup = new Map<string, string>()
 for (const date of dates) {
 const d = new Date(date + 'T00:00:00')
 lookup.set(date, date)
 lookup.set(formatDate(date).toLowerCase(), date)
 lookup.set(d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }).toLowerCase(), date)
 if (!lookup.has(d.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase())) {
 lookup.set(d.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase(), date)
 }
 if (!lookup.has(d.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase())) {
 lookup.set(d.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase(), date)
 }
 }
 return lookup
}

function matchHeader(headerText: string, lookup: Map<string, string>): string | undefined {
 const parenMatch = headerText.match(/\((.+?)\)/)
 if (parenMatch) {
 const inner = parenMatch[1].trim().toLowerCase()
 const found = lookup.get(inner)
 if (found) return found
 }
 const beforeParen = headerText.replace(/\(.*?\)/, '').trim().toLowerCase()
 if (beforeParen) {
 const found = lookup.get(beforeParen)
 if (found) return found
 }
 return lookup.get(headerText.trim().toLowerCase())
}

function disassembleMarkdown(markdown: string, dates: string[]): Map<string, string> {
 const result = new Map<string, string>()
 const lookup = buildDateLookup(dates)

 const lines = markdown.split('\n')
 let currentDate: string | null = null
 let currentLines: string[] = []

 const flush = () => {
 if (currentDate) {
 while (currentLines.length > 0 && !currentLines[0].trim()) currentLines.shift()
 while (currentLines.length > 0 && !currentLines[currentLines.length - 1].trim()) currentLines.pop()
 result.set(currentDate, currentLines.join('\n'))
 }
 currentLines = []
 }

 for (const line of lines) {
 const h2 = line.match(/^##\s+(.+)/)
 if (h2) {
 const matched = matchHeader(h2[1], lookup)
 if (matched) {
 flush()
 currentDate = matched
 continue
 }
 }
 if (currentDate) currentLines.push(line)
 }
 flush()

 return result
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

// ─── Colors ─────────────────────────────────────────────────────────────────

const CARD_COLORS = [
 'border-blue-300 ',
 'border-violet-300 dark:border-violet-600',
 'border-emerald-300 dark:border-emerald-600',
 'border-warning/40 ',
 'border-rose-300 dark:border-rose-600',
 'border-teal-300 dark:border-teal-600',
 'border-warning/40 ',
]
const HEADER_COLORS = [
 'bg-info-bg text-info ',
 'bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300',
 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300',
 'bg-warning-bg text-warning ',
 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300',
 'bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300',
 'bg-warning-bg text-warning ',
]

// ─── Component ──────────────────────────────────────────────────────────────

export default function WeeklyGoalsPage() {
 const { timezone } = useTimezone()
 const { theme } = useTheme()
 const { bindings } = useHotkeys()
 const editorKeyDown = useMemo(() => createMdEditorKeyHandler(bindings), [bindings])
 const todayStr = getTodayString(timezone)

 const [showEditor, setShowEditor] = useState(() => {
 const saved = localStorage.getItem('goalShowEditor')
 return saved !== null ? saved === 'true' : true
 })
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

 useEffect(() => { localStorage.setItem('goalShowEditor', String(showEditor)) }, [showEditor])
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

 // Update a single day; called by per-day MarkdownEditor onChange/onSave.
 const updateDay = useCallback((date: string, content: string) => {
 setDayContent((prev) => {
 if ((prev.get(date) || '') === content) return prev
 const next = new Map(prev)
 if (content) next.set(date, content)
 else next.delete(date)
 return next
 })
 setDirty(true)
 }, [])

 const saveDay = useCallback((date: string, content: string) => {
 setDayContent((prev) => {
 if ((prev.get(date) || '') === content) {
 saveMutation.mutate()
 return prev
 }
 const next = new Map(prev)
 if (content) next.set(date, content)
 else next.delete(date)
 // Update ref immediately so saveMutation reads the new value
 dayContentRef.current = next
 saveMutation.mutate()
 return next
 })
 }, [saveMutation])

 // Assembled markdown for the left-side MDEditor.
 const assembledMd = useMemo(() => assembleMarkdown(dates, dayContent), [dates, dayContent])

 const handleEditorChange = useCallback((markdown: string) => {
 const newMap = disassembleMarkdown(markdown, datesRef.current)
 setDayContent(newMap)
 setDirty(true)
 }, [])

 const handleInsertTemplate = useCallback(() => {
 const template = assembleMarkdown(dates, new Map())
 handleEditorChange(template)
 }, [dates, handleEditorChange])

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
 <div className="p-6 max-w-[1400px] mx-auto">
 <div className="flex items-center justify-between mb-5">
 <div>
 <h2 className="text-2xl font-bold text-fg">Goals</h2>
 <p className="text-sm text-fg-muted mt-1">
 {formatDateFull(rangeFrom)} &ndash; {formatDateFull(rangeTo)}
 <span className="ml-2 text-xs text-fg-subtle">
 ({dates.length} days)
 </span>
 </p>
 </div>

 <div className="flex items-center gap-2">
 <div className="flex items-center gap-1">
 <button onClick={() => shiftAnchor(-7)} className="px-2 py-1 rounded-md text-xs font-medium hover:bg-border-subtle dark:hover:bg-elevated text-fg-muted transition-colors">
 -1w
 </button>
 <button onClick={() => shiftAnchor(-1)} className="px-2 py-1 rounded-md text-xs font-medium hover:bg-border-subtle dark:hover:bg-elevated text-fg-muted transition-colors">
 -1d
 </button>
 <button
 onClick={goToToday}
 className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
 isAnchorToday
 ? 'bg-accent-1 text-accent-fg'
 : 'hover:bg-border-subtle dark:hover:bg-elevated text-fg-muted'
 }`}
 >
 <Calendar size={12} />
 Today
 </button>
 <button onClick={() => shiftAnchor(1)} className="px-2 py-1 rounded-md text-xs font-medium hover:bg-border-subtle dark:hover:bg-elevated text-fg-muted transition-colors">
 +1d
 </button>
 <button onClick={() => shiftAnchor(7)} className="px-2 py-1 rounded-md text-xs font-medium hover:bg-border-subtle dark:hover:bg-elevated text-fg-muted transition-colors">
 +1w
 </button>
 </div>

 <div className="w-px h-5 bg-border " />

 <div className="flex items-center gap-3">
 <div className="flex items-center gap-1">
 <span className="text-[10px] uppercase tracking-wide text-fg-subtle mr-0.5">Before</span>
 <button
 onClick={() => setDaysBefore((v) => Math.max(0, v - 1))}
 className="w-5 h-5 rounded flex items-center justify-center text-xs font-bold text-fg-subtle hover:text-fg-muted dark:text-fg-subtle dark:hover:text-fg-faint hover:bg-inset dark:hover:bg-elevated transition-colors"
 >−</button>
 <span className="text-xs font-semibold text-fg-muted tabular-nums w-4 text-center">{daysBefore}</span>
 <button
 onClick={() => setDaysBefore((v) => v + 1)}
 className="w-5 h-5 rounded flex items-center justify-center text-xs font-bold text-fg-subtle hover:text-fg-muted dark:text-fg-subtle dark:hover:text-fg-faint hover:bg-inset dark:hover:bg-elevated transition-colors"
 >+</button>
 </div>
 <div className="flex items-center gap-1">
 <span className="text-[10px] uppercase tracking-wide text-fg-subtle mr-0.5">After</span>
 <button
 onClick={() => setDaysAfter((v) => Math.max(0, v - 1))}
 className="w-5 h-5 rounded flex items-center justify-center text-xs font-bold text-fg-subtle hover:text-fg-muted dark:text-fg-subtle dark:hover:text-fg-faint hover:bg-inset dark:hover:bg-elevated transition-colors"
 >−</button>
 <span className="text-xs font-semibold text-fg-muted tabular-nums w-4 text-center">{daysAfter}</span>
 <button
 onClick={() => setDaysAfter((v) => v + 1)}
 className="w-5 h-5 rounded flex items-center justify-center text-xs font-bold text-fg-subtle hover:text-fg-muted dark:text-fg-subtle dark:hover:text-fg-faint hover:bg-inset dark:hover:bg-elevated transition-colors"
 >+</button>
 </div>
 </div>

 <div className="w-px h-5 bg-border " />

 <button
 onClick={() => setShowEditor((v) => !v)}
 className={`px-2 py-1 rounded-md text-xs font-medium transition-colors ${
 showEditor
 ? 'bg-inset text-fg'
 : 'hover:bg-border-subtle dark:hover:bg-elevated text-fg-muted'
 }`}
 >
 {showEditor ? 'Hide editor' : 'Show editor'}
 </button>

 <div className="min-w-[70px] text-right">
 <SaveIndicator state={saveState} />
 </div>
 </div>
 </div>

 <div className="flex gap-5 items-start">
 {showEditor && (
 <div className="w-1/2 flex-shrink-0 sticky top-6">
 <div className="bg-surface rounded-xl border border-border shadow-sm flex flex-col max-h-[calc(100vh-140px)]" data-color-mode={theme} onKeyDownCapture={editorKeyDown}>
 <div className="flex items-center justify-between px-4 py-2 border-b border-border flex-shrink-0">
 <span className="text-xs font-medium text-fg-muted uppercase tracking-wide">Editor</span>
 {!assembledMd.trim() && (
 <button onClick={handleInsertTemplate} className="text-xs text-accent hover:text-accent-fg dark:hover:text-accent font-medium">
 Insert template
 </button>
 )}
 </div>
 <MDEditor
 value={assembledMd}
 onChange={(val) => handleEditorChange(val ?? '')}
 preview="edit"
 visibleDragbar={false}
 height={500}
 />
 </div>
 </div>
 )}

 <div className={`${showEditor ? 'w-1/2' : 'w-full'} min-w-0 space-y-3`}>
 {dates.map((date, idx) => {
 const isAnchor = date === anchor
 const isCollapsed = collapsed.has(date)
 const isExpanded = expanded.has(date)
 const content = dayContent.get(date) || ''
 const { done: doneCount, total: totalCount } = countTodos(content)

 return (
 <div
 key={date}
 className={`rounded-xl border-2 shadow-sm transition-all ${
 isAnchor
 ? 'border-accent dark:border-accent ring-2 ring-accent/40 dark:ring-accent'
 : CARD_COLORS[idx % CARD_COLORS.length]
 } ${!isAnchor ? 'opacity-50' : ''}`}
 >
 <div
 onClick={() => setAnchor(date)}
 className={`px-4 py-2.5 ${isCollapsed ? 'rounded-[10px]' : 'rounded-t-[10px]'} flex items-center justify-between cursor-pointer select-none ${
 isAnchor
 ? 'bg-accent-1 dark:bg-accent-1 text-accent-fg'
 : HEADER_COLORS[idx % HEADER_COLORS.length]
 }`}
 >
 <div className="flex items-center gap-2">
 <button
 onClick={(e) => {
 e.stopPropagation()
 setCollapsed(prev => {
 const next = new Set(prev)
 if (next.has(date)) next.delete(date); else next.add(date)
 return next
 })
 }}
 className="p-0.5 -ml-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
 >
 {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
 </button>
 <span className="text-sm font-bold">{getDayName(date)}</span>
 <span className="text-xs opacity-70">{formatDate(date)}</span>
 {isAnchor && (
 <span className="text-[10px] font-bold uppercase tracking-wider bg-accent text-white px-1.5 py-0.5 rounded">Anchor</span>
 )}
 </div>
 <div className="flex items-center gap-2">
 {totalCount > 0 && (
 <span className={`text-xs font-medium ${doneCount === totalCount ? 'text-success' : 'opacity-60'}`}>
 {doneCount}/{totalCount}
 </span>
 )}
 <button
 onClick={(e) => {
 e.stopPropagation()
 setExpanded(prev => {
 const next = new Set(prev)
 if (next.has(date)) next.delete(date); else next.add(date)
 return next
 })
 }}
 className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
 title={isExpanded ? 'Collapse to default size' : 'Expand fully'}
 >
 {isExpanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
 </button>
 </div>
 </div>

 {!isCollapsed && (
 <div className="relative bg-surface rounded-b-[10px]">
 <div
 className="px-4 py-3 min-h-[40px] overflow-y-auto"
 style={isExpanded ? undefined : { maxHeight: dayHeights.get(date) ?? config.goal_day_box_height_px }}
 >
 <MarkdownEditor
 value={content}
 onChange={(md) => updateDay(date, md)}
 onSave={(md) => saveDay(date, md)}
 />
 </div>
 {!isExpanded && (
 <div
 className="h-1.5 cursor-row-resize flex items-center justify-center hover:bg-inset dark:hover:bg-elevated transition-colors rounded-b-[10px]"
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
 <div className="w-8 h-0.5 rounded bg-border dark:bg-inset" />
 </div>
 )}
 </div>
 )}
 </div>
 )
 })}
 </div>
 </div>
 </div>
 )
}
