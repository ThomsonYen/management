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
 <aside className="w-full md:w-56 flex-shrink-0 border-t md:border-t-0 md:border-l border-border bg-app overflow-y-auto p-4">
 <h3 className="text-xs font-semibold text-fg-muted uppercase tracking-wider mb-3 flex items-center gap-1.5">
 <Hash size={12} /> Tags
 </h3>
 {isLoading ? (
 <p className="text-xs text-fg-subtle">Loading...</p>
 ) : tags.length === 0 ? (
 <p className="text-xs text-fg-subtle">
 No tags yet. Type <code className="font-mono text-[10px]">#foo</code> in a note.
 </p>
 ) : (
 <ul className="flex flex-wrap gap-1 md:block md:space-y-0.5">
 {activeTag && (
 <li>
 <Link
 to="/notes"
 className="block text-xs px-2 py-1 rounded text-fg-muted hover:bg-inset dark:hover:bg-elevated hover:text-accent-fg dark:hover:text-accent"
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
 ? 'bg-accent-1 text-accent-fg font-medium'
 : isActive
 ? 'bg-accent-1 dark:bg-accent-1 text-accent'
 : 'text-fg-muted hover:bg-inset dark:hover:bg-elevated'
 }`}
 >
 <span className="truncate">#{t.name}</span>
 <span
 className={
 isExact
 ? 'text-accent dark:text-accent flex-shrink-0'
 : 'text-fg-subtle flex-shrink-0'
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
