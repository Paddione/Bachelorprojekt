---
title: Cockpit Ticket Fullscreen — Spec/Lastenheft-Übersicht & Fortschritts-Flagging
ticket_id: T000953
plan_ref: docs/superpowers/plans/2026-06-20-cockpit-fullscreen-overview.md
slug: cockpit-fullscreen-overview
spec_ref: docs/superpowers/specs/2026-06-20-cockpit-fullscreen-overview-design.md
status: completed
date: 2026-06-20
authors: [paddione]
domains: [website]
file_locks:
  - website/src/pages/admin/tickets/[id].astro
  - website/src/components/admin/ContainerDorPanel.svelte
  - website/src/components/admin/TicketSpecProgress.svelte
  - website/src/lib/tickets/container-detail.ts
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Cockpit Ticket Fullscreen — Spec/Lastenheft-Übersicht & Fortschritts-Flagging — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Macht die Cockpit-Vollansicht (`/admin/tickets/[id]`) zur einzigen Anlaufstelle für den vollständigen Spec-/Projektzustand eines Container-Tickets — mit dynamischem Pflichtenheft/Lastenheft-Label, einer "Noch zu erledigen"-Fortschritts-Checkliste und einer spec-logischen Sektion-Reihenfolge.

**Architecture:** Drei isolierte, additive Pakete auf der bestehenden Astro-Seite + Svelte-Inseln. Paket 1 reicht ein neues, aus dem bereits importierten `lastenheft.ts`-Helper abgeleitetes Boolean (`lastenheftLocked`) durch die `ContainerDor`-Datenstruktur in das `ContainerDorPanel`. Paket 2 ist eine reine Präsentations-Insel (`TicketSpecProgress.svelte`), die ausschließlich aus bereits geladenen Props rendert (kein DB-/API-Zugriff, keine neuen Imports außer dem `ContainerDor`-Typ). Paket 3 sortiert die Main-Column-Sektionen um und fügt die neue Insel ein — netto zeilenneutral.

**Tech Stack:** Astro 5, Svelte 5 (Runes: `$props`), TypeScript, Tailwind, Vitest (+ pg-mem für DB-Helper-Tests).

## Global Constraints

- **S1-Zeilenlimits (Ratchet gegen statisches Extension-Limit — alle vier Dateien sind `nicht-baselined`):**
  - `website/src/pages/admin/tickets/[id].astro` — Ist **395** · `.astro`-Limit **400** → **Budget = +5 Zeilen**. Paket 3 MUSS netto ≤ +5 bleiben; Ziel: zeilenneutral (Umsortierung) + 1 Insel-Zeile + optionaler 1-Zeilen-Hinweis. **Nicht über 400 wachsen** (statisches `.astro`-Limit, kein Baseline-Spielraum).
  - `website/src/components/admin/ContainerDorPanel.svelte` — Ist **42** · `.svelte`-Limit **500** → Budget reichlich; Ziel ≤ **70**.
  - `website/src/lib/tickets/container-detail.ts` — Ist **101** · `.ts`-Limit **600** → Budget reichlich; Ziel ≤ **108**.
  - `website/src/components/admin/TicketSpecProgress.svelte` — NEU · `.svelte`-Limit **500** → Ziel ≤ **65** (mit Wachstumsreserve).
- **S2 (Import-Zyklen):** Keine neuen Zyklen. `TicketSpecProgress.svelte` importiert NUR den `ContainerDor`-Typ aus `container-detail` (`import type`). `container-detail.ts` importiert `isLastenheftLocked` aus dem pure-Modul `lastenheft.ts` (das selbst keine Imports hat → kein Zyklus möglich).
- **S3 (Hardcodierte Hostnamen):** Keine `*.mentolder.de`/`*.korczewski.de`-Literale in neuem Code. GitHub-PR-Links nutzen das bestehende `Paddione/Bachelorprojekt`-Repo-Muster wie in `TicketPlanPanel.svelte` (kein Brand-Host).
- **S4 (Orphans):** Kein neues Manifest/Skript. `TicketSpecProgress.svelte` wird durch `[id].astro` importiert → kein Orphan.
- **Nicht im Scope:** Kein Editieren/Locken der Anforderungen in der Fullscreen-View, keine API-Whitelist-/Schema-Änderung, keine Änderung an `TicketDrawer.svelte` oder am Cockpit-Board, keine Duplikation des Lock-UI aus `PlanningOfficeDetail.svelte`.
- **Container-Gating:** `TicketSpecProgress` und `ContainerDorPanel` rendern nur für Container-Tickets (`type in ['project','feature']`); das ist bereits über `isContainer`/`containerDor !== null` in `[id].astro` gegeben.
- **Sprache:** UI-Strings deutsch (bestehende Konvention der Datei).

