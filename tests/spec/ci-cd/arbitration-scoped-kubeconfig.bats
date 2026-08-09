#!/usr/bin/env bats
#
# T002944 — die Arbitration bekommt ihre Cluster-Credential als Secret, nicht
# aus dem Home des Runner-Users.
#
# Pruefmodus: YAML-Auswertung via yq. Ausnahme nach der Test-Resultats-
# Konvention [T002448-M4]: die Eigenschaft manifestiert sich ausschliesslich in
# der Workflow-Konfiguration. Sie zur Laufzeit zu messen hiesse, einen echten
# Arbitrations-Cluster zu erzeugen und den Runner zu beobachten.
#
# Vorgeschichte: der Runner lief als Desktop-User mit NOPASSWD-root; damit hatte
# jeder Workflow-Lauf beilaeufig die SSH-Keys der Prod-Nodes und die
# Fleet-Kubeconfig. Nach dem Umbau auf den unprivilegierten Dienst-User
# (ghrunner) gibt es kein Home mehr, aus dem sich eine Kubeconfig "ergibt" —
# `ticket.sh` braucht aber eine, weil es ueber `kubectl exec … psql` geht.
#
# Der zweite Test pinnt eine Falle, in die diese Aenderung selbst gelaufen ist:
# `steps.*.if` kann WEDER den `secrets`-Kontext lesen NOCH das step-eigene
# `env:`. Beide Varianten sehen richtig aus, die Bedingung ist aber immer
# falsch und der Schritt laeuft nie — lautlos. Deshalb muss das Secret auf
# JOB-Ebene gebunden sein.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  cd "$REPO" || return 1
  WF=".github/workflows/arbitration.yml"
}

@test "T002944: arbitration.yml ist lesbar und hat den arbitrate-Job (Positiv-Anker)" {
  # Positiv-Anker [T002356-M1]: ohne ihn liefen alle folgenden yq-Abfragen auf
  # einer fehlenden oder umbenannten Datei ins Leere und lieferten "null",
  # was sich von einem echten Befund nicht unterscheiden liesse.
  [ -f "$WF" ] || { echo "$WF fehlt"; return 1; }
  run yq -e '.jobs.arbitrate | has("steps")' "$WF"
  [ "$status" -eq 0 ] || { echo "arbitrate-Job oder seine steps fehlen"; false; }
}

@test "T002944: das Kubeconfig-Secret ist auf JOB-Ebene gebunden" {
  # Auf Step-Ebene waere es fuer das `if:` desselben Schritts unsichtbar.
  run yq -r '.jobs.arbitrate.env.ARBITRATION_KUBECONFIG // ""' "$WF"
  [ -n "$output" ] || {
    echo "ARBITRATION_KUBECONFIG nicht im job-level env — steps.*.if kann es dann nicht lesen" >&2
    false
  }
  case "$output" in
    *secrets.ARBITRATION_KUBECONFIG*) ;;
    *) echo "job-env liest nicht aus secrets: $output" >&2; false ;;
  esac
}

@test "T002944: die if-Bedingung des Kubeconfig-Schritts nutzt env, nicht secrets" {
  local cond
  cond="$(yq -r '.jobs.arbitrate.steps[] | select(.name == "Provide scoped kubeconfig for ticket escalation") | .if // ""' "$WF")"
  [ -n "$cond" ] || { echo "Kubeconfig-Schritt oder seine if-Bedingung fehlt" >&2; false; }

  case "$cond" in
    *env.ARBITRATION_KUBECONFIG*) ;;
    *) echo "if-Bedingung prueft nicht auf env.ARBITRATION_KUBECONFIG: $cond" >&2; false ;;
  esac
  case "$cond" in
    *secrets.*)
      echo "if-Bedingung liest den secrets-Kontext — in steps.*.if nicht verfuegbar, Schritt laeuft nie: $cond" >&2
      false ;;
  esac
}

@test "T002944: die Kubeconfig wird am Ende geschreddert, auch bei Abbruch" {
  # RUNNER_TEMP liegt im Home des Dienst-Users und wird zwischen Jobs nicht
  # zuverlaessig geleert — ohne diesen Schritt ueberlebt die Credential den Lauf.
  local cond
  cond="$(yq -r '.jobs.arbitrate.steps[] | select(.name == "Shred scoped kubeconfig") | .if // ""' "$WF")"
  [ -n "$cond" ] || { echo "Aufraeum-Schritt fehlt" >&2; false; }
  case "$cond" in
    *always*) ;;
    *) echo "Aufraeum-Schritt laeuft nicht bei always(): $cond" >&2; false ;;
  esac
}
