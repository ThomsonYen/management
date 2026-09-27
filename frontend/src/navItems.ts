import { LayoutDashboard, CheckSquare, FolderKanban, Users, CheckCircle2, Crosshair, Settings, FileText, Target, BarChart3, Trash2, NotebookPen, ListChecks, HeartHandshake } from 'lucide-react'
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
  { to: '/social', label: 'Social', icon: HeartHandshake, end: false },
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

// The home tab: always shown, so the sidebar can never end up empty.
export const LOCKED_NAV_ROUTE = '/'

/**
 * Apply a user's saved layout to the owner tabs. `order` lists routes in the
 * user's order; tabs it doesn't mention (e.g. added in a later release) keep
 * their default position after the listed ones. Unknown routes are ignored.
 */
export function orderNavItems(order: string[]): NavItem[] {
  const rank = new Map(order.map((to, i) => [to, i]))
  return navItems
    .map((item, i) => ({ item, key: rank.get(item.to) ?? order.length + i }))
    .sort((a, b) => a.key - b.key)
    .map(({ item }) => item)
}

export function layoutNavItems(order: string[], hidden: string[]) {
  const hiddenSet = new Set(hidden.filter((to) => to !== LOCKED_NAV_ROUTE))
  const visible = orderNavItems(order).filter((n) => !hiddenSet.has(n.to))
  return {
    visible,
    primary: visible.filter((n) => PRIMARY_TABS.includes(n.to)),
    secondary: visible.filter((n) => !PRIMARY_TABS.includes(n.to)),
  }
}

export const settingsNavItem: NavItem = { to: '/settings', label: 'Settings', icon: Settings, end: false }

// Member accounts get a deliberately small shell: their items, what they've
// finished, notes shared with them, and settings. No More sheet.
export const memberNavItems: NavItem[] = [
  { to: '/', label: 'My items', icon: ListChecks, end: true },
  { to: '/done', label: 'Done', icon: CheckCircle2, end: false },
  { to: '/notes', label: 'Notes', icon: NotebookPen, end: false },
]
export const memberPrimaryNavItems: NavItem[] = [...memberNavItems, settingsNavItem]

const detailTitles: Array<[prefix: string, title: string]> = [
  ['/todos/', 'Todo'],
  ['/meeting-notes/', 'Meeting'],
  ['/notes/', 'Note'],
]

export function routeTitle(pathname: string, items: NavItem[] = navItems): string {
  for (const [prefix, title] of detailTitles) {
    if (pathname.startsWith(prefix) && pathname.length > prefix.length) return title
  }
  if (pathname.startsWith('/settings')) return settingsNavItem.label
  let best: NavItem | undefined
  for (const item of items) {
    if (item.to === '/' ? pathname === '/' : pathname.startsWith(item.to)) {
      if (!best || item.to.length > best.to.length) best = item
    }
  }
  return best?.label ?? 'Management'
}
