#!/usr/bin/env bats
# tests/spec/llm-local-dev/qwen-tensor-split.bats
# SSOT: openspec/changes/qwen-tensor-split/specs/llm-local-dev.md
#       Requirement "Start scripts leave -ngl to -fit" (MODIFIED, T900172).
#
# Der Dual-GPU-Split des Qwen-27B-Loadouts legt 85 % der Layer auf die
# RTX 5070 Ti. Gemessen 2026-09-15 (Ticket T900172): -fit allein 31 t/s und
# 2782 MiB ungenutzt auf der 5070 Ti; -ts 85,15 38 t/s bei gleichem Kontext
# (205.056) und 2628 MiB frei auf der Anzeige-Karte.
#
# Zwei Startwege tragen denselben Split: das Windows-Skript und das
# llm-proxy-Loadout. Laufen sie auseinander, misst man je nach Startweg
# eine andere Verteilung.

setup() {
  export REPO="$(cd "$BATS_TEST_DIRNAME/../../../" && pwd)"
}

script_default_ts() {
  tr -d '\r' < "$REPO/scripts/llm/start-qwen-server.ps1" \
    | sed -n 's/^[[:space:]]*\[string\]\$TensorSplit = "\([^"]*\)".*/\1/p'
}

@test "start-qwen-server.ps1 defaults -TensorSplit to 85,15 (T900172)" {
  run script_default_ts
  [ "$status" -eq 0 ]
  [ "$output" = "85,15" ]
}

@test "loadout qwen38-220k passes the same -ts as the start script (T900172)" {
  run jq -r '.loadouts[] | select(.slug == "qwen38-220k") | .extraArgs as $a
             | ($a | index("-ts")) as $i | if $i == null then "missing" else $a[$i + 1] end' \
      "$REPO/scripts/llm/loadouts.json"
  [ "$status" -eq 0 ]
  [ -n "$output" ]
  [ "$output" = "$(script_default_ts)" ]
}
