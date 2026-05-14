# Document Signing Implementation Plan

> ⚠️ **Veraltet:** Dieser Plan referenziert Mattermost (entfernt 2026-04). Signing-Bestätigungen müssen über einen anderen Kanal (z.B. Outline oder Datenbank-Log) abgebildet werden.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clients see documents pending their signature in the portal. They open each document in Collabora, read it, click "Gelesen und akzeptiert" — this timestamps a confirmation record to Mattermost and Outline, then moves the file to a `signed/` folder.

**Architecture:** Admin drops a PDF into `/Clients/<username>/pending-signatures/` in Nextcloud. The client portal lists these files in the "Zur Unterschrift" tab. Each document links to `/portal/document?path=<encoded>&name=<name>` where a Collabora iframe renders the file and a confirm button calls `POST /api/signing/confirm`. The confirm endpoint hashes the file, moves it to `signed/`, logs to Mattermost and Outline. **Depends on:** Client Portal plan (`nextcloud-files.ts` and `SignaturesTab.astro` stub already created).

**Tech Stack:** Astro SSR, `lib/nextcloud-files.ts`, `lib/mattermost.ts`, `lib/outline.ts`, Nextcloud WOPI / Collabora iframe.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/components/portal/SignaturesTab.astro` | Replace stub | List pending + signed documents with links |
| `src/pages/portal/document.astro` | Create | Document viewer — Collabora iframe + confirm button |
| `src/pages/api/signing/confirm.ts` | Create | POST — hash, move file, log to Mattermost + Outline |
| `tests/e2e/specs/fa-document-signing.spec.ts` | Create | Playwright E2E tests |

---

### Task 1: Write failing Playwright tests

**Files:**
- Create: `tests/e2e/specs/fa-document-signing.spec.ts`

- [ ] **Step 1: Write tests**

```typescript
import { test, expect } from '@playwright/test';
const BASE = process.env.BASE_URL || 'http://localhost:4321';

test.describe('Document Signing', () => {
  test('T1 – /api/signing/confirm requires auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/signing/confirm`, {
      data: { documentName: 'test.pdf', documentPath: '/Clients/test/pending-signatures/test.pdf' },
    });
    expect(res.status()).toBe(401);
  });

  test('T2 – /portal/document requires auth', async ({ page }) => {
    await page.goto(`${BASE}/portal/document?path=%2FClients%2Ftest%2Fpending-signatures%2Ftest.pdf&name=test.pdf`);
    expect(page.url()).not.toContain('/portal/document');
  });

  test('T3 – /api/signing/confirm rejects path traversal', async ({ request }) => {
    // Simulate a logged-in client trying to sign another user's document
    const res = await request.post(`${BASE}/api/signing/confirm`, {
      data: {
        documentName: 'evil.pdf',
        documentPath: '/Clients/other-user/pending-signatures/evil.pdf',
      },
      headers: { Cookie: 'workspace_session=invalid' },
    });
    // Either 401 (no valid session) or 403 (path not owned by user)
    expect([401, 403]).toContain(res.status());
  });
});
```

- [ ] **Step 2: Run to confirm all fail**

```bash
cd /home/patrick/Bachelorprojekt/tests/e2e
BASE_URL=http://localhost:4321 npx playwright test fa-document-signing.spec.ts --reporter=line
```

Expected: T1 fails (404, endpoint missing), T2 fails (200, page missing), T3 fails (404).

---

### Task 2: Create `POST /api/signing/confirm`

**Files:**
- Create: `src/pages/api/signing/confirm.ts`

- [ ] **Step 1: Write endpoint**

```typescript
import type { APIRoute } from 'astro';
import { createHash } from 'node:crypto';
import { getSession } from '../../../lib/auth';
import { downloadFile, moveFile, ensureDirectory } from '../../../lib/nextcloud-files';
import { postToChannel, getFirstTeamId, getOrCreateCustomerChannel } from '../../../lib/mattermost';
import { getOrCreateCollection, createDocument, updateDocument, searchDocuments } from '../../../lib/outline';

