import { LayoutDashboard, CheckSquare, FolderKanban, Users, CheckCircle2, Crosshair, Settings, FileText, Target, BarChart3, Trash2, NotebookPen } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end: boolean
  isDropTarget?: boolean
}

export const navItems: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/focus', label: 'Focus', icon: Crosshair, end: false, isDropTarget: true },
  { to: '/todos', label: 'Todos', icon: CheckSquare, end: false },
  { to: '/projects', label: 'Projects', icon: FolderKanban, end: false },
  { to: '/people', label: 'People', icon: Users, end: false },
  { to: '/meeting-notes', label: 'Meetings', icon: FileText, end: false },
  { to: '/notes', label: 'Notes', icon: NotebookPen, end: false },
  { to: '/weekly-goals', label: 'Weekly Goals', icon: Target, end: false },
  { to: '/progress', label: 'Progress', icon: BarChart3, end: false },
  { to: '/done', label: 'Recently Done', icon: CheckCircle2, end: false },
  { to: '/deleted', label: 'Recently Deleted', icon: Trash2, end: false },
]

// Routes shown as bottom-tab items on mobile; everything else goes in the More sheet.
export const PRIMARY_TABS = ['/', '/focus', '/todos', '/notes']

export const primaryNavItems = PRIMARY_TABS.map((to) => navItems.find((n) => n.to === to)!)
export const secondaryNavItems = navItems.filter((n) => !PRIMARY_TABS.includes(n.to))

export const settingsNavItem: NavItem = { to: '/settings', label: 'Settings', icon: Settings, end: false }

const detailTitles: Array<[prefix: string, title: string]> = [
  ['/todos/', 'Todo'],
  ['/meeting-notes/', 'Meeting'],
  ['/notes/', 'Note'],
]

export function routeTitle(pathname: string): string {
  for (const [prefix, title] of detailTitles) {
    if (pathname.startsWith(prefix) && pathname.length > prefix.length) return title
  }
  if (pathname.startsWith('/settings')) return settingsNavItem.label
  let best: NavItem | undefined
  for (const item of navItems) {
    if (item.to === '/' ? pathname === '/' : pathname.startsWith(item.to)) {
      if (!best || item.to.length > best.to.length) best = item
    }
  }
  return best?.label ?? 'Management'
}
