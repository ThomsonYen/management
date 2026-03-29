import { useState, useRef, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchTodos, fetchProjects, updateTodo, createTodo, reorderFocus } from '../api'
import type { Todo, Project } from '../types'
import TodoCard from '../components/TodoCard'
import TodoModal from '../components/TodoModal'
import BulkActionBar from '../components/BulkActionBar'

type GroupBy = 'none' | 'project' | 'user' | 'both'

interface TodayItem {
  id: string
  todoId?: number  // linked to an existing todo
  text: string
  done: boolean
}

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

function loadTodayItems(): TodayItem[] {
  const key = `focus_today_${getTodayKey()}`
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveTodayItems(items: TodayItem[]) {
  const key = `focus_today_${getTodayKey()}`
  localStorage.setItem(key, JSON.stringify(items))
}

interface FlatGroup { key: string; label: string; todos: Todo[] }
interface NestedGroup { key: string; label: string; subgroups: FlatGroup[] }

function groupTodosFlat(todos: Todo[], groupBy: 'project' | 'user'): FlatGroup[] {
  const getKey = (t: Todo) => groupBy === 'project' ? (t.project_name || 'No Project') : (t.assignee_name || 'Unassigned')
  const map = new Map<string, Todo[]>()
  for (const t of todos) {
    const key = getKey(t)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(t)
  }
  return [...map.entries()]
    .sort((a, b) => a[1][0].focus_order - b[1][0].focus_order)
    .map(([key, items]) => ({ key, label: key, todos: items }))
}

function groupTodosNested(todos: Todo[]): NestedGroup[] {
  const userMap = new Map<string, Todo[]>()
  for (const t of todos) {
    const key = t.assignee_name || 'Unassigned'
    if (!userMap.has(key)) userMap.set(key, [])
    userMap.get(key)!.push(t)
  }
  return [...userMap.entries()]
    .sort((a, b) => a[1][0].focus_order - b[1][0].focus_order)
    .map(([user, items]) => ({
      key: user,
      label: user,
      subgroups: groupTodosFlat(items, 'project'),
    }))
}

export default function FocusPage({ onOpenTodo }: { onOpenTodo: (id: number) => void }) {
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [groupBy, setGroupBy] = useState<GroupBy>(() => {
    const saved = localStorage.getItem('focusGroupBy')
    return (saved === 'project' || saved === 'user' || saved === 'both') ? saved : 'none'
  })
  const [showModal, setShowModal] = useState(false)
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const dragItemId = useRef<number | null>(null)
  const [dragOverGroupIndex, setDragOverGroupIndex] = useState<number | null>(null)
  const dragGroupKey = useRef<string | null>(null)
  const [dragOverSubgroupIndex, setDragOverSubgroupIndex] = useState<{ parent: string; index: number } | null>(null)
  const dragSubgroupKey = useRef<{ parent: string; key: string } | null>(null)
  const queryClient = useQueryClient()

  // --- Must Do Today ---
  const [todayItems, setTodayItems] = useState<TodayItem[]>(loadTodayItems)
  const [todayInput, setTodayInput] = useState('')
  const [todaySearchOpen, setTodaySearchOpen] = useState(false)
  const [todayDragOver, setTodayDragOver] = useState(false)
  const todayInputRef = useRef<HTMLInputElement>(null)

  // Refresh when day changes (check every 60s)
  useEffect(() => {
    const check = () => {
      const current = loadTodayItems()
      setTodayItems(current)
    }
    const interval = setInterval(() => {
      const stored = localStorage.getItem(`focus_today_${getTodayKey()}`)
      if (!stored) {
        // New day — reset
        setTodayItems([])
        setTodayInput('')
      }
    }, 60_000)
    return () => clearInterval(interval)
  }, [])

  const persistTodayItems = useCallback((items: TodayItem[]) => {
    setTodayItems(items)
    saveTodayItems(items)
  }, [])

  const addTodayText = useCallback((text: string) => {
    if (!text.trim()) return
    const item: TodayItem = { id: crypto.randomUUID(), text: text.trim(), done: false }
    persistTodayItems([...todayItems, item])
  }, [todayItems, persistTodayItems])

  const addTodayTodo = useCallback((todo: Todo) => {
    if (todayItems.some((i) => i.todoId === todo.id)) return
    const item: TodayItem = { id: crypto.randomUUID(), todoId: todo.id, text: todo.title, done: false }
    persistTodayItems([...todayItems, item])
  }, [todayItems, persistTodayItems])

  const toggleTodayDone = useCallback((itemId: string) => {
    const item = todayItems.find((i) => i.id === itemId)
    if (!item) return
    const newDone = !item.done
    persistTodayItems(todayItems.map((i) => i.id === itemId ? { ...i, done: newDone } : i))
    if (item.todoId) {
      updateTodo(item.todoId, { status: newDone ? 'done' : 'todo' }).then(() => {
        queryClient.invalidateQueries({ queryKey: ['todos'] })
      })
    }
  }, [todayItems, persistTodayItems, queryClient])

  const removeTodayItem = useCallback((itemId: string) => {
    persistTodayItems(todayItems.filter((i) => i.id !== itemId))
  }, [todayItems, persistTodayItems])

  const { data: todos = [], isLoading } = useQuery<Todo[]>({
    queryKey: ['todos', { is_focused: true }],
    queryFn: () => fetchTodos({ is_focused: true }),
  })

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: fetchProjects,
  })

  const removeFocus = useMutation({
    mutationFn: (id: number) => updateTodo(id, { is_focused: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] })
    },
  })

  const addFocusedTodo = useMutation({
    mutationFn: async (title: string) => {
      const maxOrder = todos.reduce((max, t) => Math.max(max, t.focus_order), 0)
      const todo = await createTodo({ title, status: 'todo', importance: 'medium', estimated_hours: 1 })
      await updateTodo(todo.id, { is_focused: true, focus_order: maxOrder + 1 })
      return todo
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] })
      setNewTitle('')
    },
  })

  const reorderMutation = useMutation({
    mutationFn: reorderFocus,
    onMutate: async (items) => {
      await queryClient.cancelQueries({ queryKey: ['todos', { is_focused: true }] })
      const previous = queryClient.getQueryData<Todo[]>(['todos', { is_focused: true }])
      // Optimistically update the cache
      queryClient.setQueryData<Todo[]>(['todos', { is_focused: true }], (old) => {
        if (!old) return old
        const orderMap = new Map(items.map((item) => [item.id, item.focus_order]))
        return old.map((t) => {
          const newOrder = orderMap.get(t.id)
          return newOrder !== undefined ? { ...t, focus_order: newOrder } : t
        })
      })
      return { previous }
    },
    onError: (_err, _items, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['todos', { is_focused: true }], context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] })
    },
  })

  const notDone = todos
    .filter((t) => t.status !== 'done')
    .sort((a, b) => a.focus_order - b.focus_order)

  const filtered = selectedProject
    ? selectedProject === 'none'
      ? notDone.filter((t) => !t.project_id)
      : notDone.filter((t) => t.project_id === parseInt(selectedProject))
    : notDone

  // Projects that appear in focused todos (for filter dropdown)
  const focusedProjectIds = [...new Set(todos.map((t) => t.project_id).filter(Boolean))]
  const focusedProjects = projects.filter((p) => focusedProjectIds.includes(p.id))

  const handleEdit = (todo: Todo) => {
    setEditingTodo(todo)
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingTodo(null)
  }

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleDragStart = useCallback((todoId: number) => {
    dragItemId.current = todoId
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    if (dragGroupKey.current || dragSubgroupKey.current) return
    e.preventDefault()
    // Don't set dropEffect — TodoCard uses effectAllowed='link', and mismatching causes drop rejection
    setDragOverIndex(index)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent, dropIndex: number) => {
      if (dragGroupKey.current || dragSubgroupKey.current) return
      e.preventDefault()
      e.stopPropagation()
      setDragOverIndex(null)

      const draggedId = dragItemId.current ?? parseInt(e.dataTransfer.getData('application/x-todo-id'))
      if (!draggedId) return

      const dragIndex = filtered.findIndex((t) => t.id === draggedId)
      if (dragIndex === -1 || dragIndex === dropIndex) return

      // Adjust dropIndex: if dragging down, account for the removed item
      const adjustedDrop = dropIndex > dragIndex ? dropIndex - 1 : dropIndex
      if (dragIndex === adjustedDrop) return

      const reordered = [...filtered]
      const [moved] = reordered.splice(dragIndex, 1)
      reordered.splice(adjustedDrop, 0, moved)

      const items = reordered.map((t, i) => ({ id: t.id, focus_order: i }))
      reorderMutation.mutate(items)
      dragItemId.current = null
    },
    [filtered, reorderMutation],
  )

  const handleDragEnd = useCallback(() => {
    setDragOverIndex(null)
    dragItemId.current = null
    setDragOverGroupIndex(null)
    dragGroupKey.current = null
    setDragOverSubgroupIndex(null)
    dragSubgroupKey.current = null
  }, [])

  const handleGroupDragStart = useCallback((key: string) => {
    dragGroupKey.current = key
  }, [])

  const handleGroupDrop = useCallback(
    (e: React.DragEvent, dropIndex: number, groups: FlatGroup[]) => {
      e.preventDefault()
      e.stopPropagation()
      setDragOverGroupIndex(null)
      const key = dragGroupKey.current
      dragGroupKey.current = null
      if (!key) return

      const dragIndex = groups.findIndex((g) => g.key === key)
      if (dragIndex === -1 || dragIndex === dropIndex) return

      const adjusted = dropIndex > dragIndex ? dropIndex - 1 : dropIndex
      if (dragIndex === adjusted) return

      const reordered = [...groups]
      const [moved] = reordered.splice(dragIndex, 1)
      reordered.splice(adjusted, 0, moved)

      const items = reordered.flatMap((g) => g.todos).map((t, i) => ({ id: t.id, focus_order: i }))
      reorderMutation.mutate(items)
    },
    [reorderMutation],
  )

  const handleNestedGroupDrop = useCallback(
    (e: React.DragEvent, dropIndex: number, groups: NestedGroup[]) => {
      e.preventDefault()
      e.stopPropagation()
      setDragOverGroupIndex(null)
      const key = dragGroupKey.current
      dragGroupKey.current = null
      if (!key) return

      const dragIndex = groups.findIndex((g) => g.key === key)
      if (dragIndex === -1 || dragIndex === dropIndex) return

      const adjusted = dropIndex > dragIndex ? dropIndex - 1 : dropIndex
      if (dragIndex === adjusted) return

      const reordered = [...groups]
      const [moved] = reordered.splice(dragIndex, 1)
      reordered.splice(adjusted, 0, moved)

      const items = reordered
        .flatMap((g) => g.subgroups.flatMap((sg) => sg.todos))
        .map((t, i) => ({ id: t.id, focus_order: i }))
      reorderMutation.mutate(items)
    },
    [reorderMutation],
  )

  const handleSubgroupDrop = useCallback(
    (e: React.DragEvent, dropIndex: number, parentKey: string, allGroups: NestedGroup[]) => {
      e.preventDefault()
      e.stopPropagation()
      setDragOverSubgroupIndex(null)
      const sub = dragSubgroupKey.current
      dragSubgroupKey.current = null
      if (!sub || sub.parent !== parentKey) return

      const parent = allGroups.find((g) => g.key === parentKey)
      if (!parent) return

      const dragIndex = parent.subgroups.findIndex((sg) => sg.key === sub.key)
      if (dragIndex === -1 || dragIndex === dropIndex) return

      const adjusted = dropIndex > dragIndex ? dropIndex - 1 : dropIndex
      if (dragIndex === adjusted) return

      const reorderedSubs = [...parent.subgroups]
      const [moved] = reorderedSubs.splice(dragIndex, 1)
      reorderedSubs.splice(adjusted, 0, moved)

      // Rebuild full todo list: keep other groups intact, replace this group's subgroup order
      const items = allGroups.flatMap((g) => {
        const subs = g.key === parentKey ? reorderedSubs : g.subgroups
        return subs.flatMap((sg) => sg.todos)
      }).map((t, i) => ({ id: t.id, focus_order: i }))
      reorderMutation.mutate(items)
    },
    [reorderMutation],
  )

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Focus</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Drag cards to reorder. Drag any todo onto "Focus" in the sidebar to add it here.
          </p>
        </div>
      </div>

      {/* Must Do Today */}
      <div
        className={`rounded-xl border-2 ${todayDragOver ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20' : 'border-amber-200 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/30'} shadow-sm mb-6 transition-colors`}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('application/x-todo-id')) {
            e.preventDefault()
            setTodayDragOver(true)
          }
        }}
        onDragLeave={() => setTodayDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setTodayDragOver(false)
          const todoId = parseInt(e.dataTransfer.getData('application/x-todo-id'))
          if (!todoId) return
          const todo = todos.find((t) => t.id === todoId)
          if (todo) addTodayTodo(todo)
        }}
      >
        <div className="px-5 pt-4 pb-2 flex items-center gap-2">
          <span className="text-amber-500 text-lg">&#9733;</span>
          <h3 className="text-sm font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide">
            Must Do Today
          </h3>
          <span className="text-xs text-amber-500 dark:text-amber-500 font-medium">
            {getTodayKey()}
          </span>
          <span className="text-xs text-amber-400 dark:text-amber-600 ml-auto">
            {todayItems.filter((i) => i.done).length}/{todayItems.length} done
          </span>
        </div>

        {todayItems.length > 0 && (
          <ul className="px-5 pb-1 space-y-1">
            {todayItems.map((item) => (
              <li key={item.id} className="flex items-center gap-2 group">
                <button
                  onClick={() => toggleTodayDone(item.id)}
                  className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                    item.done
                      ? 'bg-amber-500 border-amber-500 text-white'
                      : 'border-amber-300 dark:border-amber-600 hover:border-amber-500'
                  }`}
                >
                  {item.done && <span className="text-xs">&#10003;</span>}
                </button>
                <span
                  className={`flex-1 text-sm ${
                    item.done
                      ? 'line-through text-amber-400 dark:text-amber-600'
                      : 'text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {item.text}
                  {item.todoId && (
                    <button
                      onClick={() => onOpenTodo(item.todoId!)}
                      className="ml-1.5 text-xs text-amber-500 hover:text-amber-700 dark:hover:text-amber-300"
                      title="Open todo detail"
                    >
                      &#8599;
                    </button>
                  )}
                </span>
                <button
                  onClick={() => removeTodayItem(item.id)}
                  className="opacity-0 group-hover:opacity-100 text-xs text-amber-400 hover:text-red-500 transition-opacity"
                  title="Remove"
                >
                  &#10005;
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="px-5 pb-4 pt-1 relative">
          <input
            ref={todayInputRef}
            type="text"
            value={todayInput}
            onChange={(e) => {
              setTodayInput(e.target.value)
              setTodaySearchOpen(e.target.value.length > 0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && todayInput.trim()) {
                // Check if input matches a focused todo
                const match = todos.find((t) =>
                  t.title.toLowerCase() === todayInput.trim().toLowerCase()
                )
                if (match) addTodayTodo(match)
                else addTodayText(todayInput)
                setTodayInput('')
                setTodaySearchOpen(false)
              }
              if (e.key === 'Escape') {
                setTodaySearchOpen(false)
                setTodayInput('')
              }
            }}
            onFocus={() => { if (todayInput.length > 0) setTodaySearchOpen(true) }}
            onBlur={() => setTimeout(() => setTodaySearchOpen(false), 150)}
            placeholder="Type to add or search todos... or drag a todo here"
            className="w-full text-sm text-slate-600 dark:text-slate-300 placeholder-amber-300 dark:placeholder-amber-700 bg-transparent outline-none"
          />
          {todaySearchOpen && todayInput.trim() && (() => {
            const q = todayInput.trim().toLowerCase()
            const matches = todos.filter(
              (t) =>
                t.title.toLowerCase().includes(q) &&
                !todayItems.some((i) => i.todoId === t.id)
            ).slice(0, 6)
            if (matches.length === 0) return null
            return (
              <div className="absolute left-5 right-5 top-full z-20 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {matches.map((t) => (
                  <button
                    key={t.id}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 dark:hover:bg-amber-900/30 text-slate-700 dark:text-slate-200 flex items-center gap-2"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      addTodayTodo(t)
                      setTodayInput('')
                      setTodaySearchOpen(false)
                    }}
                  >
                    <span className="text-amber-400 text-xs">&#9733;</span>
                    {t.title}
                    {t.project_name && (
                      <span className="ml-auto text-xs text-slate-400">{t.project_name}</span>
                    )}
                  </button>
                ))}
              </div>
            )
          })()}
        </div>
      </div>

      {/* Filter bar */}
      {focusedProjects.length > 1 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-4 mb-6">
          <div className="flex items-center gap-3">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              Filter by project
            </label>
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All projects</option>
              {focusedProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              {todos.some((t) => !t.project_id) && (
                <option value="none">No Project</option>
              )}
            </select>
            {selectedProject && (
              <button
                onClick={() => setSelectedProject('')}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {/* Group by + Count */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {filtered.length} focused todo{filtered.length !== 1 ? 's' : ''}
        </p>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            Group by
          </label>
          <select
            value={groupBy}
            onChange={(e) => {
              const v = e.target.value as GroupBy
              setGroupBy(v)
              localStorage.setItem('focusGroupBy', v)
            }}
            className="border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="none">None</option>
            <option value="project">Project</option>
            <option value="user">User</option>
            <option value="both">Project &amp; User</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="text-slate-500 dark:text-slate-400 text-sm">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 p-8 text-center">
          <p className="text-slate-400 dark:text-slate-500 text-sm">
            No focused todos yet. Drag todo cards onto "Focus" in the sidebar to add them.
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {(() => {
            const renderTodo = (t: Todo) => {
              const globalIndex = filtered.indexOf(t)
              return (
                <div
                  key={t.id}
                  onDragOver={(e) => handleDragOver(e, globalIndex)}
                  onDrop={(e) => handleDrop(e, globalIndex)}
                  onDragEnd={handleDragEnd}
                  onDragStartCapture={() => handleDragStart(t.id)}
                >
                  {dragOverIndex === globalIndex && dragItemId.current !== null && dragItemId.current !== t.id && (
                    <div className="h-1 bg-indigo-400 rounded-full mx-2 mb-1 transition-all" />
                  )}
                  <div className="mb-2">
                    <TodoCard
                      todo={t}
                      onEdit={handleEdit}
                      onOpenDetail={() => onOpenTodo(t.id)}
                      queryKeys={[['todos'], ['todos', { is_focused: true }]]}
                      isSelected={selectedIds.has(t.id)}
                      onToggleSelect={toggleSelect}
                      extraActions={
                        <button
                          onClick={() => removeFocus.mutate(t.id)}
                          title="Remove from Focus"
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-red-500 bg-red-50 hover:bg-red-100 border border-red-200 transition-colors"
                        >
                          ✕ Deprio
                        </button>
                      }
                    />
                  </div>
                </div>
              )
            }

            if (groupBy === 'none') return filtered.map(renderTodo)

            if (groupBy === 'both') {
              const nestedGroups = groupTodosNested(filtered)
              return nestedGroups.map((userGroup, gi) => (
                <div
                  key={userGroup.key}
                  onDragOver={(e) => { if (dragGroupKey.current) { e.preventDefault(); setDragOverGroupIndex(gi) } }}
                  onDrop={(e) => handleNestedGroupDrop(e, gi, nestedGroups)}
                >
                  {dragOverGroupIndex === gi && dragGroupKey.current && dragGroupKey.current !== userGroup.key && (
                    <div className="h-1 bg-indigo-400 rounded-full mx-2 mb-1 transition-all" />
                  )}
                  <div
                    className="flex items-center gap-3 mt-8 mb-2 px-1 cursor-grab active:cursor-grabbing select-none"
                    draggable
                    onDragStart={() => handleGroupDragStart(userGroup.key)}
                    onDragEnd={handleDragEnd}
                  >
                    <span className="text-slate-400 dark:text-slate-500 text-xs">⠿</span>
                    <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
                      {userGroup.label}
                    </h2>
                    <div className="flex-1 h-px bg-slate-300 dark:bg-slate-600" />
                  </div>
                  {userGroup.subgroups.map((projGroup, si) => (
                    <div
                      key={projGroup.key}
                      onDragOver={(e) => {
                        if (dragSubgroupKey.current?.parent === userGroup.key) {
                          e.preventDefault()
                          e.stopPropagation()
                          setDragOverSubgroupIndex({ parent: userGroup.key, index: si })
                        }
                      }}
                      onDrop={(e) => handleSubgroupDrop(e, si, userGroup.key, nestedGroups)}
                    >
                      {dragOverSubgroupIndex?.parent === userGroup.key && dragOverSubgroupIndex.index === si && dragSubgroupKey.current?.key !== projGroup.key && (
                        <div className="h-1 bg-indigo-400 rounded-full mx-4 mb-1 transition-all" />
                      )}
                      <div
                        className="flex items-center gap-2 mt-3 mb-2 pl-2 px-1 cursor-grab active:cursor-grabbing select-none"
                        draggable
                        onDragStart={(e) => {
                          e.stopPropagation()
                          dragSubgroupKey.current = { parent: userGroup.key, key: projGroup.key }
                        }}
                        onDragEnd={handleDragEnd}
                      >
                        <span className="text-slate-400 dark:text-slate-500 text-xs">⠿</span>
                        <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                          {projGroup.label}
                        </h3>
                        <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">
                          {projGroup.todos.length}
                        </span>
                        <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                      </div>
                      {projGroup.todos.map(renderTodo)}
                    </div>
                  ))}
                </div>
              ))
            }

            const flatGroups = groupTodosFlat(filtered, groupBy)
            return flatGroups.map((group, gi) => (
              <div
                key={group.key}
                onDragOver={(e) => { if (dragGroupKey.current) { e.preventDefault(); setDragOverGroupIndex(gi) } }}
                onDrop={(e) => handleGroupDrop(e, gi, flatGroups)}
              >
                {dragOverGroupIndex === gi && dragGroupKey.current && dragGroupKey.current !== group.key && (
                  <div className="h-1 bg-indigo-400 rounded-full mx-2 mb-1 transition-all" />
                )}
                <div
                  className="flex items-center gap-3 mt-6 mb-3 px-1 cursor-grab active:cursor-grabbing select-none"
                  draggable
                  onDragStart={() => handleGroupDragStart(group.key)}
                  onDragEnd={handleDragEnd}
                >
                  <span className="text-slate-400 dark:text-slate-500 text-xs">⠿</span>
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    {group.label}
                  </h3>
                  <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">
                    {group.todos.length}
                  </span>
                  <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                </div>
                {group.todos.map(renderTodo)}
              </div>
            ))
          })()}
          {/* Drop zone at the end */}
          <div
            onDragOver={(e) => handleDragOver(e, filtered.length)}
            onDrop={(e) => handleDrop(e, filtered.length)}
            className="h-4"
          >
            {dragOverIndex === filtered.length && dragItemId.current !== null && (
              <div className="h-1 bg-indigo-400 rounded-full mx-2 transition-all" />
            )}
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-dashed border-slate-300 dark:border-slate-600 overflow-hidden">
            <div className="px-5 py-4">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newTitle.trim() && !addFocusedTodo.isPending) {
                    addFocusedTodo.mutate(newTitle.trim())
                  }
                }}
                placeholder={addFocusedTodo.isPending ? 'Adding...' : '+ Add a focused todo...'}
                disabled={addFocusedTodo.isPending}
                className="w-full text-sm font-medium text-slate-600 dark:text-slate-400 placeholder-slate-300 dark:placeholder-slate-500 bg-transparent outline-none disabled:opacity-50"
              />
            </div>
          </div>
        </div>
      )}

      <BulkActionBar
        selectedIds={selectedIds}
        onClearSelection={() => setSelectedIds(new Set())}
        queryKeys={[['todos'], ['todos', { is_focused: true }]]}
      />

      {showModal && (
        <TodoModal
          todo={editingTodo}
          onClose={handleCloseModal}
          invalidateKeys={[['todos'], ['todos', { is_focused: true }]]}
        />
      )}
    </div>
  )
}
