#!/usr/bin/env bats

load ../test_helper

@test "LlmProxyPanel mentions attempted address and does not suggest task start when unreachable" {
  # Positiv-Anker: state.address wird in der Komponente gerendert
  run grep -rn "state.address" components/website/src/components/sdlc/factory/LlmProxyPanel.svelte
  [ "$status" -eq 0 ]

  # Negativ-Prüfung: alter Startbefehl ist entfallen
  run grep -rn "Proxy offline — Start:" components/website/src/components/sdlc/factory/LlmProxyPanel.svelte
  [ "$status" -ne 0 ]
}
