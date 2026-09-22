---
title: "app-board-dnd — Drag & Drop für Applications Board implementieren"
ticket_id: T900304
domains: [brett, website]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# app-board-dnd — Implementation Plan

_Ticket: T900304_

## File Structure

```
components/brett/src/client/ui/applications-board.ts  ← MODIFIED: D&D-Events + Drag-Handler
```

_Bemerkung: Keine neuen Dateien nötig — Drag & Drop wird als Ergänzung in die
existierende `applications-board.ts` implementiert. Die Status-API_ (`PUT /api/applications/:id/status`)_
_existiert bereits (Brett `routes/applications.ts` → Website `api/internal/applications/[id]/index.ts`)._

## Tasks

### Task 1: Drag-Handler in `applications-board.ts` implementieren

**Ziel:** Application Cards werden zu HTML5 Drag & Drop-Quellen, Columns werden Drop-Ziele.

**Änderung an `components/brett/src/client/ui/applications-board.ts`:**

1. **Card als draggable markieren** — in `createApplicationCard()`:
   - Das `<article class="applications-board__card">` Element erhält `draggable="true"`
   - Event-Listener für `dragstart`:
     - Setze `event.dataTransfer.setData('application/json', JSON.stringify({ jobId, status }))`
     - Füge CSS-Klasse `applications-board__card--dragging` für visuelles Feedback (opacity)
     - Setze drag image: `event.dataTransfer.setDragImage(element, 0, 0)`

2. **Column als Drop-Ziel konfigurieren** — im Column-Render-Loop:
   - Event-Listener für `dragover` auf der Column:
     - `event.preventDefault()` (erlaubt Drop)
     - Füge CSS-Klasse `applications-board__column--drop-target` für visuelles Highlight
   - Event-Listener für `dragleave` auf der Column:
     - Entferne `applications-board__column--drop-target`
   - Event-Listener für `drop` auf der Column:
     - Entferne `applications-board__column--drop-target`
     - Parsee `dataTransfer` → `{ jobId, fromStatus }`
     - Hole `status` aus dem Column-Attribut (data-status)
     - Falls `fromStatus !== toStatus`: rufe `onStatusChange(jobId, toStatus)` auf

3. **Handler-Schnittstelle erweitern** — `ApplicationsBoardHandlers`:
   - Neuen Handler `onStatusChange: (jobId: number, newStatus: ApplicationStatus) => Promise<void>`
   - Der Handler macht einen `fetch()` Call:
     ```typescript
     const res = await fetch(`/api/applications/${jobId}/status`, {
       method: 'PUT',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ status: newStatus }),
     });
     ```
   - Bei 200: `location.reload()` (Board neu laden, um konsistenten Zustand zu zeigen)
   - Bei Fehler: Fehlermeldung anzeigen (alert/banner im Container)

4. **CSS für D&D-Feedback**:
   - `.applications-board__card[draggable="true"]:active, .applications-board__card--dragging { opacity: 0.6; }`
   - `.applications-board__column--drop-target { border-color: var(--brett-brass-accent); background: var(--brett-ink-700); }`

**Konfliktprüfung:** Die bestehende Struktur (`createApplicationCard`, `mountApplicationsBoard`,
`applicationsBoardCss`) wird erweitert, nicht ersetzt. `createApplicationCard` erhält einen
zweiten Parameter `handlers`, der auch `onStatusChange` enthält.

### Task 2: BATS-Tests für D&D-Funktionalität

**Ziel:** Neue Testdatei für Drag & Drop, die D&D-Events simuliert und API-Call-Verhalten testet.

**Neue Datei:** `tests/spec/brett/app-board-dnd.bats`

Tests:
1. `test "applications-board: Card hat draggable-Attribut"` — prüft, dass gerenderte Cards
   `draggable="true"` haben
2. `test "applications-board: Drop löst PUT /api/applications/:id/status aus"` — simuliert
   drag/drop-Event-Chain und prüft, dass der richtige API-Call mit status-Payload erfolgt
3. `test "applications-board: Fehler bei Status-Update zeigt Feedback, Card bleibt in Spalte"`
   — simuliert 400/500 Response und prüft, dass das Board NICHT neu geladen wird
4. `test "applications-board: Status-Update mit 200 löst Board-Reload aus"` — simuliert
   200 Response und prüft, dass `location.reload()` aufgerufen wird

**Hinweis:** BATS-Tests für Client-JS werden über `node --test` mit `jsdom`-Simulation
oder über Playwright E2E gemacht. Wenn BATS allein nicht reicht, wird eine minimale
Playwright-Suite `tests/e2e/app-board-dnd.spec.ts` angelegt (s. `tests/e2e/` für Muster).

### Task 3: Integrationstest + Qualitätsgate

- `task test:changed` — alle Tests grün
- `task freshness:check` — Artefakte aktuell
- Manuell im Brett: Board öffnen, eine Card zwischen Spalten ziehen → Status-Update sichtbar

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Vor der Implementierung prüfen, ob die Tests im aktuellen
      Branch fehlschlagen (keine D&D-Funktionalität vorhanden):

```bash
cd /home/patrick/Bachelorprojekt/.worktrees/T900304
cd tests/unit/lib/bats-core/bin && ./bats /home/patrick/Bachelorprojekt/tests/spec/brett/app-board-dnd.bats 2>&1 || echo "expected: FAIL — D&D not yet implemented"
```

- [ ] **Implement-Schritt (GREEN).** Task 1 und 2 durchführen. Alle Tests müssen passing sein.
- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
