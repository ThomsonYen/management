import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import { updateTodo } from '../../api'
import type { Project, Todo } from '../../types'
import { useTimezone } from '../../SettingsContext'
import { daysSinceDate, formatDayLabel, getTodayString } from '../../dateUtils'
import { importanceBadgeClass } from '../../utils/badgeClasses'
import {
  buildTodoPatch,
  patchTodoCaches,
  restoreTodoCaches,
  snapshotTodoCaches,
  type TodoCachesSnapshot,
} from '../../utils/optimisticTodo'
import DatePicker from '../DatePicker'
import MarkDoneButton from '../MarkDoneButton'
import { Badge, ImportanceBadge } from '../ui'
import SubtodoChecklist from './SubtodoChecklist'

const IMPORTANCE_OPTIONS = ['low', 'medium', 'high', 'critical']

export interface DeadlineInfo {
  label: string
  tone: 'danger' | 'warning' | 'neutral'
}

export function deadlineInfo(deadline: string | null | undefined, status: string, timezone: string): DeadlineInfo | null {
  if (!deadline) return null
  if (status === 'done') return { label: formatDayLabel(deadline, timezone), tone: 'neutral' }
  const today = getTodayString(timezone)
  if (deadline < today) {
    const days = daysSinceDate(deadline, timezone)
    return { label: `${days} day${days === 1 ? '' : 's'} overdue`, tone: 'danger' }
  }
  if (deadline === today) return { label: 'Due today', tone: 'warning' }
  return { label: formatDayLabel(deadline, timezone), tone: 'neutral' }
}

interface Props {
  todo: Todo
  /** false for view-only accounts and for todos seen through a project grant (read-only). */
  editable: boolean
  /** Show the assignee (the "All visible" view mixes people). */
  showAssignee?: boolean
  expanded: boolean
  onToggle: () => void
  /** Projects the member may move their own todo into. */
  projects?: Project[]
}

/**
 * The member shell's todo card. A member has full edit of their own todos
 * (title, description, deadline, importance, hours, project, status,
 * sub-tasks) — never assignee, focus or blockers; the backend enforces the
 * same rules, this just doesn't offer what would be refused.
 */
