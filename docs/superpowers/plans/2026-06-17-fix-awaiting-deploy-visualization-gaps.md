---
ticket_id: T000943
plan_ref: docs/superpowers/plans/2026-06-17-fix-awaiting-deploy-visualization-gaps.md
branch: fix/awaiting-deploy-controls
date: 2026-06-17
status: active
summary: awaiting_deploy Status-Typ-Lücken und Cockpit-Visualisierungs-Gaps beheben
areas:
  - website
  - pipeline
effort: mittel
domains: [website]
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Fix: awaiting_deploy Status-Lücken & Control-Point-Gaps beheben

## Problem

10 Lücken in der Pipeline-Visualisierung verhindern, dass Tickets im Status `awaiting_deploy` (merge ≠ prod) korrekt durch das Cockpit laufen, ohne verloren zu gehen.

### Kategorie A: Typ-Inkonsistenzen (Bugs)

| # | Gap | Datei | Zeile |
|---|-----|-------|-------|
| A1 | `awaiting_deploy` fehlt in `transition.ts` API-Gate | `transition.ts` | 7-8, 13-14 |
| A2 | `awaiting_deploy` fehlt in `cockpit-labels.ts` STATUS_LABELS | `cockpit-labels.ts` | 5-16 |
| A3 | `awaiting_deploy` und `qa_review` fehlen in `admin.ts` TicketStatus | `admin.ts` | 17-18 |

### Kategorie B: Visibility (fehlende Filter/Labels)

| # | Gap | Datei |
|---|-----|-------|
| B1 | Kein `awaiting_deploy` Filter-Chip in CockpitTable | `CockpitTable.svelte` |
| B2 | `activeOnly` Filter zählt `awaitingDeploy` nicht als offene Arbeit | `CockpitSidebar.svelte:55` |
| B3 | `AwaitingDeployLane` display-only, keine Controls | `AwaitingDeployLane.svelte` |
| B4 | Sidebar-Rollup zeigt nur Total, nicht Status-Breakdown | `CockpitSidebar.svelte:160` |

### Kategorie C: Workflow/Automation

| # | Gap | Datei |
|---|-----|-------|
| C1 | Watchdog swept nur `in_progress`, nicht `awaiting_deploy` | `watchdog.sh:17` |
| C2 | Feature-Health ignoriert Deploy-Backlog | `cockpit-db.ts:32-36` |
| C3 | Kein automatisierter `awaiting_deploy` → `done` Übergang | `deploy-transition.cjs` |

---

## Failing Tests (TDD Gate)

### Test A1: `awaiting_deploy` als valider Status in transition.ts
**Datei:** `website/src/lib/tickets/transition.status.test.ts:14`
**Änderung:** `expect(isValidStatus('awaiting_deploy')).toBe(false)` → `.toBe(true)`
**Erwartung:** Rot vor Fix, Grün nach Fix.

### Test A2: STATUS_LABELS enthält `awaiting_deploy`
**Datei:** `website/src/lib/tickets/cockpit-labels.test.ts` (neu)
**Code:**
```ts
import { STATUS_LABELS } from './cockpit-labels';
it('awaiting_deploy has a display label', () => {
  expect(STATUS_LABELS.awaiting_deploy).toBe('Wartet auf Deploy');
});
```

### Test A3: WORKFLOW_STATUSES enthält `awaiting_deploy`
**Datei:** `website/src/lib/tickets/cockpit-labels.test.ts` (neu)
```ts
import { WORKFLOW_STATUSES } from './cockpit-labels';
it('awaiting_deploy is a workflow status in the table dropdown', () => {
  expect(WORKFLOW_STATUSES).toContain('awaiting_deploy');
});
```

### Test B2: activeOnly filter counts awaitingDeploy as open work
**Datei:** `website/src/lib/tickets/active-filter.test.ts` (neu)
```ts
it('includes awaitingDeploy in open work calculation', () => {
  const rollup = { open: 0, inProgress: 0, blocked: 0, awaitingDeploy: 3, total: 10, done: 7, pctDone: 70 };
  const openWork = (rollup.open ?? 0) + (rollup.inProgress ?? 0) + (rollup.blocked ?? 0) + (rollup.awaitingDeploy ?? 0);
  expect(openWork).toBe(3);
});
```

---

## Implementierung

