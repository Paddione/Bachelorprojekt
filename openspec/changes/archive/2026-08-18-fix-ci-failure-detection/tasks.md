---
title: "fix-ci-failure-detection — Implementation Plan"
ticket_id: T012239
domains: [scripts]
status: completed
file_locks:
  - scripts/devflow-ci-watch.sh
  - scripts/factory/babysit-prs.sh
  - tests/spec/ci-cd/devflow-ci-watch-rollup-headsha.bats
  - tests/spec/software-factory/babysit-prs-red-detection.bats
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# fix-ci-failure-detection — Implementation Plan

_Ticket: T012239_

## File Structure

```
scripts/devflow-ci-watch.sh                            ← FAILED_CHECKS-Quelle: check-runs-API statt Rollup-Selector
scripts/factory/babysit-prs.sh                         ← Kandidaten-Filter + TIMED_OUT/ERROR
tests/spec/ci-cd/devflow-ci-watch-rollup-headsha.bats          ← RED-Tests ci-watch (T012239)
tests/spec/software-factory/babysit-prs-red-detection.bats     ← RED-Tests Scanner (T012239)
openspec/changes/fix-ci-failure-detection/             ← dieser Plan
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Beide neuen Testdateien laufen auf dem
      aktuellen Stand — die Rot-Fälle MÜSSEN fehlschlagen, die Positiv-Anker
      MÜSSEN bestehen (beweist, dass der Testaufbau den Scan-/Watch-Pfad
      erreicht).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/devflow-ci-watch-rollup-headsha.bats
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/babysit-prs-red-detection.bats
# expected: FAIL (red — failure-Run am PR-HEAD wird als "alle grün" gemeldet,
#           TIMED_OUT/ERROR-Rollup bleibt unsichtbar)
```

- [ ] **Fix-Step 1 (GREEN) — `scripts/devflow-ci-watch.sh`:** Der
      FAILED_CHECKS-Block (Zeile 107-110, Rollup-Selector mit
      `select(.headSha == $p.headRefOid)`) wird ersetzt durch eine Abfrage der
      check-runs-API des PR-HEAD:

      ```bash
      if ! FAILED_CHECKS=$(gh api "repos/Paddione/Bachelorprojekt/commits/${PR_HEAD_OID}/check-runs?filter=latest" \
        -q '[.check_runs[] | select(.conclusion == "failure" or .conclusion == "timed_out") | (.name // "unknown") + ": " + (.html_url // "")]' 2>/dev/null); then
        # gleiche Eskalation wie bisher: bei MAX_CI_ATTEMPTS exit 1, sonst sleep 15 + continue
      fi
      ```

      `PR_HEAD_OID` steht an dieser Stelle bereits zur Verfügung (Zeile 92,
      `headRefOid` der PR — kein `git rev-parse HEAD`, T003612 Bug 2 bleibt
      behoben). `filter=latest` liefert genau einen Run je Check auf diesem
      Commit. Die Job-Level-Gegenprobe (T003224) bleibt unverändert bestehen
      und greift nun wieder. `PENDING_COUNT` (Rollup, `status != "COMPLETED"`)
      wird nicht angefasst.

- [ ] **Fix-Step 2 (GREEN) — `scripts/factory/babysit-prs.sh`:** Der
      Kandidaten-Filter im jq (Zeile ~92) wird erweitert:

      ```jq
      select(
          (.mergeStateStatus == "CONFLICTING")
          or ((.statusCheckRollup // []) | any(
                .conclusion == "FAILURE" or .conclusion == "TIMED_OUT" or .conclusion == "ERROR"
              ))
        )
      ```

      Nur die Selektion ändert sich; Klassifikation (`classify_failure`) und
      Fix-Loop lesen weiterhin die echten Logs.

- [ ] **Verify-Step (GREEN).** Beide Testdateien laufen grün:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/devflow-ci-watch-rollup-headsha.bats
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/babysit-prs-red-detection.bats
# expected: PASS (green — Rot-Fälle selektieren/eskalieren, Positiv-Anker bleiben grün)
```

- [ ] **Abschließender Verifikations-Task (STRUCT3):**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
