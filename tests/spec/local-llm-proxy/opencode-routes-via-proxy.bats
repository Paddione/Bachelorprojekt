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
  # ihn zur Laufzeit aus dem zum Startzeitpunkt FREIEN VRAM; die RTX 5070 Ti
  # teilt sich den Speicher mit dem Windows-Desktop, der freie Betrag schwankt
  # also zwischen zwei Starts desselben Loadouts. Gemessen: 88832 bei 13792 MiB
  # frei, 99328 bei mehr, 99840 bei einem Slot. Punktgleichheit ist damit
  # strukturell nicht stabil gruen [T002585].
  #
  # Stattdessen wird ein Toleranzkorridor um den Live-Wert geprueft: declared
  # muss innerhalb [live * 0.8, live * 1.2] liegen. Das modelliert die
  # VRAM-Schwankung (88832-99840, ~±6 % um 94080) und faengt die
  # n_ctx_train-Regression (262144 ≈ 2,6× live) weiterhin zuverlaessig. Die
  # statische Zahl in agent-models.jsonc bleibt bewusst bestehen, weil opencode
  # sie zur Laufzeit fuer Auto-Compact (fasst bei 95 % der Grenze zusammen)
  # braucht — entfernt man sie, faellt opencode auf n_ctx_train zurueck und
  # Auto-Compact wuerde viel zu spaet feuern.
  local declared
  declared="$(python3 -c "
import re,sys
s=open('${AGENTS}').read()
m=re.search(r'\"gemma26-factory\"\s*:\s*\{.*?\"context\"\s*:\s*(\d+)', s, re.S)
print(m.group(1) if m else 'NONE')
")"
  [ "${declared}" != "NONE" ]
  python3 -c "
import sys
declared = int('${declared}')
live = int('${live}')
lo = int(live * 0.8)
hi = int(live * 1.2)
sys.exit(0 if lo <= declared <= hi else 1)
"
}
