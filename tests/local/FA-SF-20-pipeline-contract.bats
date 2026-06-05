#!/usr/bin/env bats
# FA-SF-20: structural contract for the runnable factory pipeline (offline, no cluster).
SCRIPT="scripts/factory/pipeline.js"

@test "FA-SF-20: pipeline.js exists and is syntactically valid JS" {
  [ -f "$SCRIPT" ]
  run node --check "$SCRIPT"
  [ "$status" -eq 0 ]
}

@test "FA-SF-20: exports meta with the six expected phases" {
  for p in Scout Design Plan Implement Verify Deploy; do
    run grep -q "phase('$p')" "$SCRIPT"; [ "$status" -eq 0 ]
  done
  run grep -Eq "export const meta" "$SCRIPT"; [ "$status" -eq 0 ]
}

@test "FA-SF-20: wires the existing factory parts (conflict-check, review prompts, ticket.sh)" {
  run grep -q "conflict-check.sh" "$SCRIPT"; [ "$status" -eq 0 ]
  run grep -q "review-bug-hunter.prompt.md" "$SCRIPT"; [ "$status" -eq 0 ]
  run grep -q "review-security-auditor.prompt.md" "$SCRIPT"; [ "$status" -eq 0 ]
  run grep -q "review-pattern-enforcer.prompt.md" "$SCRIPT"; [ "$status" -eq 0 ]
  run grep -q "scripts/ticket.sh" "$SCRIPT"; [ "$status" -eq 0 ]
  run grep -q "find-similar-tickets.mjs" "$SCRIPT"; [ "$status" -eq 0 ]
}

@test "FA-SF-20: uses args.timestamp and not Date.now()/Math.random() (resume-safe)" {
  run grep -q "args.timestamp" "$SCRIPT"; [ "$status" -eq 0 ]
  run grep -Eq "Date\.now\(\)|Math\.random\(\)" "$SCRIPT"; [ "$status" -ne 0 ]
}

@test "FA-SF-20: Deploy phase merges from MAIN repo and deploys BOTH brands with explicit ENV" {
  run grep -q "feature:" "$SCRIPT"; [ "$status" -eq 0 ]
  run grep -Eq "ENV=mentolder|ENV=korczewski|ENV=fleet-" "$SCRIPT"; [ "$status" -eq 0 ]
}
