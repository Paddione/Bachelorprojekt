#!/usr/bin/env bats
# tests/spec/software-factory/provider-config-baseurl-convention.bats — T003492
#
# PRUEFMODUS: gemischt, und zwar bewusst.
#   - Die URL-Zusammensetzung wird als ECHTES Verhalten geprueft (die Shell baut die
#     URL, das Ergebnis wird verglichen) — Output-Verifikation nach T002448-M4.
#   - Die beiden Registrierungsskripte werden per grep geprueft. Das ist der
#     dokumentierte Ausnahmefall: ihr Ergebnis manifestiert sich nur als
#     DB-Zeile auf einem Cluster, den CI nicht hat. Geprueft wird deshalb die
#     Quelle des Defaults, nicht die geschriebene Zeile.
#
# KONVENTION (openspec/specs/software-factory.md, Requirement "Every Factory Tier Has a
# Fallback Candidate Behind the Primary"): tickets.provider_config.base_url adressiert die
# OpenAI-kompatible Wurzel, "that the callers append /v1/chat/completions to" — also OHNE
# abschliessendes /v1.
#
# ABGRENZUNG: tickets.llm_proxy_backends traegt die UMGEKEHRTE Konvention (Konsument macht
# `GET {baseUrl}/models`, siehe openspec/specs/local-llm-proxy.md). Diese Datei macht
# ausdruecklich keine Aussage ueber jene Tabelle.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  LOCAL_REG="${REPO_ROOT}/scripts/factory/provider-register-local.sh"
  GPTOSS_REG="${REPO_ROOT}/scripts/factory/provider-register-gptoss.sh"
  MIGRATION="${REPO_ROOT}/scripts/migrations/2026-08-10-provider-config-baseurl-drop-v1.sql"
}

# Bildet die Append-Logik der Konsumenten nach (auto-triage.sh, scout-llm-fallback.sh).
_completions_url() {
  printf '%s/v1/chat/completions\n' "${1%/}"
}

@test "provider_config: eine konventionsgerechte base_url ergibt genau ein /v1" {
  # Positiv-Anker: belegt zuerst, dass die Append-Logik ueberhaupt das Erwartete tut.
  run _completions_url "http://127.0.0.1:18235"
  [ "$status" -eq 0 ]
  [ "$output" = "http://127.0.0.1:18235/v1/chat/completions" ]
}

@test "provider_config: eine base_url mit /v1 wuerde den Pfad verdoppeln" {
  # Der Defekt in seiner reinen Form — dokumentiert, warum die Konvention noetig ist.
  run _completions_url "http://127.0.0.1:18235/v1"
  [ "$status" -eq 0 ]
  [ "$output" = "http://127.0.0.1:18235/v1/v1/chat/completions" ]
}

@test "provider-register-local.sh: GATEWAY_URL-Default endet nicht auf /v1" {
  [ -f "$LOCAL_REG" ]
  run grep -E '^GATEWAY_URL=' "$LOCAL_REG"
  [ "$status" -eq 0 ]                      # Positiv-Anker: die Zuweisung existiert
  [[ "$output" != *'/v1"'* ]]
  [[ "$output" != *"/v1'"* ]]
}

@test "provider-register-gptoss.sh: BASE_URL-Default endet nicht auf /v1" {
  [ -f "$GPTOSS_REG" ]
  run grep -E '^BASE_URL=' "$GPTOSS_REG"
  [ "$status" -eq 0 ]
  [[ "$output" != *'/v1"'* ]]
  [[ "$output" != *"/v1'"* ]]
}

@test "Vorwaerts-Migration normalisiert provider_config und laesst llm_proxy_backends in Ruhe" {
  [ -f "$MIGRATION" ]
  run grep -c 'tickets.provider_config' "$MIGRATION"
  [ "$status" -eq 0 ]
  [ "$output" -gt 0 ]
  # Die andere Tabelle darf nur im erlaeuternden Kommentar vorkommen, nie in einem UPDATE.
  run grep -E '^[^-]*UPDATE[[:space:]]+tickets\.llm_proxy_backends' "$MIGRATION"
  [ "$status" -ne 0 ]
}
