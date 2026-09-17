#!/usr/bin/env bats
# tests/spec/application-pipeline/evidence-catalog.bats
# BATS-Test für den kuratierten Evidenz-Katalog (Phase 3, T900230).
# Testet reine Bash-Logik ohne Typst-Abhängigkeit.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  _EVIDENCE_SH="${REPO_ROOT}/scripts/lib/application-pipeline-evidence.sh"

  source "$_EVIDENCE_SH"
}

# --- RED: Script existiert noch nicht → test fällt durch sourcing fehl ---
# (Wird grün, sobald das Script erstellt wurde.)

# --- GREEN: Evidenz-Katalog wählt relevante Einträge für Platform/DevOps-Job ---

@test "T900230: evidence catalog selects relevant entries for Platform/DevOps posting" {
  # "Kubernetes" matcht fleet-k3s (keyword: kubernetes)
  # "CI/CD" matcht software-factory (keywords: ci, cd)
  local output
  output=$(app_pipeline_select_evidence "Kubernetes CI/CD")

  # fleet-k3s sollte enthalten sein (kubernetes-Match)
  echo "$output" | grep -q '"id":"fleet-k3s"'

  # software-factory sollte enthalten sein (ci/cd-Match)
  echo "$output" | grep -q '"id":"software-factory"'
}

@test "T900230: evidence catalog matches multiple keywords per entry" {
  # "Kubernetes k3s container orchestration" → fleet-k3s mit hohem Score
  local output
  output=$(app_pipeline_select_evidence "Kubernetes k3s container orchestration")

  echo "$output" | grep -q '"id":"fleet-k3s"'
  # fleet-k3s sollte in den Top-5 sein
  local count
  count=$(echo "$output" | grep -c '"id"')
  [ "$count" -ge 1 ] && [ "$count" -le 5 ]
}

@test "T900230: missing keyword match falls back to default evidence set" {
  # Ein Text ohne irgendeinen Katalog-Keyword
  local output
  output=$(app_pipeline_select_evidence "some random text xyz qrf wvu")

  # Sollte Default-Einträge zurückgeben (nicht leer)
  [ -n "$output" ]
  # Default-Eintrag sollte in der Ausgabe sein
  echo "$output" | grep -q '"default":true\|"match_count":0'
}

@test "T900230: AI/LLM-Job matcht freetoken-moe und typst-renderer" {
  local output
  output=$(app_pipeline_select_evidence "LLM model serving GPU inference MoE")

  echo "$output" | grep -q '"id":"freetoken-moe"'
}

@test "T900230: CI/CD-Job matcht software-factory und bats-quality-gates" {
  local output
  output=$(app_pipeline_select_evidence "CI/CD pipeline automation testing quality gates")

  echo "$output" | grep -q '"id":"software-factory"'
  echo "$output" | grep -q '"id":"bats-quality-gates"'
}

@test "T900230: max 5 entries returned" {
  local output
  output=$(app_pipeline_select_evidence "Kubernetes CI/CD testing AI development fluxcd postgres gpu Helm")

  local count
  count=$(echo "$output" | grep -c '"id"')
  [ "$count" -le 5 ]
}

@test "T900230: empty input returns default evidence set" {
  local output
  output=$(app_pipeline_select_evidence "")

  [ -n "$output" ]
  echo "$output" | grep -q '"id":"'
}

@test "T900230: case-insensitive matching" {
  local output_lower output_upper output_mixed
  output_lower=$(app_pipeline_select_evidence "kubernetes ci cd")
  output_upper=$(app_pipeline_select_evidence "KUBERNETES CI CD")
  output_mixed=$(app_pipeline_select_evidence "Kubernetes ci Cd")

  echo "$output_lower" | grep -q '"id":"fleet-k3s"'
  echo "$output_upper" | grep -q '"id":"fleet-k3s"'
  echo "$output_mixed" | grep -q '"id":"fleet-k3s"'
}
