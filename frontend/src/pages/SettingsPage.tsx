import { useState, useEffect, useRef } from 'react'
import { Moon, Sun, FolderOpen, Plus, RefreshCw, Trash2, Loader2, Mic } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getSystemAudioDevice,
  setSystemAudioDevice,
  type SystemAudioDevice,
} from '../RecordingContext'
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
import { fetchPersons, fetchVaults, createVault, deleteVault, rescanVault } from '../api'

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

function RecordingSection() {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [selected, setSelected] = useState<SystemAudioDevice | null>(getSystemAudioDevice())
  const [permission, setPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown')
  const [loading, setLoading] = useState(false)

  const loadDevices = async () => {
    setLoading(true)
    try {
      const all = await navigator.mediaDevices.enumerateDevices()
      const inputs = all.filter((d) => d.kind === 'audioinput')
      setDevices(inputs)
      // Labels are empty until mic permission is granted at least once.
      if (inputs.some((d) => d.label)) setPermission('granted')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDevices()
    const handler = () => loadDevices()
    navigator.mediaDevices?.addEventListener?.('devicechange', handler)
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const requestPermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((t) => t.stop())
      setPermission('granted')
      await loadDevices()
    } catch {
      setPermission('denied')
    }
  }

  const choose = (deviceId: string) => {
    if (!deviceId) {
      setSystemAudioDevice(null)
      setSelected(null)
      return
    }
    const dev = devices.find((d) => d.deviceId === deviceId)
    if (!dev) return
    const next = { deviceId: dev.deviceId, label: dev.label || 'Unnamed device' }
    setSystemAudioDevice(next)
    setSelected(next)
  }

  const labelsHidden = devices.length > 0 && !devices.some((d) => d.label)

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
      <div className="px-6 py-5">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Mic size={16} /> Recording
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Pick a virtual loopback device to capture system audio without the screen-share prompt.
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {permission !== 'granted' && labelsHidden && (
            <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
              <p className="text-xs text-amber-800 dark:text-amber-300 leading-tight">
                Grant microphone permission once to see your input devices by name.
              </p>
              <button
                onClick={requestPermission}
                className="text-xs font-medium px-3 py-1.5 bg-amber-600 text-white rounded-md hover:bg-amber-700 transition-colors flex-shrink-0"
              >
                Grant access
              </button>
            </div>
          )}

          <div className="flex items-center justify-between gap-4">
            <label className="text-sm text-slate-700 dark:text-slate-300 shrink-0">
              System audio device
            </label>
            <select
              value={selected?.deviceId ?? ''}
              onChange={(e) => choose(e.target.value)}
              disabled={loading}
              className="w-72 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">None — use screen-share prompt</option>
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Input (${d.deviceId.slice(0, 6)}…)`}
                </option>
              ))}
              {selected && !devices.some((d) => d.deviceId === selected.deviceId) && (
                <option value={selected.deviceId}>{selected.label} (not connected)</option>
              )}
            </select>
          </div>

          <details className="text-xs text-slate-500 dark:text-slate-400">
            <summary className="cursor-pointer hover:text-slate-700 dark:hover:text-slate-300">
              How to set up loopback on macOS
            </summary>
            <ol className="list-decimal list-inside mt-2 space-y-1 leading-relaxed pl-1">
              <li>
                Install{' '}
                <a
                  href="https://github.com/ExistentialAudio/BlackHole"
                  target="_blank"
                  rel="noreferrer"
                  className="text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  BlackHole 2ch
                </a>{' '}
                (free virtual audio driver).
              </li>
              <li>
                Open <span className="font-mono">Audio MIDI Setup</span> → create a{' '}
                <em>Multi-Output Device</em> that includes your speakers/headphones <em>and</em>{' '}
                BlackHole. Set this as your Mac's output so audio is both audible and piped to
                BlackHole.
              </li>
              <li>Pick "BlackHole 2ch" in the selector above.</li>
              <li>
                Recording with "System audio" checked will now capture mic + system audio with zero
                extra prompts.
              </li>
            </ol>
          </details>
        </div>
      </div>
    </div>
  )
}

function VaultsSection() {
  const queryClient = useQueryClient()
  const { data: vaults = [], isLoading } = useQuery({ queryKey: ['vaults'], queryFn: fetchVaults })
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  const [error, setError] = useState<string | null>(null)

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['vaults'] })
    queryClient.invalidateQueries({ queryKey: ['notes'] })
    queryClient.invalidateQueries({ queryKey: ['tags'] })
  }

  const createMutation = useMutation({
    mutationFn: createVault,
    onSuccess: () => {
      setShowAdd(false)
      setName('')
      setPath('')
      setError(null)
      invalidateAll()
    },
    onError: (e: any) => setError(e?.response?.data?.detail ?? e.message ?? 'Failed to add vault'),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteVault,
    onSuccess: invalidateAll,
  })

  const rescanMutation = useMutation({
    mutationFn: rescanVault,
    onSuccess: invalidateAll,
  })

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
      <div className="px-6 py-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <FolderOpen size={16} /> Vaults
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Point the app at folders on disk (e.g. an Obsidian vault) to index their <code className="font-mono text-xs">.md</code> files.
            </p>
          </div>
          {!showAdd && (
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <Plus size={14} /> Add vault
            </button>
          )}
        </div>

        {showAdd && (
          <div className="mb-4 p-4 border border-slate-200 dark:border-slate-700 rounded-lg space-y-3 bg-slate-50 dark:bg-slate-900/30">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="my-obsidian"
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Absolute path</label>
              <input
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="/Users/me/Documents/Obsidian"
                className="w-full px-3 py-2 text-sm font-mono border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                The app will scan this folder, stamp a <code className="font-mono">mgmt_id</code> into each note's YAML frontmatter, and index tags. Your other frontmatter keys are preserved.
              </p>
            </div>
            {error && (
              <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded px-3 py-2">{error}</div>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={() => createMutation.mutate({ name: name.trim(), root_path: path.trim() })}
                disabled={!name.trim() || !path.trim() || createMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {createMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                {createMutation.isPending ? 'Scanning…' : 'Add & scan'}
              </button>
              <button
                onClick={() => { setShowAdd(false); setError(null) }}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {isLoading ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : vaults.length === 0 ? (
          <p className="text-xs text-slate-400">No vaults yet.</p>
        ) : (
          <ul className="space-y-2">
            {vaults.map((v) => (
              <li
                key={v.id}
                className="flex items-center justify-between gap-3 px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/30"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{v.name}</span>
                    {v.is_managed && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 uppercase tracking-wider">Managed</span>
                    )}
                    <span className="text-xs text-slate-400">{v.note_count} note{v.note_count !== 1 ? 's' : ''}</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">{v.root_path}</p>
                  {v.last_scan_at && (
                    <p className="text-[10px] text-slate-400 mt-0.5">Last scan: {new Date(v.last_scan_at).toLocaleString()}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => rescanMutation.mutate(v.id)}
                    disabled={rescanMutation.isPending && rescanMutation.variables === v.id}
                    className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded transition-colors"
                    title="Rescan now"
                  >
                    {rescanMutation.isPending && rescanMutation.variables === v.id ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  </button>
                  {!v.is_managed && (
                    <button
                      onClick={() => {
                        if (confirm(`Stop watching "${v.name}"? Files on disk won't be touched.`)) {
                          deleteMutation.mutate(v.id)
                        }
                      }}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                      title="Remove vault (files stay on disk)"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
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

        <RecordingSection />

        <VaultsSection />

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
                  <HotkeyInput label="Open command palette" description="Global search and actions" bindingKey="openCommandPalette" />
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