---

## File Structure

| Datei | Verantwortung | Aktion |
|-------|---------------|--------|
| `website/src/lib/tickets/container-detail.ts` | DB-Datenzugriff + `ContainerDor`-Datenstruktur | Modify: `+1` Import, `+1` Interface-Feld, `+1` Return-Feld |
| `website/src/lib/tickets/container-detail.test.ts` | Vitest für die Helper | Modify: 1 neuer Assert + 1 neuer Testfall |
| `website/src/components/admin/ContainerDorPanel.svelte` | DoR-/Anforderungs-Panel | Modify: dynamisches Label, Lock-Badge, Leere-Liste-Fallback |
| `website/src/components/admin/TicketSpecProgress.svelte` | Fortschritts-Checkliste (Präsentation) | Create |
| `website/src/pages/admin/tickets/[id].astro` | Seitenkomposition + Sektion-Reihenfolge | Modify: Import + Insert + Umsortierung + Leer-Hinweis |

---

## Task 1: `ContainerDor.lastenheftLocked` aus `lastenheft.ts` ableiten

**Files:**
- Modify: `website/src/lib/tickets/container-detail.ts:1-3` (Import), `:68-76` (Interface), `:89-98` (Return)
- Test: `website/src/lib/tickets/container-detail.test.ts:204-235` (bestehenden `describe('getContainerDor')` erweitern)

**Interfaces:**
- Consumes: `isLastenheftLocked(readiness: Record<string, unknown> | null | undefined): boolean` aus `website/src/lib/tickets/lastenheft.ts` (bereits vorhandenes pure-Modul); `Readiness` aus `../planning-office` (bereits importiert).
- Produces: `interface ContainerDor` erhält das neue Feld `lastenheftLocked: boolean`. Konsumiert von Task 2 (`TicketSpecProgress`) und Task 3 (`ContainerDorPanel`).

**S1-Budget:** `container-detail.ts` Ist 101 · Limit 600 → Budget reichlich; nach Änderung ~104.

- [ ] **Step 1: Bestehenden DoR-Test um Lock-Assertions erweitern (failing)**

In `website/src/lib/tickets/container-detail.test.ts`, im `describe('getContainerDor', ...)`, den ersten Testfall `'reads DoR fields and computes dorScore'` um eine Assertion ergänzen (das Fixture setzt `readiness` ohne `lastenheft_locked` → erwartet `false`):

```ts
    expect(d!.dorScore).toBe(2);
    expect(d!.lastenheftLocked).toBe(false);
```

Und einen neuen Testfall direkt danach einfügen:

```ts
  it('reports lastenheftLocked=true when the readiness flag is set', async () => {
    const t = await pool.query(
      `INSERT INTO tickets.tickets
         (id, type, brand, title, status, priority, readiness, requirements_list)
       VALUES ('f-locked','feature','mentolder','Locked Feature','backlog','mittel',
               '{"lastenheft_locked":true}'::jsonb, ARRAY['Req 1'])
       RETURNING id`);
    const d = await getContainerDor('mentolder', t.rows[0].id);
    expect(d).not.toBeNull();
    expect(d!.lastenheftLocked).toBe(true);
  });
```

- [ ] **Step 2: Test ausführen, Fehlschlag verifizieren**

Run: `cd website && npx vitest run src/lib/tickets/container-detail.test.ts -t lastenheft`
Expected: FAIL — `lastenheftLocked` ist `undefined` (Feld existiert noch nicht), beide neuen Assertions schlagen fehl.

- [ ] **Step 3: Import von `isLastenheftLocked` ergänzen**

