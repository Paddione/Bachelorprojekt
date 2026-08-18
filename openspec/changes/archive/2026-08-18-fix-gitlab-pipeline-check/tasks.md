---
title: "fix-gitlab-pipeline-check — Implementation Plan"
ticket_id: T012267
domains: [scripts]
status: active
file_locks:
  - scripts/gitlab-pipeline-check.sh
  - tests/spec/ci-cd/gitlab-pipeline-check.bats
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# fix-gitlab-pipeline-check — Implementation Plan

_Ticket: T012267_

## File Structure

```
scripts/gitlab-pipeline-check.sh                  ← neues read-only Diagnose-Werkzeug
tests/spec/ci-cd/gitlab-pipeline-check.bats               ← RED-Tests + Positiv-Anker
openspec/changes/fix-gitlab-pipeline-check/       ← dieser Plan
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Beide Tests schlagen auf dem aktuellen
      Stand fehl — das Skript existiert nicht (exit 127).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/gitlab-pipeline-check.bats
# expected: FAIL (red — Skript fehlt, run scheitert)
```

- [ ] **Fix-Step 1 (GREEN) — `scripts/gitlab-pipeline-check.sh` neu:** read-only
      curl auf die öffentliche GitLab-API des Spiegel-Projekts, jq-Auswertung
      der letzten Pipeline auf main:

      ```bash
      #!/usr/bin/env bash
      set -u
      API="https://gitlab.com/api/v4/projects/85496968/pipelines?ref=main&per_page=1"
      BODY="$(curl -fsSL "$API" 2>/dev/null || echo "")"
      # Nichtleere-Guard ZUERST (T003109-Semantik): leere Antwort ist kein Urteil.
      if [[ -z "$BODY" ]] || ! printf '%s' "$BODY" | jq -e 'type == "array" and length > 0' >/dev/null; then
        echo "gitlab-pipeline-check: kein Urteil (leere/ungueltige API-Antwort)" >&2
        exit 3
      fi
      STATUS="$(printf '%s' "$BODY" | jq -r '.[0].status // "unknown"')"
      CREATED="$(printf '%s' "$BODY" | jq -r '.[0].created_at // "?"')"
      echo "gitlab-pipeline-check: status=${STATUS} created_at=${CREATED}"
      case "$STATUS" in
        success) exit 0 ;;
        failed|canceled) echo "gitlab-pipeline-check: Pipeline rot (${STATUS})" >&2; exit 1 ;;
        pending|running)
          echo "gitlab-pipeline-check: ${STATUS} — kein Runner mit passendem Tag oder Pipeline haengt; KEIN Urteil (Memory: pending statt failed ohne Runner)" >&2
          exit 2 ;;
        *) echo "gitlab-pipeline-check: unbekannter Status '${STATUS}' — kein Urteil" >&2; exit 3 ;;
      esac
      ```

      exakte Umsetzung dem Implementer überlassen, aber: Nichtleere-Guard vor
      dem Status-Prädikat, exit-Codes 0/1/2/3 wie im Plan, keine
      Schreiboperation, kein Token.

- [ ] **Verify-Step (GREEN).** Testdatei grün:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/gitlab-pipeline-check.bats
# expected: PASS (green — success exit 0, pending exit 2 mit Runner-Hinweis, leer exit != 0)
```

- [ ] **Abschließender Verifikations-Task (STRUCT3):**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