export const POST: APIRoute = async ({ request }) => {
  // 1. Auth check
  const session = getSession(request.headers.get('cookie'));
  if (!session) {
    return new Response(JSON.stringify({ error: 'Nicht authentifiziert' }), { status: 401 });
  }

  let body: { documentName: string; documentPath: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Ungültige Anfrage' }), { status: 400 });
  }

  // 2. Path ownership check — path must be under /Clients/<session.preferred_username>/
  const expectedPrefix = `/Clients/${session.preferred_username}/pending-signatures/`;
  if (!body.documentPath.startsWith(expectedPrefix)) {
    return new Response(JSON.stringify({ error: 'Zugriff verweigert' }), { status: 403 });
  }

  // 3. Download file and compute SHA-256 hash
  const fileBuffer = await downloadFile(body.documentPath);
  if (!fileBuffer) {
    return new Response(JSON.stringify({ error: 'Dokument nicht gefunden' }), { status: 404 });
  }
  const sha256 = createHash('sha256').update(fileBuffer).digest('hex');

  // 4. Move file: pending-signatures/ → signed/
  const signedDir = `/Clients/${session.preferred_username}/signed/`;
  await ensureDirectory(signedDir);
  const signedPath = `${signedDir}${body.documentName}`;
  const moved = await moveFile(body.documentPath, signedPath);
  if (!moved) {
    return new Response(JSON.stringify({ error: 'Datei konnte nicht verschoben werden' }), { status: 500 });
  }

  // 5. Timestamp and log
  const now = new Date();
  const dateStr = now.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' UTC';
  const confirmationMsg = [
    `✅ **${session.name}** hat **${body.documentName}** am ${dateStr} um ${timeStr} akzeptiert.`,
    `SHA-256: \`${sha256.slice(0, 16)}…\``,
  ].join('\n');

  // 6. Post to Mattermost client channel
  try {
    const teamId = await getFirstTeamId();
    if (teamId) {
      const channel = await getOrCreateCustomerChannel(teamId, session.preferred_username);
      if (channel) {
        await postToChannel(channel.id, confirmationMsg);
      }
    }
  } catch { /* non-fatal */ }

  // 7. Append to Outline client collection
  try {
    const collection = await getOrCreateCollection(
      `Kunde: ${session.name}`,
      `Kundendaten für ${session.name} (${session.email})`
    );
    if (collection) {
      const sigTableRow = `| ${body.documentName} | ${session.name} | ${dateStr} | ${timeStr} | \`${sha256.slice(0, 16)}…\` |`;
      const existing = await searchDocuments('Unterschriften', collection.id);
      const sigDoc = existing.find((d) => d.title === 'Unterschriften');
      if (sigDoc) {
        await updateDocument(sigDoc.id, `\n${sigTableRow}`, true);
      } else {
        await createDocument({
          title: 'Unterschriften',
          text: `# Unterschriften\n\n| Dokument | Akzeptiert von | Datum | Uhrzeit | Hash (SHA-256) |\n|----------|----------------|-------|---------|----------------|\n${sigTableRow}`,
          collectionId: collection.id,
          publish: true,
        });
      }
    }
  } catch { /* non-fatal */ }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
```

- [ ] **Step 2: Run T1 and T3 tests**

```bash
cd /home/patrick/Bachelorprojekt/tests/e2e
BASE_URL=http://localhost:4321 npx playwright test fa-document-signing.spec.ts -k "T1|T3" --reporter=line
```

Expected: T1 passes (401), T3 passes (401 with invalid cookie).

- [ ] **Step 3: Commit**

```bash
git add src/pages/api/signing/confirm.ts
git commit -m "feat: add POST /api/signing/confirm with hash, move, Mattermost + Outline logging"
```

---

### Task 3: Create `/portal/document` viewer page

**Files:**
- Create: `src/pages/portal/document.astro`

- [ ] **Step 1: Write document viewer**

```astro
---
import Layout from '../../layouts/Layout.astro';
import { getSession, getLoginUrl } from '../../lib/auth';

const session = getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl('/portal?tab=signatures'));

const documentPath = Astro.url.searchParams.get('path') ?? '';
const documentName = Astro.url.searchParams.get('name') ?? 'Dokument';

// Validate path ownership
const expectedPrefix = `/Clients/${session.preferred_username}/pending-signatures/`;
const isPending = documentPath.startsWith(expectedPrefix);

if (!isPending) {
  return new Response('Zugriff verweigert', { status: 403 });
}

