# Admin Inbox — Rework

**Date:** 2026-05-08
**Branch suggested:** `feature/admin-inbox-rework`
**Owner:** Patrick (orchestrator) → bachelorprojekt-website (impl) + bachelorprojekt-test (e2e)
**Affects:** `web.mentolder.de/admin/inbox`, `web.korczewski.de/admin/inbox`

## 1. Problem

The admin inbox at `/admin/inbox` (today: 340-line single-file `InboxApp.svelte`) has three concrete problems Patrick hit while triaging:

1. **Off-brand visuals** — uses generic dark colors (`#1e1e2e`, purple `#7c6ff7`, neon green `#4ade80`) that ignore the brass/sage admin theme on `var(--ink-*)` used by every other admin page. The page looks like a different app.
2. **Triage is slow** — single narrow column mixes all six item types together, no filter by type, no search, every detail truncated to 80 chars, no preview pane.
3. **Per-item flows are clunky** — message threads expand inline inside a 1e1e2e card, the bug "Erledigt" note flow appears in the card and disrupts scanning, no keyboard shortcuts, action buttons too small.

## 2. Goals & Non-goals

**Goals**
- Match the existing admin theme (brass on ink, Newsreader/Geist) used by `/admin/clients`, `/admin/tickets`, etc.
- Two-pane email-client layout (sidebar / list / detail) with keyboard navigation.
- Each item type renders a tailored detail pane that fits its data shape and its action(s).
- Inline thread + reply for `user_message` lives in the wide detail pane, not inside a list card.
- Bug resolution-note flow lives in the detail pane (no more in-card textarea).
- Mobile collapses to single-column with tap-through to detail.

**Non-goals (explicitly out of scope)**
- Bulk actions (multi-select).
- Live updates / websockets / polling. Refresh-on-action stays as-is.
- Snooze.
- New item types or new actions on existing types.
- API changes — `GET /api/admin/inbox?status=&type=`, `POST /api/admin/inbox/:id/action` and `GET|POST /api/admin/messages/:threadId` are unchanged.
- Changing the database schema or `inbox_items` payload shapes.

## 3. File layout

Replace the current `InboxApp.svelte` (340 lines, will be deleted) with a small set of focused components colocated under `website/src/components/inbox/`:

```
website/src/components/inbox/
  InboxApp.svelte         orchestrator: state, fetch, selection, keyboard handlers   (~140 lines)
  InboxSidebar.svelte     type filter (Alle + 6 types) with counts                    (~80 lines)
  InboxList.svelte        status tabs, search box, list rows                          (~140 lines)
  InboxDetail.svelte      header + per-type body via {#if item.type === ...}          (~280 lines)
  inbox-shortcuts.ts      keyboard handler (pure fn, returns { handle }) + tests       (~60 lines)
```

`website/src/pages/admin/inbox.astro` keeps its current shape — server-side load `listInboxItems({status:'pending'})` + `countPendingByType()`, hand to `<InboxApp client:load>`. The wrapping `<div style="height: calc(100vh - 120px)">` stays.

The old `InboxApp.svelte` import at `pages/admin/inbox.astro:3` becomes `import InboxApp from '../../components/inbox/InboxApp.svelte';`.

## 4. Visual / brand spec

All colors come from CSS variables in `website/src/styles/global.css`. **Never hardcode hex values for surfaces, text or borders.** OK to hardcode `oklch()` for the per-type accent colors below, since they are not in the global token set.

### 4.1 Surfaces

| Role               | Token                             | Notes                              |
|--------------------|-----------------------------------|------------------------------------|
| Page background    | `var(--ink-900)`                  | inherited from `AdminLayout` body  |
| Sidebar surface    | `var(--ink-850)`                  | matches admin sidebar              |
| List surface       | `var(--ink-900)`                  |                                     |
| Detail surface     | `var(--ink-900)`                  |                                     |
| Card / drawer      | `var(--ink-850)`                  |                                     |
| Hover row          | `rgba(255,255,255,0.025)`         |                                     |
| Selected row bg    | `oklch(0.80 0.09 75 / 0.07)`      | brass tint                          |
| Selected row rule  | `var(--brass)`                    | 2 px left border on selected row    |
| Divider            | `var(--line)` (`rgba(255,255,255,0.07)`) | between rows, sections      |

### 4.2 Text

