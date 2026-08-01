import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, FileText, X, Trash2, Archive, RotateCcw } from 'lucide-react'
import {
 fetchNotes,
 searchNotes,
 createNote,
 deleteNote,
 fetchHiddenNotes,
 searchHiddenNotes,
 restoreNote,
 fetchVaults,
} from '../api'
import type { NoteSummary, NoteSearchResult } from '../types'
import { useTimezone, useHotkeys } from '../SettingsContext'
import { useHotkey } from '../hooks/useHotkey'
import TagSidebar from '../components/TagSidebar'
import TagPill from '../components/TagPill'
import VaultSelector from '../components/VaultSelector'

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

export default function PersonalNotesPage() {
 const navigate = useNavigate()
 const queryClient = useQueryClient()
 const { timezone } = useTimezone()
 const [searchParams, setSearchParams] = useSearchParams()
 const tagFilter = searchParams.get('tag')?.toLowerCase() ?? null
 const vaultParam = searchParams.get('vault') ?? 'all'

 const { data: vaults = [] } = useQuery({ queryKey: ['vaults'], queryFn: fetchVaults })
 const selectedVaultId = vaultParam === 'all' ? null : parseInt(vaultParam) || null
 // For "All vaults" creates, fall back to the managed vault.
 const targetVaultId =
 selectedVaultId ?? vaults.find((v) => v.is_managed)?.id ?? null

 const [searchQuery, setSearchQuery] = useState('')
 const [debouncedSearch, setDebouncedSearch] = useState('')
 const [showTrash, setShowTrash] = useState(false)
 const searchInputRef = useRef<HTMLInputElement>(null)
 const { bindings } = useHotkeys()

 const updateVaultParam = (next: string) => {
 const params = new URLSearchParams(searchParams)
 if (next === 'all') params.delete('vault')
 else params.set('vault', next)
 setSearchParams(params, { replace: true })
 }

 useHotkey(bindings.focusSearch, useCallback(() => {
 searchInputRef.current?.focus()
 }, []))

 useHotkey(bindings.escape, useCallback(() => {
 if (showTrash) setShowTrash(false)
 }, [showTrash]), { skipInputCheck: true })

 const createMutation = useMutation({
 mutationFn: createNote,
 onSuccess: (note) => {
 queryClient.invalidateQueries({ queryKey: ['notes'] })
 navigate(`/notes/${note.id}`)
 },
 })

 const hideNoteMutation = useMutation({
 mutationFn: deleteNote,
 onSuccess: () => {
 queryClient.invalidateQueries({ queryKey: ['notes'] })
 queryClient.invalidateQueries({ queryKey: ['hidden-notes'] })
 queryClient.invalidateQueries({ queryKey: ['tags'] })
 },
 })

 const handleNewNote = () => {
 if (createMutation.isPending) return
 const existingCount = notes.filter((n) => n.title.startsWith('Untitled')).length
 const n = existingCount + 1
 createMutation.mutate({
 title: `Untitled-${n}`,
 kind: 'personal',
 ...(targetVaultId != null ? { vault_id: targetVaultId } : {}),
 })
 }

 useEffect(() => {
 const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300)
 return () => clearTimeout(timer)
 }, [searchQuery])

 const { data: notes = [], isLoading } = useQuery({
 queryKey: ['notes', 'personal', tagFilter ?? '', selectedVaultId ?? 'all'],
 queryFn: () =>
 fetchNotes({
 kind: 'personal',
 ...(tagFilter ? { tag: tagFilter } : {}),
 ...(selectedVaultId != null ? { vault_id: selectedVaultId } : {}),
 }),
 enabled: !debouncedSearch,
 })

 const { data: searchResults = [] } = useQuery({
 queryKey: ['notes', 'personal', 'search', debouncedSearch],
 queryFn: () => searchNotes(debouncedSearch, 'personal'),
 enabled: !!debouncedSearch,
 })

 const sortedNotes = [...notes].sort((a, b) => b.updated_at.localeCompare(a.updated_at))

 const showingSearch = !!debouncedSearch

 return (
 <div className="flex h-full">
 <div className="flex-1 overflow-auto p-6 max-w-5xl mx-auto w-full">
 <div className="flex items-center justify-between mb-6">
 <h1 className="text-2xl font-bold text-fg">Notes</h1>
 <div className="flex items-center gap-2">
 <button
 onClick={() => setShowTrash(true)}
 className="flex items-center gap-2 px-3 py-2 text-fg-muted hover:text-fg dark:hover:text-fg-faint border border-border rounded-lg hover:bg-inset transition-colors text-sm"
 title="View hidden notes"
 >
 <Archive size={16} />
 Trash
 </button>
 <button
 onClick={handleNewNote}
 disabled={createMutation.isPending}
 className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 transition-colors text-sm font-medium"
 >
 <Plus size={16} />
 {createMutation.isPending ? 'Creating...' : 'New Note'}
 </button>
 </div>
 </div>

 <div className="flex gap-3 mb-4 flex-wrap items-center">
 <div className="relative flex-1 min-w-[200px]">
 <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
 <input
 ref={searchInputRef}
 type="text"
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 placeholder="Search notes..."
 className="w-full pl-9 pr-8 py-2 text-sm border border-border rounded-lg bg-surface text-fg focus:outline-none focus:ring-2 focus:ring-accent"
 />
 {searchQuery && (
 <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg-muted">
 <X size={14} />
 </button>
 )}
 </div>
 <VaultSelector vaults={vaults} value={vaultParam} onChange={updateVaultParam} />
 </div>

 {tagFilter && (
 <div className="mb-4 flex items-center gap-2 text-sm text-fg-muted">
 <span>Filtered by</span>
 <TagPill name={tagFilter} active size="sm" />
 <button
 onClick={() => navigate('/notes')}
 className="text-xs text-fg-subtle hover:text-fg-muted dark:hover:text-fg-faint underline"
 >
 clear
 </button>
 </div>
 )}

 {isLoading && !showingSearch ? (
 <p className="text-fg-subtle text-sm">Loading...</p>
 ) : showingSearch ? (
 <SearchResultsList results={searchResults} onOpen={(id) => navigate(`/notes/${id}`)} />
 ) : notes.length === 0 ? (
 <div className="text-center py-16 text-fg-subtle">
 <FileText size={48} className="mx-auto mb-3 opacity-50" />
 <p className="text-lg font-medium">{tagFilter ? `No notes tagged #${tagFilter}` : 'No notes yet'}</p>
 <p className="text-sm mt-1">{tagFilter ? 'Try clearing the tag filter.' : 'Create your first note to get started.'}</p>
 </div>
 ) : (
 <div className="space-y-2">
 {sortedNotes.map((note) => (
 <NoteCard
 key={note.id}
 note={note}
 timezone={timezone}
 onClick={() => navigate(`/notes/${note.id}`)}
 onDelete={() => hideNoteMutation.mutate(note.id)}
 />
 ))}
 </div>
 )}

 {showTrash && <TrashPanel onClose={() => setShowTrash(false)} />}
 </div>
 <TagSidebar kind="personal" />
 </div>
 )
}

