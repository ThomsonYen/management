import type { Root, ListItem, Paragraph, Text } from 'mdast'
import { visit } from 'unist-util-visit'

/** Renders `- [ ]` / `- [x]` list items whose box is the whole content as real task checkboxes. */
export function remarkFixEmptyTasks() {
  return (tree: Root) => {
    visit(tree, 'listItem', (node: ListItem) => {
      if (node.checked != null) return
      const para = node.children[0]
      if (!para || para.type !== 'paragraph' || para.children.length !== 1) return
      const text = para.children[0]
      if (text.type !== 'text') return
      const val = text.value.trim()
      if (val === '[ ]') {
        node.checked = false
        ;(para as Paragraph).children = [{ type: 'text', value: ' ' } as Text]
      } else if (val === '[x]' || val === '[X]') {
        node.checked = true
        ;(para as Paragraph).children = [{ type: 'text', value: ' ' } as Text]
      }
    })
  }
}
