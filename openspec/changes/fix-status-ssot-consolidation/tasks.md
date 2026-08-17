---
slug: fix-status-ssot-consolidation
ticket: T008345
status: active
---

# Fix: Status-SSOT-Reste konsolidieren

## Problem

Post-Merge-Review von T007955 fand zwei MINOR-Reste der Status-Konsolidierung:

1. **Vierte 11er-Liste:** `pipeline-order.ts` deklariert `ALL_TICKET_STATUSES` parallel zur SSOT `status.ts`
2. **Shell-Kopie:** `triage.sh:12` + `migrations.ts:52` nicht konsolidiert

## Tasks

### Task 1: pipeline-order.ts auf status.ts umbiegen

`components/website/src/lib/tickets/pipeline-order.ts` — `ALL_TICKET_STATUSES` und `TicketStatus`-Union durch Import aus `status.ts` ersetzen.

### Task 2: Cross-Assertion (optional)

Test ergänzen der `TICKET_STATUSES == ALL_TICKET_STATUSES` assertiert (Schutz gegen künftigen Drift).

### Task 3: Shell-Kopie konsolidieren (Optional, Low Priority)

`scripts/vda/ticket/triage.sh:12` `_VALID_STATUSES` — könnte auf `status.ts` als Quelle zeigen (z.B. via `grep` oder gemeinsame JSON-Datei).

## Acceptance Criteria

- [ ] `pipeline-order.ts` importiert Status-Union aus `status.ts`
- [ ] Kein Duplikat der 11er-Liste mehr
- [ ] Cross-Assertion (optional)
