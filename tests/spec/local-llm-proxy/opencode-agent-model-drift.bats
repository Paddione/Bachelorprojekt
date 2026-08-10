#!/usr/bin/env bats
# T002545 — .opencode/agent-models.jsonc muss dasselbe Modell nennen, das
# geladen ist, und dieselbe Slot-Struktur wie das Loadout fahren.
#
# Pruefmodus: Querschnitts-Konsistenz zweier Konfigurationsdateien. Das Ergebnis
# manifestiert sich ausschliesslich im Quelltext (welches Modell steht in welcher
# Datei), deshalb ist grep/jq hier das angemessene Mittel — die dokumentierte
# Ausnahme in [T002448-M4]. Ein Laufzeittest gegen :8091 waere in CI nicht
# ausfuehrbar, dort laeuft kein llama-server.
#
# Befund 2026-08-02, der zu diesen Tests fuehrte:
#   .opencode/agent-models.jsonc  → "llamacpp-mtp/gemma-4-12B-it-qat-UD-Q4_K_XL.gguf"
#   /props auf :8091              → gemma-4-26B-A4B-it-qat-UD-Q4_K_XL.gguf, n_ctx=99840
#   Beschreibung verspricht         262144 Token — Faktor 2,6 ueber dem realen Wert.
#
# Betreibervorgabe: alle lokalen LLM-Jobs laufen auf gemma26-factory, und dieses
# Loadout soll unified context (-kvu) fuer DREI Agenten fahren.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  AGENTS="${REPO_ROOT}/.opencode/agent-models.jsonc"
  LOADOUTS="${REPO_ROOT}/scripts/llm/loadouts.json"
}

@test "T002545: gemma26-factory faehrt drei Slots mit unified context" {
  # Positiv-Anker zuerst [T002356-M1]: das Loadout existiert ueberhaupt.
  run jq -e '.loadouts[] | select(.slug=="gemma26-factory")' "${LOADOUTS}"
  [ "${status}" -eq 0 ]

  run jq -r '.loadouts[] | select(.slug=="gemma26-factory") | .args.parallel' "${LOADOUTS}"
  [ "${output}" = "3" ]

  # -kvu macht den Kontext zu einem GEMEINSAMEN Pool ueber alle Slots. Ohne das
  # Flag teilt llama.cpp ctx/parallel je Slot auf — genau die Konstellation, die
  # bei den bge-Servern die 2048-Token-Grenze erzeugt (T002546).
  run jq -r '.loadouts[] | select(.slug=="gemma26-factory") | .extraArgs | index("-kvu")' "${LOADOUTS}"
  [ "${output}" != "null" ]
}

@test "T002545: minCtx bleibt 32768 — mit -kvu waere eine Erhoehung wirkungslos" {
  # Mit -kvu und drei Slots: jeder Slot sieht den vollen Kontext (nicht ein
  # Drittel). Die Sequenzen konkurrieren um denselben Speicher, statt starr
  # zugeteilte Scheiben zu bekommen. Eine Erhöhung von minCtx ist nicht nötig:
  # gemessen liefert -kvu bei unverändertem ctx den vollen Kontext je Slot.
  # fit.minCtx bleibt bei 32768 — der Wert bestimmt die UNTERgrenze, die --fit
  # nicht unterschreiten darf, und ist für drei Slots mit unified context
  # ausreichend bemessen.
  run jq -r '.loadouts[] | select(.slug=="gemma26-factory") | .fit.minCtx' "${LOADOUTS}"
  [ "${status}" -eq 0 ]
  [ "${output}" -eq 32768 ]
}

@test "T002545: die Agentendefinitionen nennen kein 12B-Modell mehr" {
  # Positiv-Anker: die Datei existiert und enthaelt ueberhaupt Agentendefinitionen.
  [ -f "${AGENTS}" ]
  run grep -c '"description"' "${AGENTS}"
  [ "${status}" -eq 0 ]
  [ "${output}" -gt 0 ]

  # Negativ-Aussage erst danach. Ohne den Anker oben bestuende dieser Test auch
  # bei einer leeren oder fehlenden Datei.
  #
  # Geprueft werden die AKTIVEN "model"-Verweise, nicht jedes Textvorkommen:
  # der lmstudio-Provider fuehrt legitim Modelle mit 12b im Namen, und
  # historische Kommentare duerfen den alten Namen weiter nennen. Ein
  # unqualifiziertes grep ueber die ganze Datei wuerde beides als Fehler
  # melden — genau die Falle, vor der die $output-Konvention warnt.
  run bash -c "grep -oE '\"model\": \"[^\"]*\"' '${AGENTS}' | grep -ciE 'gemma-4-12[bB]' || true"
  [ "${output}" = "0" ]
}

