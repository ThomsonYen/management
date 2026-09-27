import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { HeartHandshake, Plus, Trash2 } from 'lucide-react'
import {
  confirmHangout,
  createFriend,
  deleteFriend,
  deleteHangout,
  fetchFriendHangouts,
  fetchFriends,
  logHangout,
  planHangout,
  updateFriend,
} from '../api'
import { useTimezone } from '../SettingsContext'
import { useToast } from '../ToastContext'
import { getTodayString } from '../dateUtils'
import { Badge, Button, Card, EmptyState, Input, Modal, PageHeader, Textarea } from '../components/ui'
import { STATUS_RANK, nudgeCopy } from '../socialCopy'
import type { Friend } from '../types'

/** "3 weeks ago" reads better than "21 days ago" once you are past a fortnight. */
function describeGap(days: number | null): string {
  if (days === null) return 'never logged'
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 14) return `${days} days ago`
  const weeks = Math.round(days / 7)
  if (days < 60) return `${weeks} weeks ago`
  const months = Math.round(days / 30)
  return months === 1 ? 'about a month ago' : `about ${months} months ago`
}

function dueText(f: Friend): string {
  if (f.status === 'never') return `Every ${f.cadence_days} days — log when you last met`
  const until = f.days_until_due ?? 0
  if (until > 1) return `Due in ${until} days`
  if (until === 1) return 'Due tomorrow'
  if (until === 0) return 'Due today'
  return `${Math.abs(until)} days past due`
}