In `website/src/lib/tickets/container-detail.ts` die bestehende Helper-Import-Zeile ergänzen (neue Zeile nach Zeile 3):

```ts
import { dorScore, DOR_KEYS, type Readiness } from '../planning-office';
import { isLastenheftLocked } from './lastenheft';
```

- [ ] **Step 4: Interface-Feld ergänzen**

Im `export interface ContainerDor { ... }` (Zeilen 68–76) nach `requirementsList: string[];` ergänzen:

```ts
  requirementsList: string[];
  lastenheftLocked: boolean;
}
```

- [ ] **Step 5: Return-Wert ergänzen**

Im `return { ... }` von `getContainerDor` (Zeilen 90–98) nach `requirementsList: r.requirements_list ?? [],` ergänzen:

```ts
    requirementsList: r.requirements_list ?? [],
    lastenheftLocked: isLastenheftLocked(readiness),
  };
```

- [ ] **Step 6: Test ausführen, Erfolg verifizieren**

Run: `cd website && npx vitest run src/lib/tickets/container-detail.test.ts`
Expected: PASS — alle `getContainerDor`-Fälle inkl. der beiden neuen Lock-Assertions grün.

- [ ] **Step 7: S1-Check für die Datei**

Run: `cd /tmp/wt-cockpit-fullscreen-overview && wc -l website/src/lib/tickets/container-detail.ts`
Expected: ≤ 108 Zeilen.

- [ ] **Step 8: Commit**

```bash
git add website/src/lib/tickets/container-detail.ts website/src/lib/tickets/container-detail.test.ts
git commit -m "feat(cockpit): derive ContainerDor.lastenheftLocked from readiness [T000953]"
```

---

## Task 2: `TicketSpecProgress.svelte` — "Noch zu erledigen"-Checkliste

**Files:**
- Create: `website/src/components/admin/TicketSpecProgress.svelte`

**Interfaces:**
- Consumes: `ContainerDor` (aus Task 1, inkl. `lastenheftLocked`, `valueProp`, `requirementsList`, `readiness`) via `import type` aus `../../lib/tickets/container-detail`.
- Produces: Svelte-5-Komponente mit Props
  ```ts
  let { ticket, dor, hasPlan, hasPr }: {
    ticket: { description: string | null };
    dor: ContainerDor;
    hasPlan: boolean;
    hasPr: boolean;
  } = $props();
  ```
  Konsumiert von Task 3 (`[id].astro`). **Wichtig:** `ticket` wird absichtlich auf `{ description: string | null }` strukturell typisiert (nicht der volle `TicketDetail`-Typ), um S2-Import-Zyklen zu vermeiden — die Komponente braucht nur `description`.

**10-Punkte-Logik (grün `✓` wenn Bedingung erfüllt, sonst amber `○`):**

| # | Label | Bedingung (grün) |
|---|-------|------------------|
| 1 | Beschreibung | `(ticket.description ?? '').trim().length > 0` |
| 2 | Value Prop | `(dor.valueProp ?? '').trim().length > 0` |
| 3 | Anforderungen erfasst | `dor.requirementsList.length > 0` |
| 4 | Lastenheft verriegelt | `dor.lastenheftLocked === true` |
| 5 | Spec skizziert | `dor.readiness.spec_skizziert === true` |
| 6 | Offene Fragen geklärt | `dor.readiness.offene_fragen_geklaert === true` |
| 7 | Abhängigkeiten klar | `dor.readiness.abhaengigkeiten_klar === true` |
| 8 | Aufwand geschätzt | `dor.readiness.aufwand_geschaetzt === true` |
| 9 | Plan vorhanden | `hasPlan === true` |
| 10 | PR erstellt | `hasPr === true` |

**S1-Budget:** NEU · `.svelte`-Limit 500 → Ziel ≤ 65 Zeilen.

- [ ] **Step 1: Komponente schreiben**

Datei `website/src/components/admin/TicketSpecProgress.svelte`:

```svelte
<script lang="ts">
  import type { ContainerDor } from '../../lib/tickets/container-detail';

  let { ticket, dor, hasPlan, hasPr }: {
    ticket: { description: string | null };
    dor: ContainerDor;
    hasPlan: boolean;
    hasPr: boolean;
  } = $props();

  const items = $derived([
    { label: 'Beschreibung',          done: (ticket.description ?? '').trim().length > 0 },
    { label: 'Value Prop',            done: (dor.valueProp ?? '').trim().length > 0 },
    { label: 'Anforderungen erfasst', done: dor.requirementsList.length > 0 },
    { label: 'Lastenheft verriegelt', done: dor.lastenheftLocked === true },
    { label: 'Spec skizziert',        done: dor.readiness.spec_skizziert === true },
    { label: 'Offene Fragen geklärt', done: dor.readiness.offene_fragen_geklaert === true },
    { label: 'Abhängigkeiten klar',   done: dor.readiness.abhaengigkeiten_klar === true },
    { label: 'Aufwand geschätzt',     done: dor.readiness.aufwand_geschaetzt === true },
    { label: 'Plan vorhanden',        done: hasPlan },
    { label: 'PR erstellt',           done: hasPr },
  ]);
  const completed = $derived(items.filter((i) => i.done).length);
  const pct = $derived(Math.round((completed / items.length) * 100));
</script>

<div class="bg-dark-light rounded-2xl border border-dark-lighter p-6">
  <div class="flex items-center justify-between mb-2">
    <h2 class="text-sm font-semibold text-light font-serif uppercase tracking-wide">Noch zu erledigen</h2>
    <span class="text-xs font-mono text-gold">Fertig: {completed}/{items.length}</span>
  </div>
  <div class="h-1.5 w-full rounded-full bg-dark mb-4" role="progressbar"
       aria-valuenow={completed} aria-valuemin="0" aria-valuemax={items.length}>
    <div class="h-1.5 rounded-full bg-gold transition-all" style={`width:${pct}%`}></div>
  </div>
  <ul class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm" role="list">
    {#each items as it}
      <li class="flex items-center gap-2" role="listitem">
        <span class={it.done ? 'text-green-400' : 'text-muted'}>{it.done ? '✓' : '○'}</span>
        <span class={it.done ? 'text-light' : 'text-muted'}>{it.label}</span>
      </li>
    {/each}
  </ul>
</div>
```

- [ ] **Step 2: Typecheck der Komponente**

Run: `cd website && npx astro check 2>&1 | grep -i "TicketSpecProgress" || echo "no TicketSpecProgress errors"`
Expected: `no TicketSpecProgress errors` (oder keine Zeile mit Fehler zur Datei). Falls `astro check` global zu langsam/rauschig ist, alternativ `npx svelte-check --threshold error 2>&1 | grep -i TicketSpecProgress`.

- [ ] **Step 3: S1-Check für die neue Datei**

Run: `cd /tmp/wt-cockpit-fullscreen-overview && wc -l website/src/components/admin/TicketSpecProgress.svelte`
Expected: ≤ 65 Zeilen.

- [ ] **Step 4: Commit**

```bash
git add website/src/components/admin/TicketSpecProgress.svelte
git commit -m "feat(cockpit): add TicketSpecProgress checklist component [T000953]"
```

---

## Task 3: `ContainerDorPanel.svelte` — dynamisches Label, Lock-Badge, Leere-Liste-Fallback

**Files:**
- Modify: `website/src/components/admin/ContainerDorPanel.svelte:1-13` (Script), `:36-41` (Anforderungs-Sektion)

**Interfaces:**
- Consumes: `ContainerDor` inkl. neuem `lastenheftLocked: boolean` (aus Task 1). Optional Helper `requirementsLabel(locked)` aus `lastenheft.ts` — wird hier **nicht** importiert, um die Datei minimal zu halten; das Label wird inline aus `dor.lastenheftLocked` abgeleitet (gleiche Logik wie `requirementsLabel`).
- Produces: keine neue Schnittstelle (reine Präsentationsänderung).

**S1-Budget:** Ist 42 · `.svelte`-Limit 500 → Ziel ≤ 70 Zeilen.

- [ ] **Step 1: Anforderungs-Sektion ersetzen (Label dynamisch + Badge + Leere-Fallback)**

In `website/src/components/admin/ContainerDorPanel.svelte` den bestehenden `{#if dor.requirementsList.length > 0}`-Block (Zeilen 36–41) durch folgende Version ersetzen — der äußere `{#if}` entfällt, damit auch der leere Fall gerendert wird:

