#!/usr/bin/env bats
# tests/spec/fleet-operations/reflector-annotations.bats
# SSOT: openspec/specs/fleet-operations.md (Delta: openspec/changes/reflector-annotations)
# T002880: Drift-Gate — die Wildcard-Certificate-Manifeste tragen keine
# reflector.v1.emberstack.eu-Annotationen, weil kein Reflector-Controller im
# fleet-Cluster laeuft. Der reale Sync-Mechanismus ist der tls-sync CronJob
# (prod/reflector.yaml, monatlich via K8s-API).
#
# PRUEFMODUS: Quelltext (Konfigurationskonvention). Ausnahmefall der
# Test-Resultats-Konvention (T002448-M4): der Defekt sitzt in der
# Manifest-Konfiguration, nicht im Laufzeitverhalten; ein Laufzeit-Test
# braeuchte Cluster-Zugang, den die CI nicht hat. Der Guard schuetzt die
# Konvention "keine toten Reflector-Annotationen".
#
# HINWEIS: Wird spaeter doch ein Reflector-Controller installiert, sind die
# Annotationen wieder legitim — dann diesen Guard bewusst entfernen.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
}

@test "T002880: tls-sync CronJob ist der reale Sync-Mechanismus (Positiv-Anker)" {
  # Positiv-Anker (T002356-M1): Der Mechanismus, der die TLS-Kopien pflegt,
  # existiert in prod/reflector.yaml als CronJob namens tls-sync.
  run grep -c '^kind: CronJob' "${REPO_ROOT}/prod/reflector.yaml"
  [ "$status" -eq 0 ] || { echo "MISSING: prod/reflector.yaml ohne CronJob"; return 1; }
  [ "$output" = "1" ]

  run grep -c 'name: tls-sync' "${REPO_ROOT}/prod/reflector.yaml"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}

@test "T002880: Wildcard-Certificate-Manifeste existieren weiterhin (Positiv-Anker)" {
  # Positiv-Anker: Beide Manifeste deklarieren das Certificate; erst dann ist
  # die Negativ-Aussage aussagekraeftig (fehlte die Datei, waere "keine
  # Annotationen" trivial wahr).
  for f in prod/wildcard-certificate.yaml prod-fleet/staging/wildcard-certificate.yaml; do
    run grep -c '^kind: Certificate' "${REPO_ROOT}/${f}"
    [ "$status" -eq 0 ] || { echo "MISSING: ${f}"; return 1; }
    [ "$output" = "1" ]
  done
}

@test "T002880: keine reflector.v1.emberstack.eu-Annotationen in prod/, prod-fleet/, k3d/" {
  # Negativ-Aussage: Kein Manifest behauptet Reflector-Automatik, die kein
  # Controller im Cluster bedient. Fixed-String (grep -F), scan ueber die
  # Manifest-Baeume. rc=1 (kein Treffer) ist der Gruenzustand.
  run grep -Frl 'reflector.v1.emberstack.eu' "${REPO_ROOT}/prod" "${REPO_ROOT}/prod-fleet" "${REPO_ROOT}/k3d"
  [ "$status" -eq 1 ] || { echo "FOUND dead reflector annotations in: ${output}"; return 1; }
  [ -z "$output" ]
}
