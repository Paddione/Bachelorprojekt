#!/usr/bin/env bats
# tests/spec/software-factory/dispatcher.bats
# SSOT: openspec/specs/software-factory.md
#
# [T002503] Aufgeteilt aus tests/spec/software-factory.bats. Jene Sammeldatei hielt
# 495 der ~2300 Spec-Tests in einer Datei und war mit --no-parallelize-within-files
# unteilbar: sie bildete mit 115s den Boden jedes CI-Shards, in dem sie lag.
#
# Der Split ist ein VERSCHIEBEN, kein Kopieren — die Quelldatei ist entfernt.
# T002427/T002421: eine frueher zurueckgelassene Kopie erzeugte doppelte Testnamen,
# ein gefilterter Lauf sah gruen aus, waehrend `task test:factory` ueber die
# veraltete Fassung rot lief.
#
# Gemeinsame Variablen, _skip_if_no_db und Setup/Teardown liegen in _sf_common.bash.

load '_sf_common'

setup()    { _sf_setup; }
teardown() { _sf_teardown; }

# ── FA-SF-30-dispatcher-contract ────────────────────────────────#
# FA-SF-30: structural contract for the dispatcher Workflow script (offline).
DISPATCHER_SCRIPT="scripts/factory/dispatcher.js"

@test "FA-SF-30: dispatcher.js exists and is syntactically valid JS" {
  [ -f "$DISPATCHER_SCRIPT" ]
  run node --check "$DISPATCHER_SCRIPT"
  [ "$status" -eq 0 ]
}

@test "FA-SF-30: exports meta with the three expected phases" {
  run grep -Eq "export const meta" "$DISPATCHER_SCRIPT"; [ "$status" -eq 0 ]
  for p in Prep Launch Metrics; do
    run grep -q "phase('$p')" "$DISPATCHER_SCRIPT"; [ "$status" -eq 0 ]
  done
}

@test "FA-SF-30: wires the primitives (watchdog, schedule, metrics, ticket.sh get)" {
  for needle in "watchdog.sh" "schedule.sh" "metrics.sh" "ticket.sh get"; do
    run grep -q "$needle" "$DISPATCHER_SCRIPT"; [ "$status" -eq 0 ]
  done
}

@test "FA-SF-30: launches pipeline.js via workflow scriptPath" {
  run grep -q "scripts/factory/pipeline.mjs" "$DISPATCHER_SCRIPT"; [ "$status" -eq 0 ]
  run grep -Eq "workflow\(" "$DISPATCHER_SCRIPT"; [ "$status" -eq 0 ]
}

@test "FA-SF-30: resume-safe (uses args.timestamp, no Date.now()/Math.random())" {
  run grep -q "args.timestamp\|A.timestamp" "$DISPATCHER_SCRIPT"; [ "$status" -eq 0 ]
  run grep -Eq "Date\.now\(\)|Math\.random\(\)" "$DISPATCHER_SCRIPT"; [ "$status" -ne 0 ]
}

@test "FA-SF-30: schedules across BOTH brands" {
  run grep -q "mentolder" "$DISPATCHER_SCRIPT"; [ "$status" -eq 0 ]
  run grep -q "korczewski" "$DISPATCHER_SCRIPT"; [ "$status" -eq 0 ]
}

@test "FA-SF-30: PREP gate reads hard guards fresh per tick via guards.sh" {
  # T001812: factory-prep (which sources guards.sh) now runs in wakeup.sh, once
  # per while-loop tick, before the Workflow call — not inside dispatcher.js.
  run grep -q "scripts/factory/guards.sh\|factory-prep" scripts/factory/wakeup.sh; [ "$status" -eq 0 ]
}

@test "FA-SF-30: PREP gate is fail-closed (drops the brand from launch on guard trip / read error)" {
  # T001812: fail-closed via JS exception on missing/invalid prep_file — same
  # early-return-with-no-launches contract as before, different trigger.
  run grep -Eq "prep_file missing|JSON.parse\(raw\)" "$DISPATCHER_SCRIPT"; [ "$status" -eq 0 ]
}

@test "FA-SF-30: captures the parallel() launch result (not discarded)" {
  run grep -Eq "const +results +=.*parallel\(|= await parallel\(" "$DISPATCHER_SCRIPT"; [ "$status" -eq 0 ]
}

