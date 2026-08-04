import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Eye, EyeOff, GripVertical, X } from 'lucide-react'
import {
 fetchPersons,
 fetchProjects,
 reorderProjects,
 updatePerson,
 updateProject,
} from '../api'
import type { Person, Project } from '../types'
import ProjectNotes from './ProjectNotes'

const IMPORTANCE_CYCLE: Record<string, string> = {
 low: 'medium',
 medium: 'high',
 high: 'low',
}

const IMPORTANCE_DOT: Record<string, string> = {
 low: 'bg-border dark:bg-inset',
 medium: 'bg-info',
 high: 'bg-danger',
}

const IMPORTANCE_RING: Record<string, string> = {
 low: '',
 medium: '',
 high: 'ring-1 ring-red-200 dark:ring-red-900/40',
}

export default function PersonProjectBoard({
 dragPersonId,
}: {
 dragPersonId: number | null
}) {
 const queryClient = useQueryClient()

 const { data: persons = [] } = useQuery<Person[]>({
 queryKey: ['persons'],
 queryFn: fetchPersons,
 })
 const { data: projects = [] } = useQuery<Project[]>({
 queryKey: ['projects'],
 queryFn: fetchProjects,
 })

 const [hoverCol, setHoverCol] = useState<number | null>(null)
 const [popoverOpen, setPopoverOpen] = useState(false)
 const popoverRef = useRef<HTMLDivElement>(null)
 const [openedProjectId, setOpenedProjectId] = useState<number | null>(null)
 const [dragProjectId, setDragProjectId] = useState<number | null>(null)
 const [dragOverProjectId, setDragOverProjectId] = useState<number | null>(null)

 useEffect(() => {
 if (!popoverOpen) return
 const handler = (e: MouseEvent) => {
 if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
 setPopoverOpen(false)
 }
 }
 document.addEventListener('mousedown', handler)
 return () => document.removeEventListener('mousedown', handler)
 }, [popoverOpen])

 const projectById = useMemo(
 () => new Map(projects.map((p) => [p.id, p])),
 [projects],
 )

 const projectLabel = (p: Project): string => {
 if (p.parent_id) {
 const parent = projectById.get(p.parent_id)
 if (parent) return `${parent.name} / ${p.name}`
 }
 return p.name
 }

 const peopleByProject = useMemo(() => {
 const map: Record<number, Person[]> = {}
 for (const proj of projects) map[proj.id] = []
 for (const person of persons) {
 for (const pid of person.project_ids) {
 if (map[pid]) map[pid].push(person)
 }
 }
 return map
 }, [persons, projects])

 const visibleProjects = useMemo(
 () => projects.filter((p) => !p.board_hidden),
 [projects],
 )
 const hiddenProjects = useMemo(
 () => projects.filter((p) => p.board_hidden),
 [projects],
 )

 // Auto-close floating notes if its project goes away or is hidden.
 useEffect(() => {
 if (openedProjectId === null) return
 const proj = projectById.get(openedProjectId)
 if (!proj || proj.board_hidden) setOpenedProjectId(null)
 }, [openedProjectId, projectById])

 const dragPerson =
 dragPersonId !== null ? persons.find((p) => p.id === dragPersonId) : null

 const personUpdate = useMutation({
 mutationFn: ({ id, project_ids }: { id: number; project_ids: number[] }) =>
 updatePerson(id, { project_ids }),
 onMutate: async ({ id, project_ids }) => {
 await queryClient.cancelQueries({ queryKey: ['persons'] })
 const prev = queryClient.getQueryData<Person[]>(['persons'])
 queryClient.setQueryData<Person[]>(['persons'], (old) =>
 old?.map((p) => {
 if (p.id !== id) return p
 const project_names = project_ids
 .map((pid) => projectById.get(pid)?.name)
 .filter((n): n is string => Boolean(n))
 return { ...p, project_ids, project_names }
 }),
 )
 return { prev }
 },
 onError: (_err, _vars, ctx) => {
 if (ctx?.prev) queryClient.setQueryData(['persons'], ctx.prev)
 },
 onSettled: () => {
 queryClient.invalidateQueries({ queryKey: ['persons'] })
 },
 })

 const projectUpdate = useMutation({
 mutationFn: ({
 id,
 patch,
 }: {
 id: number
 patch: Parameters<typeof updateProject>[1]
 }) => updateProject(id, patch),
 onMutate: async ({ id, patch }) => {
 await queryClient.cancelQueries({ queryKey: ['projects'] })
 const prev = queryClient.getQueryData<Project[]>(['projects'])
 queryClient.setQueryData<Project[]>(['projects'], (old) =>
 old?.map((p) => (p.id === id ? { ...p, ...patch } : p)),
 )
 return { prev }
 },
 onError: (_err, _vars, ctx) => {
 if (ctx?.prev) queryClient.setQueryData(['projects'], ctx.prev)
 },
 onSettled: () => {
 queryClient.invalidateQueries({ queryKey: ['projects'] })
 queryClient.invalidateQueries({ queryKey: ['projects-tree'] })
 },
 })

 const reorderMutation = useMutation({
 mutationFn: reorderProjects,
 onSettled: () => {
 queryClient.invalidateQueries({ queryKey: ['projects'] })
 queryClient.invalidateQueries({ queryKey: ['projects-tree'] })
 },
 })

 const handlePersonDrop = (projectId: number) => {
 if (!dragPerson) return
 if (dragPerson.project_ids.includes(projectId)) return
 personUpdate.mutate({
 id: dragPerson.id,
 project_ids: [...dragPerson.project_ids, projectId],
 })
 }

 const commitReorder = (fromId: number, beforeId: number) => {
 if (fromId === beforeId) return
 const list = [...visibleProjects]
 const fromIdx = list.findIndex((p) => p.id === fromId)
 const toIdx = list.findIndex((p) => p.id === beforeId)
 if (fromIdx === -1 || toIdx === -1) return
 const [moved] = list.splice(fromIdx, 1)
 const insertAt = fromIdx < toIdx ? toIdx - 1 : toIdx
 list.splice(insertAt, 0, moved)
 const combined = [...list, ...hiddenProjects]
 const payload = combined.map((p, i) => ({ id: p.id, display_order: i + 1 }))
 // Optimistic update
 const orderMap = new Map(payload.map((it) => [it.id, it.display_order]))
 queryClient.setQueryData<Project[]>(['projects'], (old) => {
 if (!old) return old
 return [...old]
 .map((p) => ({ ...p, display_order: orderMap.get(p.id) ?? p.display_order }))
 .sort((a, b) => (a.display_order - b.display_order) || (a.id - b.id))
 })
 reorderMutation.mutate(payload)
 }

 const removeAssignment = (person: Person, projectId: number) => {
 const nextIds = person.project_ids.filter((id) => id !== projectId)
 personUpdate.mutate({ id: person.id, project_ids: nextIds })
 }

 const hideProject = (projectId: number) => {
 projectUpdate.mutate({ id: projectId, patch: { board_hidden: true } })
 }

 const unhideProject = (projectId: number) => {
 projectUpdate.mutate({ id: projectId, patch: { board_hidden: false } })
 }

 const cycleImportance = (proj: Project) => {
 const next = IMPORTANCE_CYCLE[proj.importance] ?? 'medium'
 projectUpdate.mutate({ id: proj.id, patch: { importance: next } })
 }

 return (
 <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
 {hiddenProjects.length > 0 && (
 <div className="px-3 pt-2 flex items-center justify-end flex-shrink-0 relative">
 <div ref={popoverRef} className="relative">
 <button
 onClick={() => setPopoverOpen((v) => !v)}
 className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md border border-border bg-surface text-fg-muted hover:bg-inset transition-colors"
 title="Show hidden projects"
 >
 <EyeOff size={12} />
 Hidden ({hiddenProjects.length})
 <ChevronDown size={11} className={popoverOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
 </button>
 {popoverOpen && (
 <div className="absolute right-0 top-full mt-1 z-20 w-56 bg-surface border border-border rounded-lg shadow-lg py-1">
 <div className="max-h-64 overflow-y-auto">
 {hiddenProjects.map((p) => (
 <button
 key={p.id}
 onClick={() => unhideProject(p.id)}
 className="w-full flex items-center justify-between gap-2 px-2 py-1.5 text-xs text-fg hover:bg-inset"
 title="Show on board"
 >
 <span className="truncate text-left">{projectLabel(p)}</span>
 <Eye size={11} className="text-fg-subtle flex-shrink-0" />
 </button>
 ))}
 </div>
 {hiddenProjects.length >= 2 && (
 <div className="border-t border-border mt-1 pt-1">
 <button
 onClick={() => {
 hiddenProjects.forEach((p) =>
 projectUpdate.mutate({ id: p.id, patch: { board_hidden: false } }),
 )
 setPopoverOpen(false)
 }}
 className="w-full text-left px-2 py-1 text-[11px] font-medium text-accent hover:bg-inset"
 >
 Show all
 </button>
 </div>
 )}
 </div>
 )}
 </div>
 </div>
 )}
 <div className="flex-1 min-h-0 p-3 overflow-hidden">
 {projects.length === 0 ? (
 <div className="text-sm italic text-fg-subtle px-2">
 No projects yet — create one to start assigning people.
 </div>
 ) : visibleProjects.length === 0 ? (
 <div className="flex flex-col items-center justify-center h-full gap-2 text-sm italic text-fg-subtle">
 All projects hidden.
 <button
 onClick={() => setPopoverOpen(true)}
 className="text-xs font-medium not-italic text-accent hover:text-accent-fg dark:hover:text-accent"
 >
 Show hidden ({hiddenProjects.length})
 </button>
 </div>
 ) : (
 <div className="grid grid-cols-2 md:grid-cols-[repeat(auto-fill,180px)] auto-rows-[minmax(140px,1fr)] gap-2 h-full overflow-y-auto overflow-x-hidden content-start">
 {visibleProjects.map((proj) => {
 const alreadyMember =
 dragPerson?.project_ids.includes(proj.id) ?? false
 const canDropPerson = dragPerson != null && !alreadyMember
 const isReorderTarget =
 dragProjectId !== null &&
 dragProjectId !== proj.id &&
 dragOverProjectId === proj.id
 return (
 <BoardColumn
 key={proj.id}
 project={proj}
 title={projectLabel(proj)}
 people={peopleByProject[proj.id]}
 hoverPerson={hoverCol === proj.id && canDropPerson}
 isReorderTarget={isReorderTarget}
 isReorderSource={dragProjectId === proj.id}
 canDropPerson={canDropPerson}
 notesOpen={openedProjectId === proj.id}
 onDragOverColumn={(e) => {
 if (canDropPerson) {
 e.preventDefault()
 e.dataTransfer.dropEffect = 'move'
 setHoverCol(proj.id)
 } else if (
 dragProjectId !== null &&
 dragProjectId !== proj.id
 ) {
 e.preventDefault()
 e.dataTransfer.dropEffect = 'move'
 setDragOverProjectId(proj.id)
 }
 }}
 onDragLeaveColumn={() => {
 setHoverCol((cur) => (cur === proj.id ? null : cur))
 setDragOverProjectId((cur) => (cur === proj.id ? null : cur))
 }}
 onDropColumn={(e) => {
 if (canDropPerson) {
 e.preventDefault()
 handlePersonDrop(proj.id)
 setHoverCol(null)
 } else if (
 dragProjectId !== null &&
 dragProjectId !== proj.id
 ) {
 e.preventDefault()
 commitReorder(dragProjectId, proj.id)
 setDragProjectId(null)
 setDragOverProjectId(null)
 }
 }}
 onReorderStart={() => setDragProjectId(proj.id)}
 onReorderEnd={() => {
 setDragProjectId(null)
 setDragOverProjectId(null)
 }}
 onRemove={(person) => removeAssignment(person, proj.id)}
 onHide={() => hideProject(proj.id)}
 onCycleImportance={() => cycleImportance(proj)}
 onOpenNotes={() =>
 setOpenedProjectId((cur) => (cur === proj.id ? null : proj.id))
 }
 onCloseNotes={() => setOpenedProjectId(null)}
 />
 )
 })}
 </div>
 )}
 </div>
 </div>
 )
}

