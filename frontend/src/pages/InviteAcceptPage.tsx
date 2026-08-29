import { FormEvent, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { LayoutDashboard } from 'lucide-react'
import { acceptInvite, lookupInvite } from '../api'
import { useOptionalSession } from '../hooks/useSession'
import { clearDeviceState } from '../utils/deviceState'

const inputCls =
  'w-full px-3 py-2 text-base sm:text-sm rounded-md border border-border bg-app text-fg focus:outline-none focus:ring-2 focus:ring-accent/40'

/** Public page behind an invite link: pick a username + password, then land in the member shell. */
export default function InviteAcceptPage() {
  const { token = '' } = useParams<{ token: string }>()
  const current = useOptionalSession()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  const invite = useQuery({
    queryKey: ['invite', token],
    queryFn: () => lookupInvite(token),
    retry: false,
    enabled: token.length > 0,
  })

  const accept = useMutation({
    mutationFn: () => acceptInvite({ token, username: username.trim(), password }),
    onSuccess: () => {
      // A full reload boots the app fresh as the new user (no pre-login state survives).
      clearDeviceState()
      window.location.assign('/')
    },
  })

  const lookupStatus = (invite.error as { response?: { status?: number } } | null)?.response?.status
  const acceptStatus = (accept.error as { response?: { status?: number; data?: { detail?: unknown } } } | null)?.response
  const acceptDetail = typeof acceptStatus?.data?.detail === 'string' ? acceptStatus.data.detail : null

  const mismatch = confirm.length > 0 && confirm !== password
  const tooShort = password.length > 0 && password.length < 8
  const canSubmit = username.trim().length >= 3 && password.length >= 8 && confirm === password && !accept.isPending

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (canSubmit) accept.mutate()
  }

  const errorMessage =
    acceptStatus?.status === 409
      ? 'That username is already taken.'
      : acceptStatus?.status === 429
        ? 'Too many attempts. Try again in a few minutes.'
        : acceptStatus?.status === 404
          ? 'This invite link is no longer valid.'
          : acceptDetail ?? (accept.isError ? 'Could not create the account. Is the server reachable?' : null)

  return (
    <div className="flex min-h-dvh items-center justify-center bg-app px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2.5 mb-6">
          <div className="w-9 h-9 bg-accent rounded-lg flex items-center justify-center">
            <LayoutDashboard size={18} className="text-fg-on-accent" />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight text-fg leading-none">Management</h1>
            <p className="text-fg-subtle text-xs mt-0.5 leading-none">Work tracker</p>
          </div>
        </div>

        <div className="bg-surface rounded-xl shadow-sm border border-border px-6 py-6">
          {invite.isPending && <p className="text-sm text-fg-muted">Checking your invitation…</p>}

          {invite.isError && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-fg">
                {lookupStatus === 429 ? 'Too many attempts. Try again in a few minutes.' : 'This invite link is invalid or has expired.'}
              </p>
              <p className="text-sm text-fg-muted">Ask for a new link, or sign in if you already have an account.</p>
              <Link to="/login" className="text-sm text-accent hover:underline">Go to sign in</Link>
            </div>
          )}

          {invite.data && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <p className="text-sm text-fg">
                  You've been invited as <strong>{invite.data.person_name}</strong>.
                </p>
                <p className="text-xs text-fg-subtle mt-1">
                  Choose how you'll sign in. This link works once and expires {new Date(invite.data.expires_at).toLocaleDateString()}.
                </p>
              </div>
              {current && (
                <p className="text-xs rounded-md border border-warning/40 bg-warning-bg text-warning px-3 py-2">
                  You're currently signed in as <strong>{current.username}</strong>; accepting this invite signs you out of that account on this device.
                </p>
              )}
              <div>
                <label htmlFor="invite-username" className="block text-xs font-medium text-fg-muted mb-1.5">Username</label>
                <input
                  id="invite-username"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className={inputCls}
                />
                <p className="text-2xs text-fg-subtle mt-1">3–32 characters: letters, digits, dots, dashes or underscores.</p>
              </div>
              <div>
                <label htmlFor="invite-password" className="block text-xs font-medium text-fg-muted mb-1.5">Password</label>
                <input
                  id="invite-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputCls}
                />
                {tooShort && <p className="text-xs text-danger mt-1">At least 8 characters.</p>}
              </div>
              <div>
                <label htmlFor="invite-confirm" className="block text-xs font-medium text-fg-muted mb-1.5">Confirm password</label>
                <input
                  id="invite-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className={inputCls}
                />
                {mismatch && <p className="text-xs text-danger mt-1">Passwords do not match.</p>}
              </div>
              {errorMessage && <p className="text-xs text-danger">{errorMessage}</p>}
              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full py-2 rounded-md bg-accent text-fg-on-accent text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {accept.isPending ? 'Creating your account…' : 'Create account'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
