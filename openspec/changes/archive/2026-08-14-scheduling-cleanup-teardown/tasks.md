---
title: Teardown-based SF-TEST fixture cleanup for scheduling tests
ticket_id: T005309
domains: [factory, test]
status: planning
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Teardown-based SF-TEST fixture cleanup for scheduling tests — Implementation Plan

purge-Aufrufe stehen heute am Ende der Test-Bodies (scheduling.bats:150, 173-174, 190-191).
Unter BATS-errexit bricht eine fehlgeschlagene Assertion vor dem Purge ab — Ghost-Seeds
(status=in_progress) belegen dauerhaft Pool-Slots und lassen FA-SF-25 wiederholt rot laufen
(T005309, Post-Merge-Review PR #4438). Dieser Change verlagert den Cleanup in den
`_sf_teardown`-Pfad, ergänzt den purge-Titel-Guard und isoliert die FA-SF-25-Assertions.

## File Structure

- `tests/lib/factory-test-fixtures.sh` — seed registriert ID; purge mit `SF-REAL-`-Titel-Guard (Task 2)
- `tests/spec/software-factory/_sf_common.bash` — `_sf_teardown` purgt registrierte IDs (Task 2)
- `tests/spec/software-factory/scheduling.bats` — Body-Purges entfernen, FA-SF-25 filtern (Task 3)
- `tests/spec/software-factory/scheduling-cleanup-guard.bats` — neuer Guard (Task 1, RED)

## Task 1 — RED: Cleanup-Guard schreiben und rot nachweisen

1. Lege `tests/spec/software-factory/scheduling-cleanup-guard.bats` an mit drei Tests:
   - `seed_real_feature registers its id` (Registry-Datei + ID, Positiv-Anker; DB-abhängig
     via `_skip_if_no_db`)
   - `scheduling.bats test bodies do not purge their own seeds` (awk-Range: kein
     `purge_real_feature` innerhalb von `@test`-Blöcken)
   - `purge_real_feature refuses non-SF-REAL titles` (Verhaltens-Test gegen Dev-DB:
     Nicht-SF-REAL-Ticket bleibt nach purge-Versuch bestehen)
2. Rot nachweisen: `tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/scheduling-cleanup-guard.bats`
   — erwartet: FAIL (`expected: FAIL`) auf Test 1 (keine Registry) und Test 2 (Body-Purges).
   Test 3 skip im ROT-Lauf (ticket.sh create lieferte leer — Fehlerursache in der GREEN-Phase
   klären). **T003548-Wächter:** In der GREEN-Phase darf Test 3 NICHT skippen — ein
   dauerhaft skipender Test misst nichts. create-Pfad debuggen (Flag-Name/Output-Parsing),
   bis der Test real läuft und grün wird.

## Task 2 — GREEN: Registry + Teardown-Purge + Titel-Guard

1. `tests/lib/factory-test-fixtures.sh`:
   - `seed_real_feature`: nach erfolgreichem Anlegen die external_id an
     `$BATS_FILE_TMPDIR/sf-seeded-ids` anhängen (eine Zeile pro ID; fehlt die Variable,
     Registrierung überspringen — kein Absturz in Nicht-BATS-Kontexten).
   - `purge_real_feature`: DELETE um `AND title LIKE 'SF-REAL-%'` ergänzen; Rückgabe
     unterscheidbar machen (0 Zeilen gelöscht ≠ Fehler), sodass Caller es prüfen können.
     Zusätzlich ein explizites `--force`-Flag einführen, das den Titel-Guard übergeht —
     ausschließlich für das Eigenaufräumen von Test-Fixtures ohne SF-REAL-Titel (z. B. das
     Test-Ticket aus dem Guard-Test 3).
2. `tests/spec/software-factory/_sf_common.bash`:
   - `_sf_teardown`: falls `$BATS_FILE_TMPDIR/sf-seeded-ids` existiert, jede registrierte ID
     purgen (purge_real_feature mit `|| true`-Toleranz — teardown darf nie den Exit-Code
     verfälschen), danach die Registry-Datei entfernen. Lädt die Fixture-Datei defensiv
     (`source … 2>/dev/null || true`), damit Dateien ohne Fixture-Bezug unverändert bleiben.
3. Guard grün fahren: Test 1 grün (Registrierung existiert), Test 3 grün (Guard greift).

## Task 3 — scheduling.bats: Body-Purges entfernen, FA-SF-25 isolieren

1. Alle `purge_real_feature`-Aufrufe aus den Test-Bodies entfernen (Z. 150, 173-174,
   190-191) — Cleanup übernimmt `_sf_teardown`. Der `return 1`-Negativ-Pfad in FA-SF-24
   (Z. 149) braucht keinen eigenen Purge mehr.
2. FA-SF-25: Assertions, wo semantisch möglich, auf die geseedeten `e1`/`e2` filtern
   (Kandidatenmenge auf die eigenen IDs eingrenzen); wo das die Aussage verfälschen würde
   (globaler Cap-Test), die Clean-DB-Vorbedingung als Kommentar direkt am Test dokumentieren.
3. `tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/scheduling.bats` — komplette
   Suite grün, und `git grep -n purge_real_feature tests/spec/software-factory/scheduling.bats`
   zeigt 0 Treffer in Test-Bodies (nur teardown/Registry-Kontext).

## Task 4 — Verifikation

- `task test:changed` — Guard + Suite grün
- `task freshness:regenerate` + `task freshness:check` — Inventar aktuell (neue Testdatei)
- `bash scripts/openspec.sh validate scheduling-cleanup-teardown` — Delta valide
