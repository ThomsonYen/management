// Tiny classname joiner. No dependency; keeps bundle small.
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}
