import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronDown, ChevronRight, Copy, KeyRound, Plus, Share, X } from 'lucide-react'
import {
  addUserGrant,
  createInvite,
  deleteUser,
  fetchUserAudit,
  fetchUsers,
  removeUserGrant,
  resetUserPassword,
  revokeInvite,
  updateUser,
} from '../api'
import type { AccessLevel, Person, Project } from '../types'
import { Badge } from './ui'

const inviteUrl = (token: string) => `${window.location.origin}/invite/${token}`

const smallBtn =
  'text-xs px-2.5 py-1 rounded-md border border-border text-fg-muted hover:text-fg hover:bg-inset transition-colors disabled:opacity-50'

function MemberActivity({ userId }: { userId: number }) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['user-audit', userId],
    queryFn: () => fetchUserAudit(userId),
  })
  if (isLoading) return <p className="text-xs text-fg-subtle">Loading…</p>
  if (rows.length === 0) return <p className="text-xs text-fg-subtle">No changes recorded yet.</p>
  return (
    <ul className="space-y-1 max-h-56 overflow-y-auto">
      {rows.map((r) => (
        <li key={r.id} className="text-xs font-mono flex items-start gap-2">
          <span className="text-fg-subtle whitespace-nowrap">{new Date(r.ts).toLocaleString()}</span>
          <span className={r.status >= 400 ? 'text-danger' : 'text-success'}>{r.status}</span>
          <span className="text-fg whitespace-nowrap">{r.method} {r.path}</span>
          {r.body && <span className="text-fg-muted truncate" title={r.body}>{r.body}</span>}
        </li>
      ))}
    </ul>
  )
}

interface Props {
  person: Person
  projects: Project[]
}

/**
 * Owner-only card on a person: their member account (invite → active →
 * disabled), what they can edit, which project subtrees and notes they can
 * see, and what they changed recently.
 */
