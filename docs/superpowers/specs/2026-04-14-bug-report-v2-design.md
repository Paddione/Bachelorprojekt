# Bug Report v2 — Tickets, Categories, Email

**Date:** 2026-04-14
**Status:** Approved
**Scope:** Builds on the v1 feature in PR #76. Targets `website/` (both mentolder + korczewski brands).

## Goal

Turn the one-shot bug-report widget into a minimal ticketing workflow:

1. Reporter submits a bug with their **email**, a **category** (Fehler / Verbesserung / Erweiterungswunsch), and the existing description + optional screenshot.
2. The system assigns a **ticket ID** and posts an interactive message to Mattermost with an **Erledigt** button alongside the existing **Archivieren** button.
3. When the developer clicks **Erledigt**, Mattermost opens a dialog prompting "Was hast du gemacht?". On submit, the handler:
   - Edits the original Mattermost post in place to show status "✅ erledigt" and the dev's note.
   - Sends an email to the brand-appropriate inbox (`info@mentolder.de` or `info@korczewski.de`), with the reporter's email as Reply-To.
   - Posts a thread reply asking the owner to verify with `:white_check_mark:` or reply if something is still open.
4. Mattermost remains the **single source of truth** — no new database, no new persistent store.

## Context

PR #76 ships the v1 feature: floating widget → `/api/bug-report` → Mattermost. This expansion adds three form fields (email, category, status-displayed-in-post), one ticket-ID scheme, one new interactive action (`erledigt_bug`), one new dialog endpoint, and one email. Everything else reuses existing plumbing (`lib/mattermost.ts`, `lib/email.ts`, the existing actions handler).

Decisions locked in during brainstorming:
- **Q1 → C:** No database. Ticket state lives in Mattermost via post edits + thread replies.
- **Q2 → A:** An "Erledigt" button on the interactive message, handled by the existing `/api/mattermost/actions` handler (new case), opening a Mattermost dialog for the dev's note.
- **Q3 → recommendation:** Brand-aware email destination (mentolder → `info@mentolder.de`, korczewski → `info@korczewski.de`), reporter email as Reply-To, existing SMTP config via `lib/email.ts`.

## Non-Goals

- No database, no persistent ticket store outside Mattermost.
- No ticket list / dashboard view.
- No reopen action — if something's still open, Dad replies in the Mattermost thread.
- No assignee / priority / due-date fields.
- No rate limiting / CAPTCHA / auth (parity with existing endpoints).
- No automated creation of the `bugs` channel (still deferred from v1).

## Form Changes (`BugReportWidget.svelte`)

Two new required fields plus one changed behavior:

**New: email (required)**
- `<input type="email" id="bug-email" required>`
- Label: "Ihre E-Mail <span class='text-gold'>*</span>"
- Placeholder: "max@example.com"
- Client-side regex validation: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` (same pattern as `/api/contact`)
- Persisted in `$state` and cleared by `resetForm()`.

**New: category (required, default "fehler")**
- `<select id="bug-category" required>` with three options:
  ```
  fehler             → Fehler
  verbesserung       → Verbesserung
  erweiterungswunsch → Erweiterungswunsch
  ```
- Label: "Kategorie <span class='text-gold'>*</span>"
- Default value: `fehler`.

**Changed: `canSubmit` derived**
```typescript
const canSubmit = $derived(
  description.trim().length > 0 &&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
  !submitting &&
  !fileError
);
```

**Changed: success toast shows the ticket ID**
On a 200 response, read `data.ticketId` from the JSON body and render:
```
Vielen Dank! Ihre Meldung wurde als <ticketId> aufgenommen.
```
Auto-close stays at 2 s; no other changes to the success state.

**FormData fields submitted** (in order):
- `description`, `email`, `category`, `url`, `userAgent`, `viewport`, `screenshot?`

## Ticket ID Scheme

Generated server-side inside `POST /api/bug-report`:

```typescript
function generateTicketId(): string {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // 20260414
  const rand = Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0'); // a3f9
  return `BR-${today}-${rand}`;
}
```

- Format: `BR-YYYYMMDD-xxxx` (4 hex chars, 16 bits).
- No DB, no collision check — at realistic volumes (<100/day) the birthday-paradox risk is negligible.
- Returned in the API JSON response as `{ success: true, ticketId: "BR-..." }` so the widget can show it in the toast.

## API Changes (`/api/bug-report.ts`)

### New validation

- `email`: required, non-empty, trimmed, ≤200 chars, matches the email regex. Rejects with 400 "Bitte geben Sie eine gültige E-Mail-Adresse an." (same German string as `/api/contact`).
- `category`: required, must be one of `'fehler' | 'verbesserung' | 'erweiterungswunsch'`. Rejects with 400 "Bitte wählen Sie eine Kategorie."

### New logic

```typescript
const CATEGORY_LABELS: Record<string, string> = {
  fehler: 'Fehler',
  verbesserung: 'Verbesserung',
  erweiterungswunsch: 'Erweiterungswunsch',
};
const CATEGORY_EMOJI: Record<string, string> = {
  fehler: ':red_circle:',
  verbesserung: ':bulb:',
  erweiterungswunsch: ':sparkles:',
};
const BRAND = process.env.BRAND || 'mentolder';
```

### Updated Mattermost post markdown

```
### :bug: {ticketId} · Neuer Bug Report
**Kategorie:** {categoryEmoji} {categoryLabel}
**Status:** 🟡 offen
**Reporter:** {email}
**Marke:** {brand}