### Task 1: Typ-Konsistenz herstellen (A1–A3)

**A1 — `transition.ts`: `awaiting_deploy` hinzufügen**
Datei: `website/src/lib/tickets/transition.ts`
- `TicketStatus` Type um `'awaiting_deploy'` erweitern (Zeile 8)
- `VALID_STATUSES` Set um `'awaiting_deploy'` erweitern (Zeile 14)
- Test aktualisieren: `transition.status.test.ts:14` von `.toBe(false)` auf `.toBe(true)`

**A2 — `cockpit-labels.ts`: `awaiting_deploy` Label hinzufügen**
Datei: `website/src/lib/tickets/cockpit-labels.ts`
- `STATUS_LABELS` um `awaiting_deploy: 'Wartet auf Deploy'` erweitern
- Neuer Test in `cockpit-labels.test.ts`

**A3 — `admin.ts`: `qa_review` und `awaiting_deploy` hinzufügen**
Datei: `website/src/lib/tickets/admin.ts`
- `TicketStatus` Type um `'qa_review' | 'awaiting_deploy'` erweitern (Zeile 17-18)

**Ziel:** Alle drei Module haben die 11 Statuses aus dem DB Constraint und `pipeline-order.ts`.

---

### Task 2: Cockpit-Table Visibility (B1)

**B1 — `awaiting_deploy` Filter-Chip in CockpitTable**
Datei: `website/src/components/admin/CockpitTable.svelte`
- `CHIPS` Array um `{ label: 'Wartet auf Deploy', value: 'awaiting_deploy' }` erweitern
- Status-Filter-Logik verwendet bereits `t.status === statusFilter`, funktioniert also ohne Änderung

**B1b — `awaiting_deploy` in WORKFLOW_STATUSES**
Datei: `website/src/lib/tickets/cockpit-labels.ts`
- `WORKFLOW_STATUSES` um `'awaiting_deploy'` erweitern (Zeile 35-36)
- Dadurch wird `awaiting_deploy` im Status-Dropdown der Tabellenzeilen angeboten

---

### Task 3: activeOnly Filter reparieren (B2)

**B2 — `awaitingDeploy` in openWork einbeziehen**
Datei: `website/src/components/admin/CockpitSidebar.svelte:55`
- Ändern: `openWork = (f.rollup.open ?? 0) + (f.rollup.inProgress ?? 0) + (f.rollup.blocked ?? 0)`
- Zu: `openWork = (f.rollup.open ?? 0) + (f.rollup.inProgress ?? 0) + (f.rollup.blocked ?? 0) + (f.rollup.awaitingDeploy ?? 0)`
- Sonst verschwinden Features mit nur `awaiting_deploy`-Tickets aus der Sidebar bei aktiviertem `activeOnly`-Filter.

---

### Task 4: AwaitingDeployLane Controls (B3)

**B3 — Aktions-Buttons in der Deploy-Lane**
Datei: `website/src/components/factory/AwaitingDeployLane.svelte`
- Ähnlich wie `StagedColumn.svelte` (Kommissionierung) — mindestens einen "Deploy ausführen"-Button hinzufügen
- Button ruft `POST /api/factory-floor/:extId/deploy` auf (oder einen vorhandenen Mechanismus)
- Optional: PR-Link anzeigen falls `prNumber` gesetzt ist
- Jede Card bekommt einen Action-Button: "→ Deploy" (gelb/amber) analog zu "→ Factory" in StagedColumn

**API:** Falls kein bestehender Endpoint existiert, muss ein neuer API-Route erstellt werden:
`POST /api/admin/tickets/:id/deploy` → führt `task feature:deploy` für das Ticket aus

---

### Task 5: Sidebar Rollup-Detail (B4)

**B4 — Status-Breakdown in der Sidebar anzeigen**
Datei: `website/src/components/admin/CockpitSidebar.svelte:160`
- Aktuell: `<span class="feature-count">{f.rollup.total} Tickets</span>`
- Änderung: Zeige einen Mini-Progress-Bar oder Farb-Indikatoren für die Status-Buckets
- Minimal: `{f.rollup.total} Tickets` → `{f.rollup.done}/{f.rollup.total}` mit Farbe
- Besser: Tooltip oder Hover mit Breakdown: done/blocked/inProgress/awaitingDeploy/open
- `awaitingDeploy > 0` → amber Warn-Farbe (da diese Items "stecken" können)

