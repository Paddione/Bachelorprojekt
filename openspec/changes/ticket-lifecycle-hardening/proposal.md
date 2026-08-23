# Proposal: ticket-lifecycle-hardening

**Ticket:** T015014 (Batch-Parent) · Kinder: T015009, T015010 (+ T015011, läuft separat über PR #5142)
**Auslöser:** Incident T015005 (2026-08-23) — Ticket-Zeile T014936 wurde aus `tickets.tickets` gelöscht, die Sequenz gab die ID neu heraus, und die Post-Merge-Closure schloss daraufhin das falsche (neue) Ticket.

## Why

Der Incident legte drei gekoppelte Defekte offen:

1. **Blinder Löschpfad (T015009):** `cleanupEphemeral()` in
   `components/website/src/lib/planning-office.ts:193` löscht vor jedem
   Ideengenerierungslauf ALLE ungepinnten Zeilen mit `status='planning'` — ohne
   unterscheidendes Merkmal zu echten Feature-Tickets aus dev-flow. Ideen aus
   `createIdea()` und echte Tickets sind datenmäßig identisch.
2. **Auditfreies DELETE (T015009):** Der Trigger `trg_tickets_audit_log`
   (`components/website/src/lib/tickets/tables/tickets.ts:448`) feuert nur auf
   INSERT/UPDATE — DELETE hinterlässt keine Spur in `tickets.ticket_activity`.
3. **ID-Reuse-anfällige Closure (T015010):** `scripts/factory/auto-close-merged.sh`
   löst den `[T000XXX]`-Tag im PR-Titel per `external_id` auf
   (`WHERE external_id = '$ticket'`, Zeile 166). Nach Löschung + Sequenz-Reuse
   zeigte die ID auf das falsche Ticket → falsche Closure.

## What Changes

### planning-office (T015009)

- `createIdea()` stempelt jeder Idee bei INSERT einen Ursprungs-Marker
  (`readiness->>'origin' = 'idea-generator'`) mit.
- `cleanupEphemeral()` löscht nur noch Zeilen MIT diesem Marker — niemals mehr
  blind nach `status`.
- Guard-Test: ein nicht markiertes planning-Ticket überlebt den Cleanup.

### ticket-system (T015009, Audit)

- `tickets.fn_audit_log()` bekommt einen DELETE-Zweig (`_deleted`-Activity mit
  OLD-Zeile), der Trigger wird auf `INSERT OR UPDATE OR DELETE` erweitert.

### software-factory (T015010)

- Die Post-Merge-Closure korroboriert jeden aus dem Titel aufgelösten Kandidaten,
  bevor sie schließt: PR-Head-Branch muss zum `plan_ref`-Branch des Tickets
  passen ODER eine explizite Ticket↔PR-Verknüpfung existieren. Ohne Korroboration
  → Skip mit Warnung statt Closure (ID-Reuse-Defense).

## Out of Scope

- **T015011** (external_id_seq-Backfill): bereits implementiert, PR #5142 offen.
- Wiederöffnen des fälschlich geschlossenen Tickets T014939 (terminal done;
  separat per Kommentar dokumentiert).
- Live-Datenwiederherstellung von T014936 (Incident-Bearbeitung bereits abgeschlossen).

## Risks

- Marker-basierte Filter ändert das Cleanup-Verhalten für Alt-Ideen OHNE Marker:
  diese bleiben künftig liegen (akzeptiert — besser zu viel behalten als echte
  Tickets verlieren; pinned=false-Ideen ohne Marker werden beim nächsten Audit
  gesichtet).
- Branch-Korroboration setzt voraus, dass Factory-Tickets einen `plan_ref` mit
  `branch=` tragen (Regelpfad seit T008014). Manuell geschlossene Pfade behalten
  den PR-Link-Fallback.
