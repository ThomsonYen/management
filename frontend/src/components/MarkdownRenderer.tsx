import React, { useCallback, useRef, useEffect } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ContentBlock =
  | { type: 'todo'; text: string; done: boolean; indent: number; lineIndex: number }
  | { type: 'list'; text: string; indent: number; lineIndex: number }
  | { type: 'header'; text: string; lineIndex: number }
  | { type: 'paragraph'; text: string; indent: number; lineIndex: number }

export interface FocusRequest {
  lineIndex: number
  caretOffset?: number
}

export interface BlockEditHandlers {
  onEdit: (lineIndex: number, newText: string) => void
  onSplitLine: (lineIndex: number, textBefore: string, textAfter: string) => void
  onDeleteLine: (lineIndex: number) => void
  onIndent: (lineIndex: number) => void
  onUnindent: (lineIndex: number) => void
  onMergeUp: (lineIndex: number) => void
  onNavigate: (fromLineIndex: number, direction: 'up' | 'down', caretOffset: number) => void
  onPasteMultiLine: (lineIndex: number, textBefore: string, textAfter: string, lines: string[]) => void
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

/** Parse markdown lines into typed content blocks. */
export function parseContentBlocks(content: string, lineOffset = 0): ContentBlock[] {
  const blocks: ContentBlock[] = []
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    const todoMatch = line.match(/^(\s*)-\s+\[([ xX])\]\s+(.*)/)
    if (todoMatch) {
      blocks.push({
        type: 'todo',
        text: todoMatch[3],
        done: todoMatch[2] !== ' ',
        indent: todoMatch[1].length,
        lineIndex: lineOffset + i,
      })
      continue
    }

    const headerMatch = line.match(/^(\s*)#{3,4}\s+(.*)/)
    if (headerMatch) {
      blocks.push({
        type: 'header',
        text: headerMatch[2],
        lineIndex: lineOffset + i,
      })
      continue
    }

    const listMatch = line.match(/^(\s*)[-*]\s+(.*)/)
    if (listMatch) {
      blocks.push({
        type: 'list',
        text: listMatch[2],
        indent: listMatch[1].length,
        lineIndex: lineOffset + i,
      })
      continue
    }

    const indentMatch = line.match(/^(\s*)/)
    blocks.push({
      type: 'paragraph',
      text: line.trim(),
      indent: indentMatch ? indentMatch[1].length : 0,
      lineIndex: lineOffset + i,
    })
  }
  return blocks
}

// ─── Markdown line operations ─────────────────────────────────────────────────

const PREFIX_RE = /^(\s*(?:-\s+\[[ xX]\]\s+|-\s+|\*\s+|#{1,4}\s+))/

function getPrefix(line: string): string {
  const m = line.match(PREFIX_RE)
  return m ? m[1] : ''
}

function getContinuationPrefix(line: string): string {
  return getPrefix(line).replace(/- \[[xX]\] /, '- [ ] ')
}

/** Toggle a checkbox line in raw markdown by line index. */
export function toggleCheckboxLine(content: string, lineIndex: number): string {
  const lines = content.split('\n')
  const line = lines[lineIndex]
  if (line.match(/^\s*-\s+\[ \]/)) {
    lines[lineIndex] = line.replace('- [ ]', '- [x]')
  } else if (line.match(/^\s*-\s+\[[xX]\]/)) {
    lines[lineIndex] = line.replace(/- \[[xX]\]/, '- [ ]')
  }
  return lines.join('\n')
}

/** Replace the text portion of a markdown line, preserving its prefix. */
export function editLineText(content: string, lineIndex: number, newText: string): string {
  const lines = content.split('\n')
  const line = lines[lineIndex]
  if (line == null) return content
  lines[lineIndex] = getPrefix(line) + newText
  return lines.join('\n')
}

/** Split a line at cursor position, creating a new continuation line. */
export function splitLineAt(
  content: string,
  lineIndex: number,
  textBefore: string,
  textAfter: string
): { content: string; newLineIndex: number } {
  const lines = content.split('\n')
  const line = lines[lineIndex]
  if (line == null) return { content, newLineIndex: lineIndex }
  const prefix = getPrefix(line)
  const contPrefix = getContinuationPrefix(line)
  lines[lineIndex] = prefix + textBefore
  const newLineIndex = lineIndex + 1
  lines.splice(newLineIndex, 0, contPrefix + textAfter)
  return { content: lines.join('\n'), newLineIndex }
}

/** Delete a line entirely. */
export function deleteLine(content: string, lineIndex: number): string {
  const lines = content.split('\n')
  if (lines[lineIndex] == null) return content
  lines.splice(lineIndex, 1)
  return lines.join('\n')
}

/** Indent a line by 2 spaces. */
export function indentLine(content: string, lineIndex: number): string {
  const lines = content.split('\n')
  if (lines[lineIndex] == null) return content
  lines[lineIndex] = '  ' + lines[lineIndex]
  return lines.join('\n')
}

/** Unindent a line by up to 2 spaces. */
export function unindentLine(content: string, lineIndex: number): string {
  const lines = content.split('\n')
  if (lines[lineIndex] == null) return content
  lines[lineIndex] = lines[lineIndex].replace(/^ {1,2}/, '')
  return lines.join('\n')
}

/** Merge a line's text into the line above it. Returns null if lineIndex is 0. */
export function mergeLineUp(
  content: string,
  lineIndex: number
): { content: string; targetLineIndex: number; caretOffset: number } | null {
  if (lineIndex <= 0) return null
  const lines = content.split('\n')
  if (lines[lineIndex] == null || lines[lineIndex - 1] == null) return null
  const currentText = lines[lineIndex].slice(getPrefix(lines[lineIndex]).length)
  const prevText = lines[lineIndex - 1].slice(getPrefix(lines[lineIndex - 1]).length)
  const caretOffset = prevText.length
  lines[lineIndex - 1] = lines[lineIndex - 1] + currentText
  lines.splice(lineIndex, 1)
  return { content: lines.join('\n'), targetLineIndex: lineIndex - 1, caretOffset }
}

/** Insert pasted multi-line text, splitting at cursor. */
export function pasteMultiLine(
  content: string,
  lineIndex: number,
  textBefore: string,
  textAfter: string,
  pastedLines: string[]
): { content: string; focusLineIndex: number; caretOffset: number } {
  const lines = content.split('\n')
  const line = lines[lineIndex]
  if (line == null) return { content, focusLineIndex: lineIndex, caretOffset: 0 }
  const prefix = getPrefix(line)
  const contPrefix = getContinuationPrefix(line)

  const newLines: string[] = []
  if (pastedLines.length === 1) {
    newLines.push(prefix + textBefore + pastedLines[0] + textAfter)
  } else {
    for (let i = 0; i < pastedLines.length; i++) {
      if (i === 0) {
        newLines.push(prefix + textBefore + pastedLines[i])
      } else if (i === pastedLines.length - 1) {
        newLines.push(contPrefix + pastedLines[i] + textAfter)
      } else {
        newLines.push(contPrefix + pastedLines[i])
      }
    }
  }

  lines.splice(lineIndex, 1, ...newLines)
  const focusLineIndex = lineIndex + newLines.length - 1
  const caretOffset = pastedLines[pastedLines.length - 1].length
  return { content: lines.join('\n'), focusLineIndex, caretOffset }
}

// ─── Inline markdown rendering ─────────────────────────────────────────────

export function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index))
    if (match[2]) {
      parts.push(<strong key={match.index} className="font-semibold text-slate-800 dark:text-slate-100">{match[2]}</strong>)
    } else if (match[3]) {
      parts.push(<em key={match.index} className="italic">{match[3]}</em>)
    } else if (match[4]) {
      parts.push(<code key={match.index} className="text-xs bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded">{match[4]}</code>)
    }
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts.length === 1 ? parts[0] : <>{parts}</>
}

