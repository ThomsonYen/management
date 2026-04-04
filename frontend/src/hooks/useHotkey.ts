import { useEffect } from 'react'
import { matchesBinding } from '../HotkeysContext'

interface UseHotkeyOptions {
  /** Fire even when an input/textarea/select is focused (useful for Escape) */
  skipInputCheck?: boolean
}

export function useHotkey(binding: string, callback: () => void, options?: UseHotkeyOptions) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!options?.skipInputCheck) {
        const tag = (e.target as HTMLElement).tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        if ((e.target as HTMLElement).isContentEditable) return
      }

      if (matchesBinding(e, binding)) {
        e.preventDefault()
        callback()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [binding, callback, options?.skipInputCheck])
}
