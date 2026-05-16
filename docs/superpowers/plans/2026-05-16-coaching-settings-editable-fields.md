---
title: Coaching-Einstellungen: Bearbeitbare KI-Provider und Template-Erstellung
domains: []
status: active
pr_number: null
ticket_id: T000418
---

# Coaching-Einstellungen: Bearbeitbare KI-Provider und Template-Erstellung

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Coaching-Einstellungsseite (`/admin/coaching/settings`) vollständig nutzbar machen — KI-Provider-Felder inline editierbar machen und einen „Neues Template anlegen"-Button hinzufügen.

**Architecture:** Drei Ebenen: (1) Neue DB-Funktion `updateKiProvider` in `coaching-ki-config-db.ts`; (2) Neuer `PATCH`-API-Endpunkt `/api/admin/coaching/ki-config/[id]`; (3) UI-Erweiterung in `CoachingSettings.svelte` — Inline-Editierung der Provider-Karten + Create-Formular für Templates.

**Tech Stack:** PostgreSQL 16 (`shared-db`), Astro 5 API-Routes, Svelte 5 (`$state`, `$props`), Vitest + pg-mem für Unit-Tests.

---

## File Structure

**Modify:**
- `website/src/lib/coaching-ki-config-db.ts` — neue Funktion `updateKiProvider`
- `website/src/lib/coaching-ki-config-db.test.ts` — Tests für `updateKiProvider` (failing test bereits geschrieben)
- `website/src/components/admin/coaching/CoachingSettings.svelte` — Inline-Edit für Provider + Neu-anlegen für Templates

**Create:**
- `website/src/pages/api/admin/coaching/ki-config/[id].ts` — PATCH-Endpunkt zum Aktualisieren eines KI-Providers

---

## Task 1: DB-Funktion `updateKiProvider` implementieren

**Files:**
- Modify: `website/src/lib/coaching-ki-config-db.ts`
- Modify: `website/src/lib/coaching-ki-config-db.test.ts`

- [ ] **Schritt 1.1: Failing Tests verifizieren**

```bash
cd website && npx vitest run src/lib/coaching-ki-config-db.test.ts 2>&1 | tail -10
```
Erwartet: 2 Tests FAIL mit `updateKiProvider is not a function`.

- [ ] **Schritt 1.2: Funktion `updateKiProvider` in `coaching-ki-config-db.ts` hinzufügen**

Füge nach `setActiveProvider` am Ende der Datei ein:

```typescript
export async function updateKiProvider(
  pool: Pool,
  id: number,
  fields: { modelName: string | null; displayName: string },
): Promise<KiConfig> {
  const r = await pool.query(
    `UPDATE coaching.ki_config
     SET model_name = $1, display_name = $2
     WHERE id = $3
     RETURNING *`,
    [fields.modelName, fields.displayName, id],
  );
  if (r.rows.length === 0) throw new Error(`KI-Provider id=${id} nicht gefunden`);
  return rowToKiConfig(r.rows[0]);
}
```

- [ ] **Schritt 1.3: Tests laufen lassen — grün erwarten**

```bash
cd website && npx vitest run src/lib/coaching-ki-config-db.test.ts 2>&1 | tail -8
```
Erwartet: alle 7 Tests PASS.

- [ ] **Schritt 1.4: Commit**

```bash
git add website/src/lib/coaching-ki-config-db.ts website/src/lib/coaching-ki-config-db.test.ts
git commit -m "feat(coaching): add updateKiProvider DB function [T000418]"
```

---

## Task 2: PATCH-API-Endpunkt `/api/admin/coaching/ki-config/[id]`

**Files:**
- Create: `website/src/pages/api/admin/coaching/ki-config/[id].ts`

- [ ] **Schritt 2.1: Datei anlegen**

```typescript
// website/src/pages/api/admin/coaching/ki-config/[id].ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { updateKiProvider } from '../../../../../lib/coaching-ki-config-db';
import { pool } from '../../../../../lib/website-db';

export const prerender = false;

export const PATCH: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const id = parseInt(params.id ?? '', 10);
  if (isNaN(id)) return new Response(JSON.stringify({ error: 'Ungültige ID' }), { status: 400, headers: { 'content-type': 'application/json' } });

  let body: { modelName?: string | null; displayName?: string };
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  if (typeof body.displayName !== 'string' || body.displayName.trim() === '') {
    return new Response(JSON.stringify({ error: 'displayName darf nicht leer sein' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  const provider = await updateKiProvider(pool, id, {
    modelName: body.modelName ?? null,
    displayName: body.displayName.trim(),
  });
  return new Response(JSON.stringify({ provider }), { headers: { 'content-type': 'application/json' } });
};
```

- [ ] **Schritt 2.2: TypeScript-Check**

```bash
cd website && npx tsc --noEmit 2>&1 | grep "ki-config" | head -10
```
Erwartet: keine Fehler für die neue Datei.

- [ ] **Schritt 2.3: Commit**

```bash
git add website/src/pages/api/admin/coaching/ki-config/[id].ts
git commit -m "feat(coaching): add PATCH /api/admin/coaching/ki-config/[id] [T000418]"
```

