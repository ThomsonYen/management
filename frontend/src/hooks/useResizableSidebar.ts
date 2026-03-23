import { useState, useCallback, useEffect, useRef } from 'react'

const MIN_WIDTH = 160
const MAX_WIDTH = 500

export function useResizableSidebar(storageKey: string, defaultWidth: number) {
  const [width, setWidth] = useState(() => {
    const saved = localStorage.getItem(storageKey)
    if (saved) {
      const n = parseInt(saved, 10)
      if (n >= MIN_WIDTH && n <= MAX_WIDTH) return n
    }
    return defaultWidth
  })
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem(storageKey + ':collapsed') === 'true'
  })
  const isResizing = useRef(false)

  useEffect(() => {
    localStorage.setItem(storageKey, String(width))
  }, [storageKey, width])

  useEffect(() => {
    localStorage.setItem(storageKey + ':collapsed', String(collapsed))
  }, [storageKey, collapsed])

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isResizing.current = true
    const startX = e.clientX
    const startWidth = width

    const onMouseMove = (e: MouseEvent) => {
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + e.clientX - startX))
      setWidth(newWidth)
    }

    const onMouseUp = () => {
      isResizing.current = false
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [width])

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => !c)
  }, [])

  return { width, collapsed, startResize, toggleCollapsed }
}
