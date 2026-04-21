# Newsletter Feature — Design Spec

**Date:** 2026-04-20
**Status:** Approved
**Branch:** feature/newsletter

## Overview

A fully in-house newsletter system integrated into the existing Astro+Svelte admin interface. Supports external subscriber sign-up (Double Opt-in, DSGVO-compliant) and manual admin-managed subscriptions. The admin can compose HTML campaigns, save drafts, reuse past campaigns as templates, and send to all confirmed subscribers. Uses the existing nodemailer/SMTP infrastructure (`email.ts`) and the shared PostgreSQL database.

## Scope

**In scope:**
- External sign-up form (`NewsletterSignup.svelte`) embeddable on public pages
- Double Opt-in flow with 48h confirmation token
- One-click unsubscribe link in every sent email
- Admin subscriber management: view, add (directly confirmed), delete
- Campaign management: create draft, edit HTML body, live preview, send
- Reuse past campaigns as templates
- Per-send log in DB

**Out of scope:**
- Open/click tracking (privacy)
- Scheduled / time-delayed sending
- Bounce processing
- Keycloak-client subscriber import (can be added later)

## Architecture

All new code follows existing project patterns: Astro pages for server-rendered views, Svelte components for interactive UI, direct `pg` pool queries via `website-db.ts`, and `sendEmail()` from `email.ts`.

### New files

```
website/src/
  lib/
    newsletter-db.ts               # DB init, all newsletter queries
  pages/
    admin/newsletter.astro         # Admin page (auth-gated)
    newsletter/
      bestaetigt.astro             # Post-confirm success page
      token-ungueltig.astro        # Expired/invalid token page
    api/
      newsletter/
        subscribe.ts               # POST — public sign-up
        confirm.ts                 # GET  — opt-in confirmation
        unsubscribe.ts             # GET  — one-click unsubscribe
      admin/newsletter/
        subscribers/
          index.ts                 # GET list, POST add
          [id].ts                  # DELETE
        campaigns/
          index.ts                 # GET list, POST create
          [id].ts                  # PUT update
          [id]/send.ts             # POST send to all confirmed
  components/
    NewsletterSignup.svelte        # Public sign-up widget
    admin/NewsletterAdmin.svelte   # Admin tab UI
```

### AdminLayout change

Add to the "Betrieb" nav group in `AdminLayout.astro`:
```ts
{ href: '/admin/newsletter', label: 'Newsletter', icon: 'mail' }
```
The `mail` icon SVG is already defined in `AdminLayout.astro`.

## Database

New tables in the existing `website` PostgreSQL database. `initNewsletterDb()` is called at website startup (same pattern as `initMeetingsDb()`).

### `newsletter_subscribers`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | `gen_random_uuid()` |
| `email` | TEXT UNIQUE NOT NULL | |
| `status` | TEXT NOT NULL | `pending` / `confirmed` / `unsubscribed` |
| `confirm_token` | TEXT | Cleared after confirmation |
| `token_expires_at` | TIMESTAMPTZ | 48h from creation |
| `unsubscribe_token` | TEXT UNIQUE NOT NULL | Stable UUID, never changes |
| `source` | TEXT NOT NULL | `website` or `admin` |
| `confirmed_at` | TIMESTAMPTZ | Set on confirmation |
| `created_at` | TIMESTAMPTZ NOT NULL | `DEFAULT now()` |

### `newsletter_campaigns`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `subject` | TEXT NOT NULL | |
| `html_body` | TEXT NOT NULL | |
| `status` | TEXT NOT NULL | `draft` / `sent` |
| `sent_at` | TIMESTAMPTZ | |
| `recipient_count` | INTEGER | Successful sends only |
| `created_at` | TIMESTAMPTZ NOT NULL | |
| `updated_at` | TIMESTAMPTZ NOT NULL | |

### `newsletter_send_log`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `campaign_id` | UUID NOT NULL | FK → `newsletter_campaigns` |
| `subscriber_id` | UUID NOT NULL | FK → `newsletter_subscribers` |
| `sent_at` | TIMESTAMPTZ NOT NULL | |
| `status` | TEXT NOT NULL | `sent` / `failed` |

## API Routes

### Public (no auth)

