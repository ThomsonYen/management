import type { Todo } from '../types'

const statusDot = (s: string) => {
 const map: Record<string, string> = {
 todo: 'bg-fg-faint',
 done: 'bg-success',
 }
 return map[s] || 'bg-fg-faint'
}

export function BlockerTreeNode({
 todo,
 allTodos,
 onOpenTodo,
 onRemove,
 depth = 0,
 visited,
}: {
 todo: Todo
 allTodos: Todo[]
 onOpenTodo: (id: number) => void
 onRemove?: () => void
 depth?: number
 visited: Set<number>
}) {
 const childVisited = new Set([...visited, todo.id])
 const childBlockers = allTodos.filter(
 (t) => todo.blocked_by_ids.includes(t.id) && !visited.has(t.id)
 )

 return (
 <li>
 <div
 draggable
 onDragStart={(e) => {
 e.stopPropagation()
 e.dataTransfer.setData('application/x-todo-id', String(todo.id))
 e.dataTransfer.effectAllowed = 'link'
 }}
 className="flex items-center gap-2 cursor-grab active:cursor-grabbing"
 >
 <button
 onClick={() => onOpenTodo(todo.id)}
 className="flex-1 flex items-center gap-2 text-left px-3 py-2 rounded-lg border border-border-subtle hover:border-accent-2 hover:bg-accent-1 dark:hover:border-accent-hover dark:hover:bg-accent-1 transition-colors"
 >
 <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot(todo.status)}`} />
 <span className="flex-1 text-sm font-medium text-fg truncate">{todo.title}</span>
 {todo.assignee_name && (
 <span className="text-xs text-fg-subtle flex-shrink-0">{todo.assignee_name}</span>
 )}
 <span className="text-xs text-fg-muted flex-shrink-0 font-medium">{todo.estimated_hours}h</span>
 {todo.status === 'done' && (
 <span className="text-xs px-2 py-0.5 rounded-full capitalize flex-shrink-0 bg-success-bg text-success">
 {todo.status}
 </span>
 )}
 <span className="text-xs text-fg-subtle flex-shrink-0">→</span>
 </button>
 {onRemove && (
 <button
 onClick={onRemove}
 className="flex-shrink-0 text-fg-faint dark:text-fg-muted hover:text-danger transition-colors text-lg leading-none px-1"
 >×</button>
 )}
 </div>
 {childBlockers.length > 0 && (
 <ul className="ml-5 mt-1 space-y-1 border-l-2 border-border-subtle pl-3">
 {childBlockers.map((child) => (
 <BlockerTreeNode
 key={child.id}
 todo={child}
 allTodos={allTodos}
 onOpenTodo={onOpenTodo}
 depth={depth + 1}
 visited={childVisited}
 />
 ))}
 </ul>
 )}
 </li>
 )
}

export function BlockingTreeNode({
 todo,
 allTodos,
 onOpenTodo,
 onRemove,
 depth = 0,
 visited,
}: {
 todo: Todo
 allTodos: Todo[]
 onOpenTodo: (id: number) => void
 onRemove?: () => void
 depth?: number
 visited: Set<number>
}) {
 const childVisited = new Set([...visited, todo.id])
 // Children are tasks that this todo is blocking
 const childBlocked = allTodos.filter(
 (t) => t.blocked_by_ids.includes(todo.id) && !visited.has(t.id)
 )

 return (
 <li>
 <div
 draggable
 onDragStart={(e) => {
 e.stopPropagation()
 e.dataTransfer.setData('application/x-todo-id', String(todo.id))
 e.dataTransfer.effectAllowed = 'link'
 }}
 className="flex items-center gap-2 cursor-grab active:cursor-grabbing"
 >
 <button
 onClick={() => onOpenTodo(todo.id)}
 className="flex-1 flex items-center gap-2 text-left px-3 py-2 rounded-lg border border-border-subtle hover:border-warning/40 hover:bg-warning-bg dark:hover:border-amber-700 transition-colors"
 >
 <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot(todo.status)}`} />
 <span className="flex-1 text-sm font-medium text-fg truncate">{todo.title}</span>
 {todo.assignee_name && (
 <span className="text-xs text-fg-subtle flex-shrink-0">{todo.assignee_name}</span>
 )}
 <span className="text-xs text-fg-muted flex-shrink-0 font-medium">{todo.estimated_hours}h</span>
 {todo.status === 'done' && (
 <span className="text-xs px-2 py-0.5 rounded-full capitalize flex-shrink-0 bg-success-bg text-success">
 {todo.status}
 </span>
 )}
 <span className="text-xs text-fg-subtle flex-shrink-0">→</span>
 </button>
 {onRemove && (
 <button
 onClick={onRemove}
 className="flex-shrink-0 text-fg-faint dark:text-fg-muted hover:text-danger transition-colors text-lg leading-none px-1"
 >×</button>
 )}
 </div>
 {childBlocked.length > 0 && (
 <div className="ml-5 mt-1">
 <ul className="space-y-1 border-l-2 border-warning/40 pl-3">
 {childBlocked.map((child) => (
 <BlockingTreeNode
 key={child.id}
 todo={child}
 allTodos={allTodos}
 onOpenTodo={onOpenTodo}
 depth={depth + 1}
 visited={childVisited}
 />
 ))}
 </ul>
 </div>
 )}
 </li>
 )
}
