import { useState, useEffect, useRef } from 'react'
import { Moon, Sun } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import {
  useTheme,
  useTodoDefaults,
  useTimezone,
  useMeetingNoteSort,
  useHotkeys,
  formatHotkey,
  eventToBinding,
  type MeetingNoteSortField,
  type HotkeyBindings,
} from '../SettingsContext'
import { fetchPersons } from '../api'

function HotkeyInput({ label, description, bindingKey }: { label: string; description: string; bindingKey: keyof HotkeyBindings }) {
  const { bindings, setBinding } = useHotkeys()
  const [recording, setRecording] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!recording) return
    const handler = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      // Ignore bare modifier keys
      if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) return
      const binding = eventToBinding(e)
      setBinding(bindingKey, binding)
      setRecording(false)
    }
    const cancelOnClick = (e: MouseEvent) => {
      if (buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        setRecording(false)
      }
    }
    document.addEventListener('keydown', handler, true)
    document.addEventListener('mousedown', cancelOnClick)
    return () => {
      document.removeEventListener('keydown', handler, true)
      document.removeEventListener('mousedown', cancelOnClick)
    }
  }, [recording, bindingKey, setBinding])

  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm text-slate-700 dark:text-slate-300">{label}</p>
        <p className="text-xs text-slate-400 dark:text-slate-500">{description}</p>
      </div>
      <button
        ref={buttonRef}
        onClick={() => setRecording(true)}
        className={`min-w-[120px] px-4 py-2 rounded-lg text-sm font-mono font-medium border transition-colors ${
          recording
            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 ring-2 ring-indigo-300 dark:ring-indigo-700'
            : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:border-indigo-400 dark:hover:border-indigo-500'
        }`}
      >
        {recording ? 'Press keys...' : formatHotkey(bindings[bindingKey])}
      </button>
    </div>
  )
}

function getAvailableTimezones(): string[] {
  try {
    return (Intl as any).supportedValuesOf('timeZone') as string[]
  } catch {
    return [
      'UTC',
      'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
      'America/Toronto', 'America/Vancouver', 'America/Sao_Paulo', 'America/Mexico_City',
      'Europe/London', 'Europe/Berlin', 'Europe/Paris', 'Europe/Amsterdam', 'Europe/Rome',
      'Europe/Madrid', 'Europe/Zurich', 'Europe/Stockholm', 'Europe/Moscow',
      'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Singapore', 'Asia/Seoul',
      'Asia/Kolkata', 'Asia/Dubai', 'Asia/Bangkok', 'Asia/Taipei',
      'Australia/Sydney', 'Australia/Melbourne', 'Pacific/Auckland', 'Pacific/Honolulu',
      'Africa/Cairo', 'Africa/Lagos', 'Africa/Johannesburg',
    ]
  }
}

const TIMEZONES = getAvailableTimezones()

const IMPORTANCE_OPTIONS = ['low', 'medium', 'high', 'critical']

