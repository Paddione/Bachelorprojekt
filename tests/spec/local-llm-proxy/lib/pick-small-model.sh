#!/usr/bin/env bash
# tests/spec/local-llm-proxy/lib/pick-small-model.sh
# T002872 — deterministische Auswahl des kleinsten GGUF-Modells fuer Kurzlebig-
# Tests (ui-config-seed.bats). Vorher waehlte der Test per `find … | head -n1`
# die ERSTE gefundene GGUF-Datei (nichtdeterministisch, teils ein 12B-Modell),
# was die Ladezeit und damit den Health-Wait-Erfolg vom Dateisystem-Cache-Zustand
# abhaengig machte statt von einer bewusst kleinen Testfixture.
#
# Root-Cause-Analyse: openspec/changes/llm-proxy-bats-local-red/design.md
# Neben den eigentlichen Modellen liegen in den Roots auch Hilfsdateien:
#   - mmproj-*  : Vision-Projektor (mmprojPath, siehe scripts/llm-proxy/loadouts.mjs)
#   - *draft*   : Draft-/Spekulativ-Modelle (draftModelPath, siehe server.mjs)
# Diese werden ausgeschlossen — gleiche Konvention wie die Nebendatei-Erkennung
# aus T002886.

pick_small_test_model() {
  local candidate best="" best_size="" size="" f
  while IFS= read -r -d '' f; do
    case "${f##*/}" in
      mmproj-*|mtp-*|*draft*) continue ;; # Nebendateien (Vision-Projektor / MTP-/Draft-Modell)
    esac
    if command -v stat >/dev/null 2>&1 && stat --version >/dev/null 2>&1; then
      size="$(stat -c%s "$f" 2>/dev/null || true)"
    else
      # Fallback fuer Nicht-GNU-stat (BSD/macOS): wc -c
      size="$(wc -c < "$f" 2>/dev/null || true)"
    fi
    [[ -z "${size}" ]] && continue
    if [[ -z "${best_size}" ]] || (( size < best_size )); then
      best="${f}"
      best_size="${size}"
    fi
  done < <(find "$@" -type f -name '*.gguf' -print0 2>/dev/null)

  if [[ -z "${best}" ]]; then
    return 1
  fi
  printf '%s\n' "${best}"
}