| Role             | Token                      |
|------------------|----------------------------|
| Primary text     | `var(--fg)` (`#eef1f3`)    |
| Secondary text   | `var(--fg-soft)` (`#cdd3d9`) |
| Mute / meta      | `var(--mute)` (`#8c96a3`)  |
| Mute-2 / hint    | `var(--mute-2)` (`#6a727e`) |
| Brass accent     | `var(--brass)`             |
| Sage accent      | `var(--sage)`              |

Fonts are inherited from `AdminLayout` (`var(--font-sans)` Geist, `var(--font-serif)` Newsreader, `var(--font-mono)` Geist Mono). Use:

- Newsreader for the detail-pane subject / title.
- Geist for body text, list rows, labels.
- Geist Mono for timestamps, IDs (`BR-…`), keyboard-shortcut hints, label captions.

### 4.3 Per-type accent palette

Each `InboxType` has a single accent used for its sidebar dot, its list-row pill, and its detail-pane avatar. **Do NOT use the accent for buttons** — buttons are sage (success) / brass (primary) / steel (neutral) regardless of type.

| Type               | Pill bg                                  | Pill text                       |
|--------------------|------------------------------------------|---------------------------------|
| `registration`     | `oklch(0.80 0.09 75 / 0.14)` (brass)     | `oklch(0.86 0.09 75)`           |
| `booking`          | `oklch(0.80 0.06 160 / 0.14)` (sage)     | `oklch(0.86 0.06 160)`          |
| `contact`          | `rgba(255,255,255,0.06)` (steel)         | `var(--fg-soft)`                |
| `bug`              | `oklch(0.7 0.12 25 / 0.16)` (rose)       | `oklch(0.85 0.1 25)`            |
| `meeting_finalize` | `oklch(0.7 0.12 235 / 0.18)` (steel-blue)| `oklch(0.85 0.1 235)`           |
| `user_message`     | `oklch(0.65 0.12 290 / 0.18)` (violet)   | `oklch(0.85 0.1 290)`           |

Define these as `const TYPE_ACCENT: Record<InboxType, { bg: string; fg: string; label: string }>` at the top of `InboxList.svelte` (and re-export from `InboxApp.svelte` so the sidebar uses the same map).

### 4.4 Buttons

Three roles only. All `padding: 7px 14px; border-radius: 7px; font: 600 12px Geist;`.

- **`.btn-ok`** — sage (`background: oklch(0.80 0.06 160); color: var(--ink-900);`) — Freischalten, Bestätigen, Erledigt, Finalisieren.
- **`.btn-no`** — outline (`background: rgba(255,255,255,0.06); color: var(--fg); border: 1px solid var(--line-2);`) — Ablehnen, Archivieren.
- **`.btn-primary`** — brass (`background: var(--brass); color: var(--ink-900);`) — Senden (in reply box).
- **`.btn-ghost`** — transparent (`background: none; color: var(--mute);`) — secondary actions like "Im Ticket öffnen", "Profil anzeigen".

Each button shows its keyboard-shortcut hint in a small pill on its right edge: `<span class="ksk">A</span>`. The hint is `font: 600 9.5px "Geist Mono"; opacity: 0.65; padding: 1px 5px; border-radius: 3px; background: rgba(0,0,0,0.2);`.

## 5. Layout — desktop (≥ 768 px)

Three columns inside the page-fill wrapper:

```
┌────────────────────────────────────────────────────────────────────┐
│ Status tabs (Offen 12 · Erledigt · Archiv)                /        │  ← top bar (44 px)
├──────────────┬──────────────────────────┬─────────────────────────┤
│              │ Suchen…                  │                         │
│  ALLE     12 │ ─────────────────────── │ Avatar  Subject          │
│  Anfragen  4 │ M. Berger    vor 4 Min  │ Pill · email · meta · ↑↓ │
│  Buchungen 3 │ [Anfrage] Erstgesp…     │                         │
│  Bugs      2 │                         │ Field rows OR thread     │
│  Nachr.    3 │ L. Sander    vor 1 Std  │                         │
│  Meetings  0 │ [Buchung] Coaching 60′  │                         │
│  Kontakt   0 │                         │ Action row               │
│              │ …                       │                         │
└──────────────┴──────────────────────────┴─────────────────────────┘
   200 px            340 px                       fluid
```