---

### Task 6: Watchdog für awaiting_deploy (C1)

**C1 — Staleness-Watchdog für Deploy-Lane**
Datei: `scripts/factory/watchdog.sh`
- Zusätzlich zu `WHERE status='in_progress'` auch `WHERE status='awaiting_deploy'` prüfen
- Timeout: 24h (statt 30min für in_progress) — ein Merge wartet länger auf Deploy
- Aktion bei Timeout: Kommentar ins Ticket + Notification, aber KEIN Status-Reset (nicht nach triage zurück)
- Stattdessen: `attention_mode` auf `'needs_human'` setzen

---

### Task 7: Feature-Health Deploy-Backlog (C2)

**C2 — Health-Indikator berücksichtigt awaiting_deploy**
Datei: `website/src/lib/tickets/cockpit-db.ts:32-36`
- Aktuell: `rollupHealth()` prüft nur `blocked > 0 → red`
- Erweiterung: `awaitingDeploy > 0 && pctDone < 100 → amber` (bereits der Fall via pctDone)
- Keine Code-Änderung nötig — `awaitingDeploy` zählt bereits als nicht-done für `pctDone`
- ABER: `pctDone === 100 && awaitingDeploy > 0` kann nicht vorkommen (da `done` und `awaiting_deploy` disjunkt sind)
- Optional: `awaitingDeploy > 0` explizit als "amber with deploy-backlog" signalisieren → `return 'amber'` ist bereits korrekt

→ **Keine Änderung nötig**, pctDone deckt dies bereits ab. Nur dokumentieren.

---

### Task 8: Automatisierter awaiting_deploy → done (C3)

**C3 — CI/CD-getriggerter Status-Übergang**
- Derzeit setzt `deploy-transition.cjs` nach Merge auf `awaiting_deploy`
- Der `feature:deploy` / `feature-promote.sh` Task muss nach erfolgreichem Deploy `awaiting_deploy` → `done` transitionieren
- Prüfen ob `feature-promote.sh` dies bereits tut → wenn nicht: `ticket.sh update-status` nach erfolgreichem Deploy hinzufügen
- Alternativ: `qa-ingest.ts` (E2E-Rückkanal) erweitern, um `awaiting_deploy`-Tickets mit grünen E2E-Tests auf `done` zu setzen (analog zu qa_review → done)

**Dateien:**
- `scripts/factory/feature-promote.sh` — `ticket.sh update-status --status done` nach erfolgreichem Deploy
- `website/src/lib/qa-ingest.ts` — `awaiting_deploy` als zusätzlichen Quell-Status behandeln

---

## Verifikation

```bash
# Im Worktree ausführen:
cd /tmp/wt-awaiting-deploy-controls

# Unit-Tests (neue + bestehende)
npm --prefix website run test:unit

# Typecheck
npm --prefix website run typecheck 2>/dev/null || npx --prefix website tsc --noEmit

# Freshness
task freshness:regenerate && task freshness:check
```

## Target Files (für S1-Budget)

| Datei | Änderung | Zeilen Δ |
|-------|----------|----------|
| `website/src/lib/tickets/transition.ts` | Type + Set um ein Element erweitern | +2 |
| `website/src/lib/tickets/cockpit-labels.ts` | Label + WORKFLOW_STATUSES erweitern | +3 |
| `website/src/lib/tickets/admin.ts` | Type um 2 Statuses erweitern | +1 |
| `website/src/components/admin/CockpitTable.svelte` | Filter-Chip hinzufügen | +1 |
| `website/src/components/admin/CockpitSidebar.svelte` | openWork + Rollup-Detail | +5 |
| `website/src/components/factory/AwaitingDeployLane.svelte` | Controls hinzufügen | +15 |
| `scripts/factory/watchdog.sh` | awaiting_deploy Staleness | +5 |
| `website/src/lib/tickets/transition.status.test.ts` | awaiting_deploy → true | +1 |
| `website/src/lib/tickets/cockpit-labels.test.ts` (neu) | Label-Tests | +15 |
| `website/src/lib/tickets/active-filter.test.ts` (neu) | Filter-Test | +10 |

**Gesamt: ca. +58 Zeilen über 10 Dateien, <100 Zeilen Netto-Δ.**
