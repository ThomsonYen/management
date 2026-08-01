import { useState, useEffect, useRef, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import MarkdownEditor from './MarkdownEditor'
import SaveIndicator, { type SaveState } from './SaveIndicator'
import { useDebouncedFn } from '../hooks/useDebouncedFn'
import { updateProject } from '../api'
import type { Project, ProjectTree } from '../types'

export default function ProjectNotes({ project }: { project: Project }) {
 const queryClient = useQueryClient()
 const initialNotes = project.notes || ''
 const [draft, setDraft] = useState(initialNotes)
 const [lastSaved, setLastSaved] = useState(initialNotes)
 const [showRaw, setShowRaw] = useState(false)
 const draftRef = useRef(draft)
 draftRef.current = draft

 useEffect(() => {
 const serverNotes = project.notes || ''
 setLastSaved(serverNotes)
 if (serverNotes !== draftRef.current) {
 setDraft(serverNotes)
 }
 }, [project.id, project.notes])

 const saveMutation = useMutation({
 mutationFn: async (notes: string) => {
 const updated = await updateProject(project.id, { notes })
 queryClient.setQueryData<Project[]>(['projects'], (old) =>
 old?.map((p) => (p.id === project.id ? { ...p, notes: updated.notes } : p)),
 )
 queryClient.setQueryData<ProjectTree[]>(['projects-tree'], (old) => {
 if (!old) return old
 const patch = (nodes: ProjectTree[]): ProjectTree[] =>
 nodes.map((n) =>
 n.id === project.id
 ? { ...n, notes: updated.notes, subprojects: patch(n.subprojects) }
 : { ...n, subprojects: patch(n.subprojects) },
 )
 return patch(old)
 })
 return updated
 },
 onSuccess: (_, variables) => setLastSaved(variables),
 })

 const debouncedSave = useDebouncedFn(
 (notes: string) => saveMutation.mutate(notes),
 { idleMs: 500, maxMs: 3000 },
 )

 const handleChange = useCallback((md: string) => {
 setDraft(md)
 }, [])

 const handleSave = useCallback((md: string) => {
 saveMutation.mutate(md)
 }, [saveMutation])

 const handleRawChange = useCallback((md: string) => {
 setDraft(md)
 debouncedSave.call(md)
 }, [debouncedSave])

 const dirty = draft !== lastSaved
 const saveState: SaveState =
 saveMutation.isPending ? 'saving' :
 dirty ? 'unsaved' :
 saveMutation.isSuccess ? 'saved' :
 'idle'

 return (
 <div className="bg-surface rounded-xl border border-border p-5 mb-5">
 <div className="flex items-center justify-between mb-2">
 <h3 className="text-xs font-semibold text-fg-muted uppercase tracking-wide">Notes</h3>
 <div className="flex items-center gap-3">
 <SaveIndicator state={saveState} />
 <button
 onClick={() => setShowRaw(v => !v)}
 className="text-[10px] font-mono text-fg-subtle hover:text-fg-muted dark:hover:text-fg-faint transition-colors"
 >
 {showRaw ? 'Hide raw' : 'Raw'}
 </button>
 </div>
 </div>
 {draft ? (
 <MarkdownEditor value={draft} onChange={handleChange} onSave={handleSave} />
 ) : (
 <p
 onClick={() => setDraft(' ')}
 className="text-sm text-fg-subtle italic cursor-text"
 >
 Click to add notes...
 </p>
 )}
 {showRaw && (
 <textarea
 value={draft}
 onChange={(e) => handleRawChange(e.target.value)}
 rows={8}
 className="mt-3 w-full border border-border rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-accent resize-y"
 />
 )}
 </div>
 )
}
