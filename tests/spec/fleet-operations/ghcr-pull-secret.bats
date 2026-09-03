#!/usr/bin/env bats
# tests/spec/fleet-operations/ghcr-pull-secret.bats
# SSOT: openspec/specs/fleet-operations.md
# Ticket: T900036 (Batch T900041)
#
# PRUEFMODUS: Render-Output. Geprueft wird, was der Overlay-Build fuer die
# Sync-Ziele emittiert — nicht die Existenz eines Strings in der Quelle.
#
# Befund (2026-09-03, fleet): ghcr-pull-secret existiert in workspace,
# workspace-staging und website, fehlt aber in workspace-office (collabora,
# 34355 FailedToRetrieveImagePullSecret-Events) und website-staging (98x).
# Die Pods laufen nur noch, weil die Images lokal gecacht sind; der naechste
# Pull schlaegt fehl.
#
# Provisioniert wurde das Secret bisher ausschliesslich imperativ
# (task workspace:office:pull-secret / task website:pull-secret). Prod ist
# seit der Flux-Umstellung pull-based — diese Tasks laufen dort nie, also
# driftete jeder Namespace weg, den zuletzt niemand von Hand bedient hat.
#
# Die Aufloesung nutzt den Mechanismus, den das Repo fuer genau dieses
# Problem schon hat: den tls-sync CronJob (prod/reflector.yaml), der Secrets
# ueber die K8s-API in Ziel-Namespaces kopiert. Damit bleibt das Secret
# deklarativ verwaltet, ohne dass ein GHCR_PAT ins Repo wandert.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  REFL="${REPO_ROOT}/prod/reflector.yaml"
}

@test "T900036: der Sync-CronJob verteilt ghcr-pull-secret in die Ziel-Namespaces" {
  [ -f "$REFL" ]

  # Positiv-Anker (T002356-M1): der CronJob existiert und syncet weiterhin
  # das Wildcard-TLS-Secret. Ohne ihn waeren die Aussagen unten gegenstandslos.
  run grep -c 'name: tls-sync' "$REFL"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]

  # Der Guard: das Pull-Secret wird mitverteilt ...
  run grep -c 'ghcr-pull-secret' "$REFL"
  [ "$status" -eq 0 ] || { echo "prod/reflector.yaml syncet ghcr-pull-secret nicht" >&2; return 1; }
  [ "$output" -ge 1 ]

  # ... und zwar in genau die beiden Namespaces, in denen es gefehlt hat.
  # workspace-office steht literal (brand-unabhaengig), website-staging kommt
  # aus ${WEBSITE_NAMESPACE} des staging-Envs.
  run grep -c 'workspace-office' "$REFL"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
  run grep -c 'WEBSITE_NAMESPACE' "$REFL"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}

@test "T900036: der Sync kopiert dockerconfigjson, nicht nur tls-Felder" {
  [ -f "$REFL" ]

  # Ein Pull-Secret traegt .dockerconfigjson und Typ
  # kubernetes.io/dockerconfigjson. Die bestehende sync_secret-Funktion liest
  # ausschliesslich tls.crt/tls.key — sie kann ein Pull-Secret nicht kopieren.
  run grep -c 'dockerconfigjson' "$REFL"
  [ "$status" -eq 0 ] || { echo "kein dockerconfigjson-Pfad im Sync — Pull-Secret kaeme leer an" >&2; return 1; }
  [ "$output" -ge 2 ]
}

@test "T900036: der Sync rendert fuer beide Brands und fuer staging auf" {
  command -v kubectl  >/dev/null 2>&1 || skip "kubectl not installed"
  command -v envsubst >/dev/null 2>&1 || skip "envsubst not installed"
  cd "$REPO_ROOT" || return 1

  local overlay
  for overlay in mentolder korczewski staging; do
    # shellcheck disable=SC1091
    source scripts/env-resolve.sh "$overlay" >/dev/null 2>&1 || skip "env-resolve unavailable for ${overlay}"
    local rendered
    rendered="$(kubectl kustomize "prod-fleet/${overlay}" --load-restrictor=LoadRestrictionsNone 2>/dev/null | envsubst)"       || skip "kustomize build failed for ${overlay}"

    # Der Render enthaelt 'ghcr-pull-secret' auch als imagePullSecrets-Referenz
    # in website.yaml, brett.yaml usw. Eine ungefilterte Suche waere daher
    # vakuos wahr. Der Guard grenzt deshalb auf den tls-sync-CronJob ein.
    local block
    block="$(printf '%s
' "$rendered" | awk '/name: tls-sync/,/^---$/')"

    # Positiv-Anker (T002356-M1): der CronJob-Block ist im Overlay enthalten
    # und traegt die Sync-Schleife. Ohne ihn waere die Aussage unten trivial.
    [ -n "$block" ] || { echo "${overlay}: tls-sync nicht im Render" >&2; return 1; }
    [[ "$block" == *"sync_secret"* ]]       || { echo "${overlay}: tls-sync-Block ohne sync_secret" >&2; return 1; }

    # Der Guard: das Pull-Secret wird innerhalb dieses Blocks verteilt ...
    [[ "$block" == *"ghcr-pull-secret"* ]]       || { echo "${overlay}: tls-sync verteilt ghcr-pull-secret nicht" >&2; return 1; }

    # ... und die Namespace-Platzhalter sind aufgeloest.
    [[ "$block" != *'${'* ]]       || { echo "${overlay}: unsubstituierte Platzhalter im tls-sync-Block" >&2; return 1; }
  done
}
