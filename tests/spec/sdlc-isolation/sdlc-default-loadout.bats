#!/usr/bin/env bats
# tests/spec/sdlc-isolation/sdlc-default-loadout.bats — T013328 (#4)
#
# Pruefmodus: Konfigurationsaussage. Der SDLC-Default-Loadout manifestiert sich
# ausschliesslich in der Default-Zuweisung der Skripte — es gibt keinen
# Laufzeitwert, der die Aussage tragen koennte, ohne ein GPU-Loadout zu starten
# (exklusiveGroup chat-gpu wuerde den Produktionsbetrieb verdraengen).
#
# Hintergrund [T013328 #4]: Nach dem qwen38-Cutover (T013434/T013360) defaulteten
# scripts/sdlc/llm-up.sh und health-gate.sh weiter auf gemma26-throughput. Jeder
# Aufruf ueber diese Defaults belegte erneut die exclusiveGroup chat-gpu mit dem
# falschen Loadout — Ausloeser-Klasse von Incident T013527, drittes Vorkommen.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  LLM_UP="$REPO_ROOT/scripts/sdlc/llm-up.sh"
  HEALTH_GATE="$REPO_ROOT/scripts/sdlc/health-gate.sh"
}

@test "T013328: Positiv-Anker — beide Skripte enthalten eine SDLC_LLM_LOADOUT-Default-Zuweisung" {
  [ -f "$LLM_UP" ]
  [ -f "$HEALTH_GATE" ]
  grep -qE 'SDLC_LLM_LOADOUT="\$\{SDLC_LLM_LOADOUT:-[a-z0-9-]+\}"' "$LLM_UP"
  grep -qE 'SDLC_LLM_LOADOUT="\$\{SDLC_LLM_LOADOUT:-[a-z0-9-]+\}"' "$HEALTH_GATE"
}

@test "T013328: beide SDLC-Defaults zeigen auf qwen38-220k" {
  grep -qF 'SDLC_LLM_LOADOUT="${SDLC_LLM_LOADOUT:-qwen38-220k}"' "$LLM_UP"
  grep -qF 'SDLC_LLM_LOADOUT="${SDLC_LLM_LOADOUT:-qwen38-220k}"' "$HEALTH_GATE"
}

@test "T013328: kein SDLC-Skript defaultet mehr auf das geretirte gemma26-throughput" {
  # Negativ-Aussage mit Anker oben: die Default-Zuweisung existiert (Test 1),
  # hier wird nur ihr WERT geprueft.
  local offenders
  offenders="$(grep -rn 'SDLC_LLM_LOADOUT:-gemma26-throughput' "$REPO_ROOT/scripts/sdlc/" || true)"
  if [ -n "$offenders" ]; then
    printf '%s\n' "$offenders" >&2
  fi
  [ -z "$offenders" ]
}
