import { useState } from 'react'
import { Share, X } from 'lucide-react'

const DISMISS_KEY = 'pwa.installHintDismissed.v1'

const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent)
const isStandalone = window.matchMedia('(display-mode: standalone)').matches

function wasDismissed(): boolean {
  try { return localStorage.getItem(DISMISS_KEY) === '1' } catch { return false }
}

/**
 * iOS has no install prompt API — the only path is Safari's Share sheet →
 * "Add to Home Screen". Show a small dismissible hint in browser-tab mode.
 */
export default function InstallHint() {
  const [dismissed, setDismissed] = useState(wasDismissed)

  if (!isIOS || isStandalone || dismissed) return null

  const dismiss = () => {
    setDismissed(true)
    try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* ignore */ }
  }

  return (
    <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-[calc(1rem+env(safe-area-inset-bottom))] inset-x-3 md:inset-x-auto md:right-4 md:max-w-sm z-50 bg-elevated border border-border rounded-2xl shadow-lg">
      <div className="flex items-center gap-3 pl-3 pr-4 py-2.5 text-sm text-fg">
        <span className="flex items-center justify-center h-8 w-8 rounded-full bg-accent-1 text-accent flex-shrink-0">
          <Share size={16} />
        </span>
        <span>
          Install this app: tap <span className="font-medium">Share</span>, then{' '}
          <span className="font-medium">Add to Home Screen</span>
        </span>
        <button
          onClick={dismiss}
          aria-label="Dismiss install hint"
          className="ml-auto p-2 -m-1 text-fg-subtle hover:text-fg"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
