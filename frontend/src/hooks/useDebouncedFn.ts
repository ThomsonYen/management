import { useCallback, useEffect, useRef } from 'react'

/**
 * Debounced callback with optional max-wait cap.
 *
 * - `call(...args)` schedules `fn` to fire after `idleMs` of inactivity.
 * - If `maxMs` is set, `fn` is forced to fire at most that long after the
 *   first dirty call in a series — even if the user keeps calling `call`.
 * - `flush()` fires the pending call immediately with its last args.
 * - `cancel()` drops the pending call.
 * - On unmount, a pending call is flushed (last args delivered).
 *
 * `fn` is read via ref, so closures over fresh state work without re-creating
 * the debouncer on every render.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useDebouncedFn<T extends (...args: any[]) => void>(
  fn: T,
  options: { idleMs: number; maxMs?: number },
) {
  const { idleMs, maxMs } = options
  const fnRef = useRef(fn)
  fnRef.current = fn
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastArgs = useRef<Parameters<T> | null>(null)
  const firstDirtyAt = useRef<number | null>(null)

  const clearTimer = () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }

  const flush = useCallback(() => {
    if (!timer.current) return
    clearTimer()
    const args = lastArgs.current
    firstDirtyAt.current = null
    lastArgs.current = null
    if (args) fnRef.current(...args)
  }, [])

  const cancel = useCallback(() => {
    clearTimer()
    firstDirtyAt.current = null
    lastArgs.current = null
  }, [])

  const call = useCallback(
    (...args: Parameters<T>) => {
      lastArgs.current = args
      const now = Date.now()
      if (firstDirtyAt.current === null) firstDirtyAt.current = now
      const idleDeadline = now + idleMs
      const maxDeadline = maxMs != null ? firstDirtyAt.current + maxMs : Infinity
      const delay = Math.max(0, Math.min(idleDeadline, maxDeadline) - now)
      clearTimer()
      timer.current = setTimeout(() => {
        timer.current = null
        const a = lastArgs.current
        firstDirtyAt.current = null
        lastArgs.current = null
        if (a) fnRef.current(...a)
      }, delay)
    },
    [idleMs, maxMs],
  )

  // Flush on unmount so pending work isn't dropped.
  useEffect(() => () => flush(), [flush])

  return { call, flush, cancel }
}
