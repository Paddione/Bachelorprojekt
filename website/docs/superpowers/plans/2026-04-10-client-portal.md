# Client Portal Implementation Plan

> ⚠️ **Veraltet:** Dieser Plan referenziert InvoiceNinja (entfernt 2026-04) und Mattermost (entfernt 2026-04). Vor Implementierung müssen diese Abhängigkeiten durch aktuell vorhandene Services ersetzt werden.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/portal` (client view) and `/admin` (admin view) routes that show bookings, invoices, shared files, pending signatures, and past meetings — all gated behind Keycloak session auth.

**Architecture:** Both routes are Astro SSR pages. They call `getSession()` on every request and redirect to `/api/auth/login` if unauthenticated. Admin detection uses an `ADMIN_EMAILS` env var (comma-separated). Each portal tab is a separate `.astro` component that accepts the client email as a prop and fetches its own data. The admin view reuses these components with a different email filter.

**Tech Stack:** Astro SSR, `lib/auth.ts`, `lib/caldav.ts`, `lib/invoiceninja.ts`, `lib/nextcloud-files.ts` (new), Keycloak session cookie.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/nextcloud-files.ts` | Create | WebDAV file listing, move, download helpers |
| `src/lib/invoiceninja.ts` | Modify | Add `getInvoicesByEmail()` |
| `src/lib/auth.ts` | Modify | Add `isAdmin(session)` helper |
| `src/components/portal/BookingsTab.astro` | Create | Upcoming CalDAV events for an email |
| `src/components/portal/InvoicesTab.astro` | Create | Invoice Ninja invoices for an email |
| `src/components/portal/FilesTab.astro` | Create | Nextcloud `/Clients/<user>/` file list |
| `src/components/portal/SignaturesTab.astro` | Create | Pending + signed documents (stub for signing plan) |
| `src/components/portal/MeetingsTab.astro` | Create | Released meeting artefacts (stub for meeting history plan) |
| `src/pages/portal.astro` | Create | Client portal shell — tab router |
| `src/pages/admin.astro` | Create | Admin dashboard — client list |
| `src/pages/admin/[clientId].astro` | Create | Admin detail view for one client |
| `tests/e2e/specs/fa-portal.spec.ts` | Create | Playwright E2E test |

---

### Task 1: Write failing Playwright tests

**Files:**
- Create: `tests/e2e/specs/fa-portal.spec.ts`

- [ ] **Step 1: Write tests**

```typescript
import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:4321';

test.describe('Client Portal', () => {
  test('T1 – unauthenticated /portal redirects to login', async ({ page }) => {
    const res = await page.goto(`${BASE}/portal`);
    // Should end up at Keycloak login or /api/auth/login redirect
    expect(page.url()).not.toBe(`${BASE}/portal`);
  });

  test('T2 – unauthenticated /admin redirects to login', async ({ page }) => {
    await page.goto(`${BASE}/admin`);
    expect(page.url()).not.toBe(`${BASE}/admin`);
  });
});

// Authenticated tests require a valid Keycloak session cookie.
// Run these against a dev cluster with known credentials.
test.describe('Client Portal (authenticated)', () => {
  test.use({
    storageState: process.env.PORTAL_AUTH_STATE || undefined,
  });

  test('T3 – /portal shows tab navigation', async ({ page }) => {
    test.skip(!process.env.PORTAL_AUTH_STATE, 'Requires auth state file');
    await page.goto(`${BASE}/portal`);
    await expect(page.locator('[data-testid="portal-tabs"]')).toBeVisible();
    await expect(page.locator('[data-testid="tab-bookings"]')).toBeVisible();
    await expect(page.locator('[data-testid="tab-invoices"]')).toBeVisible();
    await expect(page.locator('[data-testid="tab-files"]')).toBeVisible();
  });
});
```

- [ ] **Step 2: Run to confirm T1 and T2 fail**

```bash
cd /home/patrick/Bachelorprojekt/tests/e2e
BASE_URL=http://localhost:4321 npx playwright test fa-portal.spec.ts -k "T1|T2" --reporter=line
```

