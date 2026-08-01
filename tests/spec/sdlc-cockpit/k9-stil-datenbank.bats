#!/usr/bin/env bats

# k9-stil-datenbank.bats — K9 Stil-Datenbank als Gestaltungsquelle (T002468)
#
# Pruefmodus (Test-Resultats-Konvention T002448-M4): ERGEBNIS-basiert. Die Tests
# lesen die tatsaechlichen Datendateien mit jq aus und pruefen, WAS drinsteht;
# die Route wird per curl wirklich aufgerufen. Kein grep auf Implementierungs-
# Interna.
#
# Gegenstand ist D14: eine Komponente kommt nur mit drei Dingen ins Kit —
# Beleg-Ausschnitt, ausschliesslich Token-Bezuege, Verzeichniseintrag mit Zweck
# und Herkunft. Fehlt eines davon, bleibt sie im Projekt.
#
# Zur Token-Liste: der Plan nannte `--lv-*`/`--color-*`. Ein `--lv-*`-Praefix
# gibt es im Repo nicht — geprueft wird deshalb gegen die Namen, die
# .lavish/kit/tokens.css wirklich definiert. Ein Test gegen eine erfundene
# Namensfamilie haette entweder alles durchgelassen oder alles abgelehnt.

load daemon-helper

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  STYLES_DIR="$REPO/.lavish/styles"
  TOKENS_CSS="$REPO/.lavish/kit/tokens.css"

  command -v jq >/dev/null || skip "jq nicht verfuegbar"
}

# Alle Eintragsdateien — also alles ausser Schema, Index und README.
entry_files() {
  find "$STYLES_DIR" -maxdepth 1 -name '*.json' \
    ! -name 'schema.json' ! -name 'index.json' 2>/dev/null | sort
}

@test "T002468 Die Datenebene existiert mit Schema und mindestens zwei Eintraegen" {
  [ -d "$STYLES_DIR" ]
  [ -f "$STYLES_DIR/schema.json" ]

  local count
  count=$(entry_files | wc -l)
  [ "$count" -ge 2 ] || {
    echo "erwartet >= 2 Eintraege, gefunden: $count" >&2
    false
  }
}

@test "T002468 schema.json ist gueltiges JSON-Schema mit additionalProperties:false" {
  [ -f "$STYLES_DIR/schema.json" ]

  # POSITIV-ANKER: die Datei ist ueberhaupt parsebares JSON.
  run jq -e . "$STYLES_DIR/schema.json"
  [ "$status" -eq 0 ]

  # additionalProperties:false ist der Grund, warum das Schema ueberhaupt
  # etwas leistet — ohne das waere jede Zusatzeigenschaft erlaubt und das
  # Schema reine Dekoration.
  run jq -e '.additionalProperties == false' "$STYLES_DIR/schema.json"
  [ "$status" -eq 0 ]

  # Die von D14 geforderten Pflichtfelder.
  for field in id name zweck herkunft beleg_ausschnitt token_bezuege; do
    run jq -e --arg f "$field" '.required | index($f) != null' "$STYLES_DIR/schema.json"
    [ "$status" -eq 0 ] || {
      echo "Pflichtfeld fehlt in schema.json .required: $field" >&2
      false
    }
  done
}

@test "T002468 Jeder Eintrag traegt alle Pflichtfelder (D14 Regel 1 und 3)" {
  local checked=0
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    checked=$((checked + 1))

    run jq -e . "$f"
    [ "$status" -eq 0 ] || { echo "kein gueltiges JSON: $f" >&2; false; }

    for field in id name zweck herkunft beleg_ausschnitt token_bezuege; do
      run jq -e --arg f "$field" 'has($f) and (.[$f] != null) and (.[$f] != "")' "$f"
      [ "$status" -eq 0 ] || { echo "$(basename "$f"): Pflichtfeld fehlt oder leer: $field" >&2; false; }
    done

    # Herkunft ohne Projekt ist kein Herkunftsnachweis.
    run jq -e '.herkunft.projekt != null and .herkunft.projekt != ""' "$f"
    [ "$status" -eq 0 ] || { echo "$(basename "$f"): herkunft.projekt fehlt" >&2; false; }

    # Ein Eintrag ohne Token-Bezug kann nicht als Token-Beispiel dienen.
    run jq -e '(.token_bezuege | length) >= 1' "$f"
    [ "$status" -eq 0 ] || { echo "$(basename "$f"): token_bezuege leer" >&2; false; }
  done < <(entry_files)

  # POSITIV-ANKER: ohne ihn waere die Schleife bei leerem Verzeichnis
  # wortlos "bestanden" — die klassische vakuose Zusicherung.
  [ "$checked" -ge 2 ] || { echo "nur $checked Eintraege geprueft" >&2; false; }
}

@test "T002468 Jeder token_bezuege-Wert ist ein in tokens.css definiertes Token (E11)" {
  [ -f "$TOKENS_CSS" ]

  # POSITIV-ANKER: tokens.css definiert ueberhaupt Tokens. Waere die Datei leer
  # oder das Auslesen kaputt, wuerde unten jeder Bezug als "unbekannt" gelten
  # und der Test aus dem falschen Grund rot — bzw. bei umgekehrter Logik aus
  # dem falschen Grund gruen.
  local known
  known="$(grep -oE '^[[:space:]]*--[a-z0-9-]+' "$TOKENS_CSS" | tr -d ' ' | sort -u)"
  [ "$(echo "$known" | wc -l)" -ge 10 ]

  local checked=0
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    while IFS= read -r token; do
      [ -n "$token" ] || continue
      checked=$((checked + 1))
      echo "$known" | grep -qx -- "$token" || {
        echo "$(basename "$f"): '$token' ist in tokens.css nicht definiert" >&2
        false
      }
    done < <(jq -r '.token_bezuege[]' "$f")
  done < <(entry_files)

  [ "$checked" -ge 2 ] || { echo "nur $checked Token-Bezuege geprueft" >&2; false; }
}