@test "FA-SF-30: post-launch escalation loads PushNotification via ToolSearch and notifies on error/blocked" {
  run grep -q "ToolSearch select:PushNotification" "$DISPATCHER_SCRIPT"; [ "$status" -eq 0 ]
  run grep -Eq "\.error|status === 'blocked'|status: *'blocked'|blocked" "$DISPATCHER_SCRIPT"; [ "$status" -eq 0 ]
}

@test "FA-SF-30: agent() opts do NOT pin a model (T000543/#1466 — inherit session model via run-dispatcher.sh)" {
  # T000519/#1430 fixed the DeepSeek 400 by unsetting CLAUDE_CODE_EFFORT_LEVEL in wakeup.sh
  # and run-dispatcher.sh, so the ambient config no longer carries reasoning_effort.
  # T000543/#1466 then intentionally removed the model: pins so the dispatcher inherits the
  # session model from the invoker (DeepSeek or Anthropic), keeping dispatch flexible.
  # Guard: verify agent labels are present but none carry a hard model: pin.
  # T001810: prep is now deterministic (child_process), only escalate + metrics remain.
  labels=$(grep -cE "label: '(escalate|metrics)'" "$DISPATCHER_SCRIPT")
  [ "$labels" -eq 2 ]
  pinned=$(grep -E "label: '(escalate|metrics)'" "$DISPATCHER_SCRIPT" | grep "model:" | wc -l)
  [ "$pinned" -eq 0 ]
}

@test "FA-SF-30: dispatcher reads prep from a file, not via child_process (T001812)" {
  # Uebernommen aus tests/local/FA-SF-30-dispatcher-contract.bats, die mit T002421
  # entfaellt. T001810 rief factory-prep per child_process.execFileSync INNERHALB des
  # Workflow-Calls (bis 300s), langsam genug um den Call in den asynchronen
  # "launched in background"-Modus zu kippen — eine einmalige `claude -p`-Session
  # ueberlebt diese Notification nie. T001812 hat factory-prep zurueck nach wakeup.sh
  # (synchrones bash) verlegt und uebergibt das Ergebnis als Dateipfad.
  run grep -q "args.prep_file\|A.prep_file" "$DISPATCHER_SCRIPT"; [ "$status" -eq 0 ]
  run grep -q "readFileSync" "$DISPATCHER_SCRIPT"; [ "$status" -eq 0 ]
}

# ── FA-SF-31-workflow-entrypoint ────────────────────────────────#
# FA-SF-31: factory Workflow scripts must NOT wrap their body in a fire-and-forget
# IIFE. The harness runs the script body and treats the run as complete when the
# top-level statements finish; a `;(async()=>{…})()` body is never awaited, so no
# agent() runs and the return is lost (verified: IIFE → 0 agents/22ms/undefined,
# top-level await → agents run + return propagates). Guard both runnable scripts.

@test "FA-SF-31: pipeline.js has no fire-and-forget async IIFE wrapper" {
  run grep -Eq '\(async[[:space:]]*\([[:space:]]*\)[[:space:]]*=>' scripts/factory/pipeline.mjs
  [ "$status" -ne 0 ]
  run grep -Eq '^[[:space:]]*\}\)\(\)[[:space:]]*$' scripts/factory/pipeline.mjs
  [ "$status" -ne 0 ]
}

@test "FA-SF-31: dispatcher.js has no fire-and-forget async IIFE wrapper" {
  run grep -Eq '\(async[[:space:]]*\([[:space:]]*\)[[:space:]]*=>' scripts/factory/dispatcher.js
  [ "$status" -ne 0 ]
  run grep -Eq '^[[:space:]]*\}\)\(\)[[:space:]]*$' scripts/factory/dispatcher.js
  [ "$status" -ne 0 ]
}

@test "FA-SF-31: both scripts still parse and use top-level await" {
  run node --check scripts/factory/pipeline.mjs;   [ "$status" -eq 0 ]
  run node --check scripts/factory/dispatcher.js; [ "$status" -eq 0 ]
  run grep -Eq 'await (agent|workflow|parallel|pipeline)\(' scripts/factory/pipeline.mjs;   [ "$status" -eq 0 ]
  run grep -Eq 'await (agent|workflow|parallel|pipeline)\(' scripts/factory/dispatcher.js; [ "$status" -eq 0 ]
}

@test "FA-SF-31: pipeline.js has a dry-run branch that does NOT merge/deploy" {
  run grep -Eq 'dry_run|FACTORY_DRY_RUN|DRY_RUN' scripts/factory/pipeline.mjs
  [ "$status" -eq 0 ]
  # In the dry-run branch the deploy agent must be guarded: assert a DRY_RUN const exists
  run grep -Eq 'const DRY_RUN' scripts/factory/pipeline.mjs
  [ "$status" -eq 0 ]
}

