/**
 * Shared keyboard handler for MDEditor instances.
 * Handles:
 * - Configurable hotkey → insert a new todo checkbox
 * - Configurable hotkey → un-indent current line
 * - Enter → continue list items with preserved indentation
 *
 * Usage:
 *   const handler = createMdEditorKeyHandler(bindings)
 *   <div onKeyDownCapture={handler}><MDEditor ... /></div>
 */

import { matchesBinding, type HotkeyBindings } from '../HotkeysContext'

const TAB_SIZE = 2

function insertAt(ta: HTMLTextAreaElement, text: string) {
  const start = ta.selectionStart
  const end = ta.selectionEnd
  ta.focus()
  if (!document.execCommand('insertText', false, text)) {
    const before = ta.value.slice(0, start)
    const after = ta.value.slice(end)
    ta.value = before + text + after
  }
  const newPos = start + text.length
  ta.selectionStart = newPos
  ta.selectionEnd = newPos
}

function getCurrentLine(ta: HTMLTextAreaElement): { text: string; lineStart: number } {
  const before = ta.value.slice(0, ta.selectionStart)
  const lineStart = before.lastIndexOf('\n') + 1
  const lineEnd = ta.value.indexOf('\n', ta.selectionStart)
  const text = ta.value.slice(lineStart, lineEnd === -1 ? undefined : lineEnd)
  return { text, lineStart }
}

export function createMdEditorKeyHandler(bindings: HotkeyBindings) {
  return function mdEditorKeyDown(e: React.KeyboardEvent<HTMLElement>) {
    const target = e.target as HTMLElement
    if (target.tagName !== 'TEXTAREA') return
    const ta = target as HTMLTextAreaElement
    const nativeEvent = e.nativeEvent as KeyboardEvent

    // ─── Insert todo checkbox ─────────────────────────────────────────
    if (matchesBinding(nativeEvent, bindings.editorInsertTodo)) {
      e.preventDefault()
      e.stopPropagation()
      const { text: line, lineStart } = getCurrentLine(ta)
      const indent = line.match(/^(\s*)/)?.[1] ?? ''

      const listMatch = line.match(/^(\s*)([-*])\s/)
      if (listMatch) {
        const replaceStart = lineStart + listMatch[1].length + listMatch[2].length + 1
        ta.selectionStart = lineStart + listMatch[1].length
        ta.selectionEnd = replaceStart
        insertAt(ta, listMatch[2] + ' [ ] ')
      } else if (line.trim() === '') {
        insertAt(ta, indent + '- [ ] ')
      } else {
        ta.selectionStart = lineStart + indent.length
        ta.selectionEnd = lineStart + indent.length
        insertAt(ta, '- [ ] ')
      }
      ta.dispatchEvent(new Event('input', { bubbles: true }))
      return
    }

    // ─── Indent current line (no selection) ─────────────────────────
    if (matchesBinding(nativeEvent, bindings.editorIndent) && ta.selectionStart === ta.selectionEnd) {
      e.preventDefault()
      e.stopPropagation()
      const { lineStart } = getCurrentLine(ta)
      const cursorPos = ta.selectionStart
      const indent = ' '.repeat(TAB_SIZE)
      ta.selectionStart = lineStart
      ta.selectionEnd = lineStart
      insertAt(ta, indent)
      const newPos = cursorPos + TAB_SIZE
      ta.selectionStart = newPos
      ta.selectionEnd = newPos
      ta.dispatchEvent(new Event('input', { bubbles: true }))
      return
    }

    // ─── Un-indent current line (no selection) ────────────────────────
    if (matchesBinding(nativeEvent, bindings.editorUnindent) && ta.selectionStart === ta.selectionEnd) {
      e.preventDefault()
      e.stopPropagation()
      const { text: line, lineStart } = getCurrentLine(ta)
      const leadingSpaces = line.match(/^(\s*)/)?.[1] ?? ''
      if (leadingSpaces.length === 0) return

      const removeCount = Math.min(TAB_SIZE, leadingSpaces.length)
      const cursorPos = ta.selectionStart
      ta.selectionStart = lineStart
      ta.selectionEnd = lineStart + removeCount
      insertAt(ta, '')
      const newPos = Math.max(lineStart, cursorPos - removeCount)
      ta.selectionStart = newPos
      ta.selectionEnd = newPos
      ta.dispatchEvent(new Event('input', { bubbles: true }))
      return
    }

    // ─── Enter: Continue list with preserved indentation ──────────────
    const metaKey = e.metaKey || e.ctrlKey
    if (e.key === 'Enter' && !e.shiftKey && !metaKey) {
      const { text: line } = getCurrentLine(ta)

      const listMatch = line.match(/^(\s*)([-*]|\d+\.)\s(\[[ xX]\]\s)?(.*)/)
      if (!listMatch) return

      const [, indent, marker, checkbox, content] = listMatch

      if (!content?.trim()) {
        e.preventDefault()
        e.stopPropagation()
        const { lineStart } = getCurrentLine(ta)
        const lineEnd = ta.value.indexOf('\n', ta.selectionStart)
        ta.selectionStart = lineStart
        ta.selectionEnd = lineEnd === -1 ? ta.value.length : lineEnd
        insertAt(ta, '')
        ta.dispatchEvent(new Event('input', { bubbles: true }))
        return
      }

      e.preventDefault()
      e.stopPropagation()

      let nextMarker = marker
      const numMatch = marker.match(/^(\d+)\./)
      if (numMatch) {
        nextMarker = (parseInt(numMatch[1]) + 1) + '.'
      }

      let insertion = '\n' + indent + nextMarker + ' '
      if (checkbox) {
        insertion = '\n' + indent + nextMarker + ' [ ] '
      }

      insertAt(ta, insertion)
      ta.dispatchEvent(new Event('input', { bubbles: true }))
    }
  }
}
