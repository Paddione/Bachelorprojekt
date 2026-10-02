#!/usr/bin/env bats

load ../test_helper

@test "LlmProxyPanel mentions attempted address and does not suggest task start when unreachable" {
  # Positiv-Anker: die Adresse wird in der Komponente gerendert (Variable heisst seit T900809 snap)
  run grep -rn "snap.address" components/website/src/components/sdlc/cockpit/LlmProxyPanel.svelte
  [ "$status" -eq 0 ]

  # Negativ-Prüfung: alter Startbefehl ist entfallen
  run grep -rn "Proxy offline — Start:" components/website/src/components/sdlc/cockpit/LlmProxyPanel.svelte
  [ "$status" -ne 0 ]
}
