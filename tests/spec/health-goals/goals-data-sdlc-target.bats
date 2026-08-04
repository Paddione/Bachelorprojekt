#!/usr/bin/env bats
#
# T002639 — goals-data liegt seit ADR-006 E1 im SDLC-Target, nicht im Prod-Bundle.
#
# Pruefmodus: CI-Konfiguration. Das Ergebnis dieser Regel manifestiert sich
# ausschliesslich in .github/workflows/*.yml (welcher Workflow auf welchen Pfad
# triggert) — der dokumentierte Ausnahmefall der Test-Resultats-Konvention
# [T002448-M4]. Gelesen wird trotzdem NICHT per grep, sondern per `yq` aus der
# geparsten `paths:`-Liste: die Begruendung im Workflow nennt '.claude/lib/goals.md'
# im Kommentartext, ein Substring-Match wuerde also genau den Zustand bestaetigen,
# den der Test ausschliessen soll.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  PROD_WF="${REPO_ROOT}/.github/workflows/build-website.yml"
  SDLC_WF="${REPO_ROOT}/.github/workflows/build-sdlc-console.yml"
  GOALS_JSON="website/src/lib/sdlc/goals-data.generated.json"
}

# Liest die push-paths eines Workflows als Zeilen — Kommentare sind hier weg,
# yq gibt nur die Listenwerte zurueck.
wf_paths() {
  yq -r '.on.push.paths[]' "$1"
}

@test "build-website.yml triggert nicht auf .claude/lib/goals.md (Konsument ist SDLC-only)" {
  [ -f "$PROD_WF" ] || { echo "FAIL: $PROD_WF fehlt"; return 1; }

  run wf_paths "$PROD_WF"
  [ "$status" -eq 0 ] || { echo "FAIL: paths: nicht parsebar — $output"; return 1; }

  # Positiv-Anker [T002356-M1]: ohne ihn waere die Liste bei kaputtem YAML leer
  # und die Negativ-Aussage unten trivial erfuellt.
  echo "$output" | grep -qx 'website/\*\*' || {
    echo "FAIL: build-website.yml triggert nicht mehr auf 'website/**' — die paths-Liste ist kaputt, nicht bloss goals-frei:"
    echo "$output"
    return 1
  }

  if echo "$output" | grep -qx '\.claude/lib/goals\.md'; then
    echo "FAIL: build-website.yml triggert auf .claude/lib/goals.md."
    echo "      Der einzige Konsument der Goals-Daten ist pages/sdlc/repohealth.astro,"
    echo "      und ${GOALS_JSON} ist von den '!website/src/lib/sdlc/**'-Negationen"
    echo "      ausgeschlossen. Der Trigger baut damit ein Prod-Image fuer Daten,"
    echo "      die dieses Image nicht rendert. Gebaut wird ueber build-sdlc-console.yml."
    return 1
  fi
}

@test "build-sdlc-console.yml deckt den goals-data-Pfad ab" {
  [ -f "$SDLC_WF" ] || { echo "FAIL: $SDLC_WF fehlt"; return 1; }
  [ -f "${REPO_ROOT}/${GOALS_JSON}" ] || {
    echo "FAIL: ${GOALS_JSON} existiert nicht — Pfad umgezogen? Dann auch hier nachziehen."
    return 1
  }

  # Echtes Glob-Matching statt Stringvergleich: welcher paths-Eintrag den Pfad
  # abdeckt, entscheidet die Glob-Semantik, nicht die Schreibweise.
  run yq -r '.on.push.paths[]' "$SDLC_WF"
  [ "$status" -eq 0 ] || { echo "FAIL: paths: nicht parsebar — $output"; return 1; }

  local matched=0
  shopt -s extglob globstar
  while IFS= read -r pattern; do
    [ -n "$pattern" ] || continue
    case "$pattern" in '!'*) continue ;; esac
    # ** in GitHub-paths entspricht bash-globstar; ein reines Praefix-Glob wie
    # 'website/src/lib/**' matcht den tieferen Pfad nur mit globstar.
    # shellcheck disable=SC2254
    case "$GOALS_JSON" in
      $pattern) matched=1; break ;;
    esac
  done <<< "$output"

  [ "$matched" -eq 1 ] || {
    echo "FAIL: kein paths-Eintrag in build-sdlc-console.yml deckt ${GOALS_JSON} ab."
    echo "      Eine goals-only-Aenderung baute dann kein Image und /sdlc/repohealth"
    echo "      bliebe stale — der Fehlermodus, gegen den T002158 geschrieben wurde,"
    echo "      nur im anderen Target. Gefundene paths:"
    echo "$output"
    return 1
  }
}
