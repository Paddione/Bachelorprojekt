#!/usr/bin/env bats
# tests/spec/dev-machine-onboarding/key-register.bats [T900119]
# SSOT: openspec/changes/dev-repo-per-machine/specs/dev-machine-onboarding/spec.md
# Pruefmodus: Register per yq geparst (Ergebnis). Runbook per Abschnitts-grep, weil sich
# diese Zusicherung ausschliesslich im Dokumenttext manifestiert.

section() { awk -v h="$1" '$0 ~ "^## " h {f=1; next} f && /^## /{exit} f' "$RUNBOOK"; }

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  REGISTER="${REPO_ROOT}/devmesh/key-holders.yaml"
  RUNBOOK="${REPO_ROOT}/docs/runbooks/git-crypt-key-distribution.md"
}

@test "key-holders: jeder Eintrag hat nicht-leere machine, person und since" {
  run yq -r '.holders | length' "$REGISTER"
  [ "$status" -eq 0 ]
  [ "$output" -gt 0 ]
  run yq -r '[.holders[] | select(((.machine // "") == "") or ((.person // "") == "") or ((.since // "") == ""))] | length' "$REGISTER"
  [ "$status" -eq 0 ]
  [ "$output" = "0" ]
}

@test "runbook: Widerruf nennt neuen Key, Re-Encryption und Rotation als Pflichtschritte" {
  [ -f "$RUNBOOK" ]
  body="$(section 'Widerruf')"
  [ -n "$body" ]
  printf '%s\n' "$body" | grep -qF -e 'git-crypt init'
  printf '%s\n' "$body" | grep -qF -e 'git rm -r --cached'
  printf '%s\n' "$body" | grep -qF -e 'Rotation aller Secrets'
}

@test "runbook: Transport per Vaultwarden Send mit Ablauf und Einmal-Abruf" {
  [ -f "$RUNBOOK" ]
  body="$(section 'Transport')"
  [ -n "$body" ]
  printf '%s\n' "$body" | grep -qF -e 'Vaultwarden Send'
  printf '%s\n' "$body" | grep -qF -e 'Maximale Zugriffsanzahl: 1'
  printf '%s\n' "$body" | grep -qF -e '24 Stunden'
}
