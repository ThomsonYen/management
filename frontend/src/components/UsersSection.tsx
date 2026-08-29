import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Users } from 'lucide-react'
import { fetchUsers, revokeInvite, updateUser } from '../api'
import type { AppUser } from '../types'
import { Badge } from './ui'

/** Owner-only settings card: every member account and pending invite at a glance. */
export default function UsersSection() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({ queryKey: ['users'], queryFn: fetchUsers })
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['users'] })
  const toggleActive = useMutation({
    mutationFn: (u: AppUser) => updateUser(u.id, { is_active: !u.is_active }),
    onSuccess: invalidate,
  })
  const revoke = useMutation({ mutationFn: (id: number) => revokeInvite(id), onSuccess: invalidate })

  const members = (data?.users ?? []).filter((u) => u.role === 'member')
  const invites = data?.invites ?? []

  return (
    <div className="bg-surface rounded-xl shadow-sm border border-border">
      <div className="px-6 py-5">
        <h2 className="text-sm font-semibold text-fg flex items-center gap-2">
          <Users size={16} /> Members
        </h2>
        <p className="text-sm text-fg-muted mt-0.5">
          People who can sign in and see the items assigned to them. Invite and manage access from a person's card on the{' '}
          <button onClick={() => navigate('/people')} className="text-accent hover:underline">People page</button>.
        </p>

        {isLoading && <p className="text-xs text-fg-subtle mt-4">Loading…</p>}

        {!isLoading && members.length === 0 && invites.length === 0 && (
          <p className="text-sm text-fg-subtle mt-4">No member accounts yet.</p>
        )}

        {members.length > 0 && (
          <ul className="mt-4 divide-y divide-border-subtle">
            {members.map((u) => (
              <li key={u.id} className="py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="font-medium text-fg">{u.person_name ?? u.username}</span>
                <span className="text-xs text-fg-subtle">@{u.username}</span>
                <Badge tone={u.is_active ? 'success' : 'neutral'} size="sm">{u.is_active ? 'Active' : 'Disabled'}</Badge>
                <Badge tone={u.access_level === 'edit' ? 'accent' : 'warning'} size="sm">
                  {u.access_level === 'edit' ? 'Can edit' : 'View only'}
                </Badge>
                {u.grants.length > 0 && (
                  <span className="text-xs text-fg-subtle">
                    {u.grants.filter((g) => g.kind === 'project').length} project
                    {u.grants.filter((g) => g.kind === 'project').length === 1 ? '' : 's'} ·{' '}
                    {u.grants.filter((g) => g.kind === 'note').length} note
                    {u.grants.filter((g) => g.kind === 'note').length === 1 ? '' : 's'}
                  </span>
                )}
                {u.last_seen_at && (
                  <span className="text-xs text-fg-subtle">seen {new Date(u.last_seen_at).toLocaleDateString()}</span>
                )}
                <span className="flex-1" />
                <button
                  onClick={() => toggleActive.mutate(u)}
                  disabled={toggleActive.isPending}
                  className="text-xs px-2.5 py-1 rounded-md border border-border text-fg-muted hover:text-fg hover:bg-inset transition-colors disabled:opacity-50"
                >
                  {u.is_active ? 'Disable' : 'Enable'}
                </button>
              </li>
            ))}
          </ul>
        )}

        {invites.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-fg-muted uppercase tracking-wide mb-1">Pending invites</p>
            <ul className="divide-y divide-border-subtle">
              {invites.map((inv) => (
                <li key={inv.id} className="py-2 flex items-center gap-3 text-sm">
                  <span className="font-medium text-fg">{inv.person_name}</span>
                  <span className="text-xs text-fg-subtle">expires {new Date(inv.expires_at).toLocaleDateString()}</span>
                  <span className="flex-1" />
                  <button
                    onClick={() => revoke.mutate(inv.id)}
                    className="text-xs px-2.5 py-1 rounded-md border border-border text-fg-muted hover:text-danger hover:bg-inset transition-colors"
                  >
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
