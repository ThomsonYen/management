import type { Todo } from '../types'

const statusDot = (s: string) => {
  const map: Record<string, string> = {
    todo: 'bg-slate-400',
    done: 'bg-green-500',
  }
  return map[s] || 'bg-slate-400'
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
          className="flex-1 flex items-center gap-2 text-left px-3 py-2 rounded-lg border border-slate-100 dark:border-slate-700 hover:border-indigo-300 hover:bg-indigo-50 dark:hover:border-indigo-700 dark:hover:bg-indigo-900/30 transition-colors"
        >
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot(todo.status)}`} />
          <span className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{todo.title}</span>
          {todo.assignee_name && (
            <span className="text-xs text-slate-400 dark:text-slate-500 flex-shrink-0">{todo.assignee_name}</span>
          )}
          <span className="text-xs text-slate-500 dark:text-slate-400 flex-shrink-0 font-medium">{todo.estimated_hours}h</span>
          {todo.status === 'done' && (
            <span className="text-xs px-2 py-0.5 rounded-full capitalize flex-shrink-0 bg-green-100 text-green-700">
              {todo.status}
            </span>
          )}
          <span className="text-xs text-slate-400 dark:text-slate-500 flex-shrink-0">→</span>
        </button>
        {onRemove && (
          <button
            onClick={onRemove}
            className="flex-shrink-0 text-slate-300 dark:text-slate-600 hover:text-red-500 transition-colors text-lg leading-none px-1"
          >×</button>
        )}
      </div>
      {childBlockers.length > 0 && (
        <ul className="ml-5 mt-1 space-y-1 border-l-2 border-slate-100 dark:border-slate-700 pl-3">
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
          className="flex-1 flex items-center gap-2 text-left px-3 py-2 rounded-lg border border-slate-100 dark:border-slate-700 hover:border-amber-300 hover:bg-amber-50 dark:hover:border-amber-700 dark:hover:bg-amber-900/30 transition-colors"
        >
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot(todo.status)}`} />
          <span className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{todo.title}</span>
          {todo.assignee_name && (
            <span className="text-xs text-slate-400 dark:text-slate-500 flex-shrink-0">{todo.assignee_name}</span>
          )}
          <span className="text-xs text-slate-500 dark:text-slate-400 flex-shrink-0 font-medium">{todo.estimated_hours}h</span>
          {todo.status === 'done' && (
            <span className="text-xs px-2 py-0.5 rounded-full capitalize flex-shrink-0 bg-green-100 text-green-700">
              {todo.status}
            </span>
          )}
          <span className="text-xs text-slate-400 dark:text-slate-500 flex-shrink-0">→</span>
        </button>
        {onRemove && (
          <button
            onClick={onRemove}
            className="flex-shrink-0 text-slate-300 dark:text-slate-600 hover:text-red-500 transition-colors text-lg leading-none px-1"
          >×</button>
        )}
      </div>
      {childBlocked.length > 0 && (
        <div className="ml-5 mt-1">
          <ul className="space-y-1 border-l-2 border-amber-300 dark:border-amber-700 pl-3">
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
