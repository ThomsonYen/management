import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Share2 } from 'lucide-react'
import { addUserGrant, fetchUsers, removeUserGrant } from '../api'

interface Props {
  noteId: number
  /** Attendee person ids of a meeting note (to show who already sees it that way). */
  attendeeIds: number[]
}

/** Owner-only: share this note with member accounts (a `note` grant per member). */
export default function NoteShareControl({ noteId, attendeeIds }: Props) {
  const queryClient = useQueryClient()
  const { data } = useQuery({ queryKey: ['users'], queryFn: fetchUsers })
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['users'] })
  const add = useMutation({
    mutationFn: (userId: number) => addUserGrant(userId, { kind: 'note', target_id: noteId }),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: ({ userId, grantId }: { userId: number; grantId: number }) => removeUserGrant(userId, grantId),
    onSuccess: invalidate,
  })
  if (!data) return null
  const members = data.users.filter((u) => u.role === 'member' && u.is_active)

  return (
    <div>
      <h3 className="text-xs font-semibold text-fg-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <Share2 size={12} /> Shared with
      </h3>
      {members.length === 0 ? (
        <p className="text-xs text-fg-subtle">No member accounts yet. Invite people from the People page.</p>
      ) : (
        <div className="space-y-1.5">
          {members.map((u) => {
            const grant = u.grants.find((g) => g.kind === 'note' && g.target_id === noteId)
            const viaMeeting = u.see_attended_meetings && u.person_id != null && attendeeIds.includes(u.person_id)
            return (
              <label key={u.id} className="flex items-center gap-2 text-xs text-fg cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!grant}
                  onChange={() => (grant ? remove.mutate({ userId: u.id, grantId: grant.id }) : add.mutate(u.id))}
                  className="h-3.5 w-3.5 rounded border-border"
                />
                <span className="flex-1 truncate">{u.person_name ?? u.username}</span>
                {viaMeeting && (
                  <span className="text-fg-subtle" title="Already readable as an attendee of this meeting">
                    attendee
                  </span>
                )}
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}
