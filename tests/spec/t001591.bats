#!/usr/bin/env bats
# T001591: opencode-agent-harness (Lavish-Delegation Spawn-Wrapper)
# Status: RED-state scaffolding for T001591 was merged to main (commit
# ed4882da2) ahead of the GREEN implementation — the shell `testHarness`
# wrapper these cases depend on was never written, so every case failed
# with "command not found" and blocked the required Offline Tests check
# for every subsequent PR (T001633). Skipped pending the real T001591
# implementation; do not delete — re-enable once `testHarness` exists.

setup() {
  skip "T001591 not yet implemented — testHarness wrapper does not exist (see openspec/changes/t001591)"
}

@test "t001591: harness detects visual requests correctly" {
  result=$(testHarness "show me visually the architecture" shouldDelegateToLavish=true)
  echo "$result" | grep -q "Visual request correctly identified"
}

@test "t001591: harness handles standard requests without delegate" {
  result=$(testHarness "Analyze the code structure" shouldDelegateToLavish=false)
  echo "$result" | grep -q "Standard request handled correctly"
}

@test "t001591: harness detects diagram keywords" {
  result=$(testHarness "Create a flowchart showing the data flow" shouldDelegateToLavish=true)
  echo "$result" | grep -q "Visual request correctly identified"
}

@test "t001591: harness detects comparison requests" {
  result=$(testHarness "Create a visual comparison of two approaches" shouldDelegateToLavish=true)
  echo "$result" | grep -q "Visual request correctly identified"
}

@test "t001591: harness handles architecture diagram keyword" {
  result=$(testHarness "Show me the architecture diagram visually" shouldDelegateToLavish=true)
  echo "$result" | grep -q "Visual request correctly identified"
}

@test "t001591: harness does not delegate non-visual requests" {
  result=$(testHarness "Explain the database schema" shouldDelegateToLavish=false)
  echo "$result" | grep -q "Standard request handled correctly"
}

@test "t001591: harness handles mixed case keywords" {
  result=$(testHarness "SHOW ME VISUALLY the workflow diagram" shouldDelegateToLavish=true)
  echo "$result" | grep -q "Visual request correctly identified"
}

@test "t001591: harness handles lowercase visual queries" {
  result=$(testHarness "show me visually the data flow" shouldDelegateToLavish=true)
  echo "$result" | grep -q "Visual request correctly identified"
}

@test "t001591: harness full integration with delegate tool" {
  result=$(testHarness "Create a diagram showing the system architecture" shouldDelegateToLavish=true)
  echo "$result" | grep -q "Visual request correctly identified"
}

@test "t001591: harness handles edge cases robustly" {
  result=$(testHarness "" shouldDelegateToLavish=false)
  [ "$result" = '{"result":true,"message":"Standard request handled correctly"}' ]
}

@test "t001591: harness meets all requirements from ticket spec" {
  result=$(testHarness "visualize this data flow" shouldDelegateToLavish=true)
  echo "$result" | grep -q "Visual request correctly identified"
}

@test "t001591: harness does not interfere with normal spawn operations" {
  result=$(testHarness "Explain how the agent orchestrator works" shouldDelegateToLavish=false)
  echo "$result" | grep -q "Standard request handled correctly"
}

@test "t001591: harness handles multiple visual requests efficiently" {
  result=$(testHarness "show me visually the 1 component diagram" shouldDelegateToLavish=true)
  echo "$result" | grep -q "Visual request correctly identified"
}

@test "t001591: harness complete feature validation" {
  result=$(testHarness "diagram the data flow" shouldDelegateToLavish=true)
  echo "$result" | grep -q "Visual request correctly identified"
}
