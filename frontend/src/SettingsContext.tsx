import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { fetchSettings, updateSettings, type UserSettings, type UserSettingsPatch } from './api'
import { applyTheme, DEFAULT_THEME, THEMES, type ThemeName } from './theme'
import { useOptionalSession } from './hooks/useSession'

// ─── Defaults (authoritative on the frontend too, so first paint has real values) ───

const DEFAULT_HOTKEYS: Record<string, string> = {
  toggleMainSidebar: 'meta+g',
  toggleSecondarySidebar: 'meta+h',
  goToDashboard: 'meta+1',
  goToFocus: 'meta+2',
  goToTodos: 'meta+3',
  goToProjects: 'meta+4',
  goToPeople: 'meta+5',
  goToMeetings: 'meta+6',
  goToNotes: 'meta+7',
  goToDone: 'meta+8',
  openCommandPalette: 'meta+k',
  newTodo: 'meta+n',
  newMeetingNote: 'meta+shift+n',
  newPersonalNote: 'meta+alt+n',
  markDone: 'meta+d',
  toggleFocus: 'meta+f',
  editTodo: 'meta+e',
  toggleTheme: 'meta+\\',
  focusSearch: '/',
  selectAll: 'meta+a',
  escape: 'escape',
  editorInsertTodo: 'meta+t',
  editorIndent: 'tab',
  editorUnindent: 'shift+tab',
}

export type HotkeyBindings = typeof DEFAULT_HOTKEYS

export const HOTKEY_KEYS = Object.keys(DEFAULT_HOTKEYS) as (keyof HotkeyBindings)[]

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
}

function getInitialTheme(): 'light' | 'dark' {
  const stored = localStorage.getItem('settings.theme')
  if (stored === 'dark' || stored === 'light') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

// ─── Font size ───────────────────────────────────────────────────────────────
// Persisted in localStorage (not the backend) so the choice survives without a
// server round-trip on first paint.

export type FontSize = 'sm' | 'md' | 'lg' | 'xl'

export const FONT_SIZE_SCALE: Record<FontSize, number> = {
  sm: 0.9,
  md: 1.0,
  lg: 1.15,
  xl: 1.3,
}

const FONT_SIZE_LS_KEY = 'settings.fontSize'

function getInitialFontSize(): FontSize {
  const stored = localStorage.getItem(FONT_SIZE_LS_KEY)
  if (stored === 'sm' || stored === 'md' || stored === 'lg' || stored === 'xl') return stored
  return 'md'
}

function applyFontSize(size: FontSize) {
  document.documentElement.style.setProperty('--font-scale', String(FONT_SIZE_SCALE[size]))
}

// Apply the saved font scale synchronously so the first paint is correct.
applyFontSize(getInitialFontSize())

const LS_KEY = 'settings.cache.v1'

function loadCache(): Partial<UserSettings> {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return {}
}

function saveCache(settings: UserSettings) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(settings))
    localStorage.setItem('settings.theme', settings.theme)
  } catch { /* ignore */ }
}

function buildInitial(): UserSettings {
  const cache = loadCache()
  return {
    timezone: cache.timezone ?? detectTimezone(),
    theme: cache.theme ?? getInitialTheme(),
    theme_variant: cache.theme_variant ?? DEFAULT_THEME,
    font_size: cache.font_size ?? getInitialFontSize(),
    meeting_note_sort: cache.meeting_note_sort ?? 'updated_at',
    todo_defaults: {
      assignee_name: '',
      deadline_to_today: false,
      estimated_hours: '1',
      importance: 'medium',
      ...(cache.todo_defaults ?? {}),
    },
    hotkeys: { ...DEFAULT_HOTKEYS, ...(cache.hotkeys ?? {}) },
  }
}

// Apply theme class synchronously so the first paint is correct
const initial = buildInitial()
document.documentElement.classList.toggle('dark', initial.theme === 'dark')
applyFontSize(initial.font_size)
applyTheme((initial.theme_variant in THEMES ? initial.theme_variant : DEFAULT_THEME) as ThemeName)

// ─── Hotkey helpers ─────────────────────────────────────────────────────────

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

// ─── Context ─────────────────────────────────────────────────────────────────

interface SettingsContextValue {
  settings: UserSettings
  patch: (patch: UserSettingsPatch) => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<UserSettings>(initial)
  const isInitial = useRef(true)

