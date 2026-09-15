#!/usr/bin/env bats
# tests/spec/llm-local-dev/fit-ngl-conflict.bats
# SSOT: openspec/changes/qwen-fit-ngl/specs/llm-local-dev.md
#       Requirement "Start scripts leave -ngl to -fit" (T900171).
#
# llama.cpp (b10881) bricht -fit ab, sobald -ngl von Hand gesetzt ist:
#   W common_fit_params: failed to fit params to free device memory:
#     n_gpu_layers already set by user to 999, abort
# Danach gilt keine -fitt-Reserve mehr, und die Anzeige-Karte (3060 Ti) lief
# bis auf ~250 MiB voll (gemessen 2026-09-15).
#
# Quelltext-Pruefung statt Ausfuehrung: die Startskripte brauchen
# powershell.exe, llama-server.exe und zwei GPUs - nichts davon existiert in
# CI. Gleiche Klasse wie die verzeichnisweiten Startskript-Guards in
# tests/spec/llm-pipeline.bats (T002288, T002339).

setup() {
  export REPO="$(cd "$BATS_TEST_DIRNAME/../../../" && pwd)"
}

# Gibt den unbedingten $Params = @( ... )-Block eines Skripts aus (CRLF-fest).
params_block() {
  tr -d '\r' < "$1" | awk '/^\$Params = @\(/{on=1; next} on && /^\)/{exit} on{print}'
}

@test "start scripts using -fit on do not pass -ngl unconditionally (T900171)" {
  checked=0
  offenders=""
  for f in "$REPO"/scripts/llm/start-*.ps1; do
    grep -q '"-fit", "on"' "$f" || continue
    block="$(params_block "$f")"
    # Positiv-Anker: ohne gefundenen Block waere der Guard wirkungslos.
    [ -n "$block" ] || { echo "kein \$Params-Block gefunden: $(basename "$f")"; false; }
    checked=$((checked + 1))
    if printf '%s\n' "$block" | grep -q '"-ngl"'; then
      offenders="$offenders $(basename "$f")"
    fi
  done
  [ "$checked" -ge 1 ] || { echo "kein Startskript mit -fit on gefunden"; false; }
  [ -z "$offenders" ] || { echo "-ngl neben -fit on (fit bricht ab):$offenders"; false; }
}

@test "start-qwen-server.ps1 keeps full offload on the fixed-context path (T900171)" {
  run bash -c "tr -d '\r' < '$REPO/scripts/llm/start-qwen-server.ps1' | grep -A1 '\"-fit\", \"off\"'"
  [ "$status" -eq 0 ]
  [[ "$output" == *'"-ngl", "999"'* ]]
}
