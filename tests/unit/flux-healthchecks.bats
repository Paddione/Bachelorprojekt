#!/usr/bin/env bats
# flux-healthchecks.bats — T002313
#
# Ein healthCheck in einer Flux-Kustomization ist ein Gate VOR dem Applizieren:
# Flux wartet, bis alle genannten Ziele gesund sind. Steht dort ein Workload,
# den die Kustomization gar nicht ausrollt, ist der Eintrag als Gate wertlos —
# und macht im schlimmsten Fall fremde Infrastruktur zum Blocker fuer den
# gesamten Brand-Stack.
#
# Vorfall 2026-07-27: ks-mentolder.yaml gatete auf Deployment/traefik in
# namespace workspace. Dort existiert nur oauth2-proxy-traefik; das echte
# traefik laeuft Helm-verwaltet in kube-system. Zusammen mit einem unhealthy
# pocket-id (zerstoerte DB-Passwoerter, T002306) entstand ein Deadlock: das
# Health-Gate hing, dadurch konnte der Fix nicht ausgerollt werden, der die
# Passwoerter repariert haette. lastAppliedRevision war leer.

load test_helper

PROJECT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
FLUX_DIR="$PROJECT_DIR/flux/clusters/fleet"

# Jedes healthCheck-Ziel muss ein Workload sein, den das Repo unter k3d/ auch
# wirklich definiert. Das ist die eigentliche Regel — nicht "traefik ist boese".
@test "T002313: every Kustomization healthCheck targets a Deployment the repo defines" {
  # Sammelt alle metadata.name-Werte, die unter "kind: Deployment" stehen —
  # ein blosses grep nach dem Namen wuerde auch Middleware-, Service- oder
  # Ingress-Eintraege treffen und den Test zahnlos machen.
  local deployed
  deployed=$(awk '
    /^kind: Deployment$/ { in_dep=1; next }
    /^kind: / { in_dep=0 }
    in_dep && /^  name: / { print $2; in_dep=0 }
  ' "$PROJECT_DIR"/k3d/*.yaml | sort -u)

  local missing=""
  for ks in "$FLUX_DIR"/ks-mentolder.yaml "$FLUX_DIR"/ks-korczewski.yaml; do
    [[ -f "$ks" ]] || continue
    local names n
    names=$(sed -n '/^  healthChecks:/,/^  [a-z]/p' "$ks" | grep -E '^\s+name: ' | awk '{print $2}')
    for n in $names; do
      grep -qxF "$n" <<<"$deployed" || missing="${missing} ${ks##*/}:${n}"
    done
  done
  [[ -z "$missing" ]] || {
    echo "healthCheck-Ziele ohne Deployment-Definition unter k3d/:$missing" >&2
    echo "--- im Repo definierte Deployments ---" >&2
    echo "$deployed" >&2
    false
  }
}

@test "T002313: no Kustomization gates on traefik (Helm-managed in kube-system)" {
  run bash -c "grep -l 'name: traefik' '$FLUX_DIR'/ks-*.yaml 2>/dev/null | wc -l"
  [[ "$output" -eq 0 ]]
}
