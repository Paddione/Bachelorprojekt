#!/usr/bin/env bash
# scripts/vda/ticket/_ctx-guard.sh — Kubeconfig-Loopback-Drift-Guard [T015008].
#
# Hintergrund: Der Context `k3d-mentolder-dev` loeste nach einem Docker-Restart
# auf 127.0.0.1:6446 (lokaler k3d) statt 10.0.33.1:6446 (LAN) auf -> Ticket-
# Writes landeten 35 min in der falschen DB (Dual-Write-Split-Brain, Folge
# T015005). Dieser Guard bricht hart ab, bevor ein Write ueber einen solchen
# Pfad geht.
#
# Aufruf:   bash _ctx-guard.sh <CTX>
# Sourcen:  source _ctx-guard.sh && _ctx_guard <CTX>
# Exit:     0 = Server ok (oder Escape-Hatch), 1 = Drift / fail-closed.
#
# Rein lokale Config-Lektuere (kubectl config view) — kein Cluster-Zugriff.
# Scope-Grenze: der Guard sieht nur die Loopback-Klasse. Ghost-Instanzen hinter
# identischem Context (zweite Split-Brain-Episode, T015168) kann er nicht
# erkennen — dafuer gilt: nach jedem DB-Write gegen die SSOT-Ruecklesung pruefen.

set -uo pipefail

_ctx_guard() {
  local ctx="${1:-}"
  if [[ -z "$ctx" ]]; then
    echo "ERROR [T015008] _ctx-guard: kein Context uebergeben (Aufruf: _ctx-guard.sh <CTX>)" >&2
    return 1
  fi

  local cluster server
  cluster="$(kubectl config view -o jsonpath="{.contexts[?(@.name==\"$ctx\")].context.cluster}" 2>/dev/null)" || true
  if [[ -z "$cluster" ]]; then
    echo "ERROR [T015008] _ctx-guard: Context '$ctx' nicht in kubeconfig gefunden (fail-closed)." >&2
    echo "  Remediation: TICKET_CTX=<vorhandener Context> setzen oder kubeconfig reparieren." >&2
    return 1
  fi

  server="$(kubectl config view -o jsonpath="{.clusters[?(@.name==\"$cluster\")].cluster.server}" 2>/dev/null)" || true
  if [[ -z "$server" ]]; then
    echo "ERROR [T015008] _ctx-guard: Cluster '$cluster' (Context '$ctx') hat keinen server-Eintrag (fail-closed)." >&2
    echo "  Remediation: kubeconfig reparieren (kubectl config set-cluster '$cluster' --server=…)." >&2
    return 1
  fi

  # Authority aus der URL schneiden (Schema + Pfad weg); der Port bleibt drin,
  # die Glob-Muster unten erfassen host:port mit. Bracketed IPv6 bleibt ganz.
  local auth="$server"
  auth="${auth#*://}"
  auth="${auth%%/*}"

  case "$auth" in
    localhost|localhost:*|127.*|\[::1\]|\[::1\]:*|::1)
      if [[ "${TICKET_ALLOW_LOCAL_CTX:-0}" == "1" ]]; then
        echo "WARN [T015008] _ctx-guard: Context '$ctx' loest auf loopback auf ($server) — bewusst erlaubt via TICKET_ALLOW_LOCAL_CTX=1." >&2
        return 0
      fi
      echo "ERROR [T015008] _ctx-guard: Kubeconfig-Context-Drift — Context '$ctx' resolves to a loopback server ($server)." >&2
      echo "  Ticket-Writes ueber diesen Pfad landen in der falschen Datenbank (Dual-Write-Split-Brain, vgl. T015008/T015005)." >&2
      echo "  Remediation: TICKET_CTX=<korrekter Context> setzen oder kubeconfig reparieren" >&2
      echo "  (kubectl config set-context '$ctx' --cluster=<LAN-Cluster> bzw. k3d kubeconfig merge)." >&2
      echo "  Bewusster Ausnahme-Modus: TICKET_ALLOW_LOCAL_CTX=1" >&2
      return 1
      ;;
    *)
      return 0
      ;;
  esac
}

# Nur bei direkter Ausfuehrung die Main-Logik laufen lassen; beim Sourcing
# steht nur die Funktion bereit.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  _ctx_guard "$@"
  exit $?
fi
