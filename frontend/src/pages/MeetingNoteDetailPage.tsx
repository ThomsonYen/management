import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import MDEditor from '@uiw/react-md-editor'
import type { Root, ListItem, Paragraph, Text } from 'mdast'
import { visit } from 'unist-util-visit'
import { ArrowLeft, Trash2, Users, FolderKanban, CheckSquare, X } from 'lucide-react'
import {
  fetchMeetingNote,
  updateMeetingNote,
  deleteMeetingNote,
  fetchPersons,
  fetchProjects,
  fetchTodos,
} from '../api'
import { useTheme } from '../ThemeContext'

/**
 * remark plugin: remark-gfm won't parse `- [ ]` (no text after) as a task list item.
 * This walks the AST and converts list items whose only content is literal "[ ]" or "[x]"
 * into proper checked/unchecked task list items.
 */
function remarkFixEmptyTasks() {
  return (tree: Root) => {
    visit(tree, 'listItem', (node: ListItem) => {
      if (node.checked != null) return // already a task list item
      const para = node.children[0]
      if (!para || para.type !== 'paragraph' || para.children.length !== 1) return
      const text = para.children[0]
      if (text.type !== 'text') return
      const val = text.value.trim()
      if (val === '[ ]') {
        node.checked = false
        ;(para as Paragraph).children = [{ type: 'text', value: ' ' } as Text]
      } else if (val === '[x]' || val === '[X]') {
        node.checked = true
        ;(para as Paragraph).children = [{ type: 'text', value: ' ' } as Text]
      }
    })
  }
}