@test "T002468 Kein Beleg-Ausschnitt enthaelt feste Farb- oder Groessenwerte (D14 Regel 2) [Negativtest + Positiv-Anker]" {
  # POSITIV-ANKER zuerst: es gibt Eintraege, und ihre Beleg-Ausschnitte
  # verwenden tatsaechlich var(--…). Ohne diese Zusicherung waere die
  # Negativ-Aussage unten bei leeren Ausschnitten trivial erfuellt.
  local anchored=0
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    if jq -r '.beleg_ausschnitt' "$f" | grep -q 'var(--'; then
      anchored=$((anchored + 1))
    fi
  done < <(entry_files)
  [ "$anchored" -ge 2 ] || { echo "nur $anchored Ausschnitte mit var(--…)" >&2; false; }

  # NEGATIVTEST: keine Hex-Farbe und keine feste Groessenangabe. Genau daran
  # scheitert z.B. `.panel--rail { max-height: 2.5rem }` — ein Ausschnitt, der
  # sich als Beleg anbietet, aber E11 bricht.
  local offenders=""
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    local snippet
    snippet="$(jq -r '.beleg_ausschnitt' "$f")"
    if echo "$snippet" | grep -qE '#[0-9a-fA-F]{3,8}\b'; then
      offenders="${offenders} $(basename "$f"):hex"
    fi
    # Feste Groessen — aber nur ausserhalb von var()-Fallbacks gibt es sie hier
    # ohnehin nicht; jede Zahl mit CSS-Einheit ist ein Verstoss.
    if echo "$snippet" | grep -qE '[0-9]+(\.[0-9]+)?(px|pt|em|rem)\b'; then
      offenders="${offenders} $(basename "$f"):size"
    fi
  done < <(entry_files)

  [ -z "$offenders" ] || {
    echo "Beleg-Ausschnitte mit festen Werten:${offenders}" >&2
    false
  }
}

@test "T002468 index.json listet jeden Eintrag mit Zweck und Herkunft (D14 Regel 3)" {
  [ -f "$STYLES_DIR/index.json" ]

  local file_count index_count
  file_count=$(entry_files | wc -l)
  index_count=$(jq -r '.entries | length' "$STYLES_DIR/index.json")

  # POSITIV-ANKER: der Index ist nicht leer.
  [ "$index_count" -ge 2 ]
  # Jede Datei erscheint im Index und umgekehrt — ein Verzeichnis, das
  # Eintraege auslaesst, fuehrt die Modelle an ihnen vorbei.
  [ "$index_count" -eq "$file_count" ] || {
    echo "index.json listet $index_count, Verzeichnis hat $file_count Eintraege" >&2
    false
  }

  while IFS= read -r f; do
    [ -n "$f" ] || continue
    local id
    id="$(jq -r '.id' "$f")"
    run jq -e --arg id "$id" '.entries[] | select(.id == $id) | (.zweck != null and .zweck != "") and (.herkunft.projekt != null)' "$STYLES_DIR/index.json"
    [ "$status" -eq 0 ] || {
      echo "index.json: Eintrag '$id' fehlt oder ohne Zweck/Herkunft" >&2
      false
    }
  done < <(entry_files)
}

@test "T002468 README dokumentiert die drei D14-Beitragsregeln" {
  [ -f "$STYLES_DIR/README.md" ]

  # Die drei Regeln muessen ausdruecklich dastehen — der Beitragspfad ist der
  # eigentliche Gegenstand von K9, nicht die zwei Beispieldateien.
  grep -qi 'beleg' "$STYLES_DIR/README.md"
  grep -qi 'token' "$STYLES_DIR/README.md"
  grep -qiE 'herkunft|verzeichnis' "$STYLES_DIR/README.md"
}

@test "T002468 GET /api/cockpit/styles liefert entries und fetchedAt (D12/D13)" {
  require_daemon || return 1

  run curl -s "${BASE}/api/cockpit/styles"
  [ "$status" -eq 0 ]

  # D12: jede Antwort traegt fetchedAt.
  echo "$output" | grep -q "fetchedAt"

  # D13: entweder Nutzdaten oder ein benannter Fehler — nie stumm nichts.
  if echo "$output" | grep -q '"error"'; then
    :
  else
    echo "$output" | grep -q '"entries"'
  fi
}

@test "T002468 Der Styles-Zugriff laeuft ueber den Adapter, nicht per direktem fetch (E1)" {
  local kit="$REPO/.lavish/kit"

  # POSITIV-ANKER: der Adapter stellt styles() bereit. Fehlt die Methode, ist
  # die Aussage "kein Panel ruft fetch" wertlos.
  grep -q 'styles' "$kit/adapter.js"

  # GEGENPROBE: adapter.js DARF fetch( enthalten — er ist die eine Stelle dafuer.
  # Kommentarzeilen zaehlen nicht mit, sonst wuerde die Erklaerung, WARUM hier
  # kein fetch steht, den Guard ausloesen.
  local adapter_calls
  adapter_calls=$(grep -v '^[[:space:]]*//' "$kit/adapter.js" | grep -c 'fetch(' || true)
  [ "$adapter_calls" -gt 0 ]

  local panel_calls
  panel_calls=$(grep -v '^[[:space:]]*//' "$kit/panel.js" | grep -c 'fetch(' || true)
  [ "$panel_calls" -eq 0 ]
}
