# Live Poll Feature — Design Spec

**Date:** 2026-04-26
**Status:** Approved

## Overview

Admin-triggered live poll system integrated into the existing Astro website. The admin creates a question (from predefined templates or custom), broadcasts a link via the Nextcloud Talk bot to all active calls, and participants respond by scanning a QR code. Answers are aggregated and the admin can share results back to all Talk rooms.

---

## Constraints

- Fully anonymous participation — no authentication required to submit
- One-shot / ephemeral — each poll is tied to the active call session
- Predefined question templates are sufficient (no need for admin-defined MC options)
- Poll locks atomically when admin clicks "Ergebnisse teilen"
- Results are shared both as a bot message in Talk and as a shareable URL

---

## Data Model

Two new tables added to the shared-db under the website schema:

```sql
CREATE TABLE polls (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question    TEXT NOT NULL,
    kind        TEXT NOT NULL CHECK (kind IN ('multiple_choice', 'text')),
    options     TEXT[],           -- NULL for text polls
    status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'locked')),
    room_tokens TEXT[] NOT NULL,  -- Talk room tokens the poll was broadcast to
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    locked_at   TIMESTAMPTZ
);

CREATE TABLE poll_answers (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id      UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    answer       TEXT NOT NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_poll_answers_poll ON poll_answers(poll_id, submitted_at DESC);
```

No user ID stored — fully anonymous. `room_tokens` persists the broadcast targets so the results share knows where to post. No unique constraint on `(poll_id, answer)` — one-answer-per-person is enforced by UX (`sessionStorage`) not DB.

---

## Predefined Templates

| # | Question | Kind | Options |
|---|----------|------|---------|
| 1 | Wie fühlen Sie sich gerade? | multiple_choice | 😊 Gut, 😐 Mittel, 😔 Nicht so gut |
| 2 | Stimmen Sie zu? | multiple_choice | Ja, Nein, Enthaltung |
| 3 | Wie hilfreich war diese Session? | multiple_choice | Sehr hilfreich, Hilfreich, Wenig hilfreich, Nicht hilfreich |
| 4 | Bereit für den nächsten Schritt? | multiple_choice | Ja, Noch nicht, Brauche mehr Info |
| 5 | Was nehmen Sie mit? | text | — |
| 6 | Eigene Frage… | text | — (admin types question) |

Templates are defined as a constant in the website source (not in the DB) — no admin UI for editing templates.

---

## API Routes

### Admin routes (require `isAdmin` session)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/admin/poll` | Create poll + broadcast link to all active Talk rooms (409 if a poll is already open) |
| `GET` | `/api/admin/poll/active` | Returns the current open poll (if any) — used on page load to restore status panel |
| `GET` | `/api/admin/poll/[id]` | Poll status + aggregated answer counts (for live refresh) |
| `POST` | `/api/admin/poll/[id]/share` | Lock poll + post results summary to Talk rooms |

### Public routes (no auth)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/poll/[id]` | Get poll question/options (404 if not found, 410 if locked) |
| `POST` | `/api/poll/[id]/answer` | Submit anonymous answer (409 if locked) |
| `GET` | `/api/poll/[id]/results` | Aggregated results (403 while open, 200 once locked) |

---

## Pages

| Page | Description |
|------|-------------|
| `/admin/meetings.astro` | **Modified** — add "Umfrage starten" button and live poll status panel |
| `/poll/[id].astro` | **New** — participant response page (QR code target) |
| `/poll/[id]/results.astro` | **New** — public results page (accessible after locking) |

---

## Admin Flow

1. Admin opens `/admin/meetings` and clicks **"📊 Umfrage starten"** (next to "Brett für alle")
2. Modal shows the 6 predefined templates; admin selects one (or types a custom question)
3. Modal shows which active calls will receive the broadcast
4. Admin clicks **"📊 Umfrage starten"** to confirm
5. `POST /api/admin/poll` creates the poll row and calls `postBotReply` for each active room:
   `📊 Umfrage: https://web.<domain>/poll/<uuid>`
6. Modal closes; the **Live-Status Panel** appears in place of the button, showing:
   - Question text and answer count
   - Live bar chart (auto-refreshes every 5s via `GET /api/admin/poll/[id]`)
   - **"QR-Code zeigen"** button (opens QR in a second modal)
   - **"📤 Ergebnisse teilen & schließen"** button
