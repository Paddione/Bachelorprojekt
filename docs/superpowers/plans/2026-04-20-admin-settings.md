# Admin Settings Submenu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a collapsible "Einstellungen" group to the admin sidebar with four sub-pages (Benachrichtigungen, E-Mail, Rechnungen, Branding) that store settings in the existing `site_settings` table.

**Architecture:** All settings are persisted via the existing `getSiteSetting`/`setSiteSetting` helpers in `website-db.ts`. A new `src/lib/notifications.ts` centralises admin-notification sending — reading the configured address and per-type toggles from DB. Existing hardcoded `CONTACT_EMAIL` env reads in API routes are migrated to call this helper.

**Tech Stack:** Astro (server-side pages), TypeScript API routes, PostgreSQL via `site_settings` key-value table, Nodemailer (existing).

---

## File Map

**New:**
- `website/src/lib/notifications.ts` — `sendAdminNotification()` helper
- `website/src/pages/admin/einstellungen/benachrichtigungen.astro`
- `website/src/pages/admin/einstellungen/email.astro`
- `website/src/pages/admin/einstellungen/rechnungen.astro`
- `website/src/pages/admin/einstellungen/branding.astro`
- `website/src/pages/api/admin/einstellungen/benachrichtigungen.ts`
- `website/src/pages/api/admin/einstellungen/email.ts`
- `website/src/pages/api/admin/einstellungen/rechnungen.ts`
- `website/src/pages/api/admin/einstellungen/branding.ts`

**Modified:**
- `website/src/lib/email.ts` — add optional `from` field to `SendEmailParams`
- `website/src/layouts/AdminLayout.astro` — add Einstellungen nav group
- `website/src/pages/api/contact.ts` — use `sendAdminNotification`
- `website/src/pages/api/booking.ts` — use `sendAdminNotification`
- `website/src/pages/api/dsgvo-request.ts` — use `sendAdminNotification`
- `website/src/pages/api/register.ts` — add admin notification on new registration
- `website/src/pages/api/admin/bookings/create.ts` — use `sendAdminNotification`

---

## Task 1: Add optional `from` override to `sendEmail()`

**Files:**
- Modify: `website/src/lib/email.ts`

- [ ] **Step 1: Add `from?` field to `SendEmailParams` interface and use it in `sendMail`**

Open `website/src/lib/email.ts`. The current `SendEmailParams` interface (line 25) and `sendMail` call (line 37) need updating:

```typescript
interface SendEmailParams {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  headers?: Record<string, string>;
  from?: string;  // add this line
}

export async function sendEmail(params: SendEmailParams): Promise<boolean> {
  try {
    await transporter.sendMail({
      from: params.from ?? `"${FROM_NAME}" <${FROM_EMAIL}>`,  // change this line
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html,
      replyTo: params.replyTo,
      headers: params.headers,
    });
    return true;
  } catch (err) {
    console.error('[email] Failed to send:', err);
    return false;
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd website && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors (or only pre-existing ones unrelated to email.ts).

- [ ] **Step 3: Commit**

```bash
cd website && git add src/lib/email.ts
git commit -m "feat(email): add optional from override to sendEmail params"
```

---

## Task 2: Create `src/lib/notifications.ts`

**Files:**
- Create: `website/src/lib/notifications.ts`

- [ ] **Step 1: Create the file**

```typescript
// website/src/lib/notifications.ts
import { getSiteSetting } from './website-db';
import { sendEmail } from './email';

type NotificationType = 'registration' | 'booking' | 'contact' | 'bug' | 'message' | 'followup';

const TYPE_DEFAULTS: Record<NotificationType, string> = {
  registration: 'true',
  booking:      'true',
  contact:      'true',
  bug:          'true',
  message:      'true',
  followup:     'false',
};

