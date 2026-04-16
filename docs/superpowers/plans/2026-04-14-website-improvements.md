# Website Improvements (BR-3adf, BR-d624, BR-4b91, BR-b576) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement four user-reported improvements: multiple screenshots in bug widget, bug status page, unified contact+booking hub, and DSGVO data management page.

**Architecture:** All changes stay in `website/src/`. DB changes go in `k3d/meetings-schema.yaml` (new `bug_tickets` table). No new services required — extends existing pg pool in `meetings-db.ts`, existing Keycloak admin API in `keycloak.ts`, and existing Astro layout.

**Tech Stack:** Astro 4, Svelte 5 (runes: `$state`, `$derived`, `$props`), TypeScript, PostgreSQL (pg.Pool), Keycloak Admin API, Tailwind CSS.

---

## File Map

**Create:**
- `website/src/components/ContactHub.svelte` — three-tile hub (message / termin / callback) with inline accordion forms
- `website/src/components/DataManagement.svelte` — cookie status, session info, DSGVO request buttons
- `website/src/pages/status.astro` — public bug status lookup page
- `website/src/pages/meine-daten.astro` — public DSGVO data management page
- `website/src/pages/api/status.ts` — GET endpoint for ticket status lookup
- `website/src/pages/api/dsgvo-request.ts` — POST endpoint for DSGVO email requests
- `website/src/pages/api/auth/delete-account.ts` — POST endpoint for account deletion

**Modify:**
- `website/src/components/BugReportWidget.svelte` — `file: File|null` → `files: File[]`, multi-file UI
- `website/src/components/BookingForm.svelte` — add `initialType?: string` prop
- `website/src/pages/kontakt.astro` — replace `<ContactForm>` with `<ContactHub>`
- `website/src/pages/termin.astro` — rebuild as 301 redirect to `/kontakt?mode=termin`
- `website/src/pages/api/bug-report.ts` — `get('screenshot')` → `getAll('screenshot')`, loop upload, insert into bug_tickets
- `website/src/pages/api/mattermost/dialog-submit.ts` — add UPDATE bug_tickets on resolve
- `website/src/pages/api/mattermost/actions.ts` — add UPDATE bug_tickets on archive_bug
- `website/src/lib/meetings-db.ts` — add bug_tickets functions
- `website/src/lib/keycloak.ts` — export `deleteUser(userId)`
- `website/src/layouts/Layout.astro` — add "Meine Daten" link in footer
- `k3d/meetings-schema.yaml` — add `bug_tickets` table to SQL init script
- `website/src/pages/datenschutz.astro` — add section 8 with link to /meine-daten

---

## Task 1: BR-3adf — Multiple Screenshots in BugReportWidget

**Files:**
- Modify: `website/src/components/BugReportWidget.svelte`
- Modify: `website/src/pages/api/bug-report.ts`

- [ ] **Step 1: Write a curl test for current behavior (baseline)**

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST https://web.mentolder.de/api/bug-report \
  -F "description=Baseline test" \
  -F "email=test@example.com" \
  -F "category=fehler" \
  -F "url=https://web.mentolder.de" \
  -F "userAgent=test" \
  -F "viewport=1920x1080"
```
Expected: `200`

- [ ] **Step 2: Update `BugReportWidget.svelte` — replace single file state with array**

Replace the entire `<script lang="ts">` section (lines 1–127):

```svelte
<script lang="ts">
  let open = $state(false);
  let description = $state('');
  let files = $state<File[]>([]);
  let fileError = $state('');
  let submitting = $state(false);
  let result = $state<{ success: boolean; message: string } | null>(null);
  let email = $state('');
  let category = $state<'fehler' | 'verbesserung' | 'erweiterungswunsch'>('fehler');

  let triggerButtonEl = $state<HTMLButtonElement | null>(null);
  let dialogEl = $state<HTMLDivElement | null>(null);
  let fileInputEl = $state<HTMLInputElement | null>(null);

  const MAX_BYTES = 5 * 1024 * 1024;
  const MAX_FILES = 3;
  const ALLOWED = ['image/png', 'image/jpeg', 'image/webp'];
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function openModal() {
    open = true;
    result = null;
  }

  function closeModal() {
    if (submitting) return;
    open = false;
  }

  function resetForm() {
    description = '';
    email = '';
    category = 'fehler';
    files = [];
    fileError = '';
    result = null;
    if (fileInputEl) fileInputEl.value = '';
  }

  function onFileChange(e: Event) {
    fileError = '';
    const input = e.target as HTMLInputElement;
    if (!input.files) return;

    const incoming = Array.from(input.files);
    for (const picked of incoming) {
      if (files.length >= MAX_FILES) {
        fileError = `Maximal ${MAX_FILES} Screenshots erlaubt.`;
        break;
      }
      if (picked.size > MAX_BYTES) {
        fileError = `"${picked.name}" ist zu groß (max. 5 MB).`;
        continue;
      }
      if (!ALLOWED.includes(picked.type)) {
        fileError = `"${picked.name}": Nur PNG, JPEG oder WEBP erlaubt.`;
        continue;
      }
      files = [...files, picked];
    }
    // Reset input so the same file can be re-added after removal
    input.value = '';
  }

  function removeFile(index: number) {
    files = files.filter((_, i) => i !== index);
    fileError = '';
  }

  const canSubmit = $derived(
    description.trim().length > 0 &&
    EMAIL_RE.test(email) &&
    !submitting &&
    !fileError
  );

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!canSubmit) return;
    submitting = true;
    result = null;

    const fd = new FormData();
    fd.append('description', description.trim());
    fd.append('email', email.trim());
    fd.append('category', category);
    fd.append('url', window.location.href);
    fd.append('userAgent', navigator.userAgent);
    fd.append('viewport', `${window.innerWidth}x${window.innerHeight}`);
    for (const file of files) {
      fd.append('screenshot', file, file.name);
    }

    try {
      const res = await fetch('/api/bug-report', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok) {
        const ticketId = data.ticketId ?? '';
        const successMsg = ticketId
          ? `Vielen Dank! Ihre Meldung wurde als ${ticketId} aufgenommen.`
          : 'Vielen Dank! Ihre Meldung wurde übermittelt.';
        result = { success: true, message: successMsg };
        resetForm();
        setTimeout(() => { open = false; result = null; }, 2000);
      } else {
        result = { success: false, message: data.error || 'Fehler beim Übermitteln.' };
      }
    } catch {
      result = { success: false, message: 'Verbindungsfehler. Bitte versuchen Sie es erneut.' };
    } finally {
      submitting = false;
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) closeModal();
  }

  let effectInitialized = false;
  $effect(() => {
    const isOpen = open;
    if (!effectInitialized) {
      effectInitialized = true;
      return;
    }
    if (isOpen && dialogEl) {
      const first = dialogEl.querySelector<HTMLElement>('textarea, button, input, [tabindex]:not([tabindex="-1"])');
      first?.focus();
    } else if (!isOpen && triggerButtonEl) {
      triggerButtonEl.focus();
    }
  });
