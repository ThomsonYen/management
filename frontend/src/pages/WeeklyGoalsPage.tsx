import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import MDEditor from '@uiw/react-md-editor'
import { Calendar } from 'lucide-react'
import { fetchDailyGoals, upsertDailyGoal } from '../api'
import type { DailyGoal } from '../api'
import { useTimezone } from '../TimezoneContext'
import { useTheme } from '../ThemeContext'
import { getTodayString } from '../dateUtils'
import {
  parseContentBlocks, toggleCheckboxLine, editLineText, splitLineAt,
  deleteLine, indentLine, unindentLine, mergeLineUp, pasteMultiLine,
  ContentBlockList, type ContentBlock, type FocusRequest, type BlockEditHandlers,
} from '../components/MarkdownRenderer'
import { createMdEditorKeyHandler } from '../utils/mdEditorKeyHandler'
import { useHotkeys } from '../HotkeysContext'

// ─── Helpers ────────────────────────────────────────────────────────────────

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
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

/** Build array of dates from `from` to `to` inclusive */
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

/** Assemble per-day records into a single markdown string with ## headers */
function assembleMarkdown(dates: string[], goalMap: Map<string, string>): string {
  return dates
    .map((date) => {
      const header = `## ${getDayName(date)} (${formatDate(date)})`
      const content = goalMap.get(date) || ''
      return content ? `${header}\n${content}` : header
    })
    .join('\n\n')
}

/** Build a lookup map from various date string forms -> YYYY-MM-DD */
function buildDateLookup(dates: string[]): Map<string, string> {
  const lookup = new Map<string, string>()
  for (const date of dates) {
    const d = new Date(date + 'T00:00:00')
    lookup.set(date, date)
    lookup.set(formatDate(date).toLowerCase(), date)
    lookup.set(d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }).toLowerCase(), date)
    // Day names can collide when range spans 7+ days, so they're low priority
    if (!lookup.has(d.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase())) {
      lookup.set(d.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase(), date)
    }
    if (!lookup.has(d.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase())) {
      lookup.set(d.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase(), date)
    }
  }
  return lookup
}

/**
 * Match a ## header like "Saturday (Apr 4)" against the date lookup.
 * Tries the parenthetical content first (most specific), then the part
 * before the parenthetical, then the full text without parens stripped.
 */
function matchHeader(headerText: string, lookup: Map<string, string>): string | undefined {
  // 1. Try the parenthetical content: "Apr 4" from "Saturday (Apr 4)"
  const parenMatch = headerText.match(/\((.+?)\)/)
  if (parenMatch) {
    const inner = parenMatch[1].trim().toLowerCase()
    const found = lookup.get(inner)
    if (found) return found
  }

  // 2. Try the part before parenthetical: "Saturday" from "Saturday (Apr 4)"
  const beforeParen = headerText.replace(/\(.*?\)/, '').trim().toLowerCase()
  if (beforeParen) {
    const found = lookup.get(beforeParen)
    if (found) return found
  }

  // 3. Try the full text as-is
  return lookup.get(headerText.trim().toLowerCase())
}

/** Split editor markdown back into per-day content chunks */
function disassembleMarkdown(
  markdown: string,
  dates: string[]
): Map<string, string> {
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
    if (currentDate) {
      currentLines.push(line)
    }
  }
  flush()

  return result
}

// ─── Parsing for rendered view ──────────────────────────────────────────────

interface ParsedDay {
  date: string
  dayName: string
  blocks: ContentBlock[]
}

