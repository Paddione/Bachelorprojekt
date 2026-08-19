#!/usr/bin/env bats
#
# T012414 — Self-hosted Jobs duerfen keine root-Rechte voraussetzen.
#
# Der Vorfall: Nachdem die PR-Jobs auf self-hosted Runner umgezogen waren,
# brach "BATS Unit + Quality Gates" an
#   sudo install -m 0755 /tmp/actionlint /usr/local/bin/actionlint
# mit "sudo: a password is required" ab. Auf ubuntu-latest ist der Job-User
# passwortlos root, auf einem self-hosted Runner ist er das nicht — und soll es
# auch nicht sein: ein CI-Job mit root auf dem Host ist genau die Eskalation,
# gegen die der Fork-Guard in self-hosted-fork-guard.bats schuetzt.
#
# Dieselbe Klasse traf actions/cache mit `path: /usr/local/bin/<tool>`: schon das
# Zurueckspielen des Caches schreibt dorthin und scheitert ohne root.
#
# Pruefmodus: YAML-Auswertung der Workflow-Dateien. Ausnahme nach der
# Test-Resultats-Konvention [T002448-M4] wie beim Fork-Guard — die geschuetzte
# Eigenschaft existiert ausschliesslich in der Workflow-Konfiguration; sie zur
# Laufzeit zu messen hiesse, einen echten Job auf einem Runner ohne sudo zu
# fahren.
#
# Erlaubt bleibt `sudo -n` als *Abfrage*, ob passwortloses sudo verfuegbar ist
# (e2e-pr.yml nutzt das, um Playwright-Systemabhaengigkeiten nur dort
# nachzuziehen, wo es geht). Verboten ist jedes sudo, das den Job scheitern
# laesst, wenn die Rechte fehlen.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  cd "$REPO" || return 1
}

