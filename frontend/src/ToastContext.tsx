import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { config } from './config'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastOptions {
  message: string
  action?: ToastAction
  durationMs?: number
  tone?: 'default' | 'success' | 'danger'
}

interface ToastRecord extends Required<Pick<ToastOptions, 'message' | 'tone'>> {
  id: number
  action?: ToastAction
  durationMs: number
  expiresAt: number
  remainingSeconds: number
}

interface ToastContextValue {
  showToast: (opts: ToastOptions) => number
  dismissToast: (id: number) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([])
  const idRef = useRef(0)

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const showToast = useCallback((opts: ToastOptions) => {
    const id = ++idRef.current
    const durationMs = opts.durationMs ?? config.undo_toast_seconds * 1000
    const expiresAt = Date.now() + durationMs
    const record: ToastRecord = {
      id,
      message: opts.message,
      tone: opts.tone ?? 'default',
      action: opts.action,
      durationMs,
      expiresAt,
      remainingSeconds: Math.ceil(durationMs / 1000),
    }
    setToasts((prev) => [...prev, record])
    return id
  }, [])

  useEffect(() => {
    if (toasts.length === 0) return
    const tick = setInterval(() => {
      const now = Date.now()
      setToasts((prev) => {
        const next = prev
          .map((t) => ({ ...t, remainingSeconds: Math.max(0, Math.ceil((t.expiresAt - now) / 1000)) }))
          .filter((t) => t.expiresAt > now)
        return next.length === prev.length && next.every((t, i) => t.remainingSeconds === prev[i].remainingSeconds)
          ? prev
          : next
      })
    }, 250)
    return () => clearInterval(tick)
  }, [toasts.length])

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => {
          const toneStyle =
            t.tone === 'success'
              ? 'bg-success text-white border-success'
              : t.tone === 'danger'
                ? 'bg-danger text-white border-danger'
                : 'bg-fg text-app border-fg'
          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg shadow-overlay border min-w-[280px] max-w-md animate-[fadeIn_0.15s_ease-out] ${toneStyle}`}
              role="status"
            >
              <span className="flex-1 text-sm">{t.message}</span>
              {t.action && (
                <button
                  onClick={() => {
                    t.action!.onClick()
                    dismissToast(t.id)
                  }}
                  className="text-xs font-semibold px-2.5 py-1 rounded-md bg-white/15 hover:bg-white/25 transition-colors"
                >
                  {t.action.label}
                  <span className="ml-1.5 opacity-70">({t.remainingSeconds}s)</span>
                </button>
              )}
              <button
                onClick={() => dismissToast(t.id)}
                aria-label="Dismiss"
                className="opacity-60 hover:opacity-100 transition-opacity text-lg leading-none"
              >
                ×
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
