import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, FileText, Users, FolderKanban, X } from 'lucide-react'
import {
  fetchMeetingNotes,
  searchMeetingNotes,
  createMeetingNote,
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

  const createMutation = useMutation({
    mutationFn: createMeetingNote,
    onSuccess: (note) => {
      queryClient.invalidateQueries({ queryKey: ['meeting-notes'] })
      navigate(`/meeting-notes/${note.id}`)
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
        <button
          onClick={handleNewNote}
          disabled={createMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors text-sm font-medium"
        >
          <Plus size={16} />
          {createMutation.isPending ? 'Creating...' : 'New Note'}
        </button>
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
            <NoteCard key={note.id} note={note} timezone={timezone} onClick={() => navigate(`/meeting-notes/${note.id}`)} />
          ))}
        </div>
      )}

    </div>
  )
}

function NoteCard({ note, timezone, onClick }: { note: MeetingNoteSummary; timezone: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-sm transition-all"
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

