# Admin Shortcuts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin kann im Dashboard eine Leiste mit eigenen externen HTTPS-Shortcuts verwalten, die das Favicon der jeweiligen Zielseite anzeigen.

**Architecture:** Neue Tabelle `admin_shortcuts` in der bestehenden PostgreSQL-Datenbank. Drei neue API-Endpunkte (create, delete, fetch-title). Interaktive Svelte-5-Komponente im Admin-Dashboard.

**Tech Stack:** Astro 5, Svelte 5 (`$state`-Runes), TypeScript, PostgreSQL (`pg`-Pool), Google Favicon Service

---

## File Map

| Datei | Aktion | Inhalt |
|-------|--------|--------|
| `website/src/lib/website-db.ts` | Modify | DB-Init + `listAdminShortcuts`, `createAdminShortcut`, `deleteAdminShortcut` |
| `website/src/pages/api/admin/shortcuts/fetch-title.ts` | Create | `GET ?url=` — holt `<title>` server-seitig |
| `website/src/pages/api/admin/shortcuts/create.ts` | Create | `POST` — neuen Shortcut anlegen |
| `website/src/pages/api/admin/shortcuts/delete.ts` | Create | `DELETE` — Shortcut löschen |
| `website/src/components/admin/AdminShortcuts.svelte` | Create | Interaktive Shortcut-Leiste mit Formular und Löschen |
| `website/src/pages/admin.astro` | Modify | Shortcuts laden + Komponente einbinden |

---

## Task 1: DB-Funktionen in website-db.ts

**Files:**
- Modify: `website/src/lib/website-db.ts` (ans Ende der Datei anhängen)

- [ ] **Schritt 1: Interface und init-Funktion ans Ende von `website-db.ts` anhängen**

Füge nach der letzten Funktion in der Datei ein:

```typescript
// ── Admin Shortcuts ──────────────────────────────────────────────────────────

export interface AdminShortcut {
  id: string;
  url: string;
  label: string;
  sortOrder: number;
  createdAt: Date;
}

async function initAdminShortcutsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_shortcuts (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      url        TEXT NOT NULL,
      label      TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

export async function listAdminShortcuts(): Promise<AdminShortcut[]> {
  await initAdminShortcutsTable();
  const result = await pool.query(
    `SELECT id, url, label, sort_order AS "sortOrder", created_at AS "createdAt"
     FROM admin_shortcuts
     ORDER BY created_at ASC`
  );
  return result.rows;
}

export async function createAdminShortcut(url: string, label: string): Promise<AdminShortcut> {
  await initAdminShortcutsTable();
  const result = await pool.query(
    `INSERT INTO admin_shortcuts (url, label)
     VALUES ($1, $2)
     RETURNING id, url, label, sort_order AS "sortOrder", created_at AS "createdAt"`,
    [url, label]
  );
  return result.rows[0];
}

export async function deleteAdminShortcut(id: string): Promise<void> {
  await initAdminShortcutsTable();
  await pool.query('DELETE FROM admin_shortcuts WHERE id = $1', [id]);
}
```

- [ ] **Schritt 2: Kompilierung prüfen**

```bash
cd /home/patrick/Bachelorprojekt/website && npx tsc --noEmit 2>&1 | head -20
```

Erwartet: keine Fehler (oder nur pre-existing errors, nicht neue).

- [ ] **Schritt 3: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add website/src/lib/website-db.ts
git commit -m "feat(shortcuts): add DB functions for admin shortcuts"
```

---

## Task 2: API — fetch-title

**Files:**
- Create: `website/src/pages/api/admin/shortcuts/fetch-title.ts`

- [ ] **Schritt 1: Endpunkt erstellen**

```typescript
// website/src/pages/api/admin/shortcuts/fetch-title.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';

// Private IP ranges (SSRF protection)
const PRIVATE_RANGES = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^::1$/,
  /^0\.0\.0\.0$/,
];

