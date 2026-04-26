# Proposed Features

Usability improvements queued for implementation.

## 1. Affordance on inline-editable badges

Status, importance, assignee, deadline, and hours badges are currently clickable but look static. Add:

- Subtle hover ring or background shift on hover
- Small chevron/caret icon to indicate "opens a picker"
- Optional: first-hover-per-session tooltip reading "Click to edit"

Apply consistently across Dashboard, Todos page, Focus page, and Todo cards everywhere they appear.

**Why:** New users (and returning users who forgot) don't realize badges are interactive. The affordance is currently invisible.

## 2. Surface "Must Do Today" on the Dashboard

The morning/afternoon/evening "Must Do Today" strip is currently only on the Focus page. Promote it to the top of the Dashboard so it's the first thing visible on app open.

- Show the same three time-of-day sections with their linked todos/notes
- Clicking an item opens it; checkbox marks it done for the day
- Keep the full management interface on Focus — Dashboard is read/quick-action only

**Why:** The Dashboard is where users naturally land, but today's priorities are one click away. This makes the most important content most prominent.

## 3. Daily focus coach (Dashboard chatbot with memory)

An AI chat panel on the Dashboard that proposes what to focus on today given pending todos, deadlines, blockers, and linked project context. Always available, opens daily with a fresh suggestion.

- Chat input for free-form conversation ("push the billing work, Sarah is OOO next week")
- Agent writes and updates its own memory document as the user talks — perceived project importance, people to keep a close eye on, themes that keep coming up
- Memory doc is user-visible and editable (not a black box)
- Coach reads from pending todos + project `description`/`notes` + the memory doc to form daily suggestions

**Why:** The Dashboard has the data but the user still has to synthesize "what matters today" by hand. A coach that persists its own judgments across days turns the app into something that watches trends with you, not just stores them.

## 4. Per-project memory on ProjectsPage

Each project gets a living AI-maintained memory document: perceived importance, risk signals (missed deadlines, stuck blockers, no recent activity), last meaningful update, open threads pulled from linked meeting notes.

- Surfaced on the project detail view, editable by the user
- Feeds into the Dashboard coach instead of re-deriving from scratch daily
- Auto-updates when linked todos/meetings change

**Why:** Project context lives scattered across meeting notes, todo descriptions, and implicit knowledge. A durable per-project memory consolidates it and gives the coach something to cite.

## 5. Per-person briefs on PeoplePage

Same memory pattern scoped per person. The agent tracks commitments each person has made across meeting notes, todos they own, slip patterns, and mentions.

- "Before you meet with X…" brief on the person's page: recent commitments, open items they own, anything flagged for a close watch
- User can mark a person as "watch closely" — agent weights their activity more heavily in daily suggestions
- Draws from meeting transcripts once extracted (see #6)

**Why:** The user's close-watch use case. Keeping track of who owes what across a week of meetings is exactly the synthesis an LLM is good at.

## 6. Structured meeting extraction (beyond todo suggestions)

Extend the existing GPT-4o-mini meeting-notes pipeline to also pull: decisions, open questions, and per-attendee commitments from the transcript. Todo suggestions already exist — this layer extracts the rest.

- Commitments flow into the per-person memory (#5)
- Decisions and open questions flow into the per-project memory (#4)
- After a meeting is saved, agent proposes updates to project/person memory; user approves or edits

**Why:** Transcripts contain far more structured signal than just action items. The existing pipeline leaves decisions and commitments on the floor.

## 7. Weekly retrospective on WeeklyGoalsPage

AI-generated retrospective over the previous week: what shipped, what slipped, patterns in what slipped, suggested focus for next week. Based on completed todos, daily goals, and meeting notes from the window.

- Runs on demand (button) or auto-generates on Monday morning
- Output is markdown that drops into the weekly goals canvas as a starting point the user edits

**Why:** The data for a retrospective is already in the system. Generating the synthesis is the part the user won't do manually every week.

## 8. Natural-language todo capture

Single text input that parses free-form entries into structured todos: "ping Sarah re design doc by Fri, high" → assignee Sarah, deadline Friday, importance high, project guessed from context.

- Lives in the command palette and/or a dedicated quick-capture hotkey
- Shows parsed preview before saving; user can tweak before confirming

**Why:** Lowest-friction path from thought to structured todo. The current form is several fields away from the keyboard.

## 9. Smart triage on todo creation

When the user fills in a todo title, AI suggests importance, estimated hours, project, and potential blockers by matching against existing tasks and recent meeting notes.

- Suggestions appear as pre-filled defaults the user can override
- Blocker suggestions especially useful — surfaces "this looks like it depends on todo #123"

**Why:** The fields are there but filling them honestly is tedious, so users skip them and the data degrades. Good defaults make the fields actually used.

## 10. Semantic search across the corpus

Embeddings over todos, project notes, meeting notes, and transcripts. A single "ask anything" input answers questions with cited sources: "what did we decide about billing?" → answer + links to the meeting note(s) it came from.

- Can live inside the command palette as a fallback when no exact match is found
- Memory docs from #3–5 become prime retrieval targets

**Why:** No global search exists today. Once memory docs and meeting extracts are in place, semantic retrieval multiplies their value.

## 11. Copy todo as markdown ✅ Implemented

Add a "Copy as markdown" button on every todo so the full record can be pasted into notes, Slack, docs, or another tool in one action.

- Button lives in the TodoCard expanded action row alongside Edit / Duplicate / Delete (slate secondary-button styling, label "Copy md" or icon-only with tooltip to keep the row compact)
- Also surface on `TodoDetailPage` (full-page view) — same handler, just placed in that page's action bar
- Markdown payload includes: title (as `##` heading), one-line metadata row (status, importance, project, assignee, deadline, estimated hours, focus flag), blank line, description (verbatim, preserving line breaks), `### Subtasks` checklist using `- [ ]` / `- [x]` ordered by `order`, `### Blocked by` bullet list resolving `blocked_by_ids` against the cached `allTodos` query (skip the section if empty)
- Skip empty sections cleanly — no "Subtasks" header if there are none, no metadata field if unset
- Use `navigator.clipboard.writeText()`; on success show a toast (`tone: 'success'`, message `Copied "<title>" as markdown`); on failure show a `tone: 'danger'` toast with the error
- Pure frontend — no backend changes, no new types, no new endpoints. All required data is already on the `Todo` object the card receives
- Add a small shared helper `frontend/src/utils/todoMarkdown.ts` exporting `todoToMarkdown(todo, allTodos)` so TodoCard and TodoDetailPage share one formatter

**Why:** Todos are often the unit of communication ("here's what I'm tracking on this") but there's no friction-free way to lift one out of the app. Copying as markdown makes the app a better citizen of the user's broader workflow without coupling to any specific destination.

## Implementation order

Suggested sequence when picking these up:

1. Inline-edit affordances (small CSS pass across components)
2. ~~Copy todo as markdown (#11)~~ ✅ Implemented
3. Dashboard "Must Do Today" (reuses existing Focus components)
4. Daily focus coach + memory document (unlocks the agentic layer)
5. Per-project and per-person memory docs (give the coach something to cite)
6. Structured meeting extraction (feeds the memory docs automatically)
7. Weekly retrospective, natural-language capture, smart triage (quality-of-life on top)
8. Semantic search (capstone once there's enough structured content to index)
