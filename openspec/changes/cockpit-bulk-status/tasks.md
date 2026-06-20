---
title: Implementation Plan: cockpit-bulk-status
ticket_id: T000989
domains: [website, db]
status: active
---

# Implementation Plan: cockpit-bulk-status

> Ticket: T000989 · Spec: `docs/superpowers/specs/2026-06-20-cockpit-bulk-status.md`
> Brand-Scope: mentolder (erstmal). Batch-Limit 10 (code-Konstante, nicht user-facing).
> Grounding: BulkBar + Checkbox-Auswahl + generisches `/api/admin/cockpit/batch` existieren
> bereits; dieser Plan baut den dedizierten Status-Bulk-Flow mit Limit, Concurrent-Change-Guard,
> aggregiertem Comment, Toast + 5s-Undo. Priority/Reparent bleiben auf dem alten Batch-Pfad.

## File Structure

### Neu

- `website/src/lib/bulk-status.ts` — `bulkChangeStatus(brand, ids, newStatus, actor)` + `undoBulkStatus(token)`. Transaktionslogik: Batch-Limit 10, `WHERE id=$1 AND brand=$2 AND status=$old`-Guard (überspringt konkurriert geänderte), aggregierter `ticket_comments`-Eintrag (`kind='status_change'`) pro geändertem Ticket, Undo-Token mit Old-Statuses. ~110 Zeilen.
- `website/src/lib/bulk-status.test.ts` — Unit-Tests: Limit>10 → Fehler, Concurrent-Guard überspringt, Comment angelegt, Undo restauriert, Partielles Ergebnis. ~120 Zeilen.
- `website/src/pages/api/admin/tickets/bulk-status.ts` — `POST`: Admin+Brand-Guard, Body `{ ticketIds: string[], status: string }`, ruft `bulkChangeStatus()`, Antwort `{ changed, skipped, failed, undoToken, oldStatuses }`. ~55 Zeilen.
- `website/src/pages/api/admin/tickets/bulk-status/undo.ts` — `POST`: Body `{ undoToken }`, ruft `undoBulkStatus()`, Antwort `{ restored, failed }`. ~40 Zeilen.
- `website/src/components/admin/BulkToast.svelte` — Toast „N Tickets auf X gesetzt" + „Rückgängig"-Button, 5s Auto-Dismiss (Svelte `setTimeout`), persistentes Banner bei Undo-Fehler. Props: `result`, `onUndo`, `onDismiss`. ~70 Zeilen.
- `website/src/components/admin/BulkToast.test.ts` — Render, Undo-Click, Auto-Dismiss nach 5s, Fehler-Banner. ~80 Zeilen.

### Geändert