Expected: both fail because `/portal` returns 200 (page doesn't exist yet, Astro 404).

---

### Task 2: Add `isAdmin()` to `src/lib/auth.ts` and `getInvoicesByEmail()` to invoiceninja

**Files:**
- Modify: `src/lib/auth.ts`
- Modify: `src/lib/invoiceninja.ts`

- [ ] **Step 1: Add `isAdmin` helper to `auth.ts`**

At the end of `src/lib/auth.ts`, add:

```typescript
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

export function isAdmin(session: UserSession): boolean {
  return ADMIN_EMAILS.includes(session.email.toLowerCase());
}
```

- [ ] **Step 2: Add `getInvoicesByEmail()` to `src/lib/invoiceninja.ts`**

At the end of `src/lib/invoiceninja.ts`, add:

```typescript
export interface InvoiceNinjaInvoiceFull {
  id: string;
  number: string;
  amount: number;
  balance: number;
  status_id: string; // '1'=draft,'2'=sent,'3'=partial,'4'=paid,'5'=cancelled
  due_date: string;
  public_notes: string;
  invitations: Array<{ link: string }>;
}

export async function getInvoicesByEmail(email: string): Promise<InvoiceNinjaInvoiceFull[]> {
  if (!process.env.INVOICENINJA_API_TOKEN) return [];
  try {
    // First find the client by email
    const clientRes = await fetch(`${process.env.INVOICENINJA_URL || 'http://invoiceninja.workspace.svc.cluster.local'}/api/v1/clients?email=${encodeURIComponent(email)}&per_page=1`, {
      headers: { 'X-Api-Token': process.env.INVOICENINJA_API_TOKEN, Accept: 'application/json' },
    });
    if (!clientRes.ok) return [];
    const clientData = await clientRes.json();
    const clientId = clientData.data?.[0]?.id;
    if (!clientId) return [];

    // Fetch invoices for that client
    const invRes = await fetch(`${process.env.INVOICENINJA_URL || 'http://invoiceninja.workspace.svc.cluster.local'}/api/v1/invoices?client_id=${clientId}&per_page=50&sort=due_date|desc`, {
      headers: { 'X-Api-Token': process.env.INVOICENINJA_API_TOKEN, Accept: 'application/json' },
    });
    if (!invRes.ok) return [];
    const invData = await invRes.json();
    return invData.data || [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth.ts src/lib/invoiceninja.ts
git commit -m "feat: add isAdmin helper and getInvoicesByEmail to invoiceninja"
```

---

### Task 3: Create `src/lib/nextcloud-files.ts`

**Files:**
- Create: `src/lib/nextcloud-files.ts`

- [ ] **Step 1: Write helper**

```typescript
// Nextcloud WebDAV file operations for the client portal.

const NC_URL = process.env.NEXTCLOUD_URL || 'http://nextcloud.workspace.svc.cluster.local';
const NC_USER = process.env.NEXTCLOUD_CALDAV_USER || 'admin';
const NC_PASS = process.env.NEXTCLOUD_CALDAV_PASSWORD || 'devnextcloudadmin';

function authHeader(): string {
  return 'Basic ' + Buffer.from(`${NC_USER}:${NC_PASS}`).toString('base64');
}

export interface NcFile {
  name: string;
  path: string; // WebDAV href path
  size: number;
  lastModified: string;
  contentType: string;
}

// List files in a WebDAV directory (non-recursive)
export async function listFiles(davPath: string): Promise<NcFile[]> {
  const url = `${NC_URL}/remote.php/dav/files/${NC_USER}${davPath}`;
  try {
    const res = await fetch(url, {
      method: 'PROPFIND',
      headers: {
        Authorization: authHeader(),
        'Content-Type': 'application/xml',
        Depth: '1',
      },
      body: `<?xml version="1.0"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:displayname/>
    <d:getcontentlength/>
    <d:getlastmodified/>
    <d:getcontenttype/>
    <d:resourcetype/>
  </d:prop>
</d:propfind>`,
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseWebDavListing(xml, davPath);
  } catch {
    return [];
  }
}

function parseWebDavListing(xml: string, basePath: string): NcFile[] {
  const files: NcFile[] = [];
  const responseRegex = /<d:response>([\s\S]*?)<\/d:response>/gi;
  let match;
  while ((match = responseRegex.exec(xml)) !== null) {
    const block = match[1];
    // Skip directories
    if (/<d:collection\s*\/>/.test(block)) continue;
    const href = (/<d:href>([^<]+)<\/d:href>/.exec(block) || [])[1] || '';
    const name = decodeURIComponent(href.split('/').pop() || '');
    if (!name) continue;
    const size = parseInt((/<d:getcontentlength>([^<]+)<\/d:getcontentlength>/.exec(block) || [])[1] || '0');
    const lastModified = (/<d:getlastmodified>([^<]+)<\/d:getlastmodified>/.exec(block) || [])[1] || '';
    const contentType = (/<d:getcontenttype>([^<]+)<\/d:getcontenttype>/.exec(block) || [])[1] || 'application/octet-stream';
    files.push({ name, path: href, size, lastModified, contentType });
  }
  return files;
}

// Move a file within Nextcloud WebDAV
export async function moveFile(fromDavPath: string, toDavPath: string): Promise<boolean> {
  const fromUrl = `${NC_URL}/remote.php/dav/files/${NC_USER}${fromDavPath}`;
  const toUrl = `${NC_URL}/remote.php/dav/files/${NC_USER}${toDavPath}`;
  try {
    const res = await fetch(fromUrl, {
      method: 'MOVE',
      headers: {
        Authorization: authHeader(),
        Destination: toUrl,
        Overwrite: 'F',
      },
    });
    return res.ok || res.status === 201;
  } catch {
    return false;
  }
}

// Download a file from Nextcloud and return as Buffer
export async function downloadFile(davPath: string): Promise<Buffer | null> {
  const url = `${NC_URL}/remote.php/dav/files/${NC_USER}${davPath}`;
  try {
    const res = await fetch(url, { headers: { Authorization: authHeader() } });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

// Ensure a directory exists (create if absent)
export async function ensureDirectory(davPath: string): Promise<void> {
  const url = `${NC_URL}/remote.php/dav/files/${NC_USER}${davPath}`;
  await fetch(url, { method: 'MKCOL', headers: { Authorization: authHeader() } });
  // Ignore result — 405 Method Not Allowed means it already exists
}

// Generate a temporary Nextcloud share link for a file (returns URL or null)
export async function createShareLink(davPath: string): Promise<string | null> {
  const ncExternalUrl = process.env.NEXTCLOUD_EXTERNAL_URL || '';
  if (!ncExternalUrl) return null;
  try {
    const res = await fetch(`${NC_URL}/ocs/v2.php/apps/files_sharing/api/v1/shares`, {
      method: 'POST',
      headers: {
        Authorization: authHeader(),
        'OCS-APIRequest': 'true',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        path: davPath,
        shareType: '3', // public link
        permissions: '1', // read only
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const token = data?.ocs?.data?.token;
    return token ? `${ncExternalUrl}/s/${token}` : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/nextcloud-files.ts
git commit -m "feat: add nextcloud-files WebDAV helper (list, move, download, share)"
```

---

### Task 4: Create portal tab components

**Files:**
- Create: `src/components/portal/BookingsTab.astro`
- Create: `src/components/portal/InvoicesTab.astro`
- Create: `src/components/portal/FilesTab.astro`
- Create: `src/components/portal/SignaturesTab.astro`
- Create: `src/components/portal/MeetingsTab.astro`

- [ ] **Step 1: Create `BookingsTab.astro`**

```astro
---
import { getAvailableSlots } from '../../lib/caldav';

interface Props { email: string; }
const { email } = Astro.props;

// Fetch upcoming events from CalDAV filtered by attendee email
let events: Array<{ summary: string; start: Date; end: Date }> = [];
try {
  // CalDAV getAvailableSlots returns free slots; for booked events we need a separate fetch.
  // For now we show a placeholder — the meeting history plan adds proper event fetching.
  events = [];
} catch { /* silent */ }
---

<div data-testid="tab-bookings">
  {events.length === 0 ? (
    <p class="text-muted text-center py-12">Keine bevorstehenden Termine gefunden.</p>
  ) : (
    <ul class="space-y-4">
      {events.map((ev) => (
        <li class="bg-dark-light rounded-xl border border-dark-lighter p-5">
          <p class="font-semibold text-light">{ev.summary}</p>
          <p class="text-muted text-sm mt-1">
            {ev.start.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
            {' — '}
            {ev.start.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
            {' bis '}
            {ev.end.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </li>
      ))}
    </ul>
  )}
</div>
```

- [ ] **Step 2: Create `InvoicesTab.astro`**

```astro
---
import { getInvoicesByEmail } from '../../lib/invoiceninja';

interface Props { email: string; }
const { email } = Astro.props;

const STATUS_LABELS: Record<string, string> = {
  '1': 'Entwurf', '2': 'Versendet', '3': 'Teilbezahlt', '4': 'Bezahlt', '5': 'Storniert',
};
const STATUS_COLORS: Record<string, string> = {
  '1': 'text-muted', '2': 'text-gold', '3': 'text-amber-400', '4': 'text-green-400', '5': 'text-red-400',
};

let invoices = await getInvoicesByEmail(email).catch(() => []);
---

<div data-testid="tab-invoices">
  {invoices.length === 0 ? (
    <p class="text-muted text-center py-12">Keine Rechnungen gefunden.</p>
  ) : (
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-dark-lighter text-muted text-left">
            <th class="pb-3 pr-4">Nr.</th>
            <th class="pb-3 pr-4">Betrag</th>
            <th class="pb-3 pr-4">Status</th>
            <th class="pb-3 pr-4">Fällig</th>
            <th class="pb-3"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-dark-lighter">
          {invoices.map((inv) => (
            <tr>
              <td class="py-3 pr-4 text-light font-mono">#{inv.number}</td>
              <td class="py-3 pr-4 text-light">{inv.amount.toFixed(2)} €</td>
              <td class={`py-3 pr-4 font-medium ${STATUS_COLORS[inv.status_id] || 'text-muted'}`}>
                {STATUS_LABELS[inv.status_id] || inv.status_id}
              </td>
              <td class="py-3 pr-4 text-muted">{inv.due_date || '—'}</td>
              <td class="py-3">
                {inv.invitations?.[0]?.link && (
                  <a
                    href={inv.invitations[0].link}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-gold hover:underline text-xs"
                  >
                    Anzeigen →
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )}
</div>
```

- [ ] **Step 3: Create `FilesTab.astro`**

```astro
---
import { listFiles } from '../../lib/nextcloud-files';

interface Props { username: string; }
const { username } = Astro.props;

const ncExternal = process.env.NEXTCLOUD_EXTERNAL_URL || '';
let files = await listFiles(`/Clients/${username}/`).catch(() => []);
// Filter out the pending-signatures subfolder entry itself
files = files.filter((f) => !f.name.startsWith('pending-signatures') && !f.name.startsWith('signed'));
---

<div data-testid="tab-files">
  {files.length === 0 ? (
    <p class="text-muted text-center py-12">Keine Dateien vorhanden.</p>
  ) : (
    <ul class="space-y-3">
      {files.map((f) => (
        <li class="flex items-center justify-between bg-dark-light rounded-lg border border-dark-lighter px-5 py-3">
          <span class="text-light text-sm truncate max-w-xs">{f.name}</span>
          <div class="flex items-center gap-4 flex-shrink-0">
            <span class="text-muted text-xs">{(f.size / 1024).toFixed(1)} KB</span>
            {ncExternal && (
              <a
                href={`${ncExternal}/remote.php/dav/files/${process.env.NEXTCLOUD_CALDAV_USER || 'admin'}${f.path}`}
                target="_blank"
                rel="noopener noreferrer"
                class="text-gold hover:underline text-xs"
              >
                Öffnen →
              </a>
            )}
          </div>
        </li>
      ))}
    </ul>
  )}
</div>
```

- [ ] **Step 4: Create `SignaturesTab.astro` (stub — full impl in signing plan)**

```astro
---
interface Props { username: string; }
const { username } = Astro.props;
---
<div data-testid="tab-signatures">
  <p class="text-muted text-center py-12">
    Dokumente zur Unterschrift werden hier angezeigt.
    <!-- Fully implemented in document-signing plan -->
  </p>
</div>
```

- [ ] **Step 5: Create `MeetingsTab.astro` (stub — full impl in meeting history plan)**

```astro
---
interface Props { email: string; }
const { email } = Astro.props;
---
<div data-testid="tab-meetings">
  <p class="text-muted text-center py-12">
    Vergangene Gespräche werden hier angezeigt, sobald sie freigegeben wurden.
    <!-- Fully implemented in meeting-history plan -->
  </p>
</div>
```

- [ ] **Step 6: Commit**

```bash
git add src/components/portal/
git commit -m "feat: add portal tab components (Bookings, Invoices, Files, Signatures stub, Meetings stub)"
```

---

### Task 5: Create `/portal` page

**Files:**
- Create: `src/pages/portal.astro`

- [ ] **Step 1: Write portal page**

```astro
---
import Layout from '../layouts/Layout.astro';
import { getSession, getLoginUrl } from '../lib/auth';
import BookingsTab from '../components/portal/BookingsTab.astro';
import InvoicesTab from '../components/portal/InvoicesTab.astro';
import FilesTab from '../components/portal/FilesTab.astro';
import SignaturesTab from '../components/portal/SignaturesTab.astro';
import MeetingsTab from '../components/portal/MeetingsTab.astro';

const session = getSession(Astro.request.headers.get('cookie'));
if (!session) {
  return Astro.redirect(getLoginUrl('/portal'));
}

const tab = Astro.url.searchParams.get('tab') || 'bookings';

const TABS = [
  { id: 'bookings',   label: 'Termine',         testid: 'tab-bookings' },
  { id: 'invoices',   label: 'Rechnungen',       testid: 'tab-invoices' },
  { id: 'files',      label: 'Dateien',          testid: 'tab-files' },
  { id: 'signatures', label: 'Zur Unterschrift', testid: 'tab-signatures' },
  { id: 'meetings',   label: 'Vergangene Gespräche', testid: 'tab-meetings' },
];
---

<Layout title="Mein Bereich">
  <section class="pt-28 pb-20 bg-dark min-h-screen">
    <div class="max-w-5xl mx-auto px-6">
      <div class="mb-10 flex items-center justify-between">
        <div>
          <h1 class="text-3xl font-bold text-light font-serif">Mein Bereich</h1>
          <p class="text-muted mt-1">{session.name} · {session.email}</p>
        </div>
        <a href="/api/auth/logout" class="text-muted hover:text-gold text-sm transition-colors">Abmelden →</a>
      </div>

      <!-- Tab navigation -->
      <nav class="flex gap-1 border-b border-dark-lighter mb-8 overflow-x-auto" data-testid="portal-tabs">
        {TABS.map((t) => (
          <a
            href={`/portal?tab=${t.id}`}
            data-testid={t.testid}
            class={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors -mb-px ${
              tab === t.id
                ? 'border-gold text-gold'
                : 'border-transparent text-muted hover:text-light'
            }`}
          >
            {t.label}
          </a>
        ))}
      </nav>

      <!-- Tab content -->
      <div class="bg-dark-light rounded-2xl border border-dark-lighter p-6">
        {tab === 'bookings'   && <BookingsTab email={session.email} />}
        {tab === 'invoices'   && <InvoicesTab email={session.email} />}
        {tab === 'files'      && <FilesTab username={session.preferred_username} />}
        {tab === 'signatures' && <SignaturesTab username={session.preferred_username} />}
        {tab === 'meetings'   && <MeetingsTab email={session.email} />}
      </div>
    </div>
  </section>
