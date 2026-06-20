---
title: Cockpit Direct Ticket Links — TicketDrawer entfernen, Titel als Navigationslinks
ticket_id: T000968
plan_ref: docs/superpowers/plans/2026-06-20-cockpit-direct-ticket-links.md
slug: cockpit-direct-ticket-links
spec_ref: docs/superpowers/specs/2026-06-20-cockpit-direct-ticket-links-design.md
status: active
date: 2026-06-20
authors: [paddione]
domains: [website]
file_locks:
  - website/src/components/admin/TicketRow.svelte
  - website/src/components/admin/CockpitTable.svelte
  - website/src/components/admin/Cockpit.svelte
  - website/src/lib/stores/cockpitStore.ts
  - website/src/components/admin/TicketDrawer.svelte
  - website/src/components/admin/TicketDrawer.test.ts
  - website/src/components/admin/TicketRow.test.ts
  - website/src/components/admin/CockpitTable.test.ts
  - website/src/lib/stores/cockpitStore.test.ts
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Cockpit Direct Ticket Links — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ticket-Titel in der Cockpit-Overview werden zu direkten `<a>`-Navigationslinks auf `/admin/tickets/{id}`; der cockpit-interne `TicketDrawer` und sein gesamter Zustandsapparat (`drawerOpen`, `drawerTicket`, Store-Feld `activeTicket`, `setActiveTicket`) werden vollständig entfernt.

**Architecture:** Reine Subtraktion über die bestehende Komponentenkette `Cockpit.svelte` → `CockpitTable.svelte` → `TicketRow.svelte` plus den Store `cockpitStore.ts`. Der einzige additive Schritt ist das Ersetzen eines `<button>` durch ein `<a>` mit `href` in `TicketRow.svelte`. Die Vollansicht `/admin/tickets/{id}` existiert bereits und kann alles, was der Drawer konnte (Titel-/Beschreibungs-/Priority-Edit, Status-Transitionen) — sie bleibt unverändert. Es gibt keine neue Datei, keinen neuen Endpoint, keine Schema-Änderung.

**Tech Stack:** Astro 5, Svelte 5 (Svelte-4-`export let`-Syntax in diesen Dateien beibehalten — NICHT auf Runes migrieren), TypeScript, Vitest + @testing-library/svelte.

## Global Constraints

- **S1-Zeilenlimits (Ratchet — alle betroffenen Quell-/Testdateien sind `nicht-baselined`, wirksame Schwelle = statisches Extension-Limit):** Jede Änderung *verkleinert* die Datei oder ist netto fast-neutral; es gibt kein Wachstumsrisiko. Konkrete Budgets in der Tabelle unter "Quality-Gates — Vorab-Accounting".
- **S2 (Import-Zyklen):** Keine neuen Imports außer dem bereits in `Cockpit.svelte` vorhandenen `TicketRow`-Typ-Pfad. Es werden ausschließlich Imports/Symbole *entfernt* → kein neuer Zyklus möglich.
- **S3 (Hardcodierte Hostnamen):** Der neue `href` ist ein **relativer Pfad** `/admin/tickets/{ticket.id}` — KEIN `*.mentolder.de`/`*.korczewski.de`-Literal. So bleibt der Link brand-agnostisch (er funktioniert auf beiden Brands ohne Domain im Code).
- **S4 (Orphans):** Es werden nur Dateien gelöscht und Symbole entfernt; keine neuen `k3d/*.yaml` oder `scripts/*` → keine Orphan-Violation.
- **Svelte-Syntax:** Alle vier Komponenten nutzen Svelte-4-`export let`/`createEventDispatcher`. Bestehende Syntax beibehalten; KEINE Runes-Migration im Zuge dieses Plans.
- **Sprache:** Bestehende UI-Strings bleiben deutsch; es kommen keine neuen User-facing Strings hinzu.

## Quality-Gates — Vorab-Accounting (verbindlich)

