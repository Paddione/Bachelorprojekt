#!/usr/bin/env bats

# adapter-contract.bats — Vertragstreue: Alle 8 Methoden vorhanden, Signaturen stimmen

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  ADAPTER_FILE="$REPO/.lavish/kit/adapter.js"
}

@test "adapter.js exists" {
  [ -f "$ADAPTER_FILE" ]
}

@test "adapter.js exposes all 6 read methods" {
  # Extract all assignments to data.* =
  run grep -oP 'function\s+\w+(?=\s*\()' "$ADAPTER_FILE"
  
  # Must contain: tickets, agents, ci, cluster, factory, models
  for method in tickets agents ci cluster factory models; do
    echo "$output" | grep -q "$method" || {
      echo "Missing method: $method"
      return 1
    }
  done
}

@test "adapter.js exposes 2 stream methods (K2 new)" {
  run grep -oP 'function\s+\w+(?=\s*\()' "$ADAPTER_FILE"
  for method in agentStream factoryStream; do
    echo "$output" | grep -q "$method" || {
      echo "Missing stream method: $method"
      return 1
    }
  done
}

@test "adapter.js exposes unsubscribe" {
  run grep -c 'unsubscribe' "$ADAPTER_FILE"
  [ "$output" -gt 0 ]
}

@test "adapter.js exposes 2 write stubs (ticketAction, agentAction)" {
  run grep -oP 'function\s+\w+Action(?=\s*\()' "$ADAPTER_FILE"
  for method in ticketAction agentAction; do
    echo "$output" | grep -q "$method" || {
      echo "Missing write method: $method"
      return 1
    }
  done
}

@test "adapter.js has no hardcoded fixture arrays (K2 replaces K1)" {
  # K1 had fixtures = { tickets: [...], agents: [...] }
  # K2 must NOT have this
  run grep -c "fixtures" "$ADAPTER_FILE"
  [ "$output" -eq 0 ]
}