  // Settings are per user, so load them only once a session exists (and again
  // if the signed-in user changes). Never push the local cache to the server
  // on failure: on a shared device that would overwrite one person's settings
  // with another's; the cache is a first-paint hint, nothing more.
  const sessionUserId = useOptionalSession()?.id
  useEffect(() => {
    if (sessionUserId == null) return
    let cancelled = false
    fetchSettings()
      .then((server) => {
        if (cancelled) return
        const merged: UserSettings = {
          ...server,
          timezone: server.timezone ?? detectTimezone(),
          theme_variant: server.theme_variant && server.theme_variant in THEMES
            ? server.theme_variant
            : DEFAULT_THEME,
          font_size: (['sm', 'md', 'lg', 'xl'] as FontSize[]).includes(server.font_size)
            ? server.font_size
            : 'md',
          hotkeys: { ...DEFAULT_HOTKEYS, ...(server.hotkeys ?? {}) },
        }
        setSettings(merged)
        saveCache(merged)
        if (server.timezone == null) {
          updateSettings({ timezone: merged.timezone }).catch(() => {})
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [sessionUserId])

  useEffect(() => {
    if (isInitial.current) {
      isInitial.current = false
      return
    }
    saveCache(settings)
    document.documentElement.classList.toggle('dark', settings.theme === 'dark')
    applyFontSize(settings.font_size)
    applyTheme((settings.theme_variant in THEMES ? settings.theme_variant : DEFAULT_THEME) as ThemeName)
  }, [settings])

  const patch = useCallback((p: UserSettingsPatch) => {
    setSettings((prev) => {
      const next: UserSettings = {
        ...prev,
        ...p,
        todo_defaults: p.todo_defaults
          ? { ...prev.todo_defaults, ...p.todo_defaults }
          : prev.todo_defaults,
        hotkeys: p.hotkeys
          ? { ...prev.hotkeys, ...p.hotkeys }
          : prev.hotkeys,
        timezone: p.timezone ?? prev.timezone,
        theme: p.theme ?? prev.theme,
        meeting_note_sort: p.meeting_note_sort ?? prev.meeting_note_sort,
      }
      return next
    })
    updateSettings(p).catch(() => {})
  }, [])

  const value = useMemo(() => ({ settings, patch }), [settings, patch])

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider')
  return ctx
}

// ─── Narrow hooks (kept API-compatible with the old split contexts) ──────────

export function useTheme() {
  const { settings, patch } = useSettings()
  const setTheme = useCallback((theme: 'light' | 'dark') => patch({ theme }), [patch])
  return { theme: settings.theme, setTheme }
}

export function useTimezone() {
  const { settings, patch } = useSettings()
  const setTimezone = useCallback((tz: string) => patch({ timezone: tz }), [patch])
  return { timezone: settings.timezone ?? 'UTC', setTimezone }
}

export function useMeetingNoteSort() {
  const { settings, patch } = useSettings()
  const setSortBy = useCallback(
    (meeting_note_sort: 'created_at' | 'updated_at') => patch({ meeting_note_sort }),
    [patch],
  )
  return { sortBy: settings.meeting_note_sort, setSortBy }
}

export type MeetingNoteSortField = 'created_at' | 'updated_at'

export interface TodoDefaults {
  assigneeName: string
  deadlineToToday: boolean
  estimatedHours: string
  importance: string
}

export function useTodoDefaults() {
  const { settings, patch } = useSettings()
  const defaults: TodoDefaults = useMemo(() => ({
    assigneeName: settings.todo_defaults.assignee_name,
    deadlineToToday: settings.todo_defaults.deadline_to_today,
    estimatedHours: settings.todo_defaults.estimated_hours,
    importance: settings.todo_defaults.importance,
  }), [settings.todo_defaults])

  const setDefaults = useCallback((next: TodoDefaults) => {
    patch({
      todo_defaults: {
        assignee_name: next.assigneeName,
        deadline_to_today: next.deadlineToToday,
        estimated_hours: next.estimatedHours,
        importance: next.importance,
      },
    })
  }, [patch])

  return { defaults, setDefaults }
}

/**
 * Resolve a saved assignee *name* against a list of persons.
 * Returns null if the name is empty or no person with that name exists
 * (e.g. they were renamed, deleted, or never existed).
 */
export function resolveAssigneeId(
  name: string,
  persons: { id: number; name: string }[],
): number | null {
  if (!name) return null
  const match = persons.find((p) => p.name === name)
  return match ? match.id : null
}

export function useFontSize() {
  const { settings, patch } = useSettings()
  const setSize = useCallback((next: FontSize) => patch({ font_size: next }), [patch])
  return { size: settings.font_size, setSize }
}

export function useThemeVariant() {
  const { settings, patch } = useSettings()
  const variant = (settings.theme_variant in THEMES ? settings.theme_variant : DEFAULT_THEME) as ThemeName
  const setVariant = useCallback((next: ThemeName) => patch({ theme_variant: next }), [patch])
  return { variant, setVariant }
}

export function useHotkeys() {
  const { settings, patch } = useSettings()
  const bindings = settings.hotkeys as HotkeyBindings
  const setBinding = useCallback(
    (key: keyof HotkeyBindings, value: string) => patch({ hotkeys: { [key]: value } }),
    [patch],
  )
  const resetToDefaults = useCallback(() => patch({ hotkeys: { ...DEFAULT_HOTKEYS } }), [patch])
  return { bindings, setBinding, resetToDefaults }
}