export async function sendAdminNotification(params: {
  type: NotificationType;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}): Promise<void> {
  const brand = process.env.BRAND || 'mentolder';

  const [notifEmail, enabled, fromName, fromAddress] = await Promise.all([
    getSiteSetting(brand, 'notification_email'),
    getSiteSetting(brand, `notify_${params.type}`),
    getSiteSetting(brand, 'email_from_name'),
    getSiteSetting(brand, 'email_from_address'),
  ]);

  const to = notifEmail ?? process.env.CONTACT_EMAIL ?? '';
  if (!to) return;

  if ((enabled ?? TYPE_DEFAULTS[params.type]) === 'false') return;

  const from =
    fromName && fromAddress ? `"${fromName}" <${fromAddress}>` : undefined;

  await sendEmail({ to, subject: params.subject, text: params.text, html: params.html, replyTo: params.replyTo, from });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd website && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd website && git add src/lib/notifications.ts
git commit -m "feat(notifications): add sendAdminNotification helper reading settings from DB"
```

---

## Task 3: Add Einstellungen nav group to sidebar

**Files:**
- Modify: `website/src/layouts/AdminLayout.astro`

- [ ] **Step 1: Add four new icon SVGs to the `icons` record**

In `AdminLayout.astro`, the `icons` object (line 15) needs four new entries. Add these after the existing `inbox` entry (around line 36):

```typescript
  settings: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="2"/><path d="M8 1.5v1M8 13.5v1M1.5 8h1M13.5 8h1M3.4 3.4l.7.7M11.9 11.9l.7.7M3.4 12.6l.7-.7M11.9 4.1l.7-.7"/></svg>`,
  palette: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1.5a6.5 6.5 0 1 0 2.5 12.5c.6-.3.5-1.1 0-1.5a1.5 1.5 0 0 1 1.1-2.5H13a2 2 0 0 0 2-2 6.5 6.5 0 0 0-7-6.5z"/><circle cx="5" cy="6.5" r=".75" fill="currentColor" stroke="none"/><circle cx="8" cy="4.5" r=".75" fill="currentColor" stroke="none"/><circle cx="11" cy="6.5" r=".75" fill="currentColor" stroke="none"/></svg>`,
```

- [ ] **Step 2: Add Einstellungen group to `navGroups` array**

After the closing brace of the `Website` group (around line 78), add:

```typescript
  {
    label: 'Einstellungen',
    items: [
      { href: '/admin/einstellungen/benachrichtigungen', label: 'Benachrichtigungen', icon: 'bell' },
      { href: '/admin/einstellungen/email',              label: 'E-Mail',              icon: 'mail' },
      { href: '/admin/einstellungen/rechnungen',         label: 'Rechnungen',          icon: 'receipt' },
      { href: '/admin/einstellungen/branding',           label: 'Branding',            icon: 'palette' },
    ],
  },
```

- [ ] **Step 3: Start dev server and visually verify sidebar**

```bash
cd website && task website:dev
```

Open http://localhost:4321/admin — verify the Einstellungen group appears below Website in the sidebar with 4 items. Verify active highlighting works by navigating to each sub-URL.

- [ ] **Step 4: Commit**

```bash
cd website && git add src/layouts/AdminLayout.astro
git commit -m "feat(admin): add Einstellungen nav group to sidebar"
```

---

## Task 4: Benachrichtigungen page and API route

**Files:**
- Create: `website/src/pages/admin/einstellungen/benachrichtigungen.astro`
- Create: `website/src/pages/api/admin/einstellungen/benachrichtigungen.ts`

- [ ] **Step 1: Create the Astro page**

```astro
---
// website/src/pages/admin/einstellungen/benachrichtigungen.astro
import AdminLayout from '../../../layouts/AdminLayout.astro';
import { getSession, getLoginUrl, isAdmin } from '../../../lib/auth';
import { getSiteSetting } from '../../../lib/website-db';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl(Astro.url.pathname));
if (!isAdmin(session)) return Astro.redirect('/admin');

const BRAND = process.env.BRAND || 'mentolder';
const saved = Astro.url.searchParams.get('saved') === '1';

const [email, reg, booking, contact, bug, message, followup] = await Promise.all([
  getSiteSetting(BRAND, 'notification_email'),
  getSiteSetting(BRAND, 'notify_registration'),
  getSiteSetting(BRAND, 'notify_booking'),
  getSiteSetting(BRAND, 'notify_contact'),
  getSiteSetting(BRAND, 'notify_bug'),
  getSiteSetting(BRAND, 'notify_message'),
  getSiteSetting(BRAND, 'notify_followup'),
]);

const notifEmail = email ?? 'info@mentolder.de';

const toggles = [
  { key: 'notify_registration', label: 'Neue Registrierung',  checked: (reg      ?? 'true')    === 'true' },
  { key: 'notify_booking',      label: 'Neue Buchung',         checked: (booking  ?? 'true')    === 'true' },
  { key: 'notify_contact',      label: 'Kontaktformular',      checked: (contact  ?? 'true')    === 'true' },
  { key: 'notify_bug',          label: 'Neuer Bug-Report',     checked: (bug      ?? 'true')    === 'true' },
  { key: 'notify_message',      label: 'Neue Nachricht',       checked: (message  ?? 'true')    === 'true' },
  { key: 'notify_followup',     label: 'Follow-up fällig',     checked: (followup ?? 'false')   === 'true' },
];
---

<AdminLayout title="Benachrichtigungen">
  <div style="padding: 2rem; max-width: 640px;">
    <h1 style="font-family: var(--font-serif); font-size: 1.5rem; color: var(--fg); margin-bottom: 0.25rem;">Benachrichtigungen</h1>
    <p style="color: var(--mute); font-size: 0.875rem; margin-bottom: 2rem;">Admin-Benachrichtigungen werden an diese Adresse gesendet.</p>

    {saved && (
      <div style="background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.3); border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1.5rem; color: #86efac; font-size: 0.875rem;">
        Einstellungen gespeichert.
      </div>
    )}

    <form method="POST" action="/api/admin/einstellungen/benachrichtigungen">
      <div style="margin-bottom: 1.5rem;">
        <label style="display: block; font-family: var(--font-mono); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--mute-2); margin-bottom: 0.5rem;">
          Benachrichtigungs-E-Mail
        </label>
        <input
          type="email"
          name="notification_email"
          value={notifEmail}
          required
          style="width: 100%; background: var(--ink-800); border: 1px solid var(--line); border-radius: 8px; padding: 0.625rem 0.875rem; color: var(--fg); font-family: var(--font-mono); font-size: 0.875rem; outline: none;"
        />
      </div>

      <div style="margin-bottom: 2rem;">
        <p style="font-family: var(--font-mono); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--mute-2); margin-bottom: 0.75rem;">Ereignistypen</p>
        <div style="display: flex; flex-direction: column; gap: 0.625rem;">
          {toggles.map(t => (
            <label style="display: flex; align-items: center; justify-content: space-between; background: var(--ink-850); border: 1px solid var(--line); border-radius: 8px; padding: 0.75rem 1rem; cursor: pointer;">
              <span style="font-size: 0.875rem; color: var(--fg-soft);">{t.label}</span>
              <input type="checkbox" name={t.key} value="true" checked={t.checked} style="width: 1rem; height: 1rem; accent-color: var(--brass); cursor: pointer;" />
            </label>
          ))}
        </div>
      </div>

      <button
        type="submit"
        style="background: var(--brass); color: var(--ink-900); border: none; border-radius: 8px; padding: 0.625rem 1.5rem; font-size: 0.875rem; font-weight: 600; cursor: pointer;"
      >
        Speichern
      </button>
    </form>
  </div>
