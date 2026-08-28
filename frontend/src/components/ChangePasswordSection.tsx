import { FormEvent, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { KeyRound } from 'lucide-react'
import { changePassword } from '../api'
import { useToast } from '../ToastContext'

const inputCls =
  'w-full px-3 py-2 text-sm rounded-md border border-border bg-app text-fg focus:outline-none focus:ring-2 focus:ring-accent/40'

/** Settings card (both roles): change the signed-in user's password. */
export default function ChangePasswordSection() {
  const { showToast } = useToast()
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')

  const mutation = useMutation({
    mutationFn: () => changePassword({ current_password: current, new_password: next }),
    onSuccess: () => {
      showToast({ message: 'Password changed', tone: 'success' })
      setCurrent('')
      setNext('')
      setConfirm('')
      setOpen(false)
    },
  })

  const response = (mutation.error as { response?: { status?: number; data?: { detail?: unknown } } } | null)?.response
  const error = !mutation.isError
    ? null
    : response?.status === 400
      ? 'Current password is incorrect.'
      : response?.status === 429
        ? 'Too many attempts. Try again in a few minutes.'
        : typeof response?.data?.detail === 'string'
          ? response.data.detail
          : 'Could not change the password.'
  const canSubmit = current.length > 0 && next.length >= 8 && confirm === next && !mutation.isPending

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (canSubmit) mutation.mutate()
  }

  return (
    <div className="bg-surface rounded-xl shadow-sm border border-border">
      <div className="px-6 py-5 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-fg flex items-center gap-2">
            <KeyRound size={16} /> Password
          </h2>
          <p className="text-sm text-fg-muted mt-0.5">Changing it signs you out everywhere else.</p>
        </div>
        {!open && (
          <button
            onClick={() => setOpen(true)}
            className="px-3 py-1.5 rounded-md text-sm font-medium border border-border text-fg-muted hover:text-fg hover:bg-inset transition-colors whitespace-nowrap"
          >
            Change password
          </button>
        )}
      </div>
      {open && (
        <form onSubmit={handleSubmit} className="px-6 pb-5 space-y-3 max-w-sm">
          <input
            type="password"
            autoComplete="current-password"
            placeholder="Current password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className={inputCls}
          />
          <input
            type="password"
            autoComplete="new-password"
            placeholder="New password (at least 8 characters)"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className={inputCls}
          />
          <input
            type="password"
            autoComplete="new-password"
            placeholder="Confirm new password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={inputCls}
          />
          {confirm.length > 0 && confirm !== next && <p className="text-xs text-danger">Passwords do not match.</p>}
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={!canSubmit}
              className="px-3 py-1.5 text-xs font-medium bg-accent text-fg-on-accent rounded-lg disabled:opacity-50"
            >
              {mutation.isPending ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 text-xs font-medium text-fg-muted hover:text-fg">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
