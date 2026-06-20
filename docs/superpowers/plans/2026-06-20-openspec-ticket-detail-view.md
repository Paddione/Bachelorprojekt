---
title: OpenSpec-Proposals im Ticket-Detail-View — Implementation Plan
ticket_id: T000962
domains: [website, infra, db, test]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# OpenSpec-Proposals im Ticket-Detail-View — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein neues read-only Panel `OpenSpecProposalsPanel.svelte` zeigt in der Ticket-Vollansicht (`/admin/tickets/[id]`) alle für das Ticket verknüpften OpenSpec Change-Proposals mit Slug, farbcodiertem Status-Badge und GitHub-Link an.

**Architecture:** Statischer JSON-Import von `openspec-status.json` im SSR-Block von `[id].astro` schlägt die Proposals per `ticket.externalId` nach und übergibt sie an eine reine Präsentations-Svelte-Komponente. Kein DB-Query, kein API-Endpoint, kein Runtime-Overhead — die Verknüpfung liegt bereits build-zeit-statisch vor.

**Tech Stack:** Astro 5 (SSR-Frontmatter), Svelte 5 (`$props()` runes), TailwindCSS (bestehende `dark`/`gold`-Design-Tokens), statischer JSON-Import.

## Global Constraints

- **S1 Zeilenlimits (Ratchet gegen Baseline):**
  - `website/src/pages/admin/tickets/[id].astro`: Ist 332, **nicht-baselined** → wirksame Schwelle = statisches Limit 400 → **Budget 68 Zeilen** (geplant: +5 netto = OK).
  - `website/src/components/admin/OpenSpecProposalsPanel.svelte`: neue Datei, Limit 500 → **Ziel ~80–100 Zeilen** (Wachstumsreserve).
- **S2 Import-Zyklen:** Die neue Komponente ist ein reines Präsentations-Modul ohne Rück-Import auf DB-/API-/`admin.ts`-Schichten. Keine neuen Zyklen im `website`-Graph.
- **S3 Hardcodierte Hostnamen:** Keine `*.mentolder.de`/`*.korczewski.de`-String-Literale in `k3d/`, `prod*/`, `website/src/`. Der GitHub-Repo-Link (`https://github.com/Paddione/Bachelorprojekt/...`) ist KEIN Brand-Domain-Literal und folgt dem bestehenden Muster aus `TicketPlanPanel.svelte`.
- **S4 Orphans:** Die neue Svelte-Komponente MUSS von `[id].astro` importiert UND im Template referenziert werden (sonst Orphan-Violation).
- **`admin.ts` ist EINGEFROREN (Budget 0) — NICHT anfassen.** Kein neuer DB-Query, kein neuer API-Endpoint.
- **Status-Badge-Farben (verbindlich, aus bestehenden Cockpit-Badge-Mustern):**
  - `planning` → grau (`text-gray-400 border-gray-600`)
  - `plan_staged` → gold/gelb (`text-gold border-gold/30`)
  - `archived` → grün (`text-green-400 border-green-600`)
  - Fallback (unbekannter Status) → grau (wie `planning`).
- **GitHub-Link-Muster:** `https://github.com/Paddione/Bachelorprojekt/blob/main/openspec/changes/{slug}/proposal.md`
- **Stil-Vorlage:** `website/src/components/admin/ContainerDorPanel.svelte` (Panel-Container `bg-dark-light rounded-2xl border border-dark-lighter p-6`, Header `text-sm font-semibold text-light font-serif uppercase tracking-wide`).
- Branch: `feature/openspec-ticket-detail`. Worktree: `/home/patrick/Bachelorprojekt/tmp/wt-openspec-ticket-detail`. Ticket: T000962.

---

### Task 1: OpenSpecProposalsPanel.svelte erstellen

**Files:**
- Create: `website/src/components/admin/OpenSpecProposalsPanel.svelte`

**Interfaces:**
- Consumes: nichts (reine Präsentations-Komponente).
- Produces: Default-Export Svelte-Komponente mit Prop-Signatur
  `{ proposals: Array<{ slug: string; status: string }> }`. Wird in Task 2 von `[id].astro` als `<OpenSpecProposalsPanel client:load proposals={openspecProposals} />` konsumiert.

- [ ] **Step 1: Komponente schreiben**

Datei `website/src/components/admin/OpenSpecProposalsPanel.svelte` mit folgendem exakten Inhalt:

```svelte
<script lang="ts">
  type Proposal = { slug: string; status: string };

  let { proposals }: { proposals: Proposal[] } = $props();

  const STATUS_STYLES: Record<string, string> = {
    planning: 'text-gray-400 border-gray-600',
    plan_staged: 'text-gold border-gold/30',
    archived: 'text-green-400 border-green-600',
  };

  const STATUS_LABELS: Record<string, string> = {
    planning: 'Planung',
    plan_staged: 'Plan bereit',
    archived: 'Archiviert',
  };

  function badgeClass(status: string): string {
    return STATUS_STYLES[status] ?? STATUS_STYLES.planning;
  }

  function statusLabel(status: string): string {
    return STATUS_LABELS[status] ?? status;
  }

  function titleFromSlug(slug: string): string {
    return slug
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function proposalUrl(slug: string): string {
    return `https://github.com/Paddione/Bachelorprojekt/blob/main/openspec/changes/${slug}/proposal.md`;
  }
