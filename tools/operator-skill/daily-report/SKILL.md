---
name: daily-report
description: Draft today's daily report (goal, must-do, due today, focus, overdue, done since yesterday, people to check in with) from the management app and save it as a personal note after the user approves. Use when the user asks for a daily report, daily summary, "start my day", or "what's my day look like".
---

# /daily-report

Requires the `mgmt-operator` skill (same install). Do not fetch the manual unless something fails — this workflow is self-contained.

1. Render the draft:
   ```bash
   ~/.claude/skills/mgmt-operator/report daily --md
   ```
   Show it to the user in full.
2. Ask what to change. Apply edits to the markdown yourself (keep the first line's tags intact: `#report/daily #report/d<yyyymmdd>`).
3. If the user wants today's goal set or changed, offer:
   ```bash
   ~/.claude/skills/mgmt-operator/mgmt PUT /daily-goals/<today> '{"content":"…"}'
   ```
4. On approval, save the note. If unedited:
   ```bash
   ~/.claude/skills/mgmt-operator/mgmt POST /notes "$(~/.claude/skills/mgmt-operator/report daily)"
   ```
   If edited, build the same JSON shape (`title`, `kind":"personal"`, `content`) with your edited markdown and POST it.
5. Reply with the note id and title. If a note with the same title already exists today (`GET /notes/search?q=Daily%20report%20<today>`), tell the user and offer to append (`GET /notes/{id}` → `PUT /notes/{id}` with old content + new section) instead of creating a duplicate.

Never save without an explicit yes. Never record check-ins from here — point the user to `/checkins`.
