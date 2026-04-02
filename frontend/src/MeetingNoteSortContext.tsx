import { createContext, useContext, useState, type ReactNode } from 'react'

export type MeetingNoteSortField = 'created_at' | 'updated_at'

interface MeetingNoteSortContextType {
  sortBy: MeetingNoteSortField
  setSortBy: (field: MeetingNoteSortField) => void
}

const STORAGE_KEY = 'meetingNoteSortBy'

function loadSortBy(): MeetingNoteSortField {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'created_at' || stored === 'updated_at') return stored
  } catch {}
  return 'updated_at'
}

const MeetingNoteSortContext = createContext<MeetingNoteSortContextType>({
  sortBy: 'updated_at',
  setSortBy: () => {},
})

export function useMeetingNoteSort() {
  return useContext(MeetingNoteSortContext)
}

export function MeetingNoteSortProvider({ children }: { children: ReactNode }) {
  const [sortBy, setSortByState] = useState<MeetingNoteSortField>(loadSortBy)

  const setSortBy = (field: MeetingNoteSortField) => {
    setSortByState(field)
    localStorage.setItem(STORAGE_KEY, field)
  }

  return (
    <MeetingNoteSortContext.Provider value={{ sortBy, setSortBy }}>
      {children}
    </MeetingNoteSortContext.Provider>
  )
}
