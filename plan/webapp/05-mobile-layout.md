# 05 — Mobile Layout (iPhone)

Make the desktop-only UI usable one-handed on a phone. Breakpoint strategy: **`md` (768px) is the split**. At `≥md` the current shell (resizable sidebar, everything as-is) is untouched — zero desktop regression risk. Below `md`, the sidebar is hidden and a mobile shell renders instead.

## Navigation: bottom tab bar (not a hamburger drawer)

This is a daily-driver todo app — the core loop (check Focus, tick todos, glance Dashboard, jot a note) should be one thumb-tap away, which a tab bar gives and a drawer hides behind an extra gesture; iOS users expect tabs. The app has ~12 destinations, so: **4 primary tabs + "More"** — Dashboard, Focus, Todos, Notes, More. "More" opens a bottom sheet listing Projects, People, Meetings, Weekly Goals, Progress, Recently Done, Recently Deleted, Settings, plus the theme toggle and Logout.

## Shell changes (`frontend/src/App.tsx`)

- Add `hidden md:flex` to the `<aside>` — the resize handle and collapse button come along for free (the handle is `onMouseDown`-only, so touch never sees it).
- Root container: `h-screen` → `h-dvh` (see [04-pwa-foundation.md](04-pwa-foundation.md)).
- `<main>` gets `pb-16 md:pb-0` to clear the tab bar.
- New components under `frontend/src/components/mobile/`:
  - **`MobileTabBar.tsx`** — `md:hidden fixed bottom-0 inset-x-0`, `pb-[env(safe-area-inset-bottom)]`, ≥44pt hit targets, `NavLink`s reusing the existing `navItems` metadata.
  - **`MobileMoreSheet.tsx`** — bottom sheet for the secondary routes.
  - **`MobileHeader.tsx`** — `md:hidden` slim top bar with `pt-[env(safe-area-inset-top)]`: current page title, a "+" (new todo → existing `TodoModal`), a search icon (opens `CommandPalette`), and the **recording REC pill**. The REC indicator currently lives only in the sidebar (`App.tsx:189-223`) and is the *only* way to see/stop an active recording — on mobile it must be surfaced in the header (or as a floating pill above the tab bar).

## Per-route responsive passes

| Route / file (size) | What it needs |
|---|---|
| `pages/TodosPage.tsx` (323) | `<table>` → card list below `md` (reuse `TodoCard`); `BulkActionBar` tap targets |
| `pages/FocusPage.tsx` (1179) | Already stacks below `xl`; replace `draggable` reordering with a touch alternative (overflow menu: move up/down, unfocus). Largest file — budget accordingly |
| `pages/Dashboard.tsx` (387) | Mostly fine (`md:` grids exist); verify stacking; drag source → button |
| `pages/TodoDetailPage.tsx` (788) | Two-column grids/tables → stack |
| `pages/ProjectsPage.tsx` (736) | Internal mouse-resizable detail panel (`:593`) → stacked or list→detail navigation below `md`; hide resize handle |
| `pages/PeoplePage.tsx` (935) | Same panel pattern (`:696`) + `PersonProjectBoard` grid → stack |
| `pages/NoteDetailPage.tsx` (843) | Fixed `w-72` right metadata rail (`:343`) → collapsible "Details" bottom sheet/disclosure below `md`; editor full-width |
| `pages/WeeklyGoalsPage.tsx` (556) | `w-1/2` editor split (`:445`) → vertical stack; disable row-resize handle (`:527`) |
| `pages/ProgressPage.tsx` (518) | Recharts `ResponsiveContainer` widths; allow horizontal scroll for dense charts |
| `pages/MeetingNotesPage.tsx` / `PersonalNotesPage.tsx` | Minor; `TagSidebar` → horizontal chip scroller or filter sheet below `md` |
| `pages/RecentlyDonePage.tsx` / `RecentlyDeletedPage.tsx` | Padding/tap-target pass only |
| `pages/SettingsPage.tsx` (727) | Forms stack; hide the hotkey editor section on touch devices |

## Touch alternatives for desktop-only interactions

- **Drag-todo-to-Focus:** keep the drag path on desktop; on mobile add an explicit **Focus button** (crosshair icon calling the existing `is_focused` mutation) on `TodoCard` and in `TodoDetailPage`. Preferred over long-press context menus, which fight iOS text-selection/callout. Extract a shared `useFocusTodo()` hook so App.tsx's `focusMutation` logic isn't duplicated.
- **Hotkeys:** all ~28 are meta-key `keydown` handlers — inert without a keyboard, no blocking risk. Only work: hide hotkey hint UI (tooltips, the Settings hotkey list) on touch via `(pointer: coarse)`.
- **CommandPalette:** keep it — it's great mobile nav for 12 routes. Trigger via the MobileHeader search button. Mobile fixes: top-anchor the modal (so the iOS keyboard doesn't cover results) and make its input ≥16px.
- **Inputs globally ≥16px font-size** below `md` — prevents iOS focus-zoom.
- **Tap targets:** nav/list rows are `px-3 py-2` (~36px); bump to ≥44px below `md`.

## Phasing (frontend C + D)

- **Phase C — mobile shell (1–2 days):** hide aside, MobileTabBar + MobileMoreSheet + MobileHeader, REC pill surfaced, tap-target bump, 16px input rule.
- **Phase D — page passes (2–4 days, batched):**
  - Batch 1: TodosPage table→cards, Focus button on TodoCard/TodoDetail, Dashboard/Focus verification.
  - Batch 2: ProjectsPage + PeoplePage panel restructure, NoteDetailPage metadata sheet.
  - Batch 3: WeeklyGoals, Progress, Meetings/Notes lists + TagSidebar, Done/Deleted, Settings.

## Verification checklist (on a real iPhone)

- [ ] All 12 routes reachable by thumb via tabs + More sheet.
- [ ] Tab bar clears the home indicator; header clears the notch.
- [ ] Active recording visible and stoppable from the mobile header.
- [ ] Keyboard doesn't cover the CommandPalette; no focus-zoom on any input.
- [ ] Per batch: no horizontal overflow on any page; every action reachable without drag or hover.
- [ ] Desktop at `≥md` pixel-identical to today.