**POST `/api/newsletter/subscribe`**
- Body: `{ email: string }`
- Validates email format → 400 on invalid
- If `unsubscribed`: returns 200, no action (DSGVO — no silent re-subscribe)
- If `pending`: generates new token, resends confirmation email
- If `confirmed`: returns 200, no action (no information leak)
- Otherwise: inserts `pending` row, sends confirmation email
- Always returns: `{ ok: true }` (prevents email enumeration)

**GET `/api/newsletter/confirm?token=...`**
- Token not found or expired → redirect `/newsletter/token-ungueltig`
- Already confirmed → redirect `/newsletter/bestaetigt` (idempotent)
- Valid → set `confirmed`, clear token → redirect `/newsletter/bestaetigt`

**GET `/api/newsletter/unsubscribe?token=...`**
- Unknown token → 404
- Sets `status = 'unsubscribed'` → renders inline confirmation message

### Admin (auth + isAdmin)

**GET `/api/admin/newsletter/subscribers`**
Returns all subscribers, ordered by `created_at DESC`.

**POST `/api/admin/newsletter/subscribers`**
Body: `{ email: string }`
Inserts directly as `confirmed`, source `admin`. Conflict on existing email → 409.

**DELETE `/api/admin/newsletter/subscribers/[id]`**
Hard delete.

**GET `/api/admin/newsletter/campaigns`**
Returns all campaigns, ordered by `created_at DESC`.

**POST `/api/admin/newsletter/campaigns`**
Body: `{ subject, html_body }`. Creates as `draft`.

**PUT `/api/admin/newsletter/campaigns/[id]`**
Body: `{ subject?, html_body? }`. Only allowed when `status = 'draft'`.

**POST `/api/admin/newsletter/campaigns/[id]/send`**
- Fetches all `confirmed` subscribers
- If 0 → 400 with message
- For each subscriber: injects personalised unsubscribe link into `html_body`, calls `sendEmail()`
- Logs each result in `newsletter_send_log`
- Updates campaign: `status = 'sent'`, `sent_at`, `recipient_count` (successful sends)

## UI Components

### `NewsletterSignup.svelte` (public)

Single email input + submit button. Three states:
1. **idle** — input + button
2. **success** — "Bitte bestätige deine E-Mail-Adresse."
3. **error** — inline error message (network error or 400)

No "already subscribed" state is surfaced to the user (DSGVO).

### `NewsletterAdmin.svelte` (admin)

Three-tab layout following existing admin patterns (`bg-dark-light`, `border-dark-lighter`, gold accents).

**Tab: Abonnenten**
- Filter bar: Alle | Bestätigt | Ausstehend | Abgemeldet (with counts)
- Table: Email | Status badge | Quelle | Datum | Delete button
- Delete: inline confirmation, calls DELETE API
- "Hinzufügen": expandable inline form, email only, adds as `confirmed`

**Tab: Kampagnen**
- List of past campaigns: Betreff | Status badge | Empfänger | Datum
- "Als Vorlage verwenden" button per row → pre-fills Tab 3 with that campaign's data
- "Neue Kampagne" button → switches to Tab 3 (empty)

**Tab: Neue Kampagne**
- Betreff: text input
- HTML-Body: `<textarea>` (monospace, min-height 300px)
- Live preview: `<iframe srcdoc={htmlBody}>` alongside textarea (split view on wide screens, stacked on mobile)
- Buttons: "Als Draft speichern" | "Senden"
- Send button opens a confirmation dialog: "Senden an X bestätigte Abonnenten?" with Cancel/Confirm

## Double Opt-In Flow

```
User submits email
  → POST /api/newsletter/subscribe
  → DB: status=pending, confirm_token=uuid, token_expires_at=now+48h
  → Email: "Bitte bestätige deine Newsletter-Anmeldung" + link

User clicks confirmation link
  → GET /api/newsletter/confirm?token=<uuid>
  → DB: status=confirmed, confirmed_at=now, confirm_token=null
  → Redirect: /newsletter/bestaetigt
```

## Error Handling

| Scenario | Behaviour |
|---|---|
| Email already `confirmed` | 200, no-op (no info leak) |
| Email already `pending` | Resend confirmation with fresh token |
| Email already `unsubscribed` | 200, no-op |
| Confirm token expired | Redirect `/newsletter/token-ungueltig` |
| Single `sendEmail()` failure during campaign send | Log as `failed`, continue with remaining subscribers |
| Campaign send with 0 confirmed subscribers | 400, shown as error in UI |
| Draft update on already-sent campaign | 403 |
| Empty subject or body on send | Client-side validation, blocked before submit |
