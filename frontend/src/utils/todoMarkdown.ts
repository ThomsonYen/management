import type { Todo } from '../types'

export function todoToMarkdown(todo: Todo, allTodos: Todo[] = []): string {
  const lines: string[] = []

  lines.push(`## ${todo.title}`)

  const meta: string[] = []
  meta.push(`**Status:** ${todo.status}`)
  meta.push(`**Importance:** ${todo.importance}`)
  if (todo.project_name) meta.push(`**Project:** ${todo.project_name}`)
  if (todo.assignee_name) meta.push(`**Assignee:** ${todo.assignee_name}`)
  if (todo.deadline) meta.push(`**Deadline:** ${todo.deadline}`)
  if (todo.estimated_hours) meta.push(`**Est:** ${todo.estimated_hours}h`)
  if (todo.is_focused) meta.push(`**Focused**`)
  lines.push('')
  lines.push(meta.join(' · '))

  if (todo.description && todo.description.trim()) {
    lines.push('')
    lines.push(todo.description.trim())
  }

  if (todo.subtodos.length > 0) {
    lines.push('')
    lines.push('### Subtasks')
    const sorted = [...todo.subtodos].sort((a, b) => a.order - b.order)
    for (const s of sorted) {
      lines.push(`- [${s.done ? 'x' : ' '}] ${s.title}`)
    }
  }

  if (todo.blocked_by_ids.length > 0) {
    lines.push('')
    lines.push('### Blocked by')
    for (const bid of todo.blocked_by_ids) {
      const blocker = allTodos.find((t) => t.id === bid)
      lines.push(`- ${blocker ? blocker.title : `#${bid}`}`)
    }
  }

  return lines.join('\n')
}
