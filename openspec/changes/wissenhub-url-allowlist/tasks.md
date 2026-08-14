---
title: WissenHub: http(s)-Allowlist für startUrl — Implementation Plan
ticket_id: T005901
domains: [website, docs, db]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# WissenHub: http(s)-Allowlist für startUrl — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `crawl_config.startUrl` wird client- und serverseitig über den geteilten Helper `isValidHttpUrl` auf http/https beschränkt — kein `javascript:`-href im Admin-Panel, PATCH-Endpoint lehnt ab.

**Architecture:** Ein reiner Helper in `website/src/lib/knowledge-url.ts` als Single Source of Truth; Komponente und API-Route konsumieren ihn.

**Tech Stack:** Astro (API-Route), Svelte, Vitest, @testing-library/svelte.

**Spec:** `openspec/changes/wissenhub-url-allowlist/design.md`

## Global Constraints

- Kein Inline-Regex — beide Konsumenten nutzen den Helper (SSOT).
- Helper bleibt rein (kein Astro-/Svelte-Import), damit er in beiden Umgebungen läuft.
- Fehlermeldung des Endpoints bleibt deutschsprachig im bestehenden Stil.
- Vitest lokal: `cd website && pnpm install --frozen-lockfile && pnpm exec vitest run <pfade>` (frischer Worktree hat kein node_modules-Symlink-Problem).

## File Structure

```
website/src/lib/knowledge-url.ts                                    # CREATE: Helper
website/src/lib/knowledge-url.test.ts                               # EXISTS: failing Test (rot)
website/src/pages/api/admin/knowledge/collections/[id]/crawl-config.ts          # MODIFY: Validierung
website/src/pages/api/admin/knowledge/collections/[id]/crawl-config.test.ts     # EXISTS: failing Test (rot)
website/src/components/admin/WissenHub.svelte                       # MODIFY: Link nur bei gültigem Schema
openspec/changes/wissenhub-url-allowlist/{design,proposal}.md       # EXISTS
```

---

### Task 1: Helper, Endpoint und Komponente

**Files:**
- Create: `website/src/lib/knowledge-url.ts`
- Modify: `website/src/pages/api/admin/knowledge/collections/[id]/crawl-config.ts`, `website/src/components/admin/WissenHub.svelte`
- Test: `website/src/lib/knowledge-url.test.ts`, `website/src/pages/api/admin/knowledge/collections/[id]/crawl-config.test.ts` (beide existieren, rot — ERR_MODULE_NOT_FOUND bestätigt)

**Interfaces:**
- Produces: `export function isValidHttpUrl(raw: string): boolean` — http/https → true, sonst false.

- [ ] **Step 1: Rot bestätigen**

Run:
```bash
cd website && pnpm install --frozen-lockfile
pnpm exec vitest run src/lib/knowledge-url.test.ts "src/pages/api/admin/knowledge/collections/[id]/crawl-config.test.ts"
```
expected: FAIL — Helper-Modul fehlt (Import-Fehler) bzw. Endpoint-Test schlägt fehl, weil javascript: mit 200 durchgeht.

- [ ] **Step 2: Helper anlegen**

`website/src/lib/knowledge-url.ts`:

```ts
// http(s)-Scheme-Allowlist für user-kontrollierte URLs (T005901).
// Wird vom WissenHub-Link-Rendering UND der crawl-config-API-Validierung geteilt.
export function isValidHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
```

- [ ] **Step 3: Endpoint-Validierung umstellen**

In `crawl-config.ts` den Import ergänzen und die Parsbarkeits-Prüfung (Z. 25-27) ersetzen:

```ts
import { isValidHttpUrl } from '../../../../../../lib/knowledge-url';
```

```ts
  if (!isValidHttpUrl(body.startUrl)) {
    return new Response(JSON.stringify({ error: 'startUrl muss eine http(s)-URL sein' }), { status: 400 });
  }
```

- [ ] **Step 4: Komponente absichern**

In `WissenHub.svelte`: Helper importieren und den Link-Block (Z. 172-174) auf gültige Schemata beschränken:

```svelte
{#if col.source === 'web_crawl' && col.crawl_config?.startUrl}
  {@const url = col.crawl_config.startUrl}
  {#if isValidHttpUrl(url)}
    <br /><a href={url} target="_blank" rel="noopener" class="crawl-url-link" style="font-size: 0.8em; color: var(--admin-primary, #c9a84c);">{url}</a>
  {:else}
    <br /><span class="crawl-url-link" style="font-size: 0.8em; color: var(--admin-primary, #c9a84c);">{url}</span>
  {/if}
{/if}
```

- [ ] **Step 5: Tests grün**

Run: `cd website && pnpm exec vitest run src/lib/knowledge-url.test.ts "src/pages/api/admin/knowledge/collections/[id]/crawl-config.test.ts"`
Expected: PASS — Helper-Tests 5/5; Endpoint: javascript: → 400, https → 200.

- [ ] **Step 6: Astro-Check**

Run: `cd website && npx astro check`
Expected: Exit 0 (Svelte-Änderung — CI-Job `Vitest (website)` führt astro check mit, T002694).

- [ ] **Step 7: Commit**

```bash
git add website/src/lib/knowledge-url.ts website/src/lib/knowledge-url.test.ts website/src/pages/api/admin/knowledge/collections/\[id\]/crawl-config.ts website/src/pages/api/admin/knowledge/collections/\[id\]/crawl-config.test.ts website/src/components/admin/WissenHub.svelte
git commit -m "fix(website): allowlist http(s) scheme for WissenHub crawl startUrl [T005901]"
```

---

### Task 2: Verifikation und Artefakte

**Files:**
- Verify: `openspec/changes/wissenhub-url-allowlist/`, `website/src/**` (geänderte Pfade)

- [ ] **Step 1: OpenSpec-Validierung**

Run: `task openspec:validate`
Expected: Exit 0. Fehlt `.ticket`: `echo T005901 > openspec/changes/wissenhub-url-allowlist/.ticket` und erneut validieren.

- [ ] **Step 2: Geänderte Domains**

Run: `timeout 900 task test:changed`
Expected: Exit 0 (website-Pfade ziehen den Vitest-Bucket; die roten E2E-Website-Specs sind laut verification-block kein PR-Blocker — CI fährt für PRs nur test:spec:changed + Manifest-BATS).

- [ ] **Step 3: CI-äquivalente Spec-Suite**

Run: `timeout 900 task test:spec:changed`
Expected: Exit 0.

- [ ] **Step 4: Freshness**

Run:
```bash
task freshness:regenerate
git add docs/code-quality/repo-index.json website/src/data/openspec-status.json website/src/data/test-inventory.json 2>/dev/null || true
git commit -m "chore: regenerate freshness artifacts [T005901]"
task freshness:check
```
Expected: `freshness:check` Exit 0; Artefakte im Commit (`git show --stat HEAD`).

- [ ] **Step 5: Abschluss-Commit**

```bash
git add openspec/changes/wissenhub-url-allowlist/
git commit -m "chore(plans): finalize wissenhub-url-allowlist change [T005901]"
```