</AdminLayout>
```

- [ ] **Step 2: Create the API route**

```typescript
// website/src/pages/api/admin/einstellungen/benachrichtigungen.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { setSiteSetting } from '../../../../lib/website-db';

const TOGGLE_KEYS = ['notify_registration', 'notify_booking', 'notify_contact', 'notify_bug', 'notify_message', 'notify_followup'] as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const POST: APIRoute = async ({ request, redirect }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Forbidden', { status: 403 });

  const form = await request.formData();
  const brand = process.env.BRAND || 'mentolder';

  const email = (form.get('notification_email') as string)?.trim();
  if (!email || !EMAIL_RE.test(email)) {
    return new Response(JSON.stringify({ error: 'Ungültige E-Mail-Adresse' }), { status: 400 });
  }

  await setSiteSetting(brand, 'notification_email', email);

  for (const key of TOGGLE_KEYS) {
    const val = form.get(key) === 'true' ? 'true' : 'false';
    await setSiteSetting(brand, key, val);
  }

  return redirect('/admin/einstellungen/benachrichtigungen?saved=1', 303);
};
```

- [ ] **Step 3: Verify page loads and form saves**

With dev server running, open http://localhost:4321/admin/einstellungen/benachrichtigungen. Verify:
- Page loads with current values from DB (defaults on first load)
- Save works and redirects with `?saved=1` banner
- Toggling a checkbox off and saving persists `false` in DB

```bash
cd website && task workspace:psql -- website
SELECT key, value FROM site_settings WHERE brand = 'mentolder' AND key LIKE 'notify%';
```

Expected: rows for `notification_email`, `notify_registration`, etc.

- [ ] **Step 4: Commit**

```bash
cd website && git add src/pages/admin/einstellungen/benachrichtigungen.astro src/pages/api/admin/einstellungen/benachrichtigungen.ts
git commit -m "feat(admin): add Benachrichtigungen settings page"
```

---

## Task 5: E-Mail settings page and API route

**Files:**
- Create: `website/src/pages/admin/einstellungen/email.astro`
- Create: `website/src/pages/api/admin/einstellungen/email.ts`

- [ ] **Step 1: Create the Astro page**

```astro
---
// website/src/pages/admin/einstellungen/email.astro
import AdminLayout from '../../../layouts/AdminLayout.astro';
import { getSession, getLoginUrl, isAdmin } from '../../../lib/auth';
import { getSiteSetting } from '../../../lib/website-db';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl(Astro.url.pathname));
if (!isAdmin(session)) return Astro.redirect('/admin');

const BRAND = process.env.BRAND || 'mentolder';
const saved = Astro.url.searchParams.get('saved') === '1';

const [fromName, fromAddress] = await Promise.all([
  getSiteSetting(BRAND, 'email_from_name'),
  getSiteSetting(BRAND, 'email_from_address'),
]);
---

<AdminLayout title="E-Mail">
  <div style="padding: 2rem; max-width: 640px;">
    <h1 style="font-family: var(--font-serif); font-size: 1.5rem; color: var(--fg); margin-bottom: 0.25rem;">E-Mail</h1>
    <p style="color: var(--mute); font-size: 0.875rem; margin-bottom: 2rem;">Absender-Informationen für ausgehende E-Mails. SMTP-Zugangsdaten bleiben in den Umgebungsvariablen.</p>

    {saved && (
      <div style="background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.3); border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1.5rem; color: #86efac; font-size: 0.875rem;">
        Einstellungen gespeichert.
      </div>
    )}

    <form method="POST" action="/api/admin/einstellungen/email">
      <div style="margin-bottom: 1.25rem;">
        <label style="display: block; font-family: var(--font-mono); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--mute-2); margin-bottom: 0.5rem;">
          Absendername
        </label>
        <input
          type="text"
          name="email_from_name"
          value={fromName ?? (process.env.FROM_NAME ?? process.env.BRAND_NAME ?? '')}
          style="width: 100%; background: var(--ink-800); border: 1px solid var(--line); border-radius: 8px; padding: 0.625rem 0.875rem; color: var(--fg); font-family: var(--font-mono); font-size: 0.875rem; outline: none;"
        />
      </div>

      <div style="margin-bottom: 2rem;">
        <label style="display: block; font-family: var(--font-mono); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--mute-2); margin-bottom: 0.5rem;">
          Absender-Adresse (From)
        </label>
        <input
          type="email"
          name="email_from_address"
          value={fromAddress ?? (process.env.FROM_EMAIL ?? process.env.CONTACT_EMAIL ?? '')}
          style="width: 100%; background: var(--ink-800); border: 1px solid var(--line); border-radius: 8px; padding: 0.625rem 0.875rem; color: var(--fg); font-family: var(--font-mono); font-size: 0.875rem; outline: none;"
        />
      </div>

      <button
        type="submit"
        style="background: var(--brass); color: var(--ink-900); border: none; border-radius: 8px; padding: 0.625rem 1.5rem; font-size: 0.875rem; font-weight: 600; cursor: pointer;"
      >
        Speichern
      </button>
    </form>
  </div>
