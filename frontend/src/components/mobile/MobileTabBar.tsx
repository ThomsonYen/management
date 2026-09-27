import { useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { MoreHorizontal } from 'lucide-react'
import { primaryNavItems, secondaryNavItems, settingsNavItem, type NavItem } from '../../navItems'
import MobileMoreSheet from './MobileMoreSheet'

interface Props {
  /** Tabs to show; defaults to the owner's primary tabs. */
  items?: NavItem[]
  /** Items behind the "More" button; pass [] to hide it. */
  moreItems?: NavItem[]
}

// Tailwind needs the full class names to exist in the source.
const COLS: Record<number, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
  6: 'grid-cols-6',
}

const TAB = 'flex flex-col items-center justify-center gap-1 pt-1.5 pb-1 min-h-[3.5rem] transition-colors'

/** Oval behind the active tab's icon. */
function TabPill({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <span
      className={`flex items-center justify-center h-7 w-14 rounded-full transition-colors duration-200 ${
        active ? 'bg-accent-1' : ''
      }`}
    >
      {children}
    </span>
  )
}

export default function MobileTabBar({ items = primaryNavItems, moreItems = [...secondaryNavItems, settingsNavItem] }: Props) {
  const [moreOpen, setMoreOpen] = useState(false)
  const location = useLocation()
  const hasMore = moreItems.length > 0
  const onSecondaryRoute = !items.some((item) =>
    item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to)
  )
  const cols = COLS[items.length + (hasMore ? 1 : 0)] ?? 'grid-cols-5'

  return (
    <>
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 chrome-glass border-t border-border/60 pb-[env(safe-area-inset-bottom)]">
        <div className={`grid ${cols}`}>
          {items.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `${TAB} ${isActive ? 'text-accent-fg' : 'text-fg-muted'}`}
              >
                {({ isActive }) => (
                  <>
                    <TabPill active={isActive}><Icon size={20} /></TabPill>
                    <span className={`text-2xs leading-none ${isActive ? 'font-semibold' : 'font-medium'}`}>{item.label}</span>
                  </>
                )}
              </NavLink>
            )
          })}
          {hasMore && (
            <button
              onClick={() => setMoreOpen(true)}
              className={`${TAB} ${onSecondaryRoute ? 'text-accent-fg' : 'text-fg-muted'}`}
            >
              <TabPill active={onSecondaryRoute}><MoreHorizontal size={20} /></TabPill>
              <span className={`text-2xs leading-none ${onSecondaryRoute ? 'font-semibold' : 'font-medium'}`}>More</span>
            </button>
          )}
        </div>
      </nav>
      {moreOpen && hasMore && <MobileMoreSheet items={moreItems} onClose={() => setMoreOpen(false)} />}
    </>
  )
}
