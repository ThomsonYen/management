import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { MoreHorizontal } from 'lucide-react'
import { primaryNavItems, PRIMARY_TABS } from '../../navItems'
import MobileMoreSheet from './MobileMoreSheet'

export default function MobileTabBar() {
  const [moreOpen, setMoreOpen] = useState(false)
  const location = useLocation()
  const onSecondaryRoute = !PRIMARY_TABS.some((to) =>
    to === '/' ? location.pathname === '/' : location.pathname.startsWith(to)
  )

  return (
    <>
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-surface border-t border-border pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-5">
          {primaryNavItems.map((item) => {
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
          <button
            onClick={() => setMoreOpen(true)}
            className={`flex flex-col items-center justify-center gap-1 py-2 min-h-[3.5rem] transition-colors ${
              onSecondaryRoute ? 'text-accent-fg' : 'text-fg-muted'
            }`}
          >
            <MoreHorizontal size={20} />
            <span className="text-2xs font-medium leading-none">More</span>
          </button>
        </div>
      </nav>
      {moreOpen && <MobileMoreSheet onClose={() => setMoreOpen(false)} />}
    </>
  )
}
