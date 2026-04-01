import { createContext, useContext, useState, type ReactNode } from 'react'

const STORAGE_KEY = 'timezone'

function getDetectedTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
}

function loadTimezone(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return stored
  } catch {}
  return getDetectedTimezone()
}

interface TimezoneContextType {
  timezone: string
  setTimezone: (tz: string) => void
}

const TimezoneContext = createContext<TimezoneContextType>({
  timezone: 'UTC',
  setTimezone: () => {},
})

export function useTimezone() {
  return useContext(TimezoneContext)
}

export function TimezoneProvider({ children }: { children: ReactNode }) {
  const [timezone, setTimezoneState] = useState<string>(loadTimezone)

  const setTimezone = (tz: string) => {
    setTimezoneState(tz)
    localStorage.setItem(STORAGE_KEY, tz)
  }

  return (
    <TimezoneContext.Provider value={{ timezone, setTimezone }}>
      {children}
    </TimezoneContext.Provider>
  )
}
