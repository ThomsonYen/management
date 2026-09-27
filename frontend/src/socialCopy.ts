// All Social nudge wording lives here — edit this file to change the app's
// tone. Both the Social page and the Dashboard card read from it, so they can
// never drift apart.
import type { BadgeTone } from './components/ui'
import type { Friend, SocialStatus } from './types'

export interface NudgeCopy {
  /** Short chip next to the name. */
  label: string
  tone: BadgeTone
  /** The line the user actually reads. */
  headline: string
}

/** Stable per friend per day: the wording holds still while you use the app,
 *  but you don't get the same sentence every single day. */
function pick(variants: string[], friend: Friend): string {
  const seed = friend.id * 31 + new Date().getDate()
  return variants[seed % variants.length]
}

const LABELS: Record<SocialStatus, { label: string; tone: BadgeTone }> = {
  planned: { label: 'Planned', tone: 'info' },
  needs_confirm: { label: 'Did it happen?', tone: 'accent' },
  never: { label: 'No history', tone: 'neutral' },
  ok: { label: 'Recent', tone: 'success' },
  due_soon: { label: 'Getting there', tone: 'warning' },
  slipping: { label: 'Terrible friend', tone: 'danger' },
  overdue: { label: 'Overdue', tone: 'danger' },
}

export function nudgeCopy(f: Friend): NudgeCopy {
  const { label, tone } = LABELS[f.status]
  const days = f.days_since_hangout
  const name = f.name

  let headline: string
  switch (f.status) {
    case 'planned':
      headline =
        f.days_until_plan === 0
          ? `Seeing ${name} today!`
          : f.days_until_plan === 1
            ? `Seeing ${name} tomorrow`
            : `Seeing ${name} in ${f.days_until_plan} days`
      break
    case 'needs_confirm':
      headline = `Did you actually see ${name}? Plans don't count until they happen.`
      break
    case 'never':
      headline = `You've never logged anything with ${name}.`
      break
    case 'ok':
      headline = `All good with ${name}.`
      break
    case 'due_soon':
      headline = pick(
        [
          `It's been ${days} days since you saw ${name}. Maybe text them?`,
          `${name} is drifting. ${days} days and counting.`,
          `Coming up on too long since you saw ${name}.`,
        ],
        f,
      )
      break
    case 'slipping':
      headline = pick(
        [
          `You're being a terrible friend to ${name}!`,
          `${name} is about to forget what you look like.`,
          `${days} days. ${name} deserves better than this.`,
        ],
        f,
      )
      break
    case 'overdue': {
      const over = Math.abs(f.days_until_due ?? 0)
      headline =
        over >= 30
          ? pick(
              [
                `${days} days without seeing ${name}. This is a friendship in name only.`,
                `${name} has been waiting a month past due. Genuinely embarrassing.`,
              ],
              f,
            )
          : pick(
              [
                `Officially a terrible friend to ${name} — ${days} days!`,
                `${over} days past due on ${name}. Fix it.`,
                `${name} called. (They didn't. It's been ${days} days.)`,
              ],
              f,
            )
      break
    }
  }
  return { label, tone, headline }
}

/** Sort order for the Social page: loudest first. */
export const STATUS_RANK: Record<SocialStatus, number> = {
  needs_confirm: 0,
  overdue: 1,
  slipping: 2,
  due_soon: 3,
  never: 4,
  planned: 5,
  ok: 6,
}
