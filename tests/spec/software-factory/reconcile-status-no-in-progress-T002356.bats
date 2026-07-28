#!/usr/bin/env bats
# tests/spec/software-factory/reconcile-status-no-in-progress-T002356.bats
#
# T002356-M2: nach dem stage-plan fuer T002350 stand das Ticket auf status=in_progress
# statt plan_staged, obwohl keinerlei Implementierung stattgefunden hatte. Die im
# Mishap notierte Hypothese war, scripts/factory/reconcile-ticket-status.sh hebe ein
# Ticket mit gesetztem plan_ref und existierendem Branch automatisch auf in_progress.
#
# Verifikation (T002356): reconcile-ticket-status.sh gelesen — das Skript kennt genau
# fuenf Muster (awaiting_deploy-with-done_at, terminal-pr-not-merged, terminal-no-pr,
# plan_staged-without-plan-ref, plan_staged-orphan-branch) und transitioniert dabei nur
# nach done, awaiting_deploy oder setzt attention_mode='needs_human'. Es setzt an
# KEINER Stelle status='in_progress'. Die Hypothese ist WIDERLEGT — der tatsaechliche
# in_progress-Uebergang fuer plan_staged-Tickets passiert in scripts/factory/slots.sh
# beim Slot-Claim (Dispatch-Zeitpunkt), was by design ist (Slot-Claim = "Factory hat
# die Bearbeitung aufgenommen"), nicht in reconcile-ticket-status.sh.
#
# Dieser Test haelt die Widerlegung fest und schuetzt gegen eine kuenftige
# Wiedereinfuehrung des im Mishap beschriebenen Fehlverhaltens in genau diesem Skript.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  SCRIPT="${REPO_ROOT}/scripts/factory/reconcile-ticket-status.sh"
}

# Nicht-Kommentarzeilen — sonst matcht dieser Kommentarblock selbst die Assertion.
_code() { grep -vE '^\s*#' "$1"; }

@test "T002356-M2: reconcile-ticket-status.sh transitioniert ueberhaupt Status (Positiv-Anker)" {
  # Positiv-Anker: das Skript setzt tatsaechlich Status-Uebergaenge (sonst waere eine
  # Abwesenheitspruefung fuer 'in_progress' vakuos — die Datei koennte leer sein).
  run bash -c "_code() { grep -vE '^\s*#' \"\$1\"; }; _code '$SCRIPT' | grep -cE \"fix_status=|SET status = :'fix_status'\""
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}

@test "T002356-M2: reconcile-ticket-status.sh setzt an keiner Stelle status='in_progress'" {
  # Die im Mishap notierte Hypothese widerlegt: kein Aufrufpfad in diesem Skript
  # transitioniert nach in_progress. Vorbedingung (obiger Test) bereits erfuellt —
  # das Skript transitioniert aktiv, nur eben nicht dorthin.
  run bash -c "_code() { grep -vE '^\s*#' \"\$1\"; }; _code '$SCRIPT' | grep -cE \"'in_progress'\" || true"
  [ "$output" -eq 0 ]
}
