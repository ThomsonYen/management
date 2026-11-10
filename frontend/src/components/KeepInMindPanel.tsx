import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowUpRight, Calendar, CheckCircle2, ChevronDown, ChevronUp, Circle, CornerDownLeft, Crosshair, Lightbulb, ListChecks, Minus, Plus } from 'lucide-react'
import { createSubTodo, createTodo, fetchKeepInMind, updateSubTodo, updateTodo } from '../api'
import type { Todo } from '../types'
import { useTimezone } from '../SettingsContext'
import { getTodayString } from '../dateUtils'
import { relativeDay } from '../hooks/useFollowupActions'
import { useKeepInMindActions } from '../hooks/useKeepInMindActions'
import DatePicker from './DatePicker'
import DescriptionEditor from './DescriptionEditor'
import { importanceBadgeClass } from '../utils/badgeClasses'
import { patchSubtodoCaches, patchTodoCaches } from '../utils/optimisticTodo'

const OPEN_KEY = 'focus.keepInMind.open'
const KEY = ['todos', 'keep-in-mind']

/** Drag payload for a Keep in Mind row (dropped on the Focus list → back on Focus). */
export const KEEP_IN_MIND_DRAG_TYPE = 'application/x-keep-in-mind-id'

function readOpen(): boolean {
  try { return localStorage.getItem(OPEN_KEY) !== '0' } catch { return true }
}

function fmtHours(h: number): string {
  return `${Number.isInteger(h) ? h : h.toFixed(1)}h`
}