| Datei | Aktion | Ist-Zeilen | Wirksame Schwelle | Budget | Erwartung nach Änderung |
|-------|--------|-----------|-------------------|--------|--------------------------|
| `website/src/components/admin/TicketRow.svelte` | Modify (−~5) | 113 | 500 (nicht-baselined) | +387 | ~108 (Prop + `handleOpenDrawer` weg, `<button>`→`<a>`, CSS-Zeile angepasst) |
| `website/src/components/admin/CockpitTable.svelte` | Modify (−2) | 197 | 500 (nicht-baselined) | +303 | ~195 (Prop + Durchreichung weg) |
| `website/src/components/admin/Cockpit.svelte` | Modify (−~12) | 170 | 500 (nicht-baselined) | +330 | ~158 (Import, State, 2 Funktionen, Mount, Prop-Pass weg) |
| `website/src/lib/stores/cockpitStore.ts` | Modify (−~7) | 85 | 600 (nicht-baselined) | +515 | ~78 (Interface-Feld, initial-Feld, Funktion weg) |
| `website/src/components/admin/TicketDrawer.svelte` | **Delete** | 166 | — | — | gelöscht |
| `website/src/components/admin/TicketDrawer.test.ts` | **Delete** | 79 | — | — | gelöscht |
| `website/src/components/admin/TicketRow.test.ts` | Modify | 109 | 600 (nicht-baselined) | reichlich | openDrawer-Test → `<a>`-href-Test (netto ~neutral) |
| `website/src/components/admin/CockpitTable.test.ts` | Modify (−~6) | 122 | 600 (nicht-baselined) | reichlich | "opens the drawer via row title click"-Test entfernt |
| `website/src/lib/stores/cockpitStore.test.ts` | Modify (−~7) | 51 | 600 (nicht-baselined) | reichlich | `activeTicket`/`setActiveTicket`-Asserts entfernt |

**Baseline-Key-Count:** Es werden keine Baseline-Einträge hinzugefügt; zwei gelöschte Dateien sind `nicht-baselined`, also bleibt `docs/code-quality/baseline.json` unverändert (CI-Key-Count-Assertion bleibt grün).

## Wichtige Befunde aus der Codebase-Analyse (über die Spec hinaus)

> Die Spec listet nur `TicketRow.test.ts` und `cockpitStore.test.ts` als zu aktualisierende Tests. **Die Analyse fand einen dritten Treffer:** `website/src/components/admin/CockpitTable.test.ts` enthält in Zeilen 85–90 den Test `it('opens the drawer via row title click', ...)`, der `onOpenDrawer` an `CockpitTable` übergibt und einen Klick auf den Titel-Text erwartet. Nach Entfernen der `onOpenDrawer`-Prop und Umstellung des Titels auf einen `<a href>` schlägt dieser Test fehl (der Spy würde nie aufgerufen). Task 2 entfernt diesen Test. Ohne diesen Schritt wäre `task test:changed` rot.

- `createEventDispatcher`/`dispatch` in `TicketRow.svelte` wird weiterhin für `statusChange`, `priorityChange`, `selectToggle`, `dragStart` gebraucht → **NICHT** entfernen, nur den `openDrawer`-Dispatch.
- `TicketDrawer.svelte` wird ausschließlich von `Cockpit.svelte` importiert (bestätigt per Repo-Grep). Es gibt eine separate, unverwandte `AssetTicketDrawer.svelte` in `components/admin/platform/` — die wird NICHT angefasst.
- `setActiveTicket`/`activeTicket` haben außer Store-Definition, `Cockpit.svelte` und `cockpitStore.test.ts` keine weiteren Consumer (bestätigt per Repo-Grep) — Entfernen ist sicher.
- `PortalSidekick.svelte` und `KiKonfiguration.svelte` enthalten eigene, gleichnamige lokale `openDrawer`-Funktionen — diese sind **unverwandt** und bleiben unberührt.

---

## File Structure

| Datei | Verantwortung | Aktion |
|-------|---------------|--------|
| `website/src/components/admin/TicketRow.svelte` | Eine Ticket-Zeile (ID, Titel, Status/Priority-Dropdowns, Badges) | Modify: Titel-`<button>` → `<a href>`, Drawer-Prop/Handler/Dispatch entfernen, `.title-link`-CSS auf Link umstellen |
| `website/src/components/admin/CockpitTable.svelte` | Tabelle/Toolbar/Filter, rendert `TicketRow`-Liste | Modify: `onOpenDrawer`-Prop + Durchreichung entfernen |
| `website/src/components/admin/Cockpit.svelte` | Seiten-Shell, lädt Portfolio/Feature, mountet Tabelle/Modal/Drawer | Modify: Drawer-Import/State/Funktionen/Mount + `setActiveTicket`-Import + Prop-Pass entfernen |
| `website/src/lib/stores/cockpitStore.ts` | Cockpit-UI-Zustand (Feature-Auswahl, Selektion, optimistic edits) | Modify: `activeTicket`-Feld + `setActiveTicket` entfernen |
| `website/src/components/admin/TicketDrawer.svelte` | Eingebettetes Quickedit-Schiebepanel | **Delete** |
| `website/src/components/admin/TicketDrawer.test.ts` | Vitest für TicketDrawer | **Delete** |
| `website/src/components/admin/TicketRow.test.ts` | Vitest für TicketRow | Modify: openDrawer-Test → `<a>`-href-Test |
| `website/src/components/admin/CockpitTable.test.ts` | Vitest für CockpitTable | Modify: Drawer-Title-Click-Test entfernen |
| `website/src/lib/stores/cockpitStore.test.ts` | Vitest für cockpitStore | Modify: `activeTicket`/`setActiveTicket`-Asserts entfernen |

