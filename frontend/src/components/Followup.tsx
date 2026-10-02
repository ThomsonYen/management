import { AlarmClock, ArrowUpRight, Check, Hand, Hourglass, ListTodo, Send } from 'lucide-react'
import type { Todo } from '../types'
import { useTimezone } from '../SettingsContext'
import { getTodayString } from '../dateUtils'
import { chaseLabel, useFollowupActions } from '../hooks/useFollowupActions'
import DatePicker from './DatePicker'

/** "waiting 6d · chase Fri" — amber once it is time to chase. */
export function FollowupChip({ todo, className = '' }: { todo: Todo; className?: string }) {
  const { timezone } = useTimezone()
  const chase = chaseLabel(todo, getTodayString(timezone))
  const due = !!chase?.due && todo.status !== 'done'
  return (
    <span className={`inline-flex items-center gap-1 text-xs whitespace-nowrap ${due ? 'text-warning font-semibold' : 'text-fg-subtle font-medium'} ${className}`}>
      {due && <AlarmClock size={12} className="shrink-0" />}
      waiting {todo.waiting_days ?? 0}d{chase ? ` · ${chase.text}` : ''}
    </span>
  )
}

/**
 * The things you can do with a follow-up once it is open: the reply came
 * (back to a todo, onto Focus), it is resolved, or you chased it and want to
 * check again later. Resolving lives only here, never on the collapsed row.
 */
export function FollowupActions({ todo, onOpen, compact = false }: { todo: Todo; onOpen?: () => void; compact?: boolean }) {
  const { toTodo, resolve, checkBack } = useFollowupActions()
  const chip = 'h-7 px-2 rounded-md text-xs font-medium border border-border bg-surface text-fg-muted hover:text-wait hover:bg-wait-bg hover:border-wait-border transition-colors'
  return (
    <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => toTodo([todo], true)}
        title="Claim it back: the reply came in or the next step is yours — make it a todo again on Focus"
        className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-xs font-semibold text-accent-hover bg-accent-1 hover:bg-accent-2 transition-colors"
      >
        <Hand size={12} />Claim
      </button>
      <button
        onClick={() => resolve(todo)}
        title="Nothing left to do: mark it done"
        className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-xs font-semibold bg-success-bg text-success border border-success/25 hover:border-success/60 transition-colors"
      >
        <Check size={13} />Resolved
      </button>
      <span className={`inline-flex items-center gap-1 ${compact ? '' : 'pl-2 border-l border-border-subtle'}`}>
        <span className="inline-flex items-center gap-1 text-xs text-wait/75 mr-0.5"><Send size={12} />Chase, check back</span>
        <button className={chip} onClick={() => checkBack(todo, { days: 2 })}>+2d</button>
        <button className={chip} onClick={() => checkBack(todo, { days: 7 })}>+1w</button>
        <span className="inline-flex items-center h-7 px-2 rounded-md border border-border bg-surface text-xs text-fg-muted">
          <DatePicker
            value={todo.check_back_on || ''}
            onChange={(v) => checkBack(todo, { day: v || null })}
            placeholder="date"
          />
        </span>
      </span>
      {onOpen && (
        <button
          onClick={onOpen}
          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-xs font-medium text-accent bg-accent-1 border border-accent-2 hover:bg-accent-2 transition-colors"
        >
          <ArrowUpRight size={13} />Open
        </button>
      )}
    </div>
  )
}

/** Todo | Follow-up switch for the detail view. */
export function KindSwitch({ todo }: { todo: Todo }) {
  const { toFollowup, toTodo } = useFollowupActions()
  const f = !!todo.is_followup
  const base = 'inline-flex items-center gap-1.5 px-3 h-7 rounded-md text-xs font-medium transition-colors'
  return (
    <div role="radiogroup" aria-label="Kind" className="inline-flex p-0.5 gap-0.5 rounded-lg bg-inset border border-border">
      <button
        role="radio"
        aria-checked={!f}
        onClick={() => f && toTodo([todo], false)}
        className={`${base} ${!f ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted hover:text-fg'}`}
      >
        <ListTodo size={13} />Todo
      </button>
      <button
        role="radio"
        aria-checked={f}
        disabled={todo.status === 'done' && !f}
        onClick={() => !f && toFollowup([todo])}
        title="Waiting on someone else; nothing to do until they reply"
        className={`${base} ${f ? 'bg-wait-bg text-wait shadow-sm' : 'text-fg-muted hover:text-wait'} disabled:opacity-40`}
      >
        <Hourglass size={13} />Follow-up
      </button>
    </div>
  )
}
