#!/usr/bin/env bats
#
# T900380 — runtime_measure() wird AUSGEFUEHRT, nicht nur als Text gefunden.
#
# Pruefmodus: Output-Verifikation [T002448-M4]. Der Test laedt die Helfer,
# ruft runtime_measure() wirklich auf und prueft den Rueckgabewert.
#
# Vorgeschichte: service-health-goals.bats pruefte bisher nur, dass der STRING
# "runtime_measure svc-oidc" in health-goals-check.sh vorkommt und der Modus in
# scripts/lib/runtime-health-measure.py existiert. Die Funktion selbst wurde nie
# aufgerufen — und war seit einem Bash-Wort-Expansions-Defekt (T900380) komplett
# tot:
#   local mode="$1" args=() suffix input_var input   # ein Statement
#   suffix="${1//-/_}"; input_var="HG_${suffix^^}_INPUT"; input="${!input_var:-}"
# Bash expandiert alle Woerter EINER Anweisung, BEVOR `local` anlegt. Schon
# `local a=… b="${a}…"` bricht unter `set -u` mit "unbound variable" ab, die
# indirekte Variante mit "invalid indirect expansion". Ergebnis: die Funktion
# brach nach dem leeren Output ab, alle 15 runtime_measure-Ziele meldeten einen
# leeren Messwert. Genau dieser stille Ausfall ist das Muster aus T013916.
#
# Diese Datei schliesst die Luecke: sie ruft die Funktion auf und verlangt eine
# Ganzzahl. Kein Source-Grep kann das leisten — der Defekt war in einer Zeile,
# die per grep "vollstaendig aussah".

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  cd "$REPO_ROOT" || return 1
  LIB="$REPO_ROOT/scripts/lib/health-goals-measure.sh"
  SCRIPT="$REPO_ROOT/scripts/health-goals-check.sh"
}

# Laedt die Helfer in eine Subshell und fuehrt runtime_measure aus. FAST=0, weil
# der Helper bei --fast per Definition "-" liefert.
measure() { # <modus> <ENV=VAL …>
  local mode="$1"; shift
  env FAST=0 "$@" bash -c '. scripts/lib/health-goals-measure.sh && runtime_measure "$1"' _ "$mode" 2>&1
}

@test "runtime_measure liefert fuer svc-probe eine Ganzzahl, nicht leer (T900380)" {
  [ -f "$LIB" ] || { echo "FAIL: $LIB fehlt"; return 1; }
  local fixture="$BATS_TEST_TMPDIR/svc-probe.json"
  printf '{}' > "$fixture"

  local out
  out="$(measure svc-probe HG_SVC_PROBE_INPUT="$fixture")"

  [[ "$out" =~ ^[0-9]+$ ]] || {
    echo "FAIL: runtime_measure svc-probe lieferte '${out}' statt einer Ganzzahl."
    echo "      Das ist der T900380-Defekt: leere Messung, Ziel meldet 'unerfuellt'."
    return 1
  }
}