**Reihenfolge-Begründung:** Bottom-up entlang der Abhängigkeitskette: zuerst das Blatt (`TicketRow`, Task 1), dann der Container (`CockpitTable`, Task 2), dann die Shell (`Cockpit`, Task 3), dann der Store (`cockpitStore`, Task 4), dann die Datei-Löschungen (Task 5), zuletzt die Gesamtverifikation (Task 6). So ist nach jedem Task der `git`-Stand kompilierbar und die jeweils geänderten Tests grün.

---

## Task 1: TicketRow — Titel als direkter Link, Drawer-Prop/Handler entfernen

**Files:**
- Modify: `website/src/components/admin/TicketRow.svelte` (Zeilen 12, 39–43, 68, 98)
- Test: `website/src/components/admin/TicketRow.test.ts` (Zeilen 26–31)

**Interfaces:**
- Consumes: nichts (Blatt-Komponente).
- Produces: `TicketRow` exportiert nach dieser Änderung **keine** `onOpenDrawer`-Prop mehr. Verbleibende Callback-Props unverändert: `onStatusChange`, `onPriorityChange`, `onSelectToggle`, `onDragStart`. Der Titel rendert als `<a class="title-link" href="/admin/tickets/{ticket.id}">{ticket.title}</a>`.

- [ ] **Step 1: Failing-Test umschreiben — Titel ist ein Link, kein Drawer-Trigger**

In `website/src/components/admin/TicketRow.test.ts` den bestehenden Block (Zeilen 26–31)

```ts
  it('dispatches openDrawer on title click', async () => {
    const handler = vi.fn();
    const { getByText } = render(TicketRow, { ticket, selected: false, onOpenDrawer: handler });
    await fireEvent.click(getByText('Task One'));
    expect(handler).toHaveBeenCalled();
  });
```

ersetzen durch:

```ts
  it('renders the title as a direct link to the full ticket page', () => {
    const { getByText } = render(TicketRow, { ticket, selected: false });
    const link = getByText('Task One') as HTMLAnchorElement;
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/admin/tickets/t1');
  });
```

(Die Test-Fixture `ticket` oben in der Datei hat `id: 't1'`, daher `href === '/admin/tickets/t1'`.)

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `cd website && npx vitest run src/components/admin/TicketRow.test.ts -t "renders the title as a direct link"`
Expected: FAIL — der Titel ist aktuell ein `<button>` (`link.tagName` === `'BUTTON'`, kein `href`).

- [ ] **Step 3: `onOpenDrawer`-Prop entfernen**

In `website/src/components/admin/TicketRow.svelte` Zeile 12 löschen:

```svelte
  export let onOpenDrawer: ((detail: { ticket: TicketRowT }) => void) | undefined = undefined;
```

- [ ] **Step 4: `handleOpenDrawer`-Funktion entfernen**

In `website/src/components/admin/TicketRow.svelte` die Funktion (Zeilen 39–43) löschen:

```svelte
  function handleOpenDrawer() {
    const detail = { ticket };
    onOpenDrawer?.(detail);
    dispatch('openDrawer', detail);
  }
```

> `const dispatch = createEventDispatcher();` (Zeile 15) und die übrigen `dispatch(...)`-Aufrufe (`statusChange`, `priorityChange`, `selectToggle`, `dragStart`) bleiben — sie werden weiter gebraucht.

- [ ] **Step 5: Titel-`<button>` durch `<a href>` ersetzen**

In `website/src/components/admin/TicketRow.svelte` Zeile 68

```svelte
  <button class="title-link" on:click={handleOpenDrawer}>{ticket.title}</button>
```

ersetzen durch:

```svelte
  <a class="title-link" href="/admin/tickets/{ticket.id}">{ticket.title}</a>
```

- [ ] **Step 6: `.title-link`-CSS von Button-Reset auf Link-Style umstellen**

In `website/src/components/admin/TicketRow.svelte` die Style-Regel (Zeile 98)

```svelte
  .title-link { background: none; border: none; color: inherit; cursor: pointer; text-align: left; padding: 0; }
```

ersetzen durch:

```svelte
  .title-link { color: inherit; text-decoration: none; cursor: pointer; }
  .title-link:hover { text-decoration: underline; }
```