```svelte
  <div class="flex items-center justify-between mt-3 mb-1">
    <h3 class="text-xs text-muted uppercase tracking-wide">
      {dor.lastenheftLocked ? 'Lastenheft' : 'Pflichtenheft'}
    </h3>
    {#if dor.lastenheftLocked}
      <span class="text-[10px] px-1.5 py-0.5 rounded-full border border-green-800 bg-green-900/40 text-green-300">🔒 verriegelt · KI-bereit</span>
    {:else}
      <span class="text-[10px] px-1.5 py-0.5 rounded-full border border-yellow-800 bg-yellow-900/40 text-yellow-300">✏ Entwurf</span>
    {/if}
  </div>
  {#if dor.requirementsList.length > 0}
    <ul class="list-disc list-inside text-sm text-light/90 space-y-0.5" role="list">
      {#each dor.requirementsList as r}<li role="listitem">{r}</li>{/each}
    </ul>
  {:else}
    <p class="text-sm text-yellow-300">⚠ Keine Anforderungen erfasst</p>
  {/if}
```

- [ ] **Step 2: Typecheck**

Run: `cd website && npx astro check 2>&1 | grep -i "ContainerDorPanel" || echo "no ContainerDorPanel errors"`
Expected: `no ContainerDorPanel errors`.

- [ ] **Step 3: Manuelle Verifikation der drei Label-Zustände (AC-1/2/3)**

Lies die geänderte Datei und bestätige durch Inspektion:
- AC-1: `lastenheftLocked=false` → Heading `Pflichtenheft` + amber-Badge `✏ Entwurf`.
- AC-2: `lastenheftLocked=true` → Heading `Lastenheft` + green-Badge `🔒 verriegelt · KI-bereit`.
- AC-3: `requirementsList.length === 0` → amber `⚠ Keine Anforderungen erfasst` statt leerem Panel.

- [ ] **Step 4: S1-Check**

Run: `cd /tmp/wt-cockpit-fullscreen-overview && wc -l website/src/components/admin/ContainerDorPanel.svelte`
Expected: ≤ 70 Zeilen.

- [ ] **Step 5: Commit**

```bash
git add website/src/components/admin/ContainerDorPanel.svelte
git commit -m "feat(cockpit): dynamic Pflichtenheft/Lastenheft label + lock badge in DoR panel [T000953]"
```

---

## Task 4: `[id].astro` — Insel einbinden, Sektion-Reihenfolge, Leer-Hinweis

**Files:**
- Modify: `website/src/pages/admin/tickets/[id].astro:23` (Import), `:155-187` (Main-Column-Sektionen)

**Interfaces:**
- Consumes: `TicketSpecProgress` (Task 2), `ContainerDorPanel` mit neuem `dor.lastenheftLocked` (Task 1+3), die bereits berechneten `containerDor`, `containerPlan`, `isContainer`, `ticket`.
- Produces: finale Seitenkomposition. Keine neue Schnittstelle.

**S1-Budget (KRITISCH):** Ist **395** · statisches `.astro`-Limit **400** (nicht-baselined, KEIN Baseline-Spielraum) → **harte Obergrenze 400, Budget +5 Zeilen**. Die Umsortierung selbst ist zeilenneutral (nur Verschiebung bestehender Blöcke). Netto-Zuwachs: 1 Import-Zeile + 1 `<TicketSpecProgress>`-Insel-Zeile + 1-Zeilen-Leer-Hinweis = **+3**. Endstand erwartet ~398 ≤ 400. **Vor dem Commit per `wc -l` gegen 400 prüfen; falls > 400, den Leer-Hinweis einzeilig halten oder den Import in eine bestehende Importzeile zusammenziehen.**

**Ziel-Reihenfolge der Main-Column (`<div class="lg:col-span-2 space-y-6">`):**
1. Beschreibung (mit Leer-Hinweis-Zeile)
2. `TicketSpecProgress` (NEU, nur Container)
3. `ContainerDorPanel`
4. `TicketPlanPanel`
5. `ContainerChildrenList`
6. `GrillingStepper` (nach hinten)
7. `ProjectQuestionnairesPanel`
8. Verknüpfungen
9. Verlauf
10. Anhänge