export default function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const { defaults, setDefaults } = useTodoDefaults()
  const { timezone, setTimezone } = useTimezone()
  const { sortBy, setSortBy } = useMeetingNoteSort()
  const { resetToDefaults } = useHotkeys()
  const { data: persons = [] } = useQuery({ queryKey: ['persons'], queryFn: fetchPersons })

  const updateField = <K extends keyof typeof defaults>(key: K, value: (typeof defaults)[K]) => {
    setDefaults({ ...defaults, [key]: value })
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-6">Settings</h1>

      <div className="space-y-4">
        {/* Appearance */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
          <div className="px-6 py-5 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Appearance</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Switch between day and night mode
              </p>
            </div>
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-700 rounded-lg p-1">
              <button
                onClick={() => setTheme('light')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  theme === 'light'
                    ? 'bg-white dark:bg-slate-600 text-slate-800 dark:text-slate-100 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                <Sun size={14} />
                Light
              </button>
              <button
                onClick={() => setTheme('dark')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  theme === 'dark'
                    ? 'bg-white dark:bg-slate-600 text-slate-800 dark:text-slate-100 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                <Moon size={14} />
                Dark
              </button>
            </div>
          </div>
        </div>

        {/* Timezone */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
          <div className="px-6 py-5 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Timezone</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Used for dates, deadlines, and daily tasks
              </p>
            </div>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-64 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Meeting Notes */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
          <div className="px-6 py-5 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Meeting Notes Sort Order</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Sort meeting notes by created or last edited time
              </p>
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as MeetingNoteSortField)}
              className="w-64 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="updated_at">Last edited</option>
              <option value="created_at">Created</option>
            </select>
          </div>
        </div>

        {/* Hotkeys */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
          <div className="px-6 py-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Keyboard Shortcuts</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  Click a shortcut to reassign it
                </p>
              </div>
              <button
                onClick={resetToDefaults}
                className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              >
                Reset defaults
              </button>
            </div>
            <div className="space-y-6">
              {/* Navigation */}
              <div>
                <h3 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">Navigation</h3>
                <div className="space-y-3">
                  <HotkeyInput label="Go to Dashboard" description="" bindingKey="goToDashboard" />
                  <HotkeyInput label="Go to Focus" description="" bindingKey="goToFocus" />
                  <HotkeyInput label="Go to Todos" description="" bindingKey="goToTodos" />
                  <HotkeyInput label="Go to Projects" description="" bindingKey="goToProjects" />
                  <HotkeyInput label="Go to People" description="" bindingKey="goToPeople" />
                  <HotkeyInput label="Go to Meetings" description="" bindingKey="goToMeetings" />
                  <HotkeyInput label="Go to Recently Done" description="" bindingKey="goToDone" />
                </div>
              </div>

              {/* Sidebars */}
              <div>
                <h3 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">Sidebars</h3>
                <div className="space-y-3">
                  <HotkeyInput label="Toggle main sidebar" description="Navigation sidebar" bindingKey="toggleMainSidebar" />
                  <HotkeyInput label="Toggle secondary sidebar" description="Projects / People panel" bindingKey="toggleSecondarySidebar" />
                </div>
              </div>

              {/* Creation */}
              <div>
                <h3 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">Creation</h3>
                <div className="space-y-3">
                  <HotkeyInput label="New todo" description="Open new todo modal" bindingKey="newTodo" />
                  <HotkeyInput label="New meeting note" description="Create and open a new note" bindingKey="newMeetingNote" />
                </div>
              </div>

              {/* Todo Actions */}
              <div>
                <h3 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">Todo Actions</h3>
                <div className="space-y-3">
                  <HotkeyInput label="Mark done" description="Mark selected todo(s) as done" bindingKey="markDone" />
                  <HotkeyInput label="Toggle focus" description="Add/remove selected todo(s) from focus" bindingKey="toggleFocus" />
                  <HotkeyInput label="Edit todo" description="Open edit modal for selected todo" bindingKey="editTodo" />
                </div>
              </div>

              {/* View */}
              <div>
                <h3 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">View</h3>
                <div className="space-y-3">
                  <HotkeyInput label="Toggle theme" description="Switch between light and dark mode" bindingKey="toggleTheme" />
                  <HotkeyInput label="Focus search" description="Jump to search/filter input" bindingKey="focusSearch" />
                </div>
              </div>

              {/* Editor */}
              <div>
                <h3 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">Markdown Editor</h3>
                <div className="space-y-3">
                  <HotkeyInput label="Insert todo" description="Insert - [ ] at cursor" bindingKey="editorInsertTodo" />
                  <HotkeyInput label="Indent" description="Add leading indentation" bindingKey="editorIndent" />
                  <HotkeyInput label="Un-indent" description="Remove leading indentation" bindingKey="editorUnindent" />
                </div>
              </div>

              {/* Selection */}
              <div>
                <h3 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">Selection &amp; General</h3>
                <div className="space-y-3">
                  <HotkeyInput label="Select all" description="Select all visible todos" bindingKey="selectAll" />
                  <HotkeyInput label="Escape" description="Close modal / clear selection / go back" bindingKey="escape" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Todo Defaults */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
          <div className="px-6 py-5">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Todo Defaults</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 mb-4">
              Pre-fill fields when creating new todos
            </p>

            <div className="space-y-4">
              {/* Default Assignee (stored by name so restores survive person id changes) */}
              <div className="flex items-center justify-between gap-4">
                <label className="text-sm text-slate-700 dark:text-slate-300 shrink-0">
                  Default assignee
                </label>
                <select
                  value={defaults.assigneeName}
                  onChange={(e) => updateField('assigneeName', e.target.value)}
                  className="w-48 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">None</option>
                  {persons.map((p) => (
                    <option key={p.id} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                  {defaults.assigneeName && !persons.some((p) => p.name === defaults.assigneeName) && (
                    <option value={defaults.assigneeName}>
                      {defaults.assigneeName} (not found)
                    </option>
                  )}
                </select>
              </div>

              {/* Default Deadline to Today */}
              <div className="flex items-center justify-between gap-4">
                <label className="text-sm text-slate-700 dark:text-slate-300 shrink-0">
                  Auto-set deadline to today
                </label>
                <button
                  onClick={() => updateField('deadlineToToday', !defaults.deadlineToToday)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    defaults.deadlineToToday ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-600'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                      defaults.deadlineToToday ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Default Estimated Hours */}
              <div className="flex items-center justify-between gap-4">
                <label className="text-sm text-slate-700 dark:text-slate-300 shrink-0">
                  Default estimated hours
                </label>
                <input
                  type="number"
                  min="0.25"
                  step="0.25"
                  value={defaults.estimatedHours}
                  onChange={(e) => updateField('estimatedHours', e.target.value)}
                  className="w-24 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Default Importance */}
              <div className="flex items-center justify-between gap-4">
                <label className="text-sm text-slate-700 dark:text-slate-300 shrink-0">
                  Default importance
                </label>
                <select
                  value={defaults.importance}
                  onChange={(e) => updateField('importance', e.target.value)}
                  className="w-48 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {IMPORTANCE_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o.charAt(0).toUpperCase() + o.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
