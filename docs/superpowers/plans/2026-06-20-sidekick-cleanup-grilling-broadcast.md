---
title: SidekickMenu-Bereinigung + Grilling-Widget Session-Broadcast Implementation Plan
ticket_id: T000965
domains: [website, test]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# SidekickMenu-Bereinigung + Grilling-Widget Session-Broadcast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vier nicht mehr genutzte SidekickMenu-Items (Anfragen/Postfach/Pipeline/Lernpfad) samt zugehöriger Nudge-Logik entfernen und das Grilling-Widget zu einem generischen Session-Broadcaster ausbauen (dual-channel `BroadcastChannel` + `CustomEvent`, neuer `brainstorm-v1`-Fragebogen).

**Architecture:** Teil 1 ist reine Entfernung über drei Frontend-Dateien (`SidekickHome.svelte`, `PortalSidekick.svelte`, `sidekick-nudge.ts`) plus Test-Anpassung — die Svelte-Ansichtskomponenten (`TicketSidekickView` etc.) bleiben bestehen, nur ihre Verdrahtung im Sidekick verschwindet. Teil 2 erweitert die reine `mediaviewer-bridge.ts`-Protokollschicht um Session-Typen, fügt einen `brainstorm-v1`-Fragebogen in die pure Datei `grilling.ts` ein, und verdrahtet Host-seitiges Broadcasting in `MediaviewerPanel.svelte` (dual-channel, Channel sofort nach Send geschlossen, kein persistenter State) sowie ein optionales `sessionType`-Override in `GrillingSessionHost.svelte`.

**Tech Stack:** Astro + Svelte 5 (Runes: `$state`/`$derived`/`$props`/`$effect`), TypeScript, Vitest (`@testing-library/svelte`), go-task (`task test:changed`, `task freshness:*`).

## Global Constraints

- **S1-Zeilenlimits:** Alle betroffenen Dateien sind **nicht-baselined**; wirksame Schwelle = statisches Extension-Limit (`.svelte`/`.ts` → 500/600). Größte Datei nach Änderung: `grilling.ts` ~408/600 und `PortalSidekick.svelte` schrumpft. Kein Split nötig. **Niemals** Baseline-/Ignore-Einträge hinzufügen.
- **S2-Import-Zyklen:** `grilling.ts`, `mediaviewer-bridge.ts`, `sidekick-nudge.ts` bleiben pure Module ohne Rück-Import auf DB-/API-Schichten.
- **S3-Hardcodierte Hostnamen:** Keine `*.mentolder.de` / `*.korczewski.de` String-Literale in `website/src/`. Der neue `brainstorm-v1`-Fragebogen darf **keine** Brand-Domains in Fragetexten/Choices enthalten.
- **Svelte 5 Runes durchgängig** — kein `export let`, keine Stores für lokalen State; bestehende `$props()`/`$state()`/`$derived()`/`$effect()`-Patterns spiegeln.
- **Fail-soft** bei Netzwerk/Broadcast: kein Throw nach außen; BroadcastChannel-Send in `try`/`finally` mit `channel.close()`.
- **Bestehende Tests erweitern**, keine neuen Test-Dateien anlegen (`sidekick-nudge.test.ts`, `mediaviewer-bridge.test.ts`, `MediaviewerPanel.test.ts`, `grilling.test.ts` existieren bereits).

---

## File Structure

| Datei | Änderung | Task |
|-------|----------|------|
| `website/src/components/assistant/SidekickHome.svelte` | Modify — Items/Banner/CSS entfernen, renummerieren | Task 1 |
| `website/src/lib/assistant/sidekick-nudge.ts` | Modify — decideBanner, shouldShowLearnDot, View-Typen entfernen | Task 3 |
| `website/src/lib/assistant/sidekick-nudge.test.ts` | Test — decideBanner-Tests entfernen, parseNavigateEvent-Tests behalten | Task 3 |
| `website/src/components/PortalSidekick.svelte` | Modify — Routing, State, Fetches, fab-dot entfernen | Task 2 |
| `website/src/lib/mediaviewer-bridge.ts` | Modify — brainstorm-Mode, sessionStarted/sessionProgress hinzufügen | Task 4 |
| `website/src/lib/mediaviewer-bridge.test.ts` | Test — neue Bridge-Typen testen | Task 4 |
| `website/src/lib/tickets/grilling.ts` | Modify — brainstorm-v1 Questionnaire hinzufügen | Task 5 |
| `website/src/lib/tickets/grilling.test.ts` | Test — brainstorm-v1 Registrierung/Struktur prüfen | Task 5 |
| `website/src/components/MediaviewerPanel.svelte` | Modify — dual-channel Session-Broadcast ergänzen | Task 6 |
| `website/src/components/MediaviewerPanel.test.ts` | Test — CustomEvent-Broadcast prüfen | Task 6 |
| `website/src/components/mediaviewer/GrillingSessionHost.svelte` | Modify — sessionType-Prop ergänzen | Task 6 |
| `website/src/data/test-inventory.json` | Generated — regenerieren nach Test-Änderungen | Task 7 |

---

### Task 1: SidekickHome.svelte — Items, Banner & Nudge-Verdrahtung entfernen

Entfernt die vier Menu-Items, den Lernpfad-Banner und die `decideBanner`-Verdrahtung; renummeriert die verbleibenden Items.

**Files:**
- Modify: `website/src/components/assistant/SidekickHome.svelte:1-52` (Script + Item-Liste), `:67-78` (Banner-Markup), `:332-353` (Banner-CSS)

**Interfaces:**
- Consumes: nichts aus anderen Tasks.
- Produces: bereinigter `View`-Union ohne `'tickets' | 'inbox' | 'pipeline' | 'loslernen'`; entfernte Props `pendingTickets`, `pendingInbox`, `summary` (wird von Task 2 in PortalSidekick gespiegelt).

- [ ] **Step 1: Import von `decideBanner`/`BannerDecision` entfernen**

In `website/src/components/assistant/SidekickHome.svelte` Zeile 1-2 — die Import-Zeile ersatzlos löschen:

```svelte
<script lang="ts">
  type View = 'home' | 'support' | 'questionnaire' | 'help' | 'agent-guide' | 'mediaviewer' | 'grilling' | 'cockpit';
```

