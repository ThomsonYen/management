import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlarmClock, ArrowUpRight, Calendar, CheckCircle2, ChevronDown, ChevronUp, Hand, Hourglass, Link2, ListChecks, Send } from 'lucide-react'
import { createSubTodo, fetchFollowups, fetchTodos, updateSubTodo, updateTodo } from '../api'
import type { Todo } from '../types'
import { useTimezone } from '../SettingsContext'
import { formatDayLabel, getDateString, getTodayString } from '../dateUtils'
import { dayDiff, relativeDay, useFollowupActions } from '../hooks/useFollowupActions'
import DatePicker from './DatePicker'
import DescriptionEditor from './DescriptionEditor'
import { importanceBadgeClass } from '../utils/badgeClasses'
import { patchSubtodoCaches, patchTodoCaches } from '../utils/optimisticTodo'

const OPEN_KEY = 'focus.waitingOn.open'

/** Drag payload for a follow-up row (dropped on the Focus list → back to a todo). */
export const FOLLOWUP_DRAG_TYPE = 'application/x-followup-id'

function readOpen(): boolean {
  try { return localStorage.getItem(OPEN_KEY) !== '0' } catch { return true }
}

function initials(name?: string): string {
  if (!name) return ''
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

/** Right-hand status: how late, when to chase, or how long it has waited. */
function whenText(t: Todo, today: string): { text: string; due: boolean } {
  if (t.check_back_on) {
    const n = dayDiff(today, t.check_back_on)
    if (n < 0) return { text: `${-n}d late`, due: true }
    if (n === 0) return { text: 'Today', due: true }
    const label = relativeDay(t.check_back_on, today)
    return { text: label.charAt(0).toUpperCase() + label.slice(1), due: false }
  }
  return { text: '—', due: false }
}

function Row({ t, today, open, onToggle, onOpenTodo, holdingUp }: {
  t: Todo; today: string; open: boolean; onToggle: () => void; onOpenTodo: (id: number) => void; holdingUp: Todo[]
}) {
  const { toTodo, resolve, checkBack } = useFollowupActions()
  const { timezone } = useTimezone()
  const queryClient = useQueryClient()
  const [newSub, setNewSub] = useState('')
  const due = !!t.check_back_due
  const when = whenText(t, today)
  const subs = [...t.subtodos].sort((a, b) => a.order - b.order)
  const subsDone = subs.filter((x) => x.done).length
  // A deadline that has passed, or lands before you'd even chase, is a reason to chase now
  const deadlineRisk = !!t.deadline && (t.deadline < today || (!!t.check_back_on && t.deadline <= t.check_back_on))

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

  return (
    <li
      draggable={!open}
      onDragStart={(e) => {
        e.dataTransfer.setData(FOLLOWUP_DRAG_TYPE, String(t.id))
        e.dataTransfer.setData('application/x-todo-id', String(t.id))
        e.dataTransfer.effectAllowed = 'link'
      }}
      className={`rounded-lg transition-colors ${open ? 'bg-inset' : 'hover:bg-inset/70'}`}
    >
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-start gap-3 px-3 py-2.5 text-left"
      >
        <span
          title={t.assignee_name ? `Waiting on ${t.assignee_name}` : 'Waiting'}
          className={`mt-0.5 shrink-0 w-7 h-7 rounded-full grid place-items-center text-[11px] font-bold tracking-wide ${
            due ? 'bg-warning-bg text-warning ring-1 ring-warning/30' : 'bg-wait-bg text-wait ring-1 ring-wait-border'
          }`}
        >
          {initials(t.assignee_name) || <Hourglass size={13} />}
        </span>
        <span className="flex-1 min-w-0">
          <span className="flex items-start gap-1.5">
            {(t.importance === 'high' || t.importance === 'critical') && (
              <span
                title={`${t.importance} importance`}
                className={`mt-[3px] shrink-0 text-[10px] font-bold uppercase tracking-wide px-1.5 rounded border ${importanceBadgeClass(t.importance)}`}
              >
                {t.importance === 'critical' ? 'crit' : 'high'}
              </span>
            )}
            <span className="text-sm font-medium text-fg leading-snug line-clamp-2">{t.title}</span>
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-fg-subtle">
            <span className="truncate">{[t.assignee_name, t.project_name, `waiting ${t.waiting_days ?? 0}d`].filter(Boolean).join(' · ')}</span>
            {subs.length > 0 && (
              <span title={`${subsDone} of ${subs.length} sub-tasks done`} className={`inline-flex items-center gap-1 tabular-nums ${subsDone === subs.length ? 'text-success' : ''}`}>
                <ListChecks size={12} />{subsDone}/{subs.length}
              </span>
            )}
            {t.deadline && (
              <span className={`inline-flex items-center gap-1 tabular-nums ${deadlineRisk ? 'text-danger font-semibold' : ''}`}>
                <Calendar size={12} />due {relativeDay(t.deadline, today)}
              </span>
            )}
          </span>
        </span>
        <span
          className={`mt-0.5 shrink-0 inline-flex items-center gap-1 text-xs tabular-nums whitespace-nowrap ${
            due ? 'text-warning font-semibold' : 'text-fg-subtle font-medium'
          }`}
        >
          {due && <AlarmClock size={12} />}
          {when.text}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-2.5 pl-[3.25rem] flex flex-col gap-2.5" onClick={(e) => e.stopPropagation()}>
          {/* Dates, in one quiet line; the chase date is itself the picker */}
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-fg-subtle tabular-nums">
            <span>Check back</span>
            <DatePicker
              value={t.check_back_on || ''}
              onChange={(v) => checkBack(t, { day: v || null })}
              placeholder="set date"
              displayValue={t.check_back_on ? formatDayLabel(t.check_back_on, timezone) : undefined}
              triggerClassName={`!font-medium underline decoration-dotted underline-offset-2 ${due ? '!text-warning' : '!text-fg-muted'}`}
            />
            {t.followup_since && <><span className="text-fg-faint">·</span><span>since {formatDayLabel(getDateString(t.followup_since, timezone), timezone)}</span></>}
          </p>

          <div className="text-sm">
            <DescriptionEditor value={t.description} onSave={saveDescription} placeholder="What did you ask, and where?" />
          </div>

          {/* Sub-tasks stay with it — the other side often finishes some */}
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

          {holdingUp.length > 0 && (
            <p className="text-xs text-fg-subtle">
              <Link2 size={12} className="inline -mt-0.5 mr-1" />Holding up{' '}
              {holdingUp.map((b, k) => (
                <span key={b.id}>
                  {k > 0 && ', '}
                  <button onClick={() => onOpenTodo(b.id)} className="text-fg-muted font-medium hover:text-accent transition-colors">{b.title}</button>
                </span>
              ))}
            </p>
          )}

          {/* One row of actions: the reply is the main one */}
          <div className="flex items-center gap-1.5 pt-2 border-t border-border-subtle">
            <button
              onClick={() => toTodo([t], true)}
              title="Claim it back: the reply came in or the next step is yours — make it a todo again on Focus"
              className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-xs font-semibold text-accent-hover bg-accent-1 hover:bg-accent-2 transition-colors"
            >
              <Hand size={12} />Claim
            </button>
            <button
              onClick={() => checkBack(t, { days: 2 })}
              title="You nudged them: check back in 2 days"
              className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-xs font-medium text-wait/75 hover:text-wait hover:bg-wait-bg transition-colors"
            >
              <Send size={12} />Chase
            </button>
            <button
              onClick={() => resolve(t)}
              title="Nothing left to do: mark it done"
              className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-xs font-medium text-success/75 hover:text-success hover:bg-success-bg transition-colors"
            >
              <CheckCircle2 size={12} />Resolved
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
 * Focus page panel: everything you are waiting on someone else for, split
 * into "to chase" and "waiting". Each row leads with who you are waiting on,
 * flags importance, sub-task progress and the deadline; opening it keeps all
 * the todo's context (notes, sub-tasks, what it is holding up) next to its
 * actions — the only place to resolve it. Accepts
 * todo cards dropped from the Focus list.
 */
export default function WaitingOnPanel({ onOpenTodo, className = '' }: { onOpenTodo: (id: number) => void; className?: string }) {
  const { timezone } = useTimezone()
  const today = getTodayString(timezone)
  const { toFollowup } = useFollowupActions()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(readOpen)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [dropActive, setDropActive] = useState(false)

  const { data: followups = [] } = useQuery<Todo[]>({
    queryKey: ['todos', 'followups'],
    queryFn: fetchFollowups,
  })
  // Shares TodoCard's ['todos'] entry; used to show what each follow-up is holding up
  const { data: allTodos = [] } = useQuery<Todo[]>({ queryKey: ['todos'], queryFn: () => fetchTodos() })
  const holdingUp = (id: number) =>
    allTodos.filter((b) => b.status !== 'done' && !b.deleted_at && b.blocked_by_ids.includes(id))
  const list = followups.filter((t) => t.is_followup && t.status !== 'done')
  const toChase = list.filter((t) => t.check_back_due)
  const waiting = list.filter((t) => !t.check_back_due)

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

  const group = (label: string, items: Todo[], tone: 'warning' | 'muted') => items.length > 0 && (
    <div>
      <div className="px-3 pt-2 pb-1 flex items-center gap-2">
        <span className={`text-[11px] font-semibold uppercase tracking-wider ${tone === 'warning' ? 'text-warning' : 'text-fg-subtle'}`}>
          {label}
        </span>
        <span className="flex-1 h-px bg-border-subtle" />
        <span className="text-[11px] text-fg-subtle tabular-nums">{items.length}</span>
      </div>
      <ul className="flex flex-col gap-0.5">
        {items.map((t) => (
          <Row key={t.id} t={t} today={today} open={expanded.has(t.id)} onToggle={() => toggleRow(t.id)} onOpenTodo={onOpenTodo} holdingUp={holdingUp(t.id)} />
        ))}
      </ul>
    </div>
  )

  return (
    <section
      aria-label="Waiting on"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('application/x-todo-id') || e.dataTransfer.types.includes(FOLLOWUP_DRAG_TYPE)) return
        e.preventDefault()
        setDropActive(true)
      }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropActive(false) }}
      onDrop={(e) => {
        setDropActive(false)
        if (e.dataTransfer.types.includes(FOLLOWUP_DRAG_TYPE)) return
        const id = parseInt(e.dataTransfer.getData('application/x-todo-id'))
        if (!id) return
        e.preventDefault()
        e.stopPropagation()
        const todo = queryClient.getQueriesData<Todo[]>({ queryKey: ['todos'] })
          .flatMap(([, data]) => data ?? [])
          .find((t) => t.id === id)
        if (todo && !todo.is_followup) toFollowup([todo])
      }}
      className={`relative flex flex-col min-h-0 rounded-xl border bg-surface shadow-sm overflow-hidden transition-shadow ${
        dropActive ? 'border-wait ring-2 ring-wait/30' : 'border-border'
      } ${className}`}
    >
      <button
        onClick={toggleOpen}
        aria-expanded={open}
        className="shrink-0 w-full flex items-center gap-2 pl-5 pr-4 py-3 text-left bg-wait-bg/60 border-b border-border-subtle"
      >
        <Hourglass size={16} className="text-wait shrink-0" />
        <h3 className="text-sm font-bold text-fg uppercase tracking-wide">Waiting on</h3>
        <span className="flex-1" />
        {toChase.length > 0 && (
          <span className="bg-warning-bg text-warning text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap">
            {toChase.length} to chase
          </span>
        )}
        <span className="text-xs text-fg-muted tabular-nums whitespace-nowrap">{list.length} open</span>
        {open ? <ChevronUp size={15} className="text-fg-faint" /> : <ChevronDown size={15} className="text-fg-faint" />}
      </button>

      {open && (
        <div className="min-h-0 overflow-y-auto px-2 pb-2">
          {list.length === 0 ? (
            <div className="px-3 py-6 text-center">
              <Hourglass size={18} className="mx-auto text-wait/70" />
              <p className="mt-2 text-sm text-fg-muted">Nothing you're waiting on.</p>
              <p className="mt-0.5 text-xs text-fg-subtle">Press <span className="font-semibold">Wait</span> on a todo when the next step is someone else's.</p>
            </div>
          ) : (
            <>
              {group('To chase', toChase, 'warning')}
              {group('Waiting', waiting, 'muted')}
            </>
          )}
        </div>
      )}

      {dropActive && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-wait-bg/85 text-wait text-sm font-semibold">
          <span className="inline-flex items-center gap-2"><Hourglass size={15} />Drop to wait on a reply</span>
        </div>
      )}
    </section>
  )
}
