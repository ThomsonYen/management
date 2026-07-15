import { useCallback, useEffect, useRef } from 'react'
import { useDebouncedFn } from '../hooks/useDebouncedFn'

// ─── Constants ─────────────────────────────────────────────────────────────

const INDENT_PX = 20
const ZWSP = '​'

// ─── Types ─────────────────────────────────────────────────────────────────

type LineType = 'todo' | 'list' | 'header' | 'paragraph'

interface ParsedLine {
  type: LineType
  indent: number
  text: string
  done?: boolean
  headerLevel?: number
}

export interface MarkdownEditorProps {
  value: string
  onChange: (md: string) => void
  onSave: (md: string) => void
  /** Idle debounce delay in ms after the last edit. Default 500. */
  saveDebounceMs?: number
  /** Force a save at most this long after the first unsaved edit. Default 3000. */
  saveMaxWaitMs?: number
}

// ─── Parsing / serialization (one line at a time) ───────────────────────────

function parseLine(line: string): ParsedLine {
  const todoMatch = line.match(/^(\s*)-\s+\[([ xX])\]\s+(.*)/)
  if (todoMatch) {
    return {
      type: 'todo',
      indent: Math.floor(todoMatch[1].length / 2),
      text: todoMatch[3],
      done: todoMatch[2] !== ' ',
    }
  }
  const headerMatch = line.match(/^(#{1,6})\s+(.*)/)
  if (headerMatch) {
    return { type: 'header', indent: 0, text: headerMatch[2], headerLevel: headerMatch[1].length }
  }
  const listMatch = line.match(/^(\s*)[-*]\s+(.*)/)
  if (listMatch) {
    return { type: 'list', indent: Math.floor(listMatch[1].length / 2), text: listMatch[2] }
  }
  const m = /^(\s*)(.*)$/.exec(line)!
  return { type: 'paragraph', indent: Math.floor(m[1].length / 2), text: m[2] }
}

function serializeLine(p: ParsedLine): string {
  const ind = '  '.repeat(p.indent)
  switch (p.type) {
    case 'todo':      return `${ind}- [${p.done ? 'x' : ' '}] ${p.text}`
    case 'list':      return `${ind}- ${p.text}`
    case 'header':    return `${'#'.repeat(p.headerLevel ?? 2)} ${p.text}`
    case 'paragraph': return ind + p.text
  }
}

// ─── DOM class names ───────────────────────────────────────────────────────

function lineWrapperClass(p: ParsedLine): string {
  switch (p.type) {
    case 'todo':      return 'md-line flex items-start gap-2.5'
    case 'list':      return 'md-line flex items-start gap-2 pl-0.5'
    case 'header':    return 'md-line text-xs font-bold text-slate-500 dark:text-slate-400 tracking-wide mt-2 mb-0.5'
    case 'paragraph': return 'md-line'
  }
}

function textElClass(p: ParsedLine): string {
  const base = 'md-line-text outline-none'
  switch (p.type) {
    case 'todo':
      return p.done
        ? `${base} flex-1 text-sm leading-relaxed line-through text-slate-400 dark:text-slate-600`
        : `${base} flex-1 text-sm leading-relaxed text-slate-700 dark:text-slate-200`
    case 'list':      return `${base} flex-1 text-sm text-slate-600 dark:text-slate-300`
    case 'header':    return `${base}`
    case 'paragraph': return `${base} block text-sm text-slate-600 dark:text-slate-300 leading-relaxed`
  }
}

// ─── DOM building ──────────────────────────────────────────────────────────

function buildCheckboxPrefix(done: boolean): HTMLElement {
  const span = document.createElement('span')
  span.setAttribute('contenteditable', 'false')
  span.setAttribute('data-prefix', 'checkbox')
  span.className = `md-checkbox flex-shrink-0 mt-0.5 w-5 h-5 rounded border-2 inline-flex items-center justify-center cursor-pointer select-none transition-all ${
    done
      ? 'bg-green-500 border-green-500 text-white scale-95'
      : 'border-slate-300 dark:border-slate-600 hover:border-indigo-400 dark:hover:border-indigo-500'
  }`
  if (done) {
    span.innerHTML =
      '<svg style="width:0.75rem;height:0.75rem" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">' +
      '<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>'
  }
  return span
}

function buildBulletPrefix(): HTMLElement {
  const span = document.createElement('span')
  span.setAttribute('contenteditable', 'false')
  span.setAttribute('data-prefix', 'bullet')
  span.className = 'md-bullet flex-shrink-0 text-slate-400 dark:text-slate-500 mt-0.5 text-xs select-none'
  span.textContent = '•'
  return span
}

function buildLineEl(p: ParsedLine): HTMLDivElement {
  const div = document.createElement('div')
  div.setAttribute('data-line', '')
  div.setAttribute('data-type', p.type)
  div.setAttribute('data-indent', String(p.indent))
  if (p.type === 'todo') div.setAttribute('data-done', String(!!p.done))
  if (p.type === 'header') div.setAttribute('data-level', String(p.headerLevel ?? 2))
  div.className = lineWrapperClass(p)
  if (p.indent > 0) div.style.paddingLeft = `${p.indent * INDENT_PX}px`

  if (p.type === 'todo') div.appendChild(buildCheckboxPrefix(!!p.done))
  else if (p.type === 'list') div.appendChild(buildBulletPrefix())

  const textEl = document.createElement('span')
  textEl.className = textElClass(p)
  textEl.textContent = p.text || ZWSP
  div.appendChild(textEl)

  return div
}

// ─── DOM reading ───────────────────────────────────────────────────────────

function findTextEl(lineEl: Element): HTMLElement | null {
  return lineEl.querySelector(':scope > .md-line-text') as HTMLElement | null
}

function readLineEl(lineEl: HTMLElement): ParsedLine {
  const type = (lineEl.getAttribute('data-type') ?? 'paragraph') as LineType
  const indent = parseInt(lineEl.getAttribute('data-indent') ?? '0') || 0
  const textEl = findTextEl(lineEl)
  const text = (textEl?.textContent ?? '').replace(/​/g, '')
  const out: ParsedLine = { type, indent, text }
  if (type === 'todo') out.done = lineEl.getAttribute('data-done') === 'true'
  if (type === 'header') out.headerLevel = parseInt(lineEl.getAttribute('data-level') ?? '2') || 2
  return out
}

function readDOM(host: HTMLDivElement): string {
  const lines: string[] = []
  for (const child of Array.from(host.children)) {
    if (!(child instanceof HTMLElement) || !child.hasAttribute('data-line')) continue
    lines.push(serializeLine(readLineEl(child)))
  }
  return lines.join('\n')
}

function renderDOM(host: HTMLDivElement, md: string): void {
  host.innerHTML = ''
  const lines = md.length === 0 ? [''] : md.split('\n')
  for (const line of lines) host.appendChild(buildLineEl(parseLine(line)))
}

// ─── Caret helpers ─────────────────────────────────────────────────────────

function findLineEl(node: Node | null, host: HTMLDivElement): HTMLDivElement | null {
  let cur: Node | null = node
  while (cur && cur !== host) {
    if (cur instanceof HTMLElement && cur.hasAttribute('data-line')) return cur as HTMLDivElement
    cur = cur.parentNode
  }
  return null
}

function getVisibleOffset(textEl: HTMLElement, container: Node, containerOffset: number): number {
  if (!textEl.contains(container) && container !== textEl) return 0
  const range = document.createRange()
  range.setStart(textEl, 0)
  try {
    range.setEnd(container, containerOffset)
  } catch {
    return 0
  }
  return range.toString().replace(/​/g, '').length
}

function getCaretInfo(host: HTMLDivElement): { lineEl: HTMLDivElement; textEl: HTMLElement; offset: number } | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  const lineEl = findLineEl(range.startContainer, host)
  if (!lineEl) return null
  const textEl = findTextEl(lineEl)
  if (!textEl) return null
  return { lineEl, textEl, offset: getVisibleOffset(textEl, range.startContainer, range.startOffset) }
}

function setCaretIn(textEl: HTMLElement, offset: number): void {
  const sel = window.getSelection()
  if (!sel) return
  const walker = document.createTreeWalker(textEl, NodeFilter.SHOW_TEXT)
  let remaining = offset
  let node: Text | null = walker.nextNode() as Text | null
  while (node) {
    const raw = node.textContent ?? ''
    let i = 0
    while (i < raw.length && remaining > 0) {
      if (raw[i] !== ZWSP) remaining--
      i++
    }
    if (remaining <= 0) {
      // Skip over any trailing ZWSP at this position (prefer landing after visible chars)
      while (i < raw.length && raw[i] === ZWSP) i++
      const range = document.createRange()
      range.setStart(node, i)
      range.collapse(true)
      sel.removeAllRanges()
      sel.addRange(range)
      return
    }
    node = walker.nextNode() as Text | null
  }
  const range = document.createRange()
  range.selectNodeContents(textEl)
  range.collapse(false)
  sel.removeAllRanges()
  sel.addRange(range)
}

// ─── Line operations (DOM mutators) ─────────────────────────────────────────

function getLineText(textEl: HTMLElement): string {
  return (textEl.textContent ?? '').replace(/​/g, '')
}

function setLineText(textEl: HTMLElement, text: string): void {
  textEl.textContent = text === '' ? ZWSP : text
}

function splitLineAtCaret(lineEl: HTMLDivElement, textEl: HTMLElement, offset: number): void {
  const full = getLineText(textEl)
  const before = full.slice(0, offset)
  const after = full.slice(offset)
  const cur = readLineEl(lineEl)

  // Empty list/todo + Enter → demote to paragraph (exit list)
  if ((cur.type === 'todo' || cur.type === 'list') && before === '' && after === '') {
    const replacement = buildLineEl({ type: 'paragraph', indent: cur.indent, text: '' })
    lineEl.replaceWith(replacement)
    const t = findTextEl(replacement)
    if (t) setCaretIn(t, 0)
    return
  }

  let nextType: LineType = 'paragraph'
  if (cur.type === 'todo') nextType = 'todo'
  else if (cur.type === 'list') nextType = 'list'
  const nextIndent = cur.type === 'header' ? 0 : cur.indent

  setLineText(textEl, before)
  const newLine = buildLineEl({ type: nextType, indent: nextIndent, text: after, done: false })
  lineEl.after(newLine)
  const newTextEl = findTextEl(newLine)
  if (newTextEl) setCaretIn(newTextEl, 0)
}

function mergeLineWithPrev(lineEl: HTMLDivElement): boolean {
  const prev = lineEl.previousElementSibling
  if (!prev || !(prev instanceof HTMLElement) || !prev.hasAttribute('data-line')) return false
  const prevTextEl = findTextEl(prev)
  const curTextEl = findTextEl(lineEl)
  if (!prevTextEl || !curTextEl) return false
  const prevText = getLineText(prevTextEl)
  const curText = getLineText(curTextEl)
  setLineText(prevTextEl, prevText + curText)
  lineEl.remove()
  setCaretIn(prevTextEl, prevText.length)
  return true
}

function deleteLineEl(host: HTMLDivElement, lineEl: HTMLDivElement): void {
  if (host.children.length === 1) {
    const replacement = buildLineEl({ type: 'paragraph', indent: 0, text: '' })
    lineEl.replaceWith(replacement)
    const t = findTextEl(replacement)
    if (t) setCaretIn(t, 0)
    return
  }
  const prev = lineEl.previousElementSibling as HTMLElement | null
  const next = lineEl.nextElementSibling as HTMLElement | null
  lineEl.remove()
  if (prev && prev.hasAttribute('data-line')) {
    const t = findTextEl(prev)
    if (t) setCaretIn(t, getLineText(t).length)
  } else if (next && next.hasAttribute('data-line')) {
    const t = findTextEl(next as HTMLDivElement)
    if (t) setCaretIn(t, 0)
  }
}

function deleteSelectionRange(host: HTMLDivElement, range: Range): boolean {
  const startLine = findLineEl(range.startContainer, host)
  const endLine = findLineEl(range.endContainer, host)
  if (!startLine || !endLine) return false
  const startText = findTextEl(startLine)
  const endText = findTextEl(endLine)
  if (!startText || !endText) return false

  const startOffset = getVisibleOffset(startText, range.startContainer, range.startOffset)
  const endOffset = getVisibleOffset(endText, range.endContainer, range.endOffset)

  if (startLine === endLine) {
    const text = getLineText(startText)
    const lo = Math.min(startOffset, endOffset)
    const hi = Math.max(startOffset, endOffset)
    setLineText(startText, text.slice(0, lo) + text.slice(hi))
    setCaretIn(startText, lo)
    return true
  }

  // Ensure start comes before end in document order
  const cmp = startLine.compareDocumentPosition(endLine)
  const before = (cmp & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
  const a = before ? startLine : endLine
  const b = before ? endLine : startLine
  const aText = before ? startText : endText
  const bText = before ? endText : startText
  const aOff = before ? startOffset : endOffset
  const bOff = before ? endOffset : startOffset

  const startBefore = getLineText(aText).slice(0, aOff)
  const endAfter = getLineText(bText).slice(bOff)

  let cur: Element | null = a.nextElementSibling
  while (cur && cur !== b) {
    const nxt = cur.nextElementSibling
    cur.remove()
    cur = nxt
  }
  b.remove()
  setLineText(aText, startBefore + endAfter)
  setCaretIn(aText, startBefore.length)
  return true
}

function changeLineIndent(lineEl: HTMLDivElement, delta: 1 | -1): void {
  const cur = parseInt(lineEl.getAttribute('data-indent') ?? '0') || 0
  const next = Math.max(0, cur + delta)
  if (next === cur) return
  lineEl.setAttribute('data-indent', String(next))
  if (next > 0) lineEl.style.paddingLeft = `${next * INDENT_PX}px`
  else lineEl.style.paddingLeft = ''
}

function toggleCheckbox(lineEl: HTMLDivElement): void {
  if (lineEl.getAttribute('data-type') !== 'todo') return
  const wasDone = lineEl.getAttribute('data-done') === 'true'
  const nowDone = !wasDone
  lineEl.setAttribute('data-done', String(nowDone))
  const oldCheckbox = lineEl.querySelector(':scope > [data-prefix="checkbox"]')
  const newCheckbox = buildCheckboxPrefix(nowDone)
  if (oldCheckbox) oldCheckbox.replaceWith(newCheckbox)
  const textEl = findTextEl(lineEl)
  if (textEl) textEl.className = textElClass({ type: 'todo', indent: 0, text: '', done: nowDone })
}

function demoteToParagraph(lineEl: HTMLDivElement): void {
  const cur = readLineEl(lineEl)
  if (cur.type === 'paragraph') return
  const replacement = buildLineEl({ type: 'paragraph', indent: cur.indent, text: cur.text })
  lineEl.replaceWith(replacement)
  const t = findTextEl(replacement)
  if (t) setCaretIn(t, 0)
}

function normalizeAllLines(host: HTMLDivElement): void {
  for (const child of Array.from(host.children)) {
    if (!(child instanceof HTMLElement) || !child.hasAttribute('data-line')) continue
    const textEl = findTextEl(child)
    if (!textEl) continue
    const raw = textEl.textContent ?? ''
    if (raw.length === 0) {
      textEl.textContent = ZWSP
      continue
    }
    if (raw.length === 1 && raw === ZWSP) continue
    if (raw.includes(ZWSP)) {
      const sel = window.getSelection()
      let caretOffset: number | null = null
      if (sel && sel.rangeCount > 0) {
        const r = sel.getRangeAt(0)
        if (textEl.contains(r.startContainer)) {
          caretOffset = getVisibleOffset(textEl, r.startContainer, r.startOffset)
        }
      }
      textEl.textContent = raw.split(ZWSP).join('')
      if (caretOffset !== null) setCaretIn(textEl, caretOffset)
    }
  }
}

function isPrintableKey(e: React.KeyboardEvent): boolean {
  return !e.metaKey && !e.ctrlKey && !e.altKey && e.key.length === 1
}

// ─── Inline prefix shortcuts (e.g. typing "- " turns a paragraph into a bullet)

function replaceLinePreservingCaret(
  oldLine: HTMLDivElement,
  next: ParsedLine,
  caretOffset: number,
): void {
  const replacement = buildLineEl(next)
  oldLine.replaceWith(replacement)
  const t = findTextEl(replacement)
  if (t) setCaretIn(t, caretOffset)
}

function tryConvertLinePrefix(host: HTMLDivElement): boolean {
  const info = getCaretInfo(host)
  if (!info) return false
  const type = info.lineEl.getAttribute('data-type')
  const indent = parseInt(info.lineEl.getAttribute('data-indent') ?? '0') || 0
  const text = getLineText(info.textEl)

  if (type === 'paragraph') {
    // "- [ ] x" or "- [x] x" → todo (check before list so the combined form works)
    const todo = text.match(/^([-*])\s+\[([ xX])\]\s+(.*)/)
    if (todo) {
      const remainder = todo[3]
      const prefixLen = todo[0].length - remainder.length
      replaceLinePreservingCaret(
        info.lineEl,
        { type: 'todo', indent, text: remainder, done: todo[2] !== ' ' },
        Math.max(0, info.offset - prefixLen),
      )
      return true
    }
    // "- x" or "* x" (also matches "- " with empty trailing text) → list
    const list = text.match(/^([-*])\s+(.*)/)
    if (list) {
      const remainder = list[2]
      const prefixLen = list[0].length - remainder.length
      replaceLinePreservingCaret(
        info.lineEl,
        { type: 'list', indent, text: remainder },
        Math.max(0, info.offset - prefixLen),
      )
      return true
    }
  } else if (type === 'list') {
    // Inside a bullet, "[ ] x" or "[x] x" promotes to todo — so users who type
    // "- [ ] foo" end up with a todo even though "- " converted to a bullet first.
    const todo = text.match(/^\[([ xX])\]\s+(.*)/)
    if (todo) {
      const remainder = todo[2]
      const prefixLen = todo[0].length - remainder.length
      replaceLinePreservingCaret(
        info.lineEl,
        { type: 'todo', indent, text: remainder, done: todo[1] !== ' ' },
        Math.max(0, info.offset - prefixLen),
      )
      return true
    }
  }

  return false
}

// ─── Undo/redo snapshots ───────────────────────────────────────────────────

interface Snapshot {
  md: string
  caret: { lineIndex: number; offset: number } | null
}

type SnapshotKind = 'typing' | 'structural'

const MAX_UNDO_DEPTH = 200
const TYPING_COALESCE_MS = 1000

function captureSnapshot(host: HTMLDivElement): Snapshot {
  const md = readDOM(host)
  const info = getCaretInfo(host)
  if (!info) return { md, caret: null }
  const lineIndex = Array.from(host.children).indexOf(info.lineEl)
  return { md, caret: lineIndex >= 0 ? { lineIndex, offset: info.offset } : null }
}

// ─── Main component ────────────────────────────────────────────────────────

export default function MarkdownEditor({
  value,
  onChange,
  onSave,
  saveDebounceMs = 500,
  saveMaxWaitMs = 3000,
}: MarkdownEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const lastValueRef = useRef<string>(value)
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // Undo/redo state held in refs to avoid re-renders.
  const undoStackRef = useRef<Snapshot[]>([])
  const redoStackRef = useRef<Snapshot[]>([])
  const currentSnapshotRef = useRef<Snapshot>({ md: value, caret: null })
  const lastCommitKindRef = useRef<SnapshotKind>('structural')
  const lastTypingAtRef = useRef<number>(0)

  // Render DOM imperatively on mount and on external value changes.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const resetHistory = (md: string) => {
      currentSnapshotRef.current = { md, caret: null }
      undoStackRef.current = []
      redoStackRef.current = []
      lastCommitKindRef.current = 'structural'
      lastTypingAtRef.current = 0
    }
    if (host.childElementCount === 0) {
      renderDOM(host, value)
      lastValueRef.current = value
      resetHistory(value)
      return
    }
    if (value === lastValueRef.current) return
    // If the user is actively editing this instance, the DOM holds the freshest
    // content — overwriting it would jump the cursor and clobber in-flight typing.
    // Acknowledge that we've "seen" the incoming value so we don't re-check next
    // render, but leave the DOM alone.
    if (host.contains(document.activeElement)) {
      lastValueRef.current = value
      return
    }
    renderDOM(host, value)
    lastValueRef.current = value
    resetHistory(value)
  }, [value])

  const saver = useDebouncedFn(
    (md: string) => onSaveRef.current(md),
    { idleMs: saveDebounceMs, maxMs: saveMaxWaitMs },
  )

  const commitSnapshot = useCallback((kind: SnapshotKind) => {
    const host = hostRef.current
    if (!host) return
    const next = captureSnapshot(host)
    const cur = currentSnapshotRef.current
    if (next.md === cur.md) {
      // Content unchanged — track caret but don't touch undo history.
      currentSnapshotRef.current = next
      return
    }
    const now = Date.now()
    const coalesce =
      kind === 'typing' &&
      lastCommitKindRef.current === 'typing' &&
      now - lastTypingAtRef.current < TYPING_COALESCE_MS
    if (!coalesce) {
      undoStackRef.current.push(cur)
      if (undoStackRef.current.length > MAX_UNDO_DEPTH) undoStackRef.current.shift()
    }
    currentSnapshotRef.current = next
    lastCommitKindRef.current = kind
    if (kind === 'typing') lastTypingAtRef.current = now
    // Any new edit invalidates the redo path.
    redoStackRef.current.length = 0
  }, [])

  const applySnapshot = useCallback((snap: Snapshot) => {
    const host = hostRef.current
    if (!host) return
    renderDOM(host, snap.md)
    lastValueRef.current = snap.md
    if (snap.caret) {
      const lineEl = host.children[snap.caret.lineIndex] as HTMLDivElement | undefined
      if (lineEl) {
        const textEl = findTextEl(lineEl)
        if (textEl) setCaretIn(textEl, snap.caret.offset)
      }
    } else {
      const lastLine = host.lastElementChild as HTMLDivElement | null
      if (lastLine) {
        const textEl = findTextEl(lastLine)
        if (textEl) setCaretIn(textEl, getLineText(textEl).length)
      }
    }
    onChangeRef.current(snap.md)
    saver.call(snap.md)
  }, [saver])

  const undo = useCallback(() => {
    if (undoStackRef.current.length === 0) return
    const prev = undoStackRef.current.pop()!
    redoStackRef.current.push(currentSnapshotRef.current)
    currentSnapshotRef.current = prev
    lastCommitKindRef.current = 'structural'
    applySnapshot(prev)
  }, [applySnapshot])

  const redo = useCallback(() => {
    if (redoStackRef.current.length === 0) return
    const next = redoStackRef.current.pop()!
    undoStackRef.current.push(currentSnapshotRef.current)
    currentSnapshotRef.current = next
    lastCommitKindRef.current = 'structural'
    applySnapshot(next)
  }, [applySnapshot])

  const syncFromDOM = useCallback((opts?: { saveImmediate?: boolean; kind?: SnapshotKind }) => {
    const host = hostRef.current
    if (!host) return
    const md = readDOM(host)
    const changed = md !== lastValueRef.current
    if (changed) {
      lastValueRef.current = md
      onChangeRef.current(md)
      commitSnapshot(opts?.kind ?? 'structural')
    }
    if (opts?.saveImmediate) {
      saver.cancel()
      onSaveRef.current(md)
    } else if (changed) {
      saver.call(md)
    }
  }, [saver, commitSnapshot])

  const handleInput = useCallback(() => {
    const host = hostRef.current
    if (!host) return
    normalizeAllLines(host)
    tryConvertLinePrefix(host)
    syncFromDOM({ kind: 'typing' })
  }, [syncFromDOM])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.nativeEvent.isComposing) return
    const host = hostRef.current
    if (!host) return
    const sel = window.getSelection()
    if (!sel) return

    // Cmd/Ctrl+Z → undo. Cmd+Shift+Z or Ctrl+Y → redo.
    const cmd = e.metaKey || e.ctrlKey
    const isZ = e.key === 'z' || e.key === 'Z'
    const isY = e.key === 'y' || e.key === 'Y'
    if (cmd && isZ && !e.shiftKey) {
      e.preventDefault()
      undo()
      return
    }
    if ((cmd && isZ && e.shiftKey) || (e.ctrlKey && isY)) {
      e.preventDefault()
      redo()
      return
    }

    // Cmd/Ctrl+S → flush save
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault()
      syncFromDOM({ saveImmediate: true })
      return
    }

    // Cmd/Ctrl+T → convert current line to todo (toggles done if already a todo)
    if ((e.metaKey || e.ctrlKey) && (e.key === 't' || e.key === 'T')) {
      e.preventDefault()
      const info = getCaretInfo(host)
      if (info) {
        const cur = readLineEl(info.lineEl)
        if (cur.type === 'todo') {
          toggleCheckbox(info.lineEl)
        } else {
          const replacement = buildLineEl({ type: 'todo', indent: cur.indent, text: cur.text, done: false })
          info.lineEl.replaceWith(replacement)
          const t = findTextEl(replacement)
          if (t) setCaretIn(t, info.offset)
        }
        syncFromDOM()
      }
      return
    }

    // Cmd/Ctrl+Backspace → delete current line
    if ((e.metaKey || e.ctrlKey) && e.key === 'Backspace') {
      e.preventDefault()
      const info = getCaretInfo(host)
      if (info) {
        deleteLineEl(host, info.lineEl)
        syncFromDOM()
      }
      return
    }

    const collapsed = sel.isCollapsed
    let multiLine = false
    if (!collapsed && sel.rangeCount > 0) {
      const r = sel.getRangeAt(0)
      const a = findLineEl(r.startContainer, host)
      const b = findLineEl(r.endContainer, host)
      multiLine = !!(a && b && a !== b)
    }

    // Multi-line selection: intercept destructive keys to keep DOM structure intact.
    if (multiLine) {
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault()
        deleteSelectionRange(host, sel.getRangeAt(0))
        syncFromDOM()
        return
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        deleteSelectionRange(host, sel.getRangeAt(0))
        const info = getCaretInfo(host)
        if (info) splitLineAtCaret(info.lineEl, info.textEl, info.offset)
        syncFromDOM()
        return
      }
      if (isPrintableKey(e)) {
        e.preventDefault()
        deleteSelectionRange(host, sel.getRangeAt(0))
        const info = getCaretInfo(host)
        if (info) {
          const t = getLineText(info.textEl)
          setLineText(info.textEl, t.slice(0, info.offset) + e.key + t.slice(info.offset))
          setCaretIn(info.textEl, info.offset + 1)
        }
        syncFromDOM()
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey && collapsed) {
      e.preventDefault()
      const info = getCaretInfo(host)
      if (info) splitLineAtCaret(info.lineEl, info.textEl, info.offset)
      syncFromDOM()
      return
    }

    if (e.key === 'Tab' && collapsed) {
      e.preventDefault()
      const info = getCaretInfo(host)
      if (info) changeLineIndent(info.lineEl, e.shiftKey ? -1 : 1)
      syncFromDOM()
      return
    }

    // Backspace at offset 0: unindent → demote prefix → merge with previous
    if (e.key === 'Backspace' && collapsed) {
      const info = getCaretInfo(host)
      if (info && info.offset === 0) {
        const lineType = info.lineEl.getAttribute('data-type')
        const indent = parseInt(info.lineEl.getAttribute('data-indent') ?? '0') || 0
        if (indent > 0) {
          e.preventDefault()
          changeLineIndent(info.lineEl, -1)
          syncFromDOM()
          return
        }
        if (lineType !== 'paragraph') {
          e.preventDefault()
          demoteToParagraph(info.lineEl)
          syncFromDOM()
          return
        }
        if (info.lineEl.previousElementSibling?.hasAttribute('data-line')) {
          e.preventDefault()
          mergeLineWithPrev(info.lineEl)
          syncFromDOM()
          return
        }
      }
    }

    // Delete at line end: pull next line up
    if (e.key === 'Delete' && collapsed) {
      const info = getCaretInfo(host)
      if (info) {
        const text = getLineText(info.textEl)
        if (info.offset === text.length) {
          const next = info.lineEl.nextElementSibling as HTMLDivElement | null
          if (next && next.hasAttribute('data-line')) {
            e.preventDefault()
            mergeLineWithPrev(next)
            syncFromDOM()
            return
          }
        }
      }
    }
  }, [syncFromDOM, undo, redo])

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    const checkbox = target.closest('[data-prefix="checkbox"]') as HTMLElement | null
    if (checkbox) {
      e.preventDefault()
      const lineEl = checkbox.closest('[data-line]') as HTMLDivElement | null
      if (lineEl) {
        toggleCheckbox(lineEl)
        syncFromDOM({ saveImmediate: true })
      }
    }
  }, [syncFromDOM])

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    const text = e.clipboardData.getData('text/plain')
    if (!text) return
    e.preventDefault()
    const host = hostRef.current
    if (!host) return

    const sel = window.getSelection()
    if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
      deleteSelectionRange(host, sel.getRangeAt(0))
    }
    const info = getCaretInfo(host)
    if (!info) return

    const lines = text.split('\n')
    if (lines.length === 1) {
      const t = getLineText(info.textEl)
      setLineText(info.textEl, t.slice(0, info.offset) + lines[0] + t.slice(info.offset))
      setCaretIn(info.textEl, info.offset + lines[0].length)
    } else {
      const t = getLineText(info.textEl)
      const before = t.slice(0, info.offset)
      const after = t.slice(info.offset)
      setLineText(info.textEl, before + lines[0])
      let prev: HTMLElement = info.lineEl
      for (let i = 1; i < lines.length; i++) {
        const newLine = buildLineEl(parseLine(lines[i]))
        prev.after(newLine)
        prev = newLine
      }
      const lastTextEl = findTextEl(prev as HTMLDivElement)
      if (lastTextEl) {
        const caretEnd = getLineText(lastTextEl).length
        if (after) setLineText(lastTextEl, getLineText(lastTextEl) + after)
        setCaretIn(lastTextEl, caretEnd)
      }
    }
    syncFromDOM()
  }, [syncFromDOM])

  return (
    <div
      ref={hostRef}
      contentEditable
      suppressContentEditableWarning
      spellCheck
      onKeyDown={handleKeyDown}
      onInput={handleInput}
      onMouseDown={handleMouseDown}
      onPaste={handlePaste}
      className="md-editor outline-none cursor-text space-y-1.5"
    />
  )
}
