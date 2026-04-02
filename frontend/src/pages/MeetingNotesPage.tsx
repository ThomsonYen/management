import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, FileText, Users, FolderKanban, X, Trash2, Archive, RotateCcw } from 'lucide-react'
import {
  fetchMeetingNotes,
  searchMeetingNotes,
  createMeetingNote,
  deleteMeetingNote,
  fetchHiddenMeetingNotes,
  searchHiddenMeetingNotes,
  restoreMeetingNote,
  fetchPersons,
  fetchProjects,
} from '../api'
import type { MeetingNoteSummary, MeetingNoteSearchResult } from '../types'
import { useTimezone } from '../TimezoneContext'
import { useMeetingNoteSort } from '../MeetingNoteSortContext'
import { getTodayString } from '../dateUtils'

function formatInTimezone(isoString: string, tz: string): string {
  const date = new Date(isoString)
  return date.toLocaleString(undefined, {
    timeZone: tz,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function MeetingNotesPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { timezone } = useTimezone()
  const { sortBy } = useMeetingNoteSort()
  const todayStr = getTodayString(timezone)

  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filterPersonId, setFilterPersonId] = useState<string>('')
  const [filterProjectId, setFilterProjectId] = useState<string>('')
  const [showTrash, setShowTrash] = useState(false)

  const createMutation = useMutation({
    mutationFn: createMeetingNote,
    onSuccess: (note) => {
      queryClient.invalidateQueries({ queryKey: ['meeting-notes'] })
      navigate(`/meeting-notes/${note.id}`)
    },
  })

  const hideNoteMutation = useMutation({
    mutationFn: deleteMeetingNote,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting-notes'] })
      queryClient.invalidateQueries({ queryKey: ['hidden-meeting-notes'] })
    },
  })

  const handleNewNote = () => {
    if (createMutation.isPending) return
    const existingCount = notes.filter((n) => n.title.startsWith('Untitled-Meeting')).length
    const n = existingCount + 1
    createMutation.mutate({
      title: `Untitled-Meeting-${n}`,
      date: todayStr,
      template: 'default_meeting',
    })
  }

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const filters = {
    ...(filterPersonId ? { person_id: parseInt(filterPersonId) } : {}),
    ...(filterProjectId ? { project_id: parseInt(filterProjectId) } : {}),
  }

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ['meeting-notes', filters],
    queryFn: () => fetchMeetingNotes(filters),
    enabled: !debouncedSearch,
  })

  const { data: searchResults = [] } = useQuery({
    queryKey: ['meeting-notes-search', debouncedSearch],
    queryFn: () => searchMeetingNotes(debouncedSearch),
    enabled: !!debouncedSearch,
  })

  const { data: persons = [] } = useQuery({ queryKey: ['persons'], queryFn: fetchPersons })
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: fetchProjects })

  const sortedNotes = [...notes].sort((a, b) => {
    const aVal = sortBy === 'created_at' ? a.created_at : a.updated_at
    const bVal = sortBy === 'created_at' ? b.created_at : b.updated_at
    return bVal.localeCompare(aVal)
  })

  const showingSearch = !!debouncedSearch

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Meeting Notes</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTrash(true)}
            className="flex items-center gap-2 px-3 py-2 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-sm"
            title="View hidden notes"
          >
            <Archive size={16} />
            Trash
          </button>
          <button
            onClick={handleNewNote}
            disabled={createMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors text-sm font-medium"
          >
            <Plus size={16} />
            {createMutation.isPending ? 'Creating...' : 'New Note'}
          </button>
        </div>
      </div>

      {/* Search and filters */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search meeting notes..."
            className="w-full pl-9 pr-8 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X size={14} />
            </button>
          )}
        </div>
        <select
          value={filterPersonId}
          onChange={(e) => setFilterPersonId(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
        >
          <option value="">All people</option>
          {persons.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select
          value={filterProjectId}
          onChange={(e) => setFilterProjectId(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* Results */}
      {isLoading && !showingSearch ? (
        <p className="text-slate-400 text-sm">Loading...</p>
      ) : showingSearch ? (
        <SearchResultsList results={searchResults} onOpen={(id) => navigate(`/meeting-notes/${id}`)} />
      ) : notes.length === 0 ? (
        <div className="text-center py-16 text-slate-400 dark:text-slate-500">
          <FileText size={48} className="mx-auto mb-3 opacity-50" />
          <p className="text-lg font-medium">No meeting notes yet</p>
          <p className="text-sm mt-1">Create your first meeting note to get started.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedNotes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              timezone={timezone}
              onClick={() => navigate(`/meeting-notes/${note.id}`)}
              onDelete={() => hideNoteMutation.mutate(note.id)}
            />
          ))}
        </div>
      )}

      {showTrash && <TrashPanel onClose={() => setShowTrash(false)} />}
    </div>
  )
}

