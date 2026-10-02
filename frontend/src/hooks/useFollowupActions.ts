import { useCallback, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { followupTodo, unfollowupTodo, updateTodo } from '../api'
import type { Todo } from '../types'
import { useToast } from '../ToastContext'
import { useTimezone } from '../SettingsContext'
import { getTodayString } from '../dateUtils'
import { patchTodoCaches } from '../utils/optimisticTodo'

type Ref = Pick<Todo, 'id' | 'title' | 'is_focused' | 'focus_order' | 'check_back_on' | 'status'>

export const FOLLOWUP_DEFAULT_DAYS = 3

/** YYYY-MM-DD `n` days after `day` (calendar arithmetic, DST-proof). */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/** Days from `a` to `b` (both YYYY-MM-DD). */
export function dayDiff(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000)
}

/** "today", "tomorrow", "Fri", or "Oct 14" for a check-back date. */
export function relativeDay(day: string, today: string): string {
  const n = dayDiff(today, day)
  if (n === 0) return 'today'
  if (n === 1) return 'tomorrow'
  if (n === -1) return 'yesterday'
  const [y, m, d] = day.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (n > 1 && n < 7) return dt.toLocaleDateString(undefined, { timeZone: 'UTC', weekday: 'short' })
  return dt.toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric' })
}

/** Short chase label for a follow-up: "chase today", "2d late", "chase Fri", or null without a date. */
export function chaseLabel(t: Pick<Todo, 'check_back_on'>, today: string): { text: string; due: boolean } | null {
  if (!t.check_back_on) return null
  const n = dayDiff(today, t.check_back_on)
  if (n < 0) return { text: `${-n}d late`, due: true }
  if (n === 0) return { text: 'chase today', due: true }
  return { text: `chase ${relativeDay(t.check_back_on, today)}`, due: false }
}

/**
 * Turn todos into follow-ups and back, resolve and re-date them. Every change
 * applies to the caches at once and offers an Undo toast, like unfocusing.
 */
export function useFollowupActions() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const { timezone } = useTimezone()

  // Sync in the background; resync either way so a failed call (already
  // toasted by ApiErrorToaster) puts the optimistic change back.
  const sync = useCallback((p: Promise<unknown>, ids: number[]) => {
    p.catch(() => {}).then(() => {
      queryClient.invalidateQueries({ queryKey: ['todos'] })
      queryClient.invalidateQueries({ queryKey: ['reminders'] })
      queryClient.invalidateQueries({ queryKey: ['recently-done'] })
      ids.forEach((id) => queryClient.invalidateQueries({ queryKey: ['todo', id] }))
    })
  }, [queryClient])

  const toFollowup = useCallback((todos: Ref[], checkBackOn?: string) => {
    const items = todos.filter((t) => t.status !== 'done')
    if (items.length === 0) return
    const today = getTodayString(timezone)
    const back = checkBackOn ?? addDays(today, FOLLOWUP_DEFAULT_DAYS)
    items.forEach((t) => patchTodoCaches(queryClient, t.id, {
      is_followup: true, followup_since: new Date().toISOString(), check_back_on: back,
      waiting_days: 0, check_back_due: back <= today, is_focused: false,
    }))
    sync(Promise.all(items.map((t) => followupTodo(t.id, back))), items.map((t) => t.id))
    showToast({
      message: items.length === 1
        ? `Waiting on a reply for "${items[0].title}" · chase ${relativeDay(back, today)}`
        : `Moved ${items.length} todos to Waiting on`,
      action: {
        label: 'Undo',
        onClick: () => {
          items.forEach((t) => patchTodoCaches(queryClient, t.id, {
            is_followup: false, followup_since: null, check_back_on: null, check_back_due: false, is_focused: t.is_focused,
          }))
          sync(Promise.all(items.map(async (t) => {
            await unfollowupTodo(t.id)
            if (t.is_focused) await updateTodo(t.id, { is_focused: true, focus_order: t.focus_order })
          })), items.map((t) => t.id))
        },
      },
    })
  }, [queryClient, showToast, timezone, sync])

  const toTodo = useCallback((todos: Ref[], focus = true) => {
    if (todos.length === 0) return
    todos.forEach((t) => patchTodoCaches(queryClient, t.id, {
      is_followup: false, followup_since: null, check_back_on: null, check_back_due: false,
      ...(focus ? { is_focused: true, focus_order: Number.MAX_SAFE_INTEGER } : {}),
    }))
    sync(Promise.all(todos.map((t) => unfollowupTodo(t.id, focus))), todos.map((t) => t.id))
    showToast({
      message: todos.length === 1
        ? (focus ? `"${todos[0].title}" is back on Focus` : `"${todos[0].title}" is a todo again`)
        : `${todos.length} follow-ups are todos again`,
      tone: 'success',
      action: {
        label: 'Undo',
        onClick: () => {
          sync(Promise.all(todos.map((t) => followupTodo(t.id, t.check_back_on ?? undefined))), todos.map((t) => t.id))
        },
      },
    })
  }, [queryClient, showToast, sync])

  const resolve = useCallback((t: Ref) => {
    patchTodoCaches(queryClient, t.id, { status: 'done', check_back_due: false })
    sync(updateTodo(t.id, { status: 'done' }), [t.id])
    showToast({
      message: `Resolved "${t.title}"`,
      tone: 'success',
      action: {
        label: 'Undo',
        onClick: () => { sync(updateTodo(t.id, { status: 'todo' }), [t.id]) },
      },
    })
  }, [queryClient, showToast, sync])

  /** Chased it (or just re-dating): check again on `day`, or in `days` days. */
  const checkBack = useCallback((t: Ref, when: { days: number } | { day: string | null }) => {
    const today = getTodayString(timezone)
    const day = 'days' in when ? addDays(today, when.days) : when.day
    patchTodoCaches(queryClient, t.id, { check_back_on: day, check_back_due: !!day && day <= today })
    sync(updateTodo(t.id, { check_back_on: day }), [t.id])
    const previous = t.check_back_on ?? null
    showToast({
      message: day ? `Check back on "${t.title}" ${relativeDay(day, today)}` : `Cleared the check-back date`,
      action: {
        label: 'Undo',
        onClick: () => { sync(updateTodo(t.id, { check_back_on: previous }), [t.id]) },
      },
    })
  }, [queryClient, showToast, timezone, sync])

  return useMemo(() => ({ toFollowup, toTodo, resolve, checkBack }), [toFollowup, toTodo, resolve, checkBack])
}
