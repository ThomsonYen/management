# Members: letting other people log in

The app has one **owner** (you) and any number of **members**. A member is one of the people on your People page who can sign in and see the todos assigned to them — nothing else, unless you grant more.

## Invite someone

1. **People → select the person → App access → Invite to app.**
2. Copy the link (it is shown once) and send it to them. It works exactly once and expires after 7 days; *New link* replaces it, *Revoke* cancels it.
3. They open the link, pick a username and password, and land in their own "My items" view. Their account is linked to that person, so anything you assign to the person shows up for them.

You can also generate an invite for someone who already has a person card only; a person can have at most one account.

## What a member sees

- **My items:** todos assigned to their person, grouped by project, with overdue / due-this-week counts. They can edit everything on their own todos (title, description, deadline, importance, hours, project among projects they can see, sub-tasks, done/reopen) and create new todos for themselves. They can never reassign a todo, touch your focus list, blockers or anything else.
- **Done:** their completed items.
- **Notes:** only what you shared (see below). No transcripts, recordings or file paths.
- **Settings:** appearance, timezone, password. No API tokens, vaults, recording or backups.

They do not see other people, the People page, projects they were not granted, your focus list, must-do, daily goals, meeting notes they did not attend, or anything deleted.

## Widening what a member sees (all from the person's App access card)

| Control | Effect |
|---|---|
| **Access: Can edit own items / View only** | View only turns every write off; they can still read. |
| **Can read meetings they attended** | Meeting notes where they are listed as an attendee become readable (content only). |
| **Sees every todo in … (project)** | Every todo in that project *and its subprojects*, including other people's and unassigned ones — read-only unless assigned to them. Also reveals the names of the assignees in that project. |
| **Shared notes** | Individual notes you shared from the note's page (**Shared with** in the note's sidebar / under the tags). Unshare from either place. |

Changes take effect on the member's next request; a member whose access was reduced sees the UI update when they return to the tab.

## Disable, reset, remove

- **Disable** ends their sessions immediately and refuses login until you enable again. Archiving a person disables their account too (restoring the person does not re-enable it).
- **Reset password** sets a new one and signs them out everywhere.
- **Remove** deletes the account, its sessions, grants and audit trail. A person can only be purged after their account is removed.
- **Activity** on the card lists every change the member made (also in the Settings → Members overview).

## Tokens, connectors and agents

API tokens and the Claude connector belong to the owner only. A member cannot create a token, and the connector sign-in page refuses member credentials, so anything an agent does runs with your full visibility.

## Command-line escape hatches

`python scripts/create_user.py <username> --person-id N` creates a member without an invite; `python scripts/check_member_access.py` (and `… serve`) is the regression check that every owner-only route refuses members and every member route scopes its data — run it with `check_auth.py` before deploying.
