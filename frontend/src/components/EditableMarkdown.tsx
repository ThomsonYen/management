import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import {
  parseContentBlocks, toggleCheckboxLine, editLineText, splitLineAt,
  deleteLine, indentLine, unindentLine, mergeLineUp, pasteMultiLine,
  ContentBlockList, type ContentBlock, type FocusRequest, type BlockEditHandlers,
} from './MarkdownRenderer'

export interface EditableMarkdownProps {
  /** Current markdown string */
  value: string
  /** Called on every local edit (may not be saved yet) */
  onChange: (md: string) => void
  /** Called when an edit should be persisted */
  onSave: (md: string) => void
  /**
   * Custom parser that converts the markdown string into ContentBlocks.
   * Defaults to `parseContentBlocks`. WeeklyGoalsPage passes its own
   * `parseAssembled` wrapper that handles day-header line offsets.
   */
  parseBlocks?: (md: string) => ContentBlock[]
  /** Debounce delay in ms for typing saves (0 = immediate). Default 500. */
  saveDebounceMs?: number
}

export default function EditableMarkdown({ value, onChange, onSave, parseBlocks, saveDebounceMs = 500 }: EditableMarkdownProps) {
  const valueRef = useRef(value)
  valueRef.current = value
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const debouncedSave = useCallback((md: string) => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => onSaveRef.current(md), saveDebounceMs)
  }, [saveDebounceMs])

  // Flush pending debounced save on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current)
        onSaveRef.current(valueRef.current)
      }
    }
  }, [])

  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null)

  // Clear focusRequest after it's been consumed
  useEffect(() => {
    if (focusRequest != null) {
      const id = requestAnimationFrame(() => setFocusRequest(null))
      return () => cancelAnimationFrame(id)
    }
  }, [focusRequest])

  const parse = useCallback(
    (md: string) => (parseBlocks ? parseBlocks(md) : parseContentBlocks(md)),
    [parseBlocks]
  )

  const blocks = useMemo(() => parse(value), [value, parse])

  const update = useCallback((md: string) => {
    onChange(md)
  }, [onChange])

  const handleToggle = useCallback(
    (lineIndex: number) => {
      const newMd = toggleCheckboxLine(valueRef.current, lineIndex)
      onChange(newMd)
      onSave(newMd)
    },
    [onChange, onSave]
  )

  const editHandlers = useMemo((): BlockEditHandlers => ({
    onEdit: (lineIndex, newText) => {
      const newMd = editLineText(valueRef.current, lineIndex, newText)
      update(newMd)
      debouncedSave(newMd)
    },
    onSplitLine: (lineIndex, textBefore, textAfter) => {
      const result = splitLineAt(valueRef.current, lineIndex, textBefore, textAfter)
      update(result.content)
      setFocusRequest({ lineIndex: result.newLineIndex })
    },
    onDeleteLine: (lineIndex) => {
      const allBlocks = parse(valueRef.current)
      const prevBlock = allBlocks.filter(b => b.lineIndex < lineIndex).pop()
      const newMd = deleteLine(valueRef.current, lineIndex)
      update(newMd)
      onSave(newMd)
      if (prevBlock) {
        setFocusRequest({ lineIndex: prevBlock.lineIndex, caretOffset: prevBlock.text.length })
      }
    },
    onIndent: (lineIndex) => {
      const newMd = indentLine(valueRef.current, lineIndex)
      update(newMd)
      setFocusRequest({ lineIndex })
    },
    onUnindent: (lineIndex) => {
      const newMd = unindentLine(valueRef.current, lineIndex)
      update(newMd)
      setFocusRequest({ lineIndex })
    },
    onMergeUp: (lineIndex) => {
      const result = mergeLineUp(valueRef.current, lineIndex)
      if (!result) return
      update(result.content)
      onSave(result.content)
      setFocusRequest({ lineIndex: result.targetLineIndex, caretOffset: result.caretOffset })
    },
    onNavigate: (fromLineIndex, direction, caretOffset) => {
      const allBlocks = parse(valueRef.current)
      const allLineIndexes = allBlocks.map(b => b.lineIndex)
      const currentIdx = allLineIndexes.indexOf(fromLineIndex)
      if (currentIdx < 0) return
      const targetIdx = direction === 'up' ? currentIdx - 1 : currentIdx + 1
      if (targetIdx < 0 || targetIdx >= allLineIndexes.length) return
      const targetBlock = allBlocks[targetIdx]
      const clampedOffset = targetBlock ? Math.min(caretOffset, targetBlock.text.length) : caretOffset
      setFocusRequest({ lineIndex: allLineIndexes[targetIdx], caretOffset: clampedOffset })
    },
    onPasteMultiLine: (lineIndex, textBefore, textAfter, lines) => {
      const result = pasteMultiLine(valueRef.current, lineIndex, textBefore, textAfter, lines)
      update(result.content)
      onSave(result.content)
      setFocusRequest({ lineIndex: result.focusLineIndex, caretOffset: result.caretOffset })
    },
  }), [update, onSave, debouncedSave, parse])

  return (
    <ContentBlockList
      blocks={blocks}
      onToggle={handleToggle}
      editHandlers={editHandlers}
      focusRequest={focusRequest}
    />
  )
}