- [ ] **Step 1: Import für `TicketSpecProgress` ergänzen**

Nach Zeile 23 (`import TicketPlanPanel ...`) ergänzen:

```astro
import TicketPlanPanel from '../../../components/admin/TicketPlanPanel.svelte';
import TicketSpecProgress from '../../../components/admin/TicketSpecProgress.svelte';
```

- [ ] **Step 2: Beschreibungs-Block um Leer-Hinweis ergänzen**

Im Beschreibungs-`<div>` (Zeilen 157–169) den `:else`-Zweig des `ticket.description`-Ausdrucks anpassen, sodass der Leer-Fall einen Warnhinweis trägt (statt nur "Keine Beschreibung."):

```astro
            {ticket.description ? (
              <div class="md-body text-light/90" set:html={renderMarkdown(ticket.description)} />
            ) : (
              <p class="text-sm text-yellow-300 italic">⚠ Noch leer — keine Beschreibung erfasst.</p>
            )}
```

- [ ] **Step 3: Main-Column-Sektionen umsortieren und Insel einfügen**

Den Block zwischen dem Beschreibungs-`<div>` (Ende Zeile 169) und dem Beginn der "Linked tickets"-Sektion (Zeile 189) durch folgende neue Reihenfolge ersetzen. Die bestehenden Komponenten-Aufrufe werden 1:1 verschoben; einzig die `<TicketSpecProgress>`-Zeile ist neu:

```astro
          {isContainer && containerDor && (
            <TicketSpecProgress client:load
              ticket={{ description: ticket.description }}
              dor={containerDor}
              hasPlan={containerPlan !== null}
              hasPr={containerPlan?.prNumber != null} />
          )}

          {containerDor && <ContainerDorPanel client:load dor={containerDor} />}

          {containerPlan && <TicketPlanPanel client:load plan={containerPlan} renderedHtml={planHtml} />}

          {ticket.children.length > 0 && (
            <ContainerChildrenList children={ticket.children} />
          )}

          <GrillingStepper
            client:load
            ticketId={ticket.id}
            questionnaireId="coaching-sessions-v1"
            grillingAnswers={ticket.grillingAnswers ?? null}
            grillingMeta={ticket.grillingMeta ?? null}
          />

          <ProjectQuestionnairesPanel assignments={questionnaireBundles} />
```

> Hinweis: `<GrillingStepper>` und `<ProjectQuestionnairesPanel>` wandern aus ihrer alten Position (vormals Zeilen 171–179, direkt nach Beschreibung) hinter `ContainerChildrenList`. Sicherstellen, dass die alten Vorkommen entfernt und nicht dupliziert werden.

- [ ] **Step 4: Doppelte/verwaiste Blöcke prüfen**

Run: `cd /tmp/wt-cockpit-fullscreen-overview && grep -c "GrillingStepper" website/src/pages/admin/tickets/\[id\].astro && grep -c "ProjectQuestionnairesPanel" website/src/pages/admin/tickets/\[id\].astro`
Expected: `GrillingStepper` → 2 (1 Import + 1 Verwendung), `ProjectQuestionnairesPanel` → 2 (1 Import + 1 Verwendung). Höhere Zahl ⇒ Duplikat aus Step 3 entfernen.

- [ ] **Step 5: Reihenfolge per Inspektion gegen AC-5 prüfen**

Lies `website/src/pages/admin/tickets/[id].astro` Zeilen ~155–230 und bestätige die Reihenfolge: Beschreibung → TicketSpecProgress → ContainerDorPanel → TicketPlanPanel → ContainerChildrenList → GrillingStepper → ProjectQuestionnairesPanel → Verknüpfungen → Verlauf → Anhänge.

- [ ] **Step 6: Typecheck**

Run: `cd website && npx astro check 2>&1 | grep -i "tickets/\[id\]" || echo "no [id].astro errors"`
Expected: `no [id].astro errors`.

- [ ] **Step 7: S1-Hardcheck gegen 400 (KRITISCH)**