Sidebar `width: 200px;`. List `width: 340px;`. Detail `flex: 1; min-width: 0;`. Each column scrolls independently (overflow-y: auto). The top status-tab bar is sticky and shared across all three columns.

### 5.1 Top bar
- Left: breadcrumb `Admin · Posteingang` (font-serif).
- Right: status segmented control (Offen / Erledigt / Archiv) with brass-tinted active state. The Offen pill includes total count: `Offen 12`.
- Far right: muted `/` hint (search shortcut, see §8). Search is a plain input in the list column; the hint is informational only — pressing `/` focuses the search input. **No `⌘K` palette in scope.**

### 5.2 Sidebar
- Header: `FILTER` in `var(--mute-2)` Geist Mono uppercase letterspaced.
- Items: `Alle` first (sums all types in the current status), then one row per type in fixed order: Anfragen, Buchungen, Bugs, Nachrichten, Meetings, Kontakt.
- Each item row: `<dot accent="brass"> <name flex:1> <count font-mono mute>`.
- Active item gets `oklch(0.80 0.09 75 / 0.14)` background and brass text. (Same pattern as `AdminLayout` `.sidebar-nav-item.is-active`.)
- A type with `count === 0` for the current status renders muted but stays clickable.

### 5.3 List
- Top: search box `<input placeholder="Suchen">` (font-size:12px, ink-850 surface, line border). Debounce 150 ms. Filters client-side across `name + subject + sub` from `summary()`.
- Body: rows. Each row has two lines:
  - Top: `<name strong fg>` (Newsreader 12.5px? **no — keep Geist 12px 500 weight to match list density**) + right-aligned `<relative-time mono mute>`.
  - Bottom: `<type-pill>` + `<one-line-subject mute, truncated with ellipsis>`.
- Selected row: `oklch(0.80 0.09 75 / 0.07)` bg + 2px brass left border + ↑↓ keyboard target.
- If the list is empty for the current filter+status, show centred copy `Keine Einträge.` in mute.

### 5.4 Detail pane

#### Header (shared across all types)
- Avatar (36×36 round). Initials for person types, `🐞` for bug, `📅` for meeting, `✉` for user_message — see §6.
- Newsreader title (19px) — name or ID.
- Meta line (Geist 11px mute): pill · email · time · extra context (e.g. company, service type). Email is rendered as a copyable link (`<a href="mailto:…">`).
- Right side: ↑↓ buttons that move selection in the list (same as `j/k`).

#### Body (per-type — see §6)

#### Footer
- Left: primary actions (sage/outline buttons) per type.
- Spacer flex.
- Right: ghost actions ("Im Ticket öffnen ↗", "Profil anzeigen ↗", "Notiz…").

