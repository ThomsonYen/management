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
    <div className="fixed bottom-0 inset-x-0 z-50 pb-[env(safe-area-inset-bottom)] bg-elevated border-t border-border shadow-lg">
      <div className="flex items-center gap-3 px-4 py-3 text-sm text-fg">
        <Share size={18} className="text-accent flex-shrink-0" />
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
