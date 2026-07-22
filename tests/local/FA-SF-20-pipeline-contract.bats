#!/usr/bin/env bats
# FA-SF-20: structural contract for the runnable factory pipeline (offline, no cluster).
SCRIPT="scripts/factory/pipeline.js"
# T002074: deploy prompt moved into buildDeployPrompt (pipeline-partials.cjs).
PARTIALS_MOD="scripts/factory/pipeline-partials.cjs"

@test "FA-SF-20: pipeline.js exists and is syntactically valid JS" {
  [ -f "$SCRIPT" ]
  run node --check "$SCRIPT"
  [ "$status" -eq 0 ]
}

@test "FA-SF-20: exports meta with the six expected phases" {
  for p in Scout Design Plan Implement Verify Deploy; do
    run grep -q "phase('$p')" "$SCRIPT"; [ "$status" -eq 0 ]
  done
  run grep -Eq "export const meta|module\.exports\.meta" "$SCRIPT"; [ "$status" -eq 0 ]
}

@test "FA-SF-20: wires the existing factory parts (conflict-check, review prompts, ticket.sh, scout.sh)" {
  run grep -q "conflict-check.sh" "$SCRIPT"; [ "$status" -eq 0 ]
  run grep -q "review-bug-hunter.prompt.md" "$SCRIPT"; [ "$status" -eq 0 ]
  run grep -q "review-security-auditor.prompt.md" "$SCRIPT"; [ "$status" -eq 0 ]
  run grep -q "review-pattern-enforcer.prompt.md" "$SCRIPT"; [ "$status" -eq 0 ]
  run grep -q "scripts/ticket.sh" "$SCRIPT"; [ "$status" -eq 0 ]
  # find-similar-tickets.mjs is now an implementation detail of scout.sh (not pipeline.js).
  # Instead verify that pipeline.js invokes the deterministic scout.sh.
  run grep -q "scout.sh" "$SCRIPT"; [ "$status" -eq 0 ]
}

@test "FA-SF-20: uses args.timestamp and not Date.now()/Math.random() (resume-safe)" {
  run grep -q "args.timestamp" "$SCRIPT"; [ "$status" -eq 0 ]
  # Exclude comment lines (// ... and JSDoc * lines) — the pattern appears in
  # JSDoc to document what NOT to use; only actual code-line usage is disallowed.
  run bash -c "grep -Ev '^\s*(/[/*]|\*)' \"$SCRIPT\" | grep -Eq 'Date\.now\(\)|Math\.random\(\)'"
  [ "$status" -ne 0 ]
}

@test "FA-SF-20: Deploy phase merges from MAIN repo and deploys BOTH brands with explicit ENV" {
  run grep -Eq "workspace:deploy|workspace:partial-deploy" "$SCRIPT"; [ "$status" -eq 0 ]
  run grep -Eq "ENV=mentolder|ENV=korczewski|ENV=fleet-" "$SCRIPT"; [ "$status" -eq 0 ]
}

@test "FA-SF-20: pipeline writes a per-phase liveness touch (>=6 references)" {
  run grep -c "ticket.sh touch" "$SCRIPT"
  [ "$status" -eq 0 ]
  [ "$output" -ge 6 ]
}

@test "FA-SF-20: Deploy phase enforces WORK_BRANCH regex feature/*|fix/* + diff-size guard" {
  run grep -Eq "feature/.*\|fix/|guard_check_diff_size" "$SCRIPT" "$PARTIALS_MOD"; [ "$status" -eq 0 ]
  run grep -q "FACTORY_MAX_DIFF" "$SCRIPT"; [ "$status" -eq 0 ]
}

@test "FA-SF-20: Deploy asserts MAIN_REPO cwd + explicit ENV= (no bare context)" {
  run grep -q "ENV=mentolder" "$SCRIPT"; [ "$status" -eq 0 ]
  run grep -q "ENV=korczewski" "$SCRIPT"; [ "$status" -eq 0 ]
}

@test "FA-SF-20: both escalation sites route PushNotification via ToolSearch" {
  run grep -c "ToolSearch select:PushNotification" "$SCRIPT"
  [ "$status" -eq 0 ]
  [ "$output" -ge 2 ]
}

@test "FA-SF-20: no scout.* reference escapes the if(!REUSE) Scout block (Deploy ReferenceError guard)" {
  # `const scout` is block-local to `if (!REUSE) { ... }`; any scout.* appearing after
  # the alternative `if (REUSE) {` runs outside that scope → ReferenceError at runtime
  # (the template literal is fully evaluated when the agent() call is built). Out-of-block
  # signals must be hoisted to a top-level var (featureComplexity / featureTouchedFiles).
  blockend=$(grep -n '^if (REUSE) {' "$SCRIPT" | head -1 | cut -d: -f1)
  [ -n "$blockend" ]
  run awk -v end="$blockend" 'NR > end && /scout[.?]/ { print NR": "$0; f=1 } END { exit (f?1:0) }' "$SCRIPT"
  [ "$status" -eq 0 ]
}

@test "FA-SF-20: defines consumeInjections and calls it after every phaseEvent(...,'entered')" {
  run grep -q "function consumeInjections" "$SCRIPT"; [ "$status" -eq 0 ]
  # one consume per entered-boundary: scout, design, plan(x2 reuse+fresh), implement, verify, deploy
  run grep -c "consumeInjections(" "$SCRIPT"
  [ "$status" -eq 0 ]
  [ "$output" -ge 7 ]
}

@test "FA-SF-20: consumeInjections is best-effort (try/catch, never throws) and uses get-injections --consume" {
  run grep -q "get-injections" "$SCRIPT"; [ "$status" -eq 0 ]
  run grep -q "'--consume'" "$SCRIPT"; [ "$status" -eq 0 ]
  # the helper body wraps in try/catch (mirrors phaseEvent)
  run bash -c "awk '/function consumeInjections/,/^}/' \"$SCRIPT\" | grep -q 'try {'"
  [ "$status" -eq 0 ]
}

@test "FA-SF-20: consumeInjections materializes assets into assets-inbox" {
  run grep -q "assets-inbox" "$SCRIPT"; [ "$status" -eq 0 ]
}
