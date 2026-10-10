---
title: "p2-read-path — plan-get, Archive-Upsert, Runner-Fallback, Finalize"
ticket_id: T901719
domains: [sdlc, tickets, scripts]
status: draft
---

# plan-db-ssot — Implementation Plan

Partial-Plan `p2-read-path` für T901719 (Slug `plan-db-ssot`).
Scope: Lese-Pfad aus der DB (`plan-get`), Archive-Upsert, Runner-Fallback,
Finalize-Update. Zieldateien sind exklusiv; dieser Partial ändert keine
weiteren Dateien.

## File Structure

| Datei | Ist | Budget |
| `scripts/vda/ticket/plan-get.sh` | 0 (neu) | 800 |
| `scripts/ticket.sh` | 1012 | -212 |
| `scripts/llm/plan-runner.mjs` | 401 | 399 |
| `scripts/devflow-post-merge-finalize.sh` | 456 | 356 |

Budget-Quelle: Limits aus `docs/code-quality/gates.yaml` (`.sh`/`.mjs`
800); nur `devflow-post-merge-finalize.sh` ist gebaselined (812 → Rest
356). `scripts/ticket.sh` ist per ignore-glob sanktionierte Single-File-CLI
und wächst nur um wenige Dispatcher-Zeilen plus kompakten Upsert in
`cmd_archive_plan`. Neues Modul mit Reserve deutlich unter 800 halten
(Richtwert Endstand unter 120 Zeilen); S4-Erreichbarkeit via Source in
`ticket.sh`.

## Task 2 — plan-get-Modul plus Dispatcher

Steps:

1. `scripts/vda/ticket/plan-get.sh` neu anlegen (Muster `stage-plan.sh`):
   `cmd_plan_get --id <ext-id>` löst die Ticket-UUID auf und gibt die
   neueste `ticket_plans.content` für das Ticket auf stdout aus; keine Row →
   `ERROR: no staged plan for <id>` und Exit 1 (fail-closed, kein
   Disk-Fallback).
2. In `scripts/ticket.sh` sourcen und im Dispatcher verdrahten
   (`plan-get) cmd_plan_get "$@" ;;`) sowie in der Usage-Hilfe aufführen.

Akzeptanzkriterien:

- `ticket.sh plan-get --id T…` druckt exakt den gestagten Body.
- Unbekannte ID und fehlende Row geben Exit 1 mit klarer Meldung.

## Task 3 — Archive-Upsert und Finalize-Update

Steps:

1. `cmd_archive_plan` in `scripts/ticket.sh`: vor dem INSERT prüfen, ob eine
   Staged-Row (`pr_number IS NULL`) für `(ticket_id, slug)` existiert — dann
   UPDATE (Content, `pr_number`, Reason-Trailer) statt INSERT; sonst INSERT
   wie bisher. Verify-Count behalten.
2. `scripts/devflow-post-merge-finalize.sh` Schritt 7: Skip-Bedingung von
   „Slug existiert" auf „Archived-Row existiert" (`pr_number IS NOT NULL`
   oder Merged-Trailer im Content) umstellen; bei Staged-Row UPDATE mit
   Check-Evidenz und Merge-SHA statt Skip.

Akzeptanzkriterien:

- Archivierung nach Stage erzeugt keine zweite Row (genau eine Row pro
  Ticket+Slug am Ende).
- Finalize-Receipt enthält weiterhin Frontmatter, Check-Evidenz, Merge-SHA.

## Task 4 — Runner-DB-Fallback in plan-runner.mjs

Steps:

1. In `resolveTicketRef`/`loadPlan`: fehlt Worktree oder `tasks.md`, vor dem
   Fail `ticket.sh plan-get --id` aufrufen und den Body nach
   `$TMPDIR/plan-runner-<ticket>/tasks.md` materialisieren (Verzeichnis mit
   `mkdtemp`-Muster, kein Schreiben in Worktrees).
2. Partial-Dateien (`tasks.d/`) werden im Fallback-Modus aus dem
   manifest-referenzierten Pfad relativ zum materialisierten `tasks.md`
   erwartet; fehlen sie, bleibt der bisherige Fail (Exit 2) bestehen.

Akzeptanzkriterien:

- Runner läuft mit `--ticket` auch ohne ausgecheckten Branch, solange der
  Body in der DB steht.
- Ohne DB-Row bleibt der bisherige fail-closed Exit 2 erhalten.
