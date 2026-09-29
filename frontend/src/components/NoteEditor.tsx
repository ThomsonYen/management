import { useEffect, useRef } from 'react'
import { Annotation, Compartment, EditorState, type Extension, type Range } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  type KeyBinding,
  keymap,
  placeholder as placeholderExt,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentLess, indentMore } from '@codemirror/commands'
import { indentUnit, syntaxTree } from '@codemirror/language'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import type { SyntaxNode } from '@lezer/common'
import { useHotkeys, type HotkeyBindings } from '../SettingsContext'
import { TAG_REGEX } from '../utils/markdownTags'

/**
 * Bear-style Markdown editor for notes: the text is edited where it is shown.
 * The document stays plain Markdown (the saved file is untouched); decorations
 * draw list bullets as red shapes by depth, tasks as checkboxes, headings at
 * size, and leave `#`, `**`, `` ` `` and link punctuation visible but faint.
 *
 * With `readOnly` it is the renderer too, so a shared note looks the same to
 * the reader as to the writer.
 */

export interface NoteEditorProps {
  value: string
  onChange?: (md: string) => void
  readOnly?: boolean
  placeholder?: string
  /** A hashtag was opened (⌘/Ctrl-click, or a plain click when read-only). */
  onTagClick?: (tag: string) => void
  autoFocus?: boolean
  /** Smaller type for notes inside cards (todo descriptions). */
  compact?: boolean
  className?: string
}

// ─── Widgets ────────────────────────────────────────────────────────────────

class BulletWidget extends WidgetType {
  constructor(readonly depth: number) { super() }
  eq(other: BulletWidget) { return other.depth === this.depth }
  toDOM() {
    const box = document.createElement('span')
    box.className = 'cm-md-marker'
    const shape = document.createElement('span')
    shape.className = `md-bullet-shape md-bullet-${this.depth % 4}`
    box.appendChild(shape)
    return box
  }
}

class OrdinalWidget extends WidgetType {
  constructor(readonly label: string) { super() }
  eq(other: OrdinalWidget) { return other.label === this.label }
  toDOM() {
    const box = document.createElement('span')
    box.className = 'cm-md-marker cm-md-ordinal'
    box.textContent = this.label
    return box
  }
}

class CheckboxWidget extends WidgetType {
  /** `markerFrom` is the position of the `[` of `[ ]` / `[x]`. */
  constructor(readonly checked: boolean, readonly markerFrom: number) { super() }
  eq(other: CheckboxWidget) { return other.checked === this.checked && other.markerFrom === this.markerFrom }
  toDOM(view: EditorView) {
    const box = document.createElement('span')
    box.className = 'cm-md-marker'
    const cb = document.createElement('span')
    cb.className = 'cm-md-checkbox'
    cb.setAttribute('data-checked', String(this.checked))
    cb.setAttribute('role', 'checkbox')
    cb.setAttribute('aria-checked', String(this.checked))
    if (this.checked) {
      cb.innerHTML =
        '<svg style="width:0.7em;height:0.7em" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3.5">' +
        '<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>'
    }
    cb.addEventListener('mousedown', (e) => {
      e.preventDefault()
      if (view.state.readOnly) return
      // Positions shift as the note is edited, so read the marker from the DOM.
      const at = view.posAtDOM(box)
      const line = view.state.doc.lineAt(at)
      const m = /\[([ xX])\]/.exec(line.text.slice(at - line.from))
      if (!m) return
      const from = at + m.index + 1
      view.dispatch({ changes: { from, to: from + 1, insert: m[1] === ' ' ? 'x' : ' ' } })
    })
    box.appendChild(cb)
    return box
  }
  ignoreEvent() { return true }
}

// ─── Decorations ────────────────────────────────────────────────────────────

const syntaxMark = Decoration.mark({ class: 'cm-md-syntax' })
const hidden = Decoration.replace({})

const MARK_CLASS: Record<string, string> = {
  StrongEmphasis: 'cm-md-strong',
  Emphasis: 'cm-md-em',
  Strikethrough: 'cm-md-strike',
  InlineCode: 'cm-md-code',
  Link: 'cm-md-link',
  URL: 'cm-md-url',
  HorizontalRule: 'cm-md-hr',
}
const SYNTAX_NODES = new Set(['HeaderMark', 'EmphasisMark', 'CodeMark', 'LinkMark', 'StrikethroughMark', 'QuoteMark', 'CodeInfo'])
const NO_TAG_NODES = new Set(['InlineCode', 'FencedCode', 'CodeBlock', 'URL', 'LinkLabel', 'HTMLBlock', 'Comment'])
const MARKER_EM = 1.5

function listDepth(node: SyntaxNode): number {
  let depth = 0
  for (let p: SyntaxNode | null = node.parent; p; p = p.parent) {
    if (p.name === 'BulletList' || p.name === 'OrderedList') depth++
  }
  return depth
}

interface Built { decorations: DecorationSet; atomic: DecorationSet }