// ─── Caret helpers ────────────────────────────────────────────────────────

function getCaretOffset(el: HTMLElement): number {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return (el.textContent ?? '').length
  const range = sel.getRangeAt(0)
  const pre = range.cloneRange()
  pre.selectNodeContents(el)
  pre.setEnd(range.startContainer, range.startOffset)
  return pre.toString().length
}

function setCaretOffset(el: HTMLElement, offset: number) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let remaining = offset
  let node: Node | null = null
  while ((node = walker.nextNode())) {
    const len = (node.textContent ?? '').length
    if (remaining <= len) {
      const sel = window.getSelection()
      if (sel) {
        const range = document.createRange()
        range.setStart(node, remaining)
        range.collapse(true)
        sel.removeAllRanges()
        sel.addRange(range)
      }
      return
    }
    remaining -= len
  }
  const sel = window.getSelection()
  if (sel) {
    const range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
    sel.removeAllRanges()
    sel.addRange(range)
  }
}

// ─── Block-level rendering ────────────────────────────────────────────────

const INDENT_PX = 20

function BlockWrapper({ indent, children, className }: { indent: number; children: React.ReactNode; className?: string }) {
  return (
    <div className={className} style={indent > 0 ? { paddingLeft: indent * INDENT_PX } : undefined}>
      {children}
    </div>
  )
}

