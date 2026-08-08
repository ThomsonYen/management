import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useHotkeys, useTheme } from '../SettingsContext'
import { useHotkey } from '../hooks/useHotkey'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import MDEditor from '@uiw/react-md-editor'
import type { Root, ListItem, Paragraph, Text } from 'mdast'
import { visit } from 'unist-util-visit'
import {
 ArrowLeft,
 Trash2,
 Users,
 FolderKanban,
 CheckSquare,
 X,
 Mic,
 Sparkles,
 Loader2,
 Check,
 Pencil,
 AlertTriangle,
} from 'lucide-react'
import type { Person, Project } from '../types'
import DatePicker from '../components/DatePicker'
import { useSuggestedNotes } from '../SuggestedNotesContext'
import {
 fetchNote,
 updateNote,
 deleteNote,
 fetchPersons,
 fetchProjects,
 fetchTodos,
 suggestNoteTodos,
 createTodo,
} from '../api'
import AudioRecorder from '../components/AudioRecorder'
import AudioFileList from '../components/AudioFileList'
import TranscriptEditor from '../components/TranscriptEditor'
import { createMdEditorKeyHandler } from '../utils/mdEditorKeyHandler'
import { remarkHashtag } from '../utils/remarkHashtag'
import { extractTags } from '../utils/markdownTags'
import TagPill from '../components/TagPill'