function NoteCard({ note, timezone, onClick, onDelete }: { note: MeetingNoteSummary; timezone: string; onClick: () => void; onDelete?: () => void }) {
  return (
    <div className="relative group flex bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-sm transition-all">
      <button
        onClick={onClick}
        className="flex-1 text-left p-4 min-w-0"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-slate-800 dark:text-slate-100 truncate">{note.title}</h3>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
              <p className="text-xs text-slate-500 dark:text-slate-400">Created: {formatInTimezone(note.created_at, timezone)}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Edited: {formatInTimezone(note.updated_at, timezone)}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 flex-shrink-0">
            {note.attendee_names.length > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full">
                <Users size={10} />
                {note.attendee_names.length}
              </span>
            )}
            {note.project_names.length > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full">
                <FolderKanban size={10} />
                {note.project_names.join(', ')}
              </span>
            )}
          </div>
        </div>
      </button>
      {onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="px-3 flex items-center opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all"
          title="Hide note"
        >
          <Trash2 size={15} />
        </button>
      )}
    </div>
  )
}

function SearchResultsList({ results, onOpen }: { results: MeetingNoteSearchResult[]; onOpen: (id: number) => void }) {
  if (results.length === 0) {
    return <p className="text-slate-400 text-sm text-center py-8">No results found.</p>
  }
  return (
    <div className="space-y-2">
      {results.map((r) => (
        <button
          key={r.id}
          onClick={() => onOpen(r.id)}
          className="w-full text-left p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:border-indigo-300 dark:hover:border-indigo-600 transition-all"
        >
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-slate-800 dark:text-slate-100">{r.title}</h3>
            <span className="text-xs text-slate-400">{r.date}</span>
          </div>
          {r.snippet && (
            <pre className="mt-2 text-xs text-slate-500 dark:text-slate-400 whitespace-pre-wrap font-mono bg-slate-50 dark:bg-slate-900 p-2 rounded">{r.snippet}</pre>
          )}
        </button>
      ))}
    </div>
  )
}

function TrashPanel({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  const { data: hiddenNotes = [] } = useQuery({
    queryKey: ['hidden-meeting-notes'],
    queryFn: fetchHiddenMeetingNotes,
    enabled: !debouncedSearch,
  })

  const { data: searchResults = [] } = useQuery({
    queryKey: ['hidden-meeting-notes-search', debouncedSearch],
    queryFn: () => searchHiddenMeetingNotes(debouncedSearch),
    enabled: !!debouncedSearch,
  })

  const restoreMutation = useMutation({
    mutationFn: restoreMeetingNote,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting-notes'] })
      queryClient.invalidateQueries({ queryKey: ['hidden-meeting-notes'] })
      queryClient.invalidateQueries({ queryKey: ['hidden-meeting-notes-search'] })
    },
  })

  const showingSearch = !!debouncedSearch
  const items = showingSearch
    ? searchResults.map((r) => ({ id: r.id, title: r.title, date: r.date, snippet: r.snippet }))
    : hiddenNotes.map((n) => ({ id: n.id, title: n.title, date: n.date, snippet: undefined as string | undefined }))

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative w-full max-w-md bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700 shadow-xl flex flex-col h-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Archive size={18} /> Hidden Notes
          </h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search hidden notes..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {items.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-8">
              {showingSearch ? 'No results found.' : 'No hidden notes.'}
            </p>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    onClick={() => { navigate(`/meeting-notes/${item.id}`); onClose() }}
                    className="flex-1 text-left min-w-0"
                  >
                    <h3 className="font-medium text-sm text-slate-800 dark:text-slate-100 truncate">{item.title}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">{item.date}</p>
                  </button>
                  <button
                    onClick={() => restoreMutation.mutate(item.id)}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded transition-colors flex-shrink-0"
                    title="Restore note"
                  >
                    <RotateCcw size={12} /> Restore
                  </button>
                </div>
                {item.snippet && (
                  <pre className="mt-2 text-xs text-slate-500 dark:text-slate-400 whitespace-pre-wrap font-mono bg-white dark:bg-slate-900 p-2 rounded">{item.snippet}</pre>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