7. Admin clicks **"Ergebnisse teilen & schließen"**:
   - `POST /api/admin/poll/[id]/share` sets `status = 'locked'`, `locked_at = now()`
   - Bot posts results summary to all `room_tokens`:
     ```
     📊 Umfrageergebnis: „<question>"
     😊 Gut: 5 | 😐 Mittel: 3 | 😔 Nicht so gut: 0
     → https://web.<domain>/poll/<uuid>/results
     ```
   - Status panel updates to show "Umfrage geschlossen"

Only one poll can be active at a time:
- On `/admin/meetings` load: `GET /api/admin/poll/active` (or reuse `GET /api/admin/poll/[id]`) checks for an existing `status = 'open'` poll; if found, the status panel is shown immediately instead of the button
- `POST /api/admin/poll` also rejects with `409 Conflict` if any poll with `status = 'open'` already exists, preventing concurrent polls even if two admin tabs are open

---

## Participant Flow

1. Participant sees bot message in Talk and opens the URL (or scans QR code if in the room)
2. `/poll/[id].astro` loads — no login required
3. **Multiple choice:** three to four large tap-target buttons
4. **Text:** textarea + submit button
5. `POST /api/poll/[id]/answer` stores the answer
6. On success: thank-you screen showing their chosen answer (MC) or a confirmation (text)
7. `sessionStorage` flag prevents the submit button from reappearing on refresh
8. If poll is already locked (status 410 from API): show "Umfrage geschlossen" with link to results

---

## Results Page

- Accessible at `/poll/[id]/results`
- Returns 403 while `status = 'open'`; accessible once `status = 'locked'`
- **Multiple choice:** horizontal bar chart with count + percentage per option
- **Free text:** card list of all submitted answers
- Both variants show total answer count and "Antworten waren anonym" footer

---

## QR Code

- Uses the `qrcode` npm package (new dependency — add to `website/package.json`)
- Generated client-side in the browser; the admin status panel passes the poll URL to a small `<script>` block that calls `QRCode.toCanvas(el, url)`
- Target URL: `https://web.<PROD_DOMAIN>/poll/<uuid>`
- Displayed in a modal triggered by "QR-Code zeigen" on the admin status panel
- No server-side QR generation or new API endpoint needed

---

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| No active calls at broadcast time | Poll is still created; bot message skipped; admin sees "Keine aktiven Calls" warning |
| Bot post fails for one room | Logged; other rooms still receive the message; admin sees partial failure count |
| Answer submitted to locked poll | `409 Conflict`; participant page shows "Umfrage geschlossen" |
| Results page opened while poll is open | `403 Forbidden`; page shows "Ergebnisse noch nicht verfügbar" |
| Duplicate answer attempt (same browser) | Prevented by `sessionStorage`; no second request made |

---

## Implementation Scope

Files to **create**:
- `website/src/pages/api/admin/poll/index.ts` — POST create + broadcast
- `website/src/pages/api/admin/poll/active.ts` — GET current open poll
- `website/src/pages/api/admin/poll/[id].ts` — GET status + counts
- `website/src/pages/api/admin/poll/[id]/share.ts` — POST lock + share
- `website/src/pages/api/poll/[id].ts` — GET question (public)
- `website/src/pages/api/poll/[id]/answer.ts` — POST submit
- `website/src/pages/api/poll/[id]/results.ts` — GET aggregated results
- `website/src/pages/poll/[id].astro` — participant page
- `website/src/pages/poll/[id]/results.astro` — results page
- `website/src/lib/poll-db.ts` — DB helpers (createPoll, getPoll, submitAnswer, getResults, lockPoll)

Files to **modify**:
- `website/src/pages/admin/meetings.astro` — add button + status panel + QR modal
- `k3d/website-schema.yaml` — add `polls` and `poll_answers` table DDL

New dependency: `qrcode` npm package (add to `website/package.json`).

No new Kubernetes resources, no new services, no new secrets required. `BRETT_BOT_SECRET` and `NEXTCLOUD_URL` (already in the website env) are reused for broadcasting.