function NoteCard({ note, timezone, onClick, onDelete }: { note: NoteSummary; timezone: string; onClick: () => void; onDelete?: () => void }) {
 return (
 <div className="relative group flex bg-surface border border-border rounded-lg hover:border-accent-2 dark:hover:border-accent hover:shadow-sm transition-all">
 <button
 onClick={onClick}
 className="flex-1 text-left p-4 min-w-0"
 >
 <div className="flex items-start justify-between gap-3">
 <div className="flex-1 min-w-0">
 <h3 className="font-semibold text-fg truncate">{note.title}</h3>
 <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
 <p className="text-xs text-fg-muted">Created: {formatInTimezone(note.created_at, timezone)}</p>
 <p className="text-xs text-fg-muted">Edited: {formatInTimezone(note.updated_at, timezone)}</p>
 </div>
 </div>
 </div>
 </button>
 {note.tags && note.tags.length > 0 && (
 <div
 className="hidden sm:flex items-center flex-wrap gap-1 px-3 max-w-[40%]"
 onClick={(e) => e.stopPropagation()}
 >
 {note.tags.map((t) => (
 <TagPill key={t} name={t} />
 ))}
 </div>
 )}
 {onDelete && (
 <button
 onClick={(e) => { e.stopPropagation(); onDelete() }}
 className="px-3 flex items-center opacity-0 group-hover:opacity-100 text-fg-faint hover:text-danger transition-all"
 title="Hide note"
 >
 <Trash2 size={15} />
 </button>
 )}
 </div>
 )
}

