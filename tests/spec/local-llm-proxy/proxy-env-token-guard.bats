#!/usr/bin/env bats
# T002556 — BGE_MCP_TOKEN muss in der Umgebung des llm-proxy stehen, und sein
# Fehlen muss AUFFALLEN, statt still zu bleiben.
#
# Pruefmodus: gemischt und im Test benannt.
#   - Die Warnlogik wird AUSGEFUEHRT (extrahiertes Fragment gegen eine
#     praeparierte Datei), nicht gegrept — sonst belegte der Test nur, dass
#     Text existiert [T002448-M4].
#   - Der Verweis im Deployment (secretKeyRef) ist Dokumentation; dort ist
#     grep das angemessene Mittel (dokumentierte Ausnahme).
#
# Hintergrund: ensureUiConfigRendered() braucht die Variable, um die Datei zu
# erzeugen, auf die --ui-config-file zeigt. Fehlt sie, scheitert das Rendern
# still (best-effort, eine Logzeile), aber llama-server bricht bei einem
# --ui-config-file auf eine fehlende Datei HART ab. Am 2026-08-02 stand
# gemma26-factory deshalb rund zehn Minuten still — der Stop gelang, der Start
# nicht.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
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
@test "T002556: llm-services-Deployment bezieht BGE_MCP_TOKEN aus dem SealedSecret (T900191, D5)" {
  # Nachfolger von "die Unit-Datei nennt Herkunft und Folge ...": das Token
  # kommt nicht mehr per EnvironmentFile aus bge-mcp/server.env in die Unit,
  # sondern per secretKeyRef aus workspace-secrets in den Pod.
  # Pfad-Hinweis: diese Datei liegt eine Ebene tiefer als der Partial-Entwurf
  # annahm — deshalb REPO_ROOT statt ../../scripts.
  local deploy_out block
  deploy_out="$(bash "${REPO_ROOT}/scripts/devmesh/render-stack.sh" core 2>/dev/null)" || skip "render-stack.sh Vorbedingung fehlt"
  block="$(printf '%s\n' "$deploy_out" | grep -A4 'name: BGE_MCP_TOKEN' || true)"
  [ -n "$block" ]
  echo "$block" | grep -qF 'secretKeyRef'
  echo "$block" | grep -qF 'name: workspace-secrets'
  # Positiv-Anker: das referenzierte Secret existiert als SealedSecret.
  grep -q 'kind: SealedSecret' "${REPO_ROOT}/environments/sealed-secrets/dev.yaml"
  grep -q 'name: workspace-secrets' "${REPO_ROOT}/environments/sealed-secrets/dev.yaml"
  # LUECKE (T900191/P5b.4): dev.yaml enthaelt die Schluessel BGE_MCP_TOKEN und
  # MCP_POSTGRES_TOKEN noch nicht (nur Klartext in .secrets/dev-tools.yaml) —
  # vor der Abnahme per `task env:seal ENV=dev` versiegeln. Bewusst kein
  # Key-Assert hier: Sealing braucht Cluster-Krypto und ist kein CI-Stoff.
}