// Build Nextcloud Collabora WOPI URL
const NC_EXTERNAL = process.env.NEXTCLOUD_EXTERNAL_URL || '';
const NC_USER = process.env.NEXTCLOUD_CALDAV_USER || 'admin';
// Collabora opens via Nextcloud's /apps/richdocuments/wopi/files/ endpoint.
// We use the simpler inline viewer: Nextcloud's file preview URL.
const previewUrl = NC_EXTERNAL
  ? `${NC_EXTERNAL}/remote.php/dav/files/${NC_USER}${documentPath}`
  : '';
---

<Layout title={documentName}>
  <section class="pt-28 pb-20 bg-dark min-h-screen">
    <div class="max-w-4xl mx-auto px-6">
      <div class="mb-6">
        <a href="/portal?tab=signatures" class="text-muted hover:text-gold text-sm">← Zurück zu Dokumenten</a>
      </div>

      <div class="mb-6 flex items-center justify-between">
        <h1 class="text-2xl font-bold text-light font-serif truncate">{documentName}</h1>
      </div>

      <!-- Document viewer -->
      <div class="bg-dark-light rounded-2xl border border-dark-lighter overflow-hidden mb-6">
        {previewUrl ? (
          <iframe
            src={previewUrl}
            title={documentName}
            class="w-full"
            style="height: 70vh; border: none;"
          />
        ) : (
          <div class="flex items-center justify-center h-64">
            <p class="text-muted">Dokumentvorschau nicht verfügbar (NEXTCLOUD_EXTERNAL_URL nicht konfiguriert).</p>
          </div>
        )}
      </div>

      <!-- Confirm section -->
      <div class="bg-dark-light rounded-2xl border border-dark-lighter p-6" id="confirm-section">
        <h2 class="text-lg font-semibold text-light mb-2">Bestätigung</h2>
        <p class="text-muted text-sm mb-6">
          Durch Klicken bestätigen Sie, dass Sie dieses Dokument vollständig gelesen haben und
          mit dem Inhalt einverstanden sind. Ihre Bestätigung wird mit Datum und Uhrzeit protokolliert.
        </p>
        <button
          id="confirm-btn"
          class="px-8 py-3 bg-gold text-dark rounded-full font-bold hover:bg-gold-light transition-colors"
        >
          Gelesen und akzeptiert
        </button>
        <p id="confirm-error" class="text-red-400 text-sm mt-3 hidden">
          Fehler beim Senden der Bestätigung. Bitte versuchen Sie es erneut.
        </p>
      </div>
    </div>
  </section>
</Layout>

<script define:vars={{ documentPath, documentName }}>
  document.getElementById('confirm-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('confirm-btn');
    const errEl = document.getElementById('confirm-error');
    if (!btn) return;

    btn.textContent = '…';
    btn.setAttribute('disabled', 'true');

    const res = await fetch('/api/signing/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentName, documentPath }),
    });

    if (res.ok) {
      const section = document.getElementById('confirm-section');
      if (section) {
        section.innerHTML = `
          <div class="text-center py-6">
            <p class="text-green-400 text-2xl mb-2">✓</p>
            <p class="text-light font-semibold text-lg">Bestätigung erhalten</p>
            <p class="text-muted text-sm mt-2">Ihre Bestätigung wurde protokolliert.</p>
            <a href="/portal?tab=signatures" class="inline-block mt-6 text-gold hover:underline text-sm">
              Zurück zur Übersicht
            </a>
          </div>
        `;
      }
    } else {
      errEl?.classList.remove('hidden');
      btn.textContent = 'Gelesen und akzeptiert';
      btn.removeAttribute('disabled');
    }
  });
</script>
```

- [ ] **Step 2: Run T2 test**

```bash
cd /home/patrick/Bachelorprojekt/tests/e2e
BASE_URL=http://localhost:4321 npx playwright test fa-document-signing.spec.ts -k "T2" --reporter=line
```

Expected: T2 passes (redirect fires for unauthenticated request).

- [ ] **Step 3: Commit**

```bash
git add src/pages/portal/document.astro
git commit -m "feat: add /portal/document viewer with Collabora iframe and confirm button"
```

---

### Task 4: Replace `SignaturesTab.astro` stub with full implementation

**Files:**
- Replace: `src/components/portal/SignaturesTab.astro`

- [ ] **Step 1: Replace stub**

```astro
---
import { listFiles } from '../../lib/nextcloud-files';

