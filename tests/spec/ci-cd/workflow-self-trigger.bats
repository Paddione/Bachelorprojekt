#!/usr/bin/env bats
# tests/spec/ci-cd/workflow-self-trigger.bats — Selbst-Referenz in push.paths [T002868]
#
# PRUEFMODUS: Quelltext-Inspektion (nicht Output-Verifikation).
# Begruendung: Gegenstand ist der Trigger-Filter eines GitHub-Actions-Workflows. Ob ein
# Workflow bei einer bestimmten Aenderung anspringt, entscheidet GitHub anhand dieser
# YAML-Zeilen; lokal gibt es dazu keinen Laufzeit-Output. Das ist die in CLAUDE.md
# §Test-Resultats-Konvention [T002448-M4] benannte Ausnahme fuer CI-Konfiguration.
#
# Hintergrund: Ein Workflow mit push.paths, der seine eigene Datei nicht listet, laeuft nach
# einer Aenderung an sich selbst nicht an — der Fix liegt auf main und wirkt nicht, ohne
# Fehlermeldung, weil schlicht kein Lauf stattfindet.
#
# Zweimal eingetreten:
#   T002156/T002157 — Fix am Renderer blieb wirkungslos; T002157 nahm daraufhin die
#                     Render-SKRIPTE in die Pfade auf, die Workflow-Datei selbst aber nicht.
#   T002837         — Merge-Commit f813fec4b loeste 8 Runs aus, "Render Fleet Artifact"
#                     war nicht darunter, obwohl der Commit genau diese Datei aenderte.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  WF_DIR="${REPO_ROOT}/.github/workflows"
}

# Alle Workflows, die ihren push-Trigger mit einem paths-Filter einschraenken.
_workflows_with_paths() {
  for f in "$WF_DIR"/*.yml; do
    [ -f "$f" ] || continue
    grep -qE '^[[:space:]]+paths:' "$f" && basename "$f"
  done
  # Explizit 0: ohne das traegt die Funktion den Exit-Code des letzten grep nach aussen,
  # und der schlaegt fehl, sobald die alphabetisch letzte Workflow-Datei keinen
  # paths-Filter hat. Der Positiv-Anker wuerde dann aus dem falschen Grund rot.
  return 0
}

@test "workflow-self-trigger: jeder Workflow mit push.paths listet seine eigene Datei" {
  # Positiv-Anker [T002356-M1]: es gibt ueberhaupt Workflows mit paths-Filter.
  # Ohne ihn waere die Aussage bei leerer Kandidatenmenge trivial erfuellt.
  run _workflows_with_paths
  [ "$status" -eq 0 ]
  [ -n "$output" ]

  # Zweiter Anker: die Konvention wird im Bestand bereits mehrheitlich eingehalten.
  # Faellt dieser Wert auf 0, ist sie aufgegeben — dann ist der Guard neu zu bewerten
  # und nicht einfach anzupassen.
  conform=0
  while read -r wf; do
    [ -n "$wf" ] || continue
    grep -q "\.github/workflows/${wf}" "${WF_DIR}/${wf}" && conform=$((conform + 1))
  done < <(_workflows_with_paths)
  [ "$conform" -gt 0 ]

  # Eigentliche Aussage: kein Workflow weicht ab. Die Meldung nennt die Abweichler
  # namentlich — ein blosses "failed" zwingt sonst zur Nachforschung.
  missing=""
  while read -r wf; do
    [ -n "$wf" ] || continue
    grep -q "\.github/workflows/${wf}" "${WF_DIR}/${wf}" || missing="${missing} ${wf}"
  done < <(_workflows_with_paths)

  if [ -n "$missing" ]; then
    echo "Workflows mit push.paths, die sich selbst nicht listen:${missing}" >&2
    echo "Fix: '.github/workflows/<name>.yml' in den paths-Block der jeweiligen Datei aufnehmen." >&2
    return 1
  fi
}

@test "workflow-self-trigger: render-fleet-artifact listet sich selbst" {
  # Der konkrete Ausloeser dieses Tickets, separat gefuehrt: er ist der Workflow, dessen
  # Ausfall die gesamte Deploy-Kette anhaelt (kein Artefakt -> Flux rollt den alten Stand
  # weiter aus). Ein Sammeltest wuerde bei einer spaeteren Lockerung mitwandern.
  WF="${WF_DIR}/render-fleet-artifact.yml"
  [ -f "$WF" ]

  # Positiv-Anker: der Workflow hat ueberhaupt einen paths-Filter. Ohne ihn liefe er bei
  # jedem Push und die Forderung waere gegenstandslos.
  run grep -cE '^[[:space:]]+paths:' "$WF"
  [ "$status" -eq 0 ]
  [ "$output" -gt 0 ]

  grep -q "\.github/workflows/render-fleet-artifact\.yml" "$WF"
}
