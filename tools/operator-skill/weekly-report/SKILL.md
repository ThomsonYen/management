---
name: weekly-report
description: Draft the weekly report (done this week by project, focus for next week, overdue, people to check in with) from the management app and save it as a personal note after the user approves. Use when the user asks for a weekly report, weekly summary, or end-of-week review.
---

# /weekly-report

Requires the `mgmt-operator` skill (same install). Do not fetch the manual unless something fails — this workflow is self-contained.

1. Render the draft:
   ```bash
   ~/.claude/skills/mgmt-operator/report weekly --md
   ```
   Show it to the user in full. "Done this week" is the last 7 days from the digest; if the user wants a different window, say so and use `GET /todos/recently-done?since=<iso>` to rebuild that section.
2. Ask what to change — typical edits: add a "Highlights" or "Blockers" section from what the user tells you, drop noise, regroup. Keep the first line's tags: `#report/weekly #report/w<yyyy>_<ww>`.
3. Offer to set next week's focus if the user reprioritised while reviewing:
   ```bash
   ~/.claude/skills/mgmt-operator/mgmt --dry-run PUT /todos/focus '{"todo_ids":[…]}'
   ```
   Send the full ordered list, never a delta; run for real only after a yes.
4. On approval, save the note. If unedited:
   ```bash
   ~/.claude/skills/mgmt-operator/mgmt POST /notes "$(~/.claude/skills/mgmt-operator/report weekly)"
   ```
   If edited, build the same JSON shape (`title`, `kind":"personal"`, `content`) with your edited markdown and POST it.
5. Reply with the note id and title. If this week's report already exists (`GET /notes/search?q=Weekly%20report%20<yyyy>-W<ww>`), offer to append rather than duplicate.

Never save without an explicit yes.