> Begründung: Button-spezifische Resets (`background`, `border`, `text-align`, `padding`) sind für ein `<a>` unnötig. `color: inherit` + `text-decoration: none` lassen den Link wie der bisherige Titel aussehen; `:hover`-Underline gibt dezentes Klick-Affordance. Netto ±0 bis +1 Zeile.

- [ ] **Step 7: Test laufen lassen — muss bestehen, restliche TicketRow-Tests grün**

Run: `cd website && npx vitest run src/components/admin/TicketRow.test.ts`
Expected: PASS (alle Tests der Datei, inkl. responsive/labels/badges-Suiten unverändert grün).

- [ ] **Step 8: Commit**

```bash
git add website/src/components/admin/TicketRow.svelte website/src/components/admin/TicketRow.test.ts
git commit -m "feat(cockpit): render ticket title as direct link to full view [T000966]"
```

---

## Task 2: CockpitTable — `onOpenDrawer`-Prop und Durchreichung entfernen

**Files:**
- Modify: `website/src/components/admin/CockpitTable.svelte` (Zeilen 13, 148)
- Test: `website/src/components/admin/CockpitTable.test.ts` (Zeilen 85–90)

**Interfaces:**
- Consumes: `TicketRow` ohne `onOpenDrawer` (aus Task 1).
- Produces: `CockpitTable` exportiert keine `onOpenDrawer`-Prop mehr. Verbleibende Props unverändert: `feature`, `tickets`, `features`, `onMutated`, `onOpenCreate`.

- [ ] **Step 1: Drawer-Test in CockpitTable.test.ts entfernen**

In `website/src/components/admin/CockpitTable.test.ts` den Block (Zeilen 85–90) löschen:

```ts
  it('opens the drawer via row title click', async () => {
    const onOpenDrawer = vi.fn();
    const { getByText } = render(CockpitTable, { feature, tickets, features: [feature], onOpenDrawer });
    await fireEvent.click(getByText('Alpha'));
    expect(onOpenDrawer).toHaveBeenCalled();
  });
```

> Begründung: Der Titel ist nach Task 1 ein `<a href>`, kein Drawer-Trigger; die Tabelle reicht keinen `onOpenDrawer`-Callback mehr durch. Der Test ist obsolet (Navigations-Verhalten wird in Task 1 auf TicketRow-Ebene über `href` abgedeckt; ein vollständiger Navigations-Klick gehört in E2E, nicht in den jsdom-Komponententest).

- [ ] **Step 2: `onOpenDrawer`-Prop-Deklaration entfernen**

In `website/src/components/admin/CockpitTable.svelte` Zeile 13 löschen:

```svelte
  export let onOpenDrawer: ((detail: { ticket: TicketRowT }) => void) | undefined = undefined;
```

- [ ] **Step 3: `onOpenDrawer`-Durchreichung an `TicketRow` entfernen**

In `website/src/components/admin/CockpitTable.svelte` im `<TicketRow ... />`-Aufruf die letzte Prop-Zeile (Zeile 148) entfernen, sodass aus

```svelte
        <TicketRow ticket={t} busy={busy[t.id]}
          selected={$cockpitStore.selectedTickets.has(t.id)}
          onStatusChange={(d) => patchStatus(d.id, d.status)}
          onPriorityChange={(d) => patchPriority(d.id, d.priority)}
          onSelectToggle={(d) => toggleTicketSelection(d.id)}
          onDragStart={(d) => onDragStart(d.id)}
          onOpenDrawer={(d) => onOpenDrawer?.(d)} />
```

dies wird:

```svelte
        <TicketRow ticket={t} busy={busy[t.id]}
          selected={$cockpitStore.selectedTickets.has(t.id)}
          onStatusChange={(d) => patchStatus(d.id, d.status)}
          onPriorityChange={(d) => patchPriority(d.id, d.priority)}
          onSelectToggle={(d) => toggleTicketSelection(d.id)}
          onDragStart={(d) => onDragStart(d.id)} />
```

> Hinweis: Das `TicketRowT`-Typ-Import (Zeile 2) bleibt — `tickets: TicketRowT[]` nutzt ihn weiterhin.

- [ ] **Step 4: CockpitTable-Tests laufen lassen — alle grün**

Run: `cd website && npx vitest run src/components/admin/CockpitTable.test.ts`
Expected: PASS (alle verbleibenden Tests; der entfernte Drawer-Test taucht nicht mehr auf).

- [ ] **Step 5: Commit**

```bash
git add website/src/components/admin/CockpitTable.svelte website/src/components/admin/CockpitTable.test.ts
git commit -m "feat(cockpit): drop onOpenDrawer prop from CockpitTable [T000966]"
```