@test "T002545: die Agentendefinitionen verweisen auf gemma26-factory" {
  run grep -c 'gemma26-factory' "${AGENTS}"
  [ "${status}" -eq 0 ]
  [ "${output}" -gt 0 ]
}

@test "T002545: keine handgepflegte Kontextzahl widerspricht dem Loadout" {
  # Die Zusicherung ist "keine handgepflegte Zahl WIDERSPRICHT dem Loadout" —
  # geprueft wird sie als Abgleich gegen loadouts.json, nicht als Schwarze
  # Liste eines Integers.
  #
  # [T003065] Vorher stand hier `grep -c '262144'` mit der Erwartung 0: 262144
  # war der Wert des abgeloesten 12B-Servers und stand fuer die Drift-Klasse,
  # die T002300 fuer die MCP-Configs geloest hat. Inzwischen MISST das Loadout
  # gemma12-vision genau diesen Wert ("Gemessen: 262.144 Kontext" in
  # loadouts.json), und der Guard meldete einen Defekt, den es nicht gibt —
  # Darstellung statt Semantik [T002716]. Eine Zahl ist nicht falsch, weil sie
  # frueher falsch war; falsch ist sie, wenn die SSOT sie nicht deckt.
  [ -f "${AGENTS}" ]
  [ -f "${LOADOUTS}" ]

  # Nur limit.context-Werte, deren Eintrag ein "Loadout <slug>" nennt, sind an
  # loadouts.json gebunden. API-Modelle (deepseek u.a.) tragen legitim Kontexte,
  # die dort nicht vorkommen, und bleiben ausgeklammert.
  run bash -c "grep -A3 '\"name\": \".*Loadout ' '${AGENTS}' | grep -oE '\"context\": [0-9]+' | grep -oE '[0-9]+' | sort -u"
  [ "${status}" -eq 0 ]
  # Positiv-Anker zuerst [T002356-M1]: ohne mindestens einen Kandidaten wuerde
  # die Negativ-Aussage unten vakuos gelten.
  [ -n "${output}" ]

  local unbacked=0 n dotted
  for n in ${output}; do
    # loadouts.json notiert die Messwerte mit deutschem Tausenderpunkt
    # ("Gemessen: 262.144 Kontext"), deshalb beide Schreibweisen akzeptieren.
    dotted="$(printf '%s' "${n}" | sed ':a;s/\B[0-9]\{3\}\>/.&/;ta')"
    if ! grep -qF "${n}" "${LOADOUTS}" && ! grep -qF "${dotted}" "${LOADOUTS}"; then
      echo "FAIL: limit.context ${n} (auch nicht als ${dotted}) ist in loadouts.json nicht belegt"
      unbacked=$((unbacked + 1))
    fi
  done
  [ "${unbacked}" -eq 0 ]
}

@test "T002545: der Providername behauptet kein Draft-Modell, das nicht laedt" {
  # gemma26-factory hat bewusst KEIN Draft-Modell — mtp-gemma-4-26B-A4B-it.gguf
  # laesst sich unter b10223 nicht laden (vector::_M_range_check) und bricht den
  # Serverstart ab. Ein Provider namens "llamacpp-mtp" verspricht das Gegenteil.
  [ -f "${AGENTS}" ]
  run jq -r '.loadouts[] | select(.slug=="gemma26-factory") | .speculative.draftModelPath // "null"' "${LOADOUTS}"
  [ "${output}" = "null" ]

  run bash -c "grep -oE '\"model\": \"[^\"]*\"' '${AGENTS}' | grep -c 'llamacpp-mtp' || true"
  [ "${output}" = "0" ]
}

@test "T002545: loadouts.json bleibt in der kanonischen Form" {
  # Guard aus T002554/#3643: jede Aenderung an der Datei muss die kanonische
  # Serialisierung behalten, sonst erzeugt der naechste regulaere Schreibvorgang
  # einen Vollzeilen-Diff.
  run node "${REPO_ROOT}/scripts/llm/loadouts-format.mjs" --check "${LOADOUTS}"
  [ "${status}" -eq 0 ]
}

