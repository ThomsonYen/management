import { useCallback } from 'react'
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ChevronsLeft, ChevronsRight, LayoutDashboard, Moon, Settings, Sun } from 'lucide-react'
import { useResizableSidebar } from '../../hooks/useResizableSidebar'
import { useHotkeys, useTheme } from '../../SettingsContext'
import { useHotkey } from '../../hooks/useHotkey'
import { useSession } from '../../hooks/useSession'
import { APP_VERSION } from '../../config'
import { memberNavItems, memberPrimaryNavItems, routeTitle } from '../../navItems'
import { Badge } from '../ui'
import MobileHeader from '../mobile/MobileHeader'
import MobileTabBar from '../mobile/MobileTabBar'
import InstallHint from '../mobile/InstallHint'
import MyItemsPage from '../../pages/member/MyItemsPage'
import MemberTodoPage from '../../pages/member/MemberTodoPage'
import MemberNotesPage from '../../pages/member/MemberNotesPage'
import MemberNotePage from '../../pages/member/MemberNotePage'
import RecentlyDonePage from '../../pages/RecentlyDonePage'
import SettingsPage from '../../pages/SettingsPage'

/** Owner-shared /meeting-notes/:id links land on the member note view. */
function MeetingNoteRedirect() {
  const { id } = useParams<{ id: string }>()
  return <Navigate to={`/notes/${id}`} replace />
}

/**
 * The shell for member accounts: a deliberately small app (their items,
 * what they finished, notes shared with them, settings). The backend scopes
 * every response; this shell simply never offers what the owner keeps.
 */
export default function MemberShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useSession()
  const { width: sidebarWidth, collapsed: sidebarCollapsed, startResize, toggleCollapsed: toggleSidebar } =
    useResizableSidebar('sidebarWidth', 224)
  const { bindings } = useHotkeys()
  const { theme, setTheme } = useTheme()
  const canEdit = user.access_level === 'edit'

  useHotkey(bindings.toggleMainSidebar, useCallback(() => toggleSidebar(), [toggleSidebar]))
  useHotkey(bindings.goToDashboard, useCallback(() => navigate('/'), [navigate]))
  useHotkey(bindings.goToDone, useCallback(() => navigate('/done'), [navigate]))
  useHotkey(bindings.goToNotes, useCallback(() => navigate('/notes'), [navigate]))
  useHotkey(bindings.toggleTheme, useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [theme, setTheme]))

  return (
    <div className="flex h-dvh bg-app overflow-hidden">
      <aside
        style={{ width: sidebarCollapsed ? 56 : sidebarWidth }}
        className="bg-surface border-r border-border text-fg hidden md:flex flex-col flex-shrink-0 relative transition-[width] duration-200"
      >
        <div className={`py-5 border-b border-border ${sidebarCollapsed ? 'px-2' : 'px-5'}`}>
          <div className="flex items-center gap-2.5 justify-center">
            <div className="w-7 h-7 bg-accent rounded-md flex items-center justify-center flex-shrink-0">
              <LayoutDashboard size={14} className="text-fg-on-accent" />
            </div>
            {!sidebarCollapsed && (
              <div>
                <h1 className="text-sm font-semibold tracking-tight text-fg leading-none">Management</h1>
                <p className="text-fg-subtle text-xs mt-0.5 leading-none">Work tracker · v{APP_VERSION}</p>
              </div>
            )}
          </div>
        </div>
        <nav className="flex-1 py-3 px-2">
          {memberNavItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                title={sidebarCollapsed ? item.label : undefined}
                className={({ isActive }) =>
                  `w-full flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3'} px-3 py-2 rounded-md text-sm font-medium transition-colors mb-0.5 ${
                    isActive ? 'bg-accent-1 text-accent-fg' : 'text-fg-muted hover:bg-inset hover:text-fg'
                  }`
                }
              >
                <Icon size={16} />
                {!sidebarCollapsed && item.label}
              </NavLink>
            )
          })}
        </nav>
        <div className="border-t border-border">
          {!sidebarCollapsed && (
            <div className="px-5 py-3 border-b border-border">
              <p className="text-fg-subtle text-xs">Signed in as</p>
              <p className="text-sm font-medium text-fg truncate" title={user.username}>
                {user.person_name ?? user.username}
              </p>
              <Badge tone={canEdit ? 'success' : 'warning'} size="sm" className="mt-1.5">
                {canEdit ? 'Can edit own items' : 'View only'}
              </Badge>
            </div>
          )}
          <div className="px-2 py-2">
            <NavLink
              to="/settings"
              title={sidebarCollapsed ? 'Settings' : undefined}
              className={({ isActive }) =>
                `w-full flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3'} px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive ? 'bg-accent-1 text-accent-fg' : 'text-fg-muted hover:bg-inset hover:text-fg'
                }`
              }
            >
              <Settings size={16} />
              {!sidebarCollapsed && 'Settings'}
            </NavLink>
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              title={sidebarCollapsed ? (theme === 'dark' ? 'Switch to light' : 'Switch to dark') : undefined}
              className={`mt-0.5 w-full flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3'} px-3 py-2 rounded-md text-sm font-medium transition-colors text-fg-muted hover:bg-inset hover:text-fg`}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              {!sidebarCollapsed && (theme === 'dark' ? 'Light mode' : 'Dark mode')}
            </button>
          </div>
          <div className="px-2 py-2 border-t border-border">
            <button
              onClick={toggleSidebar}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm text-fg-muted hover:bg-inset hover:text-fg transition-colors"
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
              {!sidebarCollapsed && <span className="text-xs">Collapse</span>}
            </button>
          </div>
        </div>
        {!sidebarCollapsed && (
          <div
            onMouseDown={startResize}
            className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-accent/50 active:bg-accent/50 transition-colors"
          />
        )}
      </aside>

      <main className="flex-1 overflow-auto bg-app pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
        <MobileHeader title={routeTitle(location.pathname, memberNavItems)} />
        <Routes>
          <Route path="/" element={<MyItemsPage />} />
          <Route path="/todos/:id" element={<MemberTodoPage />} />
          <Route path="/done" element={<RecentlyDonePage />} />
          <Route path="/notes" element={<MemberNotesPage />} />
          <Route path="/notes/:id" element={<MemberNotePage />} />
          <Route path="/meeting-notes/:id" element={<MeetingNoteRedirect />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <MobileTabBar items={memberPrimaryNavItems} moreItems={[]} />
      <InstallHint />
    </div>
  )
}