function isPrivateHost(hostname: string): boolean {
  return PRIVATE_RANGES.some(r => r.test(hostname));
}

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ title: '' }), { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url') ?? '';

  if (!url.startsWith('https://')) {
    return new Response(JSON.stringify({ title: '' }), { status: 400 });
  }

  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return new Response(JSON.stringify({ title: '' }), { status: 400 });
  }

  if (isPrivateHost(hostname)) {
    return new Response(JSON.stringify({ title: '' }), { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AdminBot/1.0)' },
    });
    clearTimeout(timeout);

    const html = await res.text();
    const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = match ? match[1].trim().slice(0, 80) : '';

    return new Response(JSON.stringify({ title }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ title: '' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
```

- [ ] **Schritt 2: Kompilierung prüfen**

```bash
cd /home/patrick/Bachelorprojekt/website && npx tsc --noEmit 2>&1 | head -20
```

Erwartet: keine neuen Fehler.

- [ ] **Schritt 3: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add website/src/pages/api/admin/shortcuts/fetch-title.ts
git commit -m "feat(shortcuts): add fetch-title API endpoint"
```

---

## Task 3: API — create und delete

**Files:**
- Create: `website/src/pages/api/admin/shortcuts/create.ts`
- Create: `website/src/pages/api/admin/shortcuts/delete.ts`

- [ ] **Schritt 1: create.ts erstellen**

```typescript
// website/src/pages/api/admin/shortcuts/create.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { createAdminShortcut } from '../../../../lib/website-db';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  let url: string, label: string;
  try {
    const body = await request.json();
    url = (body.url ?? '').trim();
    label = (body.label ?? '').trim();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  if (!url.startsWith('https://') || !label) {
    return new Response(JSON.stringify({ error: 'url (https) and label required' }), { status: 400 });
  }

  try {
    const shortcut = await createAdminShortcut(url, label);
    return new Response(JSON.stringify(shortcut), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[shortcuts/create]', err);
    return new Response(JSON.stringify({ error: 'DB error' }), { status: 500 });
  }
};
```

- [ ] **Schritt 2: delete.ts erstellen**

```typescript
// website/src/pages/api/admin/shortcuts/delete.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { deleteAdminShortcut } from '../../../../lib/website-db';

export const DELETE: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  let id: string;
  try {
    const body = await request.json();
    id = (body.id ?? '').trim();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  if (!id) {
    return new Response(JSON.stringify({ error: 'id required' }), { status: 400 });
  }

  try {
    await deleteAdminShortcut(id);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[shortcuts/delete]', err);
    return new Response(JSON.stringify({ error: 'DB error' }), { status: 500 });
  }
};
```

- [ ] **Schritt 3: Kompilierung prüfen**

```bash
cd /home/patrick/Bachelorprojekt/website && npx tsc --noEmit 2>&1 | head -20
```

Erwartet: keine neuen Fehler.

- [ ] **Schritt 4: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add website/src/pages/api/admin/shortcuts/create.ts website/src/pages/api/admin/shortcuts/delete.ts
git commit -m "feat(shortcuts): add create and delete API endpoints"
```

---

## Task 4: Svelte-Komponente AdminShortcuts

**Files:**
- Create: `website/src/components/admin/AdminShortcuts.svelte`

- [ ] **Schritt 1: Komponente erstellen**

```svelte
<!-- website/src/components/admin/AdminShortcuts.svelte -->
<script lang="ts">
  interface Shortcut {
    id: string;
    url: string;
    label: string;
    sortOrder: number;
    createdAt: string;
  }

  let { links: initialLinks }: { links: Shortcut[] } = $props();

  let links = $state<Shortcut[]>(initialLinks);
  let showForm = $state(false);
  let formUrl = $state('');
  let formLabel = $state('');
  let fetching = $state(false);
  let saving = $state(false);
  let hoveredId = $state<string | null>(null);

  function faviconUrl(url: string): string {
    try {
      const { hostname } = new URL(url);
      return `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
    } catch {
      return '';
    }
  }

  async function onUrlBlur() {
    if (!formUrl.startsWith('https://') || fetching) return;
    fetching = true;
    try {
      const res = await fetch(
        `/api/admin/shortcuts/fetch-title?url=${encodeURIComponent(formUrl)}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.title && !formLabel) formLabel = data.title;
      }
    } catch {
      // silent — admin fills in manually
    } finally {
      fetching = false;
    }
  }

  async function save() {
    if (!formUrl.startsWith('https://') || !formLabel.trim() || saving) return;
    saving = true;
    try {
      const res = await fetch('/api/admin/shortcuts/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: formUrl.trim(), label: formLabel.trim() }),
      });
      if (res.ok) {
        const shortcut = await res.json();
        links = [...links, shortcut];
        formUrl = '';
        formLabel = '';
        showForm = false;
      }
    } catch {
      // silent
    } finally {
      saving = false;
    }
  }

  async function remove(id: string) {
    try {
      const res = await fetch('/api/admin/shortcuts/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        links = links.filter(l => l.id !== id);
      }
    } catch {
      // silent
    }
  }

  function closeForm() {
    showForm = false;
    formUrl = '';
    formLabel = '';
  }
