import type { Project } from '../types'

/**
 * Projects to offer when assigning work: the active ones, plus any the item is
 * already in, so a deprecated project still shows as the current value.
 * Filters (views of existing work) should keep using the full list.
 */
export function pickableProjects<P extends Project>(projects: P[], keep: number | null | undefined | number[] = []): P[] {
  const keepIds = new Set((Array.isArray(keep) ? keep : [keep]).filter((id): id is number => id != null))
  return projects.filter((p) => !p.deprecated_at || keepIds.has(p.id))
}

/** Option label that marks a deprecated project the item is still in. */
export function projectOptionLabel(p: Project): string {
  return p.deprecated_at ? `${p.name} (deprecated)` : p.name
}

/**
 * Project importance tiers, lowest to highest. Colours follow the todo
 * importance scale (badgeClasses.ts) so a critical project reads the same as
 * a critical todo: low grey, medium blue, high amber, critical crimson.
 */
export const PROJECT_IMPORTANCE_CYCLE: Record<string, string> = {
  low: 'medium',
  medium: 'high',
  high: 'critical',
  critical: 'low',
}

export const PROJECT_IMPORTANCE_DOT: Record<string, string> = {
  low: 'bg-border dark:bg-inset',
  medium: 'bg-info',
  high: 'bg-prio-high',
  critical: 'bg-prio-critical',
}

export const PROJECT_IMPORTANCE_TEXT: Record<string, string> = {
  low: 'text-fg-muted',
  medium: 'text-info',
  high: 'text-prio-high',
  critical: 'text-prio-critical',
}
