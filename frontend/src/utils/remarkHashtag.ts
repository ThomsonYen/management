import type { Root, Text, Parent, Link } from 'mdast'
import { visit, SKIP } from 'unist-util-visit'
import { TAG_REGEX } from './markdownTags'

/**
 * Walks markdown text nodes and replaces `#foo` / `#idea/ml` matches with
 * `<a class="md-hashtag" href="/notes?tag=foo">#foo</a>` link nodes.
 *
 * Skips text inside `link` parents (so we don't re-link inside an existing link).
 * `code` / `inlineCode` nodes carry literal values, not text children, so they
 * are never visited and therefore implicitly skipped.
 */
export function remarkHashtag() {
  return (tree: Root) => {
    visit(tree, 'text', (node: Text, index, parent) => {
      if (!parent || index === undefined) return
      if (parent.type === 'link') return

      const value = node.value
      // Reset lastIndex defensively (TAG_REGEX is `g`-flagged and shared).
      TAG_REGEX.lastIndex = 0
      const matches: RegExpExecArray[] = []
      let m: RegExpExecArray | null
      while ((m = TAG_REGEX.exec(value)) !== null) {
        matches.push(m)
      }
      if (matches.length === 0) return

      const newNodes: (Text | Link)[] = []
      let cursor = 0
      for (const match of matches) {
        const start = match.index
        const end = start + match[0].length
        if (start > cursor) {
          newNodes.push({ type: 'text', value: value.slice(cursor, start) })
        }
        newNodes.push({
          type: 'link',
          url: `/notes?tag=${encodeURIComponent(match[1].toLowerCase())}`,
          title: null,
          data: { hProperties: { className: 'md-hashtag' } },
          children: [{ type: 'text', value: match[0] }],
        } as Link)
        cursor = end
      }
      if (cursor < value.length) {
        newNodes.push({ type: 'text', value: value.slice(cursor) })
      }

      ;(parent as Parent).children.splice(index, 1, ...newNodes)
      return [SKIP, index + newNodes.length]
    })
  }
}