---

## Task 3: UI — KI-Provider-Karten inline editierbar machen

**Files:**
- Modify: `website/src/components/admin/coaching/CoachingSettings.svelte`

Ziel: Jede Provider-Karte bekommt einen „Bearbeiten"-Button. Beim Klick öffnet sich ein Inline-Formular mit Feldern für `displayName` und `modelName`. „Speichern" sendet `PATCH /api/admin/coaching/ki-config/:id`.

- [ ] **Schritt 3.1: State und Funktionen im `<script>`-Block ergänzen**

Im `<script lang="ts">`-Block, nach den bestehenden Variablen, hinzufügen:

```typescript
  let editingProvider = $state<KiConfig | null>(null);
  let providerFields = $state({ displayName: '', modelName: '' });
  let savingProviderEdit = $state(false);

  function startEditProvider(p: KiConfig) {
    editingProvider = p;
    providerFields = { displayName: p.displayName, modelName: p.modelName ?? '' };
  }

  async function saveProviderEdit() {
    if (!editingProvider) return;
    savingProviderEdit = true;
    await fetch(`/api/admin/coaching/ki-config/${editingProvider.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: providerFields.displayName,
        modelName: providerFields.modelName.trim() || null,
      }),
    });
    const res = await fetch('/api/admin/coaching/ki-config');
    const data = await res.json();
    providers = data.providers;
    editingProvider = null;
    savingProviderEdit = false;
  }
```

- [ ] **Schritt 3.2: Provider-Karten im Template erweitern**

Den Block `{#each providers as p}...{/each}` (Zeilen 91–111 im Original) so ersetzen:

```svelte
      {#each providers as p}
        <div class="provider-card {p.isActive ? 'active' : ''}">
          {#if editingProvider?.id === p.id}
            <label class="edit-label">Name
              <input type="text" bind:value={providerFields.displayName} />
            </label>
            <label class="edit-label">Modell (z.B. claude-sonnet-4-5)
              <input type="text" bind:value={providerFields.modelName} placeholder="leer = Standard" />
            </label>
            <div class="edit-actions">
              <button class="btn-activate" onclick={saveProviderEdit} disabled={savingProviderEdit}>
                {savingProviderEdit ? '…' : 'Speichern'}
              </button>
              <button class="btn-sm" onclick={() => editingProvider = null}>Abbrechen</button>
            </div>
          {:else}
            <div class="provider-name">{p.displayName}</div>
            <div class="provider-model">{p.modelName ?? 'kein Modell'}</div>
            <div class="provider-key">
              {ENV_KEY_MAP[p.provider] ? `${ENV_KEY_MAP[p.provider]}` : '—'}
            </div>
            <div class="provider-actions">
              {#if p.isActive}
                <span class="active-badge">● Aktiv</span>
              {:else}
                <button
                  class="btn-activate"
                  onclick={() => activateProvider(p.provider)}
                  disabled={savingProvider === p.provider}
                >
                  {savingProvider === p.provider ? '…' : 'Aktivieren'}
                </button>
              {/if}
              <button class="btn-sm" onclick={() => startEditProvider(p)}>✏️</button>
            </div>
          {/if}
        </div>
      {/each}
```

- [ ] **Schritt 3.3: CSS für neue Elemente in `<style>` ergänzen**

Nach `.btn-activate:disabled` hinzufügen:

```css
  .provider-actions { display: flex; gap: 0.4rem; align-items: center; margin-top: 0.4rem; flex-wrap: wrap; }
  .edit-label { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.78rem; color: var(--text-muted,#888); }
  .edit-label input { padding: 0.35rem 0.6rem; background: var(--bg-dark,#111); border: 1px solid var(--line,#333); border-radius: 4px; color: var(--text-light,#f0f0f0); font-size: 0.82rem; }
```

- [ ] **Schritt 3.4: Lokaler Smoke-Test**

```bash
cd website && npx astro check 2>&1 | grep -E "error|Error" | head -10
```
Erwartet: keine Fehler.

- [ ] **Schritt 3.5: Commit**

```bash
git add website/src/components/admin/coaching/CoachingSettings.svelte
git commit -m "feat(coaching): inline edit for KI-provider model and display name [T000418]"
```

---

## Task 4: UI — Neues Template anlegen

**Files:**
- Modify: `website/src/components/admin/coaching/CoachingSettings.svelte`

Ziel: Button „+ Neues Template" öffnet dasselbe Edit-Modal, aber ohne vorhandene `editingTemplate.id` — `saveTemplate` unterscheidet Create (POST) vs. Update (PATCH) anhand ob `editingTemplate.id` gesetzt ist.

- [ ] **Schritt 4.1: `saveTemplate` und `startNewTemplate` im `<script>`-Block anpassen**

`saveTemplate` ersetzen:

```typescript
  const EMPTY_TEMPLATE: Omit<StepTemplate, 'id' | 'brand' | 'createdAt'> = {
    stepNumber: 1,
    stepName: '',
    phase: 'problem_ziel',
    systemPrompt: '',
    userPromptTpl: '',
    inputSchema: [],
    keywords: [],
    isActive: true,
    sortOrder: 0,
  };

  function startNewTemplate() {
    editingTemplate = { ...EMPTY_TEMPLATE, id: '', brand: '', createdAt: new Date() } as StepTemplate;
    editFields = { stepName: '', systemPrompt: '', userPromptTpl: '', keywords: '' };
  }

  async function saveTemplate() {
    if (!editingTemplate) return;
    const isNew = editingTemplate.id === '';
    const payload = {
      stepNumber: editingTemplate.stepNumber,
      stepName: editFields.stepName,
      phase: editingTemplate.phase,
      systemPrompt: editFields.systemPrompt,
      userPromptTpl: editFields.userPromptTpl,
      inputSchema: editingTemplate.inputSchema,
      keywords: editFields.keywords.split(',').map(s => s.trim()).filter(Boolean),
      isActive: true,
      sortOrder: editingTemplate.sortOrder,
    };

    if (isNew) {
      await fetch('/api/admin/coaching/step-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch(`/api/admin/coaching/step-templates/${editingTemplate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }

    const res = await fetch('/api/admin/coaching/step-templates');
    const data = await res.json();
    templates = data.templates;
    editingTemplate = null;
  }
