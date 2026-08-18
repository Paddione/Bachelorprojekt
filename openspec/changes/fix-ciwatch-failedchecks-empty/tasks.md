---
title: "fix-ciwatch-failedchecks-empty — Implementation Plan"
ticket_id: T012242
domains: [scripts]
status: active
file_locks:
  - scripts/devflow-ci-watch.sh
  - tests/spec/ci-cd/devflow-ci-watch-rollup-headsha.bats
  - tests/spec/batch-repo-hygiene-ops-fixes.bats
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# fix-ciwatch-failedchecks-empty — Implementation Plan

_Ticket: T012242_

## File Structure

```
scripts/devflow-ci-watch.sh                          ← []-Normalisierung, zeilenweise Meldung, Kommentar-Hygiene
tests/spec/ci-cd/devflow-ci-watch-rollup-headsha.bats        ← T012242-RED-Test + Array-Form-Marker
tests/spec/batch-repo-hygiene-ops-fixes.bats                 ← totes rollup.json-Fixture (Review-M2)
openspec/changes/fix-ciwatch-failedchecks-empty/     ← dieser Plan
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Der neue T012242-Test schlägt auf dem
      aktuellen Stand fehl — `[]` eskaliert als rot (exit 1), obwohl die
      Sachlage grün ist. Die beiden bestehenden Tests bleiben grün
      (Positiv-Anker: Grün-Fall und echter Rot-Fall).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/devflow-ci-watch-rollup-headsha.bats
# expected: FAIL (red — Test 3 "T012242" schlägt fehl: leeres [] eskalierte als rot)
```

- [ ] **Fix-Step 1 (GREEN) — `scripts/devflow-ci-watch.sh`:** Direkt nach dem
      `FAILED_CHECKS`-Fetch (check-runs-Abfrage, Zeile ~112) die leere
      Array-Form normalisieren:

      ```bash
      # Leere Array-Form ([] bei null Fehlern) ist "keine Fehler" — die
      # T003224-Gegenprobe liefe sonst auf jedem grünen Lauf und würde bei
      # einem überholten failure-Run am selben HEAD falsch-rot eskalieren.
      [[ "$FAILED_CHECKS" == "[]" ]] && FAILED_CHECKS=""
      ```

      Kein jq-Formwechsel: die Wrapper-Form der Abfrage bleibt unverändert,
      nur die Wahrheits-Semantik wird repariert (Design-D1).

- [ ] **Fix-Step 2 (GREEN) — Eskalationsmeldung zeilenweise (Review-M4):** In
      beiden Ausgabestellen des Rot-Pfads (Warn-Block und MAX-Eskalation) die
      Array-Form vor der Ausgabe auflösen:

      ```bash
      echo "$FAILED_CHECKS" | jq -r '.[]' 2>/dev/null || echo "$FAILED_CHECKS"
      ```

      Eine Zeile pro Check statt `["name: url", ...]`; der Fallback hält
      Nicht-JSON-Inhalte (Stub-/Alt-Formen) stabil.

- [ ] **Fix-Step 3 (GREEN) — Kommentar-Hygiene (Review-M1):** Die Kommentare
      in `devflow-ci-watch.sh` (Zeilen ~89-91, ~161-164), die noch den
      entfernten Rollup-Selector mit headSha-Filter beschreiben, auf die
      check-runs-API als Quelle umstellen („Kein failure-Run am aktuellen
      HEAD gefunden" statt „Rollup meldet rot … auf .headSha gefiltert").

- [ ] **Fix-Step 4 (GREEN) — Totes Fixture (Review-M2):** In
      `tests/spec/batch-repo-hygiene-ops-fixes.bats` prüfen, ob die
      `rollup.json`-Fixture-Referenz wirklich tot ist (der Stub liest sie seit
      der T012239-Anpassung nicht mehr), und sie dann entfernen. Blindes
      Löschen verboten — erst `grep -n "rollup"` in der Datei und gegen die
      Stub-Cases prüfen.

- [ ] **Verify-Step (GREEN).** Alle betroffenen Testdateien grün:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/devflow-ci-watch-rollup-headsha.bats
tests/unit/lib/bats-core/bin/bats tests/spec/batch-repo-hygiene-ops-fixes.bats
# expected: PASS (green — Test 3 eskaliert nicht mehr, Anker bleiben grün)
```

- [ ] **Abschließender Verifikations-Task (STRUCT3):**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
