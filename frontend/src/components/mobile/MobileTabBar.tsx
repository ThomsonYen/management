import { useState } from 'react'
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
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
  6: 'grid-cols-6',
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
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-surface border-t border-border pb-[env(safe-area-inset-bottom)]">
        <div className={`grid ${cols}`}>
          {items.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center gap-1 py-2 min-h-[3.5rem] transition-colors ${
                    isActive ? 'text-accent-fg' : 'text-fg-muted'
                  }`
                }
              >
                <Icon size={20} />
                <span className="text-2xs font-medium leading-none">{item.label}</span>
              </NavLink>
            )
          })}
          {hasMore && (
            <button
              onClick={() => setMoreOpen(true)}
              className={`flex flex-col items-center justify-center gap-1 py-2 min-h-[3.5rem] transition-colors ${
                onSecondaryRoute ? 'text-accent-fg' : 'text-fg-muted'
              }`}
            >
              <MoreHorizontal size={20} />
              <span className="text-2xs font-medium leading-none">More</span>
            </button>
          )}
        </div>
      </nav>
      {moreOpen && hasMore && <MobileMoreSheet items={moreItems} onClose={() => setMoreOpen(false)} />}
    </>
  )
}