function buildDecorations(view: EditorView): Built {
  const { state } = view
  const doc = state.doc
  const deco: Range<Decoration>[] = []
  const atomic: Range<Decoration>[] = []
  const tree = syntaxTree(state)
  const taskMarkersDone = new Set<number>()

  const replace = (from: number, to: number, d: Decoration) => {
    deco.push(d.range(from, to))
    atomic.push(d.range(from, to))
  }
  const lineClass = (pos: number, cls: string) => {
    deco.push(Decoration.line({ class: cls }).range(doc.lineAt(pos).from))
  }

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (n) => {
        const name = n.name
        const heading = /^(?:ATX|Setext)Heading(\d)$/.exec(name)
        if (heading) {
          lineClass(n.from, `cm-md-h${heading[1]}`)
          return
        }
        if (name === 'FencedCode' || name === 'CodeBlock') {
          for (let pos = n.from; pos <= n.to; ) {
            const line = doc.lineAt(pos)
            lineClass(line.from, 'cm-md-codeblock')
            pos = line.to + 1
          }
          return
        }
        if (name === 'Blockquote') {
          for (let pos = n.from; pos <= n.to; ) {
            const line = doc.lineAt(pos)
            lineClass(line.from, 'cm-md-quote')
            pos = line.to + 1
          }
          return
        }
        if (name === 'ListMark') {
          const item = n.node.parent
          const list = item?.parent
          if (!item || !list) return
          const depth = listDepth(n.node)
          const line = doc.lineAt(n.from)
          // Only the item's first line gets a marker box; the hanging indent
          // keeps wrapped text aligned under the item's text.
          if (line.from !== doc.lineAt(item.from).from) return
          const indentPx = `${depth * MARKER_EM}em`
          deco.push(
            Decoration.line({
              attributes: { style: `padding-left:${indentPx};text-indent:-${MARKER_EM}em` },
            }).range(line.from),
          )
          // Source indentation is replaced by the depth padding above.
          if (n.from > line.from) replace(line.from, n.from, hidden)

          const afterMark = doc.sliceString(n.to, n.to + 1) === ' ' ? n.to + 1 : n.to
          const task = n.node.nextSibling?.name === 'Task' ? n.node.nextSibling : null
          const taskMarker = task?.firstChild?.name === 'TaskMarker' ? task.firstChild : null
          if (taskMarker) {
            const checked = /x/i.test(doc.sliceString(taskMarker.from, taskMarker.to))
            const end = doc.sliceString(taskMarker.to, taskMarker.to + 1) === ' ' ? taskMarker.to + 1 : taskMarker.to
            replace(n.from, end, Decoration.replace({ widget: new CheckboxWidget(checked, taskMarker.from) }))
            taskMarkersDone.add(taskMarker.from)
            if (checked && task && end < task.to) {
              deco.push(Decoration.mark({ class: 'cm-md-done' }).range(end, task.to))
            }
          } else if (list.name === 'BulletList') {
            replace(n.from, afterMark, Decoration.replace({ widget: new BulletWidget(depth - 1) }))
          } else {
            replace(n.from, afterMark, Decoration.replace({ widget: new OrdinalWidget(doc.sliceString(n.from, n.to)) }))
          }
          return
        }
        if (name === 'TaskMarker') {
          if (taskMarkersDone.has(n.from)) return
          // A task not directly after a list marker: still a checkbox.
          const checked = /x/i.test(doc.sliceString(n.from, n.to))
          replace(n.from, n.to, Decoration.replace({ widget: new CheckboxWidget(checked, n.from) }))
          return
        }
        if (SYNTAX_NODES.has(name)) {
          if (n.to > n.from) deco.push(syntaxMark.range(n.from, n.to))
          return
        }
        const cls = MARK_CLASS[name]
        if (cls && n.to > n.from) deco.push(Decoration.mark({ class: cls }).range(n.from, n.to))
      },
    })

    // Hashtags, the same pattern the backend and tag sidebar use.
    for (let pos = from; pos <= to; ) {
      const line = doc.lineAt(pos)
      TAG_REGEX.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = TAG_REGEX.exec(line.text)) !== null) {
        const start = line.from + m.index
        let inCode = false
        for (let p: SyntaxNode | null = tree.resolveInner(start, 1); p; p = p.parent) {
          if (NO_TAG_NODES.has(p.name)) { inCode = true; break }
        }
        if (inCode) continue
        deco.push(
          Decoration.mark({
            class: 'cm-md-tag',
            attributes: { 'data-tag': m[1].toLowerCase(), title: 'Open tag (⌘-click)' },
          }).range(start, start + m[0].length),
        )
      }
      pos = line.to + 1
    }
  }

  return { decorations: Decoration.set(deco, true), atomic: Decoration.set(atomic, true) }
}

const noteDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    atomic: DecorationSet
    constructor(view: EditorView) {
      ;({ decorations: this.decorations, atomic: this.atomic } = buildDecorations(view))
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) {
        ;({ decorations: this.decorations, atomic: this.atomic } = buildDecorations(u.view))
      }
    }
  },
  {
    decorations: (v) => v.decorations,
    provide: (plugin) => EditorView.atomicRanges.of((view) => view.plugin(plugin)?.atomic ?? Decoration.none),
  },
)

