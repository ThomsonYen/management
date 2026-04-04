import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface SuggestedNotesContextType {
  hasSuggested: (noteId: number) => boolean
  markSuggested: (noteId: number) => void
}

const STORAGE_KEY = 'suggestedNoteIds'

function loadIds(): Set<number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return new Set(JSON.parse(raw) as number[])
  } catch {}
  return new Set()
}

function saveIds(ids: Set<number>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]))
}

const SuggestedNotesContext = createContext<SuggestedNotesContextType>({
  hasSuggested: () => false,
  markSuggested: () => {},
})

export function useSuggestedNotes() {
  return useContext(SuggestedNotesContext)
}

export function SuggestedNotesProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<Set<number>>(loadIds)

  const hasSuggested = useCallback((noteId: number) => ids.has(noteId), [ids])

  const markSuggested = useCallback((noteId: number) => {
    setIds((prev) => {
      if (prev.has(noteId)) return prev
      const next = new Set(prev).add(noteId)
      saveIds(next)
      return next
    })
  }, [])

  return (
    <SuggestedNotesContext.Provider value={{ hasSuggested, markSuggested }}>
      {children}
    </SuggestedNotesContext.Provider>
  )
}
