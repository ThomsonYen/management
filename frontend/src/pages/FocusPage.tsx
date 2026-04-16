import React, { useState, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchTodos, fetchProjects, updateTodo, createTodo, reorderFocus, fetchMustDoItems, createMustDoItem, updateMustDoItem, deleteMustDoItem } from '../api'
import type { Todo, Project } from '../types'
import type { MustDoItem } from '../api'
import TodoCard from '../components/TodoCard'
import TodoModal from '../components/TodoModal'
import BulkActionBar from '../components/BulkActionBar'
import { useTimezone, useHotkeys } from '../SettingsContext'
import { getTodayString } from '../dateUtils'
import { useHotkey } from '../hooks/useHotkey'

type GroupBy = 'none' | 'project' | 'user' | 'both'

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
  const { timezone } = useTimezone()
  const [selectedProject, setSelectedProject] = useState<string>(() => {
    return localStorage.getItem('focusSelectedProject') || ''
  })
  const [groupBy, setGroupBy] = useState<GroupBy>(() => {
    const saved = localStorage.getItem('focusGroupBy')
    return (saved === 'project' || saved === 'user' || saved === 'both') ? saved : 'none'
  })
  const [showModal, setShowModal] = useState(false)
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [highlightedTodoId, setHighlightedTodoId] = useState<number | null>(null)
  const [collapseSignal, setCollapseSignal] = useState(0)
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const dragItemId = useRef<number | null>(null)
  const [dragOverGroupIndex, setDragOverGroupIndex] = useState<number | null>(null)
  const dragGroupKey = useRef<string | null>(null)
  const [dragOverSubgroupIndex, setDragOverSubgroupIndex] = useState<{ parent: string; index: number } | null>(null)
  const dragSubgroupKey = useRef<{ parent: string; key: string } | null>(null)
  const [focusSearch, setFocusSearch] = useState('')
  const [focusSearchOpen, setFocusSearchOpen] = useState(false)
  const [editingMustDoId, setEditingMustDoId] = useState<number | null>(null)
  const [editingMustDoText, setEditingMustDoText] = useState('')
  const [selectedMustDoIds, setSelectedMustDoIds] = useState<Set<number>>(new Set())
  const queryClient = useQueryClient()

  // --- Must Do Today ---
  const todayKey = getTodayString(timezone)
  const [todayInput, setTodayInput] = useState('')
  const [todaySearchOpen, setTodaySearchOpen] = useState(false)
  const [todayDragOver, setTodayDragOver] = useState<string | false>(false)
  const todayInputRef = useRef<HTMLInputElement>(null)
  const [activeSection, setActiveSection] = useState<string>('morning')
  const mustDoSections = ['morning', 'afternoon', 'evening'] as const
  const dragMustDoId = useRef<number | null>(null)
  const [mustDoDragOverSection, setMustDoDragOverSection] = useState<string | null>(null)
  const [mustDoDragOverPos, setMustDoDragOverPos] = useState<{ section: string; index: number } | null>(null)

  const { data: todayItems = [] } = useQuery<MustDoItem[]>({
    queryKey: ['must-do', todayKey],
    queryFn: () => fetchMustDoItems(todayKey),
  })

  const addMustDo = useMutation({
    mutationFn: (data: { todo_id?: number; text: string; order?: number; section?: string }) =>
      createMustDoItem(todayKey, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['must-do', todayKey] }),
  })

  const updateMustDo = useMutation({
    mutationFn: ({ id, ...data }: { id: number; text?: string; done?: boolean; order?: number; section?: string; todo_id?: number }) =>
      updateMustDoItem(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['must-do', todayKey] }),
  })

  const deleteMustDo = useMutation({
    mutationFn: (id: number) => deleteMustDoItem(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['must-do', todayKey] }),
  })

  const addTodayText = useCallback((text: string, section?: string) => {
    if (!text.trim()) return
    const sectionItems = todayItems.filter((i) => i.section === (section || activeSection))
    addMustDo.mutate({ text: text.trim(), order: sectionItems.length, section: section || activeSection })
  }, [addMustDo, todayItems, activeSection])

  const addTodayTodo = useCallback((todo: Todo, section?: string) => {
    if (todayItems.some((i) => i.todo_id === todo.id)) return
    const sec = section || activeSection
    const sectionItems = todayItems.filter((i) => i.section === sec)
    addMustDo.mutate({ todo_id: todo.id, text: todo.title, order: sectionItems.length, section: sec })
  }, [todayItems, addMustDo, activeSection])

  const toggleTodayDone = useCallback((item: MustDoItem) => {
    const newDone = !item.done
    updateMustDo.mutate({ id: item.id, done: newDone })
    if (item.todo_id) {
      updateTodo(item.todo_id, { status: newDone ? 'done' : 'todo' }).then(() => {
        queryClient.invalidateQueries({ queryKey: ['todos'] })
      })
    }
  }, [updateMustDo, queryClient])

  const removeTodayItem = useCallback((itemId: number) => {
    deleteMustDo.mutate(itemId)
  }, [deleteMustDo])

  const convertToTodo = useCallback(async (item: MustDoItem) => {
    const cached = queryClient.getQueryData<Todo[]>(['todos', { is_focused: true }]) || []
    const maxOrder = cached.reduce((max, t) => Math.max(max, t.focus_order), 0)
    const todo = await createTodo({ title: item.text, status: 'todo', importance: 'medium', estimated_hours: 1 })
    await updateTodo(todo.id, { is_focused: true, focus_order: maxOrder + 1 })
    await updateMustDoItem(item.id, { todo_id: todo.id })
    queryClient.invalidateQueries({ queryKey: ['must-do', todayKey] })
    queryClient.invalidateQueries({ queryKey: ['todos'] })
  }, [queryClient, todayKey])

  const { data: todos = [], isLoading } = useQuery<Todo[]>({
    queryKey: ['todos', { is_focused: true }],
    queryFn: () => fetchTodos({ is_focused: true }),
  })

  const { data: allTodos = [] } = useQuery<Todo[]>({
    queryKey: ['todos', { exclude_done: true }],
    queryFn: () => fetchTodos({ exclude_done: true }),
    enabled: focusSearchOpen,
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

  const addExistingToFocus = useMutation({
    mutationFn: async (todoId: number) => {
      const maxOrder = todos.reduce((max, t) => Math.max(max, t.focus_order), 0)
      await updateTodo(todoId, { is_focused: true, focus_order: maxOrder + 1 })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] })
      setFocusSearch('')
      setFocusSearchOpen(false)
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

  // --- Hotkeys ---
  const { bindings } = useHotkeys()
  const markDoneMutation = useMutation({
    mutationFn: (id: number) => updateTodo(id, { status: 'done' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['todos'] }),
  })
  const toggleFocusMutation = useMutation({
    mutationFn: (id: number) => updateTodo(id, { is_focused: false }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['todos'] }),
  })

  useHotkey(bindings.markDone, useCallback(() => {
    if (selectedIds.size === 0) return
    selectedIds.forEach((id) => markDoneMutation.mutate(id))
    setSelectedIds(new Set())
  }, [selectedIds, markDoneMutation]))

  useHotkey(bindings.toggleFocus, useCallback(() => {
    if (selectedIds.size === 0) return
    selectedIds.forEach((id) => toggleFocusMutation.mutate(id))
    setSelectedIds(new Set())
  }, [selectedIds, toggleFocusMutation]))

  useHotkey(bindings.editTodo, useCallback(() => {
    if (selectedIds.size !== 1) return
    const id = [...selectedIds][0]
    const todo = filtered.find((t) => t.id === id)
    if (todo) { setEditingTodo(todo); setShowModal(true) }
  }, [selectedIds, filtered]))

  useHotkey(bindings.selectAll, useCallback(() => {
    setSelectedIds(new Set(filtered.map((t) => t.id)))
  }, [filtered]))

  useHotkey(bindings.escape, useCallback(() => {
    if (showModal) { setShowModal(false); setEditingTodo(null) }
    else if (selectedIds.size > 0) setSelectedIds(new Set())
  }, [showModal, selectedIds]), { skipInputCheck: true })

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
    <div className="p-6 flex gap-6">
      {/* Left sidebar: header, controls, metadata */}
      <div className="w-52 flex-shrink-0 sticky top-6 self-start space-y-5">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Focus</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            Drag cards to reorder. Drag any todo onto "Focus" in the sidebar to add it here.
          </p>
        </div>

        <p className="text-sm text-slate-500 dark:text-slate-400">
          {filtered.length} focused todo{filtered.length !== 1 ? 's' : ''}
        </p>

        {focusedProjects.length > 1 && (
          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1.5">
              Filter by project
            </label>
            <select
              value={selectedProject}
              onChange={(e) => { setSelectedProject(e.target.value); localStorage.setItem('focusSelectedProject', e.target.value) }}
              className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                onClick={() => { setSelectedProject(''); localStorage.removeItem('focusSelectedProject') }}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium mt-1"
              >
                Clear filter
              </button>
            )}
          </div>
        )}

        <div>
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1.5">
            Group by
          </label>
          <select
            value={groupBy}
            onChange={(e) => {
              const v = e.target.value as GroupBy
              setGroupBy(v)
              localStorage.setItem('focusGroupBy', v)
            }}
            className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="none">None</option>
            <option value="project">Project</option>
            <option value="user">User</option>
            <option value="both">Project &amp; User</option>
          </select>
        </div>

        <div className="relative">
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1.5">
            Add existing todo
          </label>
          <input
            type="text"
            value={focusSearch}
            onChange={(e) => {
              setFocusSearch(e.target.value)
              setFocusSearchOpen(e.target.value.length > 0)
            }}
            onFocus={() => { if (focusSearch.length > 0) setFocusSearchOpen(true) }}
            onBlur={() => setTimeout(() => setFocusSearchOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setFocusSearch('')
                setFocusSearchOpen(false)
              }
            }}
            placeholder="Search todos..."
            className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-400 dark:placeholder-slate-500"
          />
          {focusSearchOpen && focusSearch.trim() && (() => {
            const q = focusSearch.trim().toLowerCase()
            const matches = allTodos.filter(
              (t) => !t.is_focused && t.title.toLowerCase().includes(q)
            ).slice(0, 8)
            if (matches.length === 0) return (
              <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg px-3 py-2 text-xs text-slate-400">
                No matching todos
              </div>
            )
            return (
              <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {matches.map((t) => (
                  <button
                    key={t.id}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-slate-700 dark:text-slate-200 border-b border-slate-100 dark:border-slate-700 last:border-b-0"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      addExistingToFocus.mutate(t.id)
                    }}
                  >
                    <div className="font-medium truncate flex items-center gap-1.5">
                      <span className="text-indigo-400 text-xs flex-shrink-0">&#9733;</span>
                      {t.title}
                    </div>
                    <div className="text-xs text-slate-400 dark:text-slate-500 flex gap-2 mt-0.5">
                      {t.project_name && <span>{t.project_name}</span>}
                      {t.assignee_name && <span>{t.assignee_name}</span>}
                      <span className="capitalize">{t.status}</span>
                    </div>
                  </button>
                ))}
              </div>
            )
          })()}
        </div>
      </div>

      {/* Right content area */}
      <div className="flex-1 min-w-0">
      <div className="max-w-4xl mx-auto">

      {/* Must Do Today */}
      <div className="rounded-xl border-2 border-amber-200 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/30 shadow-sm mb-6">
        <div className="px-5 pt-4 pb-2 flex items-center gap-2">
          <span className="text-amber-500 text-lg">&#9733;</span>
          <h3 className="text-sm font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide">
            Must Do Today
          </h3>
          <span className="text-xs text-amber-500 dark:text-amber-500 font-medium">
            {todayKey}
          </span>
          <span className="text-xs text-amber-400 dark:text-amber-600 ml-auto">
            {todayItems.filter((i) => i.done || (i.todo_id && todos.find((t) => t.id === i.todo_id)?.status === 'done')).length}/{todayItems.length} done
          </span>
          <button
            onClick={async () => {
              const doneItems = todayItems.filter((i) => i.done || (i.todo_id && todos.find((t) => t.id === i.todo_id)?.status === 'done'))
              await Promise.all(doneItems.map((i) => deleteMustDoItem(i.id)))
              queryClient.invalidateQueries({ queryKey: ['must-do', todayKey] })
            }}
            className="text-amber-400 hover:text-amber-600 dark:text-amber-600 dark:hover:text-amber-400 transition-colors"
            title="Clear done items"
          >
            &#8635;
          </button>
        </div>

        {/* Sections */}
        {mustDoSections.map((sec) => {
          const sectionItems = todayItems
            .filter((i) => (i.section || 'morning') === sec)
            .sort((a, b) => a.order - b.order)
          const isActive = activeSection === sec
          const isDragOver = todayDragOver === sec || mustDoDragOverSection === sec

          return (
            <div
              key={sec}
              className={`transition-colors ${isDragOver ? 'bg-amber-100/60 dark:bg-amber-900/30' : ''}`}
              onDragOver={(e) => {
                e.preventDefault()
                e.stopPropagation()
                if (e.dataTransfer.types.includes('application/x-todo-id')) {
                  setTodayDragOver(sec)
                } else if (e.dataTransfer.types.includes('application/x-must-do-id')) {
                  setMustDoDragOverSection(sec)
                }
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  if (todayDragOver === sec) setTodayDragOver(false)
                  if (mustDoDragOverSection === sec) setMustDoDragOverSection(null)
                  if (mustDoDragOverPos?.section === sec) setMustDoDragOverPos(null)
                }
              }}
              onDrop={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setTodayDragOver(false)
                setMustDoDragOverSection(null)
                const dropPos = mustDoDragOverPos
                setMustDoDragOverPos(null)

                // Handle drop of a focused todo card
                const todoIdStr = e.dataTransfer.getData('application/x-todo-id')
                if (todoIdStr) {
                  const todoId = parseInt(todoIdStr)
                  const todo = todos.find((t) => t.id === todoId)
                  if (todo) addTodayTodo(todo, sec)
                  return
                }

                // Handle drop of must-do item(s)
                const mustDoIdsStr = e.dataTransfer.getData('application/x-must-do-ids')
                const mustDoIdStr = e.dataTransfer.getData('application/x-must-do-id')
                if (mustDoIdsStr || mustDoIdStr) {
                  const ids: number[] = mustDoIdsStr
                    ? JSON.parse(mustDoIdsStr)
                    : [parseInt(mustDoIdStr)]

                  // Check if this is a within-section reorder (single item, same section)
                  const currentSectionItems = todayItems
                    .filter((i) => (i.section || 'morning') === sec)
                    .sort((a, b) => a.order - b.order)
                  const draggedItems = ids
                    .map((id) => todayItems.find((i) => i.id === id))
                    .filter((item): item is MustDoItem => !!item)
                  const allInSameSection = draggedItems.length > 0 && draggedItems.every((item) => (item.section || 'morning') === sec)

                  if (allInSameSection && dropPos?.section === sec) {
                    // Reorder within section (single or multi)
                    const dragIdSet = new Set(ids)
                    const insertIdx = dropPos.index

                    // Remove dragged items, then insert them at the target position
                    const remaining = currentSectionItems.filter((i) => !dragIdSet.has(i.id))
                    // Compute adjusted insert: count how many non-dragged items are before the original insert index
                    let adjustedIdx = 0
                    for (let i = 0; i < insertIdx && i < currentSectionItems.length; i++) {
                      if (!dragIdSet.has(currentSectionItems[i].id)) adjustedIdx++
                    }
                    // Preserve relative order of dragged items
                    const movedItems = currentSectionItems.filter((i) => dragIdSet.has(i.id))
                    const reordered = [...remaining]
                    reordered.splice(adjustedIdx, 0, ...movedItems)

                    // Check if order actually changed
                    const changed = reordered.some((item, i) => item.order !== i)
                    if (changed) {
                      reordered.forEach((item, i) => {
                        if (item.order !== i) {
                          updateMustDo.mutate({ id: item.id, order: i })
                        }
                      })
                    }
                  } else {
                    // Move between sections
                    const moves = draggedItems.filter((item) => (item.section || 'morning') !== sec)
                    let sectionCount = currentSectionItems.length
                    moves.forEach((item, idx) => {
                      updateMustDo.mutate({ id: item.id, section: sec, order: sectionCount + idx })
                    })
                    if (moves.length > 0) setSelectedMustDoIds(new Set())
                  }
                }
              }}
            >
              <div className={`px-5 py-1.5 flex items-center gap-2 ${sec !== 'morning' ? 'border-t border-amber-200/60 dark:border-amber-800/40' : ''}`}>
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-400 dark:text-amber-600 capitalize">
                  {sec === 'morning' ? '🌅 Morning' : sec === 'afternoon' ? '☀️ Afternoon' : '🌙 Evening'}
                </span>
                <div className="flex-1 h-px bg-amber-200/50 dark:bg-amber-800/30" />
                {sectionItems.length > 0 && (
                  <span className="text-xs text-amber-400 dark:text-amber-600">
                    {sectionItems.filter((i) => i.done || (i.todo_id && todos.find((t) => t.id === i.todo_id)?.status === 'done')).length}/{sectionItems.length}
                  </span>
                )}
              </div>

              {sectionItems.length > 0 && (
                <ul className="px-5 pb-1 space-y-1">
                  {sectionItems.map((item, itemIdx) => {
                    const linkedTodo = item.todo_id ? todos.find((t) => t.id === item.todo_id) : undefined
                    const effectiveDone = item.done || (linkedTodo?.status === 'done')
                    const isNoOp = (insertIdx: number) => {
                      if (dragMustDoId.current === null) return false
                      // Get all dragged IDs (multi-select aware)
                      const dragIds = selectedMustDoIds.has(dragMustDoId.current) && selectedMustDoIds.size > 1
                        ? selectedMustDoIds
                        : new Set([dragMustDoId.current])
                      // Check if all dragged items are in this section
                      const dragIndices = sectionItems
                        .map((si, idx) => dragIds.has(si.id) ? idx : -1)
                        .filter((idx) => idx !== -1)
                      if (dragIndices.length === 0) return false
                      // It's a no-op if inserting at a position that's within or adjacent to the contiguous block
                      const minIdx = Math.min(...dragIndices)
                      const maxIdx = Math.max(...dragIndices)
                      // Check if they form a contiguous block
                      const isContiguous = maxIdx - minIdx + 1 === dragIndices.length
                      if (!isContiguous) return false
                      return insertIdx >= minIdx && insertIdx <= maxIdx + 1
                    }
                    const showLineBefore = mustDoDragOverPos?.section === sec && mustDoDragOverPos.index === itemIdx && dragMustDoId.current !== null && !isNoOp(itemIdx)
                    const showLineAfter = itemIdx === sectionItems.length - 1 && mustDoDragOverPos?.section === sec && mustDoDragOverPos.index === sectionItems.length && dragMustDoId.current !== null && !isNoOp(sectionItems.length)
                    return (
                    <React.Fragment key={item.id}>
                    {showLineBefore && (
                      <div className="h-0.5 bg-amber-400 rounded-full mx-1 my-0.5 transition-all" />
                    )}
                    <li
                      className={`flex items-center gap-2 group cursor-pointer rounded px-1 -mx-1 ${selectedMustDoIds.has(item.id) ? 'bg-amber-200/70 dark:bg-amber-800/40 ring-1 ring-amber-300 dark:ring-amber-700' : 'hover:bg-amber-50 dark:hover:bg-amber-900/20'}`}
                      onDragOver={(e) => {
                        if (!e.dataTransfer.types.includes('application/x-must-do-id')) return
                        e.preventDefault()
                        e.stopPropagation()
                        const rect = e.currentTarget.getBoundingClientRect()
                        const midY = rect.top + rect.height / 2
                        const idx = sectionItems.indexOf(item)
                        const insertIdx = e.clientY < midY ? idx : idx + 1
                        setMustDoDragOverPos((prev) =>
                          prev?.section === sec && prev?.index === insertIdx ? prev : { section: sec, index: insertIdx }
                        )
                      }}
                      onClick={(e) => {
                        // Don't toggle select when clicking checkbox, text input, or buttons
                        if ((e.target as HTMLElement).closest('button, input')) return
                        setSelectedMustDoIds((prev) => {
                          const next = new Set(prev)
                          if (next.has(item.id)) next.delete(item.id)
                          else next.add(item.id)
                          return next
                        })
                      }}
                      draggable
                      onDragStart={(e) => {
                        // If this item is selected, drag all selected items
                        const ids = selectedMustDoIds.has(item.id) && selectedMustDoIds.size > 1
                          ? Array.from(selectedMustDoIds)
                          : [item.id]
                        e.dataTransfer.setData('application/x-must-do-id', String(item.id))
                        e.dataTransfer.setData('application/x-must-do-ids', JSON.stringify(ids))
                        e.dataTransfer.effectAllowed = 'move'
                        dragMustDoId.current = item.id
                      }}
                      onDragEnd={() => {
                        dragMustDoId.current = null
                        setMustDoDragOverSection(null)
                        setMustDoDragOverPos(null)
                      }}
                    >
                      <span className="text-slate-300 dark:text-slate-600 text-xs cursor-grab active:cursor-grabbing select-none">⠿</span>
                      <button
                        onClick={() => toggleTodayDone(item)}
                        className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                          effectiveDone
                            ? 'bg-amber-500 border-amber-500 text-white'
                            : 'border-amber-300 dark:border-amber-600 hover:border-amber-500'
                        }`}
                      >
                        {effectiveDone && <span className="text-xs">&#10003;</span>}
                      </button>
                      {editingMustDoId === item.id && !item.todo_id ? (
                        <input
                          autoFocus
                          className="flex-1 text-sm text-slate-700 dark:text-slate-200 bg-transparent outline-none border-b border-amber-400 dark:border-amber-500 py-0"
                          value={editingMustDoText}
                          onChange={(e) => setEditingMustDoText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const trimmed = editingMustDoText.trim()
                              if (trimmed && trimmed !== item.text) {
                                updateMustDo.mutate({ id: item.id, text: trimmed })
                              }
                              setEditingMustDoId(null)
                            }
                            if (e.key === 'Escape') {
                              setEditingMustDoId(null)
                            }
                          }}
                          onBlur={() => {
                            const trimmed = editingMustDoText.trim()
                            if (trimmed && trimmed !== item.text) {
                              updateMustDo.mutate({ id: item.id, text: trimmed })
                            }
                            setEditingMustDoId(null)
                          }}
                        />
                      ) : (
                      <span
                        className={`flex-1 text-sm ${
                          effectiveDone
                            ? 'line-through text-amber-400 dark:text-amber-600'
                            : 'text-slate-700 dark:text-slate-200'
                        } ${!item.todo_id ? 'cursor-text' : ''}`}
                        onDoubleClick={() => {
                          if (!item.todo_id) {
                            setEditingMustDoId(item.id)
                            setEditingMustDoText(item.text)
                          }
                        }}
                      >
                        {item.text}
                        {item.todo_id && (() => {
                          const lt = todos.find((t) => t.id === item.todo_id)
                          if (!lt) return null
                          const parts = [lt.assignee_name, lt.project_name].filter(Boolean)
                          return parts.length > 0 ? (
                            <span className="ml-1.5 text-xs text-slate-400 dark:text-slate-500 font-medium">
                              — {parts.join(' · ')}
                            </span>
                          ) : null
                        })()}
                        {item.todo_id && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              const el = document.getElementById(`focus-todo-${item.todo_id}`)
                              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                              if (highlightTimer.current) clearTimeout(highlightTimer.current)
                              setHighlightedTodoId(item.todo_id!)
                              setCollapseSignal((c) => c + 1)
                              highlightTimer.current = setTimeout(() => setHighlightedTodoId(null), 2000)
                            }}
                            className="ml-1.5 text-xs text-amber-500 hover:text-amber-700 dark:hover:text-amber-300"
                            title="Open todo detail"
                          >
                            &#8599;
                          </button>
                        )}
                      </span>
                      )}
                      {!item.todo_id && (
                        <button
                          onClick={() => convertToTodo(item)}
                          className="opacity-0 group-hover:opacity-100 text-xs text-amber-500 hover:text-amber-700 dark:hover:text-amber-300 transition-opacity"
                          title="Convert to todo"
                        >
                          &#9745;
                        </button>
                      )}
                      <button
                        onClick={() => removeTodayItem(item.id)}
                        className="opacity-0 group-hover:opacity-100 text-xs text-amber-400 hover:text-red-500 transition-opacity"
                        title="Remove"
                      >
                        &#10005;
                      </button>
                    </li>
                    {showLineAfter && (
                      <div className="h-0.5 bg-amber-400 rounded-full mx-1 my-0.5 transition-all" />
                    )}
                    </React.Fragment>
                    )
                  })}
                </ul>
              )}

              {/* Inline input for every section */}
              <div className="px-5 pb-2 pt-0.5 relative">
                <input
                  ref={sec === activeSection ? todayInputRef : undefined}
                  type="text"
                  value={isActive ? todayInput : undefined}
                  onChange={isActive ? (e) => {
                    setTodayInput(e.target.value)
                    setTodaySearchOpen(e.target.value.length > 0)
                  } : undefined}
                  onFocus={() => {
                    setActiveSection(sec)
                    if (todayInput.length > 0) setTodaySearchOpen(true)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && todayInput.trim()) {
                      const match = todos.find((t) =>
                        t.title.toLowerCase() === todayInput.trim().toLowerCase()
                      )
                      if (match) addTodayTodo(match, sec)
                      else addTodayText(todayInput, sec)
                      setTodayInput('')
                      setTodaySearchOpen(false)
                    }
                    if (e.key === 'Escape') {
                      setTodaySearchOpen(false)
                      setTodayInput('')
                    }
                  }}
                  onBlur={() => setTimeout(() => setTodaySearchOpen(false), 150)}
                  placeholder={`Add to ${sec}...`}
                  className="w-full text-sm text-slate-600 dark:text-slate-300 placeholder-amber-300 dark:placeholder-amber-700 bg-transparent outline-none"
                />
                {isActive && todaySearchOpen && todayInput.trim() && (() => {
                  const q = todayInput.trim().toLowerCase()
                  const matches = todos.filter(
                    (t) =>
                      t.title.toLowerCase().includes(q) &&
                      !todayItems.some((i) => i.todo_id === t.id)
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
                            addTodayTodo(t, sec)
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
          )
        })}

        {/* Bulk action bar for must-do items */}
        {selectedMustDoIds.size > 0 && (
          <div className="px-5 py-2 border-t border-amber-200/60 dark:border-amber-800/40 flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
              {selectedMustDoIds.size} selected
            </span>
            <div className="h-4 w-px bg-amber-300 dark:bg-amber-700" />
            {mustDoSections.map((sec) => (
              <button
                key={sec}
                onClick={() => {
                  let sectionCount = todayItems.filter((i) => (i.section || 'morning') === sec).length
                  const moves = Array.from(selectedMustDoIds)
                    .map((id) => todayItems.find((i) => i.id === id))
                    .filter((item): item is MustDoItem => !!item && (item.section || 'morning') !== sec)
                  moves.forEach((item, idx) => {
                    updateMustDo.mutate({ id: item.id, section: sec, order: sectionCount + idx })
                  })
                  setSelectedMustDoIds(new Set())
                }}
                className="px-2 py-0.5 rounded text-xs font-medium capitalize bg-amber-100 dark:bg-amber-800/50 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-700/50 transition-colors"
              >
                Move to {sec}
              </button>
            ))}
            <div className="flex-1" />
            <button
              onClick={() => {
                selectedMustDoIds.forEach((id) => deleteMustDo.mutate(id))
                setSelectedMustDoIds(new Set())
              }}
              className="px-2 py-0.5 rounded text-xs font-medium bg-red-50 dark:bg-red-900/30 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
            >
              Delete
            </button>
            <button
              onClick={() => setSelectedMustDoIds(new Set())}
              className="text-xs text-amber-400 hover:text-amber-600 dark:hover:text-amber-300 font-medium"
            >
              Cancel
            </button>
          </div>
        )}
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
                  id={`focus-todo-${t.id}`}
                  onDragOver={(e) => handleDragOver(e, globalIndex)}
                  onDrop={(e) => handleDrop(e, globalIndex)}
                  onDragEnd={handleDragEnd}
                  onDragStartCapture={() => handleDragStart(t.id)}
                >
                  {dragOverIndex === globalIndex && dragItemId.current !== null && dragItemId.current !== t.id && (
                    <div className="h-1 bg-indigo-400 rounded-full mx-2 mb-1 transition-all" />
                  )}
                  <div className={`mb-2 rounded-xl transition-all duration-500 ${highlightedTodoId === t.id ? 'ring-2 ring-amber-400 bg-amber-50/50 dark:bg-amber-900/20' : ''}`}>
                    <TodoCard
                      todo={t}
                      onEdit={handleEdit}
                      onOpenDetail={() => onOpenTodo(t.id)}
                      queryKeys={[['todos'], ['todos', { is_focused: true }]]}
                      isSelected={selectedIds.has(t.id)}
                      onToggleSelect={toggleSelect}
                      forceCollapseSignal={highlightedTodoId === t.id ? collapseSignal : 0}
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
      </div>
    </div>
  )
}
