#!/usr/bin/env bats
# tests/spec/ci-cd/health-goals-pr-path.bats — health-goals schreibt ueber einen PR [T900810]
#
# HINTERGRUND (belegt, nicht vermutet)
# Seit T002889 lehnt die Branch Protection Direkt-Pushes auf main auch fuer das Admin-Token ab.
# freshness-regen.yml wurde damals auf den PR-Pfad umgestellt, health-goals.yml nicht: sein
# Schritt "Commit and push if changed" endete mit `git push` auf main und scheiterte an
#   remote: error: GH006: Protected branch update failed for refs/heads/main.
# Der Nightly-Lauf war deshalb an jedem Tag rot, an dem sich ein Messwert aenderte
# (Run 36975171686, 2026-10-02), und goals.md blieb auf dem alten Stand.
#
# PRUEFMODUS (Test-Resultats-Konvention T002448-M4)
#   Quelltext-Grep auf .github/workflows/health-goals.yml. Zulaessig und angemessen: das
#   Ergebnis manifestiert sich AUSSCHLIESSLICH in der CI-Konfiguration; es gibt kein
#   Laufzeitverhalten, das lokal messbar waere, ohne einen echten Workflow-Lauf auszuloesen.
#   Dieselbe Form wie tests/spec/ci-cd/main-direct-push-guard.bats fuer freshness-regen.yml.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  WF="$REPO_ROOT/.github/workflows/health-goals.yml"
}

# Effektive Konfiguration ohne YAML-Kommentarzeilen — die Begruendungen im Workflow nennen
# genau die Muster, die hier verboten sind.
wf_config() {
  grep -v '^[[:space:]]*#' "$WF"
}

@test "health-goals: schreibt ueber einen PR statt direkt auf main zu pushen" {
  # Positiv-Anker (T002356-M1): der Workflow existiert und committet die Messwerte. Ohne
  # diesen Anker waere die Negativ-Aussage unten vakuos erfuellt, sobald der Schritt fehlt.
  [ -f "$WF" ]
  run bash -c "grep -v '^[[:space:]]*#' '$WF' | grep -c 'git commit'"
  [ "$status" -eq 0 ]
  [ "$output" -gt 0 ]

  # Positiv: es gibt einen PR-erzeugenden Schritt.
  run bash -c "grep -v '^[[:space:]]*#' '$WF' | grep -Ec 'gh(-axi)? pr create'"
  [ "$status" -eq 0 ]
  [ "$output" -gt 0 ]

  # Negativ: kein nacktes `git push`, das auf den ausgecheckten Branch (main) zeigt. Ein
  # `git push -u origin "$BRANCH"` auf den Mess-Branch bleibt zulaessig.
  bare="$(wf_config | grep -nE '^[[:space:]]*git push([[:space:]]*(#.*)?)?[[:space:]]*$' || true)"
  [ -z "$bare" ]
}

@test "health-goals: aktiviert Auto-Merge auf dem erzeugten PR" {
  # Ohne Auto-Merge bliebe der PR liegen: der Lauf waere gruen und goals.md trotzdem alt.
  [ -f "$WF" ]
  run bash -c "grep -v '^[[:space:]]*#' '$WF' | grep -Ec 'gh(-axi)? pr merge.*--auto'"
  [ "$status" -eq 0 ]
  [ "$output" -gt 0 ]
}

@test "health-goals: der Job darf Pull Requests anlegen" {
  [ -f "$WF" ]
  run bash -c "grep -v '^[[:space:]]*#' '$WF' | grep -Ec '^[[:space:]]*pull-requests:[[:space:]]*write'"
  [ "$status" -eq 0 ]
  [ "$output" -gt 0 ]
}

@test "health-goals: der PR-Titel besteht den Conventional-Commits-Check" {
  # "Conventional Commits" ist ein Required Check — ein abweichender Titel wuerde nie gruen
  # und der PR nie mergen. Geprueft wird das Ergebnis des Validators, nicht der Wortlaut.
  [ -f "$WF" ]
  title="$(wf_config | sed -n 's/^[[:space:]]*--title "\(.*\)".*$/\1/p' | head -1)"
  [ -n "$title" ]
  printf '%s\n' "$title" > "$BATS_TEST_TMPDIR/title.txt"
  run bash "$REPO_ROOT/scripts/validate-commit-msg.sh" message "$BATS_TEST_TMPDIR/title.txt"
  [ "$status" -eq 0 ]
}

@test "health-goals: Cleanup trifft nur Bot-Branches, nicht von Hand angelegte (T900837)" {
  # `chore/health-goals-` tragen auch von Hand angelegte Branches (z. B.
  # chore/health-goals-fixes-sept25). Der Cleanup-Schritt schliesst PRs und loescht ihre
  # Branches — sein Filter muss deshalb ein Praefix nutzen, das nur der Bot vergibt.
  [ -f "$WF" ]
  bot_branch="$(wf_config | sed -n 's/^[[:space:]]*BRANCH:[[:space:]]*\(chore\/[^$]*\)\${{.*$/\1/p' | head -1)"
  filter="$(wf_config | sed -n 's/.*startswith("\([^"]*\)").*/\1/p' | head -1)"
  # Positiv-Anker: beide Werte wurden gefunden — sonst waere der Vergleich vakuos.
  [ -n "$bot_branch" ]
  [ -n "$filter" ]
  # Der Filter ist genau das Praefix, unter dem der Bot seinen Branch anlegt.
  [ "$filter" = "$bot_branch" ]
  # Ein von Hand angelegter Branch faellt nicht darunter.
  case "chore/health-goals-fixes-sept25" in "$filter"*) return 1 ;; esac
}
