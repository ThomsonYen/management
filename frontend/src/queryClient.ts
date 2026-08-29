import { QueryClient } from '@tanstack/react-query'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'

/** Keep last-known data for a day (persisted to localStorage, see main.tsx). */
export const CACHE_MAX_AGE = 24 * 60 * 60 * 1000

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      // must be >= the persister's maxAge, or restored data is garbage-collected
      gcTime: CACHE_MAX_AGE,
      retry: 1,
    },
  },
})

export const persister = createSyncStoragePersister({ storage: window.localStorage })
