import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'

export interface HotkeyBindings {
  // Sidebars
  toggleMainSidebar: string
  toggleSecondarySidebar: string
  // Navigation
  goToDashboard: string
  goToFocus: string
  goToTodos: string
  goToProjects: string
  goToPeople: string
  goToMeetings: string
  goToDone: string
  // Creation
  newTodo: string
  newMeetingNote: string
  // Todo actions
  markDone: string
  toggleFocus: string
  editTodo: string
  // View
  toggleTheme: string
  focusSearch: string
  // Selection
  selectAll: string
  // General
  escape: string
}

const DEFAULT_BINDINGS: HotkeyBindings = {
  toggleMainSidebar: 'meta+g',
  toggleSecondarySidebar: 'meta+h',
  goToDashboard: 'meta+1',
  goToFocus: 'meta+2',
  goToTodos: 'meta+3',
  goToProjects: 'meta+4',
  goToPeople: 'meta+5',
  goToMeetings: 'meta+6',
  goToDone: 'meta+7',
  newTodo: 'meta+n',
  newMeetingNote: 'meta+shift+n',
  markDone: 'meta+d',
  toggleFocus: 'meta+f',
  editTodo: 'meta+e',
  toggleTheme: 'meta+\\',
  focusSearch: '/',
  selectAll: 'meta+a',
  escape: 'escape',
}

const STORAGE_KEY = 'hotkeyBindings'

function loadBindings(): HotkeyBindings {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      return { ...DEFAULT_BINDINGS, ...parsed }
    }
  } catch {}
  return { ...DEFAULT_BINDINGS }
}

export function formatHotkey(binding: string): string {
  return binding
    .split('+')
    .map((part) => {
      switch (part) {
        case 'meta': return '⌘'
        case 'ctrl': return 'Ctrl'
        case 'alt': return 'Alt'
        case 'shift': return 'Shift'
        default: return part.toUpperCase()
      }
    })
    .join(' + ')
}

export function eventToBinding(e: KeyboardEvent): string {
  const parts: string[] = []
  if (e.metaKey) parts.push('meta')
  if (e.ctrlKey) parts.push('ctrl')
  if (e.altKey) parts.push('alt')
  if (e.shiftKey) parts.push('shift')
  const key = e.key.toLowerCase()
  if (!['meta', 'control', 'alt', 'shift'].includes(key)) {
    parts.push(key)
  }
  return parts.join('+')
}

export function matchesBinding(e: KeyboardEvent, binding: string): boolean {
  const parts = binding.split('+')
  const needMeta = parts.includes('meta')
  const needCtrl = parts.includes('ctrl')
  const needAlt = parts.includes('alt')
  const needShift = parts.includes('shift')
  const key = parts.find((p) => !['meta', 'ctrl', 'alt', 'shift'].includes(p))

  if (e.metaKey !== needMeta) return false
  if (e.ctrlKey !== needCtrl) return false
  if (e.altKey !== needAlt) return false
  if (e.shiftKey !== needShift) return false
  if (key && e.key.toLowerCase() !== key) return false
  return true
}

interface HotkeysContextValue {
  bindings: HotkeyBindings
  setBinding: (key: keyof HotkeyBindings, value: string) => void
  resetToDefaults: () => void
}

const HotkeysContext = createContext<HotkeysContextValue | null>(null)

export function HotkeysProvider({ children }: { children: ReactNode }) {
  const [bindings, setBindings] = useState<HotkeyBindings>(loadBindings)
  const isInitial = useRef(true)

  useEffect(() => {
    if (isInitial.current) {
      isInitial.current = false
      return
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings))
  }, [bindings])

  const setBinding = useCallback((key: keyof HotkeyBindings, value: string) => {
    setBindings((prev) => ({ ...prev, [key]: value }))
  }, [])

  const resetToDefaults = useCallback(() => {
    setBindings({ ...DEFAULT_BINDINGS })
  }, [])

  return (
    <HotkeysContext.Provider value={{ bindings, setBinding, resetToDefaults }}>
      {children}
    </HotkeysContext.Provider>
  )
}

export function useHotkeys() {
  const ctx = useContext(HotkeysContext)
  if (!ctx) throw new Error('useHotkeys must be used within HotkeysProvider')
  return ctx
}