interface Props { username: string; }
const { username } = Astro.props;

const pendingFiles = await listFiles(`/Clients/${username}/pending-signatures/`).catch(() => []);
const signedFiles = await listFiles(`/Clients/${username}/signed/`).catch(() => []);
---

<div data-testid="tab-signatures">
  <!-- Pending -->
  <div class="mb-8">
    <h3 class="text-sm font-semibold text-gold uppercase tracking-wider mb-4">
      Ausstehend ({pendingFiles.length})
    </h3>
    {pendingFiles.length === 0 ? (
      <p class="text-muted text-sm">Keine Dokumente zur Unterschrift vorhanden.</p>
    ) : (
      <ul class="space-y-3">
        {pendingFiles.map((f) => {
          const encodedPath = encodeURIComponent(`/Clients/${username}/pending-signatures/${f.name}`);
          const encodedName = encodeURIComponent(f.name);
          return (
            <li class="flex items-center justify-between bg-dark rounded-xl border border-gold/30 px-5 py-4">
              <div>
                <p class="font-medium text-light">{f.name}</p>
                <p class="text-muted text-xs mt-0.5">{(f.size / 1024).toFixed(1)} KB</p>
              </div>
              <a
                href={`/portal/document?path=${encodedPath}&name=${encodedName}`}
                class="px-4 py-2 bg-gold text-dark rounded-full text-sm font-bold hover:bg-gold-light transition-colors"
              >
                Lesen & Bestätigen
              </a>
            </li>
          );
        })}
      </ul>
    )}
  </div>

  <!-- Signed -->
  {signedFiles.length > 0 && (
    <div>
      <h3 class="text-sm font-semibold text-muted uppercase tracking-wider mb-4">
        Bereits bestätigt ({signedFiles.length})
      </h3>
      <ul class="space-y-2">
        {signedFiles.map((f) => (
          <li class="flex items-center justify-between px-5 py-3 rounded-xl border border-dark-lighter">
            <p class="text-muted text-sm">{f.name}</p>
            <span class="text-green-400 text-xs font-medium">✓ Bestätigt</span>
          </li>
        ))}
      </ul>
    </div>
  )}
</div>
```

- [ ] **Step 2: Build to confirm no errors**

```bash
cd /home/patrick/Bachelorprojekt/website && npm run build 2>&1 | tail -10
```

Expected: `[build] Complete!`

- [ ] **Step 3: Run all signing tests**

```bash
cd /home/patrick/Bachelorprojekt/tests/e2e
BASE_URL=http://localhost:4321 npx playwright test fa-document-signing.spec.ts --reporter=line
```

Expected: all 3 pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/portal/SignaturesTab.astro
git commit -m "feat: full SignaturesTab with pending + signed document lists and confirm flow"
```

---

### Task 5: Nextcloud folder bootstrap

The signing flow assumes `/Clients/<username>/pending-signatures/` exists in Nextcloud. Add a utility that creates this structure when a new client is approved.

**Files:**
- Modify: `src/pages/api/mattermost/actions.ts`

- [ ] **Step 1: After Keycloak user creation in `approve_registration`, create Nextcloud folders**

In `src/pages/api/mattermost/actions.ts`, inside the `approve_registration` case, after `await sendPasswordResetEmail(result.userId)`, add:

```typescript
// Create Nextcloud client folder structure
const { ensureDirectory } = await import('../../../lib/nextcloud-files');
const username = email.split('@')[0]; // or use Keycloak username if available
await ensureDirectory(`/Clients/${username}/`);
await ensureDirectory(`/Clients/${username}/pending-signatures/`);
await ensureDirectory(`/Clients/${username}/signed/`);
statusParts.push(':folder: Nextcloud-Ordner erstellt');
```

- [ ] **Step 2: Build to confirm no errors**

```bash
cd /home/patrick/Bachelorprojekt/website && npm run build 2>&1 | tail -5
```

Expected: `[build] Complete!`

- [ ] **Step 3: Commit**

```bash
git add src/pages/api/mattermost/actions.ts
git commit -m "feat: create Nextcloud client folder structure on registration approval"
```
