#!/usr/bin/env bats
# FA-SF-26: watchdog escalates stale in_progress features.
setup() { load 'test_helper.bash'; source 'tests/lib/factory-test-fixtures.sh'; }

@test "FA-SF-26: dry-resolve works" {
  run env BRAND=mentolder FACTORY_DRY_RESOLVE=1 bash scripts/factory/watchdog.sh
  [ "$status" -eq 0 ]
}

@test "FA-SF-26: a stale in_progress feature is returned to triage and its slot freed" {
  [ -n "${FACTORY_CTX:-}" ] || skip "no dev cluster context set"
  local brand="${TEST_BRAND:-korczewski}"
  ext=$(seed_test_feature "$brand" "tests/fixtures/sf-test-wd-$$-a.txt")
  env BRAND="$brand" bash scripts/factory/slots.sh claim "$ext" 1 >/dev/null
  # Derive the namespace from the brand (do not rely on a FACTORY_NS default).
  local ns; case "$brand" in mentolder) ns=workspace ;; korczewski) ns=workspace-korczewski ;; esac
  # Backdate updated_at by 40 minutes to simulate a hung pipeline.
  pod=$(kubectl get pod -n "$ns" --context "$FACTORY_CTX" -l 'app in (shared-db, shared-db-dev)' -o name | head -1)
  kubectl exec -i "$pod" -n "$ns" --context "$FACTORY_CTX" -c postgres -- \
    psql -U website -d website -qtAc "UPDATE tickets.tickets SET updated_at = now() - interval '40 minutes' WHERE external_id='$ext';"
  run env BRAND="$brand" FACTORY_STALE_MIN=30 bash scripts/factory/watchdog.sh
  [ "$status" -eq 0 ]
  echo "$output" | jq -e --arg e "$ext" 'any(.[]; . == $e)'
  # Confirm status=triage and pipeline_slot cleared.
  st=$(BRAND="$brand" TICKET_CTX="$FACTORY_CTX" bash scripts/ticket.sh get --id "$ext" | jq -r '.status')
  [ "$st" = "triage" ]
}

@test "FA-SF-26: a stale in_progress feature WITH a staged plan (FACTORY-PLAN-REF) is returned to backlog, not triage [T001850]" {
  # expected: FAIL until watchdog.sh checks plan_ref before choosing the reset target.
  [ -n "${FACTORY_CTX:-}" ] || skip "no dev cluster context set"
  local brand="${TEST_BRAND:-korczewski}"
  ext=$(seed_test_feature "$brand" "tests/fixtures/sf-test-wd-$$-b.txt")
  env BRAND="$brand" bash scripts/factory/slots.sh claim "$ext" 1 >/dev/null
  # Simulate dev-flow-plan already having staged a plan for this ticket.
  BRAND="$brand" TICKET_CTX="$FACTORY_CTX" bash scripts/ticket.sh add-comment --id "$ext" \
    --body "FACTORY-PLAN-REF branch=feature/sf-test-wd-$$ plan=openspec/changes/sf-test-wd-$$/tasks.md" >/dev/null
  local ns; case "$brand" in mentolder) ns=workspace ;; korczewski) ns=workspace-korczewski ;; esac
  # Backdate updated_at by 40 minutes to simulate a hung pipeline.
  pod=$(kubectl get pod -n "$ns" --context "$FACTORY_CTX" -l 'app in (shared-db, shared-db-dev)' -o name | head -1)
  kubectl exec -i "$pod" -n "$ns" --context "$FACTORY_CTX" -c postgres -- \
    psql -U website -d website -qtAc "UPDATE tickets.tickets SET updated_at = now() - interval '40 minutes' WHERE external_id='$ext';"
  run env BRAND="$brand" FACTORY_STALE_MIN=30 bash scripts/factory/watchdog.sh
  [ "$status" -eq 0 ]
  echo "$output" | jq -e --arg e "$ext" 'any(.[]; . == $e)'
  # A plan already exists — the watchdog must not throw that work away by sending
  # the ticket back to triage (which forces a full Scout/Design/Plan restart).
  st=$(BRAND="$brand" TICKET_CTX="$FACTORY_CTX" bash scripts/ticket.sh get --id "$ext" | jq -r '.status')
  [ "$st" = "backlog" ]
}

teardown() { [ -n "${FACTORY_CTX:-}" ] && purge_factory_test_data "${TEST_BRAND:-korczewski}" || true; }