Run: `cd /tmp/wt-cockpit-fullscreen-overview && wc -l website/src/pages/admin/tickets/\[id\].astro`
Expected: ≤ **400**. Bei > 400: Leer-Hinweis auf eine Zeile kürzen bzw. Importzeile zusammenziehen, bis ≤ 400.

- [ ] **Step 8: Commit**

```bash
git add "website/src/pages/admin/tickets/[id].astro"
git commit -m "feat(cockpit): reorder fullscreen sections + spec progress island [T000953]"
```

---

## Task 5: Finale Verifikation (CI-Äquivalent)

**Files:** keine Code-Änderung; reine Verifikation + ggf. regenerierte Artefakte.

- [ ] **Step 1: Gezielte Tests für geänderte Domains**

Run: `cd /tmp/wt-cockpit-fullscreen-overview && task test:changed`
Expected: PASS — `container-detail.test.ts` (inkl. neuer Lock-Fälle) grün, S1-Quality-Check ohne Verletzung.

- [ ] **Step 2: Freshness-Artefakte regenerieren**

Run: `cd /tmp/wt-cockpit-fullscreen-overview && task freshness:regenerate`
Expected: aktualisiert generierte Artefakte (test-inventory, repo-index, …). Falls sich Dateien ändern, mitcommitten.

- [ ] **Step 3: CI-äquivalenter Freshness-/Quality-Gate-Check**

Run: `cd /tmp/wt-cockpit-fullscreen-overview && task freshness:check`
Expected: PASS — Freshness + `quality:check` (S1–S4-Ratchet) + Baseline-Key-Count-Assertion grün. Insbesondere: keine S1-Verletzung für `[id].astro` (≤ 400), keine neue Baseline-Zeile.

- [ ] **Step 4: Endgültige Zeilenbudget-Bestätigung (Evidenz)**

Run: `cd /tmp/wt-cockpit-fullscreen-overview && wc -l website/src/pages/admin/tickets/\[id\].astro website/src/components/admin/ContainerDorPanel.svelte website/src/lib/tickets/container-detail.ts website/src/components/admin/TicketSpecProgress.svelte`
Expected: `[id].astro` ≤ 400 · `ContainerDorPanel.svelte` ≤ 70 · `container-detail.ts` ≤ 108 · `TicketSpecProgress.svelte` ≤ 65.

- [ ] **Step 5: Regenerierte Artefakte committen (falls vorhanden)**

```bash
git add -A
git commit -m "chore(cockpit): regenerate freshness artifacts [T000953]" || echo "nothing to commit"
```

---

## Self-Review

**1. Spec coverage:**
- Paket 1 (dyn. Label + `lastenheftLocked`) → Task 1 (Datenfeld) + Task 3 (UI). ✓
- AC-1/AC-2/AC-3 (Label/Badge/Leer-Fallback) → Task 3 Step 1+3. ✓
- Paket 2 (`TicketSpecProgress`, 10 Punkte, Header `Fertig: X/10`, Balken, 2-spaltig, nur Container) → Task 2 + Gating in Task 4 Step 3. ✓
- AC-4 (10 korrekte Grün/Amber-Zustände) → Task 2 Logiktabelle. ✓
- Paket 3 / AC-5 (Reihenfolge) → Task 4 Step 3+5. ✓
- AC-6 (kein TS-Fehler, keine S1-Verletzung) → Typechecks je Task + Task 5. ✓
- AC-7 (nur Container) → `isContainer && containerDor` / `containerDor &&`-Gates. ✓
- Leer-Beschreibungs-Hinweis (Paket 3, optional) → Task 4 Step 2. ✓

**2. Placeholder scan:** Keine offenen Lückenfüller; jeder Code-Step enthält vollständigen Code; Testfälle ausgeschrieben. ✓

**3. Type consistency:** `lastenheftLocked: boolean` durchgängig (Task 1 Interface → Task 2 Props → Task 3 Template). `hasPlan`/`hasPr` als Props in Task 2 definiert und in Task 4 mit `containerPlan !== null` / `containerPlan?.prNumber != null` befüllt. `ticket` in `TicketSpecProgress` strukturell `{ description: string | null }` (S2-sicher), in Task 4 als `{ description: ticket.description }` übergeben — konsistent. ✓