export default function MeetingNoteDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { theme } = useTheme()
  const noteId = parseInt(id!)

  const { data: note, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ['meeting-note', noteId],
    queryFn: () => fetchMeetingNote(noteId),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  })
  const { data: persons = [] } = useQuery({ queryKey: ['persons'], queryFn: fetchPersons })
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: fetchProjects })
  const { data: allTodos = [] } = useQuery({ queryKey: ['todos'], queryFn: () => fetchTodos() })

  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [content, setContent] = useState('')
  const [attendeeIds, setAttendeeIds] = useState<number[]>([])
  const [projectIds, setProjectIds] = useState<number[]>([])
  const [todoIds, setTodoIds] = useState<number[]>([])
  const appliedAtRef = useRef(0)

  // Populate state whenever a fresh fetch completes (not from cache)
  useEffect(() => {
    if (note && dataUpdatedAt > appliedAtRef.current) {
      appliedAtRef.current = dataUpdatedAt
      setTitle(note.title)
      setDate(note.date)
      setContent(note.content)
      setAttendeeIds(note.attendee_ids)
      setProjectIds(note.project_ids)
      setTodoIds(note.todo_ids)
    }
  }, [note, dataUpdatedAt])

  const saveNote = useCallback(
    (data: Parameters<typeof updateMeetingNote>[1]) => {
      updateMeetingNote(noteId, data).then(() => {
        queryClient.invalidateQueries({ queryKey: ['meeting-notes'] })
      })
    },
    [noteId, queryClient],
  )

  const deleteMutation = useMutation({
    mutationFn: () => deleteMeetingNote(noteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting-notes'] })
      navigate('/meeting-notes')
    },
  })

  // Debounced content save
  const contentTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const pendingContentRef = useRef<string | null>(null)
  const handleContentChange = useCallback(
    (val: string | undefined) => {
      const newContent = val ?? ''
      setContent(newContent)
      pendingContentRef.current = newContent
      if (contentTimerRef.current) clearTimeout(contentTimerRef.current)
      contentTimerRef.current = setTimeout(() => {
        pendingContentRef.current = null
        updateMeetingNote(noteId, { content: newContent })
      }, 1000)
    },
    [noteId],
  )

  // Flush pending content save on unmount
  useEffect(() => {
    return () => {
      if (contentTimerRef.current) {
        clearTimeout(contentTimerRef.current)
        contentTimerRef.current = undefined
      }
      if (pendingContentRef.current !== null) {
        const pending = pendingContentRef.current
        pendingContentRef.current = null
        updateMeetingNote(noteId, { content: pending })
      }
    }
  }, [noteId])

  const saveField = (field: string, value: unknown) => {
    saveNote({ [field]: value })
  }

  const handleTitleBlur = () => {
    if (note && title !== note.title && title.trim()) {
      saveField('title', title.trim())
    }
  }

  const handleDateChange = (newDate: string) => {
    setDate(newDate)
    saveField('date', newDate)
  }

  const toggleAttendee = (personId: number) => {
    const next = attendeeIds.includes(personId) ? attendeeIds.filter((x) => x !== personId) : [...attendeeIds, personId]
    setAttendeeIds(next)
    saveField('attendee_ids', next)
  }

  const toggleProject = (projectId: number) => {
    const next = projectIds.includes(projectId) ? projectIds.filter((x) => x !== projectId) : [...projectIds, projectId]
    setProjectIds(next)
    saveField('project_ids', next)
  }

  const removeTodo = (todoId: number) => {
    const next = todoIds.filter((x) => x !== todoId)
    setTodoIds(next)
    saveField('todo_ids', next)
  }

  if (isLoading || !appliedAtRef.current) {
    return <div className="p-6 text-slate-400">Loading...</div>
  }

  return (
    <div className="flex h-full">
      {/* Main editor area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-auto">
        <div className="p-6 pb-3 flex items-center gap-3">
          <button
            onClick={() => navigate('/meeting-notes')}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleTitleBlur}
            className="flex-1 text-xl font-bold bg-transparent border-none outline-none text-slate-800 dark:text-slate-100 placeholder-slate-300"
            placeholder="Meeting title..."
          />
          <input
            type="date"
            value={date}
            onChange={(e) => handleDateChange(e.target.value)}
            className="px-2 py-1 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <button
            onClick={() => {
              if (confirm('Delete this meeting note?')) deleteMutation.mutate()
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <Trash2 size={16} />
          </button>
        </div>

        <div className="flex-1 px-6 pb-6" data-color-mode={theme}>
          <MDEditor
            value={content}
            onChange={handleContentChange}
            height="100%"
            style={{ minHeight: 500 }}
            preview="live"
            visibleDragbar={false}
            previewOptions={{ remarkPlugins: [remarkFixEmptyTasks] }}
          />
        </div>
      </div>

      {/* Right sidebar */}
      <div className="w-72 border-l border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 overflow-y-auto flex-shrink-0 p-4 space-y-6">
        {/* Attendees */}
        <div>
          <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Users size={12} /> Attendees
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {persons.map((p) => (
              <button
                key={p.id}
                onClick={() => toggleAttendee(p.id)}
                className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
                  attendeeIds.includes(p.id)
                    ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700'
                    : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-indigo-300'
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        {/* Projects */}
        <div>
          <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <FolderKanban size={12} /> Projects
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => toggleProject(p.id)}
                className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
                  projectIds.includes(p.id)
                    ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-700'
                    : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-purple-300'
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        {/* Linked Todos */}
        <div>
          <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <CheckSquare size={12} /> Linked Todos
          </h3>
          {todoIds.length > 0 && (
            <div className="space-y-1 mb-2">
              {todoIds.map((tid) => {
                const todo = allTodos.find((t) => t.id === tid)
                return (
                  <div key={tid} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 rounded px-2 py-1 border border-slate-200 dark:border-slate-700">
                    <span className="text-slate-400">#{tid}</span>
                    <span className="flex-1 truncate">{todo?.title ?? 'Unknown'}</span>
                    <button onClick={() => removeTodo(tid)} className="text-slate-400 hover:text-red-500 flex-shrink-0">
                      <X size={12} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
          <TodoPicker
            allTodos={allTodos}
            excludeIds={todoIds}
            onSelect={(tid) => {
              const next = [...todoIds, tid]
              setTodoIds(next)
              saveField('todo_ids', next)
            }}
          />
        </div>
      </div>
    </div>
  )
}

function TodoPicker({
  allTodos,
  excludeIds,
  onSelect,
}: {
  allTodos: { id: number; title: string; status: string }[]
  excludeIds: number[]
  onSelect: (id: number) => void
}) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const trimmed = search.trim().toLowerCase()
  const filtered = trimmed
    ? allTodos.filter((t) => !excludeIds.includes(t.id) && t.title.toLowerCase().includes(trimmed)).slice(0, 10)
    : []

  return (
    <div className="relative">
      <input
        type="text"
        value={search}
        onChange={(e) => { setSearch(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search todos to link..."
        className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-slate-400 dark:placeholder-slate-500 dark:bg-slate-800 dark:text-slate-100"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-10 left-0 right-0 mt-1 max-h-40 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg">
          {filtered.map((t) => (
            <li
              key={t.id}
              onMouseDown={() => { onSelect(t.id); setSearch(''); setOpen(false) }}
              className="px-2.5 py-1.5 text-xs cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/30 flex items-center gap-1.5"
            >
              <span className="text-slate-400">#{t.id}</span>
              <span className="flex-1 truncate text-slate-700 dark:text-slate-300">{t.title}</span>
              <span className="text-slate-400 capitalize">{t.status}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
