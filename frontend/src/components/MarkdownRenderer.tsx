import type React from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ContentBlock =
  | { type: 'todo'; text: string; done: boolean; indent: number; lineIndex: number }
  | { type: 'list'; text: string; indent: number; lineIndex: number }
  | { type: 'header'; text: string; lineIndex: number }
  | { type: 'paragraph'; text: string; indent: number; lineIndex: number }

// ─── Parsing ──────────────────────────────────────────────────────────────────

/** Parse markdown lines into typed content blocks. */
export function parseContentBlocks(content: string, lineOffset = 0): ContentBlock[] {
  const blocks: ContentBlock[] = []
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue

    // Todo: "- [ ] text" or "  - [x] text"
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

    // Sub-header: ### or ####
    const headerMatch = line.match(/^(\s*)#{3,4}\s+(.+)/)
    if (headerMatch) {
      blocks.push({
        type: 'header',
        text: headerMatch[2],
        lineIndex: lineOffset + i,
      })
      continue
    }

    // List item: "- text" or "* text" (with optional indent)
    const listMatch = line.match(/^(\s*)[-*]\s+(.+)/)
    if (listMatch) {
      blocks.push({
        type: 'list',
        text: listMatch[2],
        indent: listMatch[1].length,
        lineIndex: lineOffset + i,
      })
      continue
    }

    // Everything else is a paragraph
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

// ─── Block-level rendering ────────────────────────────────────────────────

const INDENT_PX = 20

function BlockWrapper({ indent, children, className }: { indent: number; children: React.ReactNode; className?: string }) {
  return (
    <div className={className} style={indent > 0 ? { paddingLeft: indent * INDENT_PX } : undefined}>
      {children}
    </div>
  )
}

/** Render a list of content blocks. */
export function ContentBlockList({ blocks, onToggle }: { blocks: ContentBlock[]; onToggle?: (lineIndex: number) => void }) {
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
                <span className={`text-sm leading-relaxed ${block.done ? 'line-through text-slate-400 dark:text-slate-600' : 'text-slate-700 dark:text-slate-200'}`}>
                  {renderInline(block.text)}
                </span>
              </BlockWrapper>
            )
          case 'list':
            return (
              <BlockWrapper key={block.lineIndex} indent={block.indent} className="flex items-start gap-2 pl-0.5">
                <span className="text-slate-400 dark:text-slate-500 mt-0.5 text-xs">&#8226;</span>
                <span className="text-sm text-slate-600 dark:text-slate-300">{renderInline(block.text)}</span>
              </BlockWrapper>
            )
          case 'header':
            return (
              <h4 key={block.lineIndex} className="text-xs font-bold text-slate-500 dark:text-slate-400 tracking-wide mt-2 mb-0.5">
                {block.text}
              </h4>
            )
          case 'paragraph':
            return (
              <BlockWrapper key={block.lineIndex} indent={block.indent}>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  {renderInline(block.text)}
                </p>
              </BlockWrapper>
            )
        }
      })}
    </div>
  )
}