/** Inline-editable text span with full editor keybindings. */
function EditableText({
  text,
  className,
  lineIndex,
  handlers,
  focusRequest,
}: {
  text: string
  className?: string
  lineIndex: number
  handlers: BlockEditHandlers
  focusRequest?: FocusRequest | null
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const original = useRef(text)
  const skipBlurCommit = useRef(false)

  // Handle focus requests (from split, delete, navigate, etc.)
  useEffect(() => {
    if (focusRequest && focusRequest.lineIndex === lineIndex && ref.current) {
      ref.current.focus()
      if (focusRequest.caretOffset != null) {
        setCaretOffset(ref.current, focusRequest.caretOffset)
      } else {
        setCaretOffset(ref.current, 0)
      }
    }
  }, [focusRequest, lineIndex])

  // Sync original ref when text prop changes from parent
  useEffect(() => { original.current = text }, [text])

  /** Read text from the span, stripping any zero-width placeholder */
  const readText = useCallback(() => (ref.current?.textContent ?? '').replace(/\u200B/g, ''), [])

  const commitCurrent = useCallback(() => {
    if (!ref.current) return
    const newText = readText()
    if (newText !== original.current) {
      handlers.onEdit(lineIndex, newText)
      original.current = newText
    }
  }, [lineIndex, handlers, readText])

  const handleBlur = useCallback(() => {
    if (skipBlurCommit.current) { skipBlurCommit.current = false; return }
    commitCurrent()
  }, [commitCurrent])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const el = ref.current
      if (!el) return
      const fullText = readText()
      const caretPos = getCaretOffset(el)
      const isCollapsed = window.getSelection()?.isCollapsed ?? true

      // Cmd+S → commit + save
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        commitCurrent()
        el.blur()
        return
      }

      // Cmd+Backspace → delete entire line
      if ((e.metaKey || e.ctrlKey) && e.key === 'Backspace') {
        e.preventDefault()
        skipBlurCommit.current = true
        handlers.onDeleteLine(lineIndex)
        return
      }

      // Backspace at position 0
      if (e.key === 'Backspace' && caretPos === 0 && isCollapsed) {
        e.preventDefault()
        skipBlurCommit.current = true
        if (fullText.length === 0) {
          handlers.onDeleteLine(lineIndex)
        } else {
          handlers.onMergeUp(lineIndex)
        }
        return
      }

      // Tab → indent
      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault()
        skipBlurCommit.current = true
        const newText = readText()
        if (newText !== original.current) {
          handlers.onEdit(lineIndex, newText)
          original.current = newText
        }
        handlers.onIndent(lineIndex)
        return
      }

      // Shift+Tab → unindent
      if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault()
        skipBlurCommit.current = true
        const newText = readText()
        if (newText !== original.current) {
          handlers.onEdit(lineIndex, newText)
          original.current = newText
        }
        handlers.onUnindent(lineIndex)
        return
      }

      // Enter → split line at cursor
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        skipBlurCommit.current = true
        const before = fullText.slice(0, caretPos)
        const after = fullText.slice(caretPos)
        handlers.onSplitLine(lineIndex, before, after)
        return
      }

      // ArrowUp → navigate to previous block, preserving caret offset
      if (e.key === 'ArrowUp' && isCollapsed) {
        e.preventDefault()
        skipBlurCommit.current = true
        commitCurrent()
        handlers.onNavigate(lineIndex, 'up', caretPos)
        return
      }

      // ArrowDown → navigate to next block, preserving caret offset
      if (e.key === 'ArrowDown' && isCollapsed) {
        e.preventDefault()
        skipBlurCommit.current = true
        commitCurrent()
        handlers.onNavigate(lineIndex, 'down', caretPos)
        return
      }

      // Escape → revert and blur
      if (e.key === 'Escape') {
        if (el) el.textContent = original.current || '\u200B'
        el.blur()
        return
      }
    },
    [lineIndex, handlers, commitCurrent]
  )

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const pasted = e.clipboardData.getData('text/plain')
      const lines = pasted.split('\n')
      if (lines.length <= 1) return // single line: let browser handle
      e.preventDefault()
      const el = ref.current
      if (!el) return
      const fullText = readText()
      const caretPos = getCaretOffset(el)
      skipBlurCommit.current = true
      handlers.onPasteMultiLine(lineIndex, fullText.slice(0, caretPos), fullText.slice(caretPos), lines)
    },
    [lineIndex, handlers, readText]
  )

  return (
    <span
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      spellCheck
      className={`${className ?? ''} outline-none cursor-text min-w-[2ch] inline-block`}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
    >
      {text || '\u200B'}
    </span>
  )
}

