---
title: "fix-babysit-prs-ci-never-ran — Implementation Plan"
ticket_id: T012264
domains: [scripts]
status: active
file_locks:
  - scripts/factory/babysit-prs.sh
  - tests/spec/software-factory/babysit-prs-ci-never-ran.bats
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# fix-babysit-prs-ci-never-ran — Implementation Plan

_Ticket: T012264_

## File Structure

```
scripts/factory/babysit-prs.sh                          ← ci-never-ran-Scan nach Kandidaten-Nullfall
tests/spec/software-factory/babysit-prs-ci-never-ran.bats       ← RED-Test + Positiv-Anker
openspec/changes/fix-babysit-prs-ci-never-ran/           ← dieser Plan
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Der Negativtest schlägt auf dem aktuellen
      Stand fehl: PR mit leerem Rollup + `total_count=0` endet still ohne
      Notify. Der Positiv-Anker (IN_PROGRESS → keine Notify) bleibt grün.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/babysit-prs-ci-never-ran.bats
# expected: FAIL (red — Test 2 schlägt fehl: keine QA_NOTIFY_PAYLOAD)
```

- [ ] **Fix-Step 1 (GREEN) — `scripts/factory/babysit-prs.sh`:** Im
      `CANDIDATE_COUNT -eq 0`-Zweig (vor `exit 0`) den ci-never-ran-Scan
      einfügen:

      ```bash
      # CI-never-ran-Scan (T012264): PRs derselben Filterkette ohne
      # COMPLETED-Rollup-Eintrag + total_count=0 auf dem headRefOid melden.
      NEVER_RAN=$(echo "$PRS_JSON" | jq -c --arg renovate_ok "$RENOVATE_OK" '
        [ .[]
          | select(.isDraft == false)
          | select((.labels // []) | map(.name) | index("ci-babysitter-gave-up") | not)
          | select(((.author.login // "") | test("^renovate(\\[bot\\])?$") | not) or ($renovate_ok == "true"))
          | select((.statusCheckRollup // []) | any(.status == "COMPLETED") | not)
          | select(.number as $n | true)
        ]')
      for row in $(echo "$NEVER_RAN" | jq -r '.[] | @base64'); do
        _jq() { echo "$row" | base64 -d | jq -r "$1"; }
        NUM2=$(_jq '.number'); BRANCH2=$(_jq '.headRefName')
        is_branch_locked "$BRANCH2" && continue
        HEAD_OID=$(gh pr view "$NUM2" --json headRefOid -q '.headRefOid' 2>/dev/null || echo "")
        [[ -z "$HEAD_OID" ]] && continue
        TOTAL=$(gh api "repos/Paddione/Bachelorprojekt/commits/${HEAD_OID}/check-runs" -q '.total_count' 2>/dev/null || echo "")
        if [[ "$TOTAL" == "0" ]]; then
          emit_notify "$NUM2" "PR #${NUM2} CI lief nie" \
            "PR #${NUM2} (${BRANCH2}) hat keine Check-Runs auf seinem HEAD — CI wurde nie gestartet. Kein roter Kandidat, deshalb kein Babysitter-Fix."
        fi
      done
      ```

      exakte Umsetzung dem Implementer überlassen, aber: derselbe
      Filterketten-Umfang wie der Kandidaten-Scan, `is_branch_locked`-Guard,
      Fail-soft (kein Abbruch bei gh-Fehler), Notify über das bestehende
      `emit_notify` mit `event=ci-never-ran`.

- [ ] **Verify-Step (GREEN).** Testdatei grün:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/babysit-prs-ci-never-ran.bats
# expected: PASS (green — Notify mit PR-Nummer, Anker bleibt still)
```

- [ ] **Abschließender Verifikations-Task (STRUCT3):**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
