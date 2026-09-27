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

export function layoutNavItems(order: string[], hidden: string[], folded: string[] = []) {
  const hiddenSet = new Set(hidden.filter((to) => to !== LOCKED_NAV_ROUTE))
  const foldedSet = new Set(folded.filter((to) => to !== LOCKED_NAV_ROUTE))
  const shown = orderNavItems(order).filter((n) => !hiddenSet.has(n.to))
  const main = shown.filter((n) => !foldedSet.has(n.to))
  const folder = shown.filter((n) => foldedSet.has(n.to))
  // On mobile the folder has no place of its own: its tabs go in the More sheet.
  const primary = main.filter((n) => PRIMARY_TABS.includes(n.to))
  return {
    main,
    folder,
    primary,
    secondary: [...main.filter((n) => !primary.includes(n)), ...folder],
  }
}

/**
 * Move `route` next to `target` (or to the end when target is null) and put it
 * in or out of the folder. Returns the full new order and folded list; the
 * Dashboard tab never goes into the folder.
 */
export function moveNavRoute(
  order: string[],
  folded: string[],
  route: string,
  target: string | null,
  place: 'before' | 'after',
  intoFolder: boolean,
): { nav_order: string[]; nav_folded: string[] } {
  const routes = orderNavItems(order).map((n) => n.to).filter((to) => to !== route)
  const at = target == null ? -1 : routes.indexOf(target)
  if (at === -1) routes.push(route)
  else routes.splice(place === 'after' ? at + 1 : at, 0, route)
  const rest = folded.filter((to) => to !== route)
  const fold = intoFolder && route !== LOCKED_NAV_ROUTE
  return { nav_order: routes, nav_folded: fold ? [...rest, route] : rest }
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