- `website/src/components/admin/CockpitTable.svelte` — `onBulkStatus` ruft neuen `actions.bulkStatusChange()` statt generischem `runBatch({ status })`; hält Old-Statuses für Undo; mountet `<BulkToast>` mit Undo-Callback. Delta ~+25 Zeilen.
- `website/src/components/admin/BulkBar.svelte` — Hinweis-Text wenn Auswahl-Cap erreicht („Max. 10 Tickets"). Delta ~+6 Zeilen.
- `website/src/lib/tickets/cockpit-table-actions.ts` — neuer Helper `bulkStatusChange(ids, status)` → POST `/api/admin/tickets/bulk-status`; `undoBulkStatus(token)` → POST `/api/admin/tickets/bulk-status/undo`. Delta ~+22 Zeilen.
- `website/src/lib/stores/cockpitStore.ts` — `toggleTicketSelection` blockiert ab 11. Auswahl (Konstante `MAX_BULK_SELECT = 10`). Delta ~+8 Zeilen.
- `website/src/components/admin/CockpitTable.test.ts` — Test auf neuen Flow + Toast-Mount. Delta ~+18 Zeilen.
- `website/src/components/admin/BulkBar.test.ts` — Test auf Cap-Hinweis. Delta ~+8 Zeilen.
- `website/src/lib/stores/cockpitStore.test.ts` — Test auf 11. Auswahl blockiert. Delta ~+10 Zeilen.

## Task 1: bulk-status lib — Transaktion, Guard, Comment, Undo-Token (failing test first)

- [ ] `website/src/lib/bulk-status.test.ts` neu: Test-Suite `bulkChangeStatus` mit Mock-`pool` (Spiegel von `transition.status.test.ts`-Stil, aber `pool.connect()`-Mock mit `BEGIN/COMMIT/ROLLBACK` + `query`-Recorder). Assertionen:
  - `ids.length > 10` wirft `BATCH_LIMIT_EXCEEDED`
  - Ticket mit `status !== oldStatus` wird in `skipped[]` geführt (Guard: `UPDATE … WHERE status=$old` liefert `rowCount=0`)
  - erfolgreich geändertes Ticket erhält Comment-Insert (`kind='status_change'`, Body `Bulk-Status-Wechsel von <old> → <new> durch <actor> am <date>`) und landet in `changed[]` mit `oldStatus`
  - DB-Fehler bei einem Ticket → `failed[]` mit `error`, andere Tickets unverändert (eigene Tx pro Ticket)
  - Rückgabe enthält `undoToken` (Deterministisch aus actor+timestamp+ids) und `oldStatuses: { [id]: oldStatus }`
  - `undoBulkStatus(token)` restauriert alle `oldStatuses` (gleicher Guard-Update)
- [ ] Lauf: `cd website && npx vitest run src/lib/bulk-status.test.ts` → expected: fail (`website/src/lib/bulk-status.ts` existiert noch nicht, Import bricht)
- [ ] `website/src/lib/bulk-status.ts` neu: Export `MAX_BULK_SELECT = 10`, `bulkChangeStatus(brand, ids, newStatus, actor)`, `undoBulkStatus(token)`. Implementierung:
  - Validierung `isValidStatus(newStatus)` (Reuse aus `tickets/transition.ts`)
  - `ids.length > MAX_BULK_SELECT` → throw `BATCH_LIMIT_EXCEEDED`
  - pro Ticket: `client.query('BEGIN')`; `SELECT status FROM tickets.tickets WHERE id=$1 AND brand=$2 FOR UPDATE` → `oldStatus`; `UPDATE … SET status=$1 WHERE id=$2 AND brand=$3 AND status=$4` (Guard); bei `rowCount=0` → `skipped.push({id, oldStatus, reason:'concurrent_change'})`; sonst Comment-Insert + `changed.push({id, oldStatus})`; `COMMIT`; catch → `ROLLBACK` + `failed.push({id, error})`
  - `undoToken` = Base64URL von `JSON.stringify({actor, ts, ids})`; In-Memory-Map `undoStore: Map<token, oldStatuses>` (prozesslokal, 5s-TTL reicht da Toast client-seitig treibt)
  - `undoBulkStatus(token)`: Lookup `undoStore`, pro Eintrag `UPDATE … SET status=old WHERE id AND brand AND status=new` (Guard verhindert Double-Undo), gibt `{restored, failed}` zurück
- [ ] Lauf: `cd website && npx vitest run src/lib/bulk-status.test.ts` → grün
- [ ] Commit `feat(cockpit): add bulk-status lib with limit, guard, comment, undo-token [T000989]`

## Task 2: bulk-status API-Endpoint + Undo-Endpoint

- [ ] `website/src/pages/api/admin/tickets/bulk-status.ts` neu: `POST`-Handler. Admin-Guard via `getSession`/`isAdmin` (Spiegel `tickets/[id]/transition.ts`). Body-Parse `{ ticketIds: string[], status: string }`; Validierung `ticketIds` non-empty Array, `status` via `isValidStatus`. Brand `BRAND()`. try/catch um `bulkChangeStatus(BRAND(), ticketIds, status, { label: session.preferred_username })`; Antwort `{ ok: true, ...result }`. `BATCH_LIMIT_EXCEEDED` → 400, invalid status → 400.
- [ ] `website/src/pages/api/admin/tickets/bulk-status/undo.ts` neu: `POST`-Handler. Body `{ undoToken }`; `undoBulkStatus(token)`; Antwort `{ ok: true, ...result }`; Token unbekannt/expired → 410 Gone.
- [ ] Manueller Curl-Check (dev): `curl -s -X POST localhost:4321/api/admin/tickets/bulk-status -H 'Content-Type: application/json' -d '{"ticketIds":["t1"],"status":"backlog"}'` mit Admin-Cookie → 200 + `changed/skipped/failed/undoToken`
- [ ] Commit `feat(cockpit): add bulk-status + undo API endpoints [T000989]`

## Task 3: BulkToast-Komponente (Toast + 5s-Undo + Fehler-Banner)

- [ ] `website/src/components/admin/BulkToast.test.ts` neu: Render mit `result={changed:3, skipped:1, failed:0, status:'backlog'}` → Text „3 Tickets auf backlog gesetzt"; „Rückgängig"-Button (`data-testid="bulk-undo"`) sichtbar; `fireEvent.click` → `onUndo`-Callback; `vi.useFakeTimers`; `advanceTimersByTime(5000)` → `onDismiss` gerufen + Toast ausgeblendet; `result.failed>0` → persistentes Banner „Undo fehlgeschlagen — manuell prüfen" (kein Auto-Dismiss)
- [ ] Lauf: `cd website && npx vitest run src/components/admin/BulkToast.test.ts` → expected: fail (`BulkToast.svelte` existiert noch nicht)
- [ ] `website/src/components/admin/BulkToast.svelte` neu: Props `result: { changed, skipped, failed, status, undoToken? }`, `onUndo`, `onDismiss`. `{#if failed > 0}` → Fehler-Banner ohne Timer; sonst Toast mit `setTimeout(onDismiss, 5000)` in `onMount` + `clearTimeout` in `onDestroy`. „Rückgängig"-Button ruft `onUndo(undoToken)`.
- [ ] Lauf: `cd website && npx vitest run src/components/admin/BulkToast.test.ts` → grün
- [ ] Commit `feat(cockpit): add BulkToast with 5s undo and failure banner [T000989]`

## Task 4: cockpitStore — Auswahl-Cap (max 10)

- [ ] `website/src/lib/stores/cockpitStore.test.ts` erweitern: Test dass 11. `toggleTicketSelection` bei 10 bereits ausgewählten die Menge unverändert lässt (Größe bleibt 10) und kein neues Element hinzufügt
- [ ] `website/src/lib/stores/cockpitStore.ts`: Konstante `export const MAX_BULK_SELECT = 10`; in `toggleTicketSelection` beim Hinzufügen prüfen `if (next.size >= MAX_BULK_SELECT) return;` (Entfernen immer erlaubt)
- [ ] Lauf: `cd website && npx vitest run src/lib/stores/cockpitStore.test.ts` → grün
- [ ] Commit `feat(cockpit): cap ticket selection at 10 for bulk actions [T000989]`

## Task 5: BulkBar — Cap-Hinweis

- [ ] `website/src/components/admin/BulkBar.test.ts` erweitern: Render mit `selectedIds` Länge 10 → Hinweis „Max. 10 Tickets" sichtbar (`data-testid="bulk-cap-hint"`); Render mit Länge 3 → Hinweis ausgeblendet
- [ ] `website/src/components/admin/BulkBar.svelte`: import `MAX_BULK_SELECT` aus `cockpitStore`; `{#if selectedIds.length >= MAX_BULK_SELECT}<span class="cap" data-testid="bulk-cap-hint">Max. 10 Tickets</span>{/if}` im `.bulk-bar`-Block vor dem Status-Select
- [ ] Lauf: `cd website && npx vitest run src/components/admin/BulkBar.test.ts` → grün
- [ ] Commit `feat(cockpit): show 10-ticket cap hint in BulkBar [T000989]`

## Task 6: CockpitTable — neuen Flow verdrahten + BulkToast + Partial-Result-Handling

- [ ] `website/src/lib/tickets/cockpit-table-actions.ts`: neuer Export `bulkStatusChange(ids, status)` → `fetch('/api/admin/tickets/bulk-status', POST, {ticketIds: ids, status})` gibt `{ ok, body }` zurück; `undoBulkStatus(token)` → `fetch('/api/admin/tickets/bulk-status/undo', POST, {undoToken})`. Bestehendes `runBatch` bleibt für Priority/Reparent.
- [ ] `website/src/components/admin/CockpitTable.test.ts` erweitern: Test dass `onBulkStatus`-Callback `bulkStatusChange` triggert (mock `actions.bulkStatusChange`) und bei `{changed:2, skipped:1}` ein `<BulkToast>` mit `result` gemountet wird; Undo-Callback ruft `actions.undoBulkStatus` + `onMutated`
- [ ] `website/src/components/admin/CockpitTable.svelte`: import `BulkToast`; neue Funktion `async function runBulkStatus(d: { ids: string[]; status: string })`: Snapshot `oldStatuses` aus `tickets`-Array; `const r = await actions.bulkStatusChange(d.ids, d.status)`; bei `r.ok` → `toastResult = { ...r.body, status: d.status }` (Toast sichtbar), `clearSelection()`, `onMutated?.()`; bei partial (`skipped.length>0 || failed.length>0`) ebenfalls Toast (Toast zeigt Aufstellung). `onUndo`-Handler: `await actions.undoBulkStatus(toastResult.undoToken)` → bei Erfolg `onMutated?.()` + Toast dismiss; bei Fehler Toast in Fehler-Banner-Modus. `<BulkBar onBulkStatus={runBulkStatus} ...>` (bestehende Priority/Reparent-Handler bleiben auf `runBatch`). `<BulkToast result={toastResult} onUndo={handleUndo} onDismiss={() => toastResult=null} />` am Sektionsende.
- [ ] Lauf: `cd website && npx vitest run src/components/admin/CockpitTable.test.ts` → grün
- [ ] Commit `feat(cockpit): wire bulk-status flow with toast, undo and partial-result handling [T000989]`

## Task 7: Finale Verifikation (CI-Äquivalent)

- [ ] AC-grep: `bulk-status` in `website/src/pages/api/admin/tickets/` vorhanden · `MAX_BULK_SELECT` in `cockpitStore.ts` · `BulkToast` in `CockpitTable.svelte` gemountet · `bulkChangeStatus` in `bulk-status.ts` mit `WHERE status=$old`-Guard
- [ ] `cd website && npx vitest run` (gesamte Suite) → grün, keine verwaisten Importe
- [ ] `cd website && npx tsc --noEmit` → keine Typfehler
- [ ] `task test:changed` grün (smart selection gegen `origin/main`)
- [ ] `task freshness:regenerate` (test-inventory + freshness-Artefakte)
- [ ] `task freshness:check` grün (S1–S4-Ratchet + Baseline-Key-Count)
- [ ] Regenerierte Artefakte committen (falls Diff): `chore(cockpit): regenerate test-inventory + freshness artifacts [T000989]`