</AdminLayout>
```

- [ ] **Step 2: Create the API route**

```typescript
// website/src/pages/api/admin/einstellungen/email.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { setSiteSetting } from '../../../../lib/website-db';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const POST: APIRoute = async ({ request, redirect }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Forbidden', { status: 403 });

  const form = await request.formData();
  const brand = process.env.BRAND || 'mentolder';

  const fromName    = (form.get('email_from_name')    as string)?.trim();
  const fromAddress = (form.get('email_from_address') as string)?.trim();

  if (!fromName) return new Response(JSON.stringify({ error: 'Absendername darf nicht leer sein' }), { status: 400 });
  if (!fromAddress || !EMAIL_RE.test(fromAddress)) return new Response(JSON.stringify({ error: 'Ungültige Absender-Adresse' }), { status: 400 });

  await Promise.all([
    setSiteSetting(brand, 'email_from_name',    fromName),
    setSiteSetting(brand, 'email_from_address', fromAddress),
  ]);

  return redirect('/admin/einstellungen/email?saved=1', 303);
};
```

- [ ] **Step 3: Verify page loads and saves**

Open http://localhost:4321/admin/einstellungen/email. Verify the form shows current env-based defaults, save works, and the `?saved=1` banner appears.

- [ ] **Step 4: Commit**

```bash
cd website && git add src/pages/admin/einstellungen/email.astro src/pages/api/admin/einstellungen/email.ts
git commit -m "feat(admin): add E-Mail settings page"
```

---

## Task 6: Rechnungen & Zahlungen page and API route

**Files:**
- Create: `website/src/pages/admin/einstellungen/rechnungen.astro`
- Create: `website/src/pages/api/admin/einstellungen/rechnungen.ts`

- [ ] **Step 1: Create the Astro page**

```astro
---
// website/src/pages/admin/einstellungen/rechnungen.astro
import AdminLayout from '../../../layouts/AdminLayout.astro';
import { getSession, getLoginUrl, isAdmin } from '../../../lib/auth';
import { getSiteSetting } from '../../../lib/website-db';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl(Astro.url.pathname));
if (!isAdmin(session)) return Astro.redirect('/admin');

const BRAND = process.env.BRAND || 'mentolder';
const saved = Astro.url.searchParams.get('saved') === '1';

const keys = ['invoice_prefix','invoice_payment_days','invoice_tax_rate','invoice_sender_name','invoice_sender_street','invoice_sender_city','invoice_bank_iban','invoice_bank_bic','invoice_bank_name'] as const;
const results = await Promise.all(keys.map(k => getSiteSetting(BRAND, k)));
const s = Object.fromEntries(keys.map((k, i) => [k, results[i] ?? ''])) as Record<typeof keys[number], string>;
---

