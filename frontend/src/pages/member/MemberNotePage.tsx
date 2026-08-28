import { useCallback } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import MDEditor from '@uiw/react-md-editor'
import { AlertTriangle, ArrowLeft, CheckSquare, FolderKanban, SearchX, Users } from 'lucide-react'
import { fetchNote } from '../../api'
import type { Note } from '../../types'
import { useTheme, useTimezone } from '../../SettingsContext'
import { formatDayLabel } from '../../dateUtils'
import { remarkHashtag } from '../../utils/remarkHashtag'
import { remarkFixEmptyTasks } from '../../utils/remarkFixEmptyTasks'
import TagPill from '../../components/TagPill'
import { Badge, EmptyState } from '../../components/ui'

/** Read-only note view for members: content as written, no transcript, audio or files. */
export default function MemberNotePage() {
  const { id } = useParams<{ id: string }>()
  const noteId = Number(id)
  const navigate = useNavigate()
  const { theme } = useTheme()
  const { timezone } = useTimezone()
  const { data: note, isLoading } = useQuery<Note>({
    queryKey: ['note', noteId],
    queryFn: () => fetchNote(noteId),
    retry: false,
    enabled: Number.isFinite(noteId),
  })

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

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <Link to="/notes" className="inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg mb-4">
        <ArrowLeft size={16} /> Notes
      </Link>
      {isLoading && <p className="text-sm text-fg-subtle">Loading…</p>}
      {!isLoading && !note && (
        <div className="bg-surface rounded-xl border border-border shadow-sm">
          <EmptyState icon={SearchX} title="Not found" description="This note does not exist or is not shared with you." />
        </div>
      )}
      {note && (
        <article className="bg-surface rounded-xl border border-border shadow-sm">
          <header className="px-5 md:px-6 pt-5 pb-3 border-b border-border-subtle">
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-xl font-bold text-fg">{note.title}</h1>
              <Badge tone={note.kind === 'meeting' ? 'info' : 'neutral'}>
                {note.kind === 'meeting' ? 'Meeting' : 'Note'}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-fg-muted">
              {note.date && <span>📅 {formatDayLabel(note.date, timezone)}</span>}
              {note.attendee_names.length > 0 && (
                <span className="flex items-center gap-1"><Users size={12} /> {note.attendee_names.join(', ')}</span>
              )}
              {note.project_names.length > 0 && (
                <span className="flex items-center gap-1"><FolderKanban size={12} /> {note.project_names.join(', ')}</span>
              )}
            </div>
            {note.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {note.tags.map((t) => (
                  <TagPill key={t} name={t} size="sm" />
                ))}
              </div>
            )}
            {note.todo_ids.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold text-fg-muted uppercase tracking-wide mb-1 flex items-center gap-1">
                  <CheckSquare size={12} /> Linked todos
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {note.todo_ids.map((tid, i) => (
                    <Link
                      key={tid}
                      to={`/todos/${tid}`}
                      className="text-xs px-2 py-0.5 rounded-full border border-border bg-inset text-fg hover:border-accent-2 transition-colors"
                    >
                      {note.todo_titles[i] ?? `#${tid}`}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </header>
          {note.content_unavailable && (
            <div className="mx-5 md:mx-6 mt-4 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-bg px-3 py-2 text-sm text-warning">
              <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
              <span>The content of this note is temporarily unavailable.</span>
            </div>
          )}
          <div className="px-5 md:px-6 py-4" data-color-mode={theme} onClick={handlePreviewClick}>
            <MDEditor.Markdown
              source={note.content}
              remarkPlugins={[remarkFixEmptyTasks, remarkHashtag]}
              style={{ background: 'transparent' }}
            />
          </div>
        </article>
      )}
    </div>
  )
}
