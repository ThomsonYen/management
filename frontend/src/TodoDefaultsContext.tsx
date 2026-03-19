import { createContext, useContext, useState, type ReactNode } from 'react'

export interface TodoDefaults {
  assigneeId: string
  deadlineToToday: boolean
  estimatedHours: string
  importance: string
}

interface TodoDefaultsContextType {
  defaults: TodoDefaults
  setDefaults: (defaults: TodoDefaults) => void
}

const STORAGE_KEY = 'todoDefaults'

const fallback: TodoDefaults = {
  assigneeId: '',
  deadlineToToday: false,
  estimatedHours: '1',
  importance: 'medium',
}

function loadDefaults(): TodoDefaults {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return { ...fallback, ...JSON.parse(stored) }
  } catch {}
  return fallback
}

const TodoDefaultsContext = createContext<TodoDefaultsContextType>({
  defaults: fallback,
  setDefaults: () => {},
})

export function useTodoDefaults() {
  return useContext(TodoDefaultsContext)
}

export function TodoDefaultsProvider({ children }: { children: ReactNode }) {
  const [defaults, setDefaultsState] = useState<TodoDefaults>(loadDefaults)

  const setDefaults = (next: TodoDefaults) => {
    setDefaultsState(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }

  return (
    <TodoDefaultsContext.Provider value={{ defaults, setDefaults }}>
      {children}
    </TodoDefaultsContext.Provider>
  )
}
