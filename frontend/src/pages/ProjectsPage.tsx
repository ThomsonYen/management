import { useState, useCallback, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useResizableSidebar } from '../hooks/useResizableSidebar'
import { useHotkey } from '../hooks/useHotkey'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Archive, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { useIsDesktop } from '../hooks/useMediaQuery'
import ProjectNotes from '../components/ProjectNotes'
import { fetchProjectTree, fetchProjects, fetchTodos, fetchPersons, createProject, createTodo, deprecateProject, undeprecateProject, updateProject, reorderProjects } from '../api'
import { useToast } from '../ToastContext'
import type { ProjectTree, Project, Todo } from '../types'
import DatePicker from '../components/DatePicker'
import TodoCard from '../components/TodoCard'
import TodoModal from '../components/TodoModal'
import BulkActionBar from '../components/BulkActionBar'
import { useTodoDefaults, useTimezone, useHotkeys, resolveAssigneeId } from '../SettingsContext'
import { getTodayString } from '../dateUtils'

const IMPORTANCE_CYCLE: Record<string, string> = {
 low: 'medium',
 medium: 'high',
 high: 'low',
}

const IMPORTANCE_DOT: Record<string, string> = {
 low: 'bg-border dark:bg-inset',
 medium: 'bg-info',
 high: 'bg-prio-high',
}

/**
 * The tree without deprecated projects; those are listed on Recently Deleted.
 * Deprecation cascades down, so pruning a node drops only deprecated children.
 */
function pruneDeprecated(nodes: ProjectTree[]): ProjectTree[] {
 return nodes.flatMap((n) =>
 n.deprecated_at ? [] : [{ ...n, subprojects: pruneDeprecated(n.subprojects) }],
 )
}

type DropPlace = 'before' | 'after' | 'into'
interface ProjectDropAt { id: number; place: DropPlace }
interface MoveVars { id: number; parentId: number | null; reparent: boolean; order: number[] }

/** How long the cursor must rest on a row's middle before the "move inside" fill starts. */
const ARM_DELAY_MS = 350
/** How long the fill then takes before the dragged project drops inside. */
const HOVER_INTO_MS = 600
// Drop zones by the cursor's height within a row (0 = top, 1 = bottom). The
// borders are sticky so a state never flickers while the cursor sits on one.
/** Resting between these arms "move inside"; above or below always means between. */
const ARM_ZONE = [0.35, 0.65]
/** Once "move inside" shows, it holds until the cursor gets this close to an edge. */
const INTO_KEEP_ZONE = [0.25, 0.75]
/** The between line flips sides only after crossing the row's middle by this much. */
const SIDE_FLIP_MARGIN = 0.1

function nextDropAt(cur: ProjectDropAt | null, id: number, y: number): ProjectDropAt {
 const same = cur?.id === id
 if (same && cur.place === 'into' && y > INTO_KEEP_ZONE[0] && y < INTO_KEEP_ZONE[1]) return cur
 const side: DropPlace =
 same && cur.place === 'before' ? (y > 0.5 + SIDE_FLIP_MARGIN ? 'after' : 'before')
 : same && cur.place === 'after' ? (y < 0.5 - SIDE_FLIP_MARGIN ? 'before' : 'after')
 : y < 0.5 ? 'before' : 'after'
 return same && cur.place === side ? cur : { id, place: side }
}

/** A project with its parent id and sibling list (including itself). */
function locateProject(
 nodes: ProjectTree[],
 id: number,
 parentId: number | null = null,
): { node: ProjectTree; parentId: number | null; siblings: ProjectTree[] } | undefined {
 for (const n of nodes) {
 if (n.id === id) return { node: n, parentId, siblings: nodes }
 const hit = locateProject(n.subprojects, id, n.id)
 if (hit) return hit
 }
}

