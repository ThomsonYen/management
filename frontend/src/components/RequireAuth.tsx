import { ReactNode } from 'react'
import { useIsRestoring, useQuery } from '@tanstack/react-query'
import { Navigate, useLocation } from 'react-router-dom'
import { sessionQueryOptions } from '../hooks/useSession'

export default function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation()
  // While the persisted cache is restoring, queries are paused with
  // fetchStatus 'idle', so v5's isLoading (isPending && isFetching) is false
  // even though there's no data yet — gate on isPending + isRestoring or this
  // redirects to /login before /auth/me is ever requested.
  const isRestoring = useIsRestoring()
  const { data, isPending, error } = useQuery(sessionQueryOptions)

  if (isRestoring || (isPending && !data)) {
    return (
      <div className="flex h-screen items-center justify-center bg-app">
        <p className="text-sm text-fg-muted">Loading…</p>
      </div>
    )
  }
  // Redirect only when the server actually rejected the session. A background
  // network error while data is cached must not log an installed PWA out.
  const status = (error as { response?: { status?: number } } | null)?.response?.status
  if (!data || status === 401) {
    const next = location.pathname + location.search
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
  }
  return <>{children}</>
}
