---
title: "fix-pr-babysit-head-sha — Implementation Plan"
ticket_id: T012265
domains: [scripts]
status: active
file_locks:
  - scripts/factory/pr-babysit-ticket.sh
  - tests/spec/software-factory/pr-babysit-ci-never-ran.bats
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# fix-pr-babysit-head-sha — Implementation Plan

_Ticket: T012265_

## File Structure

```
scripts/factory/pr-babysit-ticket.sh                     ← HEAD-Bewertung via check-runs + ci-never-ran-Signal
tests/spec/software-factory/pr-babysit-ci-never-ran.bats         ← RED-Test + Positiv-Anker
openspec/changes/fix-pr-babysit-head-sha/                ← dieser Plan
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Der Negativtest schlägt auf dem aktuellen
      Stand fehl: `total_count=0` auf dem HEAD endet im timeout des grünen
      Polls ohne Signal. Der Positiv-Anker (Runs vorhanden + MERGED → exit 0,
      kein Signal) bleibt grün.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/pr-babysit-ci-never-ran.bats
# expected: FAIL (red — Test 2 schlägt fehl: timeout ohne ci-never-ran-Signal)
```

- [ ] **Fix-Step 1 (GREEN) — `scripts/factory/pr-babysit-ticket.sh`:** Vor
      der Urteilsbildung im Loop (bzw. in `_has_red`/`_red_or_pending_checks`)
      den PR-HEAD lesen und die check-runs-API auswerten:

      ```bash
      HEAD_OID="$("$GH" pr view "$PR" --json headRefOid -q '.headRefOid' 2>/dev/null || echo "")"
      if [[ -n "$HEAD_OID" ]]; then
        TOTAL=$("$GH" api "repos/Paddione/Bachelorprojekt/commits/${HEAD_OID}/check-runs?filter=latest" \
          -q '.total_count' 2>/dev/null || echo "")
        if [[ "$TOTAL" == "0" ]]; then
          echo "pr-babysit: ci-never-ran — PR #$PR HEAD hat keine Check-Runs (CI lief nie)" >&2
          exit 2
        fi
      fi
      ```

      Und die Rot-Erkennung (`_has_red`, `_red_or_pending_checks`) auf die
      check-runs-API des HEAD umstellen (`filter=latest`,
      `conclusion == "failure" or "timed_out"` — dieselbe Quelle wie
      `devflow-ci-watch.sh`). `gh pr checks` bleibt nur für die
      nicht-urteilsrelevante Übersicht erhalten. Fail-soft: schlägt die
      HEAD-Abfrage fehl, greift der bestehende empty-Pfad
      (MAX_EMPTY_ROUNDS → exit 2 mit Rebase-Hinweis).

- [ ] **Verify-Step (GREEN).** Testdatei grün:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/pr-babysit-ci-never-ran.bats
# expected: PASS (green — frühzeitiger Exit mit Signal, Anker bleibt still)
```

- [ ] **Abschließender Verifikations-Task (STRUCT3):**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