/** Render a list of content blocks. */
export function ContentBlockList({
  blocks,
  onToggle,
  editHandlers,
  focusRequest,
}: {
  blocks: ContentBlock[]
  onToggle?: (lineIndex: number) => void
  editHandlers?: BlockEditHandlers
  focusRequest?: FocusRequest | null
}) {
  return (
    <div className="space-y-1.5">
      {blocks.map((block) => {
        switch (block.type) {
          case 'todo':
            return (
              <BlockWrapper key={block.lineIndex} indent={block.indent} className="flex items-start gap-2.5">
                <button
                  onClick={onToggle ? () => onToggle(block.lineIndex) : undefined}
                  className={`flex-shrink-0 w-5 h-5 mt-0.5 rounded border-2 flex items-center justify-center transition-all ${
                    block.done
                      ? 'bg-green-500 border-green-500 text-white scale-95'
                      : 'border-slate-300 dark:border-slate-600 hover:border-indigo-400 dark:hover:border-indigo-500'
                  }`}
                >
                  {block.done && (
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
                {editHandlers ? (
                  <EditableText
                    text={block.text}
                    lineIndex={block.lineIndex}
                    handlers={editHandlers}
                    focusRequest={focusRequest}
                    className={`text-sm leading-relaxed ${block.done ? 'line-through text-slate-400 dark:text-slate-600' : 'text-slate-700 dark:text-slate-200'}`}
                  />
                ) : (
                  <span className={`text-sm leading-relaxed ${block.done ? 'line-through text-slate-400 dark:text-slate-600' : 'text-slate-700 dark:text-slate-200'}`}>
                    {renderInline(block.text)}
                  </span>
                )}
              </BlockWrapper>
            )
          case 'list':
            return (
              <BlockWrapper key={block.lineIndex} indent={block.indent} className="flex items-start gap-2 pl-0.5">
                <span className="text-slate-400 dark:text-slate-500 mt-0.5 text-xs">&#8226;</span>
                {editHandlers ? (
                  <EditableText text={block.text} lineIndex={block.lineIndex} handlers={editHandlers} focusRequest={focusRequest} className="text-sm text-slate-600 dark:text-slate-300" />
                ) : (
                  <span className="text-sm text-slate-600 dark:text-slate-300">{renderInline(block.text)}</span>
                )}
              </BlockWrapper>
            )
          case 'header':
            return (
              <h4 key={block.lineIndex} className="text-xs font-bold text-slate-500 dark:text-slate-400 tracking-wide mt-2 mb-0.5">
                {editHandlers ? (
                  <EditableText text={block.text} lineIndex={block.lineIndex} handlers={editHandlers} focusRequest={focusRequest} />
                ) : block.text}
              </h4>
            )
          case 'paragraph':
            return (
              <BlockWrapper key={block.lineIndex} indent={block.indent}>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  {editHandlers ? (
                    <EditableText text={block.text} lineIndex={block.lineIndex} handlers={editHandlers} focusRequest={focusRequest} className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed" />
                  ) : renderInline(block.text)}
                </p>
              </BlockWrapper>
            )
        }
      })}
    </div>
  )
}