(Die alte Zeile 2 `import { decideBanner, type BannerDecision } ...` und die `'tickets' | 'inbox' | 'pipeline'`-Member im `View`-Union entfallen. `'loslernen'` war nie im `View`-Union, nur in `Item.id` — siehe Step 3.)

- [ ] **Step 2: Props `pendingTickets`, `pendingInbox`, `summary` entfernen**

Den `$props()`-Block (alt Zeile 6-26) ersetzen durch:

```svelte
  let {
    onNavigate,
    onClose,
    pendingQuestionnaires = 0,
    helpSection = '',
    helpContext = 'portal',
    pendingContainerCount = 0,
  }: {
    onNavigate: (view: View) => void;
    onClose?: () => void;
    pendingQuestionnaires?: number;
    helpSection?: string;
    helpContext?: string;
    pendingContainerCount?: number;
  } = $props();
```

- [ ] **Step 3: `banner`-Derived entfernen, `progressSub` und `isAdmin` behalten**

Den Block alt Zeile 28-33 ersetzen durch (ohne `banner`, ohne `summary`-Abhängigkeit — `progressSub` wird zu konstantem `null`, da `summary` weg ist; der agent-guide-Sub-Text fällt auf den Default-Text zurück):

```svelte
  const isAdmin = $derived(helpContext === 'admin');

  type Item = { id: View; no: string; title: string; sub: string; badge?: number; show?: boolean; href?: string };
```

- [ ] **Step 4: Item-Liste bereinigen + renummerieren**

Den `items`-Derived (alt Zeile 37-49) ersetzen durch — ohne `tickets`/`inbox`/`pipeline`/`loslernen`, mit neuer Nummerierung und ohne `progressSub`-Referenz im agent-guide-Sub:

```svelte
  const items = $derived<Item[]>([
    { id: 'cockpit',      no: '01', title: 'Projekttickets', sub: 'Container & Features', badge: pendingContainerCount > 0 ? pendingContainerCount : undefined, show: isAdmin },
    { id: 'grilling',      no: '02', title: 'Final Grilling',     sub: 'Abschließende Klärungsrunde', show: isAdmin },
    { id: 'questionnaire', no: isAdmin ? '03' : '01', title: 'Fragebögen', sub: 'Aufgaben beantworten', badge: pendingQuestionnaires > 0 ? pendingQuestionnaires : undefined, show: true },
    { id: 'support',       no: isAdmin ? '04' : '02', title: 'Feedback & Support', sub: 'Fehler melden, Ideen teilen', show: true },
    { id: 'agent-guide',   no: isAdmin ? '05' : '03', title: 'Agent-Anleitung', sub: 'Lernen, wie alles funktioniert', show: true },
    { id: 'mediaviewer',   no: isAdmin ? '06' : '04', title: 'Mediaviewer', sub: 'Hilfe- & Onboarding-Videos', show: true },
    { id: 'help',          no: isAdmin ? '07' : '05', title: 'Hilfe',        sub: 'Kontexthilfe für diese Seite', show: !!helpSection },
  ].filter(i => i.show));
```

- [ ] **Step 5: Banner-Markup entfernen**

Den kompletten `{#if banner} ... {/if}`-Block (alt Zeile 67-78) ersatzlos löschen. Das `{#each items}`-Markup bleibt unverändert.

- [ ] **Step 6: Banner-CSS entfernen**

Die `.sk-banner*`-Regeln (alt Zeile 332-353, von `.sk-banner {` bis zur abschließenden `@media`-Zeile `@media (max-width: 480px) { .sk-banner { ... } }`) ersatzlos löschen.

- [ ] **Step 7: Verifizieren, dass kein `progressSub`/`summary`/`banner`/`pendingTickets`/`pendingInbox` mehr referenziert wird**

Run:
```bash
cd /tmp/wt-sidekick-cleanup && grep -nE 'progressSub|summary|banner|pendingTickets|pendingInbox|decideBanner|loslernen' website/src/components/assistant/SidekickHome.svelte
```
Expected: **keine Ausgabe** (Exit 1).

- [ ] **Step 8: Build-Typecheck der Datei**

Run:
```bash
cd /tmp/wt-sidekick-cleanup/website && npx svelte-check --threshold error --tsconfig ./tsconfig.json src/components/assistant/SidekickHome.svelte 2>&1 | tail -20
```
Expected: keine Errors für SidekickHome.svelte (Warnungen tolerierbar; falls `svelte-check` nicht selektiv filtert, ist ein voller Lauf in Task 8 der maßgebliche Gate — hier nur Smoke).

- [ ] **Step 9: Commit**

```bash
cd /tmp/wt-sidekick-cleanup
git add website/src/components/assistant/SidekickHome.svelte
git commit -m "refactor(sidekick): remove tickets/inbox/pipeline/loslernen items + learn banner [T000965]"
```

---

### Task 2: PortalSidekick.svelte — View-Routing, State & Fetches entfernen

Entfernt die View-Branches, titleMap-Einträge, Imports, State-Vars, API-Fetches, den `learning:updated`-Listener und die `fab-dot`-UI für die vier entfernten Items.

**Files:**
- Modify: `website/src/components/PortalSidekick.svelte` — Imports `:8-16`, View-Union `:18`, State `:35-55`, titleMap `:69-81`, Fetches `:94-164`, SidekickHome-Props `:261-271`, FAB `:209-214`, View-Routing `:280-285`, `.fab-dot`-CSS `:351-361`

**Interfaces:**
- Consumes: bereinigter `SidekickHome`-Prop-Satz aus Task 1 (kein `pendingTickets`/`pendingInbox`/`summary`).
- Consumes: bereinigte `shouldShowLearnDot`-Entfernung aus Task 3 (Import muss verschwinden). Beide Tasks berühren disjunkte Zeilen; Reihenfolge egal, aber Task 3-Export-Entfernung und Task-2-Import-Entfernung müssen gemeinsam grün sein (Task 8 ist der gemeinsame Gate).
- Produces: SidekickHome-Aufruf nur noch mit `onNavigate`, `onClose`, `pendingQuestionnaires`, `helpSection`, `helpContext`, `pendingContainerCount`.