| Feld | Inhalt |
|------|--------|
| **URL** | {url} |
| **Browser** | `{userAgent}` |
| **Viewport** | {viewport} |

**Beschreibung:**
> {description with newlines escaped}
```

(If the `bugs` channel is missing and falls back to `anfragen`, the ticket ID line gains a `[BUG] ` prefix.)

### Updated actions on the interactive post

```typescript
actions: [
  { id: 'erledigt_bug', name: 'Erledigt', style: 'primary' },
  { id: 'archive_bug',  name: 'Archivieren', style: 'default' },
],
```

The `erledigt_bug` button is new. `archive_bug` is unchanged.

### Updated context on the interactive post

All context travels on the button → it's echoed back to `/api/mattermost/actions` when clicked. The minimum we need on the Erledigt path:

```typescript
context: {
  ticketId,
  category,
  categoryLabel: CATEGORY_LABELS[category],
  reporterEmail: email,
  description,
  url,
  userAgent,
  viewport,
  brand: BRAND,
}
```

Note: `context.action` is added per-button by `postInteractiveMessage` in `lib/mattermost.ts` (existing code — do not duplicate in the shared context). The handler dispatches on that `action` field to pick `erledigt_bug` vs `archive_bug`.

Post ID comes from Mattermost's webhook payload at click time (not from context), so we don't need to pre-populate it.

## Mattermost Library Changes (`lib/mattermost.ts`)

### New: `openDialog`

```typescript
export async function openDialog(params: {
  triggerId: string;
  url: string;
  dialog: {
    callback_id: string;
    title: string;
    introduction_text?: string;
    elements: Array<{
      display_name: string;
      name: string;
      type: 'text' | 'textarea' | 'select' | 'checkbox';
      optional?: boolean;
      max_length?: number;
      placeholder?: string;
    }>;
    submit_label: string;
    notify_on_cancel?: boolean;
    state?: string;
  };
}): Promise<boolean> {
  if (!MM_TOKEN) {
    console.log('[mattermost] No bot token configured. Would open dialog:', params.dialog.callback_id);
    return false;
  }
  const res = await mmApi('POST', '/actions/dialogs/open', {
    trigger_id: params.triggerId,
    url: params.url,
    dialog: params.dialog,
  });
  if (!res.ok) {
    console.error('[mattermost] openDialog failed:', res.status, await res.text().catch(() => ''));
    return false;
  }
  return true;
}
```

No changes to `updatePost`, `replyToPost`, `postInteractiveMessage` — they already do what's needed.

## Actions Handler (`/api/mattermost/actions.ts`)

### New case: `erledigt_bug`

Triggered when the dev clicks the Erledigt button. Opens a dialog that POSTs the submission back to a new endpoint.

```typescript
case 'erledigt_bug': {
  const triggerId = payload.trigger_id;
  if (!triggerId) {
    return new Response(
      JSON.stringify({ ephemeral_text: 'Dialog konnte nicht geöffnet werden (kein trigger_id).' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Pack context into state so the dialog-submit handler can do the work.
  const state = JSON.stringify({
    postId: post_id,
    channelId: channel_id,
    ticketId: context.ticketId,
    category: context.category,
    categoryLabel: context.categoryLabel,
    reporterEmail: context.reporterEmail,
    description: context.description,
    url: context.url,
    userAgent: context.userAgent,
    viewport: context.viewport,
    brand: context.brand,
  });

  const siteUrl = process.env.SITE_URL || 'http://localhost:4321';

  const opened = await openDialog({
    triggerId,
    url: `${siteUrl}/api/mattermost/dialog-submit`,
    dialog: {
      callback_id: 'erledigt_bug',
      title: `${context.ticketId}: Als erledigt markieren`,
      introduction_text: `**Kategorie:** ${context.categoryLabel}\n**Reporter:** ${context.reporterEmail}`,
      elements: [
        {
          display_name: 'Was hast du gemacht?',
          name: 'note',
          type: 'textarea',
          max_length: 500,
          placeholder: 'Kurze Beschreibung der Lösung...',
        },
      ],
      submit_label: 'Erledigt',
      notify_on_cancel: false,
      state,
    },
  });

  if (!opened) {
    return new Response(
      JSON.stringify({ ephemeral_text: ':warning: Dialog konnte nicht geöffnet werden. Siehe Logs.' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Return 200 with no update — the post stays in its current form
  // until the dialog is submitted.
  return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
```

### New case: `archive_bug`

v1 declared this action on the post but never added a handler case — clicking "Archivieren" on a v1 bug-report post silently falls through the switch. v2 adds the missing case alongside `erledigt_bug`:

```typescript
case 'archive_bug': {
  const ticketId = context.ticketId ?? '(kein Ticket)';
  const reporter = context.reporterEmail ?? 'unbekannt';
  await updatePost(
    post_id,
    `### :file_cabinet: ${ticketId} · Archiviert\n\nReporter: ${reporter}`
  );
  return new Response(
    JSON.stringify({
      update: {
        message: `### :file_cabinet: ${ticketId} · Archiviert\n\nReporter: ${reporter}`,
        props: { attachments: [] },
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}
```

Backwards compatible: if a v1 post (without `ticketId`) is archived, the ticket ID renders as `(kein Ticket)`.

## New Endpoint: `/api/mattermost/dialog-submit.ts`

Receives the dialog submission from Mattermost.

```typescript
import type { APIRoute } from 'astro';
import { updatePost, replyToPost } from '../../../lib/mattermost';
import { sendEmail } from '../../../lib/email';

const BRAND_INBOX: Record<string, string> = {
  mentolder: 'info@mentolder.de',
  korczewski: 'info@korczewski.de',
};
const FALLBACK_INBOX = 'info@mentolder.de';

export const POST: APIRoute = async ({ request }) => {
  try {
    const payload = await request.json();
    const { callback_id, state: stateJson, submission } = payload;

    if (callback_id !== 'erledigt_bug' || !stateJson) {
      return new Response(JSON.stringify({}), { status: 200 });
    }

    const state = JSON.parse(stateJson);
    const note = (submission?.note ?? '').toString().trim();
    if (!note) {
      return new Response(
        JSON.stringify({ errors: { note: 'Bitte beschreiben Sie kurz, was Sie gemacht haben.' } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (note.length > 500) {
      return new Response(
        JSON.stringify({ errors: { note: 'Max. 500 Zeichen.' } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 1. Edit the original post in place
    const now = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
    const escapedNote = note.replace(/\n/g, '\n> ');
    const escapedDescription = state.description.replace(/\n/g, '\n> ');
    const updatedMessage =
      `### :bug: ${state.ticketId} · Neuer Bug Report\n` +
      `**Kategorie:** ${state.categoryLabel}\n` +
      `**Status:** :white_check_mark: erledigt\n` +
      `**Reporter:** ${state.reporterEmail}\n` +
      `**Marke:** ${state.brand}\n\n` +
      `| Feld | Inhalt |\n` +
      `|------|--------|\n` +
      `| **URL** | ${state.url} |\n` +
      `| **Browser** | \`${state.userAgent}\` |\n` +
      `| **Viewport** | ${state.viewport} |\n\n` +
      `**Beschreibung:**\n> ${escapedDescription}\n\n` +
      `---\n` +
      `**Erledigt (${now}):**\n> ${escapedNote}`;

    await updatePost(state.postId, updatedMessage);

    // 2. Send email to brand inbox
    const toInbox = BRAND_INBOX[state.brand] ?? FALLBACK_INBOX;
    const siteUrl = process.env.SITE_URL || '';
    const mmLink = siteUrl ? `${siteUrl.replace(/web\./, 'chat.')}/pl/${state.postId}` : `(siehe Mattermost)`;

    const subject = `[${state.ticketId}] ${state.categoryLabel}: ${state.description.slice(0, 60)}`;
    const text =
      `Ticket ${state.ticketId} wurde als ERLEDIGT markiert.\n\n` +
      `Kategorie:  ${state.categoryLabel}\n` +
      `Reporter:   ${state.reporterEmail}\n` +
      `\n` +
      `Beschreibung:\n` +
      `  ${state.description.replace(/\n/g, '\n  ')}\n` +
      `\n` +
      `Was wurde gemacht:\n` +
      `  ${note.replace(/\n/g, '\n  ')}\n` +
      `\n` +
      `Ursprünglicher Mattermost-Post:\n` +
      `  ${mmLink}\n` +
      `\n` +
      `Falls etwas noch offen ist, antworte im Mattermost-Thread oder\n` +
      `direkt auf diese E-Mail (der Reporter ist auf Reply-To gesetzt).\n`;

    await sendEmail({
      to: toInbox,
      subject,
      text,
      replyTo: state.reporterEmail,
    });

    // 3. Post a thread reply asking for verification
    await replyToPost(
      state.postId,
      state.channelId,
      `:white_check_mark: Als erledigt markiert.\n\n` +
      `Geprüft? Reagiere mit :white_check_mark: oder antworte in diesem Thread, ` +
      `wenn etwas offen geblieben ist.`
    );

    return new Response(JSON.stringify({}), { status: 200 });
  } catch (err) {
    console.error('[dialog-submit] erledigt_bug failed:', err);
    return new Response(
      JSON.stringify({ errors: { note: 'Interner Fehler beim Markieren. Bitte erneut versuchen.' } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
```

Returns `200 {}` on success (Mattermost closes the dialog), or `200 { errors: { <field>: <message> } }` on validation failure (Mattermost shows inline errors). Returns an opaque 200 on server failure to avoid Mattermost spinning on the dialog.

## Email

**Destination:** brand-specific lookup from `BRAND` env var. Fallback to `info@mentolder.de` if the brand isn't in the map. The map is hardcoded in the dialog-submit endpoint (§above).

**From:** existing `FROM_EMAIL` env var + `FROM_NAME` display name (handled by `sendEmail`).

**Reply-To:** the original reporter's email.

**Subject format:** `[BR-20260414-a3f9] Fehler: <first 60 chars of description>`

**Body:** plain text only (no HTML variant needed — internal mailbox, not customer-facing).

**Transport:** `lib/email.ts` → `sendEmail` → nodemailer → existing SMTP config (Mailpit in k3d dev, real SMTP in prod).

## Test Plan

### Unit / integration (`website/tests/api.test.mjs`)

Extend the existing "Bug report form" section with three new tests:

1. `POST /api/bug-report without email returns 400` — adds `description` + `category` but no `email` → 400.
2. `POST /api/bug-report with invalid email returns 400` — `email: 'not-an-email'` → 400.
3. `POST /api/bug-report without category returns 400` — omits `category` → 400.
4. `POST /api/bug-report happy path returns ticketId` — valid fields → expects `{ success: true, ticketId: /^BR-\d{8}-[0-9a-f]{4}$/ }` (tolerant to 500 if MM unreachable, parity with v1).

### Playwright (`tests/e2e/specs/fa-26-bug-report-form.spec.ts`)

Update the existing spec:

1. Adjust all submit tests to also fill `email` and pick a `category` value.
2. Add a new test: "Submit button disabled without valid email" — fill description only, assert submit disabled; fill email; assert enabled.
3. Add a new test: "Success toast shows ticket ID" — submit, assert toast text matches `/BR-\d{8}-[0-9a-f]{4}/`.

### Bash smoke (`tests/local/FA-26.sh`)

No changes — the endpoint still returns 400 on an empty body, which is what T2 asserts.

### Manual verification (Task 10 of the plan)

1. Open `http://web.localhost`, click "Bug melden", submit with email + each category value → verify the ticket ID appears in the toast, and the Mattermost post renders with the correct emoji + "🟡 offen" status.
2. Click "Erledigt" in Mattermost → verify the dialog opens with "Was hast du gemacht?" and the ticket ID in the title.
3. Submit the dialog with a note → verify the post is edited in place (status → "✅ erledigt", note appended), a thread reply appears, and an email lands in Mailpit (`http://mail.localhost`) at `info@mentolder.de` with Reply-To set to the reporter.
4. Click "Archivieren" on a different ticket (not erledigt) → verify the legacy archive path still works.

## Rollout

1. Merge PR #76 (v1) first.
2. Open a new PR for this expansion (v2) on top of `main`.
3. Squash-merge. `task website:redeploy` → ArgoCD sync (or manual redeploy in k3d).
4. Smoke-test per the manual checklist above.

## Files Touched

**Create:**
- `website/src/pages/api/mattermost/dialog-submit.ts`

**Modify:**
- `website/src/components/BugReportWidget.svelte` — email + category fields, ticket-ID toast.
- `website/src/pages/api/bug-report.ts` — ticket-ID generation, email/category validation, new post markdown, new Erledigt action in the context.
- `website/src/lib/mattermost.ts` — new `openDialog` helper.
- `website/src/pages/api/mattermost/actions.ts` — new `erledigt_bug` case.
- `website/tests/api.test.mjs` — 4 new assertions.
- `tests/e2e/specs/fa-26-bug-report-form.spec.ts` — adjusted flows + 2 new tests.

**No changes:**
- No k3d/ or prod/ manifests. All env vars already exist (`BRAND`, `SITE_URL`, `FROM_EMAIL`, `SMTP_*`).
- No new secrets.
- No migrations.

## Open Questions

None — all locked in during brainstorming (Q1 C, Q2 A, Q3 brand-aware with Reply-To).