export default function PersonAccessSection({ person, projects }: Props) {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['users'], queryFn: fetchUsers })
  const [link, setLink] = useState<{ personId: number; url: string; expires: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [pwOpen, setPwOpen] = useState(false)
  const [pw, setPw] = useState('')
  const [pwError, setPwError] = useState<string | null>(null)
  const [auditOpen, setAuditOpen] = useState(false)
  const [picking, setPicking] = useState(false)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['users'] })
  const user = data?.users.find((u) => u.person_id === person.id && u.role === 'member')
  const invite = data?.invites.find((i) => i.person_id === person.id)

  const inviteMutation = useMutation({
    mutationFn: () => createInvite({ person_id: person.id }),
    onSuccess: (inv) => {
      setLink({ personId: person.id, url: inviteUrl(inv.token), expires: inv.expires_at })
      setCopied(false)
      invalidate()
    },
  })
  const revokeMutation = useMutation({
    mutationFn: (id: number) => revokeInvite(id),
    onSuccess: () => {
      setLink(null)
      invalidate()
    },
  })
  const updateMutation = useMutation({
    mutationFn: (patch: Parameters<typeof updateUser>[1]) => updateUser(user!.id, patch),
    onSuccess: invalidate,
  })
  const grantMutation = useMutation({
    mutationFn: (targetId: number) => addUserGrant(user!.id, { kind: 'project', target_id: targetId }),
    onSuccess: invalidate,
  })
  const ungrantMutation = useMutation({
    mutationFn: (grantId: number) => removeUserGrant(user!.id, grantId),
    onSuccess: invalidate,
  })
  const resetMutation = useMutation({
    mutationFn: () => resetUserPassword(user!.id, pw),
    onSuccess: () => {
      setPw('')
      setPwOpen(false)
      setPwError(null)
    },
    onError: (e: { response?: { data?: { detail?: unknown } } }) =>
      setPwError(typeof e?.response?.data?.detail === 'string' ? e.response.data.detail : 'Could not reset the password'),
  })
  const removeMutation = useMutation({
    mutationFn: () => deleteUser(user!.id),
    onSuccess: () => {
      setConfirmRemove(false)
      invalidate()
    },
  })

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  const share = (url: string) => {
    if (typeof navigator.share === 'function') {
      navigator.share({ title: 'Invitation', url }).catch(() => {})
    }
  }

  const showLink = link && link.personId === person.id
  const projectGrants = user?.grants.filter((g) => g.kind === 'project') ?? []
  const noteGrants = user?.grants.filter((g) => g.kind === 'note') ?? []
  const grantedIds = new Set(projectGrants.map((g) => g.target_id))
  const availableProjects = projects.filter((p) => !grantedIds.has(p.id))

  return (
    <div className="bg-surface rounded-xl border border-border px-4 py-3 mb-3">
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="text-[11px] font-semibold text-fg-muted uppercase tracking-wide mr-1 flex items-center gap-1">
          <KeyRound size={11} /> App access
        </h3>
        {isLoading && <span className="text-xs text-fg-subtle">Loading…</span>}
        {!isLoading && !user && !invite && (
          <>
            <span className="text-xs italic text-fg-subtle">No account</span>
            <button
              onClick={() => inviteMutation.mutate()}
              disabled={inviteMutation.isPending}
              className="inline-flex items-center gap-0.5 text-xs text-accent hover:text-accent-fg dark:hover:text-accent font-semibold rounded-full px-2 py-0.5 hover:bg-accent-1 transition-colors disabled:opacity-50"
            >
              <Plus size={11} /> Invite to app
            </button>
          </>
        )}
        {!isLoading && !user && invite && (
          <>
            <Badge tone="info" size="sm">Invited</Badge>
            <span className="text-xs text-fg-subtle">link expires {new Date(invite.expires_at).toLocaleDateString()}</span>
            <button onClick={() => inviteMutation.mutate()} disabled={inviteMutation.isPending} className={smallBtn}>
              New link
            </button>
            <button onClick={() => revokeMutation.mutate(invite.id)} className={smallBtn}>
              Revoke
            </button>
          </>
        )}
        {user && (
          <>
            <Badge tone={user.is_active ? 'success' : 'neutral'} size="sm">{user.is_active ? 'Active' : 'Disabled'}</Badge>
            <span className="text-xs text-fg-muted">@{user.username}</span>
            {user.last_seen_at && (
              <span className="text-xs text-fg-subtle">· seen {new Date(user.last_seen_at).toLocaleDateString()}</span>
            )}
          </>
        )}
      </div>

      {showLink && (
        <div className="mt-3 p-3 border border-success/40 bg-success-bg rounded-lg space-y-2">
          <p className="text-xs text-fg">
            Send this link to {person.name}. It works once and expires {new Date(link.expires).toLocaleDateString()}; it is not shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 min-w-0 px-3 py-2 text-xs font-mono bg-surface border border-border rounded-lg break-all select-all">
              {link.url}
            </code>
            <button
              onClick={() => copy(link.url)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-accent text-fg-on-accent rounded-lg hover:opacity-90 transition-opacity flex-shrink-0"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy'}
            </button>
            {typeof navigator.share === 'function' && (
              <button
                onClick={() => share(link.url)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-border rounded-lg text-fg-muted hover:text-fg flex-shrink-0"
                title="Share"
              >
                <Share size={12} />
              </button>
            )}
          </div>
        </div>
      )}

      {user && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <label className="flex items-center gap-2 text-xs text-fg">
              Access
              <select
                value={user.access_level}
                onChange={(e) => updateMutation.mutate({ access_level: e.target.value as AccessLevel })}
                className="text-xs rounded border border-border px-1.5 py-0.5 bg-app text-fg focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="edit">Can edit own items</option>
                <option value="view">View only</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs text-fg cursor-pointer">
              <input
                type="checkbox"
                checked={user.see_attended_meetings}
                onChange={(e) => updateMutation.mutate({ see_attended_meetings: e.target.checked })}
                className="h-4 w-4 rounded border-border"
              />
              Can read meetings they attended
            </label>
          </div>

          <div>
            <p className="text-[11px] font-semibold text-fg-muted uppercase tracking-wide mb-1">Sees every todo in</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {projectGrants.length === 0 && (
                <span className="text-xs italic text-fg-subtle">only their own todos</span>
              )}
              {projectGrants.map((g) => (
                <span key={g.id} className="inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 bg-inset text-fg">
                  <span className="truncate max-w-[10rem]">{g.target_name ?? `#${g.target_id}`}</span>
                  <button
                    onClick={() => ungrantMutation.mutate(g.id)}
                    className="text-fg-subtle hover:text-danger leading-none"
                    title="Remove"
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
              {picking ? (
                <select
                  autoFocus
                  onBlur={() => setPicking(false)}
                  onChange={(e) => {
                    const id = Number(e.target.value)
                    if (id) grantMutation.mutate(id)
                    setPicking(false)
                  }}
                  defaultValue=""
                  className="text-xs rounded border border-border px-1.5 py-0.5 bg-app text-fg focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="" disabled>Pick a project…</option>
                  {availableProjects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              ) : (
                availableProjects.length > 0 && (
                  <button
                    onClick={() => setPicking(true)}
                    className="inline-flex items-center gap-0.5 text-xs text-accent hover:text-accent-fg dark:hover:text-accent font-semibold rounded-full px-2 py-0.5 hover:bg-accent-1 transition-colors"
                  >
                    <Plus size={11} /> Add project
                  </button>
                )
              )}
            </div>
            <p className="text-[11px] text-fg-subtle mt-1">A project grant includes its subprojects; those todos are read-only for them.</p>
          </div>

          <div>
            <p className="text-[11px] font-semibold text-fg-muted uppercase tracking-wide mb-1">Shared notes</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {noteGrants.length === 0 && <span className="text-xs italic text-fg-subtle">none — share from a note's page</span>}
              {noteGrants.map((g) => (
                <span key={g.id} className="inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 bg-inset text-fg">
                  <span className="truncate max-w-[12rem]">{g.target_name ?? `#${g.target_id}`}</span>
                  <button
                    onClick={() => ungrantMutation.mutate(g.id)}
                    className="text-fg-subtle hover:text-danger leading-none"
                    title="Unshare"
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button onClick={() => updateMutation.mutate({ is_active: !user.is_active })} className={smallBtn}>
              {user.is_active ? 'Disable' : 'Enable'}
            </button>
            <button
              onClick={() => {
                setPwOpen((v) => !v)
                setPwError(null)
              }}
              className={smallBtn}
            >
              Reset password
            </button>
            {confirmRemove ? (
              <>
                <span className="text-xs text-fg-muted">Remove this account?</span>
                <button onClick={() => removeMutation.mutate()} className={`${smallBtn} text-danger hover:text-danger`}>
                  Yes, remove
                </button>
                <button onClick={() => setConfirmRemove(false)} className={smallBtn}>
                  Cancel
                </button>
              </>
            ) : (
              <button onClick={() => setConfirmRemove(true)} className={`${smallBtn} hover:text-danger`}>
                Remove
              </button>
            )}
            <button onClick={() => setAuditOpen((v) => !v)} className={`${smallBtn} inline-flex items-center gap-1`}>
              {auditOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />} Activity
            </button>
          </div>

          {pwOpen && (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (pw.length >= 8) resetMutation.mutate()
              }}
              className="flex flex-wrap items-center gap-2"
            >
              <input
                type="password"
                autoComplete="new-password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                placeholder="New password (at least 8 characters)"
                className="text-xs px-2.5 py-1.5 rounded-md border border-border bg-app text-fg w-64 focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
              <button
                type="submit"
                disabled={pw.length < 8 || resetMutation.isPending}
                className="text-xs px-3 py-1.5 rounded-md bg-accent text-fg-on-accent font-medium disabled:opacity-50"
              >
                Save
              </button>
              {pwError && <span className="text-xs text-danger">{pwError}</span>}
            </form>
          )}

          {auditOpen && <MemberActivity userId={user.id} />}
        </div>
      )}
    </div>
  )
}