@test "T003204: kein Agent zeigt auf ein abgeschaltetes Loadout" {
  # Ohne diese Zusicherung bliebe die Abschaltung halb sichtbar: loadouts.json
  # lehnt den Start ab, aber ein Agent verwiese weiter auf den toten Slug und
  # liefe erst zur Laufzeit in die Ablehnung — also genau dann, wenn jemand
  # arbeiten will.
  [ -f "${AGENTS}" ]
  [ -f "${LOADOUTS}" ]

  # Positiv-Anker 1 [T002356-M1]: es gibt ueberhaupt Agent-Modellzuweisungen auf
  # llamacpp-local/. Greift der Parser ins Leere (Pfad umbenannt, Format
  # geaendert), waere die Negativ-Aussage unten trivial erfuellt.
  run bash -c "grep -oE '\"model\": \"llamacpp-local/[a-z0-9-]+\"' '${AGENTS}' | grep -oE 'llamacpp-local/[a-z0-9-]+' | cut -d/ -f2 | sort -u"
  [ "${status}" -eq 0 ]
  [ -n "${output}" ]
  local referenced="${output}"

  # Positiv-Anker 2: loadouts.json wird gelesen UND enthaelt tatsaechlich
  # abgeschaltete Eintraege. Ohne diesen Anker bestuende der Test auch dann,
  # wenn das enabled-Feld gar nicht mehr ausgewertet wird.
  run jq -r '[.loadouts[] | select(.enabled == false)] | length' "${LOADOUTS}"
  [ "${status}" -eq 0 ]
  [ "${output}" -gt 0 ]

  local offenders=0 slug
  for slug in ${referenced}; do
    # NICHT '.enabled // true' verwenden: der jq-Operator '//' greift nicht nur
    # bei null, sondern auch bei FALSE — beides gilt ihm als leer. Der Ausdruck
    # lieferte damit ausgerechnet fuer abgeschaltete Loadouts 'true', und dieser
    # Guard bestuende vakuos. Beim Gegentest (Agent absichtlich auf ein
    # abgeschaltetes Loadout gezeigt) blieb er gruen.
    run jq -r --arg s "${slug}" \
      '.loadouts[] | select(.slug == $s) | if has("enabled") then .enabled else true end' "${LOADOUTS}"
    if [ "${output}" = "false" ]; then
      # Meldung nennt Loadout UND Agent — "drift" allein zwingt zum Suchen.
      echo "FAIL: Loadout '${slug}' ist abgeschaltet, wird aber referenziert von:"
      grep -B12 "\"model\": \"llamacpp-local/${slug}\"" "${AGENTS}" \
        | grep -oE '^    "[a-z0-9-]+": \{' | tail -1
      offenders=$((offenders + 1))
    fi
  done
  [ "${offenders}" -eq 0 ]
}

@test "T003204: jeder Familien-Subagent steht in der Permission-Liste des Orchestrators" {
  # Ein Subagent ohne Eintrag existiert, ist aber nicht dispatchbar — er faellt
  # nicht auf, weil nichts bricht: der Orchestrator ruft ihn schlicht nie.
  [ -f "${AGENTS}" ]

  # Positiv-Anker: die Permission-Liste wird gefunden und ist nicht leer.
  run bash -c "sed -n '/\"task\": {/,/}/p' '${AGENTS}' | grep -oE '\"[a-z0-9-]+\": \"allow\"' | grep -oE '\"[a-z0-9-]+\"' | tr -d '\"' | sort -u"
  [ "${status}" -eq 0 ]
  [ -n "${output}" ]
  local allowed="${output}"

  # Familien-Subagenten sind die mode=subagent-Eintraege auf llamacpp-local/.
  run bash -c "grep -B4 '\"model\": \"llamacpp-local/' '${AGENTS}' | grep -oE '^    \"[a-z0-9-]+\": \{' | grep -oE '\"[a-z0-9-]+\"' | tr -d '\"' | sort -u"
  [ "${status}" -eq 0 ]
  [ -n "${output}" ]

  local missing=0 agent
  for agent in ${output}; do
    # Nur Subagenten pruefen; Primaries sind per Tab waehlbar und brauchen
    # keinen task-Eintrag.
    grep -A3 "^    \"${agent}\": {" "${AGENTS}" | grep -q '"mode": "subagent"' || continue
    printf '%s\n' "${allowed}" | grep -qx "${agent}" || {
      echo "FAIL: Subagent '${agent}' fehlt in der task-Permission-Liste des Orchestrators"
      missing=$((missing + 1))
    }
  done
  [ "${missing}" -eq 0 ]
}
