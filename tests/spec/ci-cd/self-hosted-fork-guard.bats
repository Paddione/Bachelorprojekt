#!/usr/bin/env bats
#
# T002927 — Fork-Guard-Pflicht fuer self-hosted Runner.
#
# Pruefmodus: YAML-Auswertung der Workflow-Dateien via yq (nicht Source-Grep auf
# einen bestimmten String). Ausnahme nach der Test-Resultats-Konvention
# [T002448-M4]: die geschuetzte Eigenschaft manifestiert sich ausschliesslich in
# der Workflow-Konfiguration; sie zur Laufzeit zu messen hiesse, einen Fork-PR
# gegen einen echten Runner zu fahren.
#
# Die Eigenschaft, nicht der Wortlaut: JEDER Job, der auf einem self-hosted
# Runner laeuft UND dessen Workflow auf pull_request triggert, muss eine
# if-Bedingung tragen, die den PR gegen github.repository prueft. Ohne das
# fuehrt ein beliebiger Fork-PR seinen eigenen Code auf fremder Hardware aus:
# actions/checkout holt bei pull_request den PR-HEAD.
#
# Formuliert als Invariante ueber ALLE Workflows statt als Pin auf eine Datei,
# weil genau die Luecke real auftrat — opencode.yml hatte den Guard,
# arbitration.yml nicht, und niemandem fiel der Unterschied auf, solange kein
# Runner online war.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  cd "$REPO" || return 1
}

# Gibt alle Workflow-Dateien mit mindestens einem self-hosted Job aus —
# unabhaengig vom Trigger. Traegt seit T900040 den Positiv-Anker: die Liste der
# self-hosted PR-Workflows darf legitim leer sein (arbitration.yml war der
# letzte), der Filter-Mechanismus muss aber weiter nachweisbar funktionieren.
_self_hosted_workflows() {
  local f
  for f in .github/workflows/*.yml .github/workflows/*.yaml; do
    [ -f "$f" ] || continue
    yq -e '[.jobs[] | select(.["runs-on"] | tostring | test("self-hosted"))] | length > 0'       "$f" >/dev/null 2>&1 || continue
    printf '%s
' "$f"
  done
}

# Gibt alle Workflow-Dateien aus, die (a) mindestens einen self-hosted Job haben
# und (b) auf pull_request triggern.
_self_hosted_pr_workflows() {
  local f
  for f in .github/workflows/*.yml .github/workflows/*.yaml; do
    [ -f "$f" ] || continue
    yq -e '.on | has("pull_request")' "$f" >/dev/null 2>&1 || continue
    yq -e '[.jobs[] | select(.["runs-on"] | tostring | test("self-hosted"))] | length > 0' \
      "$f" >/dev/null 2>&1 || continue
    printf '%s\n' "$f"
  done
}

@test "T002927: es gibt ueberhaupt self-hosted Workflows (Positiv-Anker)" {
  # Positiv-Anker [T002356-M1]: ohne ihn ist die Negativ-Aussage im naechsten
  # Test vakuos — bei leerer Kandidatenliste gilt sie trivial, auch wenn yq
  # kaputt ist, das Glob nicht matcht oder der Filter falsch liegt.
  #
  # [T900040] Der Anker haengt bewusst am trigger-UNABHAENGIGEN Filter. Seit
  # arbitration.yml nicht mehr per pull_request startet, ist die Liste der
  # self-hosted PR-Workflows leer — und zwar richtigerweise. Am alten Anker
  # gemessen waere das ein Fehlschlag gewesen, obwohl der Filter intakt ist.
  # Was der Anker absichern soll, ist der Mechanismus (Glob + yq + runs-on),
  # nicht die Existenz eines gefaehrdeten Workflows.
  run _self_hosted_workflows
  [ "$status" -eq 0 ]
  [ -n "$output" ] || {
    echo "Kandidatenliste leer — Filter oder yq defekt, kein gueltiges Urteil moeglich" >&2
    false
  }
}

@test "T002927: jeder self-hosted Job in einem pull_request-Workflow hat einen Fork-Guard" {
  local f job cond missing=0
  while IFS= read -r f; do
    while IFS= read -r job; do
      cond="$(yq -r ".jobs.\"$job\".if // \"\"" "$f")"
      case "$cond" in
        *github.repository*) ;;
        *)
          echo "FEHLT: $f job '$job' laeuft self-hosted, prueft aber nicht gegen github.repository" >&2
          echo "  if: ${cond:-<keine if-Bedingung>}" >&2
          missing=$((missing + 1))
          ;;
      esac
    done < <(yq -r '.jobs | to_entries[] | select(.value["runs-on"] | tostring | test("self-hosted")) | .key' "$f")
  done < <(_self_hosted_pr_workflows)

  [ "$missing" -eq 0 ] || {
    echo "$missing self-hosted Job(s) ohne Fork-Guard" >&2
    false
  }
}

@test "T002927/T900040: arbitration.yml startet weder per cron noch per pull_request" {
  # Der schedule-Trigger erzeugte 48 Runs/Tag, die ohne online Runner
  # unbegrenzt in 'queued' haengen blieben — continue-on-error greift nur fuer
  # Schritte eines GESTARTETEN Jobs, nicht fuer einen, der nie anlaeuft.
  #
  # [T900040] Derselbe Effekt trat ueber den pull_request-Trigger erneut auf,
  # nachdem der einzige fleet-gpu-Runner (wsl-gpu-host) mit dem WSL-Exit
  # dauerhaft entfiel: 22 gleichzeitig queued Runs am 2026-09-02. Zuvor
  # verlangte dieser Test den pull_request-Trigger noch als Vorbedingung.
  [ -f .github/workflows/arbitration.yml ]

  run yq -e '.on | has("schedule")' .github/workflows/arbitration.yml
  [ "$status" -ne 0 ] || {
    echo "schedule-Trigger ist zurueck — Zombie-Queue ohne online Runner" >&2
    false
  }

  run yq -e '.on | has("pull_request")' .github/workflows/arbitration.yml
  [ "$status" -ne 0 ] || {
    echo "pull_request-Trigger ist zurueck — jeder PR erzeugt wieder einen queued Run" >&2
    false
  }
}

@test "T900040: arbitration.yml bleibt per workflow_dispatch ausloesbar" {
  # Gegenstueck zum Test darueber: Arbitration soll nicht abgeschaltet, sondern
  # auf Zuruf beschraenkt sein.
  run yq -e '.on | has("workflow_dispatch")' .github/workflows/arbitration.yml
  [ "$status" -eq 0 ]
}