</Layout>
```

- [ ] **Step 2: Run T1 and T3 tests**

```bash
cd /home/patrick/Bachelorprojekt/tests/e2e
BASE_URL=http://localhost:4321 npx playwright test fa-portal.spec.ts -k "T1" --reporter=line
```

Expected: T1 passes (redirect fires).

- [ ] **Step 3: Commit**

```bash
git add src/pages/portal.astro
git commit -m "feat: add /portal client view with 5-tab navigation"
```

---

### Task 6: Create `/admin` dashboard and `/admin/[clientId]` detail view

**Files:**
- Create: `src/pages/admin.astro`
- Create: `src/pages/admin/[clientId].astro`

- [ ] **Step 1: Write `admin.astro`**

```astro
---
import Layout from '../layouts/Layout.astro';
import { getSession, getLoginUrl, isAdmin } from '../lib/auth';
import { listUsers } from '../lib/keycloak';

const session = getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl('/admin'));
if (!isAdmin(session)) return new Response('Zugriff verweigert', { status: 403 });

// listUsers returns all Keycloak realm users
let users: Array<{ id: string; username: string; email: string; firstName?: string; lastName?: string }> = [];
try {
  users = await listUsers();
} catch { /* silent — show empty state */ }
---

<Layout title="Admin">
  <section class="pt-28 pb-20 bg-dark min-h-screen">
    <div class="max-w-5xl mx-auto px-6">
      <div class="mb-10 flex items-center justify-between">
        <h1 class="text-3xl font-bold text-light font-serif">Admin-Bereich</h1>
        <a href="/api/auth/logout" class="text-muted hover:text-gold text-sm">Abmelden →</a>
      </div>

      <div class="bg-dark-light rounded-2xl border border-dark-lighter overflow-hidden">
        <div class="px-6 py-4 border-b border-dark-lighter">
          <h2 class="text-lg font-semibold text-light">Alle Nutzer ({users.length})</h2>
        </div>
        {users.length === 0 ? (
          <p class="text-muted text-center py-12">Keine Nutzer gefunden.</p>
        ) : (
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-dark-lighter text-muted text-left">
                <th class="px-6 py-3">Name</th>
                <th class="px-6 py-3">E-Mail</th>
                <th class="px-6 py-3">Nutzername</th>
                <th class="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-dark-lighter">
              {users.map((u) => (
                <tr class="hover:bg-dark/40 transition-colors">
                  <td class="px-6 py-3 text-light">{u.firstName} {u.lastName}</td>
                  <td class="px-6 py-3 text-muted">{u.email}</td>
                  <td class="px-6 py-3 text-muted font-mono text-xs">{u.username}</td>
                  <td class="px-6 py-3">
                    <a href={`/admin/${u.id}`} class="text-gold hover:underline text-xs">Details →</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  </section>
</Layout>
```

- [ ] **Step 2: Add `listUsers()` to `src/lib/keycloak.ts`**

Read the current contents of `src/lib/keycloak.ts`, then add at the end:

```typescript
export async function listUsers(): Promise<Array<{
  id: string;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
}>> {
  const token = await getAdminToken();
  if (!token) return [];
  const res = await fetch(`${KC_URL}/admin/realms/${KC_REALM}/users?max=200`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.map((u: Record<string, string>) => ({
    id: u.id,
    username: u.username,
    email: u.email || '',
    firstName: u.firstName,
    lastName: u.lastName,
  }));
}
```

Note: `getAdminToken()` must already exist in keycloak.ts (it fetches a master realm admin token). Read the file before adding — if `getAdminToken` is named differently, use the correct name.

- [ ] **Step 3: Write `admin/[clientId].astro`**

```astro
---
import Layout from '../../layouts/Layout.astro';
import { getSession, getLoginUrl, isAdmin } from '../../lib/auth';
import BookingsTab from '../../components/portal/BookingsTab.astro';
import InvoicesTab from '../../components/portal/InvoicesTab.astro';
import FilesTab from '../../components/portal/FilesTab.astro';
import SignaturesTab from '../../components/portal/SignaturesTab.astro';
import MeetingsTab from '../../components/portal/MeetingsTab.astro';
import { getUserById } from '../../lib/keycloak';

const session = getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl('/admin'));
if (!isAdmin(session)) return new Response('Zugriff verweigert', { status: 403 });

const { clientId } = Astro.params;
const client = await getUserById(clientId!).catch(() => null);
if (!client) return new Response('Nutzer nicht gefunden', { status: 404 });

const tab = Astro.url.searchParams.get('tab') || 'bookings';

const TABS = [
  { id: 'bookings',   label: 'Termine' },
  { id: 'invoices',   label: 'Rechnungen' },
  { id: 'files',      label: 'Dateien' },
  { id: 'signatures', label: 'Unterschriften' },
  { id: 'meetings',   label: 'Gespräche' },
];
---

<Layout title={`Admin – ${client.firstName} ${client.lastName}`}>
  <section class="pt-28 pb-20 bg-dark min-h-screen">
    <div class="max-w-5xl mx-auto px-6">
      <div class="mb-6">
        <a href="/admin" class="text-muted hover:text-gold text-sm">← Alle Nutzer</a>
      </div>
      <div class="mb-8">
        <h1 class="text-2xl font-bold text-light font-serif">{client.firstName} {client.lastName}</h1>
        <p class="text-muted text-sm mt-1">{client.email} · {client.username}</p>
      </div>

      <nav class="flex gap-1 border-b border-dark-lighter mb-8 overflow-x-auto">
        {TABS.map((t) => (
          <a
            href={`/admin/${clientId}?tab=${t.id}`}
            class={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors -mb-px ${
              tab === t.id ? 'border-gold text-gold' : 'border-transparent text-muted hover:text-light'
            }`}
          >
            {t.label}
          </a>
        ))}
      </nav>

      <div class="bg-dark-light rounded-2xl border border-dark-lighter p-6">
        {tab === 'bookings'   && <BookingsTab email={client.email} />}
        {tab === 'invoices'   && <InvoicesTab email={client.email} />}
        {tab === 'files'      && <FilesTab username={client.username} />}
        {tab === 'signatures' && <SignaturesTab username={client.username} />}
        {tab === 'meetings'   && <MeetingsTab email={client.email} />}
      </div>
    </div>
  </section>
</Layout>
```

- [ ] **Step 4: Add `getUserById()` to `src/lib/keycloak.ts`**

```typescript
export async function getUserById(userId: string): Promise<{
  id: string; username: string; email: string; firstName?: string; lastName?: string;
} | null> {
  const token = await getAdminToken();
  if (!token) return null;
  const res = await fetch(`${KC_URL}/admin/realms/${KC_REALM}/users/${userId}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const u = await res.json();
  return { id: u.id, username: u.username, email: u.email || '', firstName: u.firstName, lastName: u.lastName };
}
```

- [ ] **Step 5: Build to check for errors**

```bash
cd /home/patrick/Bachelorprojekt/website && npm run build 2>&1 | tail -15
```

Expected: `[build] Complete!`

- [ ] **Step 6: Run T2 test**

```bash
cd /home/patrick/Bachelorprojekt/tests/e2e
BASE_URL=http://localhost:4321 npx playwright test fa-portal.spec.ts -k "T2" --reporter=line
```

Expected: T2 passes.

- [ ] **Step 7: Commit**

```bash
git add src/pages/admin.astro src/pages/admin/ src/lib/keycloak.ts
git commit -m "feat: add /admin dashboard and /admin/[clientId] detail view"
```
