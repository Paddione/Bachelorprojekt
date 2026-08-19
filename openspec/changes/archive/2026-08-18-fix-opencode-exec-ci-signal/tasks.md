---
title: "fix-opencode-exec-ci-signal — Implementation Plan"
ticket_id: T012266
domains: [scripts]
status: completed
file_locks:
  - scripts/factory/opencode-exec.sh
  - tests/spec/software-factory/opencode-exec-ci-signal.bats
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# fix-opencode-exec-ci-signal — Implementation Plan

_Ticket: T012266_

## File Structure

```
scripts/factory/opencode-exec.sh                          ← ci-never-ran-Signal nach dem PR-Schritt
tests/spec/software-factory/opencode-exec-ci-signal.bats  ← RED-Test + Positiv-Anker
openspec/changes/fix-opencode-exec-ci-signal/             ← dieser Plan
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Der Negativtest schlägt auf dem aktuellen
      Stand fehl: `total_count=0` auf dem PR-HEAD bleibt stumm (pr-ready
      trotz leerem HEAD). Der Positiv-Anker (total_count=3 → keine Meldung)
      bleibt grün.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/opencode-exec-ci-signal.bats
# expected: FAIL (red — Test 2 schlägt fehl: keine ci-never-ran-Meldung)
```

- [ ] **Fix-Step 1 (GREEN) — `scripts/factory/opencode-exec.sh`:** Im
      PR-Schritt (state=done-Zweig nach erfolgreichem `ensure_pr`) das
      best-effort CI-Signal einfügen:

      ```bash
      # T012266: best-effort CI-Signal — ein PR-HEAD ohne Check-Runs ist
      # kein pr-ready. Fail-soft: bei gh-Ausfall bleibt das done-Event.
      PR_URL="$(gh pr view --json url -q '.url' 2>/dev/null || echo "")"
      if [[ -n "$PR_URL" ]]; then
        PR_NUM="${PR_URL##*/}"
        HEAD_OID="$(gh pr view "$PR_NUM" --json headRefOid -q '.headRefOid' 2>/dev/null || echo "")"
        TOTAL="$(gh api "repos/Paddione/Bachelorprojekt/commits/${HEAD_OID}/check-runs" -q '.total_count' 2>/dev/null || echo "")"
        if [[ "$TOTAL" == "0" ]]; then
          echo "opencode-exec: $EXT_ID — ci-never-ran: PR-HEAD hat keine Check-Runs (PR #$PR_NUM)" >&2
          phase_event blocked orchestrator pr-ready "$dur" 0 ci_never_ran
        else
          phase_event done orchestrator pr-ready "$dur" 0 "ci=${TOTAL:-?}-checks"
        fi
      else
        phase_event done orchestrator pr-ready "$dur" 0
      fi
      ```

      exakte Umsetzung dem Implementer überlassen (Variablen der Datei
      verwenden, `ensure_pr`-Rückgabe ggf. direkt verwerten), aber: Signal
      NUR bei `total_count == 0`, Meldung mit `ci-never-ran` auf stderr,
      blocked- statt done-Event nur in diesem Fall, kein Exit-Code-Wechsel.

- [ ] **Verify-Step (GREEN).** Testdatei grün:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/opencode-exec-ci-signal.bats
# expected: PASS (green — ci-never-ran-Meldung bei leerem HEAD, Anker bleibt still)
```

- [ ] **Abschließender Verifikations-Task (STRUCT3):**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
