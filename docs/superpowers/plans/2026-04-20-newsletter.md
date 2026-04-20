# Newsletter Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fully in-house newsletter system with Double Opt-in sign-up, admin subscriber/campaign management, HTML campaign editor with live preview, and per-subscriber email sending via existing SMTP/nodemailer infrastructure.

**Architecture:** `newsletter-db.ts` owns all DB access (3 tables, lazy `ensureTable()` pattern from `reminders.ts`). Public API routes handle sign-up/confirm/unsubscribe. Admin API routes (auth-gated) handle CRUD + send. `NewsletterAdmin.svelte` provides a three-tab admin UI. `NewsletterSignup.svelte` is a minimal public sign-up widget.

**Tech Stack:** Astro SSR, Svelte 5, PostgreSQL via `pg` pool, nodemailer (existing `email.ts`), TypeScript

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `website/src/lib/newsletter-db.ts` | Create | DB pool, `ensureTable()`, all CRUD for subscribers/campaigns/send_log |
| `website/src/lib/email.ts` | Modify | Add `sendNewsletterConfirmation`, `sendNewsletterCampaign` |
| `website/src/pages/api/newsletter/subscribe.ts` | Create | Public POST: sign up with Double Opt-in |
| `website/src/pages/api/newsletter/confirm.ts` | Create | Public GET: confirm token → activate subscriber |
| `website/src/pages/api/newsletter/unsubscribe.ts` | Create | Public GET: unsubscribe by stable token |
| `website/src/pages/newsletter/bestaetigt.astro` | Create | Success page after confirmation |
| `website/src/pages/newsletter/token-ungueltig.astro` | Create | Error page for expired/invalid confirm token |
| `website/src/components/NewsletterSignup.svelte` | Create | Public sign-up widget (email input only) |
| `website/src/pages/api/admin/newsletter/subscribers/index.ts` | Create | Admin GET list + POST add |
| `website/src/pages/api/admin/newsletter/subscribers/[id].ts` | Create | Admin DELETE |
| `website/src/pages/api/admin/newsletter/campaigns/index.ts` | Create | Admin GET list + POST create draft |
| `website/src/pages/api/admin/newsletter/campaigns/[id].ts` | Create | Admin PUT update draft |
| `website/src/pages/api/admin/newsletter/campaigns/[id]/send.ts` | Create | Admin POST send campaign |
| `website/src/components/admin/NewsletterAdmin.svelte` | Create | Three-tab admin UI |
| `website/src/pages/admin/newsletter.astro` | Create | Admin page (auth gate + data load) |
| `website/src/layouts/AdminLayout.astro` | Modify | Add Newsletter nav item to "Betrieb" group |

---

## Task 1: DB Layer — newsletter-db.ts

**Files:**
- Create: `website/src/lib/newsletter-db.ts`

- [ ] **Step 1: Create the file with pool, ensureTable, and all exports**

```typescript
// website/src/lib/newsletter-db.ts
import pg from 'pg';
import { resolve4 } from 'dns';

const DB_URL = process.env.SESSIONS_DATABASE_URL
  || 'postgresql://website:devwebsitedb@shared-db.workspace.svc.cluster.local:5432/website';

function nodeLookup(
  hostname: string,
  _opts: unknown,
  cb: (err: Error | null, addr: string, family: number) => void,
) {
  resolve4(hostname, (err, addrs) => cb(err ?? null, addrs?.[0] ?? '', 4));
}

const pool = new pg.Pool(
  { connectionString: DB_URL, lookup: nodeLookup } as unknown as import('pg').PoolConfig
);

let tablesReady = false;
async function ensureTables(): Promise<void> {
  if (tablesReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS newsletter_subscribers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      confirm_token TEXT,
      token_expires_at TIMESTAMPTZ,
      unsubscribe_token TEXT UNIQUE NOT NULL,
      source TEXT NOT NULL DEFAULT 'website',
      confirmed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS newsletter_campaigns (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      subject TEXT NOT NULL,
      html_body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      sent_at TIMESTAMPTZ,
      recipient_count INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS newsletter_send_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      campaign_id UUID NOT NULL REFERENCES newsletter_campaigns(id),
      subscriber_id UUID NOT NULL REFERENCES newsletter_subscribers(id),
      sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      status TEXT NOT NULL
    )
  `);
  tablesReady = true;
}

export interface NewsletterSubscriber {
  id: string;
  email: string;
  status: 'pending' | 'confirmed' | 'unsubscribed';
  source: 'website' | 'admin';
  confirmed_at: Date | null;
  created_at: Date;
}

export interface NewsletterCampaign {
  id: string;
  subject: string;
  html_body: string;
  status: 'draft' | 'sent';
  sent_at: Date | null;
  recipient_count: number | null;
  created_at: Date;
  updated_at: Date;
}

// ── Subscribers ───────────────────────────────────────────────────────────────

export async function listSubscribers(filter?: { status?: string }): Promise<NewsletterSubscriber[]> {
  await ensureTables();
  const values: unknown[] = [];
  let where = '';
  if (filter?.status) {
    values.push(filter.status);
    where = `WHERE status = $1`;
  }
  const result = await pool.query(
    `SELECT id, email, status, source, confirmed_at, created_at
     FROM newsletter_subscribers ${where} ORDER BY created_at DESC`,
    values
  );
  return result.rows;
}

export async function getSubscriberByEmail(email: string): Promise<
  (NewsletterSubscriber & { confirm_token: string | null; token_expires_at: Date | null; unsubscribe_token: string }) | null
> {
  await ensureTables();
  const result = await pool.query(
    `SELECT id, email, status, source, confirmed_at, created_at,
            confirm_token, token_expires_at, unsubscribe_token
     FROM newsletter_subscribers WHERE email = $1`,
    [email]
  );
  return result.rows[0] ?? null;
}

export async function getSubscriberByConfirmToken(token: string): Promise<
  (NewsletterSubscriber & { token_expires_at: Date | null }) | null
> {
  await ensureTables();
  const result = await pool.query(
    `SELECT id, email, status, source, confirmed_at, created_at, token_expires_at
     FROM newsletter_subscribers WHERE confirm_token = $1`,
    [token]
  );
  return result.rows[0] ?? null;
}

