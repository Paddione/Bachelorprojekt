#!/usr/bin/env bats
# T002553 — Format-Guard fuer scripts/llm/loadouts.json.
#
# Pruefmodus: command output verification [T002448-M4]. Jeder Test FUEHRT
# scripts/llm/loadouts-format.mjs aus und prueft $status und $output — kein
# grep auf die Quelldatei. Ein Guard, dessen Existenz nur im Quelltext belegt
# ist, sagt nichts darueber, ob er den Drift auch findet.
#
# Auswahl in CI: scripts/find-changed-tests.sh greppt geaenderte Dateipfade in
# den .bats-Dateien — ein Test wird dadurch relevant, dass er den Pfad ERWAEHNT.
# Deshalb stehen hier beide bewusst woertlich: scripts/llm/loadouts.json (die
# geschuetzte Datei) und scripts/llm-proxy/loadouts.mjs (wo serializeLoadouts
# die kanonische Form definiert). Ohne die zweite Erwaehnung liefe der Guard
# nicht, wenn jemand genau diese Definition aendert.
#
# Hintergrund: loadouts.json wurde wiederholt mit fremden JSON-Werkzeugen
# umgeschrieben (#3640, #3617, #3613, #3569). Pythons json.dumps escaped
# Nicht-ASCII (ensure_ascii=True ist Default) und schreibt keinen abschliessenden
# Zeilenumbruch; beide Abweichungen normalisieren beim naechsten regulaeren
# Schreibvorgang die ganze Datei zurueck und erzeugen einen Vollzeilen-Diff.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  GUARD="${REPO_ROOT}/scripts/llm/loadouts-format.mjs"
  TMP="$(mktemp -d)"
  COPY="${TMP}/loadouts.json"
  cp "${REPO_ROOT}/scripts/llm/loadouts.json" "${COPY}"
}

teardown() {
  rm -rf "${TMP}"
}

@test "T002553: die ausgelieferte loadouts.json ist kanonisch" {
  cd "${REPO_ROOT}"
  run node "${GUARD}" --check
  [ "${status}" -eq 0 ]
  [[ "${output}" == *"ist kanonisch"* ]]
}

@test "T002553: escapte Nicht-ASCII-Zeichen werden erkannt und benannt" {
  # Positiv-Anker zuerst [T002356-M1]: die unveraenderte Kopie laeuft durch.
  # Ohne ihn koennte der Test auch bei einem Guard bestehen, der immer meckert.
  run node "${GUARD}" --check "${COPY}"
  [ "${status}" -eq 0 ]

  # Genau der Effekt von json.dumps(ensure_ascii=True).
  python3 -c "
import json, sys
p = sys.argv[1]
with open(p) as f: doc = json.load(f)
with open(p, 'w') as f: json.dump(doc, f, indent=2)
" "${COPY}"

  run node "${GUARD}" --check "${COPY}"
  [ "${status}" -eq 1 ]
  [[ "${output}" == *"ensure_ascii"* ]]
}

@test "T002553: fehlender abschliessender Zeilenumbruch wird erkannt" {
  run node "${GUARD}" --check "${COPY}"
  [ "${status}" -eq 0 ]

  printf '%s' "$(cat "${COPY}")" > "${COPY}.tmp" && mv "${COPY}.tmp" "${COPY}"

  run node "${GUARD}" --check "${COPY}"
  [ "${status}" -eq 1 ]
  [[ "${output}" == *"Zeilenumbruch"* ]]
}

@test "T002553: der Guard nennt die Reparaturanweisung, nicht nur den Befund" {
  printf '%s' "$(cat "${COPY}")" > "${COPY}.tmp" && mv "${COPY}.tmp" "${COPY}"
  run node "${GUARD}" --check "${COPY}"
  [ "${status}" -eq 1 ]
  # Ein Guard ohne Handlungsanweisung verlagert die Suche auf den Leser.
  [[ "${output}" == *"task llm:loadouts:format"* ]]
}

@test "T002553: --write stellt die kanonische Form her" {
  python3 -c "
import json, sys
p = sys.argv[1]
with open(p) as f: doc = json.load(f)
with open(p, 'w') as f: json.dump(doc, f, indent=2)
" "${COPY}"
  run node "${GUARD}" --check "${COPY}"
  [ "${status}" -eq 1 ]

  run node "${GUARD}" --write "${COPY}"
  [ "${status}" -eq 0 ]

  run node "${GUARD}" --check "${COPY}"
  [ "${status}" -eq 0 ]
}

@test "T002553: --write erhaelt den Inhalt, es normalisiert nur die Form" {
  local before after
  before="$(node -e 'console.log(JSON.stringify(JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8"))))' "${COPY}")"
  python3 -c "
import json, sys
p = sys.argv[1]
with open(p) as f: doc = json.load(f)
with open(p, 'w') as f: json.dump(doc, f, indent=2)
" "${COPY}"
  run node "${GUARD}" --write "${COPY}"
  [ "${status}" -eq 0 ]
  after="$(node -e 'console.log(JSON.stringify(JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8"))))' "${COPY}")"
  [ "${before}" = "${after}" ]
}

@test "T002553: ein kaputtes Dokument meldet Lesefehler statt Formatfehler" {
  # Die Unterscheidung ist nicht kosmetisch: --write koennte hier nichts
  # reparieren, also darf die Meldung auch nicht dorthin verweisen.
  echo '{ kaputt' > "${COPY}"
  run node "${GUARD}" --check "${COPY}"
  [ "${status}" -eq 2 ]
  [[ "${output}" != *"task llm:loadouts:format"* ]]
}