- [ ] **Step 1: Imports entfernen**

In `website/src/components/PortalSidekick.svelte` die drei View-Imports (alt Zeile 8, 9, 11) löschen: `TicketSidekickView`, `InboxSidekickView`, `PipelineSidekickView`. Zeile 16 von `import { parseNavigateEvent, shouldShowLearnDot } ...` auf nur `parseNavigateEvent` reduzieren:

```svelte
  import { parseNavigateEvent } from '../lib/assistant/sidekick-nudge';
```

- [ ] **Step 2: View-Union bereinigen**

Zeile 18 ersetzen:

```svelte
  type View = 'home' | 'support' | 'questionnaire' | 'help' | 'agent-guide' | 'mediaviewer' | 'grilling' | 'cockpit';
```

- [ ] **Step 3: State-Vars & `showLearnDot` entfernen**

Die State-Deklarationen löschen: `pendingTickets` (alt :36), `inboxPending` (alt :39), `learningSummary` (alt :44), und den kompletten `showLearnDot`-`$derived`-Block (alt :46-55). Danach lautet der State-Block (alt :35-45):

```svelte
  let pendingQuestionnaires = $state(0);
  let pendingContainerCount = $state(0);
  const mediaviewerVideos = $derived(resolveHelpVideos(videovaultHost));
  let isMobile = $state(false);
  let currentTicketId = $state<string | null>(null);

  let pendingJump = $state<string | null>(null);
```

- [ ] **Step 4: titleMap-Einträge entfernen**

Die `titleMap`-Konstante (alt :69-81) ersetzen — ohne `tickets`, `inbox`, `pipeline`:

```svelte
  const titleMap: Record<View, string> = {
    home: 'Sidekick',
    support: 'Feedback & Support',
    questionnaire: 'Fragebögen',
    help: 'Hilfe',
    'agent-guide': 'Agent-Anleitung',
    mediaviewer: 'Mediaviewer',
    grilling: 'Final Grilling',
    cockpit: 'Projekt-Cockpit',
  };
```

- [ ] **Step 5: `learning/summary`-Fetch + Admin tickets/inbox-Fetches entfernen**

Im großen Auth-`$effect` (alt :94-150): den `learning/summary`-Block (alt :107-113) löschen, sowie im `if (helpContext === 'admin')`-Zweig die `pendingTickets`-Fetch (alt :124-130) und die `inboxPending`-Fetch (alt :132-138) löschen. Der Admin-Zweig behält nur den `container-count`-Fetch:

```svelte
        if (helpContext === 'admin') {
          try {
            const cRes = await fetch('/api/admin/cockpit/container-count', { credentials: 'same-origin' });
            if (cRes.ok) {
              const cd = await cRes.json() as { total?: number };
              pendingContainerCount = cd.total ?? 0;
            }
          } catch { /* badge stays 0 */ }
        }
```

- [ ] **Step 6: `learning:updated`-Listener-Effect entfernen**

Den kompletten zweiten `$effect` (alt :152-164, der `window.addEventListener('learning:updated', refresh)` registriert) ersatzlos löschen.

- [ ] **Step 7: FAB-Badge-Bedingung & `fab-dot` bereinigen**

Die FAB-Badge-Bedingung (alt :209-211) auf die verbleibenden Zähler reduzieren und den `{#if showLearnDot}`-Block (alt :212-214) löschen:

```svelte
  {#if (pendingQuestionnaires > 0 || pendingContainerCount > 0) && !open}
    <span class="fab-badge">{Math.min(99, pendingQuestionnaires + pendingContainerCount)}</span>
  {/if}
```

- [ ] **Step 8: SidekickHome-Aufruf-Props bereinigen**

Den `<SidekickHome ... />`-Aufruf (alt :261-271) ersetzen:

```svelte
      <SidekickHome
        onNavigate={navigate}
        onClose={closeDrawer}
        {pendingQuestionnaires}
        {helpSection}
        {helpContext}
        {pendingContainerCount}
      />
```

- [ ] **Step 9: View-Routing-Branches entfernen**

Die drei Branches `{:else if view === 'tickets'}`, `{:else if view === 'inbox'}`, `{:else if view === 'pipeline'}` (alt :280-285) ersatzlos löschen. Die `agent-guide`-, `mediaviewer`-, `grilling`-, `cockpit`-Branches bleiben.

- [ ] **Step 10: `.fab-dot`-CSS entfernen**

Die `.fab-dot { ... }`-Regel (alt :351-361) ersatzlos löschen.

- [ ] **Step 11: Verifizieren, dass keine toten Referenzen bleiben**

Run:
```bash
cd /tmp/wt-sidekick-cleanup && grep -nE 'pendingTickets|inboxPending|learningSummary|showLearnDot|shouldShowLearnDot|learning:updated|TicketSidekickView|InboxSidekickView|PipelineSidekickView|view === .(tickets|inbox|pipeline).' website/src/components/PortalSidekick.svelte
```
Expected: **keine Ausgabe** (Exit 1).

- [ ] **Step 12: Commit**

```bash
cd /tmp/wt-sidekick-cleanup
git add website/src/components/PortalSidekick.svelte
git commit -m "refactor(sidekick): drop tickets/inbox/pipeline routing, learn summary & fab-dot [T000965]"
```

---

### Task 3: sidekick-nudge.ts — Banner/LearnDot-Logik entfernen, Typen bereinigen

Entfernt `decideBanner`, `BannerDecision`, `BannerInput`, `shouldShowLearnDot` und die toten View-Member; passt die Unit-Tests an.

**Files:**
- Modify: `website/src/lib/assistant/sidekick-nudge.ts` (gesamtes Modul)
- Test: `website/src/lib/assistant/sidekick-nudge.test.ts:1-74`

**Interfaces:**
- Consumes: nichts.
- Produces: `SidekickView` ohne `'tickets' | 'inbox' | 'pipeline'`; `KNOWN_VIEWS` ohne dieselben; nur noch `parseNavigateEvent` + `NavigateIntent` exportiert.

- [ ] **Step 1: Tests zuerst anpassen (failing-first)**

`website/src/lib/assistant/sidekick-nudge.test.ts` ersetzen — `decideBanner`- und `shouldShowLearnDot`-Blöcke entfernen, Import reduzieren, `parseNavigateEvent`-Tests behalten:

```ts
// Unit tests for the pure Sidekick-nudge helpers (no DOM, no fetch).
import { describe, it, expect } from 'vitest';
import { parseNavigateEvent } from './sidekick-nudge';

describe('parseNavigateEvent', () => {
  it('returns null for non-object / missing detail', () => {
    expect(parseNavigateEvent(undefined)).toBeNull();
    expect(parseNavigateEvent(null)).toBeNull();
    expect(parseNavigateEvent('x')).toBeNull();
  });
  it('returns null for an unknown view', () => {
    expect(parseNavigateEvent({ view: 'nope', jumpTo: 'ag-goal-x' })).toBeNull();
  });
  it('returns null for a now-removed view (tickets/inbox/pipeline)', () => {
    expect(parseNavigateEvent({ view: 'tickets' })).toBeNull();
    expect(parseNavigateEvent({ view: 'inbox' })).toBeNull();
    expect(parseNavigateEvent({ view: 'pipeline' })).toBeNull();
  });
  it('accepts a known view and optional jumpTo', () => {
    expect(parseNavigateEvent({ view: 'agent-guide', jumpTo: 'ag-tool-superpowers' }))
      .toEqual({ view: 'agent-guide', jumpTo: 'ag-tool-superpowers' });
    expect(parseNavigateEvent({ view: 'home' }))
      .toEqual({ view: 'home', jumpTo: null });
  });
  it('coerces a non-string jumpTo to null', () => {
    expect(parseNavigateEvent({ view: 'agent-guide', jumpTo: 123 }))
      .toEqual({ view: 'agent-guide', jumpTo: null });
  });
  it('accepts grilling and mediaviewer views', () => {
    expect(parseNavigateEvent({ view: 'grilling' })).toEqual({ view: 'grilling', jumpTo: null });
    expect(parseNavigateEvent({ view: 'mediaviewer' })).toEqual({ view: 'mediaviewer', jumpTo: null });
  });
});
```

- [ ] **Step 2: Test ausführen → muss fehlschlagen (Imports/Exports noch vorhanden, aber tickets-Test schlägt fehl, solange KNOWN_VIEWS sie noch kennt)**

Run:
```bash
cd /tmp/wt-sidekick-cleanup/website && npx vitest run src/lib/assistant/sidekick-nudge.test.ts 2>&1 | tail -25
```
Expected: FAIL — die neuen `tickets/inbox/pipeline → null`-Assertions schlagen fehl, weil `KNOWN_VIEWS` diese Views noch enthält.

- [ ] **Step 3: Modul bereinigen**

`website/src/lib/assistant/sidekick-nudge.ts` ersetzen:

```ts
// Pure decision logic for the Sidekick navigation.
// No DOM, no fetch — kept here so it is unit-testable in the node vitest env.

export type SidekickView =
  | 'home' | 'support' | 'questionnaire' | 'help' | 'agent-guide' | 'cockpit' | 'mediaviewer' | 'grilling';

const KNOWN_VIEWS: ReadonlySet<string> = new Set([
  'home', 'support', 'questionnaire', 'help', 'agent-guide', 'cockpit', 'mediaviewer', 'grilling',
]);

export interface NavigateIntent { view: SidekickView; jumpTo: string | null; }

/** Validate the detail of a `sidekick:navigate` CustomEvent. Returns null if invalid. */
export function parseNavigateEvent(detail: unknown): NavigateIntent | null {
  if (!detail || typeof detail !== 'object') return null;
  const d = detail as { view?: unknown; jumpTo?: unknown };
  if (typeof d.view !== 'string' || !KNOWN_VIEWS.has(d.view)) return null;
  const jumpTo = typeof d.jumpTo === 'string' ? d.jumpTo : null;
  return { view: d.view as SidekickView, jumpTo };
}
```

- [ ] **Step 4: Test ausführen → muss grün sein**

Run:
```bash
cd /tmp/wt-sidekick-cleanup/website && npx vitest run src/lib/assistant/sidekick-nudge.test.ts 2>&1 | tail -15
```
Expected: PASS (alle `parseNavigateEvent`-Assertions, inkl. der drei `removed view → null`).

- [ ] **Step 5: Commit**

```bash
cd /tmp/wt-sidekick-cleanup
git add website/src/lib/assistant/sidekick-nudge.ts website/src/lib/assistant/sidekick-nudge.test.ts
git commit -m "refactor(sidekick): drop decideBanner/shouldShowLearnDot + tickets/inbox/pipeline views [T000965]"
```

---

### Task 4: mediaviewer-bridge.ts — Session-Typen ins Protokoll aufnehmen

Erweitert `HostInbound` um `mode: 'brainstorm'`, `HostOutbound` um `sessionStarted`/`sessionProgress`, und `parseOutbound` um die neuen Typen.

**Files:**
- Modify: `website/src/lib/mediaviewer-bridge.ts` (Typen + `buildSetModeMessage` + `parseOutbound`)
- Test: `website/src/lib/mediaviewer-bridge.test.ts`

**Interfaces:**
- Consumes: bestehendes `GrillingSessionData`-Type aus `./tickets/final-grilling`.
- Produces: `HostInbound['setMode'].mode: 'video' | 'grilling' | 'brainstorm'`; `HostOutbound` mit `{ type: 'sessionStarted'; sessionType: string; sessionId?: string }` und `{ type: 'sessionProgress'; sessionType: string; answeredCount: number; totalCount: number }`; `buildSetModeMessage(mode: 'video' | 'grilling' | 'brainstorm', ...)`. Task 5/6 konsumieren diese Signaturen.

- [ ] **Step 1: Failing-Tests für die neuen Parser-Fälle anhängen**

In `website/src/lib/mediaviewer-bridge.test.ts` innerhalb des `describe('parseOutbound', ...)`-Blocks (vor dem schließenden `});` des describe) neue `it`-Blöcke einfügen:

