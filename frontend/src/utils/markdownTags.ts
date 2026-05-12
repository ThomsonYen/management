// Shared with backend (regex must stay in sync with backend/main.py:_TAG_REGEX).
// Tag names: ASCII letter + alphanumeric/underscore, with optional `/`-separated nesting.
export const TAG_REGEX = /(?<![A-Za-z0-9_/])#([A-Za-z][A-Za-z0-9_]*(?:\/[A-Za-z][A-Za-z0-9_]*)*)\b/g

export function stripCodeAndLinks(body: string): string {
  let s = body.replace(/```[\s\S]*?```/g, ' ')
  s = s.replace(/`[^`\n]+`/g, ' ')
  s = s.replace(/<!--[\s\S]*?-->/g, ' ')
  s = s.replace(/\b(?:https?|ftp|mailto):[^\s<>"'`]+/g, ' ')
  return s
}

export function extractTags(body: string): string[] {
  if (!body) return []
  const stripped = stripCodeAndLinks(body)
  const seen = new Set<string>()
  for (const m of stripped.matchAll(TAG_REGEX)) {
    seen.add(m[1].toLowerCase())
  }
  return [...seen].sort()
}
