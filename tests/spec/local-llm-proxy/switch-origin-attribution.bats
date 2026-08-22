#!/usr/bin/env bats
# T013894 (Mishap-Rollup-Eintrag aus T013328 #5) — Attribution der [switch]-Zeilen.
#
# Pruefmodus: Output-Verifikation [T002448-M4]. Die Tests fuehren das Modul
# scripts/llm-proxy/switch-origin.mjs AUS und pruefen dessen Rueckgabe; sie
# greppen nicht die Quelle. Der Defekt, den sie einfangen: ein Loadout-Wechsel
# hinterliess im Journal nur den Ziel-Slug ("[switch] starte qwen38-220k"),
# aber nicht, WER ihn ausgeloest hat. Bei der Incident-Analyse T013527 war die
# Client-Zuordnung deshalb nur indirekt ueber den Request-Mitschnitt moeglich —
# und genau der fehlte in dem Fenster (llm_proxy_request_log-Blind-Spot).

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  MOD="${REPO_ROOT}/scripts/llm-proxy/switch-origin.mjs"
}

# Ruft eine Exportfunktion des Moduls mit JSON-Argumenten auf und gibt das
# Ergebnis auf stdout aus.
_call() {
  local fn="$1"; shift
  node --input-type=module -e "
    const m = await import('file://${MOD}');
    const args = JSON.parse(process.argv[1]);
    process.stdout.write(String(m['${fn}'](...args)));
  " "$1"
}

@test "T013894: das Attributions-Modul existiert und laedt" {
  # Positiv-Anker [T002356-M1]: ohne ihn liefen die folgenden Aussagen ueber
  # einem fehlenden Modul ins Leere.
  [ -f "$MOD" ]
  run node --input-type=module -e "await import('file://${MOD}')"
  [ "$status" -eq 0 ]
}

@test "T013894: switchOrigin nennt angefordertes Modell, Client und Dispatch-Ticket" {
  run _call switchOrigin '[{"user-agent":"opencode/1.4","x-dispatch-ticket":"T013527"},"qwen38-220k"]'
  [ "$status" -eq 0 ]
  echo "$output" | grep -qF -e 'qwen38-220k'
  echo "$output" | grep -qF -e 'opencode/1.4'
  echo "$output" | grep -qF -e 'T013527'
}

@test "T013894: switchOrigin bleibt ohne Header auswertbar statt leer" {
  # Eine leere Zeichenkette waere im Journal von "kein Client" nicht zu
  # unterscheiden — der Blind Spot, um den es geht.
  run _call switchOrigin '[{},null]'
  [ "$status" -eq 0 ]
  [ -n "$output" ]
  echo "$output" | grep -qF -e 'unbekannt'
}

@test "T013894: formatSwitchLine haengt die Attribution an die Ereigniszeile" {
  run _call formatSwitchLine '["starte qwen38-220k","model=qwen38-220k client=opencode/1.4"]'
  [ "$status" -eq 0 ]
  echo "$output" | grep -qF -e 'starte qwen38-220k'
  echo "$output" | grep -qF -e 'opencode/1.4'
}

@test "T013894: formatSwitchLine ohne Attribution gibt die Ereigniszeile unveraendert zurueck" {
  run _call formatSwitchLine '["starte qwen38-220k",""]'
  [ "$status" -eq 0 ]
  [ "$output" = "starte qwen38-220k" ]
}

@test "T013540: switchOrigin nennt die Remote-Adresse des Aufrufers" {
  # Der Proxy bindet 127.0.0.1, aber die Adresse trennt die Loopback-Clients
  # nicht — sie belegt, DASS der Aufruf lokal kam. Bei der Attribution von
  # Incident T013527 wurden opencode/agy/factory/codex nur manuell
  # ausgeschlossen, weil die Zeile keinen einzigen Herkunftshinweis trug.
  run _call switchOrigin '[{"user-agent":"opencode/1.4"},"qwen38-220k","127.0.0.1"]'
  [ "$status" -eq 0 ]
  echo "$output" | grep -qF -e '127.0.0.1'
  echo "$output" | grep -qF -e 'opencode/1.4'
}

@test "T013540: switchOrigin weist eine fehlende Remote-Adresse aus statt sie wegzulassen" {
  run _call switchOrigin '[{"user-agent":"opencode/1.4"},"qwen38-220k",null]'
  [ "$status" -eq 0 ]
  echo "$output" | grep -qF -e 'addr=unbekannt'
}