```ts
  it('accepts sessionStarted', () => {
    expect(parseOutbound({ type: 'sessionStarted', sessionType: 'brainstorm-v1', sessionId: 's1' }))
      .toEqual({ type: 'sessionStarted', sessionType: 'brainstorm-v1', sessionId: 's1' });
    expect(parseOutbound({ type: 'sessionStarted', sessionType: 'brainstorm-v1' }))
      .toEqual({ type: 'sessionStarted', sessionType: 'brainstorm-v1' });
  });
  it('accepts sessionProgress', () => {
    expect(parseOutbound({ type: 'sessionProgress', sessionType: 'brainstorm-v1', answeredCount: 2, totalCount: 9 }))
      .toEqual({ type: 'sessionProgress', sessionType: 'brainstorm-v1', answeredCount: 2, totalCount: 9 });
  });
  it('rejects sessionStarted without sessionType and sessionProgress with non-numeric counts', () => {
    expect(parseOutbound({ type: 'sessionStarted' })).toBeNull();
    expect(parseOutbound({ type: 'sessionProgress', sessionType: 'b', answeredCount: 'x', totalCount: 9 })).toBeNull();
  });
```

Außerdem den `buildSetModeMessage`-Test um den Brainstorm-Modus ergänzen (innerhalb `describe('buildSetModeMessage', ...)`):

```ts
  it('builds setMode for brainstorm mode with ticketId', () => {
    expect(buildSetModeMessage('brainstorm', 'T000001')).toEqual({ type: 'setMode', mode: 'brainstorm', ticketId: 'T000001' });
  });
```

- [ ] **Step 2: Test ausführen → muss fehlschlagen**

Run:
```bash
cd /tmp/wt-sidekick-cleanup/website && npx vitest run src/lib/mediaviewer-bridge.test.ts 2>&1 | tail -20
```
Expected: FAIL — `parseOutbound` gibt für `sessionStarted`/`sessionProgress` aktuell `null` zurück; TS-Compile-Fehler für `buildSetModeMessage('brainstorm', ...)`.

- [ ] **Step 3: Typen + Builder + Parser erweitern**

In `website/src/lib/mediaviewer-bridge.ts`:

`HostInbound`-`setMode`-Zeile (alt :10) ersetzen:

```ts
  | { type: 'setMode'; mode: 'video' | 'grilling' | 'brainstorm'; ticketId?: string }
```

`HostOutbound` (alt :13-20) um zwei Member am Ende erweitern:

```ts
export type HostOutbound =
  | { type: 'select'; id: string }
  | { type: 'progress'; sec: number }
  | { type: 'ended'; id: string }
  | { type: 'error'; id: string; message: string }
  | { type: 'grillingAnswer'; questionId: string; answer: string }
  | { type: 'grillingDismiss'; questionId: string }
  | { type: 'grillingComplete'; answers: Record<string, string> }
  | { type: 'sessionStarted'; sessionType: string; sessionId?: string }
  | { type: 'sessionProgress'; sessionType: string; answeredCount: number; totalCount: number };
```

`buildSetModeMessage`-Signatur (alt :26) ersetzen:

```ts
export function buildSetModeMessage(mode: 'video' | 'grilling' | 'brainstorm', ticketId?: string): HostInbound {
  return { type: 'setMode', mode, ...(ticketId ? { ticketId } : {}) };
}
```

In `parseOutbound` vor dem `default:`-Zweig (alt :63) die zwei neuen `case`-Blöcke einfügen:

```ts
    case 'sessionStarted':
      return typeof data.sessionType === 'string'
        ? { type: 'sessionStarted', sessionType: data.sessionType, ...(typeof data.sessionId === 'string' ? { sessionId: data.sessionId } : {}) }
        : null;
    case 'sessionProgress':
      return typeof data.sessionType === 'string' && typeof data.answeredCount === 'number' && typeof data.totalCount === 'number'
        ? { type: 'sessionProgress', sessionType: data.sessionType, answeredCount: data.answeredCount, totalCount: data.totalCount }
        : null;
```

- [ ] **Step 4: Test ausführen → muss grün sein**

Run:
```bash
cd /tmp/wt-sidekick-cleanup/website && npx vitest run src/lib/mediaviewer-bridge.test.ts 2>&1 | tail -15
```
Expected: PASS (alle bestehenden + neuen Assertions).

- [ ] **Step 5: Commit**

```bash
cd /tmp/wt-sidekick-cleanup
git add website/src/lib/mediaviewer-bridge.ts website/src/lib/mediaviewer-bridge.test.ts
git commit -m "feat(mediaviewer): add brainstorm mode + sessionStarted/sessionProgress to bridge [T000965]"
```

---

### Task 5: grilling.ts — `brainstorm-v1`-Fragebogen hinzufügen

Fügt einen neuen Questionnaire `brainstorm-v1` in `QUESTIONNAIRES` ein (8–10 Fragen über vier Abschnitte: Problemstellung, Lösungsansätze, Risiken, nächste Schritte). Keine Brand-Domain-Literale.

**Files:**
- Modify: `website/src/lib/tickets/grilling.ts:26-157` (`QUESTIONNAIRES`-Objekt)
- Test: `website/src/lib/tickets/grilling.test.ts`

**Interfaces:**
- Consumes: bestehende `GrillingQuestionnaire`/`GrillingSection`/`GrillingQuestion`-Interfaces (unverändert).
- Produces: `QUESTIONNAIRES['brainstorm-v1']` mit `id: 'brainstorm-v1'`, 4 Sektionen, insgesamt 9 Fragen `q1..q9`. `getQuestionnaire('brainstorm-v1')` liefert es. Task 6 verwendet `'brainstorm-v1'` als `questionnaireId`-Override.

- [ ] **Step 1: Failing-Test anhängen**

In `website/src/lib/tickets/grilling.test.ts` am Dateiende einen neuen `describe`-Block einfügen (Import `QUESTIONNAIRES, getQuestionnaire` oben ergänzen falls nötig — bestehender Import-Stil der Datei spiegeln):

