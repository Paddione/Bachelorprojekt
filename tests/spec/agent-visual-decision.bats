#!/usr/bin/env bats
# tests/spec/agent-visual-decision.bats — Specification test for agent visual decision UX and accessibility standards

setup_file() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
}

@test "OpenSpec delta file for agent visual decision UX exists" {
  cd "$REPO_ROOT"
  [ -f "openspec/changes/agent-visual-decision-ux/proposal.md" ]
  [ -f "openspec/changes/agent-visual-decision-ux/specs/agent-behavior.md" ]
}

@test "OpenSpec delta spec defines required requirements" {
  cd "$REPO_ROOT"
  run grep -F "Requirement: Structured Interactive Decision Modals for Human Input" openspec/changes/agent-visual-decision-ux/specs/agent-behavior.md
  [ "$status" -eq 0 ]

  run grep -F "Requirement: Progressive Information Disclosure for Verbose Output" openspec/changes/agent-visual-decision-ux/specs/agent-behavior.md
  [ "$status" -eq 0 ]

  run grep -F "Requirement: Visual Diagrams for Complex Decision Trees" openspec/changes/agent-visual-decision-ux/specs/agent-behavior.md
  [ "$status" -eq 0 ]

  run grep -F "Requirement: Lavish HTML Review Surfaces for Visual Review Artifacts" openspec/changes/agent-visual-decision-ux/specs/agent-behavior.md
  [ "$status" -eq 0 ]
}

@test "Visual accessibility guide exists in docs/agent-guide/visual-accessibility.md" {
  cd "$REPO_ROOT"
  [ -f "docs/agent-guide/visual-accessibility.md" ]
}

@test "Visual accessibility guide covers decision modals (ask_question)" {
  cd "$REPO_ROOT"
  run grep -F "ask_question" docs/agent-guide/visual-accessibility.md
  [ "$status" -eq 0 ]

  run grep -F "AskUserQuestion" docs/agent-guide/visual-accessibility.md
  [ "$status" -eq 0 ]
}

@test "Visual accessibility guide covers progressive disclosure details/summary" {
  cd "$REPO_ROOT"
  run grep -i "details" docs/agent-guide/visual-accessibility.md
  [ "$status" -eq 0 ]

  run grep -i "summary" docs/agent-guide/visual-accessibility.md
  [ "$status" -eq 0 ]
}

@test "Visual accessibility guide covers Mermaid flowcharts and Carousels" {
  cd "$REPO_ROOT"
  run grep -i "mermaid" docs/agent-guide/visual-accessibility.md
  [ "$status" -eq 0 ]

  run grep -i "carousel" docs/agent-guide/visual-accessibility.md
  [ "$status" -eq 0 ]
}

@test "Visual accessibility guide covers Lavish HTML review surfaces (lavish-axi)" {
  cd "$REPO_ROOT"
  run grep -F "lavish-axi" docs/agent-guide/visual-accessibility.md
  [ "$status" -eq 0 ]
}
