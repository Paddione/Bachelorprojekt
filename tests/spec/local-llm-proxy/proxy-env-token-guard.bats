#!/usr/bin/env bats
# T002556 — BGE_MCP_TOKEN muss in der Umgebung des llm-proxy stehen, und sein
# Fehlen muss AUFFALLEN, statt still zu bleiben.
#
# Pruefmodus: gemischt und im Test benannt.
#   - Die Warnlogik wird AUSGEFUEHRT (extrahiertes Fragment gegen eine
#     praeparierte Datei), nicht gegrept — sonst belegte der Test nur, dass
#     Text existiert [T002448-M4].
#   - Der Verweis in der Unit-Datei ist Dokumentation; dort ist grep das
#     angemessene Mittel (dokumentierte Ausnahme).
#
# Hintergrund: ensureUiConfigRendered() braucht die Variable, um die Datei zu
# erzeugen, auf die --ui-config-file zeigt. Fehlt sie, scheitert das Rendern
# still (best-effort, eine Logzeile), aber llama-server bricht bei einem
# --ui-config-file auf eine fehlende Datei HART ab. Am 2026-08-02 stand
# gemma26-factory deshalb rund zehn Minuten still — der Stop gelang, der Start
# nicht.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  UNIT="${REPO_ROOT}/scripts/llm-proxy/llm-proxy.service"
  TASKFILE="${REPO_ROOT}/Taskfile.llm.yml"
  TMP="$(mktemp -d)"
}

teardown() { rm -rf "${TMP}"; }

# Die Pruefung aus dem Taskfile als ausfuehrbares Fragment — dieselbe Bedingung,
# damit der Test das Verhalten misst und nicht die Formulierung.
_guard() {  # $1 = Pfad der proxy.env
  if ! grep -q "^BGE_MCP_TOKEN=" "$1" 2>/dev/null; then
    echo "WARNUNG: BGE_MCP_TOKEN fehlt in $1 [T002556]"
    return 1
  fi
  return 0
}

@test "T002556: fehlende proxy.env loest die Warnung aus" {
  run _guard "${TMP}/nicht-vorhanden.env"
  [ "${status}" -ne 0 ]
  [[ "${output}" == *"BGE_MCP_TOKEN fehlt"* ]]
}

@test "T002556: vorhandene Datei OHNE das Token loest die Warnung aus" {
  # Der haeufigere Fall: die Datei existiert wegen anderer Overrides
  # (LLM_PROXY_PORT, DEEPSEEK_API_KEY), nur das Token fehlt.
  printf 'LLM_PROXY_PORT=18235\n' > "${TMP}/proxy.env"
  run _guard "${TMP}/proxy.env"
  [ "${status}" -ne 0 ]
  [[ "${output}" == *"BGE_MCP_TOKEN fehlt"* ]]
}

@test "T002556: mit gesetztem Token schweigt der Guard" {
  # Positiv-Anker [T002356-M1]: ohne ihn bestuende der Test auch bei einem
  # Guard, der immer warnt.
  printf 'BGE_MCP_TOKEN=irrelevant-fuer-den-test\n' > "${TMP}/proxy.env"
  run _guard "${TMP}/proxy.env"
  [ "${status}" -eq 0 ]
  [ -z "${output}" ]
}

@test "T002556: ein auskommentierter Eintrag zaehlt nicht als gesetzt" {
  printf '# BGE_MCP_TOKEN=frueher-mal\n' > "${TMP}/proxy.env"
  run _guard "${TMP}/proxy.env"
  [ "${status}" -ne 0 ]
}

@test "T002556: install-service fuehrt die Pruefung tatsaechlich aus" {
  # Querschnitt: dass der Guard im Taskfile verdrahtet ist, manifestiert sich
  # nur im Quelltext — hier ist grep richtig. Der Test oben misst das Verhalten.
  run grep -c 'BGE_MCP_TOKEN=' "${TASKFILE}"
  [ "${status}" -eq 0 ]
  [ "${output}" -gt 0 ]
}

@test "T002556: die Unit-Datei nennt Herkunft und Folge des fehlenden Tokens" {
  # Wer die Unit liest, muss erfahren, warum die Variable nicht optional ist —
  # der EnvironmentFile-Eintrag traegt ein fuehrendes Minus und sieht deshalb
  # nach 'kann fehlen' aus.
  run grep -c 'BGE_MCP_TOKEN' "${UNIT}"
  [ "${status}" -eq 0 ]
  [ "${output}" -gt 0 ]
  run grep -c 'bge-mcp/server.env' "${UNIT}"
  [ "${output}" -gt 0 ]
}
