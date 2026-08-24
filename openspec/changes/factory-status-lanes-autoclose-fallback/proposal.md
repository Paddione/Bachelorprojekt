# Proposal: factory-status-lanes-autoclose-fallback

## Why

Zwei Factory-Automation-Defekte aus dem repo-hygiene-Lauf 2026-08-24 (~03:30 UTC,
Ticket T015960), beide live verifiziert:

1. **factory_status meldet immer 0 Lane-Counts.** `countByStatus`
   (`scripts/factory/mcp-go/main.go:471`) parst das queue.sh-JSON nach dem Feld
   `status` — `queue.sh` (`scripts/factory/queue.sh:15`) SELECTiert es aber nicht.
   Folge: `dispatchable["backlog"]` und `["plan_staged"]` sind strukturell immer 0.
   Beobachtet im ticket-ops-Lauf: `factory_status` meldete 0/0, während
   `queue.sh` 8 dispatchbare Rows lieferte; ein Mishap-Buffer-Eintrag einer
   Parallelsession bestätigt dasselbe.
2. **Auto-Close-Poller überspringt PRs ohne `[T-Bracket]` im Titel.** PR #5214
   trug die Ticket-ID nur im Branch-Suffix (`…-t015919`); der Poller skippte,
   T015919 blieb nach dem Merge offen (Merge=closure verletzt) und wurde nur
   manuell nachgeschlossen.

## What

1. `status` in die SELECT-Liste von `queue.sh` aufnehmen + Go-Unit-Test für
   `countByStatus` mit/ohne `status`-Feld (Regression-Guard, fehlendes Feld →
   Warnung statt stummer Null).
2. Fallback-Funktion `extract_ticket_id_from_branch` in
   `auto-close-merged.sh`: bei leerem Titel-Tag die Ticket-ID aus dem
   Branch-Suffix (`-T[0-9]{6}$`) ziehen; danach greift unverändert der
   Identity-Guard (Pre-Merge-Anchors). Ohne ID aus beiden Quellen: lauter Skip.

_Beamte Fixes sind klein und hängen am selben Merge=closure/Lane-Anzeigepfad —
Batch-Abarbeitung nach T015918-Muster. Ticket: T015960._

## Impact

- **Specs:** `software-factory` (2 ADDED Requirements: Lane-Counts korrekt;
  Branch-Suffix-Fallback bei der Post-Merge-Closure)
- **Code:** `scripts/factory/queue.sh`, `scripts/factory/mcp-go/main.go`,
  `scripts/factory/auto-close-merged.sh`
- **Tests:** neue BATS/Go-Tests je Fix (RED→GREEN)
- **Risiko:** gering — reine Observability-/Fallback-Erweiterung; bestehende
  Guard-Pfade (Identity-Guard, Slot-Gates) werden nicht gelockert.
