#!/usr/bin/env bats
# tests/spec/software-factory/factory-model-id-default.bats — T003538
#
# PRUEFMODUS: gemischt, mit Begruendung je Test.
#   - Die Default-Konsistenz wird an den Zuweisungen gelesen (Quelle), weil sich
#     ihr Ergebnis sonst nur als DB-Zeile auf einem Cluster zeigt, den CI nicht hat.
#   - Der Aufruf des Runtime-Guards in wakeup.sh wird ebenfalls an der Quelle
#     geprueft: ihn auszufuehren verlangt ein laufendes GPU-Backend, das CI nicht
#     stellt. Dokumentierter Ausnahmefall der Test-Resultats-Konvention (T002448-M4).
#
# WAS HIER BEWUSST NICHT GEPRUEFT WIRD — und warum das der Kern ist:
# Der ausloesende Defekt war 'gemma26-factory' als Default, waehrend der llm-proxy
# dieses Modell nicht servierte (Loadout aktiviert, aber nicht GELADEN; Port 8091
# lauschte nicht). resolveModel() leitet unbekannte IDs STILL auf das erste gesunde
# Backend um — mal ein anderes lokales Modell (HTTP 200), mal DeepSeek mit HTTP 402
# "Insufficient Balance". Nirgends entsteht ein Fehler.
#
# Ein erster Entwurf dieses Guards pruefte "der Default muss ein in loadouts.json
# aktiviertes Loadout sein". Der war VOR dem Fix gruen: 'gemma26-factory' IST dort
# aktiviert. "Aktiviert" und "geladen" sind verschiedene Dinge, und der Defekt sitzt
# im zweiten — offline nicht entscheidbar. Ein Test, der vor dem Fix gruen ist,
# schuetzt nicht, er beruhigt nur.
#
# Die wirksame Absicherung ist deshalb, `scripts/llm/routing-check.sh` ueberhaupt
# AUSZUFUEHREN. Das Werkzeug hat den Defekt korrekt gemeldet ("FEHLT — 'gemma26-factory'
# wird von keinem lokalen Backend serviert"); es wurde nur von nirgendwo aufgerufen.
# Genau das pruefen die Tests unten.
#
# WIEDERHOLUNGSFALL: derselbe Defekt lag schon einmal vor (T002582, damals
# 'gemma-4-12b' — siehe Kommentar in route-provider.sh). Ohne einen Aufrufer des
# Guards ist die dritte Runde nur eine Frage der Zeit.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  WAKEUP="${REPO_ROOT}/scripts/factory/wakeup.sh"
  CHECK="${REPO_ROOT}/scripts/llm/routing-check.sh"
  ROUTE="${REPO_ROOT}/scripts/factory/route-provider.sh"
  REG_LOCAL="${REPO_ROOT}/scripts/factory/provider-register-local.sh"
}

@test "routing-check.sh existiert und ist syntaktisch valide" {
  # Positiv-Anker: ohne das Skript sind die folgenden Aussagen gegenstandslos.
  [ -f "$CHECK" ]
  run bash -n "$CHECK"
  [ "$status" -eq 0 ]
}

@test "wakeup.sh ruft den Routing-Guard pro Tick auf" {
  # Der eigentliche Regressionsfall: der Guard existierte, wurde aber nirgends
  # ausgefuehrt — weder in wakeup.sh noch in einem Workflow.
  run bash -c "grep -c 'routing-check\|routing:check' \"\$1\"" _ "$WAKEUP"
  [ "$status" -eq 0 ]
  [ "$output" -gt 0 ]
}

@test "der Routing-Guard bricht den Tick nicht ab (fail-soft)" {
  # Eine rote Routing-Pruefung ist ein Befund, kein Grund die Factory anzuhalten —
  # sonst legt ein nicht geladenes Loadout den gesamten Tick stumm still.
  # Geprueft wird die LOGISCHE Zeile des Aufrufs: Backslash-Fortsetzungen werden
  # zuvor zusammengefuegt. Ohne das schlaegt der Test bei einem ueber mehrere
  # Zeilen umbrochenen Aufruf falsch-negativ fehl — dieselbe Ueberlegung wie beim
  # Pod-Phase-Guard, der ebenfalls per logischer Zeile auswertet.
  line="$(sed -e ':a' -e '/\\$/{N;s/\\\n//;ta' -e '}' "$WAKEUP" \
          | grep 'routing-check' | grep -v '^[[:space:]]*#' | head -1)"
  [ -n "$line" ]                                     # Positiv-Anker
  [[ "$line" == *"||"* ]]
}

@test "alle FACTORY_MODEL_ID-Defaults nennen denselben Slug" {
  # Vier Stellen tragen denselben Wert. Laufen sie auseinander, routet ein Teil
  # der Factory woanders hin als der Rest — eine zweite Drift-Klasse, die offline
  # sehr wohl entscheidbar ist.
  mapfile -t vals < <(grep -rhoE '\$\{FACTORY_MODEL_ID:-[^}]*\}' \
      "$ROUTE" "$REG_LOCAL" | sed 's/.*:-//; s/}//' | sort -u)
  [ "${#vals[@]}" -ge 1 ]                            # Positiv-Anker
  [ "${#vals[@]}" -eq 1 ]
}