# Alle Workflow-Dateien mit mindestens einem self-hosted Job.
_self_hosted_workflows() {
  local f
  for f in .github/workflows/*.yml .github/workflows/*.yaml; do
    [ -f "$f" ] || continue
    yq -e '[.jobs[] | select(.["runs-on"] | tostring | test("self-hosted"))] | length > 0' \
      "$f" >/dev/null 2>&1 || continue
    printf '%s\n' "$f"
  done
}

# Alle run-Skripte der self-hosted Jobs einer Datei, als Text — ohne reine
# Kommentarzeilen. Die Begruendung, warum ein Schritt KEIN sudo mehr aufruft,
# steht als Kommentar direkt daneben; wuerde sie mitgelesen, schluege genau der
# Kommentar an, der die Regel erklaert.
_self_hosted_run_scripts() {
  yq -r '
    .jobs | to_entries[]
    | select(.value["runs-on"] | tostring | test("self-hosted"))
    | .value.steps[]? | .run // ""
  ' "$1" | grep -vE '^[[:space:]]*#' || true
}

# Alle actions/cache-Pfade der self-hosted Jobs einer Datei.
_self_hosted_cache_paths() {
  yq -r '
    .jobs | to_entries[]
    | select(.value["runs-on"] | tostring | test("self-hosted"))
    | .value.steps[]? | select(.uses // "" | test("actions/cache"))
    | .with.path // ""
  ' "$1"
}

@test "T012414: es gibt ueberhaupt self-hosted Workflows mit run-Schritten (Positiv-Anker)" {
  # Positiv-Anker [T002356-M1]: ohne ihn waeren die Negativ-Aussagen unten
  # vakuos — bei leerer Kandidatenliste gelten sie trivial, auch wenn yq kaputt
  # ist oder der Filter nicht greift.
  run _self_hosted_workflows
  [ "$status" -eq 0 ]
  [ -n "$output" ] || {
    echo "Kandidatenliste leer — Filter oder yq defekt, kein gueltiges Urteil moeglich" >&2
    false
  }

  local f found=0
  while IFS= read -r f; do
    if [ -n "$(_self_hosted_run_scripts "$f")" ]; then
      found=$((found + 1))
    fi
  done < <(_self_hosted_workflows)

  [ "$found" -gt 0 ] || {
    echo "Kein self-hosted Job hat run-Schritte — Extraktion defekt" >&2
    false
  }
}

@test "T012414: kein self-hosted run-Schritt ruft sudo ausserhalb einer -n-Abfrage" {
  local f line bad=0
  while IFS= read -r f; do
    while IFS= read -r line; do
      case "$line" in
        *sudo\ -n*) continue ;;   # blosse Verfuegbarkeitsabfrage, faellt nicht um
        *sudo*)
          echo "VERBOTEN: $f — sudo ohne -n:" >&2
          echo "  $line" >&2
          bad=$((bad + 1))
          ;;
      esac
    done < <(_self_hosted_run_scripts "$f" | grep -n 'sudo' || true)
  done < <(_self_hosted_workflows)

  [ "$bad" -eq 0 ] || {
    echo "$bad sudo-Aufruf(e) in self-hosted Jobs — der Runner-User ist nicht root" >&2
    false
  }
}

@test "T012414: kein self-hosted run-Schritt installiert nach /usr/local/bin oder /usr/bin" {
  local f line bad=0
  while IFS= read -r f; do
    while IFS= read -r line; do
      echo "VERBOTEN: $f — Schreibzugriff auf einen root-Pfad:" >&2
      echo "  $line" >&2
      bad=$((bad + 1))
    done < <(_self_hosted_run_scripts "$f" \
              | grep -nE '(-o|-C|install .*|mv .*|cp .*)[[:space:]]+"?/usr/(local/)?bin' || true)
  done < <(_self_hosted_workflows)

  [ "$bad" -eq 0 ] || {
    echo "$bad Schreibzugriff(e) auf /usr/bin bzw. /usr/local/bin" >&2
    false
  }
}

@test "T012414: kein actions/cache eines self-hosted Jobs zeigt auf einen root-Pfad" {
  local f p bad=0
  while IFS= read -r f; do
    while IFS= read -r p; do
      [ -n "$p" ] || continue
      case "$p" in
        /usr/*|/opt/*|/etc/*)
          echo "VERBOTEN: $f — actions/cache path '$p' ist nicht runner-beschreibbar" >&2
          bad=$((bad + 1))
          ;;
      esac
    done < <(_self_hosted_cache_paths "$f")
  done < <(_self_hosted_workflows)

  [ "$bad" -eq 0 ] || {
    echo "$bad Cache-Pfad(e) unterhalb eines root-Verzeichnisses" >&2
    false
  }
}

@test "T012414: das Runner-Provisionierungsskript existiert und ist ausfuehrbar" {
  # Die Runner-Gleichheit ist die zweite Haelfte des Vorfalls: zwei Runner mit
  # identischen Labels, unterschiedlich ausgestattet — derselbe Job schlug je
  # nach Zuteilung fehl oder nicht.
  [ -f scripts/ci/provision-gh-runner.sh ]
  [ -x scripts/ci/provision-gh-runner.sh ]

  run bash -n scripts/ci/provision-gh-runner.sh
  [ "$status" -eq 0 ]
}

@test "T012414: das Provisionierungsskript kennt einen --check-Modus, der nichts installiert" {
  # --check muss ohne root laufen koennen, sonst ist es als Diagnose wertlos.
  run grep -q -- '--check' scripts/ci/provision-gh-runner.sh
  [ "$status" -eq 0 ]

  run bash scripts/ci/provision-gh-runner.sh --check
  # Exit 0 (Host vollstaendig) oder 1 (Abweichungen gemeldet) sind beide
  # gueltige Urteile; alles andere heisst, das Skript ist kaputt.
  [ "$status" -eq 0 ] || [ "$status" -eq 1 ]
  [[ "$output" == *"provision-gh-runner"* ]]
}
