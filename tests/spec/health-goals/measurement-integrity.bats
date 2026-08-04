#!/usr/bin/env bats
#
# T002648 — eine Health-Goal-Messung, die nicht messen kann, muss das melden.
#
# Pruefmodus: Output-Verifikation [T002448-M4]. Jeder Test fuehrt die Messung
# tatsaechlich aus und prueft ihren Wert bzw. Exit-Status; kein Grep auf
# Implementierungsmuster im Quelltext.
#
# Warum ueberhaupt: alle drei hier gepruefte Messungen fielen still aus, und der
# stille Ausfall sah im Report wie ein Ergebnis aus. Das ist die Wiederholung von
# T002583 (G-LLM01 mass nie, G-LLM02 meldete vakuos gruen). Belegte Symptome auf
# main @600863701:
#   G-IF01  — liest 'servers' aus mcp.yaml, das nur noch 'clients'/'cluster'
#             fuehrt; Kandidatenmenge immer leer. Der Abbruchpfad
#             "print('-'); exit(0)" wirft SystemExit, das nachfolgende bare
#             "except:" faengt es und druckt ein ZWEITES '-'. Wert wird "-\n-",
#             row() bricht mit "integer expression expected" und zaehlt das Ziel
#             als offen statt als uebersprungen.
#   G-DEP01 — GATE. Parst "pnpm audit --json" zeilenweise als JSON-Lines; pnpm
#             liefert ein pretty-printed Einzelobjekt mit advisories-Map.
#             AttributeError -> "|| echo '-'" -> n/a. Das Gate prueft nichts.
#   G-DEP02 — "pnpm outdated" endet MIT gefundenen Paketen als Exit 1; unter
#             "set -o pipefail" haengt "|| echo '-'" ein zweites Token an,
#             nachdem der korrekte Wert bereits gedruckt wurde. Der Fehler tritt
#             also genau im Erfolgsfall auf.
#
# Die DEP-Tests fahren die Parser ueber ausgelagerte, per stdin fuetterbare
# Helfer statt ueber einen echten pnpm-Lauf: ein Lauf kostet bis zu 180s Timeout
# und braucht node_modules, das der CI-Job nicht hat. Genau deshalb blieben beide
# Defekte so lange unentdeckt — sie waren nur im Vollauf sichtbar.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  cd "$REPO_ROOT" || return 1
  SCRIPT="$REPO_ROOT/scripts/health-goals-check.sh"
  VALUES="$BATS_TEST_TMPDIR/values.txt"
}

# Misst ein einzelnes Ziel und gibt dessen Rohwert aus der Werte-Datei zurueck.
# HG_VALUES_FILE ist die maschinenlesbare Ausgabe des Checkers ("<id> <wert>
# <cmp> <target>") — damit haengt der Test nicht am Layout des Ampel-Reports.
measure_value() {
  local goal="$1"
  : > "$VALUES"
  HG_VALUES_FILE="$VALUES" bash "$SCRIPT" --fast --only="$goal" >/dev/null 2>&1 || true
  awk -v g="$goal" '$1 == g { print $2 }' "$VALUES"
}

@test "G-IF01 liefert eine einzelne Ganzzahl, kein mehrzeiliges Token (T002648)" {
  local val
  val="$(measure_value G-IF01)"

  # Positiv-Anker [T002356-M1]: ohne ihn bestuende der Test vakuos, sobald
  # G-IF01 aus dem Checker verschwindet oder als SKIP durchfaellt — eine leere
  # Variable erfuellt keine Regex-Negation, aber auch keine Aussage.
  [ -n "$val" ] || {
    echo "FAIL: G-IF01 hat keinen Wert in HG_VALUES_FILE geschrieben."
    echo "      Entweder existiert das Ziel nicht mehr, oder es faellt als"
    echo "      'nicht messbar' durch — beides macht diesen Test blind."
    return 1
  }

  [[ "$val" =~ ^[0-9]+$ ]] || {
    echo "FAIL: G-IF01 lieferte '${val}' statt einer Ganzzahl."
    echo "      Mehrzeilig? Dann faengt ein bare 'except:' das SystemExit des"
    echo "      eigenen Abbruchpfads und druckt ein zweites Token; row() bricht"
    echo "      danach mit 'integer expression expected'."
    return 1
  }
}

