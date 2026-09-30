import type { BlockContext, Line, MarkdownConfig } from '@lezer/markdown'
import { syntaxTree } from '@codemirror/language'
import type { StateCommand } from '@codemirror/state'

/**
 * Note-list extensions to CommonMark, so lists start the way people type them:
 *
 * - `a.` / `a)` (a single letter) is a list item, parsed as a `LetterList`
 *   holding ordinary `ListItem`/`ListMark` nodes.
 * - Any list marker — `1.`, `7.`, `a.`, `- ` — starts a list right under a line
 *   of text, even before the item has any text. CommonMark would keep it in the
 *   paragraph unless it is a non-empty `1.`.
 *
 * The saved note stays plain Markdown; this only changes how the editor draws it.
 */

const isSpace = (ch: number) => ch === 32 || ch === 9

/** Length of a `a.` / `a)` marker at the line's content, or -1. */
function letterMarker(line: Line): number {
  const ch = line.next
  const isLetter = (ch >= 97 && ch <= 122) || (ch >= 65 && ch <= 90)
  if (!isLetter) return -1
  const delim = line.text.charCodeAt(line.pos + 1)
  if (delim !== 46 && delim !== 41) return -1
  const after = line.pos + 2
  if (after < line.text.length && !isSpace(line.text.charCodeAt(after))) return -1
  return 2
}

/** Any list marker (`1.`, `12)`, `a.`, `- `, `* `, `+ `) followed by a space or the line end. */
function startsList(line: Line): boolean {
  const { text, pos } = line
  if (line.next === 45 || line.next === 42 || line.next === 43) return isSpace(text.charCodeAt(pos + 1))
  let end = pos
  while (end < text.length && end - pos < 9 && text.charCodeAt(end) >= 48 && text.charCodeAt(end) <= 57) end++
  if (end > pos) {
    const delim = text.charCodeAt(end)
    return (delim === 46 || delim === 41) && (end + 1 === text.length || isSpace(text.charCodeAt(end + 1)))
  }
  return letterMarker(line) > 0
}

/** Column where an item's text starts (CommonMark's rule, as in @lezer/markdown). */
function listIndent(line: Line, pos: number): number {
  const indentAfter = line.countIndent(pos, line.pos, line.indent)
  const skipped = line.skipSpace(pos)
  const indented = line.countIndent(skipped, pos, indentAfter)
  return indented >= indentAfter + 5 || skipped === line.text.length ? indentAfter + 1 : indented
}

export const noteListExtension: MarkdownConfig = {
  defineNodes: [
    {
      name: 'LetterList',
      block: true,
      // Continue across blank lines, indented item content, and further
      // letter items with the same delimiter.
      composite(_cx, line, delim) {
        if (line.pos === line.text.length || line.indent > line.baseIndent) return true
        if (line.indent >= line.baseIndent + 4) return false
        return letterMarker(line) > 0 && line.text.charCodeAt(line.pos + 1) === delim
      },
    },
  ],
  parseBlock: [
    {
      name: 'LetterList',
      before: 'OrderedList',
      parse(cx: BlockContext, line: Line) {
        if (line.indent >= line.baseIndent + 4) return false
        const size = letterMarker(line)
        if (size < 0) return false
        if (cx.parentType().name !== 'LetterList') {
          cx.startComposite('LetterList', line.basePos, line.text.charCodeAt(line.pos + 1))
        }
        const newBase = listIndent(line, line.pos + size)
        cx.startComposite('ListItem', line.basePos, newBase - line.baseIndent)
        cx.addElement(cx.elt('ListMark', cx.lineStart + line.pos, cx.lineStart + line.pos + size))
        line.moveBaseColumn(newBase)
        return null
      },
      endLeaf: (_cx, line) => line.indent < line.baseIndent + 4 && startsList(line),
    },
  ],
}

/**
 * Enter in a letter list: start the next letter (`b.` after `a.`), or end the
 * list when the item is still empty. Other lists fall through to the Markdown
 * keymap, which already continues `1.` and `-` lists.
 */
export const continueLetterList: StateCommand = ({ state, dispatch }) => {
  const range = state.selection.main
  if (!range.empty || state.selection.ranges.length > 1) return false
  let item = syntaxTree(state).resolveInner(range.head, -1)
  while (item.name !== 'ListItem' && item.parent) item = item.parent
  if (item.name !== 'ListItem' || item.parent?.name !== 'LetterList') return false

  const line = state.doc.lineAt(range.head)
  const m = /^(\s*)([a-zA-Z])([.)])(\s*)/.exec(line.text)
  if (!m || line.from + m[0].length > range.head) return false

  if (!line.text.slice(m[0].length).trim()) {
    dispatch(state.update({ changes: { from: line.from, to: line.to }, userEvent: 'delete' }))
    return true
  }
  const letter = m[2]
  const next = letter === 'z' ? 'a' : letter === 'Z' ? 'A' : String.fromCharCode(letter.charCodeAt(0) + 1)
  const insert = `${state.lineBreak}${m[1]}${next}${m[3]} `
  dispatch(
    state.update({
      changes: { from: range.head, insert },
      selection: { anchor: range.head + insert.length },
      scrollIntoView: true,
      userEvent: 'input',
    }),
  )
  return true
}