<AdminLayout title="Rechnungen & Zahlungen">
  <div style="padding: 2rem; max-width: 640px;">
    <h1 style="font-family: var(--font-serif); font-size: 1.5rem; color: var(--fg); margin-bottom: 0.25rem;">Rechnungen & Zahlungen</h1>
    <p style="color: var(--mute); font-size: 0.875rem; margin-bottom: 2rem;">Einstellungen für Rechnungsstellung und Zahlungsbedingungen.</p>

    {saved && (
      <div style="background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.3); border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1.5rem; color: #86efac; font-size: 0.875rem;">
        Einstellungen gespeichert.
      </div>
    )}

    <form method="POST" action="/api/admin/einstellungen/rechnungen">
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem;">
        <div>
          <label style="display: block; font-family: var(--font-mono); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--mute-2); margin-bottom: 0.5rem;">Nummernprefix</label>
          <input type="text" name="invoice_prefix" value={s.invoice_prefix || 'RE-'} style="width:100%;background:var(--ink-800);border:1px solid var(--line);border-radius:8px;padding:0.625rem 0.875rem;color:var(--fg);font-family:var(--font-mono);font-size:0.875rem;outline:none;" />
        </div>
        <div>
          <label style="display: block; font-family: var(--font-mono); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--mute-2); margin-bottom: 0.5rem;">Zahlungsziel (Tage)</label>
          <input type="number" name="invoice_payment_days" value={s.invoice_payment_days || '14'} min="0" style="width:100%;background:var(--ink-800);border:1px solid var(--line);border-radius:8px;padding:0.625rem 0.875rem;color:var(--fg);font-family:var(--font-mono);font-size:0.875rem;outline:none;" />
        </div>
        <div>
          <label style="display: block; font-family: var(--font-mono); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--mute-2); margin-bottom: 0.5rem;">Steuersatz (%)</label>
          <input type="number" name="invoice_tax_rate" value={s.invoice_tax_rate || '19'} min="0" max="100" style="width:100%;background:var(--ink-800);border:1px solid var(--line);border-radius:8px;padding:0.625rem 0.875rem;color:var(--fg);font-family:var(--font-mono);font-size:0.875rem;outline:none;" />
        </div>
      </div>

      <p style="font-family:var(--font-mono);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--mute-2);margin-bottom:0.75rem;">Rechnungsabsender</p>
      <div style="display:flex;flex-direction:column;gap:0.625rem;margin-bottom:1.5rem;">
        <input type="text" name="invoice_sender_name"   value={s.invoice_sender_name}   placeholder="Name / Firma"      style="width:100%;background:var(--ink-800);border:1px solid var(--line);border-radius:8px;padding:0.625rem 0.875rem;color:var(--fg);font-family:var(--font-mono);font-size:0.875rem;outline:none;" />
        <input type="text" name="invoice_sender_street" value={s.invoice_sender_street} placeholder="Straße, Hausnummer" style="width:100%;background:var(--ink-800);border:1px solid var(--line);border-radius:8px;padding:0.625rem 0.875rem;color:var(--fg);font-family:var(--font-mono);font-size:0.875rem;outline:none;" />
        <input type="text" name="invoice_sender_city"   value={s.invoice_sender_city}   placeholder="PLZ Ort"           style="width:100%;background:var(--ink-800);border:1px solid var(--line);border-radius:8px;padding:0.625rem 0.875rem;color:var(--fg);font-family:var(--font-mono);font-size:0.875rem;outline:none;" />
      </div>

      <p style="font-family:var(--font-mono);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--mute-2);margin-bottom:0.75rem;">Bankverbindung</p>
      <div style="display:flex;flex-direction:column;gap:0.625rem;margin-bottom:2rem;">
        <input type="text" name="invoice_bank_iban" value={s.invoice_bank_iban} placeholder="IBAN"     style="width:100%;background:var(--ink-800);border:1px solid var(--line);border-radius:8px;padding:0.625rem 0.875rem;color:var(--fg);font-family:var(--font-mono);font-size:0.875rem;outline:none;" />
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.625rem;">
          <input type="text" name="invoice_bank_bic"  value={s.invoice_bank_bic}  placeholder="BIC"      style="background:var(--ink-800);border:1px solid var(--line);border-radius:8px;padding:0.625rem 0.875rem;color:var(--fg);font-family:var(--font-mono);font-size:0.875rem;outline:none;" />
          <input type="text" name="invoice_bank_name" value={s.invoice_bank_name} placeholder="Bankname" style="background:var(--ink-800);border:1px solid var(--line);border-radius:8px;padding:0.625rem 0.875rem;color:var(--fg);font-family:var(--font-mono);font-size:0.875rem;outline:none;" />
        </div>
      </div>

      <button type="submit" style="background:var(--brass);color:var(--ink-900);border:none;border-radius:8px;padding:0.625rem 1.5rem;font-size:0.875rem;font-weight:600;cursor:pointer;">Speichern</button>
    </form>
  </div>
</AdminLayout>
```

- [ ] **Step 2: Create the API route**

```typescript
// website/src/pages/api/admin/einstellungen/rechnungen.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { setSiteSetting } from '../../../../lib/website-db';

const STRING_KEYS = ['invoice_prefix','invoice_sender_name','invoice_sender_street','invoice_sender_city','invoice_bank_iban','invoice_bank_bic','invoice_bank_name'] as const;
const NUMBER_KEYS = ['invoice_payment_days','invoice_tax_rate'] as const;

export const POST: APIRoute = async ({ request, redirect }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Forbidden', { status: 403 });

  const form = await request.formData();
  const brand = process.env.BRAND || 'mentolder';

  const saves: Promise<void>[] = [];

  for (const key of STRING_KEYS) {
    saves.push(setSiteSetting(brand, key, (form.get(key) as string)?.trim() ?? ''));
  }
  for (const key of NUMBER_KEYS) {
    const val = parseInt(form.get(key) as string, 10);
    saves.push(setSiteSetting(brand, key, isNaN(val) ? '0' : String(val)));
  }

  await Promise.all(saves);
  return redirect('/admin/einstellungen/rechnungen?saved=1', 303);
};
```

- [ ] **Step 3: Verify page loads and saves**

Open http://localhost:4321/admin/einstellungen/rechnungen, fill in test values, save, reload — values should persist.

- [ ] **Step 4: Commit**

```bash
cd website && git add src/pages/admin/einstellungen/rechnungen.astro src/pages/api/admin/einstellungen/rechnungen.ts
git commit -m "feat(admin): add Rechnungen & Zahlungen settings page"
```

---

## Task 7: Branding & Kontakt page and API route

**Files:**
- Create: `website/src/pages/admin/einstellungen/branding.astro`
- Create: `website/src/pages/api/admin/einstellungen/branding.ts`

- [ ] **Step 1: Create the Astro page**

```astro
---
// website/src/pages/admin/einstellungen/branding.astro
import AdminLayout from '../../../layouts/AdminLayout.astro';
import { getSession, getLoginUrl, isAdmin } from '../../../lib/auth';
import { getSiteSetting } from '../../../lib/website-db';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl(Astro.url.pathname));
if (!isAdmin(session)) return Astro.redirect('/admin');