export default function MemberTodoCard({ todo, editable, showAssignee, expanded, onToggle, projects = [] }: Props) {
  const queryClient = useQueryClient()
  const { timezone } = useTimezone()
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['todos'] })
    queryClient.invalidateQueries({ queryKey: ['todo', todo.id] })
    queryClient.invalidateQueries({ queryKey: ['recently-done'] })
  }

  const updateMutation = useMutation({
    mutationFn: (data: Parameters<typeof updateTodo>[1]) => updateTodo(todo.id, data),
    onMutate: async (data) => {
      const snapshot = await snapshotTodoCaches(queryClient, todo.id)
      patchTodoCaches(queryClient, todo.id, buildTodoPatch(data as Record<string, unknown>, [], projects))
      return snapshot
    },
    onError: (_err, _vars, snapshot?: TodoCachesSnapshot) => restoreTodoCaches(queryClient, todo.id, snapshot),
    onSettled: invalidate,
  })

  const saveField = (field: string, value: unknown) => {
    updateMutation.mutate({ [field]: value } as Parameters<typeof updateTodo>[1])
    setEditingField(null)
  }

  const startEdit = (e: React.MouseEvent, field: string, current: string) => {
    if (!editable) return
    e.stopPropagation()
    setEditingField(field)
    setEditValue(current)
  }

  const deadline = deadlineInfo(todo.deadline, todo.status, timezone)
  const totalSubs = todo.subtodos.length
  const doneSubs = todo.subtodos.filter((s) => s.done).length
  const isDone = todo.status === 'done'
  const deadlineTone =
    deadline?.tone === 'danger' ? 'text-danger font-semibold' : deadline?.tone === 'warning' ? 'text-warning font-semibold' : ''

  return (
    <div
      className={`bg-surface rounded-xl border shadow-sm transition-colors ${
        isDone ? 'border-border opacity-75' : deadline?.tone === 'danger' ? 'border-danger/40' : 'border-border'
      }`}
    >
      <div className="px-4 py-3 cursor-pointer" onClick={onToggle}>
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            {editingField === 'title' ? (
              <input
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => (editValue.trim() ? saveField('title', editValue.trim()) : setEditingField(null))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                  if (e.key === 'Escape') setEditingField(null)
                }}
                onClick={(e) => e.stopPropagation()}
                className="w-full text-sm font-semibold text-fg bg-transparent border border-accent-2 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-accent"
              />
            ) : (
              <p
                onClick={(e) => startEdit(e, 'title', todo.title)}
                title={editable ? 'Click to rename' : undefined}
                className={`text-sm font-semibold ${isDone ? 'line-through text-fg-muted' : 'text-fg'} ${
                  editable ? 'hover:text-accent transition-colors' : ''
                }`}
              >
                {todo.title}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-fg-muted">
              {editable ? (
                <select
                  value={todo.importance}
                  onChange={(e) => saveField('importance', e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className={`text-2xs h-5 rounded-xs border px-1.5 font-medium cursor-pointer focus:outline-none ${importanceBadgeClass(todo.importance)}`}
                  title="Importance"
                >
                  {IMPORTANCE_OPTIONS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              ) : (
                <ImportanceBadge importance={todo.importance} />
              )}
              {todo.is_blocked && <Badge tone="danger" size="sm">blocked</Badge>}

              {editable ? (
                <span onClick={(e) => e.stopPropagation()} className={`flex items-center gap-1 ${deadlineTone}`}>
                  <span>📅</span>
                  <DatePicker
                    value={todo.deadline ?? ''}
                    onChange={(v) => saveField('deadline', v || null)}
                    variant="inline"
                    placeholder="Set deadline"
                  />
                  {deadline && deadline.tone !== 'neutral' && <span>· {deadline.label}</span>}
                </span>
              ) : (
                deadline && <span className={`flex items-center gap-1 ${deadlineTone}`}>📅 {deadline.label}</span>
              )}

              {editingField === 'estimated_hours' ? (
                <input
                  autoFocus
                  type="number"
                  min="0.25"
                  step="0.25"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={() => saveField('estimated_hours', parseFloat(editValue) || 1)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveField('estimated_hours', parseFloat(editValue) || 1)
                    if (e.key === 'Escape') setEditingField(null)
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs border border-accent-2 rounded px-1 py-0.5 w-16 bg-app text-fg focus:outline-none focus:ring-1 focus:ring-accent"
                />
              ) : (
                <span
                  onClick={(e) => startEdit(e, 'estimated_hours', todo.estimated_hours.toString())}
                  title={editable ? 'Click to change estimated hours' : undefined}
                  className={`flex items-center gap-1 ${editable ? 'cursor-pointer hover:text-accent transition-colors' : ''}`}
                >
                  ⏱ {todo.estimated_hours}h
                </span>
              )}

              {todo.project_name && <span>◈ {todo.project_name}</span>}
              {showAssignee && todo.assignee_name && <span>◉ {todo.assignee_name}</span>}
            </div>

            {totalSubs > 0 && (
              <div className="mt-2 h-1.5 bg-inset rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-all"
                  style={{ width: `${(doneSubs / totalSubs) * 100}%` }}
                />
              </div>
            )}
          </div>

          {editable && (
            <div onClick={(e) => e.stopPropagation()} className="flex-shrink-0">
              <MarkDoneButton todo={todo} queryKeys={[['todos'], ['todo', todo.id]]} />
            </div>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border-subtle px-4 py-4 space-y-4" onClick={(e) => e.stopPropagation()}>
          <div>
            <p className="text-xs font-semibold text-fg-muted uppercase tracking-wide mb-1">Description</p>
            {editingField === 'description' ? (
              <div className="flex flex-col md:flex-row gap-3">
                <textarea
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={() => saveField('description', editValue || null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setEditingField(null)
                  }}
                  rows={4}
                  className="flex-1 min-w-0 text-sm text-fg bg-transparent border border-accent-2 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent resize-y font-mono"
                />
                {editValue && (
                  <div className="flex-1 min-w-0 overflow-y-auto max-h-[200px] px-2 py-1.5 border border-border rounded-lg">
                    <div className="prose prose-sm dark:prose-invert max-w-none text-fg">
                      <ReactMarkdown>{editValue}</ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div
                onClick={(e) => startEdit(e, 'description', todo.description || '')}
                title={editable ? 'Click to edit description' : undefined}
                className={`min-h-[1.25rem] ${editable ? 'cursor-pointer hover:text-accent transition-colors' : ''}`}
              >
                {todo.description ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none text-fg">
                    <ReactMarkdown>{todo.description}</ReactMarkdown>
                  </div>
                ) : (
                  <em className="text-sm text-fg-faint dark:text-fg-muted not-italic">
                    {editable ? '+ Add a description…' : 'No description'}
                  </em>
                )}
              </div>
            )}
          </div>

          {editable && projects.length > 0 && (
            <div className="flex items-center gap-3">
              <p className="text-xs font-semibold text-fg-muted uppercase tracking-wide">Project</p>
              <select
                value={todo.project_id ?? ''}
                onChange={(e) => saveField('project_id', e.target.value ? Number(e.target.value) : null)}
                className="text-xs border border-border rounded-md px-2 py-1 bg-app text-fg focus:outline-none focus:ring-2 focus:ring-accent/40"
              >
                <option value="">No project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          <SubtodoChecklist todo={todo} editable={editable} />
        </div>
      )}
    </div>
  )
}
