import { ReactNode } from 'react'
import { useIsRestoring, useQuery } from '@tanstack/react-query'
import { Navigate, useLocation } from 'react-router-dom'
import { fetchMe } from '../api'

export default function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation()
  // While the persisted cache is restoring, queries are paused with
  // fetchStatus 'idle', so v5's isLoading (isPending && isFetching) is false
  // even though there's no data yet — gate on isPending + isRestoring or this
  // redirects to /login before /auth/me is ever requested.
  const isRestoring = useIsRestoring()
  const { data, isPending, isError } = useQuery({
    queryKey: ['session'],
    queryFn: fetchMe,
    retry: false,
    staleTime: Infinity,
  })

  if (isRestoring || isPending) {
    return (
      <div className="flex h-screen items-center justify-center bg-app">
        <p className="text-sm text-fg-muted">Loading…</p>
      </div>
    )
  }
  if (isError || !data) {
    const next = location.pathname + location.search
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
  }
  return <>{children}</>
}