@test "FA-SF-31: pipeline.js has a plan-reuse entrypoint" {
  run grep -Eq 'REUSE|plan_path|WORK_BRANCH' scripts/factory/pipeline.mjs; [ "$status" -eq 0 ]
}

@test "FA-SF-31: DRY_RUN branch marks the ticket dry-run-checked before requeuing (T001816)" {
  # guard_dryrun_ok() in guards.sh only allows a REAL run once ticket.sh dryrun-mark
  # has been called for a ticket. Without it, a ticket that enters the DRY_RUN
  # branch loops forever: every subsequent tick re-forces dry_run=true and the
  # ticket is bounced back to backlog without ever progressing (T001816).
  # NOTE: T002361 moved dryrun-mark OUTSIDE the DRY_RUN agent prompt (as its own
  # programmatic step) to break the livelock. The test checks the full file, not
  # the awk-extracted block.
  grep -q 'dryrun-mark' scripts/factory/pipeline.mjs
}

# ── FA-SF-32-classify-paths ─────────────────────────────────────#
# FA-SF-32: shared-state allowlist + classify-paths.sh escalate-class detection.

@test "FA-SF-32: shared-state-allowlist.txt exists with the four required prefixes" {
  local f="scripts/factory/shared-state-allowlist.txt"
  [ -f "$f" ]
  grep -qx 'k3d/' "$f"
  grep -qx 'prod' "$f"
  grep -qx 'environments/' "$f"
  grep -qx 'Taskfile' "$f"
}

@test "FA-SF-32: k3d/ path is escalate-class (allowlist prefix)" {
  source scripts/factory/classify-paths.sh
  run paths_are_escalate_class "k3d/website.yaml"
  [ "$status" -eq 0 ]
}

@test "FA-SF-32: prod-fleet path is escalate-class (prefix 'prod')" {
  source scripts/factory/classify-paths.sh
  run paths_are_escalate_class "prod-fleet/mentolder/kustomization.yaml"
  [ "$status" -eq 0 ]
}

@test "FA-SF-32: a .sql file is escalate-class" {
  source scripts/factory/classify-paths.sh
  run paths_are_escalate_class "website/src/db/migrate.sql"
  [ "$status" -eq 0 ]
}

@test "FA-SF-32: a path containing 'secret' is escalate-class" {
  source scripts/factory/classify-paths.sh
  run paths_are_escalate_class "environments/.secrets/mentolder.yaml"
  [ "$status" -eq 0 ]
}

@test "FA-SF-32: a realm json is escalate-class" {
  source scripts/factory/classify-paths.sh
  run paths_are_escalate_class "k3d/realm-workspace-dev.json"
  [ "$status" -eq 0 ]
}

@test "FA-SF-32: pure website src is NOT escalate-class" {
  source scripts/factory/classify-paths.sh
  run paths_are_escalate_class "website/src/pages/index.astro,website/src/lib/foo.ts"
  [ "$status" -eq 1 ]
}

@test "FA-SF-32: mixed list with one shared-state path IS escalate-class" {
  source scripts/factory/classify-paths.sh
  run paths_are_escalate_class "website/src/lib/foo.ts,Taskfile.yml"
  [ "$status" -eq 0 ]
}

# ── FA-SF-33-classify-failure ───────────────────────────────────#
# FA-SF-33: classify-failure.sh maps a CI log to exactly one failure class.

_cf() { source scripts/factory/classify-failure.sh; classify_failure "$TMPLOG"; }

@test "FA-SF-33: psql/SQL error classifies as sql" {
  printf 'psql: ERROR:  relation "tickets.foo" does not exist\n' > "$TMPLOG"
  run _cf
  [ "$status" -eq 0 ]
  [ "$output" = "sql" ]
}

@test "FA-SF-33: kustomize build error classifies as manifest" {
  printf 'Error: kustomize build failed: accumulating resources\n' > "$TMPLOG"
  run _cf
  [ "$output" = "manifest" ]
}

@test "FA-SF-33: sealed secret error classifies as secret" {
  printf 'no key could decrypt secret (sealedsecret)\n' > "$TMPLOG"
  run _cf
  [ "$output" = "secret" ]
}

@test "FA-SF-33: keycloak realm import error classifies as realm" {
  printf 'failed to import realm realm-workspace-dev.json\n' > "$TMPLOG"
  run _cf
  [ "$output" = "realm" ]
}

