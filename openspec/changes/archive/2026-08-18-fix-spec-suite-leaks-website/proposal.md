# Proposal: fix-spec-suite-leaks-website

## Why

`bats -r tests/spec/` hinterlässt im Repository-Root ein leeres Top-Level-Verzeichnis
`website/`. Der Drift-Guard `tests/spec/repo-structure/website-moved.bats` (T006999)
wird dadurch ordnungsabhängig rot: läuft der Guard nach dem leckenden Test, schlägt
seine Assertion „kein Top-Level-Verzeichnis website/ mehr" fehl — lokal flaky,
CI (frischer Checkout) unauffällig. T008635 sollte den Leak beheben, dessen Merge
enthielt aber nur die Plan-Datei; der Fix wurde nie implementiert (T006297-Closure-Pfad).

## What

1. Guard-Härtung in `website-moved.bats`: Ein STRAY LEERES `website/` (Suite-Leak)
   wird im `setup` per `rmdir` weggeräumt (entfernt nur leere Verzeichnisse) und
   zusätzlich im `teardown` aufgeräumt. Damit ist das Guard-Ergebnis unabhängig von
   der Test-Reihenfolge. Ein NICHT-LEERES `website/` (echte Reorg-Regression) bleibt
   rot — `rmdir` scheitert an nicht-leeren Verzeichnissen.
2. Failing Test `tests/spec/repo-structure/spec-suite-website-leak.bats`
   (bats-in-bats, output verification): leeres `website/` → Guard grün + Verzeichnis
   weg; nicht-leeres `website/` → Guard rot + Verzeichnis bleibt (Positiv-Anker).
3. Diagnose des Leak-Verursachers (Task 1): Der Leak ist reproduziert
   (Watcher-Messung, siehe Ticket), aber der exakte Verursacher steht noch nicht
   fest — sechs Kandidaten waren einzeln und parallel je sauber, der Leak hängt am
   Gesamtkontext der Suite. Task 1 schließt die Identifikation mit dem
   dokumentierten Harness ab und fixt die Quelle, falls sie reproduzierbar bleibt.

### Symptom vs. Hypothese (T002448-M5)

- **Symptom (belegt):** Leeres `website/` entsteht während des Full-Suite-Laufs.
  MESSUNG (2026-08-18, Worktree spec-suite-leaks-website-T011792 @ origin/main
  832f94815):
  `while [ ! -d website ]; do sleep 0.2; done &` parallel zu
  `tests/unit/lib/bats-core/bin/bats -r -j 6 --no-parallelize-within-files tests/spec/`
  feuerte bei Minute ~13; aktive Slots 463–471 waren
  `openspec-pgvector/context-retrieve-recall.bats`,
  `software-factory/{agent-lock-scope-argument,canary-and-cleanup,catalog-eval-telemetry,conflict-db-triage,conflict-gate}.bats`.
  Diese sechs einzeln und gemeinsam (`-j 6`) ausgeführt: kein Leak.
- **Hypothese (unbestätigt):** Der Verursacher ist ein von einem früheren
  Suite-Teil hinterlassener Zustand (z. B. DB-/Live-Endpoint-Verhalten), der das
  Verhalten eines dieser Tests ändert. Task 1 prüft das mit dem Mkdir-Wrapper-Harness.

_Ticket: T011792_
