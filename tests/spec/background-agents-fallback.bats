#!/usr/bin/env bats
# tests/spec/background-agents-fallback.bats
#
# T001978 hatte hier einen Drift-Guard für den empty-output-Fallback
# (qwen35-iq4 → qwen35-hq): Typfelder `fallbackFor`/`fallbackTriggered`,
# den finalizeDelegation-Zweig, den Fallback-Dispatch, den Fehlergrund
# `empty_output_after_fallback` und die Registrierung von qwen35-hq.
#
# T002181 (2026-07-26): Diese fünf Tests sind ERSATZLOS GESTRICHEN, weil die
# Anforderung bewusst aufgegeben wurde — nicht, weil sie schwer zu erfüllen war.
# Belege:
#   - .opencode/skills/dev-flow/background-agents.ts:233 dokumentiert es
#     ausdrücklich: "fallbackFor/fallbackTriggered removed 2026-07-22 —
#     qwen35-iq4/hq agents deleted"
#   - `grep -c qwen35 .opencode/agent-models.jsonc` → 0; beide Agenten, zwischen
#     denen der Fallback vermitteln sollte, existieren nicht mehr.
# Ein Fallback zwischen zwei gelöschten Agenten hat kein zu schützendes
# Verhalten. Die Tests hätten sich nur noch grün schreiben lassen, indem man
# toten Code wieder einführt.
#
# Der Timeout-Test unten bleibt: er hing zwar begründungsseitig am Fallback
# ("Raum für den zweiten Lauf"), prüft aber eine eigenständig sinnvolle
# Baseline aus T001969.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  PLUGIN="$REPO_ROOT/.opencode/skills/dev-flow/background-agents.ts"
}

@test "T001969: DEFAULT_MAX_RUN_TIME_MS is at least 25 minutes" {
  [ -f "$PLUGIN" ] || { echo "MISSING plugin: $PLUGIN"; return 1; }
  grep -qE 'DEFAULT_MAX_RUN_TIME_MS = 25 \* 60 \* 1000' "$PLUGIN" \
    || { echo "MISSING 25-min DEFAULT_MAX_RUN_TIME_MS (T001969 baseline)"; return 1; }
}