</script>

<div class="mb-6">
  <p class="text-xs font-semibold text-muted uppercase tracking-widest mb-2">Eigene Links</p>

  <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
    {#each links as link (link.id)}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="relative"
        onmouseenter={() => (hoveredId = link.id)}
        onmouseleave={() => (hoveredId = null)}
      >
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          class="flex flex-col items-center gap-1.5 p-4 bg-dark-light rounded-xl border border-dark-lighter hover:border-gold/40 transition-colors text-center"
        >
          <img
            src={faviconUrl(link.url)}
            alt=""
            width="24"
            height="24"
            class="rounded-sm"
            onerror="this.style.display='none';this.nextElementSibling.style.display='block'"
          />
          <!-- Fallback icon -->
          <svg
            style="display:none"
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="text-muted"
          >
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
          <span class="text-xs font-medium text-muted truncate w-full text-center">{link.label}</span>
        </a>

        {#if hoveredId === link.id}
          <button
            onclick={() => remove(link.id)}
            class="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-600 hover:bg-red-500 text-white rounded-full text-xs flex items-center justify-center leading-none transition-colors"
            aria-label="Link entfernen"
          >×</button>
        {/if}
      </div>
    {/each}

    <!-- + Button -->
    {#if !showForm}
      <button
        onclick={() => (showForm = true)}
        class="flex flex-col items-center gap-1.5 p-4 bg-dark-light rounded-xl border border-dashed border-dark-lighter hover:border-gold/40 transition-colors text-center"
      >
        <span class="text-2xl leading-none text-muted">+</span>
        <span class="text-xs font-medium text-muted">Link</span>
      </button>
    {/if}
  </div>

  <!-- Inline-Formular -->
  {#if showForm}
    <div class="mt-3 p-4 bg-dark-light rounded-xl border border-dark-lighter">
      <div class="flex flex-col sm:flex-row gap-3 items-end">
        <div class="flex-1">
          <label class="text-xs text-muted mb-1 block" for="sc-url">URL</label>
          <input
            id="sc-url"
            type="url"
            placeholder="https://"
            bind:value={formUrl}
            onblur={onUrlBlur}
            class="w-full bg-dark rounded-lg border border-dark-lighter px-3 py-2 text-sm text-light placeholder:text-muted focus:outline-none focus:border-gold/50"
          />
        </div>
        <div class="flex-1">
          <label class="text-xs text-muted mb-1 block" for="sc-label">
            Label
            {#if fetching}<span class="text-gold/60 ml-1">⟳</span>{/if}
          </label>
          <input
            id="sc-label"
            type="text"
            placeholder="wird automatisch erkannt…"
            bind:value={formLabel}
            class="w-full bg-dark rounded-lg border border-dark-lighter px-3 py-2 text-sm text-light placeholder:text-muted focus:outline-none focus:border-gold/50"
          />
        </div>
        <div class="flex gap-2 pb-0.5">
          <button
            onclick={save}
            disabled={saving || !formUrl.startsWith('https://') || !formLabel.trim()}
            class="px-4 py-2 bg-gold text-dark text-sm font-semibold rounded-lg hover:bg-gold/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? '…' : 'Speichern'}
          </button>
          <button
            onclick={closeForm}
            class="px-3 py-2 bg-dark rounded-lg border border-dark-lighter text-sm text-muted hover:text-light transition-colors"
          >✕</button>
        </div>
      </div>
    </div>
  {/if}
</div>
```

- [ ] **Schritt 2: Kompilierung prüfen**

```bash
cd /home/patrick/Bachelorprojekt/website && npx tsc --noEmit 2>&1 | head -20
```

Erwartet: keine neuen Fehler.

- [ ] **Schritt 3: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add website/src/components/admin/AdminShortcuts.svelte
git commit -m "feat(shortcuts): add AdminShortcuts Svelte component"
```

---

## Task 5: admin.astro — Daten laden und Komponente einbinden

**Files:**
- Modify: `website/src/pages/admin.astro`

- [ ] **Schritt 1: Import hinzufügen**

In `website/src/pages/admin.astro`, den bestehenden Import-Block am Anfang erweitern:

Zeile 4 ändert sich von:
```typescript
import { listBugTickets, listProjects, getDueFollowUps } from '../lib/website-db';
```
zu:
```typescript
import { listBugTickets, listProjects, getDueFollowUps, listAdminShortcuts } from '../lib/website-db';
```

Und Component-Import nach dem `ServiceLinks`-Import hinzufügen:
```typescript
import AdminShortcuts from '../components/admin/AdminShortcuts.svelte';
```

- [ ] **Schritt 2: Shortcuts-Variable deklarieren und im Promise.allSettled laden**

Der Import-Block aus Schritt 1 enthält bereits `listAdminShortcuts` und `AdminShortcut`. Nach `let freeSlots = 0;` (Zeile ~21) hinzufügen:
```typescript
import type { AdminShortcut } from '../lib/website-db';
// ... (dieser Import gehört an den Anfang der Frontmatter, nicht hier)
let shortcuts: AdminShortcut[] = [];
```

Konkret: `import type { AdminShortcut }` am Anfang des Frontmatter-Blocks ergänzen (nach dem bestehenden `import { listBugTickets, ... }`), und `let shortcuts: AdminShortcut[] = [];` nach `let freeSlots = 0;` einfügen.

Im `Promise.allSettled`-Block einen weiteren Eintrag ergänzen (nach dem letzten `getAvailableSlots`-Block):
```typescript
  listAdminShortcuts()
    .then(s => { shortcuts = s; }),
```

- [ ] **Schritt 3: Komponente im Template einbinden**

In `admin.astro` nach der Zeile `<ServiceLinks links={adminLinks} heading="Dienste" />` einfügen:
```astro
<AdminShortcuts client:load links={shortcuts} />
```

- [ ] **Schritt 4: Kompilierung prüfen**

```bash
cd /home/patrick/Bachelorprojekt/website && npx tsc --noEmit 2>&1 | head -20
```

Erwartet: keine neuen Fehler.

- [ ] **Schritt 5: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add website/src/pages/admin.astro
git commit -m "feat(shortcuts): integrate AdminShortcuts into admin dashboard"
```

---

## Task 6: Manueller Smoke-Test

- [ ] **Schritt 1: Dev-Server starten**

```bash
cd /home/patrick/Bachelorprojekt/website && npm run dev
```

Öffne `http://localhost:4321/admin` im Browser (als Admin eingeloggt).

- [ ] **Schritt 2: Hinzufügen testen**

1. Sektion „Eigene Links" sichtbar mit „+"-Button
2. Auf „+" klicken → Formular erscheint
3. URL `https://github.com` eingeben, Feld verlassen → Label wird automatisch mit „GitHub..." befüllt
4. „Speichern" klicken → Link erscheint in der Leiste mit GitHub-Favicon
5. Seite neu laden → Link bleibt (DB-Persistenz)

- [ ] **Schritt 3: Löschen testen**

1. Über den GitHub-Link hovern → rotes ×-Symbol erscheint
2. × anklicken → Link verschwindet
3. Seite neu laden → Link bleibt weg

- [ ] **Schritt 4: Edge Cases testen**

1. URL ohne `https://` eingeben → Speichern-Button bleibt deaktiviert
2. URL einer nicht erreichbaren Seite → Label-Feld bleibt leer, manuell ausfüllen möglich
3. Formular mit ✕ schließen → Formular verschwindet, kein Eintrag erstellt

- [ ] **Schritt 5: Abschluss-Commit (falls nötige Fixes)**

```bash
cd /home/patrick/Bachelorprojekt
git add -p
git commit -m "fix(shortcuts): smoke-test fixes"
```