const BRAND = process.env.BRAND || 'mentolder';
const saved = Astro.url.searchParams.get('saved') === '1';

const keys = ['brand_name','brand_contact_email','brand_phone','brand_logo_url','brand_social_linkedin','brand_social_instagram'] as const;
const results = await Promise.all(keys.map(k => getSiteSetting(BRAND, k)));
const s = Object.fromEntries(keys.map((k, i) => [k, results[i] ?? ''])) as Record<typeof keys[number], string>;
---

<AdminLayout title="Branding & Kontakt">
  <div style="padding: 2rem; max-width: 640px;">
    <h1 style="font-family: var(--font-serif); font-size: 1.5rem; color: var(--fg); margin-bottom: 0.25rem;">Branding & Kontakt</h1>
    <p style="color: var(--mute); font-size: 0.875rem; margin-bottom: 2rem;">Markenname, Kontaktdaten und Social-Media-Links.</p>

    {saved && (
      <div style="background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.3); border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1.5rem; color: #86efac; font-size: 0.875rem;">
        Einstellungen gespeichert.
      </div>
    )}

    <form method="POST" action="/api/admin/einstellungen/branding">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;margin-bottom:1.25rem;">
        <div>
          <label style="display:block;font-family:var(--font-mono);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--mute-2);margin-bottom:0.5rem;">Markenname</label>
          <input type="text" name="brand_name" value={s.brand_name || BRAND} style="width:100%;background:var(--ink-800);border:1px solid var(--line);border-radius:8px;padding:0.625rem 0.875rem;color:var(--fg);font-family:var(--font-mono);font-size:0.875rem;outline:none;" />
        </div>
        <div>
          <label style="display:block;font-family:var(--font-mono);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--mute-2);margin-bottom:0.5rem;">Kontakt-E-Mail (öffentlich)</label>
          <input type="email" name="brand_contact_email" value={s.brand_contact_email || `info@${BRAND}.de`} style="width:100%;background:var(--ink-800);border:1px solid var(--line);border-radius:8px;padding:0.625rem 0.875rem;color:var(--fg);font-family:var(--font-mono);font-size:0.875rem;outline:none;" />
        </div>
        <div>
          <label style="display:block;font-family:var(--font-mono);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--mute-2);margin-bottom:0.5rem;">Telefonnummer</label>
          <input type="tel" name="brand_phone" value={s.brand_phone} placeholder="+49 ..." style="width:100%;background:var(--ink-800);border:1px solid var(--line);border-radius:8px;padding:0.625rem 0.875rem;color:var(--fg);font-family:var(--font-mono);font-size:0.875rem;outline:none;" />
        </div>
      </div>

      <div style="margin-bottom:1.25rem;">
        <label style="display:block;font-family:var(--font-mono);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--mute-2);margin-bottom:0.5rem;">Logo-URL</label>
        <input type="url" name="brand_logo_url" value={s.brand_logo_url} placeholder="https://..." style="width:100%;background:var(--ink-800);border:1px solid var(--line);border-radius:8px;padding:0.625rem 0.875rem;color:var(--fg);font-family:var(--font-mono);font-size:0.875rem;outline:none;" />
      </div>

      <p style="font-family:var(--font-mono);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--mute-2);margin-bottom:0.75rem;">Social Media</p>
      <div style="display:flex;flex-direction:column;gap:0.625rem;margin-bottom:2rem;">
        <div style="display:grid;grid-template-columns:80px 1fr;align-items:center;gap:0.75rem;">
          <span style="font-size:0.8rem;color:var(--mute);">LinkedIn</span>
          <input type="url" name="brand_social_linkedin" value={s.brand_social_linkedin} placeholder="https://linkedin.com/..." style="background:var(--ink-800);border:1px solid var(--line);border-radius:8px;padding:0.625rem 0.875rem;color:var(--fg);font-family:var(--font-mono);font-size:0.875rem;outline:none;" />
        </div>
        <div style="display:grid;grid-template-columns:80px 1fr;align-items:center;gap:0.75rem;">
          <span style="font-size:0.8rem;color:var(--mute);">Instagram</span>
          <input type="url" name="brand_social_instagram" value={s.brand_social_instagram} placeholder="https://instagram.com/..." style="background:var(--ink-800);border:1px solid var(--line);border-radius:8px;padding:0.625rem 0.875rem;color:var(--fg);font-family:var(--font-mono);font-size:0.875rem;outline:none;" />
        </div>
      </div>

      <button type="submit" style="background:var(--brass);color:var(--ink-900);border:none;border-radius:8px;padding:0.625rem 1.5rem;font-size:0.875rem;font-weight:600;cursor:pointer;">Speichern</button>
    </form>
  </div>
</AdminLayout>
```

- [ ] **Step 2: Create the API route**

```typescript
// website/src/pages/api/admin/einstellungen/branding.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { setSiteSetting } from '../../../../lib/website-db';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const KEYS = ['brand_name','brand_contact_email','brand_phone','brand_logo_url','brand_social_linkedin','brand_social_instagram'] as const;