---

## Task 3: Cockpit — TicketDrawer-Mount, Drawer-State und Funktionen entfernen

**Files:**
- Modify: `website/src/components/admin/Cockpit.svelte` (Zeilen 5, 10, 18–19, 98–101, 148, 159–160)

**Interfaces:**
- Consumes: `CockpitTable` ohne `onOpenDrawer` (aus Task 2); `cockpitStore` ohne `setActiveTicket` (wird in Task 4 entfernt — dieser Task entfernt bereits den *Import und alle Aufrufe*, damit Task 4 die Funktion gefahrlos löschen kann).
- Produces: keine externen Konsumenten (Top-Level-Insel, via `client:*` aus einer `.astro`-Seite gemountet). Nach dieser Änderung referenziert `Cockpit.svelte` weder `TicketDrawer` noch `setActiveTicket`/`activeTicket`.

- [ ] **Step 1: `setActiveTicket` aus dem Store-Import entfernen**

In `website/src/components/admin/Cockpit.svelte` Zeile 5 von

```svelte
  import { cockpitStore, selectFeature, setActiveTicket, initStoreFromUrl, setLoading, setError }
    from '../../lib/stores/cockpitStore';
```

zu (nur `setActiveTicket` streichen):

```svelte
  import { cockpitStore, selectFeature, initStoreFromUrl, setLoading, setError }
    from '../../lib/stores/cockpitStore';
```

- [ ] **Step 2: `TicketDrawer`-Import entfernen**

In `website/src/components/admin/Cockpit.svelte` Zeile 10 löschen:

```svelte
  import TicketDrawer from './TicketDrawer.svelte';
```

- [ ] **Step 3: Drawer-State entfernen**

In `website/src/components/admin/Cockpit.svelte` die beiden Zeilen (18–19) löschen:

```svelte
  let drawerTicket: TicketRow | null = null;
  let drawerOpen = false;
```

> Prüfen: Wird der Typ `TicketRow` (importiert Zeile 3) sonst noch verwendet? — Ja, in der Signatur von `openDrawer` (wird in Step 4 entfernt). Nach Step 4 ist `TicketRow` im Import von Zeile 3 ungenutzt. **In Step 4 mit-entfernen** (siehe dort), sonst meldet `svelte-check`/TS einen ungenutzten Import.

- [ ] **Step 4: `openDrawer`/`closeDrawer`-Funktionen entfernen und ungenutzten `TicketRow`-Typimport bereinigen**

In `website/src/components/admin/Cockpit.svelte` die beiden Funktionen (Zeilen 98–101) löschen:

```svelte
  function openDrawer(detail: { ticket: TicketRow }) {
    drawerTicket = detail.ticket; drawerOpen = true; setActiveTicket(detail.ticket.id);
  }
  function closeDrawer() { drawerOpen = false; setActiveTicket(null); }
```

Anschließend Zeile 3 anpassen — `TicketRow` aus der Typ-Import-Liste streichen (die übrigen Typen `PortfolioPayload`, `FeatureTickets`, `FeatureNode` werden weiter verwendet), aus

```svelte
  import type { PortfolioPayload, FeatureTickets, TicketRow, FeatureNode } from '../../lib/tickets/cockpit-types';
```

wird:

```svelte
  import type { PortfolioPayload, FeatureTickets, FeatureNode } from '../../lib/tickets/cockpit-types';
```

> Verifikations-Hinweis: Nach diesem Step darf `grep -n 'TicketRow' website/src/components/admin/Cockpit.svelte` keine Treffer mehr liefern (auch nicht im `import type`). Falls doch, ist eine Referenz übersehen worden.

- [ ] **Step 5: `onOpenDrawer`-Prop-Pass an `CockpitTable` entfernen**

In `website/src/components/admin/Cockpit.svelte` im `<CockpitTable ... />`-Block die Zeile 148 (`onOpenDrawer={openDrawer}`) entfernen, aus

```svelte
      <CockpitTable
        feature={currentFeatureNode}
        tickets={featureData?.tickets ?? []}
        features={allFeatures}
        onMutated={refetch}
        onOpenDrawer={openDrawer}
        onOpenCreate={() => (createOpen = true)} />
```

wird:

```svelte
      <CockpitTable
        feature={currentFeatureNode}
        tickets={featureData?.tickets ?? []}
        features={allFeatures}
        onMutated={refetch}
        onOpenCreate={() => (createOpen = true)} />
```

- [ ] **Step 6: `<TicketDrawer .../>`-Mount entfernen**