@test "runtime_measure reicht die Fixture wirklich durch — der Wert folgt der Datei (T900380)" {
  # svc_probe liest k3d/-Manifeste und wertet die Fixture nicht aus; ihr Zahlenwert
  # haengt also am Repo-Stand. flux() dagegen liest `data` — damit laesst sich
  # beweisen, dass HG_<MODUS>_INPUT das Python-Skript wirklich erreicht.
  #
  # Fixture: 4 Items — 1x generation-stale, 1x suspendiert, 1x non-production
  # (vom Loop per Label uebersprungen), 1x sauber. Erwartet also 2, nicht 0
  # (sonst bestuende der Test eine kaputte Messung) und nicht 4 (sonst
  # zaehlte er non-production mit).
  local fixture="$BATS_TEST_TMPDIR/flux.json"
  cat > "$fixture" <<'JSON'
{"items": [
  {"metadata": {"generation": 1},
   "spec": {}, "status": {"observedGeneration": 1, "conditions": [{"type": "Ready", "status": "True"}]}},
  {"metadata": {"generation": 3},
   "spec": {}, "status": {"observedGeneration": 1, "conditions": [{"type": "Ready", "status": "True"}]}},
  {"metadata": {"generation": 1, "labels": {"health-goals.paddione.de/environment": "non-production"}},
   "spec": {}, "status": {"observedGeneration": 1, "conditions": [{"type": "Ready", "status": "False"}]}},
  {"metadata": {"generation": 1},
   "spec": {"suspend": true}, "status": {"observedGeneration": 1, "conditions": [{"type": "Ready", "status": "True"}]}}
]}
JSON

  local out
  out="$(measure flux HG_FLUX_INPUT="$fixture")"

  [ "$out" = "2" ] || {
    echo "FAIL: runtime_measure flux lieferte '${out}', erwartet 2."
    echo "      Fixture: 1x generation-stale + 1x suspend = 2; das"
    echo "      non-production-Item wird per Label ausgenommen. '-' hiesse:"
    echo "      die Datei kam nicht an, oder das Skript las sie nicht."
    return 1
  }
}

@test "runtime_measure bleibt fail-closed: kaputte Fixture => '-', nicht 0 (T900380)" {
  # Der Gegenpol. Ein Mess-Helfer, der bei unlesbarer Eingabe 0 meldet, waere
  # schlimmer als keiner: "keine nicht-Ready-Ressource" statt "nichts gemessen".
  local fixture="$BATS_TEST_TMPDIR/broken.json"
  printf 'kein json' > "$fixture"

  local out
  out="$(measure flux HG_FLUX_INPUT="$fixture")"

  [ "$out" = "-" ] || {
    echo "FAIL: kaputte Fixture lieferte '${out}' statt '-'."
    return 1
  }
}

@test "der Checker meldet einen unbrauchbaren Messwert als n/a mit Warnung, nicht als Verletzung (T900380)" {
  # row() hat bis T900430 keinen Guard gegen nicht-numerische Werte: sie fielen in
  # den `*) ok=0`-Zweig und erschienen als 🟡 mit LEERER Zahl. Getrieben wird das
  # Ende-zu-Ende ueber den Checker, damit die Assertion an dem Weg haengt, den
  # der Nightly-Lauf (health-goals.yml) tatsaechlich nimmt.
  local values="$BATS_TEST_TMPDIR/values.txt"
  : > "$values"
  run env HG_VALUES_FILE="$values" bash "$SCRIPT" --only=G-SVC01

  # Weder "unbound variable" noch "invalid indirect expansion" im Output.
  local bash_err
  bash_err="$(printf '%s\n%s\n' "$output" "${stderr:-}" | grep -E 'unbound variable|invalid indirect expansion' || true)"
  [ -z "$bash_err" ] || {
    echo "FAIL: Bash-Expansionsfehler im Checker-Output:"
    echo "$bash_err"
    return 1
  }

  # Und die row()-Warnung darf nicht feuern — ein leerer Messwert waere genau der
  # T900380-Defekt, den dieser Test verhindert.
  local warn
  warn="$(printf '%s\n%s\n' "$output" "${stderr:-}" | grep -c 'nicht-numerischer Messwert' || true)"
  [ "$warn" = "0" ] || {
    echo "FAIL: Checker meldete ${warn}x 'nicht-numerischer Messwert' fuer G-SVC01 —"
    echo "      die Messung liefert wieder nichts."
    return 1
  }

  # G-SVC01 muss einen gemessenen Wert in die Werte-Datei geschrieben haben
  # (eine Zeile "<id> <wert> <cmp> <target>"); SKIP schreibt nichts.
  grep -q '^G-SVC01 [0-9]\+ ' "$values" || {
    echo "FAIL: G-SVC01 hat keinen Ganzzahl-Wert in HG_VALUES_FILE geschrieben."
    echo "      Datei-Inhalt:"
    sed 's/^/        /' "$values" || true
    return 1
  }
}