```ts
import { QUESTIONNAIRES, getQuestionnaire, resolveQuestions } from './grilling';

describe('brainstorm-v1 questionnaire', () => {
  it('is registered with id brainstorm-v1', () => {
    const qn = getQuestionnaire('brainstorm-v1');
    expect(qn).toBeDefined();
    expect(qn?.id).toBe('brainstorm-v1');
  });
  it('has 4 sections covering problem/solutions/risks/next-steps', () => {
    const qn = QUESTIONNAIRES['brainstorm-v1'];
    expect(qn.sections).toHaveLength(4);
  });
  it('resolves to 8-10 questions with unique ids', () => {
    const qs = resolveQuestions('brainstorm-v1', QUESTIONNAIRES, null);
    expect(qs.length).toBeGreaterThanOrEqual(8);
    expect(qs.length).toBeLessThanOrEqual(10);
    const ids = qs.map(q => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

- [ ] **Step 2: Test ausführen → muss fehlschlagen**

Run:
```bash
cd /tmp/wt-sidekick-cleanup/website && npx vitest run src/lib/tickets/grilling.test.ts 2>&1 | tail -20
```
Expected: FAIL — `getQuestionnaire('brainstorm-v1')` ist `undefined`.

- [ ] **Step 3: `brainstorm-v1` ins `QUESTIONNAIRES`-Objekt einfügen**

In `website/src/lib/tickets/grilling.ts` innerhalb des `QUESTIONNAIRES`-Objekts (nach dem `'coaching-sessions-v1'`-Eintrag, vor dem schließenden `};` auf alt Zeile 157) folgenden Eintrag ergänzen. **Keine** Brand-Domains in Texten/Choices:

```ts
  'brainstorm-v1': {
    id: 'brainstorm-v1',
    title: 'Brainstorm-Session — Feature-Vorklärung',
    sections: [
      {
        id: 's1',
        title: '1. Problemstellung',
        questions: [
          { id: 'q1', label: 'Welches konkrete Problem oder Bedürfnis adressiert diese Idee?' },
          { id: 'q2', label: 'Wer ist betroffen und wie äußert sich das Problem heute?' },
        ],
      },
      {
        id: 's2',
        title: '2. Lösungsansätze',
        questions: [
          { id: 'q3', label: 'Welche möglichen Lösungswege siehst du?' },
          { id: 'q4', label: 'Welcher Ansatz ist der vielversprechendste und warum?', choices: ['Kleinster Eingriff (MVP)', 'Vollständige Lösung', 'Schrittweiser Rollout', 'Noch unklar'] },
          { id: 'q5', label: 'Welche bestehenden Patterns oder Komponenten lassen sich wiederverwenden?' },
        ],
      },
      {
        id: 's3',
        title: '3. Risiken & Unbekannte',
        questions: [
          { id: 'q6', label: 'Was sind die größten Risiken oder offenen Fragen?' },
          { id: 'q7', label: 'Welche Annahmen müssen vor der Umsetzung validiert werden?' },
        ],
      },
      {
        id: 's4',
        title: '4. Nächste Schritte',
        questions: [
          { id: 'q8', label: 'Was ist der kleinste sinnvolle erste Schritt?' },
          { id: 'q9', label: 'Was muss als Nächstes entschieden oder recherchiert werden?' },
        ],
      },
    ],
  },
```

- [ ] **Step 4: Test ausführen → muss grün sein**

Run:
```bash
cd /tmp/wt-sidekick-cleanup/website && npx vitest run src/lib/tickets/grilling.test.ts 2>&1 | tail -15
```
Expected: PASS.

- [ ] **Step 5: S3-Selbstprüfung — keine Brand-Domains im neuen Block**

Run:
```bash
cd /tmp/wt-sidekick-cleanup && grep -nE 'mentolder\.de|korczewski\.de' website/src/lib/tickets/grilling.ts
```
Expected: **keine Ausgabe** (Exit 1).

- [ ] **Step 6: Commit**

```bash
cd /tmp/wt-sidekick-cleanup
git add website/src/lib/tickets/grilling.ts website/src/lib/tickets/grilling.test.ts
git commit -m "feat(grilling): add brainstorm-v1 questionnaire (problem/solutions/risks/next) [T000965]"
```

---

### Task 6: Host-Broadcast + GrillingSessionHost-`sessionType`-Override

Verdrahtet dual-channel Session-Broadcasting in `MediaviewerPanel.svelte` (`BroadcastChannel('session-events')` + `window`-`CustomEvent('session:event')`, Channel sofort nach Send geschlossen) und gibt `GrillingSessionHost.svelte` ein optionales `sessionType`-Prop, das `buildGrillingSessionData` als `questionnaireId`-Override durchreicht.

**Files:**
- Modify: `website/src/components/MediaviewerPanel.svelte` (`dispatch`-Funktion + Broadcast-Helper)
- Modify: `website/src/components/mediaviewer/GrillingSessionHost.svelte` (`sessionType`-Prop + `buildGrillingSessionData`-Aufruf)
- Test: `website/src/components/MediaviewerPanel.test.ts`

**Interfaces:**
- Consumes: `HostOutbound` aus Task 4 (für `dispatch`-Switch — die neuen Member ändern den bestehenden Switch nicht, da broadcast unabhängig von onGrilling*-Callbacks erfolgt).
- Consumes: `buildGrillingSessionData(ticket, questionnaireId?)` aus `final-grilling.ts` (zweites Arg ist optional, default `'final-grilling-v1'`).
- Produces: `MediaviewerPanel` broadcastet bei `grillingAnswer`/`grillingComplete`/`grillingDismiss` ein `{ type, sessionType, ... }`-Payload über beide Kanäle. `GrillingSessionHost` akzeptiert `sessionType?: string`.

- [ ] **Step 1: Failing-Test für den CustomEvent-Broadcast anhängen**

In `website/src/components/MediaviewerPanel.test.ts` innerhalb `describe('MediaviewerPanel', ...)` (vor dessen schließendem `});`) einen neuen `it`-Block einfügen. Test prüft den same-page `CustomEvent`-Pfad (in jsdom verfügbar; `BroadcastChannel` ist in jsdom nicht garantiert vorhanden — der Host-Code muss dessen Abwesenheit fail-soft tolerieren, siehe Step 3):

```ts
  it('broadcasts a session:event CustomEvent when the widget posts grillingAnswer', () => {
    const onGrillingAnswer = vi.fn();
    const onSession = vi.fn();
    window.addEventListener('session:event', onSession);
    render(MediaviewerPanel, {
      mediaviewerHost: 'mediaviewer.localhost',
      videos,
      mode: 'grilling',
      grillingData: mockGrillingData,
      onGrillingAnswer,
    });
    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'grillingAnswer', questionId: 'q1', answer: 'Yes' },
      origin: 'https://mediaviewer.localhost',
    }));
    expect(onGrillingAnswer).toHaveBeenCalledWith('q1', 'Yes');
    expect(onSession).toHaveBeenCalledTimes(1);
    const detail = (onSession.mock.calls[0][0] as CustomEvent).detail;
    expect(detail).toMatchObject({ type: 'grillingAnswer', sessionType: 'final-grilling-v1', questionId: 'q1', answer: 'Yes' });
    window.removeEventListener('session:event', onSession);
  });