function Row({ t, today, open, onToggle, onOpenTodo }: {
  t: Todo; today: string; open: boolean; onToggle: () => void; onOpenTodo: (id: number) => void
}) {
  const { fromKeepInMind, complete, setHours } = useKeepInMindActions()
  const queryClient = useQueryClient()
  const [newSub, setNewSub] = useState('')
  const [editing, setEditing] = useState(false)
  const [titleDraft, setTitleDraft] = useState(t.title)
  const [editingHours, setEditingHours] = useState(false)
  const [hoursDraft, setHoursDraft] = useState('')
  const subs = [...t.subtodos].sort((a, b) => a.order - b.order)
  const subsDone = subs.filter((x) => x.done).length
  const overdue = !!t.deadline && t.deadline < today

  const resync = () => {
    queryClient.invalidateQueries({ queryKey: ['todos'] })
    queryClient.invalidateQueries({ queryKey: ['todo', t.id] })
  }
  const toggleSub = (id: number, done: boolean) => {
    patchSubtodoCaches(queryClient, t.id, (list) => list.map((x) => (x.id === id ? { ...x, done } : x)))
    updateSubTodo(id, { done }).catch(() => {}).then(resync)
  }
  const addSub = () => {
    const title = newSub.trim()
    if (!title) return
    setNewSub('')
    patchSubtodoCaches(queryClient, t.id, (list) => [...list, { id: -Date.now(), title, done: false, order: list.length }])
    createSubTodo(t.id, { title, order: subs.length }).catch(() => {}).then(resync)
  }
  const saveDescription = (description: string | null) => {
    patchTodoCaches(queryClient, t.id, { description: description ?? undefined })
    updateTodo(t.id, { description } as Parameters<typeof updateTodo>[1]).catch(() => {}).then(resync)
  }
  const saveTitle = () => {
    setEditing(false)
    const title = titleDraft.trim()
    if (!title || title === t.title) return
    patchTodoCaches(queryClient, t.id, { title })
    updateTodo(t.id, { title }).catch(() => {}).then(resync)
  }
  const saveHours = () => {
    setEditingHours(false)
    const h = Math.round(parseFloat(hoursDraft) * 4) / 4
    if (!Number.isFinite(h) || h <= 0 || h === t.estimated_hours) return
    setHours(t, h)
  }
  const saveDeadline = (deadline: string) => {
    patchTodoCaches(queryClient, t.id, { deadline: deadline || undefined })
    updateTodo(t.id, { deadline: deadline || null } as Parameters<typeof updateTodo>[1]).catch(() => {}).then(resync)
  }
  const step = (d: number) => setHours(t, Math.max(0.5, Math.round((t.estimated_hours + d) * 2) / 2))

  return (
    <li
      draggable={!open && !editing && !editingHours}
      onDragStart={(e) => {
        e.dataTransfer.setData(KEEP_IN_MIND_DRAG_TYPE, String(t.id))
        e.dataTransfer.setData('application/x-todo-id', String(t.id))
        e.dataTransfer.effectAllowed = 'link'
      }}
      className={`group rounded-lg transition-colors ${open ? 'bg-inset' : 'hover:bg-inset/70'}`}
    >
      {/* One line: done circle, title, then small chips and the hours */}
      <div className="flex items-center gap-2.5 px-3 py-1.5">
        <button
          onClick={() => complete(t)}
          title="Done"
          aria-label={`Complete "${t.title}"`}
          className="shrink-0 text-info/70 hover:text-success transition-colors"
        >
          <Circle size={16} className="group-hover:hidden" />
          <CheckCircle2 size={16} className="hidden group-hover:block" />
        </button>
        {(t.importance === 'high' || t.importance === 'critical') && (
          <span
            title={`${t.importance} importance`}
            className={`shrink-0 text-[10px] font-bold uppercase tracking-wide px-1.5 rounded border ${importanceBadgeClass(t.importance)}`}
          >
            {t.importance === 'critical' ? 'crit' : 'high'}
          </span>
        )}
        {/* The title is the edit target: click to rename in place */}
        {editing ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onFocus={(e) => e.target.select()}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') { setTitleDraft(t.title); setEditing(false) }
            }}
            className="flex-1 min-w-0 -my-0.5 px-1.5 py-0.5 -mx-1.5 rounded bg-surface border border-accent text-sm font-medium text-fg outline-none"
          />
        ) : (
          <span
            role="button"
            tabIndex={0}
            onClick={() => { setTitleDraft(t.title); setEditing(true) }}
            onKeyDown={(e) => { if (e.key === 'Enter') { setTitleDraft(t.title); setEditing(true) } }}
            title={t.project_name ? `Click to rename · ${t.project_name}` : 'Click to rename'}
            className="flex-1 min-w-0 truncate -mx-1.5 px-1.5 py-0.5 rounded text-sm font-medium text-fg cursor-text hover:bg-surface hover:ring-1 hover:ring-border"
          >
            {t.title}
          </span>
        )}
        {subs.length > 0 && (
          <button
            onClick={onToggle}
            title={`${subsDone} of ${subs.length} sub-tasks done`}
            className={`shrink-0 inline-flex items-center gap-1 text-xs tabular-nums ${subsDone === subs.length ? 'text-success' : 'text-fg-subtle'}`}
          >
            <ListChecks size={12} />{subsDone}/{subs.length}
          </button>
        )}
        {/* Deadline: click to pick or clear; with none, a faint calendar shows on hover */}
        <span
          className={`shrink-0 inline-flex items-center gap-1 text-xs tabular-nums whitespace-nowrap rounded px-1 -mx-0.5 hover:bg-surface hover:ring-1 hover:ring-border ${
            overdue ? 'text-danger font-semibold' : 'text-fg-subtle'
          } ${t.deadline ? '' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity'}`}
        >
          <Calendar size={12} />
          <DatePicker
            value={t.deadline || ''}
            onChange={saveDeadline}
            placeholder="date"
            displayValue={t.deadline ? relativeDay(t.deadline, today) : undefined}
            triggerClassName={`!text-xs !p-0 ${overdue ? '!text-danger !font-semibold' : '!text-fg-subtle !font-normal'}`}
          />
        </span>
        {/* Hours: click to type a new estimate */}
        {editingHours ? (
          <input
            autoFocus
            type="number"
            min={0.25}
            step={0.5}
            value={hoursDraft}
            onChange={(e) => setHoursDraft(e.target.value)}
            onFocus={(e) => e.target.select()}
            onBlur={saveHours}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') setEditingHours(false)
            }}
            aria-label="Estimated hours"
            className="shrink-0 w-12 px-1 py-0.5 rounded bg-surface border border-accent text-xs text-right font-medium text-fg tabular-nums outline-none"
          />
        ) : (
          <button
            onClick={() => { setHoursDraft(String(t.estimated_hours)); setEditingHours(true) }}
            title={`Estimated ${fmtHours(t.estimated_hours)} · click to change`}
            className="shrink-0 w-10 text-right px-1 py-0.5 rounded text-xs font-medium text-fg-subtle tabular-nums hover:bg-surface hover:ring-1 hover:ring-border hover:text-fg cursor-text"
          >
            {fmtHours(t.estimated_hours)}
          </button>
        )}
        <button
          onClick={onToggle}
          aria-expanded={open}
          aria-label={open ? 'Collapse' : 'Details'}
          title={open ? 'Collapse' : 'Details: notes, sub-tasks, actions'}
          className="shrink-0 p-0.5 rounded"
        >
          {open
            ? <ChevronUp size={14} className="text-fg-faint" />
            : <ChevronDown size={14} className="text-fg-faint group-hover:text-fg-muted" />}
        </button>
      </div>

      {open && (
        <div className="px-3 pb-2.5 pl-[2.6rem] flex flex-col gap-2.5">
          <div className="flex items-center gap-2 text-xs text-fg-subtle">
            <span>Estimate</span>
            <span className="inline-flex items-center rounded-md border border-border bg-surface">
              <button onClick={() => step(-0.5)} aria-label="Half an hour less" className="p-1 text-fg-muted hover:text-fg"><Minus size={12} /></button>
              <span className="w-10 text-center font-semibold text-fg tabular-nums">{fmtHours(t.estimated_hours)}</span>
              <button onClick={() => step(0.5)} aria-label="Half an hour more" className="p-1 text-fg-muted hover:text-fg"><Plus size={12} /></button>
            </span>
          </div>

          <div className="text-sm">
            <DescriptionEditor value={t.description} onSave={saveDescription} placeholder="Why keep this in mind?" />
          </div>

          <div>
            {subs.map((x) => (
              <label key={x.id} className="flex items-start gap-2 py-0.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={x.done}
                  onChange={(e) => toggleSub(x.id, e.target.checked)}
                  className="mt-[3px] w-3.5 h-3.5 accent-accent cursor-pointer shrink-0"
                />
                <span className={`text-sm leading-5 ${x.done ? 'line-through text-fg-subtle' : 'text-fg'}`}>{x.title}</span>
              </label>
            ))}
            <input
              type="text"
              value={newSub}
              onChange={(e) => setNewSub(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addSub() }}
              placeholder="+ sub-task"
              className="mt-0.5 w-full text-xs bg-transparent placeholder:text-fg-faint text-fg outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5 pt-2 border-t border-border-subtle">
            <button
              onClick={() => fromKeepInMind([t], true)}
              title="Work on it now: make it a todo again on Focus"
              className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-xs font-semibold text-accent-hover bg-accent-1 hover:bg-accent-2 transition-colors"
            >
              <Crosshair size={12} />Focus
            </button>
            <button
              onClick={() => fromKeepInMind([t], false)}
              title="Back to your todo list, without focusing it"
              className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-xs font-medium text-fg-muted hover:text-fg hover:bg-surface transition-colors"
            >
              <CornerDownLeft size={12} />To todos
            </button>
            <button
              onClick={() => complete(t)}
              title="Mark it done"
              className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-xs font-medium text-success/75 hover:text-success hover:bg-success-bg transition-colors"
            >
              <CheckCircle2 size={12} />Done
            </button>
            <button
              onClick={() => onOpenTodo(t.id)}
              title="Open"
              aria-label="Open"
              className="ml-auto p-1 rounded text-fg-subtle hover:text-accent transition-colors"
            >
              <ArrowUpRight size={14} />
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

/**
 * Focus page panel: todos to keep in mind — standing items that stay in view
 * without being on the Focus list. Each is a real todo (hours, sub-tasks,
 * done), so it can be completed here or sent back to Focus. Accepts todo
 * cards dropped from the Focus list or Waiting on.
 */
export default function KeepInMindPanel({ onOpenTodo, newTodoPayload, className = '' }: {
  onOpenTodo: (id: number) => void
  /** Settings → Todo defaults for a quick-added item */
  newTodoPayload: (title: string) => Parameters<typeof createTodo>[0]
  className?: string
}) {
  const { timezone } = useTimezone()
  const today = getTodayString(timezone)
  const { toKeepInMind } = useKeepInMindActions()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(readOpen)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [dropActive, setDropActive] = useState(false)
  const [draft, setDraft] = useState('')
  const addRef = useRef<HTMLInputElement>(null)

  const { data = [] } = useQuery<Todo[]>({ queryKey: KEY, queryFn: fetchKeepInMind })
  const list = data.filter((t) => t.is_keep_in_mind && t.status !== 'done')
  const totalHours = list.reduce((n, t) => n + (t.estimated_hours || 0), 0)

  const toggleOpen = () => {
    setOpen((o) => {
      try { localStorage.setItem(OPEN_KEY, o ? '0' : '1') } catch { /* private mode */ }
      return !o
    })
  }
  const toggleRow = (id: number) => setExpanded((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const add = () => {
    const title = draft.trim()
    if (!title) return
    setDraft('')
    const payload = newTodoPayload(title)
    const temp: Todo = {
      id: -Date.now(), title, importance: payload.importance ?? 'medium', estimated_hours: payload.estimated_hours ?? 1,
      status: 'todo', is_blocked: false, is_focused: false, focus_order: 0, created_at: new Date().toISOString(),
      subtodos: [], blocked_by_ids: [], is_keep_in_mind: true, keep_in_mind_since: new Date().toISOString(),
    }
    queryClient.setQueryData<Todo[]>(KEY, (old) => [...(old ?? []), temp])
    createTodo({ ...payload, keep_in_mind: true })
      .catch(() => {})
      .then(() => queryClient.invalidateQueries({ queryKey: ['todos'] }))
  }

  return (
    <section
      aria-label="Keep in mind"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('application/x-todo-id') || e.dataTransfer.types.includes(KEEP_IN_MIND_DRAG_TYPE)) return
        e.preventDefault()
        setDropActive(true)
      }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropActive(false) }}
      onDrop={(e) => {
        setDropActive(false)
        if (e.dataTransfer.types.includes(KEEP_IN_MIND_DRAG_TYPE)) return
        const id = parseInt(e.dataTransfer.getData('application/x-todo-id'))
        if (!id) return
        e.preventDefault()
        e.stopPropagation()
        const todo = queryClient.getQueriesData<Todo[]>({ queryKey: ['todos'] })
          .flatMap(([, d]) => d ?? [])
          .find((t) => t.id === id)
        if (todo && !todo.is_keep_in_mind) toKeepInMind([todo])
      }}
      className={`relative flex flex-col min-h-0 rounded-xl border bg-surface shadow-sm overflow-hidden transition-shadow ${
        dropActive ? 'border-info ring-2 ring-info/30' : 'border-border'
      } ${className}`}
    >
      <button
        onClick={toggleOpen}
        aria-expanded={open}
        className="shrink-0 w-full flex items-center gap-2 pl-5 pr-4 py-3 text-left bg-info-bg/60 border-b border-border-subtle"
      >
        <Lightbulb size={16} className="text-info shrink-0" />
        <h3 className="text-sm font-bold text-fg uppercase tracking-wide">Keep in mind</h3>
        <span className="flex-1" />
        {totalHours > 0 && <span className="text-xs text-fg-muted tabular-nums whitespace-nowrap">{fmtHours(totalHours)}</span>}
        <span className="text-xs text-fg-muted tabular-nums whitespace-nowrap">{list.length} open</span>
        {open ? <ChevronUp size={15} className="text-fg-faint" /> : <ChevronDown size={15} className="text-fg-faint" />}
      </button>

      {open && (
        // Clicking any empty part of the block starts writing a new item
        <div
          className="min-h-0 overflow-y-auto px-2 pt-1.5 pb-2 cursor-text"
          onClick={(e) => { if (e.target === e.currentTarget) addRef.current?.focus() }}
        >
          {list.length > 0 && (
            <ul className="flex flex-col gap-0.5">
              {list.map((t) => (
                <Row key={t.id} t={t} today={today} open={expanded.has(t.id)} onToggle={() => toggleRow(t.id)} onOpenTodo={onOpenTodo} />
              ))}
            </ul>
          )}
          {/* Sits as the next row: type and press Enter, repeat */}
          <label className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg cursor-text hover:bg-inset/70 focus-within:bg-inset">
            <Plus size={16} className="shrink-0 text-info/70" />
            <input
              ref={addRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') add()
                if (e.key === 'Escape') { setDraft(''); e.currentTarget.blur() }
              }}
              placeholder={list.length === 0 ? 'Nothing yet — write something to keep in mind, or drag a todo here' : 'Add something to keep in mind…'}
              className="flex-1 min-w-0 bg-transparent text-sm text-fg placeholder:text-fg-subtle outline-none"
            />
            {draft.trim() && <span className="shrink-0 text-[11px] text-fg-faint">Enter ↵</span>}
          </label>
        </div>
      )}

      {dropActive && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-info-bg/85 text-info text-sm font-semibold">
          <span className="inline-flex items-center gap-2"><Lightbulb size={15} />Drop to keep in mind</span>
        </div>
      )}
    </section>
  )
}