@test "FA-SF-33: vitest failure classifies as test" {
  printf '1 failed | 12 passed (vitest)\nFAIL src/lib/foo.test.ts\n' > "$TMPLOG"
  run _cf
  [ "$output" = "test" ]
}

@test "FA-SF-33: eslint failure classifies as lint" {
  printf '/website/src/foo.ts\n  3:1  error  Missing semicolon  eslint\n' > "$TMPLOG"
  run _cf
  [ "$output" = "lint" ]
}

@test "FA-SF-33: github actions step failure classifies as ci" {
  printf '##[error]Process completed with exit code 1.\n' > "$TMPLOG"
  run _cf
  [ "$output" = "ci" ]
}

@test "FA-SF-33: unrecognised log classifies as other" {
  printf 'all good, nothing to report here\n' > "$TMPLOG"
  run _cf
  [ "$output" = "other" ]
}

@test "FA-SF-33: harmless log with word manifest does not classify as manifest" {
  # [T002427] Aus tests/local/FA-SF-33-classify-failure.bats uebernommen. Falsch-Positiv-
  # Wache: das blosse Vorkommen des Wortes "manifest" in einer Erfolgsmeldung darf die
  # Klassifikation nicht auf 'manifest' ziehen — sonst laeuft die Fehlerbehandlung in den
  # falschen Zweig.
  printf 'Checking route-manifest.json... ok\nAll checks passed cleanly\n' > "$TMPLOG"
  run _cf
  [ "$status" -eq 0 ]
  [ "$output" != "manifest" ]
}

@test "FA-SF-33: missing log file classifies as other" {
  run bash -c 'source scripts/factory/classify-failure.sh; classify_failure /nonexistent/path.log'
  [ "$output" = "other" ]
}

@test "FA-SF-33: stale-artifact freshness failure classifies as freshness" {
  # The fixture names route-manifest.json on purpose: freshness must win over the
  # `manifest` class (the word 'manifest' appears in the stale file path).
  printf "  ✗ website/src/data/route-manifest.json is stale — run 'task freshness:regenerate' locally and commit\nERROR: 1 generated artifact(s) are stale (see above).\n" > "$TMPLOG"
  run _cf
  [ "$status" -eq 0 ]
  [ "$output" = "freshness" ]
}

# ── FA-SF-34-prefix-conflict ────────────────────────────────────#
# FA-SF-34: directory-prefix conflict heuristic regression.
#   - two website/src/pages/ features stay PARALLEL (no conflict)
#   - two k3d/ features in the same dir SERIALIZE (conflict via prefix branch)

@test "FA-SF-34: two website/src/pages features do NOT conflict (stay parallel)" {
  [ -n "${FACTORY_CTX:-}" ] || skip "no dev cluster context set"
  local brand="${TEST_BRAND:-korczewski}"
  local existing
  existing=$(seed_test_feature "$brand" "website/src/pages/foo.astro")
  run env BRAND="$brand" FACTORY_CTX="$FACTORY_CTX" \
    bash scripts/factory/conflict-check.sh "T999998" "website/src/pages/bar.astro"
  [ "$status" -eq 0 ]
  [ "$output" = "[]" ]
}

@test "FA-SF-34: two k3d/ features in same dir DO conflict (serialize)" {
  [ -n "${FACTORY_CTX:-}" ] || skip "no dev cluster context set"
  local brand="${TEST_BRAND:-korczewski}"
  local existing
  existing=$(seed_test_feature "$brand" "k3d/website.yaml")
  run env BRAND="$brand" FACTORY_CTX="$FACTORY_CTX" \
    bash scripts/factory/conflict-check.sh "T999997" "k3d/brett.yaml"
  [ "$status" -eq 1 ]
  [[ "$output" =~ "$existing" ]]
}

@test "FA-SF-34: exact-overlap base branch still conflicts (regression on @>)" {
  [ -n "${FACTORY_CTX:-}" ] || skip "no dev cluster context set"
  local brand="${TEST_BRAND:-korczewski}"
  local existing
  existing=$(seed_test_feature "$brand" "website/src/lib/shared.ts")
  run env BRAND="$brand" FACTORY_CTX="$FACTORY_CTX" \
    bash scripts/factory/conflict-check.sh "T999996" "website/src/lib/shared.ts"
  [ "$status" -eq 1 ]
  [[ "$output" =~ "$existing" ]]
}