#### Empty state
When `selectedItem === null` (no item selected, e.g. just opened the page with status=archiv that's empty, or after the last pending item was actioned), show in detail pane:

```
┌─────────────────────────────────────────────┐
│              [pulse dot in brass]           │
│       Wähle einen Eintrag aus der Liste     │
│                                             │
│   Offen:  4 Anfragen · 3 Buchungen ·        │
│           2 Bugs · 3 Nachrichten            │
└─────────────────────────────────────────────┘
```

The counts are derived from the cached `counts` prop and update on action.

## 6. Per-type detail panes

`InboxItem.payload` shapes are determined by the producers — see `website/src/pages/api/{contact,booking,register,bug-report,portal/messages}.ts`. **Implementation MUST be defensive: every payload field access goes through optional chaining + fallback.** All field labels are German.

### 6.1 `registration`
- Payload fields used: `firstName`, `lastName`, `email`, `phone?`, `company?`.
- Header avatar: initials from `firstName` + `lastName` (e.g. "MB").
- Body field rows: Telefon (or `—`), Firma (or `—`), Quelle (`Kontaktformular · /kontakt`).
- Actions: `[btn-ok] ✓ Freischalten ⌨A`, `[btn-no] ✗ Ablehnen ⌨D`.

### 6.2 `booking`
- Payload fields used: `name`, `email`, `phone?`, `typeLabel`, `slotDisplay`, `date`, `serviceKey?`/`leistungKey?`.
- Header avatar: initials from `name`.
- Body field rows: Termin (`{typeLabel} · {slotDisplay}` on `{formatDate(date)}`), Telefon, E-Mail (link), Service (mapped to a friendly label or raw key).
- Actions: `[btn-ok] ✓ Bestätigen ⌨A`, `[btn-no] ✗ Ablehnen ⌨D`.

### 6.3 `contact`
- Payload fields used: `name`, `email`, `phone?`, `subject?`, `message`.
- Header avatar: initials from `name`.
- Body field rows: E-Mail (link), Telefon, Betreff. Then a `.body-block` (left brass rule, ink-850 bg) showing the full `message` with `white-space: pre-wrap`.
- Actions: `[btn-no] Archivieren ⌨E`. Ghost: `Antworten per Mail ↗` (mailto link with prefilled subject `Re: {subject ?? "Ihre Anfrage"}`).

### 6.4 `bug`
- Payload fields used: `ticketId`, `description`, `reporterEmail?`, `reporterName?`, `userAgent?`, `path?`, `brand?`.
- Header avatar: rose 🐞 emoji on `oklch(0.7 0.12 25 / 0.2)` background.
- Body field rows: Pfad (mono), Browser (`{userAgent}`), Reporter (name + email link), then `.body-block` for `description`.
- A persistent `<textarea>` resolution-note (max 500 chars, char counter, autosaves to `localStorage` keyed by `inbox-bug-note-{id}` so navigating away doesn't lose work).
- Actions: `[btn-ok] ✓ Erledigt ⌨⏎` (disabled until note non-empty), Ghost: `Im Ticket öffnen ↗` (links to `/admin/bugs?ticket={ticketId}`).

### 6.5 `meeting_finalize`
- Payload fields used: `customerName`, `customerEmail?`, `meetingType`, `meetingDate`, `roomToken?`, `projectId?`.
- Header avatar: 📅 emoji on steel-blue tint.
- Body field rows: Kunde (link to `/admin/clients/{customerEmail}` if email present), Termin-Typ, Datum, Talk-Raum (link if token present), Projekt (link if id present).
- Actions: `[btn-ok] ▶ Finalisieren ⌨⏎`. Ghost: `Im Termin öffnen ↗`.

### 6.6 `user_message`
- Payload fields used: `senderName?`, `message?`, `threadId` (= `item.reference_id`).
- Header avatar: initials from `senderName ?? "?"`.
- Body: full thread loaded from `GET /api/admin/messages/{threadId}` (uses existing endpoint).
  - Rendered as alternating bubbles: user (steel-blue ink-800 bg, left-aligned), admin (brass tint bg, right-aligned). Max-width 78%. Show `WHO · ZEIT` mono caption above each bubble; `ZEIT` mono in bottom-right.
  - Loading: spinner pulse for 1s, then placeholder "Lade Konversation…".
- Inline reply box below thread: `<textarea>` + `[btn-primary] Senden ⌨⌘⏎`. After send, append the new message to thread, clear textarea, keep selection.
- Actions footer: `[btn-ok] ✓ Erledigt ⌨E`. Ghost: `Profil anzeigen ↗` (links to `/admin/clients?email={email}` if customer email known).

## 7. State model (in `InboxApp.svelte`)

```ts
let items   = $state<InboxItem[]>(initialItems);   // currently visible list (filter+status applied server-side)
let counts  = $state<Record<InboxType, number>>(initialCounts);

let activeStatus = $state<InboxStatus>('pending');
let activeType   = $state<InboxType | 'all'>('all');
let searchQuery  = $state('');

let selectedId   = $state<number | null>(null);
const selected   = $derived(items.find(i => i.id === selectedId) ?? null);

// derived list after client-side filters (type + search)
const visible = $derived(items
  .filter(i => activeType === 'all' || i.type === activeType)
  .filter(i => searchQuery === '' || matchesSearch(i, searchQuery)));
```

### 7.1 Selection rules
- On initial load, auto-select `items[0]` if non-empty.
- Changing `activeStatus` or `activeType` resets `selectedId` to first row of new `visible`, or `null` if empty.
- Filtered-out selected item: if `selectedId` is no longer in `visible`, fall back to `visible[0]?.id ?? null`.
- After action (approve/decline/done/finalize/archive): the actioned item is removed from `items`, and `selectedId` advances to the next visible item below, or wraps to first, or becomes `null` (Patrick's "j-flow" preference).

### 7.2 Reload triggers
- Status tab change → `fetch /api/admin/inbox?status={s}` (server filter). Type filter is client-side from cached `items`.
- After action → optimistic remove from `items` + `counts[type]--` (don't refetch unless status tab changed).

### 7.3 Counts source
- The `Offen N` badge inside the **status tab** always reflects pending across all types — sourced from `countPendingByType()` (also feeds the AdminLayout sidebar badge). Recomputed on action (decrement) or when status tab changes (refetch).
- The **sidebar** type rows show `byTypeOf(items)` — i.e. counts within the currently-active status. On `Erledigt` it shows how many erledigte items per type, etc. Implement as `derived(byTypeOf(items))`.

## 8. Keyboard shortcuts

Live in `inbox-shortcuts.ts` as a pure function that takes `{ event, ctx }` and returns the next state action (`{ kind: 'select-next' }`, `{ kind: 'action', name: 'approve' }`, etc.). This makes them unit-testable without the DOM. `InboxApp.svelte` wires `window.addEventListener('keydown', …)` to call it.

| Key             | Action                                                   |
|-----------------|----------------------------------------------------------|
| `j` or `↓`      | select next visible item                                 |
| `k` or `↑`      | select previous visible item                             |
| `g 1`-`g 6`     | jump to type filter: 1=Anfragen, 2=Buchungen, 3=Bugs, 4=Nachrichten, 5=Meetings, 6=Kontakt |
| `g a`           | type filter = Alle                                       |
| `1` `2` `3`     | switch status tab (1=Offen, 2=Erledigt, 3=Archiv)        |
| `/`             | focus search input                                       |
| `Esc`           | clear search if focused; else clear selection            |
| `A`             | primary action on current item (approve / confirm / done)|
| `D`             | secondary action (decline) — only on registration/booking |
| `E`             | mark done / archive — only on contact / user_message      |
| `⏎` (Enter)     | primary action when textarea NOT focused                 |
| `⌘⏎` (or `Ctrl⏎`) | send reply (when in user_message reply textarea)       |
| `R`             | focus user_message reply textarea                        |
| `?`             | toggle keyboard-cheat-sheet popover                      |

Shortcuts are **disabled when**:
- Any `<input>` / `<textarea>` is focused (except `⌘⏎`, `Esc`).
- A modal is open (none in scope, but guard is generic).

## 9. Mobile (< 768 px)

The same component renders three states via a single `mobileView: 'list' | 'detail'` reactive in `InboxApp.svelte`.

- Default: list-only. Sidebar collapses into a horizontally-scrolling chip row above the search box (`[Alle 12] [Anfragen 4] [Buchungen 3] …`).
- Tap row → `mobileView = 'detail'`, hides list+sidebar, shows full-screen detail with a top-left `← Zurück` button. ↑↓ buttons in the header still navigate within the visible list.
- After action: stay in detail view but with the next item; if last, `mobileView = 'list'` automatically.
- Status tabs stay sticky at the top in both views.
- Reply textarea on user_message: full-width with a sticky-bottom Senden bar.
- Keyboard shortcuts disabled on touch devices (detect via `matchMedia('(pointer: fine)')`).

## 10. Test selectors (contract for both implementation + test agents)

To let the test agent write tests in parallel with implementation, the spec fixes these `data-testid` attributes:

| Selector                                    | Element                                            |
|---------------------------------------------|----------------------------------------------------|
| `[data-testid="inbox-app"]`                 | InboxApp root                                       |
| `[data-testid="inbox-sidebar"]`             | Sidebar root                                        |
| `[data-testid="inbox-sidebar-item"][data-type="{type|all}"]` | Sidebar filter row                       |
| `[data-testid="inbox-status-tab"][data-status="{status}"]`   | Status tab                              |
| `[data-testid="inbox-search"]`              | Search input                                        |
| `[data-testid="inbox-list"]`                | List root                                           |
| `[data-testid="inbox-list-row"][data-id="{id}"]` | List row                                       |
| `[data-testid="inbox-list-row"][data-selected="true"]` | currently-selected row                    |
| `[data-testid="inbox-detail"]`              | Detail pane root                                    |
| `[data-testid="inbox-detail"][data-type="{type}"]` | Detail pane (variant per type)                |
| `[data-testid="inbox-detail-empty"]`        | Empty-state placeholder                             |
| `[data-testid="inbox-action-primary"]`      | Sage primary button (Freischalten/Bestätigen/Erledigt/Finalisieren) |
| `[data-testid="inbox-action-secondary"]`    | Outline secondary button (Ablehnen/Archivieren)     |
| `[data-testid="inbox-detail-bug-note"]`     | Bug resolution-note textarea                        |
| `[data-testid="inbox-thread"]`              | user_message thread container                       |
| `[data-testid="inbox-thread-msg"][data-role="{user|admin}"]` | thread bubble                          |
| `[data-testid="inbox-reply"]`               | Reply textarea                                      |
| `[data-testid="inbox-reply-send"]`          | Reply send button                                   |
| `[data-testid="inbox-nav-prev"]`            | ↑ in detail header                                  |
| `[data-testid="inbox-nav-next"]`            | ↓ in detail header                                  |

## 11. Testing

### 11.1 Unit (`website/src/components/inbox/inbox-shortcuts.test.ts`)
- `j/k/↓/↑` move selection. With one item, j stays put.
- `g 1` … `g 6` set activeType; `g a` sets `'all'`.
- `1/2/3` set activeStatus.
- `A` triggers primary action on current type.
- `D` triggers secondary action only on registration + booking.
- Shortcuts ignored when an input/textarea is focused (mock by passing `target.tagName === 'TEXTAREA'`).
- `⌘⏎` triggers reply send when in user_message reply textarea.

### 11.2 Playwright (`tests/e2e/specs/fa-admin-inbox.spec.ts`, new file)
Use the same auth helper as `fa-admin-crm.spec.ts` (admin login). Tests run against live `web.mentolder.de` per the existing `playwright.config.ts`. Each spec MUST clean up created inbox items at end.

- **inbox-renders** — `/admin/inbox` returns 200, root `[data-testid="inbox-app"]` visible, sidebar has 7 items (Alle + 6 types).
- **inbox-empty-detail** — when no item selected, `[data-testid="inbox-detail-empty"]` visible with pending counts.
- **inbox-status-tabs** — clicking each tab updates the URL `?status=` and reloads list.
- **inbox-type-filter** — clicking a sidebar type narrows the visible rows; "Alle" restores.
- **inbox-search** — typing in `[data-testid="inbox-search"]` filters rows client-side; clearing restores.
- **inbox-keyboard-jk** — pressing `j` advances selected row; `k` reverses.
- **inbox-message-thread-load** — selecting a `user_message` row populates `[data-testid="inbox-thread"]` (uses an existing thread fixture or skips if none).
- **inbox-mobile-list-detail** — viewport 375x812: list-only by default, tap row enters detail, ← back returns to list.
- **inbox-action-401** — `POST /api/admin/inbox/9999/action` without auth returns 401 (this assertion already exists in `fa-admin-crm.spec.ts`; keep there, do not duplicate).

The test agent ADDS the new spec file. Do not modify `fa-admin-crm.spec.ts` beyond what's already in §11 list.

### 11.3 Manual smoke (after deploy)
- Open `https://web.mentolder.de/admin/inbox`, then `https://web.korczewski.de/admin/inbox`. Both must:
  - Render with brass/sage theme matching `/admin/clients` chrome.
  - Show real pending items (if any).
  - Allow keyboard `j/k` navigation.
  - Approve a real registration end-to-end (only if a safe-to-approve test registration exists; else skip).

## 12. Rollout

1. Branch `feature/admin-inbox-rework` from `main`.
2. Implementation + test agents fan out and commit to the branch.
3. Open PR, run CI (`task test:all`).
4. After CI green, deploy to **mentolder** then **korczewski**: `task website:deploy ENV=mentolder && task website:deploy ENV=korczewski` (per the "Website Deploy — full rebuild workflow" rule).
5. Smoke-check `/admin/inbox` on both live URLs.
6. Merge with squash.

No data migration. No env-var changes. No infra changes.

## 13. Risks

- **Live data shape drift**: the InboxItem payload field names listed in §6 are derived from the existing `summary()` switch and the API endpoints that produce them. If a producer evolves silently, a detail pane row can render `undefined`. Mitigation: use `?? '—'` on every payload access; never throw.
- **Thread fetch latency on slow link**: skeleton loading state covers it.
- **Keyboard handler binding leaks**: bind in `$effect` with cleanup; teardown on unmount. Unit test verifies handler is pure.
- **Selector stability**: §10 is a contract; both agents must respect it. If the impl agent changes a selector, it must update the spec PR description.