@test "G-IF01 zaehlt die http-Clients der Registry, nicht die stdio-Eintraege (T002648)" {
  # Die Registry fuehrt beide Sorten: http-Clients haben einen 'endpoint' mit
  # Port, stdio-Clients werden per 'command' gestartet und haben gar keinen Port,
  # der antworten koennte. Nur die erste Sorte ist ueberhaupt messbar.
  local http_clients
  http_clients="$(python3 -c "
import yaml
d = yaml.safe_load(open('docs/agent-guide/registry/mcp.yaml'))
print(sum(1 for c in d.get('clients', {}).values() if c.get('transport') == 'http'))
" 2>/dev/null)"

  # Positiv-Anker: die Registry muss ueberhaupt http-Clients fuehren, sonst
  # prueft der Vergleich unten nichts.
  [ -n "$http_clients" ] && [ "$http_clients" -ge 1 ] || {
    echo "FAIL: keine http-Clients in docs/agent-guide/registry/mcp.yaml gefunden."
    echo "      Die Registry-Struktur hat sich erneut geaendert — G-IF01 muss"
    echo "      nachgezogen werden, statt still eine leere Menge zu messen."
    return 1
  }

  local val
  val="$(measure_value G-IF01)"
  [[ "$val" =~ ^[0-9]+$ ]] || { echo "FAIL: G-IF01 lieferte '${val}'"; return 1; }

  [ "$val" -le "$http_clients" ] || {
    echo "FAIL: G-IF01 meldet ${val} tote Endpunkte, es gibt aber nur"
    echo "      ${http_clients} http-Clients. Werden die stdio-Eintraege"
    echo "      mitgezaehlt? Die haben keinen Port und sind nie erreichbar."
    return 1
  }
}

@test "G-IF01 meldet Verletzung statt n/a, wenn die Registry keine Kandidaten hergibt (T002648)" {
  # Die in goals.md dokumentierte Absicht: "eine komplett leere Registry soll
  # nicht faelschlich gruen melden." Genau das war der Defekt — die Struktur
  # wanderte auf 'clients', die Messung suchte weiter 'servers' und meldete
  # dauerhaft nichts, ohne dass ein Ziel es anzeigte.
  local fixture="$BATS_TEST_TMPDIR/empty-registry.yaml"
  cat > "$fixture" <<'YAML'
cluster:
  context: fleet
YAML

  # Eigene Werte-Datei: measure_value() unten leert und ueberschreibt $VALUES,
  # der Fixture-Wert wuerde sonst vom Positiv-Anker-Lauf verdraengt.
  local fixture_values="$BATS_TEST_TMPDIR/fixture-values.txt"
  : > "$fixture_values"
  run env HG_MCP_REGISTRY="$fixture" HG_VALUES_FILE="$fixture_values" \
    bash "$SCRIPT" --fast --only=G-IF01

  # Positiv-Anker: derselbe Aufruf gegen die ECHTE Registry muss eine messbare
  # Ganzzahl liefern. Ohne ihn wuerde der Test auch dann bestehen, wenn G-IF01
  # grundsaetzlich kaputt ist und immer eine Verletzung meldet.
  local real_val
  real_val="$(measure_value G-IF01)"
  [[ "$real_val" =~ ^[0-9]+$ ]] || {
    echo "FAIL: G-IF01 misst gegen die echte Registry nicht ('${real_val}')."
    return 1
  }

  local fixture_val
  fixture_val="$(awk '$1 == "G-IF01" { print $2 }' "$fixture_values")"

  [ -n "$fixture_val" ] || {
    echo "FAIL: G-IF01 fiel bei leerer Registry auf 'nicht messbar' zurueck."
    echo "      Eine Registry ohne Kandidaten ist kein Messergebnis, sondern ein"
    echo "      Strukturbruch — er muss das Ziel verletzen, nicht es ueberspringen."
    return 1
  }

  [ "$fixture_val" -gt 0 ] || {
    echo "FAIL: G-IF01 meldete '${fixture_val}' bei leerer Registry — das ist gruen."
    echo "      Ein erneuter Schema-Wandel wuerde damit wieder unbemerkt bleiben."
    return 1
  }
}

