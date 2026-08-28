import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useToast } from '../ToastContext'

/**
 * Surfaces 403s (dispatched by the axios interceptor as `api:forbidden`) as a
 * toast instead of bouncing to /login, and re-checks the session so a member
 * whose access was reduced sees the UI update.
 */
export default function ApiErrorToaster() {
  const { showToast } = useToast()
  const queryClient = useQueryClient()
  const lastShown = useRef(0)

  useEffect(() => {
    const handler = (e: Event) => {
      const now = Date.now()
      if (now - lastShown.current < 2000) return
      lastShown.current = now
      const detail = (e as CustomEvent).detail
      showToast({
        message: typeof detail === 'string' ? detail : 'You do not have access to that',
        tone: 'danger',
      })
      queryClient.invalidateQueries({ queryKey: ['session'] })
    }
    window.addEventListener('api:forbidden', handler)
    return () => window.removeEventListener('api:forbidden', handler)
  }, [showToast, queryClient])

  return null
}