```

- [ ] **Step 2: Test ausführen → muss fehlschlagen**

Run:
```bash
cd /tmp/wt-sidekick-cleanup/website && npx vitest run src/components/MediaviewerPanel.test.ts 2>&1 | tail -20
```
Expected: FAIL — `session:event` wird noch nicht dispatched (`onSession` nie aufgerufen).

- [ ] **Step 3: Broadcast-Helper in MediaviewerPanel.svelte einbauen**

In `website/src/components/MediaviewerPanel.svelte`: Die `currentSessionType` aus `grillingData?.questionnaireId` ableiten und einen fail-soften Broadcast-Helper definieren. Den `dispatch`-`switch` (alt :57-67) so erweitern, dass vor den `onGrilling*`-Callbacks gebroadcastet wird.

Im `<script>` nach den `$derived`-Deklarationen (nach alt :35) einfügen:

```svelte
  const currentSessionType = $derived(grillingData?.questionnaireId ?? 'grilling');

  function broadcastSession(payload: Record<string, unknown>) {
    // Layer 1 — BroadcastChannel (cross-tab). Fail-soft: not all runtimes/jsdom have it.
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const ch = new BroadcastChannel('session-events');
        ch.postMessage(payload);
        ch.close();
      }
    } catch { /* fail-soft: cross-tab broadcast is best-effort */ }
    // Layer 2 — same-page CustomEvent for Svelte components on this page.
    try {
      window.dispatchEvent(new CustomEvent('session:event', { detail: payload }));
    } catch { /* fail-soft */ }
  }
```

Den `dispatch`-`switch` (alt :57-67) ersetzen — Broadcast für die drei Grilling-Events ergänzen:

```svelte
  function dispatch(msg: HostOutbound) {
    switch (msg.type) {
      case 'select': onSelect?.(msg.id); return;
      case 'progress': onProgress?.(msg.sec); return;
      case 'ended': onEnded?.(msg.id); return;
      case 'error': onError?.(msg.id, msg.message); return;
      case 'grillingAnswer':
        broadcastSession({ type: 'grillingAnswer', sessionType: currentSessionType, questionId: msg.questionId, answer: msg.answer });
        onGrillingAnswer?.(msg.questionId, msg.answer);
        return;
      case 'grillingDismiss':
        broadcastSession({ type: 'grillingDismiss', sessionType: currentSessionType, questionId: msg.questionId });
        onGrillingDismiss?.(msg.questionId);
        return;
      case 'grillingComplete':
        broadcastSession({ type: 'grillingComplete', sessionType: currentSessionType, answers: msg.answers });
        onGrillingComplete?.(msg.answers);
        return;
    }
  }
```

(Die neuen `HostOutbound`-Member `sessionStarted`/`sessionProgress` aus Task 4 werden hier nicht behandelt — der `switch` ist nicht erschöpfend pflichtig, da der Default des `dispatch` ohnehin nichts tut; TS meckert nicht, weil kein `never`-Exhaustiveness-Check vorhanden ist.)

- [ ] **Step 4: Test ausführen → muss grün sein**

Run:
```bash
cd /tmp/wt-sidekick-cleanup/website && npx vitest run src/components/MediaviewerPanel.test.ts 2>&1 | tail -15
```
Expected: PASS.

- [ ] **Step 5: `sessionType`-Prop in GrillingSessionHost.svelte ergänzen**

In `website/src/components/mediaviewer/GrillingSessionHost.svelte` den `$props()`-Block (alt :5-11) erweitern:

```svelte
  let {
    mediaviewerHost,
    ticketId,
    sessionType = 'final-grilling-v1',
  }: {
    mediaviewerHost: string;
    ticketId: string;
    sessionType?: string;
  } = $props();
```

Den `buildGrillingSessionData`-Aufruf (alt :31) auf den Override umstellen:

```svelte
        grillingData = buildGrillingSessionData(ticket, sessionType);
