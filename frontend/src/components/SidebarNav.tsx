import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useNavLayout } from '../SettingsContext'
import { LOCKED_NAV_ROUTE, layoutNavItems, moveNavRoute, type NavItem } from '../navItems'

const FOLDER_OPEN_LS_KEY = 'sidebar.navFolderOpen'
const TODO_DRAG_TYPE = 'application/x-todo-id'

function loadFolderOpen(): boolean {
  try {
    return localStorage.getItem(FOLDER_OPEN_LS_KEY) === '1'
  } catch {
    return false
  }
}

interface DropAt {
  route: string | null // null = the folder header (append to the folder)
  place: 'before' | 'after'
  folder: boolean
}

interface Props {
  collapsed: boolean
  /** Todo drag-to-Focus state and handlers, owned by the shell. */
  dragOverFocus: boolean
  onFocusDrop: (e: React.DragEvent) => void
  onFocusDragOver: (e: React.DragEvent) => void
  onFocusDragLeave: (e: React.DragEvent) => void
}

/**
 * The owner's sidebar tabs. Tabs can be dragged to reorder them, and dragged
 * onto (or within) the collapsible "More" folder to tuck them away. The layout
 * is saved to the user's settings; the folder's open state is per device.
 */
export default function SidebarNav({ collapsed, dragOverFocus, onFocusDrop, onFocusDragOver, onFocusDragLeave }: Props) {
  const { order, hidden, folded, setLayout } = useNavLayout()
  const { main, folder } = layoutNavItems(order, hidden, folded)
  const { pathname } = useLocation()
  const [folderOpen, setFolderOpen] = useState(loadFolderOpen)
  const [dragRoute, setDragRoute] = useState<string | null>(null)
  const [dropAt, setDropAt] = useState<DropAt | null>(null)

  const toggleFolder = (open = !folderOpen) => {
    setFolderOpen(open)
    try {
      localStorage.setItem(FOLDER_OPEN_LS_KEY, open ? '1' : '0')
    } catch { /* ignore */ }
  }

  const endDrag = () => {
    setDragRoute(null)
    setDropAt(null)
  }

  const commitDrop = () => {
    if (dragRoute && dropAt && dropAt.route !== dragRoute) {
      setLayout(moveNavRoute(order, folded, dragRoute, dropAt.route, dropAt.place, dropAt.folder))
      if (dropAt.folder) toggleFolder(true)
    }
    endDrag()
  }

  // The Dashboard tab can move within the main list but never into the folder.
  const canDropInFolder = dragRoute != null && dragRoute !== LOCKED_NAV_ROUTE
  const isActiveRoute = (to: string) => (to === '/' ? pathname === '/' : pathname.startsWith(to))

  const renderItem = (item: NavItem, inFolder: boolean) => {
    const Icon = item.icon
    const isFocusItem = item.isDropTarget
    const indicator = dropAt?.route === item.to && dragRoute !== item.to ? dropAt.place : null

    const handleDragOver = (e: React.DragEvent) => {
      if (isFocusItem && e.dataTransfer.types.includes(TODO_DRAG_TYPE)) return onFocusDragOver(e)
      if (!dragRoute || (inFolder && !canDropInFolder)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      const rect = e.currentTarget.getBoundingClientRect()
      const place = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
      if (dropAt?.route !== item.to || dropAt.place !== place) setDropAt({ route: item.to, place, folder: inFolder })
    }

    const handleDrop = (e: React.DragEvent) => {
      if (isFocusItem && e.dataTransfer.types.includes(TODO_DRAG_TYPE)) return onFocusDrop(e)
      if (!dragRoute) return
      e.preventDefault()
      commitDrop()
    }

    return (
      <div
        key={item.to}
        className="relative"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onDragLeave={isFocusItem ? onFocusDragLeave : undefined}
      >
        {indicator && (
          <div className={`absolute left-2 right-2 h-0.5 rounded-full bg-accent pointer-events-none ${indicator === 'before' ? '-top-px' : '-bottom-px'}`} />
        )}
        <NavLink
          to={item.to}
          end={item.end}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('application/x-nav-route', item.to)
            setDragRoute(item.to)
          }}
          onDragEnd={endDrag}
          title={collapsed ? item.label : undefined}
          className={({ isActive }) =>
            `w-full flex items-center ${collapsed ? 'justify-center' : 'gap-3'} px-3 ${inFolder ? 'py-1.5' : 'py-2'} rounded-md text-sm font-medium transition-colors mb-0.5 ${
              dragRoute === item.to ? 'opacity-40 ' : ''
            }${
              isFocusItem && dragOverFocus
                ? 'bg-accent text-fg-on-accent ring-2 ring-accent/40'
                : isActive
                  ? 'bg-accent-1 text-accent-fg'
                  : 'text-fg-muted hover:bg-inset hover:text-fg'
            }`
          }
        >
          <Icon size={inFolder ? 15 : 16} />
          {!collapsed && item.label}
          {!collapsed && isFocusItem && dragOverFocus && (
            <span className="ml-auto text-xs opacity-75">Drop here</span>
          )}
        </NavLink>
      </div>
    )
  }

  // An empty folder only appears while a tab is being dragged, as a drop target.
  const showFolder = folder.length > 0 || canDropInFolder
  const headerDropTarget = dropAt?.folder === true && dropAt.route == null
  const folderHasActive = !folderOpen && folder.some((n) => isActiveRoute(n.to))

  return (
    <nav className="flex-1 py-3 px-2 overflow-y-auto">
      {main.map((item) => renderItem(item, false))}

      {showFolder && (
        <div className="mt-2 pt-2 border-t border-border">
          <button
            onClick={() => toggleFolder()}
            onDragOver={(e) => {
              if (!canDropInFolder) return
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              if (!headerDropTarget) setDropAt({ route: null, place: 'after', folder: true })
            }}
            onDragLeave={(e) => {
              if (headerDropTarget && !e.currentTarget.contains(e.relatedTarget as Node)) setDropAt(null)
            }}
            onDrop={(e) => {
              if (!dragRoute) return
              e.preventDefault()
              commitDrop()
            }}
            title={collapsed ? 'More' : undefined}
            aria-expanded={folderOpen}
            className={`w-full flex items-center ${collapsed ? 'justify-center' : 'gap-1.5'} px-3 py-1.5 rounded-md text-xs font-medium transition-colors mb-0.5 ${
              headerDropTarget
                ? 'bg-accent-1 text-accent-fg ring-2 ring-accent/40'
                : folderHasActive
                  ? 'text-accent-fg hover:bg-inset'
                  : 'text-fg-subtle hover:bg-inset hover:text-fg-muted'
            }`}
          >
            <ChevronRight size={14} className={`transition-transform ${folderOpen ? 'rotate-90' : ''}`} />
            {!collapsed && <span>More</span>}
          </button>
          {folderOpen && (
            <div className={collapsed ? '' : 'ml-3 pl-1 border-l border-border'}>
              {folder.map((item) => renderItem(item, true))}
            </div>
          )}
        </div>
      )}
    </nav>
  )
}
