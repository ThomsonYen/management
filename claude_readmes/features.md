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

## 12. Social: friends and catch-up cadence ✅ Implemented

A `Social` section alongside Projects/People/Meetings for personal relationships, kept deliberately outside the work graph.

- `friends` table (name, notes, `cadence_days`, `last_hangout_date`) — **not** a flag on `persons`, which is the FK target for todo assignees, meeting attendees and `users.person_id`; friends must never appear in assignee pickers or the account-linking UI.
- `hangouts` + `hangout_friends` many-to-many, so one dinner logs everyone who was there and advances all their cadences at once.
- Status is derived server-side on every friend: `planned` / `needs_confirm` / `never` / `ok` / `due_soon` (≥80% of the cadence) / `slipping` (≥95%) / `overdue`, plus `days_since_hangout`, `days_until_due` and `cadence_tier`. The 80% lead time is the point — a 30-day cadence nudges on day 24, while there is still time to act — and the tone escalates at each tier (all wording lives in `frontend/src/socialCopy.ts`).
- **Plans.** A future-dated hangout is a plan: it mutes the nudge, because reaching out is the thing the nudge was asking for. Once its date passes the friend becomes `needs_confirm` and nudging resumes until someone answers — confirm it (it becomes history and advances the cadence) or delete it. Only `happened` entries count toward `last_hangout_date`, so a plan that falls through can never silently mute the nudge.
- `last_hangout_date` is recomputed from the log rather than being a forward-only watermark like person check-ins: the hangout log is the only source of truth, so deleting or re-dating an entry rolls it back. Future-dated hangouts never count.
- Dashboard card for overdue/due-soon friends; `never` stays on the Social page as a prompt rather than an alert.
- Owner-only (absent from `_MEMBER_ROUTES`); `write:social` scope for tokens and five MCP tools.

**Why:** the check-in cadence machinery already existed for direct reports and worked well; personal relationships drift for exactly the same reason work relationships do, and the same nudge fixes it.

**Not built:** real push notifications. There is no push infrastructure in the app at all (no VAPID, no service-worker push handler, no scheduler job), so reminders currently surface only when the app is open. See the note in the implementation order below.

## 13. Bear-style note reading and writing ✅ Implemented

Make the note page (`NoteDetailPage`, meeting and personal notes) feel like Bear: one calm column of serif text with nothing else around it. What makes Bear pretty is mostly restraint: a single centered column with a comfortable line length, a book serif with generous line height, one accent colour used sparingly (red), chrome that disappears, and Markdown syntax that is dimmed rather than hidden or shown raw in a second pane.

- **Enlarge mode.** A toggle on the note header (a `Maximize2`/`Minimize2` icon, plus a hotkey registered with the existing hotkey settings, and `Esc` to leave) that hides everything except the title and the text: the app sidebar/nav, the back/date/delete row (title stays), the vault file path, the share control, the tag pills, the meeting sidebar (attendees/projects/linked todos), the transcript and the editor toolbar. The save indicator stays as a faint dot. The state lives in the URL (`?focus=1`) so a reload or a shared link keeps it; `AppShell` reads a small `useNoteFocus()` flag to drop its sidebar. On phones it is the same view with the bottom nav hidden.
- **Centered reading column.** Note text sits in a centered column capped at ~42rem (~70 characters per line) with generous side margins at every width. This applies in normal mode as well, not only in enlarge mode. The title aligns to the same column. On phones the column is full width with the usual 16px gutter.
- **Georgia.** The note title and body use `Georgia, 'Times New Roman', serif` (Georgia ships on macOS, iOS and Windows; Android falls back to its serif) at ~1.0625rem with line-height ~1.7, and headings get more space above than below. Scope it to the note surface with a `--font-note` token and a `.note-surface` class, so the rest of the app keeps its sans font. Code spans and blocks stay mono. Add it as a setting ("Note font: Georgia / App font"), defaulting to Georgia.
- **Red bullets by depth.** Unordered lists cycle through four markers by nesting level: filled red circle → empty red circle → filled red diamond → empty red diamond, then repeat. Draw them with `li::before` and small inline-SVG `mask-image`s coloured by a `--note-bullet` token (a Bear-like warm red, with a slightly lighter dark-mode value), not with Unicode glyphs, which look different in every font. Numbered lists use the same red for their numbers. Task-list items keep their checkboxes, with no bullet. Replace the current disc/circle/square rules in `index.css` (`.wmde-markdown ul …`).
- **The hard part: bullets need rendered Markdown.** Notes are edited with `@uiw/react-md-editor`, which is a plain `<textarea>` next to a live preview (desktop) or the textarea alone (phone). A textarea can't draw red diamonds or use a different font per element, so the Bear look only shows in rendered text. Two stages:
  1. **Now (CSS + layout only):** enlarge mode shows one column. It defaults to the rendered view (`preview="preview"`) styled as above, and a click or `⌘E` switches that same column to the editor (`preview="edit"`, textarea also in Georgia and centered), then back. There is no side-by-side split in enlarge mode. Small change, no new dependency.
  2. **Later (true Bear editing):** replace the textarea with a CodeMirror 6 editor whose decorations render Markdown in place while you type: `- ` becomes the red marker widget for its depth, `#` / `**` / `[[` marks are dimmed, and headings are sized. This is Bear's actual trick and removes the edit/read toggle. It adds a dependency (`@codemirror/*`, ~150 KB gz) and needs the hashtag links, `remarkFixEmptyTasks` behaviour and the iOS 16px focus-zoom guard carried over. The custom `MarkdownEditor.tsx` (project/person notes) is the other option, but it only knows todo/list/ordered/header/paragraph lines and would mangle tables, code blocks and links in vault notes, so it isn't a good fit.
- Apply the same red bullets and Georgia column to other rendered Markdown only where it reads as a document (the note preview in lists, shared notes for members); leave project/person notes (`MarkdownEditor.tsx`) on the app font for now. Its `•` prefix could adopt the same markers later.
- Pure frontend. No schema, API, scope or agent-manual changes.

**Why:** notes are the one place in the app meant for long-form reading and writing, and they currently look like a form field: a sans textarea split beside a preview, surrounded by metadata. A focused serif column with a little red makes them pleasant to read back, which is what notes are for.

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
9. ~~Bear-style notes (#13)~~ ✅ Implemented: built straight to the CodeMirror in-place editor (`components/NoteEditor.tsx`), used for every note surface (meeting/personal, project, person, weekly goals), each with enlarge mode (`components/EnlargedNote.tsx` for in-page notes); `MarkdownEditor` removed; App font and Note font are separate settings

Also open: **push notifications for Social (#12)**. The feature ships in-app only — there is no push infrastructure anywhere in the codebase. Adding it means a `push_subscriptions` table, VAPID keys as a Fly secret, `pywebpush`, a daily scheduler job (the backup loop in `backend/backup/scheduler.py` is the template), and switching `vite-plugin-pwa` from `generateSW` to `injectManifest` so a custom `push` handler can exist. On iOS it only works once the PWA is added to the Home Screen (16.4+). A daily email digest is the cheaper alternative — no service-worker changes, but it needs an email provider key.
