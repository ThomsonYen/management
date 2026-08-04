import { NavLink } from 'react-router-dom'
import { Sun, Moon } from 'lucide-react'
import { useTheme } from '../../SettingsContext'
import { secondaryNavItems, settingsNavItem } from '../../navItems'

export default function MobileMoreSheet({ onClose }: { onClose: () => void }) {
  const { theme, setTheme } = useTheme()
  const items = [...secondaryNavItems, settingsNavItem]

  return (
    <div className="fixed inset-0 z-50 bg-black/40 md:hidden" onClick={onClose}>
      <div
        className="absolute bottom-0 inset-x-0 bg-elevated border-t border-border rounded-t-2xl max-h-[75dvh] overflow-y-auto pb-[calc(0.5rem+env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center py-2.5">
          <div className="w-9 h-1 rounded-full bg-border" />
        </div>
        {items.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors ${
                  isActive ? 'bg-accent-1 text-accent-fg' : 'text-fg-muted active:bg-inset'
                }`
              }
            >
              <Icon size={18} />
              {item.label}
            </NavLink>
          )
        })}
        <div className="border-t border-border mt-1 pt-1">
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-fg-muted active:bg-inset transition-colors"
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
        </div>
      </div>
    </div>
  )
}
