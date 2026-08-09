import { useMutation, useQueryClient } from '@tanstack/react-query'
import { checkInPerson } from '../api'
import { useTimezone } from '../SettingsContext'
import { useToast } from '../ToastContext'
import { getTodayString } from '../dateUtils'
import type { Person } from '../types'

interface Props {
  person: Person
  size?: 'xs' | 'sm'
}

/** One-click "we just checked in" — stamps today's date on the person. */
export default function CheckInButton({ person, size = 'sm' }: Props) {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const { timezone } = useTimezone()

  const mutation = useMutation({
    mutationFn: (date: string | null) => checkInPerson(person.id, date),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['persons'] })
    },
  })

  const today = getTodayString(timezone)
  const alreadyToday = person.last_check_in_date === today

  const handleClick = () => {
    const previous = person.last_check_in_date ?? null
    mutation.mutate(today)
    showToast({
      message: `Checked in with ${person.name}`,
      tone: 'success',
      action: { label: 'Undo', onClick: () => mutation.mutate(previous) },
    })
  }

  const pad = size === 'xs' ? 'text-[11px] px-2 py-0.5' : 'text-xs px-2.5 py-1'

  return (
    <button
      onClick={handleClick}
      disabled={mutation.isPending || alreadyToday}
      title={alreadyToday ? 'Already checked in today' : `Record a check-in with ${person.name} today`}
      className={`${pad} rounded-lg bg-success-bg text-success border border-success/30 hover:bg-success hover:text-white transition-colors font-medium whitespace-nowrap disabled:opacity-40 disabled:hover:bg-success-bg disabled:hover:text-success`}
    >
      ✓ {alreadyToday ? 'Checked in' : 'Check in'}
    </button>
  )
}
