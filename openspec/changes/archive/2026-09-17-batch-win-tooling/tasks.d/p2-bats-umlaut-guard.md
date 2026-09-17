# p2 — BATS-Runner: Umlaut-Encoding-Guard

## Child-Ticket
- T900068: BATS-Testnamen mit Umlauten laufen unter Windows still nicht — Faelle werden uebersprungen statt zu failen

## Problem
Ein `@test`-Name mit Umlaut wird vom mitgelieferten bats-Runner unter Windows nicht gefunden. Der Runner meldet `bats: unknown test name` und **ueberspringt** den Fall statt zu scheitern. Exit-Code bleibt unberuehrt. Nur `bats warning: Executed N instead of expected M` verraeat es.

## Tasks

### 2.1 BATS-Runner-Wrapper analysieren
- `tests/unit/lib/bats-core/bin/bats` — den Wrapper/Stub finden
- Prüfen, wie `@test`-Namen geparsed werden
- Reproduktion unter Windows: `tests/unit/lib/bats-core/bin/bats --help` und Encoding-Flags prüfen

### 2.2 Guard: "Executed N instead of expected M" als Fehler werten
- Den Output von `bats` parsen
- Falls `warning: Executed N instead of expected M` mit `N != M` → exit code 1
- Dies muss vor dem eigentlichen `bats` Aufruf passieren (Wrapper)

### 2.3 tests/CLAUDE.md — ASCII-Pflicht für @test-Namen
- Section "Test-Naming-Rules" ergaenzen: `@test`-Namen muessen ASCII sein (a-z, A-Z, 0-9, underscore, hyphen)
- Erlaubt: Umlaute im Testkoerper und in Kommentaren
- Dokumentieren, warum: Windows/BATS-Parser-Unterstuetzung

### 2.4 Test fuer den Guard anlegen
- `tests/spec/runner/bats-runner-guard.bats` (oder equivalent)
- Test: Ein .bats-File mit 5 Tests, 2 mit Umlaut, 3 ohne
- Validieren: Runner exit 1 wenn N != M, exit 0 wenn N == M

## Acceptance Criteria
- BATS-Runner exit code 1 wenn Tests uebersprungen werden (N != M)
- Alle bestehenden Tests weiterhin gangig
- tests/CLAUDE.md enthaelt ASCII-Pflicht fuer @test-Namen
- Guard-Test in CI deckt den Fall ab

## Target Spec
- `openspec/specs/spec-bats-agentic-ai.md` — delta: Runner-Exit-Code-Verhalten
- `openspec/specs/e2e-testing.md` — delta: BATS-Test-Encoding

## Dependencies
- Keiner — eigenständig implementierbar
