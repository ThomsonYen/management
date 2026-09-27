import { APP_VERSION } from '../config'
import { AppLogo } from './ui/AppLogo'

/** Top of the desktop sidebar (owner and member shells). Left-aligned so the logo
 *  sits on the same line as the nav icons below it. */
export default function SidebarBrand({ collapsed }: { collapsed: boolean }) {
  return (
    <div className={`flex items-center h-16 flex-shrink-0 ${collapsed ? 'justify-center px-2' : 'gap-3 px-4'}`}>
      <AppLogo className="w-8 h-8" />
      {!collapsed && (
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-lg font-semibold tracking-tight text-fg leading-none">Tracker</span>
          <span className="text-2xs font-medium text-fg-faint tabular-nums leading-none">v{APP_VERSION}</span>
        </div>
      )}
    </div>
  )
}
