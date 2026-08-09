#!/usr/bin/env bats
# tests/spec/ci-cd/ghcr-digest-auth.bats — GHCR-Auth des Fleet-Renderers [T002837]
#
# PRUEFMODUS: Quelltext-Inspektion (nicht Output-Verifikation).
# Begruendung: Gegenstand ist die Registry-Credential-Konfiguration eines
# GitHub-Actions-Workflows. Sie manifestiert sich ausschliesslich im Workflow-Quelltext;
# ein lokal beobachtbarer Laufzeit-Output existiert nicht, weil der Login nur im
# Actions-Runner stattfindet. Das ist die in CLAUDE.md §Test-Resultats-Konvention
# [T002448-M4] benannte Ausnahme fuer CI-Konfiguration.
#
# Hintergrund: `render-fleet-artifact.yml` loest seit PR #3877 Image-Digests via
# `crane` auf. `ghcr.io/paddione/workspace-brett` ist privat UND mit keinem Repository
# verknuepft — ein repo-scoped GITHUB_TOKEN erhaelt darauf 403 DENIED, unabhaengig von
# den deklarierten `permissions`. Commit 555cda1ff hielt das fuer die Build-Workflows
# bereits fest; PR #3877 fuegte einen Consumer hinzu, ohne die Ausnahme zu uebernehmen.
# Folge: kein neues OCI-Artefakt, und Flux reconciled stumm auf einer alten Revision.
#
# Warum der Test konkret auf diesen Workflow zielt statt generisch ueber alle:
# ob ein GHCR-Package mit dem Repo verknuepft ist, laesst sich offline nicht ermitteln —
# das braucht einen authentifizierten API-Aufruf. Eine generische Formulierung waere
# hier also nur scheinbar allgemeiner.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  WORKFLOW="${REPO_ROOT}/.github/workflows/render-fleet-artifact.yml"
}

# Schneidet den GHCR-Login-Step heraus: ab seinem `- name:` bis zum naechsten Step
# gleicher Einrueckung. Kein festes `grep -A<n>` — ein starres Fenster wandert bei
# jeder Umstellung in den Folge-Step und macht den Guard blind (Lehre aus T002503).
_login_step() {
  awk '/- name: Log in to GHCR/{f=1}
       f && /^      - name:/ && !/Log in to GHCR/{exit}
       f{print}' "$WORKFLOW"
}

@test "ghcr-digest-auth: Renderer nutzt GH_PAT fuer den GHCR-Login" {
  [ -f "$WORKFLOW" ]

  # Positiv-Anker [T002356-M1]: Der Workflow loest ueberhaupt Image-Digests auf.
  # Ohne ihn waere die Aussage unten vakuos — faellt der Resolve-Step irgendwann weg,
  # braucht der Workflow keinen lesenden GHCR-Zugriff mehr und der Test muesste
  # bewusst angefasst werden, statt still gruen zu bleiben.
  run grep -c 'resolve-image-digest\.sh' "$WORKFLOW"
  [ "$status" -eq 0 ]
  [ "$output" -gt 0 ]

  # Zweiter Anker: der Login-Step existiert und ist schneidbar.
  run _login_step
  [ "$status" -eq 0 ]
  [ -n "$output" ]

  # Eigentliche Aussage: das Passwort ist GH_PAT, nicht GITHUB_TOKEN.
  step="$(_login_step)"
  echo "$step" | grep -q 'password:.*secrets\.GH_PAT'
  ! echo "$step" | grep -q 'password:.*secrets\.GITHUB_TOKEN'
}

@test "ghcr-digest-auth: Login-Username ist der Repository-Owner, nicht der Actor" {
  [ -f "$WORKFLOW" ]

  # Positiv-Anker: der Login-Step traegt ueberhaupt ein username-Feld.
  step="$(_login_step)"
  echo "$step" | grep -q 'username:'

  # github.actor ist der ausloesende Akteur. Bei einem Bot-Push (release-please,
  # Renovate) ist das ein Bot-Name, der nicht zum PAT des Repository-Owners passt —
  # der Login bricht dann ausgerechnet bei den regelmaessigen automatischen Pushes.
  # Die vier bestehenden GH_PAT-Workflows nutzen einheitlich repository_owner.
  echo "$step" | grep -q 'username:.*github\.repository_owner'
  ! echo "$step" | grep -q 'username:.*github\.actor'
}

@test "ghcr-digest-auth: GH_PAT-Konvention deckt sich mit den Build-Workflows" {
  # Gilt nur fuer den docker/login-action-Pfad, erkennbar am `password:`-Feld.
  # Bewusst NICHT alle GH_PAT-Nutzer: build-rustdesk-installer.yml reicht dasselbe
  # Secret als CRANE_PASSWORD bzw. GH_TOKEN per Env weiter und hat gar kein
  # username-Feld. Eine Assertion ueber "alle GH_PAT-Workflows" waere dort
  # zwangslaeufig rot, ohne dass etwas falsch ist.
  run bash -c "grep -l 'password:.*secrets\.GH_PAT' '${REPO_ROOT}/.github/workflows/'build-*.yml | wc -l"
  [ "$status" -eq 0 ]
  [ "$output" -gt 0 ]

  # Jeder dieser Workflows paart GH_PAT mit repository_owner — der Renderer erbt
  # damit ein etabliertes Muster, keine Sonderloesung.
  run bash -c "for f in \$(grep -l 'password:.*secrets\.GH_PAT' '${REPO_ROOT}/.github/workflows/'build-*.yml); do
                 grep -q 'username:.*github\.repository_owner' \"\$f\" || echo \"MISMATCH: \$f\"
               done"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}
