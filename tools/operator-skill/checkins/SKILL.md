---
name: checkins
description: Run a check-in round — list the direct reports who are overdue for a check-in, draft a short message to each, send after approval, and record the check-in in the management app. Use when the user asks who they should ping, wants to do check-ins, or says they talked to someone.
---

# /checkins

Requires the `mgmt-operator` skill (same install).

1. Who is overdue:
   ```bash
   ~/.claude/skills/mgmt-operator/mgmt GET /agent/digest
   ```
   Use `overdue_check_ins` (name, days since last, cadence). Show the list sorted by days overdue, worst first. If empty, say so and stop.
2. For each person the user wants to ping, draft a short, plain message (one or two lines, no fluff). Context you may use: their open todos (`GET /todos?assignee_id=<id>&exclude_done=true`) — mention at most one concrete item. Show all drafts before sending anything.
3. Send only through a tool the user has connected (e.g. Slack `slack_send_message_draft` → user approves in Slack). If no messaging tool is available, give the user the drafts to send themselves. Never claim a message was sent unless the tool confirmed it.
4. After each message is actually sent — or when the user says "I already talked to X" — record it:
   ```bash
   ~/.claude/skills/mgmt-operator/mgmt POST /persons/<id>/check-in
   ```
   Empty body = today. Forward-only and idempotent, so double-calls are harmless. One call per person, after a yes.
5. Finish with a one-line summary: who was pinged, who was recorded, who was skipped.

Do not record a check-in for someone the user only *intends* to contact.
