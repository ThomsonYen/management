import { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Navigate, useLocation } from 'react-router-dom'
import { fetchMe } from '../api'

export default function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['session'],
    queryFn: fetchMe,
    retry: false,
    staleTime: Infinity,
  })

  if (isLoading) {
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
