import { Moon, Sun } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useTheme } from '../ThemeContext'
import { useTodoDefaults } from '../TodoDefaultsContext'
import { useTimezone } from '../TimezoneContext'
import { useMeetingNoteSort, type MeetingNoteSortField } from '../MeetingNoteSortContext'
import { fetchPersons } from '../api'

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

        {/* Todo Defaults */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
          <div className="px-6 py-5">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Todo Defaults</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 mb-4">
              Pre-fill fields when creating new todos
            </p>

            <div className="space-y-4">
              {/* Default Assignee */}
              <div className="flex items-center justify-between gap-4">
                <label className="text-sm text-slate-700 dark:text-slate-300 shrink-0">
                  Default assignee
                </label>
                <select
                  value={defaults.assigneeId}
                  onChange={(e) => updateField('assigneeId', e.target.value)}
                  className="w-48 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">None</option>
                  {persons.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
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
