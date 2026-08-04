import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { APP_VERSION } from './config'
import { SettingsProvider } from './SettingsContext'
import { SuggestedNotesProvider } from './SuggestedNotesContext'
import { RecordingProvider } from './RecordingContext'
import { ToastProvider } from './ToastContext'
import './theme'      // applies saved theme CSS variables synchronously
import './index.css'
import { registerSW } from 'virtual:pwa-register'

// Auto-updating service worker (precached app shell; /api is never cached).
// iOS aggressively restores suspended PWAs, so also check for a new deploy
// whenever the app returns to the foreground.
registerSW({
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registration.update()
    })
  },
})

const CACHE_MAX_AGE = 24 * 60 * 60 * 1000 // keep last-known data for a day

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      // must be >= the persister's maxAge, or restored data is garbage-collected
      gcTime: CACHE_MAX_AGE,
      retry: 1,
    },
  },
})

const persister = createSyncStoragePersister({ storage: window.localStorage })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: CACHE_MAX_AGE,
        buster: APP_VERSION, // drop persisted cache when the app version changes
      }}
    >
      <BrowserRouter>
        <SettingsProvider>
          <ToastProvider>
            <SuggestedNotesProvider>
              <RecordingProvider>
                <App />
              </RecordingProvider>
            </SuggestedNotesProvider>
          </ToastProvider>
        </SettingsProvider>
      </BrowserRouter>
    </PersistQueryClientProvider>
  </React.StrictMode>,
)