@test "G-DEP01 zaehlt high/critical aus dem pnpm-audit-Einzelobjekt (T002648)" {
  local helper="$REPO_ROOT/scripts/lib/pnpm-audit-count.py"
  [ -f "$helper" ] || {
    echo "FAIL: ${helper} fehlt — der Parser ist ohne 180s-pnpm-Lauf nicht pruefbar."
    return 1
  }

  # Echtes pnpm-Format: ein pretty-printed Objekt mit advisories-Map. Der
  # zeilenweise JSON-Lines-Parser laeuft hier in den AttributeError.
  run bash -c "cat <<'JSON' | python3 '$helper'
{
  \"advisories\": {
    \"1130715\": { \"severity\": \"high\", \"module_name\": \"babel\" },
    \"1130716\": { \"severity\": \"critical\", \"module_name\": \"foo\" },
    \"1130717\": { \"severity\": \"moderate\", \"module_name\": \"bar\" }
  }
}
JSON"

  [ "$status" -eq 0 ] || { echo "FAIL: Parser brach ab — $output"; return 1; }
  [ "$output" = "2" ] || {
    echo "FAIL: erwartet 2 (high + critical), erhalten '${output}'."
    return 1
  }
}

@test "G-DEP01 unterscheidet 'keine Funde' von 'Parsen gescheitert' (T002648)" {
  local helper="$REPO_ROOT/scripts/lib/pnpm-audit-count.py"
  [ -f "$helper" ] || { echo "FAIL: ${helper} fehlt"; return 1; }

  # Positiv-Anker: der saubere Null-Fall muss 0 mit Exit 0 liefern.
  run bash -c "printf '%s' '{\"advisories\": {}}' | python3 '$helper'"
  [ "$status" -eq 0 ] && [ "$output" = "0" ] || {
    echo "FAIL: leeres advisories-Objekt ergab status=${status} output='${output}' (erwartet 0/0)."
    return 1
  }

  # Kernaussage: Muell darf NICHT als 0 durchgehen. Ein Gate, das bei kaputter
  # Eingabe "keine Schwachstellen" meldet, ist schlimmer als keines.
  run bash -c "printf '%s' 'not json at all' | python3 '$helper'"
  [ "$status" -ne 0 ] || {
    echo "FAIL: unparsbare Eingabe lieferte Exit 0 mit '${output}'."
    echo "      Das Gate wuerde 'keine High/Critical-Vulns' melden, obwohl es"
    echo "      nichts gelesen hat."
    return 1
  }
}

@test "G-DEP02 ueberlebt den Exit-1 von pnpm outdated unter pipefail (T002648)" {
  local helper="$REPO_ROOT/scripts/lib/pnpm-outdated-majors.py"
  [ -f "$helper" ] || {
    echo "FAIL: ${helper} fehlt — der Parser ist ohne pnpm-Lauf nicht pruefbar."
    return 1
  }

  # pnpm outdated endet MIT gefundenen Paketen als Exit 1 — der Fehlerfall des
  # Skripts ist also der Normalfall des Werkzeugs. Nachgestellt mit einem
  # Produzenten, der genau das tut, unter denselben Shell-Optionen wie
  # scripts/health-goals-check.sh (set -uo pipefail, Zeile 23).
  run bash -c "
set -uo pipefail
producer() {
  printf '%s' '{\"eslint-plugin-astro\": {\"current\": \"1.2.3\", \"latest\": \"2.0.0\"}, \"knip\": {\"current\": \"5.1.0\", \"latest\": \"6.0.0\"}, \"astro\": {\"current\": \"4.1.0\", \"latest\": \"4.9.0\"}}'
  return 1
}
producer | python3 '$helper'
"
  # Positiv-Anker + Kernaussage in einem: der Wert muss stimmen UND als einziges
  # Token ankommen. Der Defekt zeigte sich als "2\n-", also korrekter Wert plus
  # angehaengtes Fallback-Token.
  [ "$output" = "2" ] || {
    echo "FAIL: erwartet '2' (zwei Major-Spruenge), erhalten '${output}'."
    echo "      Mehrzeilig? Dann haengt der Fallback-Zweig sein Token an, obwohl"
    echo "      der Parser bereits erfolgreich gezaehlt hat."
    return 1
  }
}