```

- [ ] **Schritt 4.2: Edit-Modal um Felder `stepNumber` und `phase` erweitern**

Im `edit-modal`-Block nach `<h3>...</h3>` hinzufügen (vor dem `stepName`-Label):

```svelte
          <label>Schritt-Nr.
            <input type="number" min="1" bind:value={editingTemplate.stepNumber} />
          </label>
          <label>Phase
            <select bind:value={editingTemplate.phase}>
              <option value="problem_ziel">Problem & Ziel</option>
              <option value="analyse">Analyse</option>
              <option value="ressourcen">Ressourcen</option>
              <option value="loesungsweg">Lösungsweg</option>
              <option value="abschluss">Abschluss</option>
            </select>
          </label>
```

CSS für `select` in `<style>` ergänzen:

```css
  .edit-modal select { padding: 0.5rem 0.75rem; background: var(--bg-dark,#111); border: 1px solid var(--line,#333); border-radius: 6px; color: var(--text-light,#f0f0f0); font-size: 0.88rem; }
```

- [ ] **Schritt 4.3: „+ Neues Template"-Button über die Tabelle hinzufügen**

Den `{:else}`-Block im Templates-Tab (vor `<table class="table">`) so erweitern:

```svelte
      {:else}
        <div class="templates-header">
          <button class="btn-primary" onclick={startNewTemplate}>+ Neues Template</button>
        </div>
        <table class="table">
```

CSS:

```css
  .templates-header { display: flex; justify-content: flex-end; margin-bottom: 0.75rem; }
```

- [ ] **Schritt 4.4: Lokaler Smoke-Test**

```bash
cd website && npx astro check 2>&1 | grep -E "error|Error" | head -10
```
Erwartet: keine Fehler.

- [ ] **Schritt 4.5: Commit**

```bash
git add website/src/components/admin/coaching/CoachingSettings.svelte
git commit -m "feat(coaching): add create-new template form in settings [T000418]"
```

---

## Task 5: Gesamtverifikation und PR

- [ ] **Schritt 5.1: Alle Unit-Tests laufen**

```bash
cd website && npx vitest run src/lib/coaching-ki-config-db.test.ts src/lib/coaching-templates-db.test.ts 2>&1 | tail -8
```
Erwartet: alle Tests PASS, 0 Failures.

- [ ] **Schritt 5.2: TypeScript-Gesamtcheck**

```bash
cd website && npx tsc --noEmit 2>&1 | head -20
```
Erwartet: keine Fehler.

- [ ] **Schritt 5.3: PR erstellen**

```bash
# Im Worktree-Verzeichnis:
gh pr create \
  --title "fix(coaching): editable KI-provider fields + create template button [T000418]" \
  --body "$(cat <<'EOF'
## Summary
- Adds `updateKiProvider` DB function + `PATCH /api/admin/coaching/ki-config/:id` API endpoint
- KI-Provider cards now have an inline edit form for `displayName` and `modelName`
- Templates tab gets a \"+ Neues Template\" button that opens the create form
- POST `/api/admin/coaching/step-templates` was already implemented — only UI was missing

## Test plan
- [ ] Unit tests: `npx vitest run src/lib/coaching-ki-config-db.test.ts` — all pass
- [ ] Open `/admin/coaching/settings` → KI-Provider tab: click ✏️ on a card, edit model name, save — refreshed card shows new value
- [ ] Templates tab: click \"+ Neues Template\", fill form, save — new row appears in table
- [ ] Templates tab: click ✏️ Bearbeiten on existing template, edit, save — row updates

Fixes T000418

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Schritt 5.4: CI abwarten und mergen**

Nach grünem CI: squash-merge.

- [ ] **Schritt 5.5: Deploy**

```bash
# Im Hauptrepo nach merge:
task feature:website
```

Verify: `https://web.mentolder.de/admin/coaching/settings` und `https://web.korczewski.de/admin/coaching/settings`.