</script>

<div class="bg-dark-light rounded-2xl border border-dark-lighter p-6">
  <h2 class="text-sm font-semibold text-light font-serif uppercase tracking-wide mb-3">
    OpenSpec Proposals
  </h2>
  <ul class="space-y-2" role="list">
    {#each proposals as proposal (proposal.slug)}
      <li class="flex items-center justify-between gap-3" role="listitem">
        <a
          href={proposalUrl(proposal.slug)}
          target="_blank"
          rel="noopener"
          class="text-sm text-light hover:text-gold hover:underline truncate"
          title={proposal.slug}
        >
          {titleFromSlug(proposal.slug)}
        </a>
        <span
          class={`shrink-0 text-[10px] font-mono uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${badgeClass(proposal.status)}`}
        >
          {statusLabel(proposal.status)}
        </span>
      </li>
    {/each}
  </ul>
</div>
```

- [ ] **Step 2: Typecheck der Komponente**

Run: `cd website && pnpm exec svelte-check --tsconfig ./tsconfig.json --threshold error 2>&1 | tail -20`
Expected: Kein Error, der `OpenSpecProposalsPanel.svelte` betrifft (vorbestehende Warnungen anderer Dateien ignorieren).

- [ ] **Step 3: Zeilenbudget prüfen**

Run: `wc -l website/src/components/admin/OpenSpecProposalsPanel.svelte`
Expected: ~70–80 Zeilen — deutlich unter dem `.svelte`-Limit 500.

- [ ] **Step 4: Commit**

```bash
git add website/src/components/admin/OpenSpecProposalsPanel.svelte
git commit -m "feat(admin): add OpenSpecProposalsPanel component [T000962]"
```

---

### Task 2: [id].astro um Proposals-Panel erweitern

**Files:**
- Modify: `website/src/pages/admin/tickets/[id].astro` (Import-Block oben + SSR-`const` + Template nach `TicketAttachmentsPanel` bei Zeile ~233)

**Interfaces:**
- Consumes: `OpenSpecProposalsPanel` (Default-Export aus Task 1) mit Prop `proposals: Array<{ slug: string; status: string }>`; `ticket.externalId` (Format `"T000962"`, bereits am Ticket-Objekt aus `getTicketDetail()` vorhanden); `website/src/data/openspec-status.json` (Shape `Record<string, Array<{ slug: string; status: string }>>`).
- Produces: nichts (Endpunkt der Render-Kette).

- [ ] **Step 1: JSON-Import und Komponenten-Import hinzufügen**

In `website/src/pages/admin/tickets/[id].astro` nach der bestehenden Zeile 25
(`import TicketAttachmentsPanel from '../../../components/admin/TicketAttachmentsPanel.svelte';`)
diese zwei Imports ergänzen:

```typescript
import OpenSpecProposalsPanel from '../../../components/admin/OpenSpecProposalsPanel.svelte';
import openspecStatusMap from '../../../data/openspec-status.json';
```

- [ ] **Step 2: Proposals-Lookup als SSR-const hinzufügen**

Nach dem `if (!ticket) return Astro.redirect('/admin/tickets');`-Block (Zeile ~40) diese Zeile ergänzen:

```typescript
const openspecProposals = (openspecStatusMap as Record<string, Array<{ slug: string; status: string }>>)[ticket.externalId] ?? [];
```

- [ ] **Step 3: Conditional render nach TicketAttachmentsPanel einfügen**

In `[id].astro` direkt nach der bestehenden Zeile
`<TicketAttachmentsPanel client:load ticketId={ticket.id} attachments={ticket.attachments} />`
(Zeile ~233, innerhalb des Haupt-`<div class="...">`-Containers, vor dessen schließendem `</div>`) einfügen:

```astro
          {openspecProposals.length > 0 && (
            <OpenSpecProposalsPanel client:load proposals={openspecProposals} />
          )}
```

- [ ] **Step 4: Zeilenbudget prüfen (S1-Ratchet)**

Run: `wc -l website/src/pages/admin/tickets/[id].astro`
Expected: ~337 Zeilen (332 + 5 netto) — unter dem `.astro`-Limit 400.

- [ ] **Step 5: Typecheck und Build-Sanity**

Run: `cd website && pnpm exec astro check 2>&1 | tail -20`
Expected: Keine neuen Errors, die `[id].astro` oder `OpenSpecProposalsPanel` betreffen.

- [ ] **Step 6: Manuelle Verifikation des externalId-Felds (Daten-Sanity)**

Run: `node -e "const m=require('./website/src/data/openspec-status.json'); console.log('T000962' in m ? m['T000962'] : 'kein-eintrag-T000962')"`
Expected: Entweder ein Array von `{slug,status}` (falls T000962 bereits verknüpft ist) oder `kein-eintrag-T000962`. Beide Fälle sind valide — die Komponente rendert nur bei `length > 0`. Der Selbst-Eintrag ist NICHT Voraussetzung für grünes Verhalten.

- [ ] **Step 7: Commit**

```bash
git add "website/src/pages/admin/tickets/[id].astro"
git commit -m "feat(admin): render OpenSpecProposalsPanel in ticket detail view [T000962]"
```

---

### Task 3: Verifikation (CI-Äquivalent — PFLICHT)

**Files:**
- Keine Code-Änderung. Reine Verifikations- und Regenerations-Schritte.

**Interfaces:**
- Consumes: das Ergebnis aus Task 1 + Task 2.
- Produces: grüne CI-Gates (S1–S4-Ratchet, Freshness, Tests).

- [ ] **Step 1: Gezielte Tests für geänderte Domains**

Run: `task test:changed`
Expected: PASS (vitest `--changed` + BATS-Selection + `quality:check`). Da keine bestehende Test-Datei berührt wird, prüfen ob ein Snapshot-/Komponenten-Test betroffen ist — falls ja, mit den oben gezeigten Komponenten-Eigenschaften abgleichen. Keine neue Test-Datei anlegen (read-only Präsentations-Panel; Verhalten ist durch `astro check` + S1–S4 abgedeckt).

- [ ] **Step 2: Generierte Artefakte regenerieren**

Run: `task freshness:regenerate`
Expected: Aktualisiert `test-inventory`, `repo-index` etc. Etwaige Diffs an generierten Dateien mitcommitten (siehe Step 5).

- [ ] **Step 3: CI-Äquivalent Freshness + Quality-Ratchet**

Run: `task freshness:check`
Expected: PASS — insbesondere der S1-Ratchet gegen `docs/code-quality/baseline.json` (Datei `[id].astro` darf 400 nicht überschreiten und ist nicht baselined) und die Baseline-Key-Count-Assertion (keine neuen Baseline-Einträge).

- [ ] **Step 4: OpenSpec-Change-Tree validieren**

Run: `task test:openspec`
Expected: PASS — der `openspec/`-Change-Tree (inkl. `openspec/changes/openspec-ticket-detail-view/`) ist gültig.

- [ ] **Step 5: Generierte Artefakte committen (falls Step 2 etwas geändert hat)**

```bash
git add -A
git status --short
# Falls freshness:regenerate generierte Dateien geändert hat (test-inventory.json, repo-index.json, etc.):
git commit -m "chore(freshness): regenerate artifacts for OpenSpecProposalsPanel [T000962]" || echo "nichts zu committen"
```

Hinweis bei Rebase-Konflikten in generierten Artefakten (`docs/generated/**`, `docs/code-quality/repo-index.json`): mit `git checkout --ours <file>` auflösen, dann `git add` (siehe CLAUDE.md → „Generated artifacts are conflict magnets").

---

## Self-Review

**Spec-Coverage:**
- Spec „Komponente: OpenSpecProposalsPanel" (Props, conditional, Status-Badge-Farben, GitHub-Link, Slug-Titel-Case, Stil-Vorlage ContainerDorPanel) → **Task 1**.
- Spec „Integration in [id].astro" (statischer Import, `const openspecProposals`, Template nach TicketAttachmentsPanel) → **Task 2**.
- Spec „Akzeptanzkriterien 1–4" → Task 2 (conditional render + Panel sichtbar/unsichtbar), Task 1 (Badge-Farben), Task 3 (`freshness:regenerate`/`freshness:check`/`test:changed`/`test:openspec`).
- Spec „Non-Goals" (kein Drawer, kein proposal.md-Parsing, keine CRUD, kein admin.ts-Touch) → eingehalten: nur Vollansicht, nur JSON-Import, read-only, admin.ts unberührt.

**Placeholder-Scan:** Kein TBD/TODO/„handle edge cases" — jeder Code-Step enthält vollständigen Code; jeder Run-Step ein exaktes Kommando mit erwartetem Ergebnis.

**Typ-Konsistenz:** Prop-Typ `Array<{ slug: string; status: string }>` identisch in Task 1 (Komponenten-Signatur), Task 2 (Lookup-`const` + Cast von `openspec-status.json`) und Global Constraints. Komponenten-Helfer (`badgeClass`, `statusLabel`, `titleFromSlug`, `proposalUrl`) sind ausschließlich komponenten-intern und konsistent benannt.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-20-openspec-ticket-detail-view.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks.
2. **Inline Execution** — execute in this session with checkpoints (`superpowers:executing-plans`).
