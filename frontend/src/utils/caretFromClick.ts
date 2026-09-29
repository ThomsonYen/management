/**
 * Click-to-edit fields: text is shown as plain text and swapped for an input
 * when clicked. These helpers put the caret where the click landed instead of
 * at the end of the text.
 *
 * Usage:
 *   const caret = useRef<number | null>(null)
 *   <span onClick={(e) => { caret.current = clickOffset(e); startEdit() }}>…</span>
 *   <input ref={placeCaret(caret)} … />
 */

/** Character offset within the clicked element's text at the click point, or null. */
export function clickOffset(e: React.MouseEvent<HTMLElement>): number | null {
  const el = e.currentTarget
  let node: Node | null = null
  let offset = 0
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
    caretRangeFromPoint?: (x: number, y: number) => Range | null
  }
  if (doc.caretPositionFromPoint) {
    const pos = doc.caretPositionFromPoint(e.clientX, e.clientY)
    if (pos) { node = pos.offsetNode; offset = pos.offset }
  } else if (doc.caretRangeFromPoint) {
    const range = doc.caretRangeFromPoint(e.clientX, e.clientY)
    if (range) { node = range.startContainer; offset = range.startOffset }
  }
  if (!node || !el.contains(node)) return null
  if (node.nodeType !== Node.TEXT_NODE) return null
  // Add up the text before the clicked text node (the element may hold several).
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let before = 0
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n === node) return before + offset
    before += n.textContent?.length ?? 0
  }
  return null
}

/** Ref callback for the input that replaces the text: focus it with the caret at the stored offset. */
export function placeCaret(offsetRef: { current: number | null }) {
  return (el: HTMLInputElement | HTMLTextAreaElement | null) => {
    if (!el || offsetRef.current == null) return
    const at = Math.min(offsetRef.current, el.value.length)
    offsetRef.current = null
    el.focus()
    el.setSelectionRange(at, at)
  }
}
