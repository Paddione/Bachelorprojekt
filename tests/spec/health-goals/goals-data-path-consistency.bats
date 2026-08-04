#!/usr/bin/env bats
#
# T002648 — jeder hartkodierte goals-data-Pfad im Health-Goal-Tooling muss auf
# eine existierende Datei zeigen.
#
# Pruefmodus: Konsistenz-Querschnitt Konfiguration-gegen-Dateisystem (Ausnahme der
# Test-Resultats-Konvention [T002448-M4], analog zu
# tests/spec/ci-cd/freshness-paths-exist.bats). Geprueft wird nicht, ob ein
# String im Quelltext steht, sondern ob der dort hinterlegte Default-Pfad im
# Repo existiert — das Ergebnis ist eine Aussage ueber die Realitaet, nicht ueber
# den Text.
#
# Warum ueberhaupt: der SDLC-Split (6959c722e) verschob
# goals-data.generated.json nach website/src/lib/sdlc/. Die schreibende Seite
# (gen-goals-data.mjs) wurde nachgezogen und waere bei einem Fehler laut
# gebrochen. Die drei LESENDEN Stellen haben einen stillen Fallback und blieben
# unbemerkt zurueck:
#   scripts/health-goals-update.sh   → "task health:goals:drift" bricht ab
#   scripts/health-goals-llm-fill.sh → keine Kandidatenbasis
#   scripts/factory/auto-close-merged.sh → Allowlist generierter Artefakte
#     greift nicht mehr, plan-only PRs gelten faelschlich als Implementierung
# Dieser Test faengt die Klasse "lesende Seite zeigt ins Leere", nicht den
# Einzelfall des SDLC-Splits.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  cd "$REPO_ROOT" || return 1
}

# Sammelt alle website/src/**-Pfade auf goals-data*.json, die im Health-Goal-
# und Factory-Tooling hartkodiert sind. Bewusst ueber eine Dateiliste statt
# repo-weit: ein Treffer in openspec/changes/archive/** ist eine historische
# Momentaufnahme und darf gerade NICHT mitwandern.
#
# Bewusst OHNE sort -u: gezaehlt werden Referenzen, nicht eindeutige Pfade. Nach
# einem korrekten Umzug zeigen alle vier Stellen auf denselben Pfad — ein Anker
# auf der deduplizierten Menge waere dann nie wieder erfuellbar und der Test
# bliebe dauerhaft rot.
goals_data_refs() {
  grep -ohE 'website/src/[A-Za-z0-9_/.-]*goals-data[A-Za-z0-9_.-]*\.json' \
    scripts/health-goals-update.sh \
    scripts/health-goals-llm-fill.sh \
    scripts/factory/auto-close-merged.sh \
    scripts/gen-goals-data.mjs \
    2>/dev/null
}

@test "health-goals tooling: jeder referenzierte goals-data-Pfad existiert (T002648)" {
  run goals_data_refs
  [ "$status" -eq 0 ] || { echo "FAIL: Referenzen nicht extrahierbar — $output"; return 1; }

  local count
  count="$(echo "$output" | grep -c .)"

  # Positiv-Anker [T002356-M1]: ohne ihn bestuende der Test vakuos, sobald eine
  # der Quelldateien umbenannt wird oder die Pfade in Variablen wandern — "0 tote
  # Pfade in 0 Referenzen" waere trivial gruen.
  [ "$count" -ge 4 ] || {
    echo "FAIL: nur ${count} goals-data-Referenzen gefunden (erwartet >= 4)."
    echo "      Die Extraktion greift daneben — der Guard waere ab hier blind."
    echo "$output"
    return 1
  }

  local dead=""
  while IFS= read -r p; do
    [ -n "$p" ] || continue
    [ -e "$p" ] || dead="${dead}  - ${p}"$'\n'
  done <<< "$(echo "$output" | sort -u)"

  [ -z "$dead" ] || {
    echo "FAIL: Health-Goal-Tooling referenziert Pfade, die es nicht gibt:"
    echo "$dead"
    echo "      Umgezogen? Dann die lesenden Stellen nachziehen. Sonst meldet das"
    echo "      Werkzeug 'nicht gefunden' und liefert Exit 0 — ein kaputtes"
    echo "      Werkzeug, das sich als 'nichts zu tun' ausgibt."
    return 1
  }
}

@test "health:goals:drift laeuft nicht in den Datei-fehlt-Abbruch (T002648)" {
  # Output-Verifikation: der Abbruchpfad ist an seiner Meldung erkennbar. Der
  # Drift-Report selbst braucht eine volle Messung; hier interessiert nur, dass
  # er ueberhaupt bis dahin kommt statt vorher auszusteigen.
  local gen_json
  gen_json="$(grep -oE 'HG_GEN_JSON:-[^}]*' scripts/health-goals-update.sh | head -1 | cut -d- -f2-)"

  # Positiv-Anker: der Default muss ueberhaupt extrahierbar sein.
  [ -n "$gen_json" ] || {
    echo "FAIL: HG_GEN_JSON-Default aus scripts/health-goals-update.sh nicht lesbar."
    return 1
  }

  [ -f "$gen_json" ] || {
    echo "FAIL: HG_GEN_JSON-Default zeigt auf '${gen_json}' — existiert nicht."
    echo "      'task health:goals:drift' bricht damit ab mit"
    echo "      '<pfad> nicht gefunden — Drift-Report nicht moeglich.'"
    return 1
  }
}