</script>
```

- [ ] **Step 3: Update the screenshot section in the template (BugReportWidget.svelte)**

Replace the existing screenshot `<div>` block (the one with label "Screenshot", lines 213–234 in original):

```svelte
        <div>
          <label for="bug-screenshot" class="block text-sm font-medium text-light mb-1">
            Screenshots <span class="text-muted-dark">(optional, bis zu 3, max. 5 MB je Bild)</span>
          </label>
          {#if files.length < 3}
            <input
              id="bug-screenshot"
              bind:this={fileInputEl}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              onchange={onFileChange}
              class="block w-full text-sm text-muted file:mr-3 file:py-2 file:px-3 file:rounded file:border-0 file:bg-gold file:text-dark file:font-semibold hover:file:bg-gold-light cursor-pointer"
            />
          {/if}
          {#if files.length > 0}
            <ul class="mt-2 space-y-1">
              {#each files as file, i}
                <li class="text-xs text-muted flex items-center gap-2">
                  <span>{file.name} ({(file.size / 1024).toFixed(1)} KB)</span>
                  <button
                    type="button"
                    onclick={() => removeFile(i)}
                    class="text-gold hover:underline bg-transparent border-0 cursor-pointer"
                  >Entfernen</button>
                </li>
              {/each}
            </ul>
          {/if}
          {#if fileError}
            <p class="text-xs text-red-400 mt-1">{fileError}</p>
          {/if}
        </div>
```

- [ ] **Step 4: Update `bug-report.ts` — accept multiple screenshots**

Replace the single-file handling block (lines 51–75 in original, starting with `const screenshot = formData.get('screenshot')`) with:

```typescript
    const screenshots = formData.getAll('screenshot');

    const validFiles: File[] = [];
    for (const item of screenshots) {
      if (!(item instanceof File) || item.size === 0) continue;
      if (item.size > MAX_BYTES) {
        return jsonError(`Datei "${item.name}" zu groß (max. 5 MB).`, 400);
      }
      if (!ALLOWED_MIME.has(item.type)) {
        return jsonError(`"${item.name}": Dateiformat nicht unterstützt. Erlaubt: PNG, JPEG, WEBP.`, 400);
      }
      validFiles.push(item);
    }
    if (validFiles.length > 3) {
      return jsonError('Maximal 3 Screenshots erlaubt.', 400);
    }
```

Replace the single-file upload section (the `let fileId` block, lines 96–103 in original) with:

```typescript
    // Upload screenshots — best-effort, partial failure is a soft warning
    const fileIds: string[] = [];
    let uploadWarning = '';
    if (validFiles.length > 0 && channelId) {
      for (const f of validFiles) {
        const fid = await uploadFile({ channelId, file: f });
        if (fid) {
          fileIds.push(fid);
        } else {
          uploadWarning = '\n\n:warning: Ein oder mehrere Screenshots konnten nicht hochgeladen werden';
        }
      }
    }
```

Replace the `postInteractiveMessage` call's `fileIds` line (`fileIds: fileId ? [fileId] : undefined`):

```typescript
        fileIds: fileIds.length > 0 ? fileIds : undefined,
```

- [ ] **Step 5: Verify multi-screenshot submission**

```bash
# Create two minimal valid PNGs
python3 -c "
import struct, zlib, os
def make_png():
    w, h = 4, 4
    raw = b'\\x00' + b'\\xff\\x00\\x00' * w
    raw = raw * h
    compressed = zlib.compress(raw)
    def chunk(tag, data):
        crc = zlib.crc32(tag + data) & 0xffffffff
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', crc)
    sig = b'\\x89PNG\\r\\n\\x1a\\n'
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
    idat = chunk(b'IDAT', compressed)
    iend = chunk(b'IEND', b'')
    return sig + ihdr + idat + iend
open('/tmp/t1.png','wb').write(make_png())
open('/tmp/t2.png','wb').write(make_png())
print('PNGs created')
"

curl -s -X POST https://web.mentolder.de/api/bug-report \
  -F "description=Test zwei Screenshots" \
  -F "email=test@example.com" \
  -F "category=fehler" \
  -F "url=https://web.mentolder.de" \
  -F "userAgent=test" \
  -F "viewport=1920x1080" \
  -F "screenshot=@/tmp/t1.png;type=image/png" \
  -F "screenshot=@/tmp/t2.png;type=image/png"
```
Expected: `{"success":true,"ticketId":"BR-..."}` — verify Mattermost bugs channel shows 2 attached images.

- [ ] **Step 6: Commit**

```bash
git add website/src/components/BugReportWidget.svelte website/src/pages/api/bug-report.ts
git commit -m "feat(website): BR-3adf — support up to 3 screenshots in bug widget"
```

---

## Task 2: BR-d624 — Bug Status Database + API

**Files:**
- Modify: `k3d/meetings-schema.yaml`
- Modify: `website/src/lib/meetings-db.ts`
- Modify: `website/src/pages/api/bug-report.ts`
- Modify: `website/src/pages/api/mattermost/dialog-submit.ts`
- Modify: `website/src/pages/api/mattermost/actions.ts`
- Create: `website/src/pages/api/status.ts`

### Step 2a — Add bug_tickets table to schema

- [ ] **Step 1: Add bug_tickets table to meetings-schema.yaml**

In `k3d/meetings-schema.yaml`, add the following SQL block immediately before the `-- Indexes for MCP query patterns` comment:

```sql
      -- Bug report tickets (status tracking for /status page)
      CREATE TABLE IF NOT EXISTS bug_tickets (
        ticket_id       TEXT PRIMARY KEY,
        status          TEXT NOT NULL DEFAULT 'open'
            CHECK (status IN ('open', 'resolved', 'archived')),
        category        TEXT NOT NULL,
        reporter_email  TEXT NOT NULL,
        description     TEXT NOT NULL,
        url             TEXT,
        brand           TEXT NOT NULL DEFAULT 'mentolder',
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        resolved_at     TIMESTAMPTZ,
        resolution_note TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_bug_tickets_status ON bug_tickets(status);
```

- [ ] **Step 2: Apply schema migration to the running cluster**

```bash
# Restart shared-db to re-run init scripts (dev cluster only — prod uses task workspace:prod:deploy)
kubectl rollout restart deployment/shared-db -n workspace
kubectl rollout status deployment/shared-db -n workspace --timeout=60s

# Verify table was created
kubectl exec -n workspace deployment/shared-db -- \
  psql -U meetings -d meetings -c "\d bug_tickets"
```
Expected: table with columns `ticket_id, status, category, reporter_email, description, url, brand, created_at, resolved_at, resolution_note`.

### Step 2b — Add DB helper functions

- [ ] **Step 3: Append bug_tickets functions to meetings-db.ts**

Add to the end of `website/src/lib/meetings-db.ts`:

```typescript
// ── Bug Tickets ──────────────────────────────────────────────────────────────

export async function insertBugTicket(params: {
  ticketId: string;
  category: string;
  reporterEmail: string;
  description: string;
  url: string;
  brand: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO bug_tickets (ticket_id, category, reporter_email, description, url, brand)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (ticket_id) DO NOTHING`,
    [params.ticketId, params.category, params.reporterEmail,
     params.description, params.url, params.brand]
  );
}

export async function resolveBugTicket(ticketId: string, resolutionNote: string): Promise<void> {
  await pool.query(
    `UPDATE bug_tickets
     SET status = 'resolved', resolved_at = NOW(), resolution_note = $2
     WHERE ticket_id = $1`,
    [ticketId, resolutionNote]
  );
}

export async function archiveBugTicket(ticketId: string): Promise<void> {
  await pool.query(
    `UPDATE bug_tickets SET status = 'archived' WHERE ticket_id = $1`,
    [ticketId]
  );
}

export interface BugTicketStatus {
  ticketId: string;
  status: 'open' | 'resolved' | 'archived';
  category: string;
  createdAt: Date;
  resolvedAt: Date | null;
  resolutionNote: string | null;
}

export async function getBugTicketStatus(ticketId: string): Promise<BugTicketStatus | null> {
  const result = await pool.query(
    `SELECT ticket_id as "ticketId", status, category,
            created_at as "createdAt", resolved_at as "resolvedAt",
            resolution_note as "resolutionNote"
     FROM bug_tickets WHERE ticket_id = $1`,
    [ticketId]
  );
  return result.rows[0] ?? null;
}
```

### Step 2c — Wire up DB writes in existing API routes

- [ ] **Step 4: Add insertBugTicket call to bug-report.ts**

Add import at the top of `website/src/pages/api/bug-report.ts`:

```typescript
import { insertBugTicket } from '../../lib/meetings-db';
```

After the final `if (!delivered) { return jsonError(...) }` block and before the `return new Response(...)`, add:

```typescript
    // Persist ticket to DB for /status lookups (best-effort)
    try {
      await insertBugTicket({
        ticketId,
        category,
        reporterEmail: email,
        description,
        url,
        brand: BRAND,
      });
    } catch (err) {
      console.warn('[bug-report] DB insert failed (non-fatal):', err);
    }
```

- [ ] **Step 5: Add resolveBugTicket call to dialog-submit.ts**

Add import in `website/src/pages/api/mattermost/dialog-submit.ts`:

```typescript
import { resolveBugTicket } from '../../../lib/meetings-db';
```

After `await updatePost(state.postId, updatedMessage);`, add:

```typescript
    // Update ticket status in DB (best-effort)
    try {
      await resolveBugTicket(state.ticketId, note);
    } catch (err) {
      console.warn('[dialog-submit] DB update failed (non-fatal):', err);
    }
```

- [ ] **Step 6: Add archiveBugTicket call to actions.ts**

Add import in `website/src/pages/api/mattermost/actions.ts`:

```typescript
import { archiveBugTicket } from '../../../lib/meetings-db';
```

In the `archive_bug` case, after `await updatePost(post_id, ...)`:

```typescript
        // Update ticket status in DB (best-effort)
        try {
          await archiveBugTicket(ticketId);
        } catch (err) {
          console.warn('[actions] archive DB update failed (non-fatal):', err);
        }
```

### Step 2d — Create /api/status.ts endpoint

- [ ] **Step 7: Create website/src/pages/api/status.ts**

```typescript
import type { APIRoute } from 'astro';
import { getBugTicketStatus } from '../../lib/meetings-db';

const TICKET_RE = /^BR-\d{8}-[0-9a-f]{4}$/;

// Simple in-memory rate limiting: max 10 requests per minute per IP
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  if (entry.count >= 10) return true;
  entry.count++;
  return false;
}

export const GET: APIRoute = async ({ request }) => {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim()
    ?? request.headers.get('x-real-ip')
    ?? 'unknown';

  if (isRateLimited(ip)) {
    return new Response(
      JSON.stringify({ error: 'Zu viele Anfragen. Bitte warten Sie eine Minute.' }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const url = new URL(request.url);
  const id = (url.searchParams.get('id') ?? '').trim();

  if (!TICKET_RE.test(id)) {
    return new Response(
      JSON.stringify({ error: 'Ungültiges Ticket-ID-Format. Erwartet: BR-YYYYMMDD-xxxx' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const ticket = await getBugTicketStatus(id);
    if (!ticket) {
      return new Response(
        JSON.stringify({ error: 'Ticket nicht gefunden.' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        ticketId: ticket.ticketId,
        status: ticket.status,
        category: ticket.category,
        createdAt: ticket.createdAt,
        resolvedAt: ticket.resolvedAt,
        resolutionNote: ticket.resolutionNote,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[status] DB lookup failed:', err);
    return new Response(
      JSON.stringify({ error: 'Interner Serverfehler.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
```

- [ ] **Step 8: Verify API endpoint**

```bash
# Should return 400 (bad format)
curl -s "https://web.mentolder.de/api/status?id=invalid"
# Expected: {"error":"Ungültiges Ticket-ID-Format..."}

# Should return 404 (not found)
curl -s "https://web.mentolder.de/api/status?id=BR-20260101-0000"
# Expected: {"error":"Ticket nicht gefunden."}
```

- [ ] **Step 9: Commit**

```bash
git add k3d/meetings-schema.yaml \
        website/src/lib/meetings-db.ts \
        website/src/pages/api/bug-report.ts \
        website/src/pages/api/mattermost/dialog-submit.ts \
        website/src/pages/api/mattermost/actions.ts \
        website/src/pages/api/status.ts
git commit -m "feat(website): BR-d624 — add bug_tickets DB schema + status API endpoint"
```

---

## Task 3: BR-d624 — /status Page (frontend)

**Files:**
- Create: `website/src/pages/status.astro`

- [ ] **Step 1: Create website/src/pages/status.astro**

Note: The client-side script uses `textContent` for user-derived data and only uses safe DOM methods — no unsanitized HTML injection.

```astro
---
import Layout from '../layouts/Layout.astro';
---

<Layout title="Bug-Status" description="Ticket-Status Ihrer Bug-Meldung prüfen.">
  <section class="pt-28 pb-20 bg-dark min-h-screen">
    <div class="max-w-2xl mx-auto px-6">
      <div class="text-center mb-10">
        <h1 class="text-4xl font-bold text-light mb-3 font-serif">Bug-Status prüfen</h1>
        <p class="text-muted">Ticket-ID aus der Bestätigungsmeldung eingeben.</p>
      </div>

      <div class="bg-dark-light rounded-2xl border border-dark-lighter p-8">
        <div class="flex gap-3">
          <input
            id="ticket-input"
            type="text"
            placeholder="BR-20260414-9214"
            maxlength="18"
            class="flex-1 px-4 py-2.5 rounded border border-dark-lighter bg-dark text-light focus:border-gold focus:ring-2 focus:ring-gold-dim font-mono text-sm"
          />
          <button
            id="search-btn"
            class="bg-gold hover:bg-gold-light text-dark px-5 py-2.5 rounded font-semibold transition-colors cursor-pointer"
          >
            Suchen
          </button>
        </div>
        <p class="text-xs text-muted-dark mt-2">Keine Registrierung nötig.</p>

        <div id="result-area" class="hidden mt-6"></div>
      </div>
    </div>
  </section>
</Layout>

<script>
  const input = document.getElementById('ticket-input') as HTMLInputElement;
  const btn = document.getElementById('search-btn') as HTMLButtonElement;
  const resultArea = document.getElementById('result-area') as HTMLDivElement;

  function setVisible(el: HTMLElement, visible: boolean) {
    el.classList.toggle('hidden', !visible);
  }

  function formatDate(iso: string | null): string {
    if (!iso) return '–';
    return new Date(iso).toLocaleDateString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  }

  function categoryLabel(cat: string): string {
    const map: Record<string, string> = {
      fehler: 'Fehler',
      verbesserung: 'Verbesserung',
      erweiterungswunsch: 'Erweiterungswunsch',
    };
    return map[cat] ?? cat;
  }

  // Build result DOM using safe DOM APIs — no innerHTML with user data
  function renderResult(data: {
    ticketId: string;
    status: string;
    category: string;
    createdAt: string;
    resolvedAt: string | null;
    resolutionNote: string | null;
  }) {
    resultArea.textContent = '';

    // Header row: ticket ID + badge
    const header = document.createElement('div');
    header.className = 'flex items-center gap-3 mb-4';

    const idEl = document.createElement('span');
    idEl.className = 'font-mono text-gold font-semibold';
    idEl.textContent = data.ticketId;

    const badge = document.createElement('span');
    badge.className = 'text-xs px-2 py-0.5 rounded-full font-semibold border';
    if (data.status === 'resolved') {
      badge.classList.add('bg-green-900/40', 'text-green-300', 'border-green-800');
      badge.textContent = '✓ Erledigt';
    } else if (data.status === 'archived') {
      badge.classList.add('bg-gray-800', 'text-gray-400', 'border-gray-700');
      badge.textContent = '🗂 Archiviert';
    } else {
      badge.classList.add('bg-yellow-900/40', 'text-yellow-300', 'border-yellow-800');
      badge.textContent = '🕐 Offen';
    }
    header.appendChild(idEl);
    header.appendChild(badge);

    // Details table
    const table = document.createElement('table');
    table.className = 'w-full border-collapse';
    const rows: [string, string, string][] = [
      ['Kategorie', categoryLabel(data.category), 'text-light'],
      ['Gemeldet', formatDate(data.createdAt), 'text-light'],
    ];
    if (data.resolvedAt) {
      rows.push(['Behoben am', formatDate(data.resolvedAt), 'text-green-300']);
    }
    for (const [label, value, valueClass] of rows) {
      const tr = document.createElement('tr');
      const tdLabel = document.createElement('td');
      tdLabel.className = 'text-muted-dark py-1.5 pr-6 text-sm w-36';
      tdLabel.textContent = label;
      const tdValue = document.createElement('td');
      tdValue.className = `${valueClass} text-sm`;
      tdValue.textContent = value;
      tr.appendChild(tdLabel);
      tr.appendChild(tdValue);
      table.appendChild(tr);
    }

    // Resolution note
    let noteEl: HTMLDivElement | null = null;
    if (data.resolutionNote) {
      noteEl = document.createElement('div');
      noteEl.className = 'mt-4 p-3 bg-dark rounded border-l-4 border-green-600';
      const noteLabel = document.createElement('p');
      noteLabel.className = 'text-xs text-muted-dark mb-1';
      noteLabel.textContent = 'Lösungshinweis';
      const noteText = document.createElement('p');
      noteText.className = 'text-sm text-muted';
      noteText.textContent = data.resolutionNote;
      noteEl.appendChild(noteLabel);
      noteEl.appendChild(noteText);
    }

    const footer = document.createElement('p');
    footer.className = 'text-xs text-muted-dark mt-4';
    footer.textContent = 'Bei weiteren Fragen nutzen Sie das Bug-Formular erneut.';

    resultArea.appendChild(header);
    resultArea.appendChild(table);
    if (noteEl) resultArea.appendChild(noteEl);
    resultArea.appendChild(footer);
  }

  async function search() {
    const id = input.value.trim().toUpperCase();
    if (!id) return;

    btn.disabled = true;
    btn.textContent = '...';
    setVisible(resultArea, true);
    resultArea.textContent = '';

    const loading = document.createElement('p');
    loading.className = 'text-sm text-muted';
    loading.textContent = 'Suche...';
    resultArea.appendChild(loading);

    try {
      const res = await fetch(`/api/status?id=${encodeURIComponent(id)}`);
      const data = await res.json();
      resultArea.textContent = '';

      if (!res.ok) {
        const err = document.createElement('p');
        err.className = 'text-red-400 text-sm';
        err.textContent = data.error ?? 'Fehler bei der Abfrage.';
        resultArea.appendChild(err);
        return;
      }

      renderResult(data);
    } catch {
      resultArea.textContent = '';
      const err = document.createElement('p');
      err.className = 'text-red-400 text-sm';
      err.textContent = 'Verbindungsfehler. Bitte versuchen Sie es erneut.';
      resultArea.appendChild(err);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Suchen';
    }
  }

  btn.addEventListener('click', search);
  input.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Enter') search(); });
</script>
```

- [ ] **Step 2: Verify /status page loads**

```bash
curl -s -o /dev/null -w "%{http_code}" https://web.mentolder.de/status
```
Expected: `200`. Open in browser, search for `BR-99999999-0000` — should show "Ticket nicht gefunden." as plain text.

- [ ] **Step 3: Commit**

```bash
git add website/src/pages/status.astro
git commit -m "feat(website): BR-d624 — add /status page for ticket lookup"
```

---

## Task 4: BR-4b91 — ContactHub Component

**Files:**
- Create: `website/src/components/ContactHub.svelte`
- Modify: `website/src/components/BookingForm.svelte`
- Modify: `website/src/pages/kontakt.astro`
- Modify: `website/src/pages/termin.astro`

- [ ] **Step 1: Add `initialType` prop to BookingForm.svelte**

Change the Props interface and destructuring (lines 14–19):

```svelte
  interface Props {
    initialDate?: string;
    initialStart?: string;
    initialEnd?: string;
    initialType?: string;
  }
  let { initialDate = '', initialStart = '', initialEnd = '', initialType = '' } = $props<Props>();
```

Change the `bookingType` state initialization (line 24):

```svelte
  let bookingType = $state(initialType || 'erstgespraech');
```

- [ ] **Step 2: Create ContactHub.svelte**

```svelte
<script lang="ts">
  import ContactForm from './ContactForm.svelte';
  import BookingForm from './BookingForm.svelte';

  interface Props {
    initialMode?: 'message' | 'termin' | 'callback' | null;
  }
  let { initialMode = null } = $props<Props>();

  let activeMode = $state<'message' | 'termin' | 'callback' | null>(initialMode);

  function setMode(mode: 'message' | 'termin' | 'callback') {
    activeMode = activeMode === mode ? null : mode;
  }

  const tiles: Array<{ id: 'message' | 'termin' | 'callback'; icon: string; label: string; sub: string }> = [
    { id: 'message',  icon: '✉️', label: 'Nachricht schreiben', sub: 'Schildern Sie Ihr Anliegen' },
    { id: 'termin',   icon: '📅', label: 'Termin buchen',       sub: 'Erstgespräch oder Meeting' },
    { id: 'callback', icon: '📞', label: 'Rückruf anfragen',    sub: 'Wir melden uns bei Ihnen' },
  ];
</script>

<div>
  <!-- Tiles -->
  <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
    {#each tiles as tile}
      <button
        type="button"
        onclick={() => setMode(tile.id)}
        class="text-left p-5 rounded-xl border transition-all cursor-pointer
          {activeMode === tile.id
            ? 'border-gold bg-gold/10'
            : 'border-dark-lighter bg-dark hover:border-gold/40'}"
      >
        <span class="text-2xl block mb-2" aria-hidden="true">{tile.icon}</span>
        <span class="font-semibold text-light block text-sm">{tile.label}</span>
        <span class="text-xs text-muted block mt-1">{tile.sub}</span>
      </button>
    {/each}
  </div>

  <!-- Accordion form area -->
  {#if activeMode === 'message'}
    <div class="bg-dark-light rounded-xl border border-dark-lighter p-6">
      <ContactForm />
    </div>
  {:else if activeMode === 'termin'}
    <div class="bg-dark-light rounded-xl border border-dark-lighter p-6">
      <BookingForm initialType="erstgespraech" />
    </div>
  {:else if activeMode === 'callback'}
    <div class="bg-dark-light rounded-xl border border-dark-lighter p-6">
      <BookingForm initialType="callback" />
    </div>
  {/if}
</div>
```

- [ ] **Step 3: Update kontakt.astro to use ContactHub**

Replace `website/src/pages/kontakt.astro` entirely:

```astro
---
import Layout from '../layouts/Layout.astro';
import ContactHub from '../components/ContactHub.svelte';
import { config } from '../config/index';

const { contact, kontakt } = config;

const rawMode = Astro.url.searchParams.get('mode') ?? '';
const initialMode = ['message', 'termin', 'callback'].includes(rawMode)
  ? (rawMode as 'message' | 'termin' | 'callback')
  : null;
---

<Layout title="Kontakt" description="Nehmen Sie Kontakt auf. Kostenloses Erstgespräch vereinbaren.">
  <section class="pt-28 pb-20 bg-dark">
    <div class="max-w-5xl mx-auto px-6">
      <div class="text-center mb-14">
        <h1 class="text-4xl md:text-5xl font-bold text-light mb-4 font-serif">Kontakt aufnehmen</h1>
        <p class="text-xl text-muted max-w-2xl mx-auto">{kontakt.intro}</p>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-5 gap-12">
        <div class="lg:col-span-3 bg-dark-light rounded-2xl border border-dark-lighter p-8">
          <ContactHub client:load initialMode={initialMode} />
        </div>

        <div class="lg:col-span-2 space-y-8">
          <div class="bg-dark-light rounded-2xl border border-dark-lighter p-8">
            <h2 class="text-xl font-bold text-gold mb-6 font-serif">Direkt erreichen</h2>
            <div class="space-y-5">
              {kontakt.showPhone && contact.phone && (
                <div class="flex items-start gap-4">
                  <svg class="w-6 h-6 text-gold flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                  <div>
                    <p class="font-medium text-light">Telefon</p>
                    <a href={`tel:${contact.phone}`} class="text-gold hover:underline text-lg">{contact.phone}</a>
                  </div>
                </div>
              )}
              <div class="flex items-start gap-4">
                <svg class="w-6 h-6 text-gold flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                <div>
                  <p class="font-medium text-light">E-Mail</p>
                  <a href={`mailto:${contact.email}`} class="text-gold hover:underline text-lg">{contact.email}</a>
                </div>
              </div>
              <div class="flex items-start gap-4">
                <svg class="w-6 h-6 text-gold flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                <div>
                  <p class="font-medium text-light">Standort</p>
                  <p class="text-muted text-lg">{contact.city} und Umgebung</p>
                </div>
              </div>
            </div>
          </div>

          <div class="bg-dark-light rounded-2xl p-8 border-l-4 border-gold">
            <h2 class="text-xl font-bold text-light mb-4 font-serif">{kontakt.sidebarTitle}</h2>
            <p class="text-muted leading-relaxed">{kontakt.sidebarText}</p>
            <p class="text-gold font-semibold mt-4">{kontakt.sidebarCta}</p>
          </div>

          {kontakt.showSteps && (
            <div class="bg-dark-light rounded-2xl p-8 border border-dark-lighter">
              <h2 class="text-xl font-bold text-light mb-4 font-serif">Wie geht es weiter?</h2>
              <ol class="space-y-3 text-muted">
                <li class="flex gap-3"><span class="text-gold font-bold">1.</span><span>Sie schreiben mir über das Formular oder per E-Mail</span></li>
                <li class="flex gap-3"><span class="text-gold font-bold">2.</span><span>Ich melde mich innerhalb von 24 Stunden</span></li>
                <li class="flex gap-3"><span class="text-gold font-bold">3.</span><span>Wir vereinbaren ein Kennenlerngespräch</span></li>
                <li class="flex gap-3"><span class="text-gold font-bold">4.</span><span>Danach entscheiden Sie, ob wir zusammenarbeiten</span></li>
              </ol>
            </div>
          )}
        </div>
      </div>
    </div>
  </section>
</Layout>
```

- [ ] **Step 4: Rebuild termin.astro as a 301 redirect**

Replace `website/src/pages/termin.astro` entirely:

```astro
---
// BR-4b91: /termin redirects to /kontakt?mode=termin, preserving ?date, ?start, ?end params
const params = new URLSearchParams();
params.set('mode', 'termin');
const date = Astro.url.searchParams.get('date');
const start = Astro.url.searchParams.get('start');
const end = Astro.url.searchParams.get('end');
if (date) params.set('date', date);
if (start) params.set('start', start);
if (end) params.set('end', end);
return Astro.redirect(`/kontakt?${params.toString()}`, 301);
---
```

- [ ] **Step 5: Verify ContactHub and redirect**

```bash
# Redirect: should return 301
curl -s -o /dev/null -w "%{http_code}" https://web.mentolder.de/termin

# With query params
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" \
  "https://web.mentolder.de/termin?date=2026-05-01&start=10:00&end=10:30"
```
Expected: `301`. Second call expected redirect URL contains `mode=termin&date=2026-05-01`.

Open `https://web.mentolder.de/kontakt` in browser. Verify: 3 tiles render. Click "Nachricht schreiben" → ContactForm expands. Click again → collapses. Navigate to `/kontakt?mode=termin` → Termin tile pre-selected and BookingForm visible.

- [ ] **Step 6: Commit**

```bash
git add website/src/components/ContactHub.svelte \
        website/src/components/BookingForm.svelte \
        website/src/pages/kontakt.astro \
        website/src/pages/termin.astro
git commit -m "feat(website): BR-4b91 — unify /kontakt with 3-tile ContactHub, redirect /termin"
```

---

## Task 5: BR-b576 — deleteUser + delete-account endpoint

**Files:**
- Modify: `website/src/lib/keycloak.ts`
- Create: `website/src/pages/api/auth/delete-account.ts`

- [ ] **Step 1: Append deleteUser export to keycloak.ts**

Add at the end of `website/src/lib/keycloak.ts`:

```typescript
export async function deleteUser(userId: string): Promise<boolean> {
  try {
    const res = await kcApi('DELETE', `/users/${encodeURIComponent(userId)}`);
    return res.ok || res.status === 404;
  } catch (err) {
    console.error('[keycloak] deleteUser failed:', err);
    return false;
  }
}
```

- [ ] **Step 2: Create delete-account.ts endpoint**

```typescript
import type { APIRoute } from 'astro';
import { getSession, clearSessionCookie } from '../../../lib/auth';
import { deleteUser } from '../../../lib/keycloak';

export const POST: APIRoute = async ({ request }) => {
  const cookieHeader = request.headers.get('cookie');
  const session = await getSession(cookieHeader);

  if (!session) {
    return new Response(
      JSON.stringify({ error: 'Nicht angemeldet.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const ok = await deleteUser(session.sub);

  if (!ok) {
    return new Response(
      JSON.stringify({ error: 'Account-Löschung fehlgeschlagen. Bitte wenden Sie sich an uns.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ success: true }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': clearSessionCookie(),
      },
    }
  );
};
```

- [ ] **Step 3: Verify endpoint rejects unauthenticated requests**

```bash
curl -s -X POST https://web.mentolder.de/api/auth/delete-account
```
Expected: `{"error":"Nicht angemeldet."}` with HTTP 401.

- [ ] **Step 4: Commit**

```bash
git add website/src/lib/keycloak.ts website/src/pages/api/auth/delete-account.ts
git commit -m "feat(website): BR-b576 — add deleteUser to keycloak.ts + delete-account endpoint"
```

---

## Task 6: BR-b576 — DataManagement Component + /meine-daten Page

**Files:**
- Create: `website/src/components/DataManagement.svelte`
- Create: `website/src/pages/meine-daten.astro`
- Create: `website/src/pages/api/dsgvo-request.ts`
- Modify: `website/src/layouts/Layout.astro`
- Modify: `website/src/pages/datenschutz.astro`

- [ ] **Step 1: Create /api/dsgvo-request.ts**

```typescript
import type { APIRoute } from 'astro';
import { sendEmail } from '../../lib/email';

const CONTACT_EMAIL = process.env.CONTACT_EMAIL || '';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const POST: APIRoute = async ({ request }) => {
  try {
    const formData = await request.formData();
    const type = (formData.get('type')?.toString() ?? '').trim();
    const name = (formData.get('name')?.toString() ?? '').trim().slice(0, 200);
    const email = (formData.get('email')?.toString() ?? '').trim().slice(0, 200);

    if (!['auskunft', 'loeschung'].includes(type)) {
      return new Response(JSON.stringify({ error: 'Ungültiger Anfragetyp.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (!name || name.length < 2) {
      return new Response(JSON.stringify({ error: 'Bitte geben Sie Ihren Namen an.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (!EMAIL_RE.test(email)) {
      return new Response(JSON.stringify({ error: 'Bitte geben Sie eine gültige E-Mail-Adresse an.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const typeLabel = type === 'auskunft' ? 'DSGVO-Auskunftsanfrage' : 'DSGVO-Löschungsanfrage';
    await sendEmail({
      to: CONTACT_EMAIL,
      subject: `${typeLabel} von ${name}`,
      text: `Neue ${typeLabel}\n\nName: ${name}\nE-Mail: ${email}\n\nBitte innerhalb von 30 Tagen bearbeiten.`,
      replyTo: email,
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[dsgvo-request] failed:', err);
    return new Response(JSON.stringify({ error: 'Interner Serverfehler.' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
```

- [ ] **Step 2: Create DataManagement.svelte**

```svelte
<script lang="ts">
  import { onMount } from 'svelte';

  // ── Cookie consent ────────────────────────────────────────────────────────
  let cookieConsent = $state<string | null>(null);

  // ── Session ───────────────────────────────────────────────────────────────
  type AuthState = 'loading' | 'authenticated' | 'unauthenticated';
  let authState = $state<AuthState>('loading');
  let userName = $state('');
  let userEmail = $state('');

  // ── Request forms ─────────────────────────────────────────────────────────
  let showAuskunftForm = $state(false);
  let showLoeschForm = $state(false);
  let requestName = $state('');
  let requestEmail = $state('');
  let requestSubmitting = $state(false);
  let requestResult = $state<{ success: boolean; message: string } | null>(null);

  // ── Delete account (authenticated) ────────────────────────────────────────
  let showDeleteConfirm = $state(false);
  let deleteSubmitting = $state(false);
  let deleteResult = $state<{ success: boolean; message: string } | null>(null);

  onMount(async () => {
    cookieConsent = localStorage.getItem('cookie_consent_v1');
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      if (data.authenticated) {
        authState = 'authenticated';
        userName = data.user.name || data.user.username || '';
        userEmail = data.user.email || '';
      } else {
        authState = 'unauthenticated';
      }
    } catch {
      authState = 'unauthenticated';
    }
  });

  function reopenCookieConsent() {
    window.dispatchEvent(new Event('cookie-consent-reopen'));
  }

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const canSubmitRequest = $derived(
    requestName.trim().length > 0 && EMAIL_RE.test(requestEmail) && !requestSubmitting
  );

  async function submitRequest(type: 'auskunft' | 'loeschung') {
    requestSubmitting = true;
    requestResult = null;
    try {
      const fd = new FormData();
      fd.append('type', type);
      fd.append('name', requestName.trim());
      fd.append('email', requestEmail.trim());
      const res = await fetch('/api/dsgvo-request', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok) {
        requestResult = {
          success: true,
          message: 'Ihre Anfrage wurde übermittelt. Wir melden uns innerhalb von 30 Tagen.',
        };
        requestName = '';
        requestEmail = '';
        showAuskunftForm = false;
        showLoeschForm = false;
      } else {
        requestResult = { success: false, message: data.error || 'Fehler beim Senden.' };
      }
    } catch {
      requestResult = { success: false, message: 'Verbindungsfehler. Bitte erneut versuchen.' };
    } finally {
      requestSubmitting = false;
    }
  }

  async function deleteAccount() {
    deleteSubmitting = true;
    deleteResult = null;
    try {
      const res = await fetch('/api/auth/delete-account', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        deleteResult = { success: true, message: 'Ihr Account wurde gelöscht.' };
        setTimeout(() => { window.location.href = '/'; }, 2000);
      } else {
        deleteResult = { success: false, message: data.error || 'Fehler beim Löschen.' };
        showDeleteConfirm = false;
      }
    } catch {
      deleteResult = { success: false, message: 'Verbindungsfehler. Bitte erneut versuchen.' };
      showDeleteConfirm = false;
    } finally {
      deleteSubmitting = false;
    }
  }
</script>

<div class="space-y-4">

  <!-- Section 1: Cookie Consent -->
  <div class="bg-dark-light border border-dark-lighter rounded-xl p-6">
    <div class="flex justify-between items-center mb-4">
      <h2 class="text-gold font-semibold">🍪 Cookie-Einstellungen</h2>
      {#if cookieConsent}
        <span class="text-xs bg-green-900/40 text-green-300 border border-green-800 px-2 py-0.5 rounded-full">Gesetzt</span>
      {:else}
        <span class="text-xs bg-dark border border-dark-lighter text-muted px-2 py-0.5 rounded-full">Nicht gesetzt</span>
      {/if}
    </div>
    <table class="w-full text-sm mb-4">
      <tr>
        <td class="text-muted py-1 pr-6 w-40">Einstellung</td>
        <td class="text-light">{cookieConsent ? 'Alle Cookies akzeptiert' : 'Keine Einwilligung gespeichert'}</td>
      </tr>
      <tr>
        <td class="text-muted py-1">Gespeichert in</td>
        <td class="text-light font-mono text-xs">localStorage · cookie_consent_v1</td>
      </tr>
    </table>
    <button
      type="button"
      onclick={reopenCookieConsent}
      class="text-sm border border-dark-lighter text-muted hover:text-light px-4 py-1.5 rounded cursor-pointer bg-transparent transition-colors"
    >
      Einstellungen ändern
    </button>
  </div>

  <!-- Section 2: Session -->
  <div class="bg-dark-light border border-dark-lighter rounded-xl p-6">
    <div class="flex justify-between items-center mb-4">
      <h2 class="text-gold font-semibold">🔑 Anmeldung / Session</h2>
      {#if authState === 'authenticated'}
        <span class="text-xs bg-blue-900/40 text-blue-300 border border-blue-800 px-2 py-0.5 rounded-full">Angemeldet</span>
      {:else if authState === 'unauthenticated'}
        <span class="text-xs bg-dark border border-dark-lighter text-muted px-2 py-0.5 rounded-full">Nicht eingeloggt</span>
      {/if}
    </div>

    {#if authState === 'loading'}
      <p class="text-sm text-muted">Wird geladen...</p>
    {:else if authState === 'authenticated'}
      <table class="w-full text-sm mb-4">
        <tr><td class="text-muted py-1 pr-6 w-40">Name</td><td class="text-light">{userName}</td></tr>
        <tr><td class="text-muted py-1">E-Mail</td><td class="text-light">{userEmail}</td></tr>
      </table>
      <a href="/api/auth/logout"
        class="text-sm border border-dark-lighter text-muted hover:text-light px-4 py-1.5 rounded transition-colors inline-block">
        Ausloggen
      </a>
    {:else}
      <p class="text-sm text-muted mb-4">Kein Benutzerkonto angemeldet. Sitzungs-Cookies werden beim Schließen des Browsers automatisch gelöscht.</p>
      <a href="/portal"
        class="text-sm border border-dark-lighter text-muted hover:text-light px-4 py-1.5 rounded transition-colors inline-block">
        Zum Login
      </a>
    {/if}
  </div>

  <!-- Section 3: Data requests -->
  <div class="bg-dark-light border border-dark-lighter rounded-xl p-6">
    <h2 class="text-gold font-semibold mb-3">📋 Anfragen &amp; gespeicherte Daten</h2>
    <p class="text-sm text-muted mb-4 leading-relaxed">
      Wenn Sie über das Kontaktformular oder das Bug-Formular Daten übermittelt haben, können Sie
      eine Auskunft oder Löschung dieser Daten beantragen. Wir bearbeiten Ihren Antrag innerhalb
      von 30 Tagen.
    </p>

    {#if requestResult}
      <div class="p-3 rounded text-sm mb-4 {requestResult.success
          ? 'bg-green-900/30 text-green-300 border border-green-800'
          : 'bg-red-900/30 text-red-300 border border-red-800'}">
        {requestResult.message}
      </div>
    {/if}

    {#if !showAuskunftForm && !showLoeschForm}
      <div class="flex gap-3 flex-wrap">
        <button type="button" onclick={() => { showAuskunftForm = true; }}
          class="text-sm border border-gold text-gold hover:bg-gold/10 px-4 py-1.5 rounded cursor-pointer bg-transparent transition-colors">
          Auskunft anfordern
        </button>
        {#if authState === 'unauthenticated'}
          <button type="button" onclick={() => { showLoeschForm = true; }}
            class="text-sm border border-red-600 text-red-400 hover:bg-red-900/20 px-4 py-1.5 rounded cursor-pointer bg-transparent transition-colors">
            Löschung beantragen
          </button>
        {:else if authState === 'authenticated'}
          <button type="button" onclick={() => { showDeleteConfirm = true; }}
            class="text-sm border border-red-600 text-red-400 hover:bg-red-900/20 px-4 py-1.5 rounded cursor-pointer bg-transparent transition-colors">
            Account löschen
          </button>
        {/if}
      </div>
    {/if}

    <!-- Auskunft form -->
    {#if showAuskunftForm}
      <form onsubmit={(e) => { e.preventDefault(); submitRequest('auskunft'); }} class="space-y-3 mt-2">
        <p class="text-sm text-muted">Bitte geben Sie Ihren Namen und Ihre E-Mail-Adresse an.</p>
        <input type="text" bind:value={requestName} placeholder="Ihr Name" required
          class="w-full px-3 py-2 rounded border border-dark-lighter bg-dark text-light text-sm focus:border-gold" />
        <input type="email" bind:value={requestEmail} placeholder="Ihre E-Mail-Adresse" required
          class="w-full px-3 py-2 rounded border border-dark-lighter bg-dark text-light text-sm focus:border-gold" />
        <div class="flex gap-3">
          <button type="submit" disabled={!canSubmitRequest}
            class="text-sm bg-gold hover:bg-gold-light disabled:bg-dark-lighter text-dark px-4 py-1.5 rounded cursor-pointer font-semibold transition-colors">
            {requestSubmitting ? 'Wird gesendet...' : 'Anfrage senden'}
          </button>
          <button type="button" onclick={() => { showAuskunftForm = false; }}
            class="text-sm border border-dark-lighter text-muted px-4 py-1.5 rounded cursor-pointer bg-transparent">
            Abbrechen
          </button>
        </div>
      </form>
    {/if}

    <!-- Löschung form (unauthenticated only) -->
    {#if showLoeschForm}
      <form onsubmit={(e) => { e.preventDefault(); submitRequest('loeschung'); }} class="space-y-3 mt-2">
        <p class="text-sm text-muted">Bitte geben Sie Ihren Namen und Ihre E-Mail-Adresse an.</p>
        <input type="text" bind:value={requestName} placeholder="Ihr Name" required
          class="w-full px-3 py-2 rounded border border-dark-lighter bg-dark text-light text-sm focus:border-gold" />
        <input type="email" bind:value={requestEmail} placeholder="Ihre E-Mail-Adresse" required
          class="w-full px-3 py-2 rounded border border-dark-lighter bg-dark text-light text-sm focus:border-gold" />
        <div class="flex gap-3">
          <button type="submit" disabled={!canSubmitRequest}
            class="text-sm bg-red-700 hover:bg-red-600 disabled:bg-dark-lighter text-white px-4 py-1.5 rounded cursor-pointer font-semibold transition-colors">
            {requestSubmitting ? 'Wird gesendet...' : 'Löschung beantragen'}
          </button>
          <button type="button" onclick={() => { showLoeschForm = false; }}
            class="text-sm border border-dark-lighter text-muted px-4 py-1.5 rounded cursor-pointer bg-transparent">
            Abbrechen
          </button>
        </div>
      </form>
    {/if}

    <!-- Delete confirm (authenticated only) -->
    {#if showDeleteConfirm}
      <div class="mt-4 p-4 border border-red-800 rounded-xl bg-red-950/30">
        <p class="text-sm text-red-300 font-semibold mb-2">Account wirklich löschen?</p>
        <p class="text-xs text-red-400 mb-4">
          Dieser Vorgang kann nicht rückgängig gemacht werden. Ihr Keycloak-Account und alle
          damit verbundenen Zugriffe werden sofort gelöscht.
        </p>
        {#if deleteResult}
          <p class="text-sm mb-3 {deleteResult.success ? 'text-green-300' : 'text-red-400'}">{deleteResult.message}</p>
        {/if}
        <div class="flex gap-3">
          <button type="button" onclick={deleteAccount} disabled={deleteSubmitting}
            class="text-sm bg-red-700 hover:bg-red-600 disabled:bg-dark-lighter text-white px-4 py-1.5 rounded cursor-pointer font-semibold transition-colors">
            {deleteSubmitting ? 'Wird gelöscht...' : 'Ja, Account löschen'}
          </button>
          <button type="button" onclick={() => { showDeleteConfirm = false; }}
            class="text-sm border border-dark-lighter text-muted px-4 py-1.5 rounded cursor-pointer bg-transparent">
            Abbrechen
          </button>
        </div>
      </div>
    {/if}
  </div>

</div>
```

- [ ] **Step 3: Create meine-daten.astro**

```astro
---
import Layout from '../layouts/Layout.astro';
import DataManagement from '../components/DataManagement.svelte';
---

<Layout title="Meine Daten" description="Übersicht Ihrer gespeicherten Daten und DSGVO-Rechte.">
  <section class="pt-28 pb-20 bg-dark min-h-screen">
    <div class="max-w-2xl mx-auto px-6">
      <div class="text-center mb-10">
        <h1 class="text-4xl font-bold text-light mb-3 font-serif">Meine Daten</h1>
        <p class="text-muted">Übersicht Ihrer gespeicherten Daten und Einstellungen auf dieser Website.</p>
      </div>
      <DataManagement client:load />
    </div>
  </section>
</Layout>
```

- [ ] **Step 4: Add "Meine Daten" link to Layout.astro footer**

In `website/src/layouts/Layout.astro`, find the "Rechtliches" list and add after the Datenschutz `<li>`:

```astro
              <li><a href="/meine-daten" class="hover:text-gold transition-colors">Meine Daten</a></li>
```

The result: Impressum → Datenschutz → **Meine Daten** → AGB → Cookie-Einstellungen.

- [ ] **Step 5: Add section 8 to datenschutz.astro**

In `website/src/pages/datenschutz.astro`, add before the closing `</div>` of the prose container (after the "Aktualität" paragraph):

```astro
      <h2>8. Ihre Rechte online ausüben</h2>
      <p>
        Sie können Ihre Datenschutzrechte direkt auf dieser Website ausüben.
        Unter <a href="/meine-daten">Meine Daten</a> können Sie Ihre Cookie-Einstellungen
        einsehen, Ihren Anmeldestatus prüfen sowie Auskunft über Ihre gespeicherten Daten
        anfordern oder die Löschung beantragen.
      </p>
```

- [ ] **Step 6: Verify /meine-daten page**

```bash
curl -s -o /dev/null -w "%{http_code}" https://web.mentolder.de/meine-daten
```
Expected: `200`. Open in browser: 3 sections (Cookie, Session, Anfragen) visible. "Einstellungen ändern" button works. "Auskunft anfordern" expands inline form. Unauthenticated state shows "Zum Login" link.

- [ ] **Step 7: Commit**

```bash
git add website/src/components/DataManagement.svelte \
        website/src/pages/meine-daten.astro \
        website/src/pages/api/dsgvo-request.ts \
        website/src/layouts/Layout.astro \
        website/src/pages/datenschutz.astro
git commit -m "feat(website): BR-b576 — add /meine-daten DSGVO page with DataManagement component"
```

---

## Task 7: Deploy + Mattermost Status Updates

- [ ] **Step 1: Deploy all changes**

```bash
task website:redeploy
kubectl rollout status deployment/website -n website --timeout=120s
```

- [ ] **Step 2: Smoke-test all 4 features**

```bash
# BR-3adf: returns 200
curl -s -o /dev/null -w "BR-3adf: %{http_code}\n" -X POST https://web.mentolder.de/api/bug-report \
  -F "description=smoke" -F "email=t@t.de" -F "category=fehler" \
  -F "url=https://web.mentolder.de" -F "userAgent=smoke" -F "viewport=1920x1080"

# BR-d624: status API returns 400 for bad ID
curl -s "https://web.mentolder.de/api/status?id=bad" | grep -q "Ungültig" && echo "BR-d624 API: OK"

# BR-d624: /status page returns 200
curl -s -o /dev/null -w "BR-d624 page: %{http_code}\n" https://web.mentolder.de/status

# BR-4b91: /termin returns 301
curl -s -o /dev/null -w "BR-4b91: %{http_code}\n" https://web.mentolder.de/termin

# BR-b576: /meine-daten returns 200
curl -s -o /dev/null -w "BR-b576: %{http_code}\n" https://web.mentolder.de/meine-daten
```

- [ ] **Step 3: Post Mattermost status update**

```bash
MM_TOKEN="933t6rdx1fgftyy9tr4953jzyh"
TEAM_ID=$(curl -s -H "Authorization: Bearer $MM_TOKEN" \
  https://chat.mentolder.de/api/v4/teams | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")
CHAN_ID=$(curl -s -H "Authorization: Bearer $MM_TOKEN" \
  "https://chat.mentolder.de/api/v4/teams/$TEAM_ID/channels/name/bugs" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

curl -s -X POST https://chat.mentolder.de/api/v4/posts \
  -H "Authorization: Bearer $MM_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"channel_id\":\"$CHAN_ID\",\"message\":\":white_check_mark: **Alle 4 Verbesserungswünsche implementiert und live:**\n\n- **BR-3adf** — Bug-Widget akzeptiert jetzt bis zu 3 Screenshots\n- **BR-d624** — Neue Seite /status zur Ticket-Status-Abfrage\n- **BR-4b91** — /kontakt mit 3 Kacheln (Nachricht / Termin / Rückruf); /termin leitet weiter\n- **BR-b576** — Neue Seite /meine-daten mit Cookie-, Session- und DSGVO-Verwaltung\"}"
```

---

## Self-Review

**Spec coverage:**
- BR-3adf: Widget (File[] state, multi-file UI, removeFile) + API (getAll, loop validate/upload, max 3) ✓
- BR-4b91: ContactHub (3 tiles, accordion, ?mode= param), BookingForm initialType prop, termin.astro 301 redirect ✓
- BR-d624: bug_tickets schema in meetings-schema.yaml, 4 DB functions in meetings-db.ts, insertBugTicket in bug-report.ts, resolveBugTicket in dialog-submit.ts, archiveBugTicket in actions.ts, /api/status.ts with rate limiting, /status.astro ✓
- BR-b576: deleteUser in keycloak.ts, /api/auth/delete-account.ts, /api/dsgvo-request.ts, DataManagement.svelte (3 sections + both delete flows), /meine-daten.astro, footer link, datenschutz section 8 ✓

**Security:** status.astro uses DOM creation methods (`createElement`, `textContent`) — no unsanitized HTML injection. All user input validated server-side before DB writes or email sends.

**Type consistency:** `BugTicketStatus` defined in meetings-db.ts and returned from `getBugTicketStatus()`. `insertBugTicket` / `resolveBugTicket` / `archiveBugTicket` signatures match their call sites. `deleteUser(userId: string)` receives `session.sub` (string) from auth.ts `UserSession`.
