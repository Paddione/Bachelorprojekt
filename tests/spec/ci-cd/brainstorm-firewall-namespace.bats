#!/usr/bin/env bats
# tests/spec/ci-cd/brainstorm-firewall-namespace.bats
# Failing Test für T005899: Der cmds-Subcall `task: dev:firewall:open` im
# brainstorm-Include wird von go-task relativ zum Include-Namespace aufgelöst
# (brainstorm:dev:firewall:open) und existiert dort nicht. Der Fix ist die
# Root-Adressierung mit führendem Doppelpunkt: `task: :dev:firewall:open`.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
}

@test "brainstorm:firewall:open resolves its cross-include dev call (T005899)" {
  run task brainstorm:firewall:open --dry
  [ "$status" -eq 0 ]

  # Positiv-Anker (T002356-M1): der Dry-Run delegiert wirklich an die
  # dev-stack-Firewall-Logik (ufw-ssh-Kommandos sichtbar), statt leer zu sein.
  echo "$output" | grep -qF 'ufw reload'

  # Negativ-Aussage: keine Namespace-Fehlauflösung mehr.
  echo "$output" | grep -qF 'does not exist' && return 1
  return 0
}

@test "brainstorm:setup dry-run reaches the same delegation (T005899)" {
  run task brainstorm:setup --dry
  [ "$status" -eq 0 ]
  echo "$output" | grep -qF 'ufw reload'
  echo "$output" | grep -qF 'does not exist' && return 1
  return 0
}