In `website/src/components/admin/Cockpit.svelte` den Mount (Zeilen 159–160) löschen:

```svelte
  <TicketDrawer ticket={drawerTicket} open={drawerOpen}
    onClose={closeDrawer} onMutated={refetch} />
```

> `<TicketCreateModal .../>` direkt darüber bleibt unverändert.

- [ ] **Step 7: Typecheck der geänderten Komponente — keine ungenutzten Imports/Symbole**

Run: `cd website && npx svelte-check --tsconfig ./tsconfig.json --diagnostic-sources js,svelte 2>&1 | grep -i 'Cockpit.svelte' || echo "Cockpit.svelte: keine Diagnostics"`
Expected: `Cockpit.svelte: keine Diagnostics` (kein "unused import TicketRow", kein "Cannot find name setActiveTicket", kein "Cannot find module ./TicketDrawer.svelte" — letzteres würde erst nach Task 5 hart fehlen, ist hier aber bereits aus dem Import entfernt).

> Falls `svelte-check` lokal nicht als Skript verfügbar ist: ersatzweise `cd website && npx tsc --noEmit` ODER der Build in Task 6 deckt es ab. Der entscheidende Selbstcheck ist `grep`: `grep -nE 'TicketDrawer|setActiveTicket|drawerOpen|drawerTicket|openDrawer|closeDrawer' website/src/components/admin/Cockpit.svelte` muss **leer** sein.

- [ ] **Step 8: Commit**

```bash
git add website/src/components/admin/Cockpit.svelte
git commit -m "feat(cockpit): remove TicketDrawer mount and drawer state from Cockpit [T000966]"
```

---

## Task 4: cockpitStore — `activeTicket`-Feld und `setActiveTicket` entfernen

**Files:**
- Modify: `website/src/lib/stores/cockpitStore.ts` (Zeilen 8, 24, 58–60)
- Test: `website/src/lib/stores/cockpitStore.test.ts` (Zeilen 10–16 anpassen, 30–36 entfernen)

**Interfaces:**
- Consumes: keine Drawer-Aufrufer mehr (`Cockpit.svelte` wurde in Task 3 bereinigt).
- Produces: `CockpitState` ohne Feld `activeTicket`; der Export `setActiveTicket` existiert nicht mehr. Alle übrigen Exporte (`cockpitStore`, `selectedCount`, `selectFeature`, `initStoreFromUrl`, `toggleTicketSelection`, `clearSelection`, `applyOptimistic`, `rollbackOptimistic`, `clearOptimistic`, `setError`, `setLoading`, `get`) unverändert.

- [ ] **Step 1: Tests anpassen — `activeTicket`-Assert raus, `setActiveTicket`-Test entfernen**

In `website/src/lib/stores/cockpitStore.test.ts`:

(a) Den ersten Test (Zeilen 10–16) — `activeTicket`-Assert streichen und Beschreibung anpassen, aus

```ts
  it('starts with no selected feature and no active ticket', async () => {
    const m = await import('./cockpitStore');
    const s = get(m.cockpitStore);
    expect(s.selectedFeature).toBeNull();
    expect(s.activeTicket).toBeNull();
    expect(s.selectedTickets.size).toBe(0);
  });
```

wird:

```ts
  it('starts with no selected feature and no selected tickets', async () => {
    const m = await import('./cockpitStore');
    const s = get(m.cockpitStore);
    expect(s.selectedFeature).toBeNull();
    expect(s.selectedTickets.size).toBe(0);
  });
```

(b) Den kompletten `setActiveTicket`-Test (Zeilen 30–36) löschen:

```ts
  it('setActiveTicket sets and clears the drawer target', async () => {
    const m = await import('./cockpitStore');
    m.setActiveTicket('t1');
    expect(get(m.cockpitStore).activeTicket).toBe('t1');
    m.setActiveTicket(null);
    expect(get(m.cockpitStore).activeTicket).toBeNull();
  });
```

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen (Compile/Run)**

Run: `cd website && npx vitest run src/lib/stores/cockpitStore.test.ts`
Expected: An diesem Punkt sind die Tests so umgeschrieben, dass sie `activeTicket`/`setActiveTicket` nicht mehr referenzieren, aber der Store enthält die Symbole noch — die Datei läuft also grün. Dieser Step dient als Zwischen-Checkpoint: **Expected: PASS** (kein Test referenziert mehr entfernte Symbole). (Reine TDD-Subtraktion: zuerst Consumer entfernen, dann die Definition.)

- [ ] **Step 3: `activeTicket` aus dem `CockpitState`-Interface entfernen**

In `website/src/lib/stores/cockpitStore.ts` Zeile 8 löschen:

```ts
  activeTicket: string | null;
```

- [ ] **Step 4: `activeTicket` aus dem `initial`-State entfernen**

In `website/src/lib/stores/cockpitStore.ts` Zeile 24 löschen:

```ts
  activeTicket: null,
```

- [ ] **Step 5: `setActiveTicket`-Funktion entfernen**

In `website/src/lib/stores/cockpitStore.ts` die Funktion (Zeilen 58–60) löschen:

```ts
export function setActiveTicket(id: string | null): void {
  cockpitStore.update((s) => ({ ...s, activeTicket: id }));
}
```

- [ ] **Step 6: Store-Tests + ganzes admin-/store-Umfeld laufen lassen — grün**

Run: `cd website && npx vitest run src/lib/stores/cockpitStore.test.ts src/components/admin/TicketRow.test.ts src/components/admin/CockpitTable.test.ts`
Expected: PASS (Store ohne `activeTicket`/`setActiveTicket`; keine TS/Run-Fehler wegen fehlender Symbole).

- [ ] **Step 7: Commit**

```bash
git add website/src/lib/stores/cockpitStore.ts website/src/lib/stores/cockpitStore.test.ts
git commit -m "feat(cockpit): drop activeTicket state and setActiveTicket from cockpitStore [T000966]"
```

---

## Task 5: TicketDrawer-Dateien löschen

**Files:**
- Delete: `website/src/components/admin/TicketDrawer.svelte`
- Delete: `website/src/components/admin/TicketDrawer.test.ts`

**Interfaces:**
- Consumes: nichts — beide Dateien haben nach Task 3 keine Importeure mehr (einziger Importeur war `Cockpit.svelte`, bereinigt in Task 3; die Testdatei importiert nur sich selbst).
- Produces: nichts.

- [ ] **Step 1: Sicherstellen, dass es keinen verbleibenden Importeur gibt**

Run: `grep -rn "TicketDrawer" website/src/ | grep -v "platform/AssetTicketDrawer" || echo "kein TicketDrawer-Import mehr"`
Expected: `kein TicketDrawer-Import mehr` (die unverwandte `platform/AssetTicketDrawer.svelte` ist via `grep -v` ausgeschlossen und bleibt bestehen).

- [ ] **Step 2: Beide Dateien per `git rm` löschen**

```bash
git rm website/src/components/admin/TicketDrawer.svelte website/src/components/admin/TicketDrawer.test.ts
```

Expected: git bestätigt das Entfernen beider Pfade.

- [ ] **Step 3: Gesamte website-Vitest-Suite laufen lassen — keine verwaisten Referenzen**

