#!/usr/bin/env bats
# T002467 — K8: Agentische Headed-Tests zur Implementierungs-Verifikation.
#
# Prüfmodus: Quelltext-/Konfigurationsverifikation (Ausnahme laut CLAUDE.md
# "Test-Resultats-Konvention [T002448-M4]" — das zu belegende Ergebnis ("dieser
# Test läuft in keinem CI-Pfad") manifestiert sich ausschließlich in Konfiguration
# (playwright.config.ts testMatch-Listen, Workflow-YAML), nicht in Kommando-Output.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  cd "$REPO_ROOT"
}

@test "k8-headed-verify spec file exists" {
  [ -f "tests/e2e/specs/k8-headed-verify.spec.ts" ]
}

@test "playwright.config.ts registers other known specs (positive anchor) but NOT k8-headed-verify" {
  # Positiv-Anker zuerst: das grep-Werkzeug selbst muss auf einen bekannten,
  # tatsächlich registrierten Spec treffen — sonst wäre "0 Treffer für
  # k8-headed-verify" trivial wahr, auch wenn testMatch-Parsing kaputt ist.
  run grep -c "fa-01-" tests/e2e/playwright.config.ts
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]

  # Negativ-Aussage: kein project-Block referenziert die K8-Headed-Spec —
  # sie ist damit von keinem "playwright test --project=<name>"-Aufruf erfasst.
  run grep -c "k8-headed-verify" tests/e2e/playwright.config.ts
  [ "$status" -eq 1 ] || [ "$output" -eq 0 ]
}

@test "k8-headed-verify.spec.ts carries no @smoke or other e2e-pr feature tag" {
  # Positiv-Anker: ein tatsächlich getaggter Spec (fa-01, @messaging) muss den
  # Tag-Grep bestätigen, bevor wir die Abwesenheit im K8-Spec behaupten.
  run grep -c "tag: \['@messaging'\]" tests/e2e/specs/fa-01-messaging.spec.ts
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]

  run grep -c "tag: \[" tests/e2e/specs/k8-headed-verify.spec.ts
  [ "$status" -eq 1 ] || [ "$output" -eq 0 ]
}

@test "k8-headed-verify.spec.ts skips itself when CI env var is set" {
  run grep -c "process.env.CI" tests/e2e/specs/k8-headed-verify.spec.ts
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}

@test "e2e.yml documents K8 headed-verify as optional / not a merge gate" {
  run grep -c "K8 headed-verify" .github/workflows/e2e.yml
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}

@test "ci.yml (required PR checks) does not reference the K8 headed-verify spec" {
  # Positiv-Anker: ci.yml muss existieren und Inhalt haben, sonst wäre die
  # Abwesenheits-Aussage vakuos.
  [ -s ".github/workflows/ci.yml" ]

  run grep -c "k8-headed-verify" .github/workflows/ci.yml
  [ "$status" -eq 1 ] || [ "$output" -eq 0 ]
}

@test "dev-flow-e2e skill documents the optional headed-verify step" {
  run grep -c "headed-verify" .claude/skills/dev-flow-e2e/SKILL.md
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}
