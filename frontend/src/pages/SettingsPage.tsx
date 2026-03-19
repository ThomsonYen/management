import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../ThemeContext'

export default function SettingsPage() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-6">Settings</h1>

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
    </div>
  )
}