Run: `cd website && npx vitest run`
Expected: PASS (kein Test importiert mehr `TicketDrawer`; die ganze Suite ist grün).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(cockpit): delete TicketDrawer component and its test [T000966]"
```

---

## Task 6: Finale Verifikation (CI-Äquivalent) + OpenSpec-Validierung

**Files:**
- Keine Code-Änderung (nur generierte Artefakte werden ggf. aktualisiert und committet).

**Interfaces:**
- Consumes: den fertigen Stand aus Tasks 1–5.
- Produces: grünes CI-Äquivalent lokal; ggf. regenerierte `website/src/data/test-inventory.json` (+ weitere Freshness-Artefakte) als Commit.

- [ ] **Step 1: Akzeptanzkriterien per grep gegenprüfen (alles entfernt)**

```bash
cd /tmp/wt-cockpit-direct-ticket-links
grep -rn "onOpenDrawer" website/src/components/admin/ ; echo "--- onOpenDrawer (admin) erwartet: leer ---"
grep -rn "setActiveTicket\|activeTicket" website/src/ ; echo "--- setActiveTicket/activeTicket erwartet: leer ---"
ls website/src/components/admin/TicketDrawer.svelte website/src/components/admin/TicketDrawer.test.ts 2>&1 ; echo "--- erwartet: 'No such file' für beide ---"
grep -n 'href="/admin/tickets/' website/src/components/admin/TicketRow.svelte ; echo "--- erwartet: Treffer (Titel-Link vorhanden) ---"
```
Expected: Erste drei greps liefern **keine** Treffer in den genannten Scopes; `ls` meldet "No such file or directory" für beide gelöschten Dateien; der letzte grep zeigt die neue `<a href>`-Zeile. (Deckt AC 2–5 ab.)

- [ ] **Step 2: Test-Inventar regenerieren (Tests wurden geändert/gelöscht)**

Run: `task test:inventory`
Expected: Erfolgreicher Lauf; `website/src/data/test-inventory.json` ist aktualisiert (gelöschte TicketDrawer-Tests entfernt, umbenannte Tests aktualisiert).

- [ ] **Step 3: Gezielte Tests für geänderte Domains**

Run: `task test:changed`
Expected: Grün (vitest `--changed` für website inkl. der drei geänderten Testdateien, BATS-Selection, quality:check).

- [ ] **Step 4: Freshness-Artefakte regenerieren**

Run: `task freshness:regenerate`
Expected: Erfolgreicher Lauf; aktualisiert test-inventory, repo-index und weitere generierte Artefakte. (Konflikt-Hinweis aus CLAUDE.md: `docs/generated/**`, `docs/code-quality/repo-index.json` sind Merge-`ours`-Treiber — beim späteren Rebase ggf. `git checkout --ours` nutzen.)

- [ ] **Step 5: CI-Äquivalent (Freshness + S1–S4-Ratchet + Baseline-Key-Count)**

Run: `task freshness:check`
Expected: Grün. Insbesondere S1 grün (alle vier modifizierten Quell-/Testdateien geschrumpft oder neutral, kein Limit überschritten); Baseline-Key-Count unverändert (keine Baseline-Einträge hinzugefügt/entfernt — die zwei gelöschten Dateien waren nicht-baselined).

- [ ] **Step 6: OpenSpec-Validierung**

Run: `bash scripts/openspec.sh validate`
Expected: Grün (das `openspec/changes/cockpit-direct-ticket-links/`-Tree validiert: `proposal.md`, `tasks.md`, `specs/` konsistent).

> Hinweis: Falls `bash scripts/openspec.sh validate` lokal nicht vorhanden/anders benannt ist, alternativ `task openspec:validate` (laut CLAUDE.md der äquivalente Fail-Closed-Gate).

- [ ] **Step 7: Generierte Artefakte committen (falls Diff)**

```bash
cd /tmp/wt-cockpit-direct-ticket-links
git add -A
git diff --cached --quiet && echo "keine generierten Artefakt-Änderungen zu committen" || \
  git commit -m "chore(cockpit): regenerate test-inventory + freshness artifacts [T000966]"
```
Expected: Entweder ein Commit mit den regenerierten Artefakten ODER die Meldung, dass es nichts zu committen gibt.

- [ ] **Step 8: Abschluss-Sanity — gesamte website-Suite final grün**

Run: `cd website && npx vitest run`
Expected: PASS (Gesamtsuite grün; keine TicketDrawer-Referenzen mehr, Titel-Link-Test grün, Store-Tests grün).

---

## Self-Review (durchgeführt beim Plan-Schreiben)

**1. Spec coverage:**
- AC 1 (Titelklick navigiert zu `/admin/tickets/{id}`) → Task 1 (`<a href>` + Test).
- AC 2 (kein Drawer/Panel mehr) → Task 3 (Mount/State weg) + Task 5 (Datei weg), verifiziert Task 6 Step 1.
- AC 3 (`TicketDrawer.svelte` + `.test.ts` gelöscht) → Task 5, verifiziert Task 6 Step 1.
- AC 4 (`onOpenDrawer` existiert nirgends mehr in admin-Cockpit) → Tasks 1+2+3, verifiziert Task 6 Step 1.
- AC 5 (`setActiveTicket`/`activeTicket` weg aus Store) → Task 4, verifiziert Task 6 Step 1.
- AC 6 (`task test:changed`, `freshness:regenerate`, `freshness:check` grün) → Task 6 Steps 3–5.
- AC 7 (Test-Inventar regeneriert + committet) → Task 6 Steps 2, 7.
- **Zusatz über Spec hinaus:** `CockpitTable.test.ts`-Drawer-Test (Spec übersieht ihn) → Task 2 Step 1. "Was NICHT ändert" (PortalSidekick, TicketCreateModal, BulkBar, Status/Priority-Inline-Edit, Vollansicht) → in keinem Task angefasst; explizit in Global Constraints/Befunden vermerkt.

**2. Placeholder-Scan:** Keine offenen Platzhalter; jeder Code-Step zeigt den exakten Vorher-/Nachher-Code.

**3. Type-Konsistenz:** `onOpenDrawer`-Signatur identisch in TicketRow/CockpitTable/Cockpit entfernt; `setActiveTicket`/`activeTicket` konsistent in Store-Definition, `Cockpit.svelte`-Import/Aufrufen und Tests entfernt; `TicketRow`-Typimport in `Cockpit.svelte` mit dem letzten Nutzer (Task 3 Step 4) bereinigt; `href`-Wert `/admin/tickets/t1` passt zur Test-Fixture `id: 't1'`.