function SearchResultsList({ results, onOpen }: { results: NoteSearchResult[]; onOpen: (id: number) => void }) {
 if (results.length === 0) {
 return <p className="text-fg-subtle text-sm text-center py-8">No results found.</p>
 }
 return (
 <div className="space-y-2">
 {results.map((r) => (
 <button
 key={r.id}
 onClick={() => onOpen(r.id)}
 className="w-full text-left p-4 bg-surface border border-border rounded-lg hover:border-accent-2 dark:hover:border-accent transition-all"
 >
 <div className="flex items-center gap-2">
 <h3 className="font-semibold text-fg">{r.title}</h3>
 </div>
 {r.snippet && (
 <pre className="mt-2 text-xs text-fg-muted whitespace-pre-wrap font-mono bg-app p-2 rounded">{r.snippet}</pre>
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
 queryKey: ['hidden-notes', 'personal'],
 queryFn: () => fetchHiddenNotes('personal'),
 enabled: !debouncedSearch,
 })

 const { data: searchResults = [] } = useQuery({
 queryKey: ['hidden-notes', 'personal', 'search', debouncedSearch],
 queryFn: () => searchHiddenNotes(debouncedSearch, 'personal'),
 enabled: !!debouncedSearch,
 })

 const restoreMutation = useMutation({
 mutationFn: restoreNote,
 onSuccess: () => {
 queryClient.invalidateQueries({ queryKey: ['notes'] })
 queryClient.invalidateQueries({ queryKey: ['hidden-notes'] })
 queryClient.invalidateQueries({ queryKey: ['tags'] })
 },
 })

 const showingSearch = !!debouncedSearch
 const items = showingSearch
 ? searchResults.map((r) => ({ id: r.id, title: r.title, snippet: r.snippet }))
 : hiddenNotes.map((n) => ({ id: n.id, title: n.title, snippet: undefined as string | undefined }))

 return (
 <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
 <div className="absolute inset-0 bg-black/30" />
 <div
 className="relative w-full max-w-md bg-surface border-l border-border shadow-xl flex flex-col h-full"
 onClick={(e) => e.stopPropagation()}
 >
 <div className="flex items-center justify-between p-4 border-b border-border">
 <h2 className="text-lg font-semibold text-fg flex items-center gap-2">
 <Archive size={18} /> Hidden Notes
 </h2>
 <button onClick={onClose} className="p-1 text-fg-subtle hover:text-fg-muted dark:hover:text-fg-faint">
 <X size={18} />
 </button>
 </div>

 <div className="p-4 border-b border-border">
 <div className="relative">
 <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
 <input
 type="text"
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 placeholder="Search hidden notes..."
 className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-surface text-fg focus:outline-none focus:ring-2 focus:ring-accent"
 />
 </div>
 </div>

 <div className="flex-1 overflow-y-auto p-4 space-y-2">
 {items.length === 0 ? (
 <p className="text-fg-subtle text-sm text-center py-8">
 {showingSearch ? 'No results found.' : 'No hidden notes.'}
 </p>
 ) : (
 items.map((item) => (
 <div
 key={item.id}
 className="p-3 bg-inset border border-border rounded-lg"
 >
 <div className="flex items-start justify-between gap-2">
 <button
 onClick={() => { navigate(`/notes/${item.id}`); onClose() }}
 className="flex-1 text-left min-w-0"
 >
 <h3 className="font-medium text-sm text-fg truncate">{item.title}</h3>
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
 <pre className="mt-2 text-xs text-fg-muted whitespace-pre-wrap font-mono bg-surface p-2 rounded">{item.snippet}</pre>
 )}
 </div>
 ))
 )}
 </div>
 </div>
 </div>
 )
}