function FloatingNotes({
 project,
 title,
 onClose,
}: {
 project: Project
 title: string
 onClose: () => void
}) {
 return (
 <div className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:absolute md:inset-x-auto md:bottom-auto md:top-0 md:left-full md:ml-2 w-auto md:w-[360px] md:max-w-[80vw] max-h-[60vh] z-30 flex flex-col bg-surface rounded-xl shadow-2xl border border-border">
 <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border">
 <h3
 className="text-sm font-semibold text-fg truncate"
 title={title}
 >
 {title}
 </h3>
 <button
 onClick={onClose}
 title="Close"
 className="text-fg-subtle hover:text-fg dark:hover:text-fg-faint transition-colors"
 >
 <X size={14} />
 </button>
 </div>
 <div className="flex-1 overflow-y-auto p-2">
 <ProjectNotes project={project} />
 </div>
 </div>
 )
}

function BoardColumn({
 project,
 title,
 people,
 hoverPerson,
 isReorderTarget,
 isReorderSource,
 canDropPerson,
 notesOpen,
 onDragOverColumn,
 onDragLeaveColumn,
 onDropColumn,
 onReorderStart,
 onReorderEnd,
 onRemove,
 onHide,
 onCycleImportance,
 onOpenNotes,
 onCloseNotes,
}: {
 project: Project
 title: string
 people: Person[]
 hoverPerson: boolean
 isReorderTarget: boolean
 isReorderSource: boolean
 canDropPerson: boolean
 notesOpen: boolean
 onDragOverColumn: (e: React.DragEvent) => void
 onDragLeaveColumn: () => void
 onDropColumn: (e: React.DragEvent) => void
 onReorderStart: () => void
 onReorderEnd: () => void
 onRemove: (person: Person) => void
 onHide: () => void
 onCycleImportance: () => void
 onOpenNotes: () => void
 onCloseNotes: () => void
}) {
 return (
 <div
 onDragOver={onDragOverColumn}
 onDragLeave={onDragLeaveColumn}
 onDrop={onDropColumn}
 className={`group relative flex flex-col rounded-lg border transition-colors min-h-0 ${IMPORTANCE_RING[project.importance] ?? ''} ${
 hoverPerson && canDropPerson
 ? 'border-accent bg-accent-1/60 dark:bg-accent-1'
 : isReorderTarget
 ? 'border-accent border-dashed bg-accent-1/40 dark:bg-accent-1'
 : 'border-border bg-surface'
 } ${isReorderSource ? 'opacity-50' : ''}`}
 >
 <div
 draggable
 onDragStart={(e) => {
 onReorderStart()
 e.dataTransfer.effectAllowed = 'move'
 }}
 onDragEnd={onReorderEnd}
 className="px-2 py-1 border-b border-border flex-shrink-0 cursor-grab active:cursor-grabbing"
 title="Drag to reorder"
 >
 <div className="flex items-start gap-1">
 <GripVertical
 size={10}
 className="text-fg-faint dark:text-fg-muted mt-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
 />
 <button
 type="button"
 onClick={(e) => {
 e.stopPropagation()
 onCycleImportance()
 }}
 title={`Importance: ${project.importance} (click to cycle)`}
 className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${IMPORTANCE_DOT[project.importance] ?? IMPORTANCE_DOT.medium}`}
 draggable={false}
 onDragStart={(e) => e.preventDefault()}
 />
 <button
 type="button"
 onClick={(e) => {
 e.stopPropagation()
 onOpenNotes()
 }}
 title="Open notes"
 className="min-w-0 flex-1 text-left rounded hover:bg-inset/40 -mx-1 px-1 py-0.5 transition-colors"
 draggable={false}
 onDragStart={(e) => e.preventDefault()}
 >
 <h3
 className="text-[11px] font-semibold text-fg truncate leading-tight"
 title={title}
 >
 {title}
 </h3>
 <p className="text-[9px] text-fg-subtle leading-tight">
 {people.length} {people.length === 1 ? 'person' : 'people'}
 </p>
 </button>
 <button
 onClick={(e) => {
 e.stopPropagation()
 onHide()
 }}
 title="Hide from board"
 className="opacity-0 group-hover:opacity-100 text-fg-subtle hover:text-fg-muted dark:hover:text-fg-faint transition-opacity flex-shrink-0 mt-0.5"
 draggable={false}
 onDragStart={(e) => e.preventDefault()}
 >
 <EyeOff size={11} />
 </button>
 </div>
 </div>
 <div className="flex-1 overflow-y-auto p-1.5 space-y-1 min-h-0">
 {people.length === 0 ? (
 <div className="text-[10px] text-fg-faint dark:text-fg-muted italic text-center py-2">
 Drop here
 </div>
 ) : (
 people.map((person) => (
 <div
 key={person.id}
 className="group/row flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-app/60 text-xs"
 >
 <div className="w-4 h-4 rounded-full bg-accent-2 text-accent-fg flex items-center justify-center text-[9px] font-bold flex-shrink-0">
 {person.name.charAt(0).toUpperCase()}
 </div>
 <span className="flex-1 truncate text-fg">
 {person.name}
 </span>
 <button
 onClick={() => onRemove(person)}
 title="Remove from project"
 className="opacity-0 group-hover/row:opacity-100 text-fg-subtle hover:text-danger transition-opacity"
 >
 <X size={10} />
 </button>
 </div>
 ))
 )}
 </div>
 {notesOpen && (
 <FloatingNotes project={project} title={title} onClose={onCloseNotes} />
 )}
 </div>
 )
}