function FriendRow({ friend, onLog, onPlan }: { friend: Friend; onLog: (f: Friend) => void; onPlan: (f: Friend) => void }) {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const [editing, setEditing] = useState(false)
  const [cadence, setCadence] = useState(String(friend.cadence_days))

  const { data: hangouts = [] } = useQuery({
    queryKey: ['friend-hangouts', friend.id],
    queryFn: () => fetchFriendHangouts(friend.id),
    enabled: editing,
  })

  const saveCadence = useMutation({
    mutationFn: (days: number) => updateFriend(friend.id, { cadence_days: days }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['friends'] }),
  })

  const archive = useMutation({
    mutationFn: () => deleteFriend(friend.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends'] })
      showToast({ message: `${friend.name} archived`, tone: 'success' })
    },
  })

  const confirmPlan = useMutation({
    mutationFn: () => confirmHangout(friend.unconfirmed_plan_id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends'] })
      queryClient.invalidateQueries({ queryKey: ['friends-due'] })
      queryClient.invalidateQueries({ queryKey: ['plans'] })
      queryClient.invalidateQueries({ queryKey: ['friend-hangouts', friend.id] })
      showToast({ message: `Logged — nice one`, tone: 'success' })
    },
  })

  const dropPlan = useMutation({
    mutationFn: (id: number) => deleteHangout(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends'] })
      queryClient.invalidateQueries({ queryKey: ['friends-due'] })
      queryClient.invalidateQueries({ queryKey: ['plans'] })
      queryClient.invalidateQueries({ queryKey: ['friend-hangouts', friend.id] })
    },
  })

  const copy = nudgeCopy(friend)

  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-fg truncate">{friend.name}</span>
            <Badge tone={copy.tone} size="sm">{copy.label}</Badge>
          </div>
          <div className="text-sm text-fg mt-0.5">{copy.headline}</div>
          <div className="text-xs text-fg-subtle mt-0.5">
            Last seen {describeGap(friend.days_since_hangout)}
            {friend.last_hangout_what ? ` — ${friend.last_hangout_what}` : ''}
            {friend.status !== 'planned' && friend.status !== 'needs_confirm' && ` · ${dueText(friend)}`}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" variant="primary" onClick={() => onLog(friend)}>
            Log hangout
          </Button>
          <Button size="sm" variant="secondary" onClick={() => onPlan(friend)}>
            Plan
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)}>
            {editing ? 'Close' : 'Details'}
          </Button>
        </div>
      </div>

      {friend.status === 'needs_confirm' && (
        <div className="flex items-center gap-2 flex-wrap rounded-lg border border-accent/30 bg-accent-1 px-3 py-2">
          <span className="text-sm text-fg">
            You planned to see {friend.name} on {friend.unconfirmed_plan_date}.
          </span>
          <div className="ml-auto flex gap-2">
            <Button size="xs" variant="primary" disabled={confirmPlan.isPending} onClick={() => confirmPlan.mutate()}>
              It happened
            </Button>
            <Button
              size="xs"
              variant="ghost"
              disabled={dropPlan.isPending}
              onClick={() => dropPlan.mutate(friend.unconfirmed_plan_id!)}
            >
              It didn't
            </Button>
          </div>
        </div>
      )}

      {friend.status === 'planned' && friend.next_plan_id !== null && (
        <div className="flex items-center gap-2 flex-wrap text-sm text-fg-muted">
          <span>
            📅 {friend.next_plan_date}
            {friend.next_plan_what ? ` — ${friend.next_plan_what}` : ''}
          </span>
          <button
            className="ml-auto text-xs text-fg-subtle hover:text-danger underline underline-offset-2"
            onClick={() => dropPlan.mutate(friend.next_plan_id!)}
          >
            Cancel plan
          </button>
        </div>
      )}

      {editing && (
        <div className="border-t border-border-subtle pt-3 mt-1 flex flex-col gap-3">
          <div className="flex items-end gap-2">
            <label className="text-xs text-fg-muted flex flex-col gap-1">
              Remind me every
              <Input
                type="number"
                min={1}
                value={cadence}
                onChange={(e) => setCadence(e.target.value)}
                className="w-24"
              />
            </label>
            <span className="text-xs text-fg-muted pb-2">days</span>
            <Button
              size="sm"
              variant="secondary"
              disabled={saveCadence.isPending || Number(cadence) === friend.cadence_days || Number(cadence) < 1}
              onClick={() => saveCadence.mutate(Number(cadence))}
            >
              Save
            </Button>
            <div className="ml-auto">
              <Button
                size="sm"
                variant="ghost"
                leadingIcon={<Trash2 size={14} />}
                onClick={() => {
                  if (confirm(`Archive ${friend.name}? Their hangout history is kept.`)) archive.mutate()
                }}
              >
                Archive
              </Button>
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-fg-muted mb-1">History</div>
            {hangouts.length === 0 ? (
              <div className="text-sm text-fg-subtle">Nothing logged yet.</div>
            ) : (
              <ul className="flex flex-col gap-1 m-0 p-0 list-none">
                {hangouts.map((h) => (
                  <li key={h.id} className="text-sm text-fg-muted flex gap-2">
                    <span className="text-fg-subtle tabular-nums shrink-0">{h.date}</span>
                    {h.status === 'planned' && <span className="text-info shrink-0">planned</span>}
                    <span className="min-w-0">
                      {h.what_we_did || <span className="text-fg-subtle">—</span>}
                      {h.friend_names.length > 1 && (
                        <span className="text-fg-subtle"> (with {h.friend_names.filter((n) => n !== friend.name).join(', ')})</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}

export default function SocialPage() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const { timezone } = useTimezone()
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCadence, setNewCadence] = useState('30')
  const [logging, setLogging] = useState<Friend | null>(null)
  const [planning, setPlanning] = useState<Friend | null>(null)
  const [what, setWhat] = useState('')
  const [when, setWhen] = useState('')

  const { data: friends = [], isLoading } = useQuery({
    queryKey: ['friends'],
    queryFn: () => fetchFriends(),
  })

  const add = useMutation({
    mutationFn: () => createFriend({ name: newName.trim(), cadence_days: Number(newCadence) || undefined }),
    onSuccess: (f) => {
      queryClient.invalidateQueries({ queryKey: ['friends'] })
      setAdding(false)
      setNewName('')
      setNewCadence('30')
      showToast({ message: `${f.name} added`, tone: 'success' })
    },
  })

  const log = useMutation({
    mutationFn: () =>
      logHangout(logging!.id, {
        what_we_did: what.trim() || undefined,
        date: when || undefined,
      }),
    onSuccess: (f) => {
      queryClient.invalidateQueries({ queryKey: ['friends'] })
      queryClient.invalidateQueries({ queryKey: ['friend-hangouts', f.id] })
      queryClient.invalidateQueries({ queryKey: ['friends-due'] })
      queryClient.invalidateQueries({ queryKey: ['plans'] })
      setLogging(null)
      setWhat('')
      setWhen('')
      showToast({ message: `Logged time with ${f.name}`, tone: 'success' })
    },
  })

  const plan = useMutation({
    mutationFn: () => planHangout(planning!.id, { date: when, what_we_did: what.trim() || undefined }),
    onSuccess: (f) => {
      queryClient.invalidateQueries({ queryKey: ['friends'] })
      queryClient.invalidateQueries({ queryKey: ['friends-due'] })
      queryClient.invalidateQueries({ queryKey: ['plans'] })
      queryClient.invalidateQueries({ queryKey: ['friend-hangouts', f.id] })
      setPlanning(null)
      setWhat('')
      setWhen('')
      showToast({ message: `Plan with ${f.name} saved — nudges off until then`, tone: 'success' })
    },
  })

  // Unanswered plans first, then loudest nudge; within a tier the most overdue
  // leads. STATUS_RANK lives with the copy so both stay in step.
  const ordered = useMemo(
    () =>
      [...friends].sort(
        (a, b) =>
          STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
          (a.days_until_due ?? 0) - (b.days_until_due ?? 0) ||
          a.name.localeCompare(b.name),
      ),
    [friends],
  )

  const needAttention = ordered.filter(
    (f) => f.status === 'overdue' || f.status === 'slipping' || f.status === 'due_soon' || f.status === 'needs_confirm',
  )

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <PageHeader
        title="Social"
        description={
          needAttention.length > 0
            ? `${needAttention.length} ${needAttention.length === 1 ? 'friend' : 'friends'} to reach out to`
            : 'Everyone is up to date'
        }
        actions={
          <Button variant="primary" leadingIcon={<Plus size={14} />} onClick={() => setAdding(true)}>
            Add friend
          </Button>
        }
      />

      {isLoading ? (
        <div className="text-sm text-fg-muted">Loading…</div>
      ) : ordered.length === 0 ? (
        <EmptyState
          icon={HeartHandshake}
          title="No friends yet"
          description="Add someone you want to stay in touch with, set how often you'd like to see them, and this page will tell you when it's been too long."
          action={
            <Button variant="primary" leadingIcon={<Plus size={14} />} onClick={() => setAdding(true)}>
              Add your first friend
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {ordered.map((f) => (
            <FriendRow
              key={f.id}
              friend={f}
              onLog={(fr) => { setLogging(fr); setWhat(''); setWhen(getTodayString(timezone)) }}
              onPlan={(fr) => { setPlanning(fr); setWhat(''); setWhen('') }}
            />
          ))}
        </div>
      )}

      <Modal open={adding} onClose={() => setAdding(false)}>
        <Modal.Header title="Add a friend" onClose={() => setAdding(false)} />
        <Modal.Body className="flex flex-col gap-3">
          <label className="text-sm text-fg-muted flex flex-col gap-1">
            Name
            <Input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Alex"
              onKeyDown={(e) => { if (e.key === 'Enter' && newName.trim()) add.mutate() }}
            />
          </label>
          <label className="text-sm text-fg-muted flex flex-col gap-1">
            Remind me every (days)
            <Input type="number" min={1} value={newCadence} onChange={(e) => setNewCadence(e.target.value)} />
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            <Button variant="primary" disabled={!newName.trim() || add.isPending} onClick={() => add.mutate()}>
              Add
            </Button>
          </div>
        </Modal.Body>
      </Modal>

      <Modal open={logging !== null} onClose={() => setLogging(null)}>
        <Modal.Header title={`Log time with ${logging?.name ?? ''}`} onClose={() => setLogging(null)} />
        <Modal.Body className="flex flex-col gap-3">
          <label className="text-sm text-fg-muted flex flex-col gap-1">
            When
            <Input type="date" value={when} onChange={(e) => setWhen(e.target.value)} />
          </label>
          <label className="text-sm text-fg-muted flex flex-col gap-1">
            What did you do?
            <Textarea
              autoFocus
              rows={3}
              value={what}
              onChange={(e) => setWhat(e.target.value)}
              placeholder="ramen + walk along the river"
            />
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setLogging(null)}>Cancel</Button>
            <Button variant="primary" disabled={log.isPending} onClick={() => log.mutate()}>
              Log it
            </Button>
          </div>
        </Modal.Body>
      </Modal>

      <Modal open={planning !== null} onClose={() => setPlanning(null)}>
        <Modal.Header title={`Plan something with ${planning?.name ?? ''}`} onClose={() => setPlanning(null)} />
        <Modal.Body className="flex flex-col gap-3">
          <p className="text-sm text-fg-muted m-0">
            While this is upcoming you won't be nudged about {planning?.name}. Once the date passes
            you'll be asked whether it actually happened.
          </p>
          <label className="text-sm text-fg-muted flex flex-col gap-1">
            When
            <Input
              type="date"
              min={getTodayString(timezone)}
              value={when}
              onChange={(e) => setWhen(e.target.value)}
            />
          </label>
          <label className="text-sm text-fg-muted flex flex-col gap-1">
            What's the plan?
            <Textarea
              rows={2}
              value={what}
              onChange={(e) => setWhat(e.target.value)}
              placeholder="dinner at theirs"
            />
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setPlanning(null)}>Cancel</Button>
            <Button variant="primary" disabled={!when || plan.isPending} onClick={() => plan.mutate()}>
              Save plan
            </Button>
          </div>
        </Modal.Body>
      </Modal>
    </div>
  )
}