function parseAssembled(markdown: string, dates: string[]): ParsedDay[] {
  const lines = markdown.split('\n')
  const lookup = buildDateLookup(dates)

  const dayContent = new Map<string, { startLine: number; lines: string[] }>()
  let currentDate: string | null = null

  for (let i = 0; i < lines.length; i++) {
    const h2 = lines[i].match(/^##\s+(.+)/)
    if (h2) {
      const matched = matchHeader(h2[1], lookup)
      if (matched) {
        currentDate = matched
        if (!dayContent.has(matched)) {
          dayContent.set(matched, { startLine: i + 1, lines: [] })
        }
        continue
      }
    }
    if (currentDate) {
      dayContent.get(currentDate)!.lines.push(lines[i])
    }
  }

  return dates.map((date) => {
    const entry = dayContent.get(date)
    return {
      date,
      dayName: getDayName(date),
      blocks: entry ? parseContentBlocks(entry.lines.join('\n'), entry.startLine) : [],
    }
  })
}

// ─── Colors ─────────────────────────────────────────────────────────────────

const CARD_COLORS = [
  'border-blue-300 dark:border-blue-600',
  'border-violet-300 dark:border-violet-600',
  'border-emerald-300 dark:border-emerald-600',
  'border-amber-300 dark:border-amber-600',
  'border-rose-300 dark:border-rose-600',
  'border-teal-300 dark:border-teal-600',
  'border-orange-300 dark:border-orange-600',
]
const HEADER_COLORS = [
  'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300',
  'bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300',
  'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300',
  'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300',
  'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300',
  'bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300',
  'bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300',
]

// ─── Component ──────────────────────────────────────────────────────────────

export default function WeeklyGoalsPage() {
  const { timezone } = useTimezone()
  const { theme } = useTheme()
  const { bindings } = useHotkeys()
  const editorKeyDown = useMemo(() => createMdEditorKeyHandler(bindings), [bindings])
  const todayStr = getTodayString(timezone)
  const queryClient = useQueryClient()

  const [anchor, setAnchor] = useState(() => todayStr)
  const [daysBefore, setDaysBefore] = useState(() => {
    const saved = localStorage.getItem('goalDaysBefore')
    return saved ? parseInt(saved) : 2
  })
  const [daysAfter, setDaysAfter] = useState(() => {
    const saved = localStorage.getItem('goalDaysAfter')
    return saved ? parseInt(saved) : 6
  })

  // Persist range prefs
  useEffect(() => { localStorage.setItem('goalDaysBefore', String(daysBefore)) }, [daysBefore])
  useEffect(() => { localStorage.setItem('goalDaysAfter', String(daysAfter)) }, [daysAfter])

  const rangeFrom = useMemo(() => addDays(anchor, -daysBefore), [anchor, daysBefore])
  const rangeTo = useMemo(() => addDays(anchor, daysAfter), [anchor, daysAfter])
  const dates = useMemo(() => dateRange(rangeFrom, rangeTo), [rangeFrom, rangeTo])

  const [localMarkdown, setLocalMarkdown] = useState('')
  const localMarkdownRef = useRef('')
  const lastServerGoals = useRef<Map<string, string>>(new Map())
  const datesRef = useRef(dates)
  datesRef.current = dates
  const [dirty, setDirty] = useState(false)

  // Fetch all daily goals in range
  const { data: goals } = useQuery({
    queryKey: ['daily-goals', rangeFrom, rangeTo],
    queryFn: () => fetchDailyGoals(rangeFrom, rangeTo),
  })

  // Build goalMap from server data and assemble into editor markdown
  useEffect(() => {
    if (!goals) return
    const goalMap = new Map<string, string>()
    for (const g of goals) {
      if (g.content) goalMap.set(g.date, g.content)
    }
    lastServerGoals.current = goalMap
    const md = assembleMarkdown(dates, goalMap)
    setLocalMarkdown(md)
    localMarkdownRef.current = md
    setDirty(false)
  }, [goals, dates])

  // Save changed days
  const saveMutation = useMutation({
    mutationFn: async (markdown: string) => {
      const newMap = disassembleMarkdown(markdown, datesRef.current)
      const promises: Promise<DailyGoal>[] = []
      for (const date of datesRef.current) {
        const newContent = newMap.get(date) || ''
        const oldContent = lastServerGoals.current.get(date) || ''
        if (newContent !== oldContent) {
          promises.push(upsertDailyGoal(date, newContent))
        }
      }
      await Promise.all(promises)
    },
    onSuccess: () => {
      setDirty(false)
      queryClient.invalidateQueries({ queryKey: ['daily-goals'] })
    },
  })

  const save = useCallback(() => {
    saveMutation.mutate(localMarkdownRef.current)
  }, [saveMutation])

  const handleContentChange = useCallback(
    (markdown: string) => {
      setLocalMarkdown(markdown)
      localMarkdownRef.current = markdown
      setDirty(true)
    },
    []
  )

  const handleToggle = useCallback(
    (lineIndex: number) => {
      const newMarkdown = toggleCheckboxLine(localMarkdown, lineIndex)
      setLocalMarkdown(newMarkdown)
      localMarkdownRef.current = newMarkdown
      saveMutation.mutate(newMarkdown)
    },
    [localMarkdown, saveMutation]
  )

  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null)

  // Clear focusRequest after it's been consumed
  useEffect(() => {
    if (focusRequest != null) {
      const id = requestAnimationFrame(() => setFocusRequest(null))
      return () => cancelAnimationFrame(id)
    }
  }, [focusRequest])

  const updateMarkdown = useCallback((newMd: string) => {
    setLocalMarkdown(newMd)
    localMarkdownRef.current = newMd
  }, [])

  const editHandlers = useMemo((): BlockEditHandlers => ({
    onEdit: (lineIndex, newText) => {
      const newMd = editLineText(localMarkdownRef.current, lineIndex, newText)
      updateMarkdown(newMd)
      saveMutation.mutate(newMd)
    },
    onSplitLine: (lineIndex, textBefore, textAfter) => {
      const result = splitLineAt(localMarkdownRef.current, lineIndex, textBefore, textAfter)
      updateMarkdown(result.content)
      setFocusRequest({ lineIndex: result.newLineIndex })
    },
    onDeleteLine: (lineIndex) => {
      // Find previous block to focus
      const pd = parseAssembled(localMarkdownRef.current, datesRef.current)
      const allBlocks = pd.flatMap(d => d.blocks)
      const prevBlock = allBlocks.filter(b => b.lineIndex < lineIndex).pop()
      const newMd = deleteLine(localMarkdownRef.current, lineIndex)
      updateMarkdown(newMd)
      saveMutation.mutate(newMd)
      if (prevBlock) {
        setFocusRequest({ lineIndex: prevBlock.lineIndex, caretOffset: prevBlock.text.length })
      }
    },
    onIndent: (lineIndex) => {
      const newMd = indentLine(localMarkdownRef.current, lineIndex)
      updateMarkdown(newMd)
      setFocusRequest({ lineIndex })
    },
    onUnindent: (lineIndex) => {
      const newMd = unindentLine(localMarkdownRef.current, lineIndex)
      updateMarkdown(newMd)
      setFocusRequest({ lineIndex })
    },
    onMergeUp: (lineIndex) => {
      const result = mergeLineUp(localMarkdownRef.current, lineIndex)
      if (!result) return
      updateMarkdown(result.content)
      saveMutation.mutate(result.content)
      setFocusRequest({ lineIndex: result.targetLineIndex, caretOffset: result.caretOffset })
    },
    onNavigate: (fromLineIndex, direction, caretOffset) => {
      const pd = parseAssembled(localMarkdownRef.current, datesRef.current)
      const allLineIndexes = pd.flatMap(d => d.blocks.map(b => b.lineIndex))
      const currentIdx = allLineIndexes.indexOf(fromLineIndex)
      if (currentIdx < 0) return
      const targetIdx = direction === 'up' ? currentIdx - 1 : currentIdx + 1
      if (targetIdx < 0 || targetIdx >= allLineIndexes.length) return
      // Preserve caret offset, clamped to target block's text length
      const targetBlock = pd.flatMap(d => d.blocks).find(b => b.lineIndex === allLineIndexes[targetIdx])
      const clampedOffset = targetBlock ? Math.min(caretOffset, targetBlock.text.length) : caretOffset
      setFocusRequest({ lineIndex: allLineIndexes[targetIdx], caretOffset: clampedOffset })
    },
    onPasteMultiLine: (lineIndex, textBefore, textAfter, lines) => {
      const result = pasteMultiLine(localMarkdownRef.current, lineIndex, textBefore, textAfter, lines)
      updateMarkdown(result.content)
      saveMutation.mutate(result.content)
      setFocusRequest({ lineIndex: result.focusLineIndex, caretOffset: result.caretOffset })
    },
  }), [updateMarkdown, saveMutation])

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
      const md = localMarkdownRef.current
      const currentDates = datesRef.current
      const newMap = disassembleMarkdown(md, currentDates)
      const promises: Promise<DailyGoal>[] = []
      for (const date of currentDates) {
        const newContent = newMap.get(date) || ''
        const oldContent = lastServerGoals.current.get(date) || ''
        if (newContent !== oldContent) {
          promises.push(upsertDailyGoal(date, newContent))
        }
      }
      if (promises.length > 0) Promise.all(promises)
    }
  }, [])

  // Navigation
  const shiftAnchor = useCallback((days: number) => setAnchor((a) => addDays(a, days)), [])
  const goToToday = useCallback(() => setAnchor(todayStr), [todayStr])

  // Parsed view
  const parsedDays = useMemo(() => parseAssembled(localMarkdown, dates), [localMarkdown, dates])

  const handleInsertTemplate = useCallback(() => {
    const template = assembleMarkdown(dates, new Map())
    handleContentChange(template)
  }, [dates, handleContentChange])

  const isAnchorToday = anchor === todayStr

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Goals</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {formatDateFull(rangeFrom)} &ndash; {formatDateFull(rangeTo)}
            <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">
              ({dates.length} days)
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Navigation: text buttons */}
          <div className="flex items-center gap-1">
            <button onClick={() => shiftAnchor(-7)} className="px-2 py-1 rounded-md text-xs font-medium hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors">
              -1w
            </button>
            <button onClick={() => shiftAnchor(-1)} className="px-2 py-1 rounded-md text-xs font-medium hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors">
              -1d
            </button>
            <button
              onClick={goToToday}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                isAnchorToday
                  ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
                  : 'hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              <Calendar size={12} />
              Today
            </button>
            <button onClick={() => shiftAnchor(1)} className="px-2 py-1 rounded-md text-xs font-medium hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors">
              +1d
            </button>
            <button onClick={() => shiftAnchor(7)} className="px-2 py-1 rounded-md text-xs font-medium hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors">
              +1w
            </button>
          </div>

          <div className="w-px h-5 bg-slate-300 dark:bg-slate-700" />

          {/* Range: days before / after */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <span className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500 mr-0.5">Before</span>
              <button
                onClick={() => setDaysBefore((v) => Math.max(0, v - 1))}
                className="w-5 h-5 rounded flex items-center justify-center text-xs font-bold text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >−</button>
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 tabular-nums w-4 text-center">{daysBefore}</span>
              <button
                onClick={() => setDaysBefore((v) => v + 1)}
                className="w-5 h-5 rounded flex items-center justify-center text-xs font-bold text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >+</button>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500 mr-0.5">After</span>
              <button
                onClick={() => setDaysAfter((v) => Math.max(0, v - 1))}
                className="w-5 h-5 rounded flex items-center justify-center text-xs font-bold text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >−</button>
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 tabular-nums w-4 text-center">{daysAfter}</span>
              <button
                onClick={() => setDaysAfter((v) => v + 1)}
                className="w-5 h-5 rounded flex items-center justify-center text-xs font-bold text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >+</button>
            </div>
          </div>

          {/* Save status */}
          <div className="min-w-[70px] text-right">
            {saveMutation.isPending && <span className="text-xs text-slate-400">Saving...</span>}
            {!saveMutation.isPending && dirty && <span className="text-xs text-amber-500">Unsaved</span>}
            {!saveMutation.isPending && !dirty && saveMutation.isSuccess && <span className="text-xs text-green-500">Saved</span>}
          </div>
        </div>
      </div>

      {/* Side-by-side: Editor + Viewer */}
      <div className="flex gap-5 items-start">
        {/* Left: Markdown Editor */}
        <div className="w-1/2 flex-shrink-0 sticky top-6">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col max-h-[calc(100vh-140px)]" data-color-mode={theme} onKeyDownCapture={editorKeyDown}>
            <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Editor</span>
              {!localMarkdown.trim() && (
                <button onClick={handleInsertTemplate} className="text-xs text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium">
                  Insert template
                </button>
              )}
            </div>
            <MDEditor
              value={localMarkdown}
              onChange={(val) => handleContentChange(val ?? '')}
              preview="edit"
              visibleDragbar={false}
              height={500}
            />
          </div>
        </div>

        {/* Right: Rendered View */}
        <div className="w-1/2 min-w-0 space-y-3">
          {parsedDays.map((day, idx) => {
            const isAnchor = day.date === anchor
            const isPast = day.date < anchor
            const hasContent = day.blocks.length > 0
            const todos = day.blocks.filter((b): b is ContentBlock & { type: 'todo' } => b.type === 'todo')
            const doneCount = todos.filter((t) => t.done).length
            const totalCount = todos.length

            return (
              <div
                key={day.date}
                className={`rounded-xl border-2 shadow-sm transition-all ${
                  isAnchor
                    ? 'border-indigo-400 dark:border-indigo-500 ring-2 ring-indigo-200 dark:ring-indigo-800'
                    : CARD_COLORS[idx % CARD_COLORS.length]
                } ${!isAnchor ? 'opacity-50' : ''}`}
              >
                {/* Day Header */}
                <div
                  className={`px-4 py-2.5 rounded-t-[10px] flex items-center justify-between ${
                    isAnchor
                      ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'
                      : HEADER_COLORS[idx % HEADER_COLORS.length]
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">{day.dayName}</span>
                    <span className="text-xs opacity-70">{formatDate(day.date)}</span>
                    {isAnchor && (
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-500 text-white px-1.5 py-0.5 rounded">Anchor</span>
                    )}
                  </div>
                  {totalCount > 0 && (
                    <span className={`text-xs font-medium ${doneCount === totalCount ? 'text-green-600 dark:text-green-400' : 'opacity-60'}`}>
                      {doneCount}/{totalCount}
                    </span>
                  )}
                </div>

                {/* Day Content */}
                <div className="px-4 py-3 bg-white dark:bg-slate-900 rounded-b-[10px] min-h-[40px]">
                  {!hasContent ? (
                    <p className="text-xs text-slate-400 dark:text-slate-600 italic">No goals</p>
                  ) : (
                    <ContentBlockList blocks={day.blocks} onToggle={handleToggle} editHandlers={editHandlers} focusRequest={focusRequest} />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

