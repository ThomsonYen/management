import { useQuery } from '@tanstack/react-query'
import { fetchMe, type AuthUser } from '../api'

// The ['session'] query *is* the auth state (RequireAuth owns the redirect).
// A short staleTime plus refetch-on-focus means a member whose access changed
// (made view-only, disabled) re-syncs the next time they return to the tab.
export const sessionQueryOptions = {
  queryKey: ['session'] as const,
  queryFn: fetchMe,
  retry: false,
  staleTime: 60_000,
  refetchOnWindowFocus: true,
}

/** The signed-in user. Only valid under RequireAuth, which guarantees data. */
export function useSession(): AuthUser {
  const { data } = useQuery(sessionQueryOptions)
  return data as AuthUser
}

/** The signed-in user if already known, without triggering a fetch (safe above RequireAuth). */
export function useOptionalSession(): AuthUser | undefined {
  const { data } = useQuery({ ...sessionQueryOptions, enabled: false })
  return data
}

export function useIsOwner(): boolean {
  return useSession().role === 'owner'
}
