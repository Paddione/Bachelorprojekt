#!/usr/bin/env bats
# tests/spec/local-llm-proxy/loadout-enabled-flag.bats [T003204]
# SSOT: openspec/specs/local-llm-proxy.md
#
# PRUEFMODUS (Test-Resultats-Konvention T002448-M4): ERGEBNIS-basiert. Die Tests
# rufen parseLoadouts und isLoadoutEnabled AUF und bewerten deren Rueckgabe —
# dieselben Funktionen, die der Proxy vor jedem Start befragt. Ein grep auf das
# Feld in der JSON-Datei belegte nur, dass dort Text steht; ob der Start dadurch
# tatsaechlich abgelehnt wird, sagt allein die Funktion.
#
# WAS HIER GESICHERT WIRD
# Ohne ein enabled-Feld laesst sich ein Loadout nur LOESCHEN, nicht abschalten —
# LOADOUT_KEYS ist fail-closed gegen unbekannte Felder. Genau deshalb bleiben
# dominierte Loadouts stehen: Loeschen naehme die gemessenen notes mit, und
# niemand wirft die Begruendung weg. Das Flag trennt "abgeschaltet" von "geloescht".
#
# ACHTUNG, NAMENSGLEICHHEIT: `fit.enabled` existiert bereits und bedeutet etwas
# voellig anderes (llama.cpp --fit, also automatische Kontext-/Layer-Anpassung).
# Das hier ist das TOP-LEVEL-Feld `enabled`. Die beiden duerfen nicht
# durcheinandergeraten — deshalb setzt jedes Fixture unten fit.enabled
# ausdruecklich und unabhaengig vom geprueften Wert.
#
# POSITIV-ANKER (T002356-M1): Jeder @test prueft ZUERST, dass das unveraenderte
# Fixture OHNE das Feld durch parseLoadouts laeuft. Ohne diesen Anker waere ein
# Fehlschlag nicht von "Fixture kaputt" oder "Modul nicht ladbar" zu
# unterscheiden — die Aussage bestuende dann vakuos.
#
# KEINE EXTERNE ABHAENGIGKEIT: parseLoadouts liest einen String — kein
# Dateisystem, kein Netz, kein laufender Proxy. Der Test laeuft in CI regulaer
# und braucht keinen Skip-Guard.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  export REPO_ROOT
}

# Baut ein minimal gueltiges Dokument. $1 wird als zusaetzliche Felder in den
# Loadout-Eintrag gespleisst (leer = Basisfall ohne enabled).
_fixture() {
  cat <<JSON
{
  "version": 1,
  "modelRoots": ["~/models/gguf"],
  "defaults": { "host": "0.0.0.0" },
  "loadouts": [{
    "slug": "probe-loadout",
    "label": "Probe",
    "model": "probe/probe.gguf",
    "port": 8099,
    "fit": { "enabled": true, "targetMarginMib": 2400, "minCtx": 32768 }${1:+,}
    ${1}
  }]
}
JSON
}

# Laeuft parseLoadouts gegen das Fixture. Exit 0 = akzeptiert.
_parse() {
  printf '%s' "$1" | node --input-type=module -e "
    import { parseLoadouts } from '${REPO_ROOT}/scripts/llm-proxy/loadouts.mjs';
    let raw = '';
    process.stdin.on('data', (c) => { raw += c; });
    process.stdin.on('end', () => {
      try { parseLoadouts(raw); process.exit(0); }
      catch (e) { console.error(e.message); process.exit(1); }
    });
  "
}

@test "T003204: parseLoadouts akzeptiert ein Loadout mit enabled=false" {
  # Positiv-Anker zuerst: das Fixture OHNE das Feld muss durchlaufen.
  run _parse "$(_fixture '')"
  [ "$status" -eq 0 ]

  run _parse "$(_fixture '"enabled": false')"
  [ "$status" -eq 0 ]
}

@test "T003204: isLoadoutEnabled liefert false fuer ein abgeschaltetes Loadout" {
  # Positiv-Anker: Basis-Fixture parst, das Modul ist also ladbar und das
  # Dokument gueltig. Erst danach hat die Messung unten Aussagewert.
  run _parse "$(_fixture '')"
  [ "$status" -eq 0 ]

  FIXTURE="$(_fixture '"enabled": false')" run node --input-type=module -e "
    import { parseLoadouts, isLoadoutEnabled, findLoadout } from '${REPO_ROOT}/scripts/llm-proxy/loadouts.mjs';
    const doc = parseLoadouts(process.env.FIXTURE);
    process.stdout.write(String(isLoadoutEnabled(findLoadout(doc, 'probe-loadout'))));
  "
  [ "$status" -eq 0 ]
  [ "$output" = "false" ]
}

@test "T003204: fehlendes enabled bedeutet aktiv (Rueckwaertskompatibilitaet)" {
  # Das ist die Zusicherung, an der alle bestehenden Eintraege haengen — sie
  # tragen das Feld nicht und muessen sich verhalten wie zuvor. Wichtiger als
  # der Negativfall und deshalb ein eigener @test, nicht implizit mitlaufend.
  FIXTURE="$(_fixture '')" run node --input-type=module -e "
    import { parseLoadouts, isLoadoutEnabled, findLoadout } from '${REPO_ROOT}/scripts/llm-proxy/loadouts.mjs';
    const doc = parseLoadouts(process.env.FIXTURE);
    process.stdout.write(String(isLoadoutEnabled(findLoadout(doc, 'probe-loadout'))));
  "
  [ "$status" -eq 0 ]
  [ "$output" = "true" ]
}

@test "T003204: enabled als String laesst parseLoadouts scheitern" {
  # Positiv-Anker: der gueltige Fall laeuft durch.
  run _parse "$(_fixture '"enabled": true')"
  [ "$status" -eq 0 ]

  # "false" als String waere truthy — das Loadout stuende als abgeschaltet in der
  # Datei und liefe trotzdem. Das ist der schlimmste Ausgang, weil er wie Erfolg
  # aussieht. Geprueft wird der Exit-Status (Semantik), nicht der Wortlaut der
  # Meldung (T002716).
  run _parse "$(_fixture '"enabled": "false"')"
  [ "$status" -ne 0 ]
}
