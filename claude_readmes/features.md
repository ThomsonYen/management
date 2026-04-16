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

## 3. Command palette (⌘K)

A global fuzzy-search palette invoked by ⌘K that searches across:

- Todos (title, description)
- Meetings (title, attendees)
- Projects (name)
- People (name)
- Actions ("Create todo", "Toggle theme", "Go to Focus", etc.)

Keyboard-first navigation: arrow keys to move, Enter to select, Esc to close. Recent items shown by default.

**Why:** Solves multiple problems at once — navigation (beyond ⌘1–7), search (no global search exists), hotkey discoverability (actions appear with their shortcuts), and fast jumps to specific records.

## Implementation order

Suggested sequence when picking these up:

1. Command palette (independent, high-value)
2. Inline-edit affordances (small CSS pass across components)
3. Dashboard "Must Do Today" (reuses existing Focus components)