export const POST: APIRoute = async ({ request, redirect }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Forbidden', { status: 403 });

  const form = await request.formData();
  const brand = process.env.BRAND || 'mentolder';

  const contactEmail = (form.get('brand_contact_email') as string)?.trim();
  if (contactEmail && !EMAIL_RE.test(contactEmail)) {
    return new Response(JSON.stringify({ error: 'Ungültige Kontakt-E-Mail' }), { status: 400 });
  }

  await Promise.all(KEYS.map(key => setSiteSetting(brand, key, (form.get(key) as string)?.trim() ?? '')));
  return redirect('/admin/einstellungen/branding?saved=1', 303);
};
```

- [ ] **Step 3: Verify page loads and saves**

Open http://localhost:4321/admin/einstellungen/branding, fill in test values, save, reload — values should persist.

- [ ] **Step 4: Commit**

```bash
cd website && git add src/pages/admin/einstellungen/branding.astro src/pages/api/admin/einstellungen/branding.ts
git commit -m "feat(admin): add Branding & Kontakt settings page"
```

---

## Task 8: Migrate existing notification calls to `sendAdminNotification`

**Files:**
- Modify: `website/src/pages/api/contact.ts`
- Modify: `website/src/pages/api/booking.ts`
- Modify: `website/src/pages/api/dsgvo-request.ts`
- Modify: `website/src/pages/api/register.ts`
- Modify: `website/src/pages/api/admin/bookings/create.ts`

### 8a: contact.ts

- [ ] **Step 1: Replace CONTACT_EMAIL admin notification in `contact.ts`**

Current file at `website/src/pages/api/contact.ts` lines 6-70. Replace the import and admin notification block:

Remove line 6: `const CONTACT_EMAIL = process.env.CONTACT_EMAIL || '';`

Add after the existing imports:
```typescript
import { sendAdminNotification } from '../../lib/notifications';
```

Replace the block (currently around lines 52-70):
```typescript
// BEFORE:
if (CONTACT_EMAIL) {
  sendEmail({
    to: CONTACT_EMAIL,
    subject: `[${typeLabel}] Neue Anfrage von ${name}`,
    replyTo: email,
    text: `Neue Anfrage über das Kontaktformular auf ${BRAND_NAME}.\n\nName: ${name}\nE-Mail: ${email}${phoneInfo}\nTyp: ${typeLabel}\n\nNachricht:\n${message}`,
    html: `...`,
  }).catch(err => console.error('[contact] Failed to send admin notification email:', err));
} else {
  console.warn('[contact] CONTACT_EMAIL not configured — admin notification skipped');
}

// AFTER:
sendAdminNotification({
  type: 'contact',
  subject: `[${typeLabel}] Neue Anfrage von ${name}`,
  replyTo: email,
  text: `Neue Anfrage über das Kontaktformular auf ${BRAND_NAME}.\n\nName: ${name}\nE-Mail: ${email}${phoneInfo}\nTyp: ${typeLabel}\n\nNachricht:\n${message}`,
  html: `<p><strong>Neue Anfrage über das Kontaktformular auf ${BRAND_NAME}.</strong></p><p>Name: ${name}<br>E-Mail: <a href="mailto:${email}">${email}</a>${phoneInfo ? `<br>Telefon: ${phone}` : ''}<br>Typ: ${typeLabel}</p><p><strong>Nachricht:</strong><br>${message.replace(/\n/g, '<br>')}</p>`,
}).catch(err => console.error('[contact] Failed to send admin notification:', err));
```

Also remove the `sendEmail` import if it is no longer used by the file (it's used for user confirmation emails, so keep it).

### 8b: booking.ts

- [ ] **Step 2: Replace CONTACT_EMAIL admin notification in `booking.ts`**

Remove line 8: `const CONTACT_EMAIL = process.env.CONTACT_EMAIL || '';`

Add import:
```typescript
import { sendAdminNotification } from '../../lib/notifications';
```

Replace the admin notification block (around lines 89-109):
```typescript
// BEFORE:
if (CONTACT_EMAIL) {
  const phoneInfo = phone ? `\nTelefon: ${phone}` : '';
  const adminText = isCallback
    ? `Neue Rückruf-Anfrage auf ${BRAND_NAME}.\n\nName: ${name}\nE-Mail: ${email}${phoneInfo}${message ? `\n\nAnmerkungen:\n${message}` : ''}`
    : `Neue Terminanfrage auf ${BRAND_NAME}.\n\nName: ${name}\nE-Mail: ${email}${phoneInfo}\nTyp: ${typeLabel}\nDatum: ${dateFormatted}\nUhrzeit: ${slotDisplay}${message ? `\n\nAnmerkungen:\n${message}` : ''}`;
  await sendEmail({
    to: CONTACT_EMAIL,
    subject: isCallback ? `[Rückruf] Anfrage von ${name}` : `[Terminanfrage: ${typeLabel}] ${name} am ${dateFormatted}`,
    text: adminText,
    replyTo: email,
  });
}

// AFTER:
const phoneInfo = phone ? `\nTelefon: ${phone}` : '';
const adminText = isCallback
  ? `Neue Rückruf-Anfrage auf ${BRAND_NAME}.\n\nName: ${name}\nE-Mail: ${email}${phoneInfo}${message ? `\n\nAnmerkungen:\n${message}` : ''}`
  : `Neue Terminanfrage auf ${BRAND_NAME}.\n\nName: ${name}\nE-Mail: ${email}${phoneInfo}\nTyp: ${typeLabel}\nDatum: ${dateFormatted}\nUhrzeit: ${slotDisplay}${message ? `\n\nAnmerkungen:\n${message}` : ''}`;