export async function createSubscriber(params: {
  email: string;
  status: 'pending' | 'confirmed';
  source: 'website' | 'admin';
  confirmToken?: string;
  tokenExpiresAt?: Date;
  unsubscribeToken: string;
}): Promise<NewsletterSubscriber> {
  await ensureTables();
  const result = await pool.query(
    `INSERT INTO newsletter_subscribers
       (email, status, source, confirm_token, token_expires_at, unsubscribe_token)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, email, status, source, confirmed_at, created_at`,
    [params.email, params.status, params.source,
     params.confirmToken ?? null, params.tokenExpiresAt ?? null, params.unsubscribeToken]
  );
  return result.rows[0];
}

export async function updateSubscriberToken(id: string, token: string, expiresAt: Date): Promise<void> {
  await ensureTables();
  await pool.query(
    `UPDATE newsletter_subscribers SET confirm_token = $1, token_expires_at = $2 WHERE id = $3`,
    [token, expiresAt, id]
  );
}

export async function confirmSubscriber(id: string): Promise<void> {
  await ensureTables();
  await pool.query(
    `UPDATE newsletter_subscribers
     SET status = 'confirmed', confirmed_at = now(), confirm_token = null, token_expires_at = null
     WHERE id = $1`,
    [id]
  );
}

export async function unsubscribeByToken(token: string): Promise<boolean> {
  await ensureTables();
  const result = await pool.query(
    `UPDATE newsletter_subscribers SET status = 'unsubscribed'
     WHERE unsubscribe_token = $1 AND status = 'confirmed'
     RETURNING id`,
    [token]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function deleteSubscriber(id: string): Promise<void> {
  await ensureTables();
  await pool.query(`DELETE FROM newsletter_subscribers WHERE id = $1`, [id]);
}

export async function getConfirmedSubscribers(): Promise<
  (NewsletterSubscriber & { unsubscribe_token: string })[]
> {
  await ensureTables();
  const result = await pool.query(
    `SELECT id, email, status, source, confirmed_at, created_at, unsubscribe_token
     FROM newsletter_subscribers WHERE status = 'confirmed' ORDER BY confirmed_at ASC`
  );
  return result.rows;
}

// ── Campaigns ─────────────────────────────────────────────────────────────────

export async function listCampaigns(): Promise<NewsletterCampaign[]> {
  await ensureTables();
  const result = await pool.query(
    `SELECT id, subject, html_body, status, sent_at, recipient_count, created_at, updated_at
     FROM newsletter_campaigns ORDER BY created_at DESC`
  );
  return result.rows;
}

export async function getCampaign(id: string): Promise<NewsletterCampaign | null> {
  await ensureTables();
  const result = await pool.query(
    `SELECT id, subject, html_body, status, sent_at, recipient_count, created_at, updated_at
     FROM newsletter_campaigns WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function createCampaign(params: { subject: string; html_body: string }): Promise<NewsletterCampaign> {
  await ensureTables();
  const result = await pool.query(
    `INSERT INTO newsletter_campaigns (subject, html_body)
     VALUES ($1, $2)
     RETURNING id, subject, html_body, status, sent_at, recipient_count, created_at, updated_at`,
    [params.subject, params.html_body]
  );
  return result.rows[0];
}

export async function updateCampaign(
  id: string,
  params: { subject?: string; html_body?: string }
): Promise<NewsletterCampaign | null> {
  await ensureTables();
  const sets: string[] = ['updated_at = now()'];
  const values: unknown[] = [];
  if (params.subject !== undefined) {
    values.push(params.subject);
    sets.push(`subject = $${values.length}`);
  }
  if (params.html_body !== undefined) {
    values.push(params.html_body);
    sets.push(`html_body = $${values.length}`);
  }
  values.push(id);
  const result = await pool.query(
    `UPDATE newsletter_campaigns SET ${sets.join(', ')}
     WHERE id = $${values.length} AND status = 'draft'
     RETURNING id, subject, html_body, status, sent_at, recipient_count, created_at, updated_at`,
    values
  );
  return result.rows[0] ?? null;
}

export async function markCampaignSent(id: string, recipientCount: number): Promise<void> {
  await ensureTables();
  await pool.query(
    `UPDATE newsletter_campaigns
     SET status = 'sent', sent_at = now(), recipient_count = $1, updated_at = now()
     WHERE id = $2`,
    [recipientCount, id]
  );
}

// ── Send log ──────────────────────────────────────────────────────────────────

export async function createSendLog(params: {
  campaignId: string;
  subscriberId: string;
  status: 'sent' | 'failed';
}): Promise<void> {
  await ensureTables();
  await pool.query(
    `INSERT INTO newsletter_send_log (campaign_id, subscriber_id, status)
     VALUES ($1, $2, $3)`,
    [params.campaignId, params.subscriberId, params.status]
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd website && npx tsc --noEmit 2>&1 | grep newsletter
```

Expected: no output (no errors).

- [ ] **Step 3: Verify tables are created (requires running cluster)**

```bash
task workspace:psql -- website
```

Then in psql:
```sql
\dt newsletter_*
```

Expected: three tables listed after any first request triggers `ensureTables()`. If cluster not available, skip — tables will be created on first API call.

- [ ] **Step 4: Commit**

```bash
git add website/src/lib/newsletter-db.ts
git commit -m "feat(newsletter): add DB layer with subscriber/campaign/send_log tables"
```

---

## Task 2: Email helpers

**Files:**
- Modify: `website/src/lib/email.ts`

- [ ] **Step 1: Add two new exported functions at the end of `email.ts`**

```typescript
export async function sendNewsletterConfirmation(
  email: string,
  confirmUrl: string,
): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: `Bitte bestätige deine Newsletter-Anmeldung bei ${FROM_NAME}`,
    text: `Hallo,

du hast dich für den Newsletter von ${FROM_NAME} angemeldet.

Bitte bestätige deine E-Mail-Adresse innerhalb von 48 Stunden:
${confirmUrl}

Falls du dich nicht angemeldet hast, kannst du diese E-Mail ignorieren.

Mit freundlichen Grüßen
${FROM_NAME}`,
    html: `<p>Hallo,</p>
<p>du hast dich für den Newsletter von <strong>${FROM_NAME}</strong> angemeldet.</p>
<p>Bitte bestätige deine E-Mail-Adresse innerhalb von 48 Stunden:</p>
<p><a href="${confirmUrl}" style="display:inline-block;padding:10px 20px;background:#b8973a;color:#fff;text-decoration:none;border-radius:6px;">E-Mail bestätigen</a></p>
<p style="font-size:12px;color:#888;">Oder kopiere diesen Link: ${confirmUrl}</p>
<p>Falls du dich nicht angemeldet hast, kannst du diese E-Mail ignorieren.</p>
<p>Mit freundlichen Grüßen<br>${FROM_NAME}</p>`,
  });
}

export async function sendNewsletterCampaign(params: {
  to: string;
  subject: string;
  html: string;
  unsubscribeUrl: string;
}): Promise<boolean> {
  const footerHtml = `
<hr style="margin:32px 0;border:none;border-top:1px solid #333;">
<p style="font-size:12px;color:#888;">
  Du erhältst diese E-Mail, weil du den Newsletter von ${FROM_NAME} abonniert hast.
  <a href="${params.unsubscribeUrl}" style="color:#888;">Abmelden</a>
</p>`;
  const footerText = `\n\n---\nDu erhältst diese E-Mail, weil du den Newsletter von ${FROM_NAME} abonniert hast.\nAbmelden: ${params.unsubscribeUrl}`;
  const htmlWithFooter = params.html + footerHtml;
  const textWithFooter = params.html.replace(/<[^>]+>/g, '') + footerText;
  return sendEmail({
    to: params.to,
    subject: params.subject,
    text: textWithFooter,
    html: htmlWithFooter,
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd website && npx tsc --noEmit 2>&1 | grep email
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add website/src/lib/email.ts
git commit -m "feat(newsletter): add newsletter confirmation and campaign email helpers"
```

---

## Task 3: Public subscribe endpoint

**Files:**
- Create: `website/src/pages/api/newsletter/subscribe.ts`

- [ ] **Step 1: Create the file**

```typescript
// website/src/pages/api/newsletter/subscribe.ts
import type { APIRoute } from 'astro';
import { randomUUID } from 'crypto';
import {
  getSubscriberByEmail,
  createSubscriber,
  updateSubscriberToken,
} from '../../../lib/newsletter-db';
import { sendNewsletterConfirmation } from '../../../lib/email';

function isValidEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

export const POST: APIRoute = async ({ request }) => {
  let email: string;
  try {
    const body = await request.json();
    email = String(body.email ?? '').trim().toLowerCase();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!isValidEmail(email)) {
    return new Response(JSON.stringify({ ok: false, error: 'Ungültige E-Mail-Adresse' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const prodDomain = process.env.PROD_DOMAIN || '';
  const baseUrl = prodDomain ? `https://web.${prodDomain}` : 'http://web.localhost';

  const existing = await getSubscriberByEmail(email);

  // confirmed or unsubscribed: no-op, no info leak
  if (existing?.status === 'confirmed' || existing?.status === 'unsubscribed') {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const confirmUrl = `${baseUrl}/api/newsletter/confirm?token=${token}`;

  if (existing?.status === 'pending') {
    await updateSubscriberToken(existing.id, token, expiresAt);
  } else {
    await createSubscriber({
      email,
      status: 'pending',
      source: 'website',
      confirmToken: token,
      tokenExpiresAt: expiresAt,
      unsubscribeToken: randomUUID(),
    });
  }

  await sendNewsletterConfirmation(email, confirmUrl);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
```

- [ ] **Step 2: Test valid sign-up (requires running cluster)**

```bash
curl -s -X POST http://web.localhost/api/newsletter/subscribe \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com"}' | jq
```

Expected: `{"ok":true}`

Check Mailpit at `http://mail.localhost` — a confirmation email should appear.

- [ ] **Step 3: Test invalid email**

```bash
curl -s -X POST http://web.localhost/api/newsletter/subscribe \
  -H 'Content-Type: application/json' \
  -d '{"email":"notanemail"}' | jq
```

Expected: `{"ok":false,"error":"Ungültige E-Mail-Adresse"}` with status 400.

- [ ] **Step 4: Commit**

```bash
git add website/src/pages/api/newsletter/subscribe.ts
git commit -m "feat(newsletter): add public subscribe endpoint with double opt-in"
```

---

## Task 4: Public confirm endpoint

**Files:**
- Create: `website/src/pages/api/newsletter/confirm.ts`

- [ ] **Step 1: Create the file**

```typescript
// website/src/pages/api/newsletter/confirm.ts
import type { APIRoute } from 'astro';
import { getSubscriberByConfirmToken, confirmSubscriber } from '../../../lib/newsletter-db';

export const GET: APIRoute = async ({ url, redirect }) => {
  const token = url.searchParams.get('token') ?? '';
  if (!token) return redirect('/newsletter/token-ungueltig');

  const subscriber = await getSubscriberByConfirmToken(token);
  if (!subscriber) return redirect('/newsletter/token-ungueltig');

  if (subscriber.status === 'confirmed') return redirect('/newsletter/bestaetigt');

  if (subscriber.token_expires_at && subscriber.token_expires_at < new Date()) {
    return redirect('/newsletter/token-ungueltig');
  }

  await confirmSubscriber(subscriber.id);
  return redirect('/newsletter/bestaetigt');
};
```

- [ ] **Step 2: Test with a valid token (get token from DB or Mailpit link)**

```bash
# Get the token from the confirmation email link in Mailpit,
# then test:
curl -v "http://web.localhost/api/newsletter/confirm?token=<token-from-mailpit>"
```

Expected: HTTP 302 redirect to `/newsletter/bestaetigt`.

- [ ] **Step 3: Test with an invalid token**

```bash
curl -v "http://web.localhost/api/newsletter/confirm?token=00000000-0000-0000-0000-000000000000"
```

Expected: HTTP 302 redirect to `/newsletter/token-ungueltig`.

- [ ] **Step 4: Commit**

```bash
git add website/src/pages/api/newsletter/confirm.ts
git commit -m "feat(newsletter): add double opt-in confirm endpoint"
```

---

## Task 5: Public unsubscribe endpoint

**Files:**
- Create: `website/src/pages/api/newsletter/unsubscribe.ts`

- [ ] **Step 1: Create the file**

```typescript
// website/src/pages/api/newsletter/unsubscribe.ts
import type { APIRoute } from 'astro';
import { unsubscribeByToken } from '../../../lib/newsletter-db';

export const GET: APIRoute = async ({ url }) => {
  const token = url.searchParams.get('token') ?? '';
  if (!token) {
    return new Response('Ungültiger Abmeldelink.', {
      status: 400,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const success = await unsubscribeByToken(token);

  return new Response(
    success
      ? 'Du wurdest erfolgreich vom Newsletter abgemeldet.'
      : 'Ungültiger oder bereits verarbeiteter Abmeldelink.',
    {
      status: success ? 200 : 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    }
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add website/src/pages/api/newsletter/unsubscribe.ts
git commit -m "feat(newsletter): add public unsubscribe endpoint"
```

---

## Task 6: Public result pages

**Files:**
- Create: `website/src/pages/newsletter/bestaetigt.astro`
- Create: `website/src/pages/newsletter/token-ungueltig.astro`

- [ ] **Step 1: Create `bestaetigt.astro`**

```astro
---
// website/src/pages/newsletter/bestaetigt.astro
import Layout from '../../layouts/Layout.astro';
---

<Layout title="Newsletter bestätigt">
  <section class="pt-24 pb-20 min-h-screen">
    <div class="max-w-lg mx-auto px-6 text-center">
      <div class="text-5xl mb-6">✓</div>
      <h1 class="text-3xl font-bold text-light font-serif mb-4">Anmeldung bestätigt</h1>
      <p class="text-muted mb-8">
        Deine E-Mail-Adresse wurde bestätigt. Du erhältst ab sofort unsere Newsletter-Ausgaben.
      </p>
      <a href="/" class="inline-block px-6 py-2 bg-gold text-dark rounded-lg font-semibold hover:bg-gold/80 transition-colors">
        Zur Startseite
      </a>
    </div>
  </section>
</Layout>
```

- [ ] **Step 2: Create `token-ungueltig.astro`**

```astro
---
// website/src/pages/newsletter/token-ungueltig.astro
import Layout from '../../layouts/Layout.astro';
---

<Layout title="Link abgelaufen">
  <section class="pt-24 pb-20 min-h-screen">
    <div class="max-w-lg mx-auto px-6 text-center">
      <div class="text-5xl mb-6">⚠</div>
      <h1 class="text-3xl font-bold text-light font-serif mb-4">Link ungültig oder abgelaufen</h1>
      <p class="text-muted mb-8">
        Dieser Bestätigungslink ist nicht mehr gültig. Links laufen nach 48 Stunden ab.
        Trage dich einfach erneut ein — du erhältst dann einen neuen Bestätigungslink.
      </p>
      <a href="/" class="inline-block px-6 py-2 bg-gold text-dark rounded-lg font-semibold hover:bg-gold/80 transition-colors">
        Zur Startseite
      </a>
    </div>
  </section>
</Layout>
```

- [ ] **Step 3: Commit**

```bash
git add website/src/pages/newsletter/
git commit -m "feat(newsletter): add confirmation and error result pages"
```

---

## Task 7: Public sign-up widget

**Files:**
- Create: `website/src/components/NewsletterSignup.svelte`

- [ ] **Step 1: Create the component**

```svelte
<!-- website/src/components/NewsletterSignup.svelte -->
<script lang="ts">
  let email = $state('');
  let status: 'idle' | 'loading' | 'success' | 'error' = $state('idle');
  let errorMsg = $state('');

  async function submit(e: Event) {
    e.preventDefault();
    if (status === 'loading') return;
    status = 'loading';
    errorMsg = '';
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        status = 'success';
      } else {
        errorMsg = data.error ?? 'Ein Fehler ist aufgetreten.';
        status = 'error';
      }
    } catch {
      errorMsg = 'Verbindungsfehler. Bitte versuche es erneut.';
      status = 'error';
    }
  }
</script>

{#if status === 'success'}
  <p class="text-sm text-green-400">
    Bitte bestätige deine E-Mail-Adresse — wir haben dir einen Link geschickt.
  </p>
{:else}
  <form onsubmit={submit} class="flex gap-2 flex-wrap">
    <input
      type="email"
      bind:value={email}
      required
      placeholder="deine@email.de"
      disabled={status === 'loading'}
      class="flex-1 min-w-0 bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm placeholder:text-muted focus:border-gold focus:ring-1 focus:ring-gold/20 outline-none disabled:opacity-50"
    />
    <button
      type="submit"
      disabled={status === 'loading'}
      class="px-4 py-2 bg-gold text-dark rounded-lg text-sm font-semibold hover:bg-gold/80 transition-colors disabled:opacity-50"
    >
      {status === 'loading' ? '…' : 'Anmelden'}
    </button>
  </form>
  {#if status === 'error'}
    <p class="text-sm text-red-400 mt-2">{errorMsg}</p>
  {/if}
{/if}
```

- [ ] **Step 2: Verify it renders — add temporarily to any existing public page and check in browser**

Open e.g. `pages/kontakt.astro`, add `<NewsletterSignup client:load />` at the bottom of the page body, run `task website:dev`, open `http://web.localhost/kontakt`, and verify the widget renders. Remove the temporary addition after verifying.

- [ ] **Step 3: Commit**

```bash
git add website/src/components/NewsletterSignup.svelte
git commit -m "feat(newsletter): add public sign-up widget component"
```

---

## Task 8: Admin subscribers API

**Files:**
- Create: `website/src/pages/api/admin/newsletter/subscribers/index.ts`
- Create: `website/src/pages/api/admin/newsletter/subscribers/[id].ts`

- [ ] **Step 1: Create `subscribers/index.ts`**

```typescript
// website/src/pages/api/admin/newsletter/subscribers/index.ts
import type { APIRoute } from 'astro';
import { randomUUID } from 'crypto';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { listSubscribers, createSubscriber, getSubscriberByEmail } from '../../../../../lib/newsletter-db';

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  const status = url.searchParams.get('status') ?? undefined;
  const subscribers = await listSubscribers(status ? { status } : undefined);
  return new Response(JSON.stringify(subscribers), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  let email: string;
  try {
    const body = await request.json();
    email = String(body.email ?? '').trim().toLowerCase();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Response(JSON.stringify({ error: 'Ungültige E-Mail-Adresse' }), { status: 400 });
  }
  const existing = await getSubscriberByEmail(email);
  if (existing) {
    return new Response(JSON.stringify({ error: 'E-Mail bereits vorhanden' }), { status: 409 });
  }
  const subscriber = await createSubscriber({
    email,
    status: 'confirmed',
    source: 'admin',
    unsubscribeToken: randomUUID(),
  });
  return new Response(JSON.stringify(subscriber), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
};
```

- [ ] **Step 2: Create `subscribers/[id].ts`**

```typescript
// website/src/pages/api/admin/newsletter/subscribers/[id].ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { deleteSubscriber } from '../../../../../lib/newsletter-db';

export const DELETE: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  const { id } = params;
  if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 });
  await deleteSubscriber(id);
  return new Response(null, { status: 204 });
};
```

- [ ] **Step 3: Commit**

```bash
git add website/src/pages/api/admin/newsletter/subscribers/
git commit -m "feat(newsletter): add admin subscriber API endpoints"
```

---

## Task 9: Admin campaigns API

**Files:**
- Create: `website/src/pages/api/admin/newsletter/campaigns/index.ts`
- Create: `website/src/pages/api/admin/newsletter/campaigns/[id].ts`
- Create: `website/src/pages/api/admin/newsletter/campaigns/[id]/send.ts`

- [ ] **Step 1: Create `campaigns/index.ts`**

```typescript
// website/src/pages/api/admin/newsletter/campaigns/index.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { listCampaigns, createCampaign } from '../../../../../lib/newsletter-db';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  const campaigns = await listCampaigns();
  return new Response(JSON.stringify(campaigns), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  let subject: string, html_body: string;
  try {
    const body = await request.json();
    subject = String(body.subject ?? '').trim();
    html_body = String(body.html_body ?? '').trim();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }
  if (!subject || !html_body) {
    return new Response(JSON.stringify({ error: 'Betreff und Inhalt sind erforderlich' }), { status: 400 });
  }
  const campaign = await createCampaign({ subject, html_body });
  return new Response(JSON.stringify(campaign), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
};
```

- [ ] **Step 2: Create `campaigns/[id].ts`**

```typescript
// website/src/pages/api/admin/newsletter/campaigns/[id].ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { updateCampaign } from '../../../../../lib/newsletter-db';

export const PUT: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  const { id } = params;
  if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 });
  let body: { subject?: string; html_body?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }
  const updated = await updateCampaign(id, body);
  if (!updated) {
    return new Response(JSON.stringify({ error: 'Kampagne nicht gefunden oder bereits versendet' }), { status: 403 });
  }
  return new Response(JSON.stringify(updated), {
    headers: { 'Content-Type': 'application/json' },
  });
};
```

- [ ] **Step 3: Create `campaigns/[id]/send.ts`**

```typescript
// website/src/pages/api/admin/newsletter/campaigns/[id]/send.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import {
  getCampaign,
  getConfirmedSubscribers,
  markCampaignSent,
  createSendLog,
} from '../../../../../../lib/newsletter-db';
import { sendNewsletterCampaign } from '../../../../../../lib/email';

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  const { id } = params;
  if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 });

  const campaign = await getCampaign(id);
  if (!campaign) {
    return new Response(JSON.stringify({ error: 'Kampagne nicht gefunden' }), { status: 404 });
  }
  if (campaign.status === 'sent') {
    return new Response(JSON.stringify({ error: 'Kampagne wurde bereits versendet' }), { status: 409 });
  }

  const subscribers = await getConfirmedSubscribers();
  if (subscribers.length === 0) {
    return new Response(JSON.stringify({ error: 'Keine bestätigten Abonnenten vorhanden' }), { status: 400 });
  }

  const prodDomain = process.env.PROD_DOMAIN || '';
  const baseUrl = prodDomain ? `https://web.${prodDomain}` : 'http://web.localhost';

  let sent = 0;
  for (const sub of subscribers) {
    const unsubscribeUrl = `${baseUrl}/api/newsletter/unsubscribe?token=${sub.unsubscribe_token}`;
    const ok = await sendNewsletterCampaign({
      to: sub.email,
      subject: campaign.subject,
      html: campaign.html_body,
      unsubscribeUrl,
    });
    await createSendLog({
      campaignId: id,
      subscriberId: sub.id,
      status: ok ? 'sent' : 'failed',
    });
    if (ok) sent++;
  }

  await markCampaignSent(id, sent);

  return new Response(JSON.stringify({ ok: true, sent, total: subscribers.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
```

- [ ] **Step 4: Commit**

```bash
git add website/src/pages/api/admin/newsletter/campaigns/
git commit -m "feat(newsletter): add admin campaign API endpoints including send"
```

---

## Task 10: Admin UI component

**Files:**
- Create: `website/src/components/admin/NewsletterAdmin.svelte`

- [ ] **Step 1: Create the component**

```svelte
<!-- website/src/components/admin/NewsletterAdmin.svelte -->
<script lang="ts">
  type Subscriber = {
    id: string;
    email: string;
    status: 'pending' | 'confirmed' | 'unsubscribed';
    source: 'website' | 'admin';
    confirmed_at: string | null;
    created_at: string;
  };

  type Campaign = {
    id: string;
    subject: string;
    html_body: string;
    status: 'draft' | 'sent';
    sent_at: string | null;
    recipient_count: number | null;
    created_at: string;
  };

  let activeTab: 'subscribers' | 'campaigns' | 'compose' = $state('subscribers');

  // ── Subscribers ──────────────────────────────────────────────────────────────
  let subscribers: Subscriber[] = $state([]);
  let subFilter: string = $state('all');
  let subLoading = $state(true);
  let subError = $state('');
  let addEmail = $state('');
  let addError = $state('');
  let addSuccess = $state('');
  let showAddForm = $state(false);
  let deleteConfirm: string | null = $state(null);

  async function loadSubscribers() {
    subLoading = true;
    subError = '';
    try {
      const url = subFilter === 'all'
        ? '/api/admin/newsletter/subscribers'
        : `/api/admin/newsletter/subscribers?status=${subFilter}`;
      const res = await fetch(url);
      subscribers = res.ok ? await res.json() : [];
      if (!res.ok) subError = 'Fehler beim Laden.';
    } catch {
      subError = 'Verbindungsfehler.';
    } finally {
      subLoading = false;
    }
  }

  async function addSubscriber(e: Event) {
    e.preventDefault();
    addError = ''; addSuccess = '';
    const res = await fetch('/api/admin/newsletter/subscribers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: addEmail }),
    });
    const data = await res.json();
    if (res.ok) {
      addSuccess = 'Abonnent hinzugefügt.';
      addEmail = '';
      showAddForm = false;
      await loadSubscribers();
    } else {
      addError = data.error ?? 'Fehler.';
    }
  }

  async function deleteSubscriber(id: string) {
    const res = await fetch(`/api/admin/newsletter/subscribers/${id}`, { method: 'DELETE' });
    if (res.ok) {
      deleteConfirm = null;
      await loadSubscribers();
    }
  }

  $effect(() => {
    if (activeTab === 'subscribers') loadSubscribers();
    // subFilter is read inside loadSubscribers(), so Svelte 5 tracks it
    // automatically — no second effect needed.
  });

  // ── Campaigns ─────────────────────────────────────────────────────────────────
  let campaigns: Campaign[] = $state([]);
  let campLoading = $state(true);
  let campError = $state('');

  async function loadCampaigns() {
    campLoading = true; campError = '';
    try {
      const res = await fetch('/api/admin/newsletter/campaigns');
      campaigns = res.ok ? await res.json() : [];
      if (!res.ok) campError = 'Fehler beim Laden.';
    } catch {
      campError = 'Verbindungsfehler.';
    } finally {
      campLoading = false;
    }
  }

  $effect(() => {
    if (activeTab === 'campaigns') loadCampaigns();
  });

  function useAsTemplate(c: Campaign) {
    composeSubject = c.subject;
    composeHtml = c.html_body;
    composeDraftId = null;
    activeTab = 'compose';
  }

  // ── Compose ───────────────────────────────────────────────────────────────────
  let composeSubject = $state('');
  let composeHtml = $state('');
  let composeDraftId: string | null = $state(null);
  let composeMsg = $state('');
  let composeSaving = $state(false);
  let showSendConfirm = $state(false);
  let confirmedCount = $state(0);
  let sending = $state(false);

  async function saveDraft() {
    if (!composeSubject.trim() || !composeHtml.trim()) {
      composeMsg = 'Betreff und Inhalt sind erforderlich.'; return;
    }
    composeSaving = true; composeMsg = '';
    try {
      let res: Response;
      if (composeDraftId) {
        res = await fetch(`/api/admin/newsletter/campaigns/${composeDraftId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subject: composeSubject, html_body: composeHtml }),
        });
      } else {
        res = await fetch('/api/admin/newsletter/campaigns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subject: composeSubject, html_body: composeHtml }),
        });
      }
      const data = await res.json();
      if (res.ok) {
        composeDraftId = data.id;
        composeMsg = 'Draft gespeichert.';
      } else {
        composeMsg = data.error ?? 'Fehler beim Speichern.';
      }
    } finally {
      composeSaving = false;
    }
  }

  async function openSendConfirm() {
    if (!composeSubject.trim() || !composeHtml.trim()) {
      composeMsg = 'Betreff und Inhalt sind erforderlich.'; return;
    }
    await saveDraft();
    if (!composeDraftId) return;
    // get confirmed count
    const res = await fetch('/api/admin/newsletter/subscribers?status=confirmed');
    const subs = res.ok ? await res.json() : [];
    confirmedCount = subs.length;
    showSendConfirm = true;
  }

  async function sendCampaign() {
    if (!composeDraftId) return;
    sending = true; showSendConfirm = false;
    const res = await fetch(`/api/admin/newsletter/campaigns/${composeDraftId}/send`, { method: 'POST' });
    const data = await res.json();
    sending = false;
    if (res.ok) {
      composeMsg = `Versendet an ${data.sent} von ${data.total} Abonnenten.`;
      composeSubject = ''; composeHtml = ''; composeDraftId = null;
      activeTab = 'campaigns';
      await loadCampaigns();
    } else {
      composeMsg = data.error ?? 'Fehler beim Versenden.';
    }
  }

  // helpers
  function statusBadge(s: string): string {
    if (s === 'confirmed') return 'bg-green-500/10 text-green-400 border-green-500/20';
    if (s === 'pending')   return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
    if (s === 'sent')      return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    return 'bg-dark-lighter text-muted border-dark-lighter';
  }

  function fmtDate(d: string | null): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' });
  }
</script>

<!-- Tab bar -->
<div class="flex gap-1 mb-6 border-b border-dark-lighter">
  {#each [['subscribers','Abonnenten'],['campaigns','Kampagnen'],['compose','Neue Kampagne']] as [tab, label]}
    <button
      onclick={() => activeTab = tab as typeof activeTab}
      class={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${activeTab === tab ? 'text-gold border-b-2 border-gold -mb-px bg-dark-light' : 'text-muted hover:text-light'}`}
    >{label}</button>
  {/each}
</div>

<!-- ── Subscribers tab ── -->
{#if activeTab === 'subscribers'}
  <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
    <div class="flex gap-1">
      {#each [['all','Alle'],['confirmed','Bestätigt'],['pending','Ausstehend'],['unsubscribed','Abgemeldet']] as [val, lbl]}
        <button
          onclick={() => { subFilter = val; }}
          class={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${subFilter === val ? 'bg-gold/20 text-gold' : 'bg-dark-lighter text-muted hover:text-light'}`}
        >{lbl}</button>
      {/each}
    </div>
    <button onclick={() => showAddForm = !showAddForm} class="px-3 py-1.5 bg-gold text-dark rounded-lg text-xs font-semibold hover:bg-gold/80">
      + Hinzufügen
    </button>
  </div>

  {#if showAddForm}
    <form onsubmit={addSubscriber} class="mb-4 flex gap-2 p-4 bg-dark-light rounded-xl border border-gold/20">
      <input
        type="email" bind:value={addEmail} required placeholder="email@beispiel.de"
        class="flex-1 bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm focus:border-gold outline-none"
      />
      <button type="submit" class="px-4 py-2 bg-gold text-dark rounded-lg text-sm font-semibold hover:bg-gold/80">Hinzufügen</button>
    </form>
    {#if addError}<p class="text-red-400 text-sm mb-2">{addError}</p>{/if}
    {#if addSuccess}<p class="text-green-400 text-sm mb-2">{addSuccess}</p>{/if}
  {/if}

  {#if subLoading}
    <p class="text-muted text-sm">Lade…</p>
  {:else if subError}
    <p class="text-red-400 text-sm">{subError}</p>
  {:else if subscribers.length === 0}
    <p class="text-muted text-sm">Keine Abonnenten gefunden.</p>
  {:else}
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-muted text-xs border-b border-dark-lighter">
            <th class="pb-2 font-medium">E-Mail</th>
            <th class="pb-2 font-medium">Status</th>
            <th class="pb-2 font-medium">Quelle</th>
            <th class="pb-2 font-medium">Datum</th>
            <th class="pb-2"></th>
          </tr>
        </thead>
        <tbody>
          {#each subscribers as sub}
            <tr class="border-b border-dark-lighter/50 hover:bg-dark-light/30">
              <td class="py-2.5 text-light">{sub.email}</td>
              <td class="py-2.5">
                <span class={`px-2 py-0.5 rounded border text-xs ${statusBadge(sub.status)}`}>{sub.status}</span>
              </td>
              <td class="py-2.5 text-muted">{sub.source}</td>
              <td class="py-2.5 text-muted">{fmtDate(sub.created_at)}</td>
              <td class="py-2.5 text-right">
                {#if deleteConfirm === sub.id}
                  <span class="text-xs text-muted mr-2">Sicher?</span>
                  <button onclick={() => deleteSubscriber(sub.id)} class="text-xs text-red-400 hover:text-red-300 mr-1">Ja</button>
                  <button onclick={() => deleteConfirm = null} class="text-xs text-muted hover:text-light">Nein</button>
                {:else}
                  <button onclick={() => deleteConfirm = sub.id} class="text-xs text-muted hover:text-red-400 transition-colors">Löschen</button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

<!-- ── Campaigns tab ── -->
{:else if activeTab === 'campaigns'}
  <div class="flex justify-between items-center mb-4">
    <p class="text-muted text-sm">{campaigns.length} Kampagne{campaigns.length !== 1 ? 'n' : ''}</p>
    <button onclick={() => { composeSubject=''; composeHtml=''; composeDraftId=null; activeTab='compose'; }}
      class="px-3 py-1.5 bg-gold text-dark rounded-lg text-xs font-semibold hover:bg-gold/80">
      + Neue Kampagne
    </button>
  </div>

  {#if campLoading}
    <p class="text-muted text-sm">Lade…</p>
  {:else if campError}
    <p class="text-red-400 text-sm">{campError}</p>
  {:else if campaigns.length === 0}
    <p class="text-muted text-sm">Noch keine Kampagnen.</p>
  {:else}
    <div class="flex flex-col gap-2">
      {#each campaigns as c}
        <div class="p-4 bg-dark-light rounded-xl border border-dark-lighter flex items-center justify-between gap-4">
          <div class="flex-1 min-w-0">
            <p class="text-light font-medium truncate">{c.subject}</p>
            <p class="text-muted text-xs mt-0.5">{fmtDate(c.sent_at ?? c.created_at)} · {c.recipient_count != null ? `${c.recipient_count} Empfänger` : 'Draft'}</p>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            <span class={`px-2 py-0.5 rounded border text-xs ${statusBadge(c.status)}`}>{c.status}</span>
            <button onclick={() => useAsTemplate(c)} class="text-xs text-muted hover:text-gold transition-colors">Als Vorlage</button>
          </div>
        </div>
      {/each}
    </div>
  {/if}

<!-- ── Compose tab ── -->
{:else if activeTab === 'compose'}
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <div class="flex flex-col gap-4">
      <div>
        <label class="block text-sm text-muted mb-1">Betreff *</label>
        <input
          type="text" bind:value={composeSubject} placeholder="Betreff der E-Mail"
          class="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm focus:border-gold focus:ring-1 focus:ring-gold/20 outline-none"
        />
      </div>
      <div class="flex flex-col flex-1">
        <label class="block text-sm text-muted mb-1">HTML-Inhalt *</label>
        <textarea
          bind:value={composeHtml}
          placeholder="<h1>Hallo!</h1><p>Dein Newsletter-Inhalt hier.</p>"
          rows="20"
          class="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm font-mono focus:border-gold focus:ring-1 focus:ring-gold/20 outline-none resize-y"
        ></textarea>
      </div>
      {#if composeMsg}
        <p class={`text-sm ${composeMsg.includes('Fehler') || composeMsg.includes('erforderlich') ? 'text-red-400' : 'text-green-400'}`}>{composeMsg}</p>
      {/if}
      <div class="flex gap-3">
        <button onclick={saveDraft} disabled={composeSaving} class="px-4 py-2 bg-dark-lighter text-light rounded-lg text-sm font-medium hover:bg-dark-light transition-colors disabled:opacity-50">
          {composeSaving ? 'Speichere…' : 'Als Draft speichern'}
        </button>
        <button onclick={openSendConfirm} disabled={sending} class="px-4 py-2 bg-gold text-dark rounded-lg text-sm font-semibold hover:bg-gold/80 transition-colors disabled:opacity-50">
          {sending ? 'Sende…' : 'Senden'}
        </button>
      </div>
    </div>
    <div>
      <p class="text-sm text-muted mb-1">Vorschau</p>
      <iframe
        srcdoc={composeHtml || '<p style="color:#666;font-family:sans-serif;padding:20px;">Vorschau erscheint hier…</p>'}
        title="E-Mail Vorschau"
        class="w-full h-[500px] rounded-xl border border-dark-lighter bg-white"
      ></iframe>
    </div>
  </div>
{/if}

<!-- Send confirm dialog -->
{#if showSendConfirm}
  <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
    <div class="bg-dark-light rounded-2xl border border-dark-lighter p-6 max-w-sm w-full">
      <h3 class="text-lg font-semibold text-light mb-2">Kampagne versenden?</h3>
      <p class="text-muted text-sm mb-6">
        Diese Kampagne wird an <strong class="text-light">{confirmedCount} bestätigte{confirmedCount !== 1 ? 'n' : ''} Abonnent{confirmedCount !== 1 ? 'en' : ''}</strong> versendet. Diese Aktion kann nicht rückgängig gemacht werden.
      </p>
      <div class="flex gap-3 justify-end">
        <button onclick={() => showSendConfirm = false} class="px-4 py-2 bg-dark-lighter text-light rounded-lg text-sm hover:bg-dark-light/80">Abbrechen</button>
        <button onclick={sendCampaign} class="px-4 py-2 bg-gold text-dark rounded-lg text-sm font-semibold hover:bg-gold/80">Jetzt senden</button>
      </div>
    </div>
  </div>
{/if}
```

- [ ] **Step 2: Commit**

```bash
git add website/src/components/admin/NewsletterAdmin.svelte
git commit -m "feat(newsletter): add three-tab NewsletterAdmin Svelte component"
```

---

## Task 11: Admin page + sidebar nav

**Files:**
- Create: `website/src/pages/admin/newsletter.astro`
- Modify: `website/src/layouts/AdminLayout.astro`

- [ ] **Step 1: Create `newsletter.astro`**

```astro
---
// website/src/pages/admin/newsletter.astro
import AdminLayout from '../../layouts/AdminLayout.astro';
import { getSession, getLoginUrl, isAdmin } from '../../lib/auth';
import NewsletterAdmin from '../../components/admin/NewsletterAdmin.svelte';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl(Astro.url.pathname));
if (!isAdmin(session)) return Astro.redirect('/admin');
---

<AdminLayout title="Admin — Newsletter">
  <section class="pt-10 pb-20 bg-dark min-h-screen">
    <div class="max-w-5xl mx-auto px-6">
      <div class="mb-8">
        <h1 class="text-3xl font-bold text-light font-serif">Newsletter</h1>
        <p class="text-muted mt-1">Abonnenten verwalten und Kampagnen versenden</p>
      </div>
      <NewsletterAdmin client:load />
    </div>
  </section>
</AdminLayout>
```

- [ ] **Step 2: Add Newsletter to sidebar in `AdminLayout.astro`**

In `website/src/layouts/AdminLayout.astro`, find the `Betrieb` nav group array. It currently looks like this (around line 48–58):

```typescript
{
  label: 'Betrieb',
  items: [
    { href: '/admin/bugs',          label: 'Bugs',          icon: 'bug' },
    { href: '/admin/meetings',      label: 'Meetings',      icon: 'microphone' },
    { href: '/admin/termine',       label: 'Termine',       icon: 'calendar' },
    { href: '/admin/clients',       label: 'Clients',       icon: 'users' },
    { href: '/admin/projekte',      label: 'Projekte',      icon: 'clipboard' },
    { href: '/admin/zeiterfassung', label: 'Zeiterfassung', icon: 'clock' },
    { href: '/admin/rechnungen',    label: 'Rechnungen',    icon: 'receipt' },
    { href: '/admin/followups',     label: 'Follow-ups',    icon: 'bell' },
    { href: '/admin/kalender',      label: 'Kalender',      icon: 'calendar2' },
  ],
},
```

Add the newsletter entry **after** `followups`:

```typescript
{ href: '/admin/newsletter',   label: 'Newsletter',    icon: 'mail' },
```

The resulting Betrieb items array:

```typescript
items: [
  { href: '/admin/bugs',          label: 'Bugs',          icon: 'bug' },
  { href: '/admin/meetings',      label: 'Meetings',      icon: 'microphone' },
  { href: '/admin/termine',       label: 'Termine',       icon: 'calendar' },
  { href: '/admin/clients',       label: 'Clients',       icon: 'users' },
  { href: '/admin/projekte',      label: 'Projekte',      icon: 'clipboard' },
  { href: '/admin/zeiterfassung', label: 'Zeiterfassung', icon: 'clock' },
  { href: '/admin/rechnungen',    label: 'Rechnungen',    icon: 'receipt' },
  { href: '/admin/followups',     label: 'Follow-ups',    icon: 'bell' },
  { href: '/admin/newsletter',    label: 'Newsletter',    icon: 'mail' },
  { href: '/admin/kalender',      label: 'Kalender',      icon: 'calendar2' },
],
```

- [ ] **Step 3: Verify in browser**

```bash
task website:dev
```

Open `http://web.localhost/admin/newsletter` — should show the Newsletter page with three tabs. Sidebar should show "Newsletter" in the Betrieb group.

- [ ] **Step 4: Commit**

```bash
git add website/src/pages/admin/newsletter.astro website/src/layouts/AdminLayout.astro
git commit -m "feat(newsletter): add admin newsletter page and sidebar nav entry"
```

---

## Task 12: End-to-end verification

Manual checklist to confirm the complete flow works.

- [ ] **Step 1: Full Double Opt-in flow**

1. Open `http://web.localhost` (or any page with `NewsletterSignup` widget)
2. Enter a test email and click "Anmelden"
3. Verify success message: "Bitte bestätige deine E-Mail-Adresse"
4. Open Mailpit at `http://mail.localhost` — find the confirmation email
5. Click the confirmation link → should redirect to `/newsletter/bestaetigt`
6. Open `/admin/newsletter` → Abonnenten tab → subscriber shows `confirmed`

- [ ] **Step 2: Send a campaign**

1. Open `/admin/newsletter` → Neue Kampagne tab
2. Enter a subject and some HTML body (e.g. `<h1>Test</h1><p>Hallo!</p>`)
3. Verify live preview updates in the iframe
4. Click "Als Draft speichern" → confirm green "Draft gespeichert" message
5. Click "Senden" → confirm dialog shows correct subscriber count
6. Click "Jetzt senden"
7. Check Mailpit — campaign email appears with unsubscribe footer link

- [ ] **Step 3: Unsubscribe**

1. In the campaign email in Mailpit, click the "Abmelden" link
2. Should show plain text: "Du wurdest erfolgreich vom Newsletter abgemeldet."
3. In `/admin/newsletter` → Abonnenten tab, filter to "Abgemeldet" — subscriber appears

- [ ] **Step 4: Admin add + delete**

1. In Abonnenten tab, click "+ Hinzufügen", enter an email
2. Subscriber appears with status `confirmed`, source `admin`
3. Click "Löschen", confirm → subscriber removed from list

- [ ] **Step 5: Final commit (if any cleanup needed)**

```bash
git add -p  # stage only intentional changes
git commit -m "chore(newsletter): cleanup after e2e verification"
```
