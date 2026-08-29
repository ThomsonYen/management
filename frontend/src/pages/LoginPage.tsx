import { FormEvent, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { LayoutDashboard } from 'lucide-react'
import { login } from '../api'
import { clearDeviceState } from '../utils/deviceState'

export default function LoginPage() {
  const [searchParams] = useSearchParams()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: () => {
      // Purge whatever the previous user of this device left behind, then boot
      // the app fresh as the new user (no pre-login state survives a reload).
      clearDeviceState()
      const next = searchParams.get('next')
      window.location.assign(next && /^\/(?![/\\])/.test(next) ? next : '/')
    },
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (loginMutation.isPending || !username || !password) return
    loginMutation.mutate({ username, password })
  }

  const errorStatus = (loginMutation.error as any)?.response?.status
  const errorMessage =
    errorStatus === 429
      ? 'Too many failed attempts. Try again in a few minutes.'
      : errorStatus === 401
        ? 'Invalid username or password.'
        : loginMutation.isError
          ? 'Login failed. Is the server reachable?'
          : null

  return (
    <div className="flex h-dvh items-center justify-center bg-app px-4">
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
        <form
          onSubmit={handleSubmit}
          className="bg-surface rounded-xl shadow-sm border border-border px-6 py-6 space-y-4"
        >
          <div>
            <label htmlFor="username" className="block text-xs font-medium text-fg-muted mb-1.5">
              Username
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 text-base sm:text-sm rounded-md border border-border bg-app text-fg focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-xs font-medium text-fg-muted mb-1.5">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 text-base sm:text-sm rounded-md border border-border bg-app text-fg focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>
          {errorMessage && <p className="text-xs text-danger">{errorMessage}</p>}
          <button
            type="submit"
            disabled={loginMutation.isPending || !username || !password}
            className="w-full py-2 rounded-md bg-accent text-fg-on-accent text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loginMutation.isPending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