function remarkFixEmptyTasks() {
 return (tree: Root) => {
 visit(tree, 'listItem', (node: ListItem) => {
 if (node.checked != null) return
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

export default function NoteDetailPage() {
 const { id } = useParams<{ id: string }>()
 const navigate = useNavigate()
 const queryClient = useQueryClient()
 const { theme } = useTheme()
 const noteId = parseInt(id!)
 const { bindings } = useHotkeys()
 const editorKeyDown = useMemo(() => createMdEditorKeyHandler(bindings), [bindings])

 const { data: note, isLoading, dataUpdatedAt } = useQuery({
 queryKey: ['note', noteId],
 queryFn: () => fetchNote(noteId),
 staleTime: 0,
 gcTime: 0,
 refetchOnMount: 'always',
 })
 const isMeeting = note?.kind === 'meeting'
 const listPath = isMeeting ? '/meeting-notes' : '/notes'

 useHotkey(bindings.escape, useCallback(() => {
 navigate(listPath)
 }, [navigate, listPath]), { skipInputCheck: true })

 // Meeting-side state (only used when isMeeting)
 const { data: persons = [] } = useQuery({
 queryKey: ['persons'],
 queryFn: fetchPersons,
 enabled: isMeeting,
 })
 const { data: projects = [] } = useQuery({
 queryKey: ['projects'],
 queryFn: fetchProjects,
 enabled: isMeeting,
 })
 const { data: allTodos = [] } = useQuery({
 queryKey: ['todos'],
 queryFn: () => fetchTodos(),
 enabled: isMeeting,
 })

 const [title, setTitle] = useState('')
 const [date, setDate] = useState('')
 const [content, setContent] = useState('')
 const [attendeeIds, setAttendeeIds] = useState<number[]>([])
 const [projectIds, setProjectIds] = useState<number[]>([])
 const [todoIds, setTodoIds] = useState<number[]>([])
 const appliedAtRef = useRef(0)

 useEffect(() => {
 if (note && dataUpdatedAt > appliedAtRef.current) {
 appliedAtRef.current = dataUpdatedAt
 setTitle(note.title)
 setDate(note.date ?? '')
 setContent(note.content)
 setAttendeeIds(note.attendee_ids ?? [])
 setProjectIds(note.project_ids ?? [])
 setTodoIds(note.todo_ids ?? [])
 }
 }, [note, dataUpdatedAt])

 const saveNote = useCallback(
 (data: Parameters<typeof updateNote>[1]) => {
 updateNote(noteId, data).then(() => {
 queryClient.invalidateQueries({ queryKey: ['notes'] })
 })
 },
 [noteId, queryClient],
 )

 const deleteMutation = useMutation({
 mutationFn: () => deleteNote(noteId),
 onSuccess: () => {
 queryClient.invalidateQueries({ queryKey: ['notes'] })
 queryClient.invalidateQueries({ queryKey: ['tags'] })
 navigate(listPath)
 },
 })

 // Debounced content save (writes file + re-extracts tags on the backend)
 const contentTimerRef = useRef<ReturnType<typeof setTimeout>>()
 const pendingContentRef = useRef<string | null>(null)
 const contentUnavailable = note?.content_unavailable ?? false
 const handleContentChange = useCallback(
 (val: string | undefined) => {
 // The body could not be read, so `content` is blank rather than actual.
 // Saving would truncate the real file the moment its vault reappears.
 if (contentUnavailable) return
 const newContent = val ?? ''
 setContent(newContent)
 pendingContentRef.current = newContent
 if (contentTimerRef.current) clearTimeout(contentTimerRef.current)
 contentTimerRef.current = setTimeout(() => {
 pendingContentRef.current = null
 updateNote(noteId, { content: newContent }).then(() => {
 queryClient.invalidateQueries({ queryKey: ['notes'] })
 queryClient.invalidateQueries({ queryKey: ['tags'] })
 })
 }, 1000)
 },
 [noteId, queryClient, contentUnavailable],
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
 updateNote(noteId, { content: pending })
 }
 }
 }, [noteId])

 const saveField = (field: string, value: unknown) => {
 saveNote({ [field]: value })
 }

 // Debounced title save — also triggers the backend's on-disk file rename.
 const titleTimerRef = useRef<ReturnType<typeof setTimeout>>()
 const saveTitleNow = (val: string) => {
 if (note && val.trim() && val !== note.title) {
 updateNote(noteId, { title: val.trim() }).then(() => {
 queryClient.invalidateQueries({ queryKey: ['notes'] })
 queryClient.invalidateQueries({ queryKey: ['note', noteId] })
 })
 }
 }
 const handleTitleChange = (next: string) => {
 setTitle(next)
 if (titleTimerRef.current) clearTimeout(titleTimerRef.current)
 titleTimerRef.current = setTimeout(() => saveTitleNow(next), 1500)
 }
 const handleTitleBlur = () => {
 if (titleTimerRef.current) {
 clearTimeout(titleTimerRef.current)
 titleTimerRef.current = undefined
 }
 saveTitleNow(title)
 }

 useEffect(() => {
 return () => {
 if (titleTimerRef.current) clearTimeout(titleTimerRef.current)
 }
 }, [])

 const handleDateChange = (newDate: string) => {
 setDate(newDate)
 saveField('date', newDate)
 }

 const toggleAttendee = (personId: number) => {
 const next = attendeeIds.includes(personId)
 ? attendeeIds.filter((x) => x !== personId)
 : [...attendeeIds, personId]
 setAttendeeIds(next)
 saveField('attendee_ids', next)
 }

 const toggleProject = (projectId: number) => {
 const next = projectIds.includes(projectId)
 ? projectIds.filter((x) => x !== projectId)
 : [...projectIds, projectId]
 setProjectIds(next)
 saveField('project_ids', next)
 }

 const removeTodo = (todoId: number) => {
 const next = todoIds.filter((x) => x !== todoId)
 setTodoIds(next)
 saveField('todo_ids', next)
 }

 // Hashtag links rendered by remarkHashtag have /notes?tag= hrefs.
 const handlePreviewClick = useCallback(
 (e: React.MouseEvent<HTMLDivElement>) => {
 const link = (e.target as HTMLElement).closest('a.md-hashtag') as HTMLAnchorElement | null
 if (!link) return
 const href = link.getAttribute('href')
 if (!href || !href.startsWith('/')) return
 e.preventDefault()
 navigate(href)
 },
 [navigate],
 )

 const localTags = useMemo(() => extractTags(content), [content])

 if (isLoading || !appliedAtRef.current) {
 return <div className="p-6 text-fg-subtle">Loading...</div>
 }

 return (
 <div className="block md:flex md:h-full">
 <div className="flex-1 flex flex-col min-w-0 overflow-auto">
 <div className="p-4 md:p-6 pb-3 md:pb-3 flex items-center gap-3">
 <button
 onClick={() => navigate(listPath)}
 className="p-1.5 rounded-lg text-fg-subtle hover:text-fg-muted dark:hover:text-fg hover:bg-inset dark:hover:bg-elevated transition-colors"
 >
 <ArrowLeft size={18} />
 </button>
 <input
 value={title}
 onChange={(e) => handleTitleChange(e.target.value)}
 onBlur={handleTitleBlur}
 className="flex-1 min-w-0 text-xl font-bold bg-transparent border-none outline-none text-fg placeholder:text-fg-faint"
 placeholder={isMeeting ? 'Meeting title...' : 'Note title...'}
 />
 {isMeeting && (
 <DatePicker
 value={date}
 onChange={handleDateChange}
 variant="input"
 triggerClassName="!px-2 !py-1 !text-sm"
 />
 )}
 <button
 onClick={() => {
 if (confirm(`Delete this ${isMeeting ? 'meeting note' : 'note'}?`)) deleteMutation.mutate()
 }}
 className="p-1.5 rounded-lg text-fg-subtle hover:text-danger hover:bg-danger-bg transition-colors"
 >
 <Trash2 size={16} />
 </button>
 </div>

 {note && (note.vault_root_path || note.relative_path) && (
 <div className="px-6 pb-1 flex items-center gap-1 text-[11px] font-mono text-fg-subtle truncate">
 <span className="text-fg-faint dark:text-fg-muted">file:</span>
 <span className="truncate" title={`${note.vault_root_path ?? ''}/${note.relative_path ?? note.filename ?? ''}`}>
 {note.vault_root_path ? `${note.vault_root_path}/` : ''}
 {note.relative_path ?? note.filename ?? ''}
 </span>
 {note.vault_name && (
 <span className="ml-2 px-1.5 py-0.5 rounded bg-inset text-fg-muted text-[10px] uppercase tracking-wider">
 {note.vault_name}
 </span>
 )}
 </div>
 )}

 {note?.content_unavailable && (
 <div className="mx-6 mb-2 flex items-start gap-2 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
 <AlertTriangle size={14} className="mt-0.5 shrink-0" />
 <span>
 This note&rsquo;s vault{note.vault_name ? ` (${note.vault_name})` : ''} is not
 reachable from the server, so its content cannot be loaded. The note is
 <strong> not empty</strong> &mdash; editing is disabled to avoid overwriting it.
 {note.vault_root_path && (
 <> Expected at <code className="font-mono">{note.vault_root_path}</code>.</>
 )}
 </span>
 </div>
 )}

 {localTags.length > 0 && (
 <div className="px-6 pb-2 flex flex-wrap gap-1.5">
 {localTags.map((t) => (
 <TagPill key={t} name={t} size="sm" />
 ))}
 </div>
 )}

 <div
 className="flex-1 px-6 pb-3"
 data-color-mode={theme}
 onKeyDownCapture={editorKeyDown}
 onClick={handlePreviewClick}
 >
 <MDEditor
 value={content}
 onChange={handleContentChange}
 height="100%"
 style={{ minHeight: 500 }}
 preview={note?.content_unavailable ? 'preview' : 'live'}
 visibleDragbar={false}
 previewOptions={{ remarkPlugins: [remarkFixEmptyTasks, remarkHashtag] }}
 />
 </div>

 {isMeeting && (
 <div className="px-6 pb-6">
 <TranscriptEditor
 noteId={noteId}
 transcript={note?.transcript ?? null}
 hasAudio={(note?.audio_files ?? []).length > 0}
 onSave={(t) => saveNote({ transcript: t })}
 />
 </div>
 )}
 </div>

 {isMeeting && (
 <div className="w-full md:w-72 border-t md:border-t-0 md:border-l border-border bg-app overflow-y-auto flex-shrink-0 p-4 space-y-6">
 <div>
 <h3 className="text-xs font-semibold text-fg-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
 <Users size={12} /> Attendees
 </h3>
 <div className="flex flex-wrap gap-1.5">
 {persons.map((p) => (
 <button
 key={p.id}
 onClick={() => toggleAttendee(p.id)}
 className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
 attendeeIds.includes(p.id)
 ? 'bg-accent-1 text-accent-fg border-accent-2 dark:border-accent-hover'
 : 'bg-surface text-fg-muted border-border hover:border-accent-2'
 }`}
 >
 {p.name}
 </button>
 ))}
 </div>
 </div>

 <div>
 <h3 className="text-xs font-semibold text-fg-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
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
 : 'bg-surface text-fg-muted border-border hover:border-purple-300'
 }`}
 >
 {p.name}
 </button>
 ))}
 </div>
 </div>

 <div>
 <h3 className="text-xs font-semibold text-fg-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
 <CheckSquare size={12} /> Linked Todos
 </h3>
 {todoIds.length > 0 && (
 <div className="space-y-1 mb-2">
 {todoIds.map((tid) => {
 const todo = allTodos.find((t) => t.id === tid)
 return (
 <div key={tid} className="flex items-center gap-1.5 text-xs text-fg-muted bg-surface rounded px-2 py-1 border border-border">
 <span className="text-fg-subtle">#{tid}</span>
 <span className="flex-1 truncate">{todo?.title ?? 'Unknown'}</span>
 <button onClick={() => removeTodo(tid)} className="text-fg-subtle hover:text-danger flex-shrink-0">
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
 <SuggestTodosButton
 noteId={noteId}
 projectIds={projectIds}
 persons={persons}
 projects={projects}
 onTodosCreated={(newIds) => {
 const next = [...todoIds, ...newIds]
 setTodoIds(next)
 saveField('todo_ids', next)
 queryClient.invalidateQueries({ queryKey: ['todos'] })
 }}
 />
 </div>

 <div>
 <h3 className="text-xs font-semibold text-fg-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
 <Mic size={12} /> Audio
 </h3>
 <AudioRecorder noteId={noteId} />
 <AudioFileList noteId={noteId} files={note?.audio_files ?? []} />
 </div>
 </div>
 )}
 </div>
 )
}

// ─── Meeting-only helper components (ported from MeetingNoteDetailPage) ──────

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
 className="w-full text-xs border border-border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent placeholder:text-fg-faint dark:placeholder:text-fg-faint "
 />
 {open && filtered.length > 0 && (
 <ul className="absolute z-10 left-0 right-0 mt-1 max-h-40 overflow-y-auto bg-surface border border-border rounded-lg shadow-lg">
 {filtered.map((t) => (
 <li
 key={t.id}
 onMouseDown={() => { onSelect(t.id); setSearch(''); setOpen(false) }}
 className="px-2.5 py-1.5 text-xs cursor-pointer hover:bg-accent-1 dark:hover:bg-accent-1 flex items-center gap-1.5"
 >
 <span className="text-fg-subtle">#{t.id}</span>
 <span className="flex-1 truncate text-fg">{t.title}</span>
 <span className="text-fg-subtle capitalize">{t.status}</span>
 </li>
 ))}
 </ul>
 )}
 </div>
 )
}

interface TodoDraft {
 title: string
 description: string
 project_id?: number
 assignee_id?: number | null
 deadline: string
 importance: string
 estimated_hours: number
}

interface SuggestionsCache {
 suggestions: { title: string; description: string }[]
 createdIndices: number[]
}

function SuggestTodosButton({
 noteId,
 projectIds,
 persons,
 projects,
 onTodosCreated,
}: {
 noteId: number
 projectIds: number[]
 persons: Person[]
 projects: Project[]
 onTodosCreated: (newTodoIds: number[]) => void
}) {
 const queryClient = useQueryClient()
 const { markSuggested } = useSuggestedNotes()

 const { data: cached, isFetching, refetch } = useQuery<SuggestionsCache>({
 queryKey: ['suggest-todos', noteId],
 queryFn: async () => {
 const res = await suggestNoteTodos(noteId)
 markSuggested(noteId)
 return { suggestions: res.suggestions, createdIndices: [] }
 },
 enabled: false,
 staleTime: Infinity,
 gcTime: 30 * 60 * 1000,
 })

 const suggestions = cached?.suggestions ?? []
 const createdIndices = cached?.createdIndices ?? []

 const handleSuggest = () => {
 queryClient.setQueryData(['suggest-todos', noteId], undefined)
 refetch()
 }

 const markCreated = (idx: number) => {
 queryClient.setQueryData<SuggestionsCache>(['suggest-todos', noteId], (old) => {
 if (!old) return old
 return { ...old, createdIndices: [...old.createdIndices, idx] }
 })
 }

 const handleDismiss = (idx: number) => {
 queryClient.setQueryData<SuggestionsCache>(['suggest-todos', noteId], (old) => {
 if (!old) return old
 return {
 suggestions: old.suggestions.filter((_, i) => i !== idx),
 createdIndices: old.createdIndices.filter((i) => i !== idx).map((i) => (i > idx ? i - 1 : i)),
 }
 })
 }

 const [editingIdx, setEditingIdx] = useState<number | null>(null)
 const [editDraft, setEditDraft] = useState<TodoDraft | null>(null)
 const [saving, setSaving] = useState(false)

 const openEdit = (idx: number) => {
 const s = suggestions[idx]
 setEditingIdx(idx)
 setEditDraft({
 title: s.title,
 description: s.description,
 project_id: projectIds[0],
 assignee_id: null,
 deadline: '',
 importance: 'medium',
 estimated_hours: 1.0,
 })
 }

 const handleSave = async () => {
 if (!editDraft || editingIdx === null || saving) return
 setSaving(true)
 try {
 const todo = await createTodo({
 title: editDraft.title,
 description: editDraft.description || undefined,
 project_id: editDraft.project_id,
 assignee_id: editDraft.assignee_id,
 deadline: editDraft.deadline || undefined,
 importance: editDraft.importance,
 estimated_hours: editDraft.estimated_hours,
 })
 markCreated(editingIdx)
 onTodosCreated([todo.id])
 setEditingIdx(null)
 setEditDraft(null)
 } finally {
 setSaving(false)
 }
 }

 const handleAcceptAll = async () => {
 const pending = suggestions.map((_, i) => i).filter((i) => !createdIndices.includes(i))
 const newIds: number[] = []
 for (const idx of pending) {
 const s = suggestions[idx]
 const todo = await createTodo({
 title: s.title,
 description: s.description || undefined,
 project_id: projectIds[0],
 })
 newIds.push(todo.id)
 markCreated(idx)
 }
 if (newIds.length > 0) onTodosCreated(newIds)
 }

 const pendingCount = suggestions.length - createdIndices.length

 return (
 <div className="mt-3">
 <button
 onClick={handleSuggest}
 disabled={isFetching}
 className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-warning bg-warning-bg border border-warning/30 rounded-lg hover:bg-warning-bg disabled:opacity-50 transition-colors"
 >
 {isFetching ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
 {isFetching ? 'Analyzing...' : suggestions.length > 0 ? 'Re-suggest Todos' : 'Suggest Todos from Content'}
 </button>

 {suggestions.length > 0 && (
 <div className="mt-2 space-y-1.5">
 <div className="flex items-center justify-between">
 <span className="text-xs text-fg-muted">{pendingCount} suggestion{pendingCount !== 1 ? 's' : ''}</span>
 {pendingCount > 1 && (
 <button
 onClick={handleAcceptAll}
 className="text-xs text-accent hover:underline"
 >
 Accept all
 </button>
 )}
 </div>
 {suggestions.map((s, idx) => {
 const isCreated = createdIndices.includes(idx)
 return (
 <div
 key={idx}
 className={`p-2 rounded-lg border text-xs transition-all ${
 isCreated
 ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 opacity-60'
 : 'bg-surface border-border cursor-pointer hover:border-accent-2 dark:hover:border-accent'
 }`}
 onClick={() => !isCreated && openEdit(idx)}
 >
 <div className="flex items-start gap-1.5">
 <span className="flex-1 font-medium text-fg">{s.title}</span>
 {isCreated ? (
 <Check size={12} className="text-emerald-500 flex-shrink-0 mt-0.5" />
 ) : (
 <div className="flex gap-1 flex-shrink-0">
 <button
 onClick={(e) => { e.stopPropagation(); openEdit(idx) }}
 className="p-0.5 text-fg-subtle hover:text-accent"
 title="Edit & create"
 >
 <Pencil size={12} />
 </button>
 <button
 onClick={(e) => { e.stopPropagation(); handleDismiss(idx) }}
 className="p-0.5 text-fg-subtle hover:text-danger"
 title="Dismiss"
 >
 <X size={12} />
 </button>
 </div>
 )}
 </div>
 {s.description && (
 <p className="mt-1 text-fg-muted">{s.description}</p>
 )}
 </div>
 )
 })}
 </div>
 )}

 {editDraft && editingIdx !== null && (
 <TodoEditModal
 draft={editDraft}
 persons={persons}
 projects={projects}
 saving={saving}
 onChange={setEditDraft}
 onSave={handleSave}
 onClose={() => { setEditingIdx(null); setEditDraft(null) }}
 />
 )}
 </div>
 )
}

function TodoEditModal({
 draft,
 persons,
 projects,
 saving,
 onChange,
 onSave,
 onClose,
}: {
 draft: TodoDraft
 persons: Person[]
 projects: Project[]
 saving: boolean
 onChange: (d: TodoDraft) => void
 onSave: () => void
 onClose: () => void
}) {
 const update = (patch: Partial<TodoDraft>) => onChange({ ...draft, ...patch })

 return (
 <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
 <div className="absolute inset-0 bg-black/40" />
 <div
 className="relative bg-surface rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
 onClick={(e) => e.stopPropagation()}
 >
 <div className="flex items-center justify-between px-5 py-4 border-b border-border">
 <h3 className="text-base font-semibold text-fg flex items-center gap-2">
 <Sparkles size={16} className="text-warning" />
 Edit Suggested Todo
 </h3>
 <button onClick={onClose} className="p-1 text-fg-subtle hover:text-fg-muted dark:hover:text-fg">
 <X size={18} />
 </button>
 </div>

 <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
 <div>
 <label className="block text-xs font-medium text-fg-muted mb-1">Title</label>
 <input
 value={draft.title}
 onChange={(e) => update({ title: e.target.value })}
 className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface text-fg focus:outline-none focus:ring-2 focus:ring-accent"
 placeholder="Todo title..."
 />
 </div>

 <div>
 <label className="block text-xs font-medium text-fg-muted mb-1">Description</label>
 <textarea
 value={draft.description}
 onChange={(e) => update({ description: e.target.value })}
 rows={3}
 className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface text-fg focus:outline-none focus:ring-2 focus:ring-accent resize-none"
 placeholder="Description..."
 />
 </div>

 <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
 <div>
 <label className="block text-xs font-medium text-fg-muted mb-1">Project</label>
 <select
 value={draft.project_id ?? ''}
 onChange={(e) => update({ project_id: e.target.value ? parseInt(e.target.value) : undefined })}
 className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface text-fg focus:outline-none focus:ring-2 focus:ring-accent"
 >
 <option value="">None</option>
 {projects.map((p) => (
 <option key={p.id} value={p.id}>{p.name}</option>
 ))}
 </select>
 </div>

 <div>
 <label className="block text-xs font-medium text-fg-muted mb-1">Assignee</label>
 <select
 value={draft.assignee_id ?? ''}
 onChange={(e) => update({ assignee_id: e.target.value ? parseInt(e.target.value) : null })}
 className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface text-fg focus:outline-none focus:ring-2 focus:ring-accent"
 >
 <option value="">Unassigned</option>
 {persons.map((p) => (
 <option key={p.id} value={p.id}>{p.name}</option>
 ))}
 </select>
 </div>

 <div>
 <label className="block text-xs font-medium text-fg-muted mb-1">Importance</label>
 <select
 value={draft.importance}
 onChange={(e) => update({ importance: e.target.value })}
 className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface text-fg focus:outline-none focus:ring-2 focus:ring-accent"
 >
 <option value="low">Low</option>
 <option value="medium">Medium</option>
 <option value="high">High</option>
 </select>
 </div>

 <div>
 <label className="block text-xs font-medium text-fg-muted mb-1">Est. Hours</label>
 <input
 type="number"
 min={0}
 step={0.5}
 value={draft.estimated_hours}
 onChange={(e) => update({ estimated_hours: parseFloat(e.target.value) || 0 })}
 className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface text-fg focus:outline-none focus:ring-2 focus:ring-accent"
 />
 </div>
 </div>

 <div>
 <label className="block text-xs font-medium text-fg-muted mb-1">Deadline</label>
 <DatePicker
 value={draft.deadline}
 onChange={(v) => update({ deadline: v })}
 variant="input"
 placeholder="No deadline"
 className="w-full"
 />
 </div>
 </div>

 <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border bg-app">
 <button
 onClick={onClose}
 className="px-4 py-2 text-sm text-fg-muted hover:text-fg dark:hover:text-fg border border-border rounded-lg hover:bg-inset dark:hover:bg-elevated transition-colors"
 >
 Cancel
 </button>
 <button
 onClick={onSave}
 disabled={saving || !draft.title.trim()}
 className="px-4 py-2 text-sm font-medium text-white bg-accent rounded-lg hover:bg-accent-hover disabled:opacity-50 transition-colors flex items-center gap-1.5"
 >
 {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
 {saving ? 'Creating...' : 'Create Todo'}
 </button>
 </div>
 </div>
 </div>
 )
}