await sendAdminNotification({
  type: 'booking',
  subject: isCallback ? `[Rückruf] Anfrage von ${name}` : `[Terminanfrage: ${typeLabel}] ${name} am ${dateFormatted}`,
  text: adminText,
  replyTo: email,
});
```

### 8c: dsgvo-request.ts

- [ ] **Step 3: Replace CONTACT_EMAIL admin notification in `dsgvo-request.ts`**

Remove line 6: `const CONTACT_EMAIL = process.env.CONTACT_EMAIL || '';`

Add import:
```typescript
import { sendAdminNotification } from '../../lib/notifications';
```

Replace the admin notification block (around lines 51-61):
```typescript
// BEFORE:
if (CONTACT_EMAIL) {
  sendEmail({
    to: CONTACT_EMAIL,
    subject: `[DSGVO] ${subject} von ${name}`,
    text: `...`,
    replyTo: email,
  }).catch(err => console.error('[dsgvo-request] Failed to send admin notification:', err));
} else {
  console.warn('[dsgvo-request] CONTACT_EMAIL not set — admin notification skipped');
}

// AFTER:
sendAdminNotification({
  type: 'contact',
  subject: `[DSGVO] ${subject} von ${name}`,
  text: `${subject}\n\nName: ${name}\nE-Mail: ${email}\nEingegangen: ${new Date().toLocaleString('de-DE')}\nFrist: ${deadline}\n\nBitte bearbeiten Sie diese Anfrage innerhalb von 30 Tagen gemäß Art. ${articleNum} DSGVO.`,
  replyTo: email,
}).catch(err => console.error('[dsgvo-request] Failed to send admin notification:', err));
```

### 8d: register.ts — add new admin notification

- [ ] **Step 4: Add admin notification for new registrations in `register.ts`**

The file currently only sends a confirmation email to the user. Add an admin notification after that:

Add import:
```typescript
import { sendAdminNotification } from '../../lib/notifications';
```

After line 38 (`sendRegistrationConfirmation(email, fullName).catch(...)`), add:
```typescript
sendAdminNotification({
  type: 'registration',
  subject: `[Neue Registrierung] ${fullName}`,
  text: `Neue Registrierungsanfrage eingegangen.\n\nName: ${fullName}\nE-Mail: ${email}\n\nZum Bearbeiten: /admin/inbox`,
}).catch(err => console.error('[register] Failed to send admin notification:', err));
```

### 8e: admin/bookings/create.ts

- [ ] **Step 5: Replace CONTACT_EMAIL in `admin/bookings/create.ts`**

Remove line 9: `const CONTACT_EMAIL = process.env.CONTACT_EMAIL || '';`

Add import:
```typescript
import { sendAdminNotification } from '../../../../lib/notifications';
```

Replace the admin notification block (around lines 94-106):
```typescript
// BEFORE:
if (CONTACT_EMAIL) {
  await sendEmail({
    to: CONTACT_EMAIL,
    subject: isCallback ? `[Admin-Buchung/Rückruf] ${clientName}` : `[Admin-Buchung: ${typeLabel}] ${clientName} am ${dateFormatted}`,
    text: `...`,
  });
}

// AFTER:
await sendAdminNotification({
  type: 'booking',
  subject: isCallback ? `[Admin-Buchung/Rückruf] ${clientName}` : `[Admin-Buchung: ${typeLabel}] ${clientName} am ${dateFormatted}`,
  text: isCallback
    ? `Admin-Buchung/Rückruf eingetragen für ${clientName}.`
    : `Admin-Buchung eingetragen.\n\nKunde: ${clientName}\nTyp: ${typeLabel}\nDatum: ${dateFormatted}`,
});
```

- [ ] **Step 6: TypeScript compile check**

```bash
cd website && npx tsc --noEmit 2>&1 | head -30
```

Expected: no new errors.

- [ ] **Step 7: Smoke test — submit contact form, check notification email is sent**

With dev server running, submit the contact form at http://localhost:4321/kontakt. Check Mailpit at http://mail.localhost to verify the notification email arrived. Then go to the Benachrichtigungen settings, change the notification email, re-submit the form, and verify the new address receives it.

- [ ] **Step 8: Commit**

```bash
cd website && git add \
  src/pages/api/contact.ts \
  src/pages/api/booking.ts \
  src/pages/api/dsgvo-request.ts \
  src/pages/api/register.ts \
  src/pages/api/admin/bookings/create.ts
git commit -m "feat(notifications): migrate all CONTACT_EMAIL admin notifications to DB-driven sendAdminNotification"
```

---

## Self-Review Checklist (done inline)

- **Spec coverage:** All 4 settings pages ✓, sidebar nav ✓, `sendAdminNotification` helper ✓, email.ts `from` override ✓, CONTACT_EMAIL migration ✓ across all 5 files, admin registration notification (new) ✓
- **Placeholders:** None — all code is complete
- **Type consistency:** `NotificationType` defined in Task 2 and used in Task 8; `setSiteSetting`/`getSiteSetting` signatures unchanged; `SendEmailParams.from` added in Task 1 and consumed in Task 2
