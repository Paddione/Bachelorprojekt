#!/usr/bin/env bats
# T002558 — opencode muss durch den llm-proxy gehen, nicht direkt auf :8091.
#
# Pruefmodus: Querschnitts-Konsistenz zwischen Konfigurationsdateien und einer
# Live-Messung. Die Config-Assertions greppen den Quelltext (dort manifestiert
# sich das Ergebnis, dokumentierte Ausnahme in [T002448-M4]); der Kontextwert
# wird gegen den LAUFENDEN Server geprueft und uebersprungen, wenn keiner da
# ist — in CI laeuft kein llama-server.
#
# Warum ueberhaupt: bis T002558 zeigte agent-models.jsonc auf
# http://127.0.0.1:8091/v1, also am Proxy vorbei. Folgen:
#   - max_inflight=1 galt fuer die opencode-Agenten NICHT, sie gingen
#     gleichzeitig auf den Server statt zu serialisieren.
#   - Die Fallback-Kette (gemma -> deepseek -> opencode-zen) griff nicht: bei
#     totem Gemma standen die lokalen Agenten ohne Modell da. Genau das trat
#     am 2026-08-02 fuer rund zehn Minuten ein.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  AGENTS="${REPO_ROOT}/.opencode/agent-models.jsonc"
  PROXY_PORT=18235
  LLAMA_PORT=8091
}

@test "T002558: die llamacpp-Provider zeigen auf den Proxy, nicht auf den Server" {
  # Positiv-Anker zuerst [T002356-M1]: es gibt ueberhaupt einen baseURL-Eintrag.
  [ -f "${AGENTS}" ]
  run bash -c "grep -c '\"baseURL\"' '${AGENTS}'"
  [ "${status}" -eq 0 ]
  [ "${output}" -gt 0 ]

  # Kein llamacpp-Provider darf direkt auf den llama-server zeigen.
  run bash -c "python3 - <<'EOF'
import re
s = open('${AGENTS}').read()
bad = [m.group(1) for m in re.finditer(r'\"(llamacpp[^\"]*)\"\s*:\s*\{.*?\"baseURL\"\s*:\s*\"[^\"]*:${LLAMA_PORT}[^\"]*\"', s, re.S)]
print(len(bad))
EOF"
  [ "${output}" = "0" ]
}

@test "T002558: mindestens ein Provider zeigt auf den Proxy-Port" {
  run bash -c "grep -c ':${PROXY_PORT}/v1' '${AGENTS}'"
  [ "${status}" -eq 0 ]
  [ "${output}" -gt 0 ]
}

@test "T002558: die deklarierte Kontextzahl stimmt mit dem laufenden Server ueberein" {
  # Live-Messung statt gepflegter Zahl. Ohne laufenden Server (CI) uebersprungen
  # — ein skip ist hier ehrlicher als eine Annahme.
  curl -s -m 3 "http://127.0.0.1:${LLAMA_PORT}/props" >/dev/null 2>&1 \
    || skip "kein llama-server auf :${LLAMA_PORT}"

  local live
  live="$(curl -s -m 5 "http://127.0.0.1:${LLAMA_PORT}/props" | jq -r '.default_generation_settings.n_ctx')"
  [ -n "${live}" ]
  [ "${live}" != "null" ]

  # Der Wert im gemma26-Modelleintrag muss dem entsprechen. --fit entscheidet
  # ihn zur Laufzeit; bei drei Slots fiel er von 99840 auf 88832, weil der
  # geteilte Puffer fuer drei Sequenzen reichen muss.
  local declared
  declared="$(python3 -c "
import re,sys
s=open('${AGENTS}').read()
m=re.search(r'\"gemma26-factory\"\s*:\s*\{.*?\"context\"\s*:\s*(\d+)', s, re.S)
print(m.group(1) if m else 'NONE')
")"
  [ "${declared}" = "${live}" ]
}
