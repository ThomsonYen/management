import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Eye, EyeOff, X } from 'lucide-react'
import { fetchPersons, fetchProjects, updatePerson } from '../api'
import type { Person, Project } from '../types'

const HIDDEN_STORAGE_KEY = 'peopleBoardHiddenProjectIds'

function loadHiddenIds(): number[] {
  try {
    const raw = localStorage.getItem(HIDDEN_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((n): n is number => typeof n === 'number') : []
  } catch {
    return []
  }
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
  const [hidden, setHidden] = useState<number[]>(loadHiddenIds)
  const [popoverOpen, setPopoverOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    localStorage.setItem(HIDDEN_STORAGE_KEY, JSON.stringify(hidden))
  }, [hidden])

  // Prune IDs for projects that no longer exist (deleted/archived).
  useEffect(() => {
    if (projects.length === 0) return
    const validIds = new Set(projects.map((p) => p.id))
    setHidden((prev) => {
      const filtered = prev.filter((id) => validIds.has(id))
      return filtered.length === prev.length ? prev : filtered
    })
  }, [projects])

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

  const hiddenSet = useMemo(() => new Set(hidden), [hidden])
  const visibleProjects = useMemo(
    () => projects.filter((p) => !hiddenSet.has(p.id)),
    [projects, hiddenSet],
  )
  const hiddenProjects = useMemo(
    () => projects.filter((p) => hiddenSet.has(p.id)),
    [projects, hiddenSet],
  )

  const dragPerson =
    dragPersonId !== null ? persons.find((p) => p.id === dragPersonId) : null

  const updateMutation = useMutation({
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

  const handleDrop = (projectId: number) => {
    setHoverCol(null)
    if (!dragPerson) return
    if (dragPerson.project_ids.includes(projectId)) return
    updateMutation.mutate({
      id: dragPerson.id,
      project_ids: [...dragPerson.project_ids, projectId],
    })
  }

  const removeAssignment = (person: Person, projectId: number) => {
    const nextIds = person.project_ids.filter((id) => id !== projectId)
    updateMutation.mutate({ id: person.id, project_ids: nextIds })
  }

  const hideProject = (projectId: number) => {
    setHidden((prev) => (prev.includes(projectId) ? prev : [...prev, projectId]))
  }

  const unhideProject = (projectId: number) => {
    setHidden((prev) => prev.filter((id) => id !== projectId))
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {hidden.length > 0 && (
        <div className="px-3 pt-2 flex items-center justify-end flex-shrink-0 relative">
          <div ref={popoverRef} className="relative">
            <button
              onClick={() => setPopoverOpen((v) => !v)}
              className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              title="Show hidden projects"
            >
              <EyeOff size={12} />
              Hidden ({hidden.length})
              <ChevronDown size={11} className={popoverOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
            </button>
            {popoverOpen && (
              <div className="absolute right-0 top-full mt-1 z-20 w-56 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1">
                <div className="max-h-64 overflow-y-auto">
                  {hiddenProjects.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => unhideProject(p.id)}
                      className="w-full flex items-center justify-between gap-2 px-2 py-1.5 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                      title="Show on board"
                    >
                      <span className="truncate text-left">{projectLabel(p)}</span>
                      <Eye size={11} className="text-slate-400 flex-shrink-0" />
                    </button>
                  ))}
                </div>
                {hiddenProjects.length >= 2 && (
                  <div className="border-t border-slate-200 dark:border-slate-700 mt-1 pt-1">
                    <button
                      onClick={() => {
                        setHidden([])
                        setPopoverOpen(false)
                      }}
                      className="w-full text-left px-2 py-1 text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-700"
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
          <div className="text-sm italic text-slate-400 dark:text-slate-500 px-2">
            No projects yet — create one to start assigning people.
          </div>
        ) : visibleProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-sm italic text-slate-400 dark:text-slate-500">
            All projects hidden.
            <button
              onClick={() => setPopoverOpen(true)}
              className="text-xs font-medium not-italic text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300"
            >
              Show hidden ({hidden.length})
            </button>
          </div>
        ) : (
          <div className="grid grid-rows-2 grid-flow-col auto-cols-[180px] gap-2 h-full overflow-x-auto overflow-y-hidden">
            {visibleProjects.map((proj) => {
              const alreadyMember =
                dragPerson?.project_ids.includes(proj.id) ?? false
              const canDrop = dragPerson != null && !alreadyMember
              return (
                <BoardColumn
                  key={proj.id}
                  title={projectLabel(proj)}
                  people={peopleByProject[proj.id]}
                  isHover={hoverCol === proj.id}
                  canDrop={canDrop}
                  onDragOverColumn={() => setHoverCol(proj.id)}
                  onDragLeaveColumn={() =>
                    setHoverCol((cur) => (cur === proj.id ? null : cur))
                  }
                  onDrop={() => handleDrop(proj.id)}
                  onRemove={(person) => removeAssignment(person, proj.id)}
                  onHide={() => hideProject(proj.id)}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function BoardColumn({
  title,
  people,
  isHover,
  canDrop,
  onDragOverColumn,
  onDragLeaveColumn,
  onDrop,
  onRemove,
  onHide,
}: {
  title: string
  people: Person[]
  isHover: boolean
  canDrop: boolean
  onDragOverColumn: () => void
  onDragLeaveColumn: () => void
  onDrop: () => void
  onRemove: (person: Person) => void
  onHide: () => void
}) {
  return (
    <div
      onDragOver={(e) => {
        if (!canDrop) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        onDragOverColumn()
      }}
      onDragLeave={onDragLeaveColumn}
      onDrop={(e) => {
        if (!canDrop) return
        e.preventDefault()
        onDrop()
      }}
      className={`group flex flex-col rounded-lg border overflow-hidden transition-colors min-h-0 ${
        isHover && canDrop
          ? 'border-indigo-400 bg-indigo-50/60 dark:bg-indigo-900/20'
          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
      }`}
    >
      <div className="px-2 py-1 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0">
            <h3
              className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 truncate leading-tight"
              title={title}
            >
              {title}
            </h3>
            <p className="text-[9px] text-slate-400 dark:text-slate-500 leading-tight">
              {people.length} {people.length === 1 ? 'person' : 'people'}
            </p>
          </div>
          <button
            onClick={onHide}
            title="Hide from board"
            className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-opacity flex-shrink-0 mt-0.5"
          >
            <EyeOff size={11} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-1.5 space-y-1 min-h-0">
        {people.length === 0 ? (
          <div className="text-[10px] text-slate-300 dark:text-slate-600 italic text-center py-2">
            Drop here
          </div>
        ) : (
          people.map((person) => (
            <div
              key={person.id}
              className="group/row flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-slate-50 dark:bg-slate-900/60 text-xs"
            >
              <div className="w-4 h-4 rounded-full bg-indigo-200 text-indigo-700 flex items-center justify-center text-[9px] font-bold flex-shrink-0">
                {person.name.charAt(0).toUpperCase()}
              </div>
              <span className="flex-1 truncate text-slate-700 dark:text-slate-200">
                {person.name}
              </span>
              <button
                onClick={() => onRemove(person)}
                title="Remove from project"
                className="opacity-0 group-hover/row:opacity-100 text-slate-400 hover:text-red-500 transition-opacity"
              >
                <X size={10} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
