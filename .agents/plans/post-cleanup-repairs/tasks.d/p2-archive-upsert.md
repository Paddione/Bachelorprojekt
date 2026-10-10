---
title: "p2-archive-upsert — voller Upsert je Ticket+Slug"
ticket_id: T901749
domains: [scripts, tickets]
status: draft
---

# post-cleanup-repairs — Implementation Plan

Partial-Plan `p2-archive-upsert` fur T901749 (Slug `post-cleanup-repairs`).
Scope: voller Upsert in `cmd_archive_plan`. Zieldatei ist exklusiv; dieser
Partial andert keine weiteren Dateien.

## File Structure

| Datei | Ist | Budget |
| `scripts/ticket.sh` | 1040 | -240 |

Budget-Quelle: `.sh`-Limit 800 aus `docs/code-quality/gates.yaml`,
nicht-baselined; Datei ist per ignore-glob sanktionierte Single-File-CLI
(Warnung erwartet, kein Hard-Fail). Anderung wenige Zeilen im
Existenz-Check plus entfallender `pr_number`-Filter im UPDATE.

## Task 2 — Upsert auf archivierte Rows ausweiten

Steps:

1. In `cmd_archive_plan` den Existenz-Check vereinheitlichen: `SELECT
   count(*) FROM tickets.ticket_plans WHERE ticket_id = :'t_uuid'::uuid
   AND slug = :'slug'` (ohne `pr_number`-Filter). 0 → INSERT wie bisher;
   groesser 0 → UPDATE.
2. UPDATE-Statement: Filter auf `(ticket_id, slug)` ohne
   `pr_number`-Einschrankung — aktualisiert Staged- wie archivierte Rows
   und konvergiert historische Duplikate auf identischen Content
   (Content, Branch, `pr_number`, `archived_at = now()`).
3. Verify-Count nach dem Schreiben behalten (fail-closed wie bisher).

Akzeptanzkriterien:

- Frische Archivierung (keine Row): genau ein INSERT.
- Re-Archive bei Staged-Row: UPDATE, keine zweite Row (unverandert).
- Re-Archive bei archivierter Row: UPDATE, keine zweite Row (neu).
- `test_t901749_archive_auf_archivierter_row_updatet_statt_duplikat` ist
  grun.
