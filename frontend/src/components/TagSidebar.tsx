import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { Hash } from 'lucide-react'
import { fetchTags } from '../api'
import type { NoteKind } from '../types'

interface Props {
  kind?: NoteKind
}

export default function TagSidebar({ kind }: Props) {
  const [searchParams] = useSearchParams()
  const activeTag = searchParams.get('tag')?.toLowerCase() ?? null

  const { data: tags = [], isLoading } = useQuery({
    queryKey: ['tags', kind ?? 'all'],
    queryFn: () => fetchTags(kind),
  })

  return (
    <aside className="w-56 flex-shrink-0 border-l border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 overflow-y-auto p-4">
      <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <Hash size={12} /> Tags
      </h3>
      {isLoading ? (
        <p className="text-xs text-slate-400">Loading...</p>
      ) : tags.length === 0 ? (
        <p className="text-xs text-slate-400">
          No tags yet. Type <code className="font-mono text-[10px]">#foo</code> in a note.
        </p>
      ) : (
        <ul className="space-y-0.5">
          {activeTag && (
            <li>
              <Link
                to="/notes"
                className="block text-xs px-2 py-1 rounded text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-indigo-700 dark:hover:text-indigo-300"
              >
                ← All notes
              </Link>
            </li>
          )}
          {tags.map((t) => {
            const isActive =
              activeTag != null &&
              (t.name === activeTag || t.name.startsWith(activeTag + '/'))
            const isExact = activeTag === t.name
            return (
              <li key={t.name}>
                <Link
                  to={`/notes?tag=${encodeURIComponent(t.name)}`}
                  className={`flex items-center justify-between gap-2 px-2 py-1 rounded text-xs transition-colors ${
                    isExact
                      ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-medium'
                      : isActive
                        ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <span className="truncate">#{t.name}</span>
                  <span
                    className={
                      isExact
                        ? 'text-indigo-500 dark:text-indigo-400 flex-shrink-0'
                        : 'text-slate-400 dark:text-slate-500 flex-shrink-0'
                    }
                  >
                    {t.note_count}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </aside>
  )
}
