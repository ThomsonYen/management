import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { NotebookPen, Search, X } from 'lucide-react'
import { fetchNotes, searchNotes } from '../../api'
import type { NoteSearchResult, NoteSummary } from '../../types'
import { useTimezone } from '../../SettingsContext'
import { formatDayLabel } from '../../dateUtils'
import TagPill from '../../components/TagPill'
import { Badge, EmptyState } from '../../components/ui'

function NoteRow({ note, timezone, onClick }: { note: NoteSummary; timezone: string; onClick: () => void }) {
  const when = note.date ? formatDayLabel(note.date, timezone) : new Date(note.updated_at).toLocaleDateString()
  return (
    <button
      onClick={onClick}
      className="w-full text-left p-4 bg-surface border border-border rounded-lg hover:border-accent-2 dark:hover:border-accent hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-fg truncate">{note.title}</h3>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs text-fg-muted">
            <span>{when}</span>
            {note.attendee_names.length > 0 && <span>◉ {note.attendee_names.join(', ')}</span>}
            {note.project_names.length > 0 && <span>◈ {note.project_names.join(', ')}</span>}
          </div>
          {note.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2" onClick={(e) => e.stopPropagation()}>
              {note.tags.map((t) => (
                <TagPill key={t} name={t} />
              ))}
            </div>
          )}
        </div>
        <Badge tone={note.kind === 'meeting' ? 'info' : 'neutral'} size="sm">
          {note.kind === 'meeting' ? 'Meeting' : 'Note'}
        </Badge>
      </div>
    </button>
  )
}

/** Notes the owner shared with this member (and attended meetings, when enabled). */
export default function MemberNotesPage() {
  const navigate = useNavigate()
  const { timezone } = useTimezone()
  const [searchParams, setSearchParams] = useSearchParams()
  const tagFilter = searchParams.get('tag')?.toLowerCase() ?? null
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(query.trim()), 300)
    return () => clearTimeout(handle)
  }, [query])

  const { data: notes = [], isLoading } = useQuery<NoteSummary[]>({
    queryKey: ['notes', { member: true }],
    queryFn: () => fetchNotes(),
  })
  const { data: results = [], isFetching: searching } = useQuery<NoteSearchResult[]>({
    queryKey: ['notes', 'member-search', debounced],
    queryFn: () => searchNotes(debounced),
    enabled: debounced.length >= 2,
  })

  const filtered = tagFilter
    ? notes.filter((n) => n.tags.some((t) => t === tagFilter || t.startsWith(tagFilter + '/')))
    : notes

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-fg">Notes</h1>
        <p className="text-sm text-fg-muted mt-0.5">Notes and meetings shared with you</p>
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your notes…"
          className="w-full pl-9 pr-9 py-2 text-sm rounded-lg border border-border bg-surface text-fg placeholder:text-fg-faint focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
        {query && (
          <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg">
            <X size={14} />
          </button>
        )}
      </div>

      {tagFilter && (
        <div className="mb-4 flex items-center gap-2 text-sm text-fg-muted">
          Filtered by <TagPill name={tagFilter} active size="sm" />
          <button
            onClick={() => setSearchParams({})}
            className="text-xs text-fg-subtle hover:text-fg underline"
          >
            clear
          </button>
        </div>
      )}

      {debounced.length >= 2 ? (
        <div className="space-y-2">
          {searching && <p className="text-sm text-fg-subtle">Searching…</p>}
          {!searching && results.length === 0 && <p className="text-fg-subtle text-sm text-center py-8">No results found.</p>}
          {results.map((r) => (
            <button
              key={r.id}
              onClick={() => navigate(`/notes/${r.id}`)}
              className="w-full text-left p-4 bg-surface border border-border rounded-lg hover:border-accent-2 dark:hover:border-accent transition-all"
            >
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-fg">{r.title}</h3>
                <Badge tone={r.kind === 'meeting' ? 'info' : 'neutral'} size="sm">
                  {r.kind === 'meeting' ? 'Meeting' : 'Note'}
                </Badge>
              </div>
              {r.snippet && <p className="text-xs text-fg-muted mt-1 whitespace-pre-line line-clamp-3">{r.snippet}</p>}
            </button>
          ))}
        </div>
      ) : (
        <>
          {isLoading && <p className="text-sm text-fg-subtle">Loading…</p>}
          {!isLoading && filtered.length === 0 && (
            <div className="bg-surface rounded-xl border border-border shadow-sm">
              <EmptyState
                icon={NotebookPen}
                title={tagFilter ? 'No notes with that tag' : 'Nothing has been shared with you yet'}
                description={tagFilter ? undefined : 'Notes and meetings appear here when the owner shares them with you.'}
              />
            </div>
          )}
          <div className="space-y-2">
            {filtered.map((n) => (
              <NoteRow key={n.id} note={n} timezone={timezone} onClick={() => navigate(`/notes/${n.id}`)} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
