import React from 'react'
import ReactDOM from 'react-dom/client'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { APP_VERSION } from './config'
import { CACHE_MAX_AGE, persister, queryClient } from './queryClient'
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

// Admin data (accounts, invite links, member activity) is never written to
// localStorage; everything else is purged on login/logout (utils/deviceState).
const NEVER_PERSISTED = new Set(['users', 'invite', 'user-audit'])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: CACHE_MAX_AGE,
        buster: APP_VERSION, // drop persisted cache when the app version changes
        dehydrateOptions: {
          // Same rule as the library default (successful queries only), minus the admin keys.
          shouldDehydrateQuery: (query) =>
            query.state.status === 'success' && !NEVER_PERSISTED.has(String(query.queryKey[0])),
        },
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