function ProjectNode({
 node,
 depth,
 insideDragged = false,
 selectedId,
 dragProjectId,
 dropAt,
 armingId,
 onSelect,
 onAddSub,
 onCycleImportance,
 onDragStart,
 onDragOver,
 onDragLeave,
 onDrop,
 onDragEnd,
}: {
 node: ProjectTree
 depth: number
 /** This row is the dragged project's own subproject, so it can't take the drop. */
 insideDragged?: boolean
 selectedId: number | null
 dragProjectId: number | null
 dropAt: ProjectDropAt | null
 /** The row the cursor is resting on, counting down to "move inside". */
 armingId: number | null
 onSelect: (id: number) => void
 onAddSub: (parentId: number) => void
 onCycleImportance: (node: ProjectTree) => void
 onDragStart: (id: number) => void
 onDragOver: (id: number, y: number) => void
 onDragLeave: (id: number) => void
 onDrop: (fromId: number, targetId: number, place: DropPlace) => void
 onDragEnd: () => void
}) {
 const [open, setOpen] = useState(true)
 const [editing, setEditing] = useState(false)
 const [editName, setEditName] = useState(node.name)
 const queryClient = useQueryClient()
 const hasChildren = node.subprojects.length > 0

 const renameMutation = useMutation({
 mutationFn: (name: string) => updateProject(node.id, { name }),
 onSuccess: () => {
 queryClient.invalidateQueries({ queryKey: ['projects'] })
 queryClient.invalidateQueries({ queryKey: ['projects-tree'] })
 setEditing(false)
 },
 })

 const commitRename = () => {
 const trimmed = editName.trim()
 if (trimmed && trimmed !== node.name) {
 renameMutation.mutate(trimmed)
 } else {
 setEditName(node.name)
 setEditing(false)
 }
 }

 const isDragSource = dragProjectId === node.id
 // Any row outside the dragged project's own subtree takes the drop: between rows
 // (at this row's level) by default, or inside it after hovering its middle.
 const canDrop = dragProjectId !== null && !isDragSource && !insideDragged
 const place = canDrop && dropAt?.id === node.id ? dropAt.place : null
 // Where the dragged project would land: a line above this row, or below its
 // whole subtree (it is inserted after the children, not between them).
 const indicator = place === 'before' || place === 'after' ? place : null
 const isIntoTarget = place === 'into'
 const isArming = canDrop && armingId === node.id && !isIntoTarget

 return (
 <div className="relative">
 {indicator && (
 <div
 className={`absolute right-2 h-0.5 rounded-full bg-accent pointer-events-none z-10 ${indicator === 'before' ? '-top-px' : '-bottom-px'}`}
 style={{ left: `${8 + depth * 16}px` }}
 >
 <div className="absolute -left-1 -top-[3px] w-2 h-2 rounded-full border-2 border-accent bg-surface" />
 </div>
 )}
 <div
 draggable
 onDragStart={(e) => {
 onDragStart(node.id)
 e.dataTransfer.effectAllowed = 'move'
 }}
 onDragOver={(e) => {
 if (!canDrop) return
 e.preventDefault()
 e.dataTransfer.dropEffect = 'move'
 const rect = e.currentTarget.getBoundingClientRect()
 const y = (e.clientY - rect.top) / rect.height
 onDragOver(node.id, y)
 }}
 onDragLeave={(e) => {
 // Moving onto the row's own buttons isn't leaving it.
 if (!e.currentTarget.contains(e.relatedTarget as Node)) onDragLeave(node.id)
 }}
 onDrop={(e) => {
 if (!canDrop) return
 e.preventDefault()
 const at = place ?? 'before'
 if (at === 'into') setOpen(true)
 onDrop(dragProjectId!, node.id, at)
 }}
 onDragEnd={onDragEnd}
 className={`relative flex items-center gap-1.5 group cursor-pointer rounded-lg px-2 py-1.5 text-base transition-colors ${
 isIntoTarget
 ? `bg-accent-1 text-accent-fg ring-2 ring-inset ring-accent ${selectedId === node.id ? 'font-semibold' : ''}`
 : selectedId === node.id
 ? 'bg-accent-2 text-accent-fg dark:bg-accent-1 dark:text-accent-fg font-semibold'
 : 'text-fg hover:bg-inset dark:hover:bg-elevated'
 } ${isDragSource || insideDragged ? 'opacity-40' : ''} ${isArming ? 'project-arming' : ''}`}
 style={{ paddingLeft: `${8 + depth * 16}px`, ['--arm-ms' as string]: `${HOVER_INTO_MS}ms` }}
 onClick={() => onSelect(node.id)}
 >
 <button
 onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
 className="w-4 flex-shrink-0 flex items-center justify-center text-fg-subtle"
 draggable={false}
 onDragStart={(e) => e.preventDefault()}
 >
 {hasChildren && (open ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
 </button>
 <button
 onClick={(e) => {
 e.stopPropagation()
 onCycleImportance(node)
 }}
 title={`Importance: ${node.importance} (click to cycle)`}
 className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${IMPORTANCE_DOT[node.importance] ?? IMPORTANCE_DOT.medium}`}
 draggable={false}
 onDragStart={(e) => e.preventDefault()}
 />
 {editing ? (
 <input
 autoFocus
 value={editName}
 onChange={(e) => setEditName(e.target.value)}
 onBlur={commitRename}
 onKeyDown={(e) => {
 if (e.key === 'Enter') commitRename()
 if (e.key === 'Escape') { setEditName(node.name); setEditing(false) }
 }}
 onClick={(e) => e.stopPropagation()}
 className="flex-1 bg-surface border border-accent rounded px-1 py-0 text-base outline-none"
 />
 ) : (
 <span
 className="flex-1"
 onDoubleClick={(e) => {
 e.stopPropagation()
 setEditName(node.name)
 setEditing(true)
 }}
 >
 {node.name}
 </span>
 )}
 {isIntoTarget && (
 // Laid over the row so it never takes space and makes the name wrap.
 <span className="absolute right-2 top-1/2 -translate-y-1/2 rounded bg-accent-1 pl-2 text-xs font-medium pointer-events-none">
 Move inside
 </span>
 )}
 <button
 onClick={(e) => {
 e.stopPropagation()
 onAddSub(node.id)
 }}
 className="opacity-0 group-hover:opacity-100 text-accent hover:text-accent-fg text-xs px-1 transition-all"
 title="Add subproject"
 draggable={false}
 onDragStart={(e) => e.preventDefault()}
 >
 +
 </button>
 </div>
 {hasChildren && open && (
 <div>
 {node.subprojects.map((sp) => (
 <ProjectNode
 key={sp.id}
 node={sp}
 depth={depth + 1}
 insideDragged={insideDragged || isDragSource}
 selectedId={selectedId}
 dragProjectId={dragProjectId}
 dropAt={dropAt}
 armingId={armingId}
 onSelect={onSelect}
 onAddSub={onAddSub}
 onCycleImportance={onCycleImportance}
 onDragStart={onDragStart}
 onDragOver={onDragOver}
 onDragLeave={onDragLeave}
 onDrop={onDrop}
 onDragEnd={onDragEnd}
 />
 ))}
 </div>
 )}
 </div>
 )
}

interface AddProjectModalProps {
 parentId?: number | null
 onClose: () => void
}

function AddProjectModal({ parentId, onClose }: AddProjectModalProps) {
 const queryClient = useQueryClient()
 const [name, setName] = useState('')
 const [description, setDescription] = useState('')
 const [deadline, setDeadline] = useState('')

 const mutation = useMutation({
 mutationFn: () =>
 createProject({
 name,
 description: description || undefined,
 parent_id: parentId || undefined,
 deadline: deadline || undefined,
 }),
 onSuccess: () => {
 queryClient.invalidateQueries({ queryKey: ['projects'] })
 queryClient.invalidateQueries({ queryKey: ['projects-tree'] })
 onClose()
 },
 })

 return (
 <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
 <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-md p-6">
 <h3 className="text-lg font-bold text-fg mb-4">
 {parentId ? 'Add Subproject' : 'Add Project'}
 </h3>
 <div className="space-y-4">
 <input
 type="text"
 value={name}
 onChange={(e) => setName(e.target.value)}
 placeholder="Project name"
 className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
 />
 <textarea
 value={description}
 onChange={(e) => setDescription(e.target.value)}
 placeholder="Description (optional)"
 rows={2}
 className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent resize-none"
 />
 <div>
 <label className="block text-xs font-semibold text-fg-muted uppercase tracking-wide mb-1">
 Deadline
 </label>
 <DatePicker
 value={deadline}
 onChange={setDeadline}
 variant="input"
 placeholder="No deadline"
 className="w-full"
 />
 </div>
 </div>
 <div className="flex gap-3 mt-5">
 <button
 onClick={() => mutation.mutate()}
 disabled={!name.trim() || mutation.isPending}
 className="flex-1 bg-accent text-white py-2 rounded-lg font-semibold text-sm hover:bg-accent-hover disabled:opacity-50 transition-colors"
 >
 {mutation.isPending ? 'Creating...' : 'Create'}
 </button>
 <button
 onClick={onClose}
 className="px-4 py-2 bg-inset text-fg rounded-lg font-semibold text-sm hover:bg-inset transition-colors"
 >
 Cancel
 </button>
 </div>
 </div>
 </div>
 )
}

function AddTodoCard({ projectId, queryKeys }: { projectId: number; queryKeys: unknown[][] }) {
 const [title, setTitle] = useState('')
 const queryClient = useQueryClient()
 const { defaults } = useTodoDefaults()
 const { timezone } = useTimezone()
 const { data: persons = [] } = useQuery({ queryKey: ['persons'], queryFn: fetchPersons })

 const createMutation = useMutation({
 mutationFn: createTodo,
 onSuccess: () => {
 queryKeys.forEach((k) => queryClient.invalidateQueries({ queryKey: k as string[] }))
 setTitle('')
 },
 })

 const handleSubmit = () => {
 if (!title.trim() || createMutation.isPending) return
 createMutation.mutate({
 title: title.trim(),
 assignee_id: resolveAssigneeId(defaults.assigneeName, persons),
 project_id: projectId,
 status: 'todo',
 importance: defaults.importance,
 estimated_hours: parseFloat(defaults.estimatedHours) || 1,
 deadline: defaults.deadlineToToday ? getTodayString(timezone) : undefined,
 blocked_by_ids: [],
 })
 }

 return (
 <div className="bg-surface rounded-xl shadow-sm border border-dashed border-border overflow-hidden">
 <div className="px-5 py-4">
 <input
 type="text"
 value={title}
 onChange={(e) => setTitle(e.target.value)}
 onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
 placeholder={createMutation.isPending ? 'Adding...' : '+ Add a todo...'}
 disabled={createMutation.isPending}
 className="w-full text-sm font-medium text-fg-muted placeholder:text-fg-faint dark:placeholder:text-fg-faint bg-transparent outline-none disabled:opacity-50"
 />
 </div>
 </div>
 )
}

export default function ProjectsPage({ onOpenTodo }: { onOpenTodo: (id: number) => void }) {
 const queryClient = useQueryClient()
 const { width: panelWidth, collapsed: panelCollapsed, startResize: startPanelResize, toggleCollapsed: togglePanel } = useResizableSidebar('projectsPanelWidth', 256)
 const isDesktop = useIsDesktop()
 const { bindings } = useHotkeys()
 const stableTogglePanel = useCallback(() => togglePanel(), [togglePanel])
 useHotkey(bindings.toggleSecondarySidebar, stableTogglePanel)
 const [searchParams, setSearchParams] = useSearchParams()
 const selectedProjectId = searchParams.get('project') ? Number(searchParams.get('project')) : null
 const setSelectedProjectId = (id: number | null) =>
 setSearchParams((prev) => { const p = new URLSearchParams(prev); id ? p.set('project', String(id)) : p.delete('project'); return p })
 const [showAddProject, setShowAddProject] = useState(false)
 const [addSubParentId, setAddSubParentId] = useState<number | null>(null)
 const [showTodoModal, setShowTodoModal] = useState(false)
 const [editingTodo, setEditingTodo] = useState<Todo | null>(null)
 const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
 const [dragProjectId, setDragProjectId] = useState<number | null>(null)
 const [dropAt, setDropAt] = useState<ProjectDropAt | null>(null)
 const hoverTimer = useRef<{ id: number; timer: number } | null>(null)
 const [armingId, setArmingId] = useState<number | null>(null)
 const clearHover = () => {
 if (hoverTimer.current) window.clearTimeout(hoverTimer.current.timer)
 hoverTimer.current = null
 setArmingId(null)
 }
 const endDrag = () => {
 clearHover()
 setDragProjectId(null)
 setDropAt(null)
 }

 const toggleSelect = (id: number) => {
 setSelectedIds((prev) => {
 const next = new Set(prev)
 if (next.has(id)) next.delete(id)
 else next.add(id)
 return next
 })
 }

 const { data: tree = [] } = useQuery<ProjectTree[]>({
 queryKey: ['projects-tree'],
 queryFn: fetchProjectTree,
 })
 const activeTree = useMemo(() => pruneDeprecated(tree), [tree])

 const { data: projects = [] } = useQuery<Project[]>({
 queryKey: ['projects'],
 queryFn: fetchProjects,
 })

 const { data: projectTodos = [], isLoading: todosLoading } = useQuery<Todo[]>({
 queryKey: ['todos', 'project', selectedProjectId],
 queryFn: () => fetchTodos({ project_id: selectedProjectId!, exclude_done: true }),
 enabled: !!selectedProjectId,
 })

 const { showToast } = useToast()
 const invalidateProjects = () => {
 queryClient.invalidateQueries({ queryKey: ['projects'] })
 queryClient.invalidateQueries({ queryKey: ['projects-tree'] })
 queryClient.invalidateQueries({ queryKey: ['deleted-projects'] })
 }
 const deprecateMutation = useMutation({
 mutationFn: deprecateProject,
 onSuccess: (project) => {
 invalidateProjects()
 setSelectedProjectId(null)
 showToast({
 message: `Deprecated "${project.name}" — moved to Recently Deleted with its todos and notes`,
 action: {
 label: 'Undo',
 onClick: async () => {
 await undeprecateProject(project.id)
 invalidateProjects()
 },
 },
 })
 },
 })
 const undeprecateMutation = useMutation({
 mutationFn: undeprecateProject,
 onSuccess: (project) => {
 invalidateProjects()
 showToast({ message: `Reactivated "${project.name}"` })
 },
 })

 const selectedProject = projects.find((p) => p.id === selectedProjectId)
 const [editingName, setEditingName] = useState(false)
 const [detailName, setDetailName] = useState('')

 const renameMutation = useMutation({
 mutationFn: (name: string) => updateProject(selectedProjectId!, { name }),
 onSuccess: () => {
 queryClient.invalidateQueries({ queryKey: ['projects'] })
 queryClient.invalidateQueries({ queryKey: ['projects-tree'] })
 setEditingName(false)
 },
 })

 const importanceMutation = useMutation({
 mutationFn: ({ id, importance }: { id: number; importance: string }) =>
 updateProject(id, { importance }),
 onMutate: async ({ id, importance }) => {
 await queryClient.cancelQueries({ queryKey: ['projects'] })
 await queryClient.cancelQueries({ queryKey: ['projects-tree'] })
 const prevFlat = queryClient.getQueryData<Project[]>(['projects'])
 const prevTree = queryClient.getQueryData<ProjectTree[]>(['projects-tree'])
 queryClient.setQueryData<Project[]>(['projects'], (old) =>
 old?.map((p) => (p.id === id ? { ...p, importance } : p)),
 )
 const patchTree = (nodes: ProjectTree[]): ProjectTree[] =>
 nodes.map((n) =>
 n.id === id
 ? { ...n, importance, subprojects: patchTree(n.subprojects) }
 : { ...n, subprojects: patchTree(n.subprojects) },
 )
 queryClient.setQueryData<ProjectTree[]>(['projects-tree'], (old) =>
 old ? patchTree(old) : old,
 )
 return { prevFlat, prevTree }
 },
 onError: (_err, _vars, ctx) => {
 if (ctx?.prevFlat) queryClient.setQueryData(['projects'], ctx.prevFlat)
 if (ctx?.prevTree) queryClient.setQueryData(['projects-tree'], ctx.prevTree)
 },
 onSettled: () => {
 queryClient.invalidateQueries({ queryKey: ['projects'] })
 queryClient.invalidateQueries({ queryKey: ['projects-tree'] })
 },
 })

 // One move covers reorder, move inside and move between levels: set the new
 // parent if it changed, then save the full order of the new sibling list.
 const moveMutation = useMutation({
 mutationFn: async ({ id, parentId, reparent, order }: MoveVars) => {
 if (reparent) await updateProject(id, { parent_id: parentId })
 await reorderProjects(order.map((pid, i) => ({ id: pid, display_order: i + 1 })))
 },
 onMutate: async ({ id, parentId, order }) => {
 await queryClient.cancelQueries({ queryKey: ['projects-tree'] })
 const prevTree = queryClient.getQueryData<ProjectTree[]>(['projects-tree'])
 let moved: ProjectTree | undefined
 const detach = (nodes: ProjectTree[]): ProjectTree[] =>
 nodes.flatMap((n) => {
 if (n.id === id) { moved = n; return [] }
 return [{ ...n, subprojects: detach(n.subprojects) }]
 })
 const rank = new Map(order.map((pid, i) => [pid, i + 1]))
 const withMoved = (nodes: ProjectTree[]): ProjectTree[] =>
 [...nodes, { ...moved!, parent_id: parentId }]
 .map((n) => ({ ...n, display_order: rank.get(n.id) ?? n.display_order }))
 .sort((a, b) => (a.display_order - b.display_order) || (a.id - b.id))
 const attach = (nodes: ProjectTree[]): ProjectTree[] =>
 nodes.map((n) => ({
 ...n,
 subprojects: n.id === parentId ? withMoved(attach(n.subprojects)) : attach(n.subprojects),
 }))
 queryClient.setQueryData<ProjectTree[]>(['projects-tree'], (old) => {
 if (!old) return old
 const rest = detach(old)
 if (!moved) return old
 return parentId == null ? withMoved(attach(rest)) : attach(rest)
 })
 return { prevTree }
 },
 onSuccess: (_data, { id, parentId, reparent }) => {
 if (!reparent) return
 const name = projects.find((p) => p.id === id)?.name ?? 'Project'
 const parent = projects.find((p) => p.id === parentId)
 showToast({ message: parent ? `Moved "${name}" into "${parent.name}"` : `Moved "${name}" to the top level` })
 },
 onError: (err: any, _vars, ctx) => {
 if (ctx?.prevTree) queryClient.setQueryData(['projects-tree'], ctx.prevTree)
 showToast({ message: err?.response?.data?.detail ?? 'Could not move the project', tone: 'danger' })
 },
 onSettled: () => {
 queryClient.invalidateQueries({ queryKey: ['projects'] })
 queryClient.invalidateQueries({ queryKey: ['projects-tree'] })
 },
 })

 const moveProject = (fromId: number, targetId: number, place: DropPlace) => {
 if (fromId === targetId) return
 const target = locateProject(tree, targetId)
 const from = locateProject(tree, fromId)
 if (!target || !from) return
 const parentId = place === 'into' ? targetId : target.parentId
 const list = (place === 'into' ? target.node.subprojects : target.siblings)
 .map((s) => s.id)
 .filter((sid) => sid !== fromId)
 list.splice(place === 'into' ? list.length : list.indexOf(targetId) + (place === 'after' ? 1 : 0), 0, fromId)
 const reparent = parentId !== from.parentId
 if (!reparent && list.every((sid, i) => sid === from.siblings[i]?.id)) return
 moveMutation.mutate({ id: fromId, parentId, reparent, order: list })
 }

 const cycleImportance = (node: ProjectTree) => {
 const next = IMPORTANCE_CYCLE[node.importance] ?? 'medium'
 importanceMutation.mutate({ id: node.id, importance: next })
 }

 const commitDetailRename = () => {
 const trimmed = detailName.trim()
 if (trimmed && trimmed !== selectedProject?.name) {
 renameMutation.mutate(trimmed)
 } else {
 setEditingName(false)
 }
 }

 const handleAddSub = (parentId: number) => {
 setAddSubParentId(parentId)
 }

 const handleCloseAddProject = () => {
 setShowAddProject(false)
 setAddSubParentId(null)
 }

 // Handlers shared by every tree node, active or deprecated.
 const nodeProps = {
 depth: 0,
 selectedId: selectedProjectId,
 dragProjectId,
 dropAt,
 armingId,
 onSelect: setSelectedProjectId,
 onAddSub: handleAddSub,
 onCycleImportance: cycleImportance,
 onDragStart: (id: number) => setDragProjectId(id),
 onDragOver: (id: number, y: number) => {
 // Resting in a row's middle arms "move inside"; the edges always mean between.
 const inArmZone = y > ARM_ZONE[0] && y < ARM_ZONE[1]
 if (!inArmZone) {
 if (hoverTimer.current) clearHover()
 } else if (hoverTimer.current?.id !== id) {
 // Rest first, then fill, then drop inside; passing through shows nothing.
 clearHover()
 hoverTimer.current = {
 id,
 timer: window.setTimeout(() => {
 setArmingId(id)
 hoverTimer.current = {
 id,
 timer: window.setTimeout(() => {
 setArmingId(null)
 setDropAt({ id, place: 'into' })
 }, HOVER_INTO_MS),
 }
 }, ARM_DELAY_MS),
 }
 }
 setDropAt((cur) => nextDropAt(cur, id, y))
 },
 onDragLeave: (id: number) => {
 if (hoverTimer.current?.id === id) clearHover()
 setDropAt((cur) => (cur?.id === id ? null : cur))
 },
 onDrop: (fromId: number, targetId: number, place: DropPlace) => {
 moveProject(fromId, targetId, place)
 endDrag()
 },
 onDragEnd: endDrag,
 }

 const todoQueryKeys: unknown[][] = selectedProjectId
 ? [['todos', 'project', selectedProjectId], ['todos']]
 : [['todos']]

 return (
 <div className="flex h-full">
 {/* Left panel — below md it becomes the list view of a list→detail flow */}
 <div
 style={isDesktop ? { width: panelCollapsed ? 40 : panelWidth } : undefined}
 className={`relative bg-surface md:border-r border-border flex-col flex-shrink-0 transition-[width] duration-200 ${
 selectedProjectId != null ? 'hidden md:flex' : 'flex w-full md:w-auto'
 }`}
 >
 {panelCollapsed && isDesktop ? (
 <div className="flex flex-col items-center flex-1 justify-end py-3">
 <button
 onClick={togglePanel}
 className="p-2 rounded-lg text-fg-subtle hover:bg-inset dark:hover:bg-elevated hover:text-fg-muted dark:hover:text-fg transition-colors"
 title="Expand projects panel"
 >
 <ChevronsRight size={16} />
 </button>
 </div>
 ) : (
 <>
 <div className="px-4 py-4 border-b border-border flex items-center justify-between">
 <h3 className="font-semibold text-fg text-sm">Projects</h3>
 <button
 onClick={() => setShowAddProject(true)}
 className="text-accent hover:text-accent-fg text-xs font-semibold"
 >
 + New
 </button>
 </div>
 <div className="flex-1 overflow-y-auto py-2">
 {activeTree.length === 0 ? (
 <p className="px-4 py-3 text-xs text-fg-subtle">No projects yet</p>
 ) : (
 activeTree.map((node) => (
 <ProjectNode key={node.id} node={node} {...nodeProps} />
 ))
 )}
 </div>

 <div className="hidden md:block px-2 py-2 border-t border-border">
 <button
 onClick={togglePanel}
 className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm text-fg-subtle hover:bg-inset dark:hover:bg-elevated hover:text-fg-muted dark:hover:text-fg transition-colors"
 title="Collapse projects panel"
 >
 <ChevronsLeft size={16} />
 <span className="text-xs">Collapse</span>
 </button>
 </div>
 <div
 onMouseDown={startPanelResize}
 className="hidden md:block absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-accent-hover/50 active:bg-accent/50 transition-colors"
 />
 </>
 )}
 </div>

 {/* Right panel — hidden below md until a project is selected */}
 <div className={`flex-1 overflow-y-auto p-4 md:p-6 ${selectedProjectId == null ? 'hidden md:block' : ''}`}>
 {selectedProjectId != null && (
 <button
 onClick={() => setSelectedProjectId(null)}
 className="md:hidden mb-3 flex items-center gap-1 text-sm font-medium text-accent"
 >
 <ChevronLeft size={16} /> Projects
 </button>
 )}
 {!selectedProjectId ? (
 <div className="flex items-center justify-center h-64 text-fg-subtle text-sm">
 Select a project to view its todos
 </div>
 ) : (
 <>
 {selectedProject && (
 <div className="bg-surface rounded-xl border border-border p-5 mb-5">
 <div className="flex items-start justify-between gap-4">
 <div>
 <div className="flex items-center gap-2">
 <button
 onClick={() => {
 const next = IMPORTANCE_CYCLE[selectedProject.importance] ?? 'medium'
 importanceMutation.mutate({ id: selectedProject.id, importance: next })
 }}
 title={`Importance: ${selectedProject.importance} (click to cycle)`}
 className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-2xs font-semibold uppercase tracking-wide border border-border hover:bg-inset transition-colors ${
 selectedProject.importance === 'high'
 ? 'text-prio-high'
 : selectedProject.importance === 'medium'
 ? 'text-info'
 : 'text-fg-muted'
 }`}
 >
 <span className={`w-2 h-2 rounded-full ${IMPORTANCE_DOT[selectedProject.importance] ?? IMPORTANCE_DOT.medium}`} />
 {selectedProject.importance}
 </button>
 {selectedProject.deprecated_at && (
 <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-2xs font-semibold uppercase tracking-wide border border-border text-fg-muted">
 <Archive size={10} />
 Deprecated
 </span>
 )}
 </div>
 {editingName ? (
 <input
 autoFocus
 value={detailName}
 onChange={(e) => setDetailName(e.target.value)}
 onBlur={commitDetailRename}
 onKeyDown={(e) => {
 if (e.key === 'Enter') commitDetailRename()
 if (e.key === 'Escape') setEditingName(false)
 }}
 className="text-xl font-bold text-fg bg-surface border border-accent rounded px-1 outline-none mt-1"
 />
 ) : (
 <h2
 className="text-xl font-bold text-fg cursor-text select-none mt-1"
 onClick={(e) => {
 e.stopPropagation()
 setDetailName(selectedProject.name)
 setEditingName(true)
 }}
 >
 {selectedProject.name}
 </h2>
 )}
 {selectedProject.description && (
 <p className="text-sm text-fg-muted mt-1">{selectedProject.description}</p>
 )}
 {selectedProject.deadline && (
 <p className="text-xs text-fg-subtle mt-1">
 Deadline: <span className="font-medium">{selectedProject.deadline}</span>
 </p>
 )}
 {selectedProject.deprecated_at && (
 <p className="text-xs text-fg-subtle mt-1">
 Deprecated {selectedProject.deprecated_at.slice(0, 10)}. Kept with all its todos and notes under Recently Deleted, and left out of the project list, pickers and the board.
 </p>
 )}
 </div>
 <div className="flex gap-2 flex-shrink-0">
 <button
 onClick={() => setShowTodoModal(true)}
 className="bg-accent text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-accent-hover transition-colors"
 >
 + Add Todo
 </button>
 {selectedProject.deprecated_at ? (
 <button
 onClick={() => undeprecateMutation.mutate(selectedProject.id)}
 disabled={undeprecateMutation.isPending}
 title="Make this project and its parents active again"
 className="bg-inset text-fg border border-border px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-accent-1 transition-colors disabled:opacity-50"
 >
 Reactivate
 </button>
 ) : (
 <button
 onClick={() => deprecateMutation.mutate(selectedProject.id)}
 disabled={deprecateMutation.isPending}
 title="Retire this project and its subprojects to Recently Deleted. Nothing is deleted."
 className="bg-inset text-fg-muted border border-border px-3 py-1.5 rounded-lg text-xs font-semibold hover:text-fg hover:bg-accent-1 transition-colors disabled:opacity-50"
 >
 Deprecate
 </button>
 )}
 </div>
 </div>
 </div>
 )}

 {selectedProject && <ProjectNotes project={selectedProject} />}

 <h3 className="text-sm font-semibold text-fg-muted uppercase tracking-wide mb-3">
 Todos ({projectTodos.length})
 </h3>
 {todosLoading ? (
 <div className="text-fg-muted text-sm">Loading...</div>
 ) : (
 <div className="space-y-3">
 {projectTodos.map((t) => (
 <TodoCard
 key={t.id}
 todo={t}
 onEdit={(todo) => {
 setEditingTodo(todo)
 setShowTodoModal(true)
 }}
 onOpenDetail={() => onOpenTodo(t.id)}
 queryKeys={todoQueryKeys}
 isSelected={selectedIds.has(t.id)}
 onToggleSelect={toggleSelect}
 />
 ))}
 <AddTodoCard projectId={selectedProjectId} queryKeys={todoQueryKeys} />
 </div>
 )}
 </>
 )}
 <BulkActionBar
 selectedIds={selectedIds}
 onClearSelection={() => setSelectedIds(new Set())}
 queryKeys={todoQueryKeys}
 />
 </div>

 {(showAddProject || addSubParentId !== null) && (
 <AddProjectModal
 parentId={addSubParentId}
 onClose={handleCloseAddProject}
 />
 )}

 {showTodoModal && (
 <TodoModal
 todo={editingTodo}
 onClose={() => {
 setShowTodoModal(false)
 setEditingTodo(null)
 }}
 invalidateKeys={todoQueryKeys}
 />
 )}
 </div>
 )
}