```

- [ ] **Step 6: Typecheck der berührten Svelte-Dateien (Smoke)**

Run:
```bash
cd /tmp/wt-sidekick-cleanup/website && npx svelte-check --threshold error --tsconfig ./tsconfig.json src/components/MediaviewerPanel.svelte src/components/mediaviewer/GrillingSessionHost.svelte 2>&1 | tail -20
```
Expected: keine Errors für diese Dateien.

- [ ] **Step 7: Commit**

```bash
cd /tmp/wt-sidekick-cleanup
git add website/src/components/MediaviewerPanel.svelte website/src/components/mediaviewer/GrillingSessionHost.svelte website/src/components/MediaviewerPanel.test.ts
git commit -m "feat(mediaviewer): dual-channel session broadcast + GrillingSessionHost sessionType override [T000965]"
```

---

### Task 7: Test-Inventar regenerieren + committen

Die Test-Änderungen in Tasks 3–6 (neue `it`-Blöcke, entfernte `describe`-Blöcke) müssen ins generierte Inventar.

**Files:**
- Modify (generiert): `website/src/data/test-inventory.json`

**Interfaces:** keine.

- [ ] **Step 1: Inventar regenerieren**

Run:
```bash
cd /tmp/wt-sidekick-cleanup && task test:inventory
```
Expected: `website/src/data/test-inventory.json` wird aktualisiert (oder bleibt unverändert, falls der Generator Test-Counts nicht trackt — beides ok).

- [ ] **Step 2: Diff prüfen + committen (nur falls geändert)**

Run:
```bash
cd /tmp/wt-sidekick-cleanup && git status --short website/src/data/test-inventory.json
```
Falls geändert:
```bash
cd /tmp/wt-sidekick-cleanup
git add website/src/data/test-inventory.json
git commit -m "chore(tests): regenerate test-inventory after sidekick/grilling test changes [T000965]"
```
Expected: sauberes `git status` für die Inventar-Datei nach Commit. Falls unverändert: kein Commit nötig.

---

### Task 8: Finale Verifikation (CI-Gate-Äquivalent)

Vollständige lokale Reproduktion der CI-Gates. **Dieser Task ist Pflicht und muss komplett grün sein, bevor ein PR erstellt wird.**

**Files:** keine (nur Verifikation).

**Interfaces:** keine.

- [ ] **Step 1: OpenSpec-Validierung**

Run:
```bash
cd /tmp/wt-sidekick-cleanup && bash scripts/openspec.sh validate 2>&1 | tail -20
```
Expected: grün (keine Validation-Errors für `sidekick-cleanup-grilling-broadcast`).

- [ ] **Step 2: Gezielte Tests für geänderte Domains**

Run:
```bash
cd /tmp/wt-sidekick-cleanup && task test:changed 2>&1 | tail -40
```
Expected: PASS — vitest (`--changed`) deckt `sidekick-nudge`, `mediaviewer-bridge`, `MediaviewerPanel`, `grilling` ab; quality:check (S1–S4) grün.

- [ ] **Step 3: Generierte Artefakte aktualisieren**

Run:
```bash
cd /tmp/wt-sidekick-cleanup && task freshness:regenerate 2>&1 | tail -20
```
Expected: aktualisiert `test-inventory`, `repo-index` etc. Anschließend etwaige Änderungen committen:
```bash
cd /tmp/wt-sidekick-cleanup && git add -A && git diff --cached --quiet || git commit -m "chore: refresh generated artifacts [T000965]"
```

- [ ] **Step 4: Freshness + Quality-Ratchet (CI-Äquivalent)**

Run:
```bash
cd /tmp/wt-sidekick-cleanup && task freshness:check 2>&1 | tail -40
```
Expected: PASS — Freshness + `quality:check` (S1–S4-Ratchet) + Baseline-Key-Count-Assertion grün. Insbesondere: keine Baseline-Wachstums-Violation (alle berührten Dateien schrumpfen oder bleiben unter Limit).

- [ ] **Step 5: Voller Svelte/TS-Typecheck (kein Restschaden durch entfernte Symbole)**

Run:
```bash
cd /tmp/wt-sidekick-cleanup/website && npx svelte-check --threshold error --tsconfig ./tsconfig.json 2>&1 | tail -30
```
Expected: 0 Errors. Insbesondere keine „Cannot find name `decideBanner`/`shouldShowLearnDot`/`learningSummary`"-Fehler an anderer Stelle und keine ungültigen `view === 'tickets'`-Vergleiche.

- [ ] **Step 6: Repo-weite Tot-Referenz-Prüfung der entfernten Symbole**

Run:
```bash
cd /tmp/wt-sidekick-cleanup && grep -rnE 'decideBanner|shouldShowLearnDot|BannerDecision|BannerInput' website/src/ || echo "OK: keine Rest-Referenzen"
```
Expected: `OK: keine Rest-Referenzen` (die einzigen verbliebenen Treffer dürften — falls überhaupt — in nicht zum Scope gehörenden Playwright-Specs liegen; falls ein E2E-Spec wie `fa-46-lernpfad-cta.spec.ts` auf den Banner zielt, im Plan-Execute-Schritt als Folgeentscheidung bewerten: Spec anpassen/skip — NICHT stillschweigend Code wieder hinzufügen).

- [ ] **Step 7: Abschluss-Commit (falls Step 6 eine E2E-Spec-Anpassung erforderte)**

```bash
cd /tmp/wt-sidekick-cleanup
git add -A && git diff --cached --quiet || git commit -m "test(e2e): align lernpfad-cta spec with sidekick cleanup [T000965]"
```
Expected: sauberes `git status`.

---

## Self-Review

**Spec-Coverage:**
- Teil 1 Menu-Items entfernen → Task 1 (Items/Banner/CSS), Task 2 (Routing/State/Fetches), Task 3 (Nudge-Logik/Typen). ✓
- Renummerierung → Task 1 Step 4. ✓
- `decideBanner`/`BannerDecision`/`BannerInput`/`shouldShowLearnDot` entfernen → Task 3. ✓
- `SidekickView`/`KNOWN_VIEWS` bereinigen → Task 3 Step 3. ✓
- PortalSidekick State/Fetches/Listener/fab-dot → Task 2. ✓
- Tests in `sidekick-nudge.test.ts` → Task 3 Step 1. ✓
- Teil 2 `brainstorm-v1` → Task 5. ✓
- `mediaviewer-bridge.ts` HostInbound/HostOutbound/parseOutbound → Task 4. ✓
- MediaviewerPanel dual-broadcast + channel.close() → Task 6 Step 3. ✓
- GrillingSessionHost `sessionType`-Prop → Task 6 Step 5. ✓
- `mediaviewer-bridge.test.ts` + `MediaviewerPanel.test.ts` → Task 4 Step 1, Task 6 Step 1. ✓
- Verifikations-Task mit `task test:changed`/`freshness:regenerate`/`freshness:check` → Task 8. ✓
- `test:inventory` + Commit → Task 7. ✓
- `openspec.sh validate` grün → Task 8 Step 1. ✓

**Nicht in Scope (bewusst ausgelassen, lt. Spec):** Entfernung der Ticket-/Inbox-/Pipeline-Svelte-Komponenten selbst, Admin-Seite, Widget-iframe-Code, Backend-APIs. ✓

**Typ-Konsistenz:** `currentSessionType` (Task 6) ↔ `sessionType`-Feld in Broadcast-Payloads; `buildSetModeMessage('brainstorm', …)` (Task 4) ↔ `mode: 'brainstorm'` in `HostInbound` (Task 4); `buildGrillingSessionData(ticket, sessionType)` (Task 6) ↔ optionales zweites Arg in `final-grilling.ts`. Konsistent. ✓

**Placeholder-Scan:** Alle Code-Steps zeigen vollständigen, ausführbaren Code — keine offenen Lücken. ✓