// ─── Keys ───────────────────────────────────────────────────────────────────

/** Settings binding ("meta+shift+t") → CodeMirror key ("Meta-Shift-t"). */
function toCmKey(binding: string): string {
  const mods: Record<string, string> = { meta: 'Meta', ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift' }
  const named: Record<string, string> = { tab: 'Tab', enter: 'Enter', escape: 'Escape', backspace: 'Backspace', ' ': 'Space' }
  return binding
    .split('+')
    .map((p) => mods[p] ?? named[p] ?? p)
    .join('-')
}

/** Turn the current line into a `- [ ] ` task (or a bullet into one). */
function insertTodo(view: EditorView): boolean {
  const { state } = view
  const line = state.doc.lineAt(state.selection.main.head)
  const indent = /^\s*/.exec(line.text)![0]
  const bullet = /^(\s*)([-*+])\s(?!\[[ xX]\])/.exec(line.text)
  if (/^\s*[-*+]\s\[[ xX]\]/.test(line.text)) return true
  if (bullet) {
    const at = line.from + bullet[0].length
    view.dispatch({ changes: { from: at, insert: '[ ] ' }, selection: { anchor: state.selection.main.head + 4 } })
  } else {
    const at = line.from + indent.length
    view.dispatch({ changes: { from: at, insert: '- [ ] ' }, selection: { anchor: state.selection.main.head + 6 } })
  }
  return true
}

function noteKeymap(b: HotkeyBindings): KeyBinding[] {
  return [
    { key: toCmKey(b.editorInsertTodo), run: insertTodo, preventDefault: true },
    { key: toCmKey(b.editorIndent), run: indentMore, preventDefault: true },
    { key: toCmKey(b.editorUnindent), run: indentLess, preventDefault: true },
  ]
}

// ─── Component ──────────────────────────────────────────────────────────────

/** Marks a document swap that came in through `value`, so it isn't echoed to onChange. */
const external = Annotation.define<boolean>()

export default function NoteEditor({
  value,
  onChange,
  readOnly = false,
  placeholder = '',
  onTagClick,
  autoFocus = false,
  compact = false,
  className = '',
}: NoteEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const onTagClickRef = useRef(onTagClick)
  onChangeRef.current = onChange
  onTagClickRef.current = onTagClick
  const { bindings } = useHotkeys()

  const compartments = useRef({ keys: new Compartment(), editable: new Compartment(), placeholder: new Compartment() })

  const editableExt = (ro: boolean): Extension => [
    EditorState.readOnly.of(ro),
    EditorView.editable.of(!ro),
    EditorView.editorAttributes.of({ class: `cm-note${ro ? ' cm-readonly' : ''}${compact ? ' cm-note-compact' : ''}` }),
  ]

  useEffect(() => {
    const c = compartments.current
    const view = new EditorView({
      parent: hostRef.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          c.keys.of(keymap.of(noteKeymap(bindings))),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          indentUnit.of('  '),
          EditorState.tabSize.of(2),
          markdown({ base: markdownLanguage }),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ spellcheck: 'true', autocapitalize: 'sentences' }),
          c.editable.of(editableExt(readOnly)),
          c.placeholder.of(placeholder ? placeholderExt(placeholder) : []),
          noteDecorations,
          EditorView.domEventHandlers({
            mousedown: (e, v) => {
              const tagEl = (e.target as HTMLElement).closest('.cm-md-tag') as HTMLElement | null
              if (!tagEl || !(e.metaKey || e.ctrlKey || v.state.readOnly)) return false
              const tag = tagEl.getAttribute('data-tag')
              if (!tag || !onTagClickRef.current) return false
              e.preventDefault()
              onTagClickRef.current(tag)
              return true
            },
          }),
          EditorView.updateListener.of((u) => {
            if (!u.docChanged || u.transactions.some((tr) => tr.annotation(external))) return
            onChangeRef.current?.(u.state.doc.toString())
          }),
        ],
      }),
    })
    viewRef.current = view
    if (autoFocus && !readOnly) view.focus()
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // The view is created once; props below are pushed in by their own effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A new value from outside (note loaded or refetched) replaces the document.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (value === current) return
    const head = Math.min(view.state.selection.main.head, value.length)
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
      selection: { anchor: head },
      annotations: external.of(true),
    })
  }, [value])

  useEffect(() => {
    viewRef.current?.dispatch({ effects: compartments.current.keys.reconfigure(keymap.of(noteKeymap(bindings))) })
  }, [bindings])

  useEffect(() => {
    viewRef.current?.dispatch({ effects: compartments.current.editable.reconfigure(editableExt(readOnly)) })
  }, [readOnly])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: compartments.current.placeholder.reconfigure(placeholder ? placeholderExt(placeholder) : []),
    })
  }, [placeholder])

  return <div ref={hostRef} className={className} />
}
