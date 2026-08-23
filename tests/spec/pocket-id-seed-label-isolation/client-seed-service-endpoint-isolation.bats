#!/usr/bin/env bats
# Guard gegen Service-Endpoint-Kollision des pocket-id-client-seed-Jobs [T014938].
#
# Prüfmodus: Struktur-Verifikation via yq. Der Defekt manifestiert sich im
# Manifest selbst (Pod-Template-Label trifft den Service-Selector) — eine
# YAML-Strukturprüfung ist hier das angemessene Mittel (Ausnahme der
# Test-Resultats-Konvention T002448-M4, dokumentiert gemäß Konvention).
#
# Hintergrund: Der Service `pocket-id` selektiert `app: pocket-id`. Trägt das
# Pod-Template des Seed-Jobs dasselbe Label, wird der Seed-Pod zum
# Service-Endpoint und frisst Verbindungen gegen :1411 (Connection Refused,
# siehe T001327/T014938).
#
# Run: tests/unit/lib/bats-core/bin/bats tests/spec/pocket-id-seed-label-isolation/

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  K3D="${REPO_ROOT}/k3d"
  SERVICE_MANIFEST="${K3D}/pocket-id.yaml"
  SEED_MANIFEST="${K3D}/pocket-id-client-seed.yaml"
}

@test "T014938: pocket-id service selector does not match client-seed job pod template" {
  # Positiv-Anker 1: Der Service-Selector existiert überhaupt.
  svc_selector="$(yq 'select(.kind == "Service" and .metadata.name == "pocket-id") | .spec.selector.app' "$SERVICE_MANIFEST")"
  if [ -z "$svc_selector" ] || [ "$svc_selector" = "null" ]; then
    echo "Anker fehlgeschlagen: Service pocket-id hat keinen app-Selector" >&2
    return 1
  fi

  # Positiv-Anker 2: Das Pod-Template des Seed-Jobs trägt überhaupt ein app-Label.
  tmpl_label="$(yq 'select(.kind == "Job") | .spec.template.metadata.labels.app' "$SEED_MANIFEST")"
  if [ -z "$tmpl_label" ] || [ "$tmpl_label" = "null" ]; then
    echo "Anker fehlgeschlagen: Seed-Job-Pod-Template hat kein app-Label" >&2
    return 1
  fi

  # Die eigentliche Zusicherung: Template-Label ≠ Service-Selector.
  if [ "$tmpl_label" = "$svc_selector" ]; then
    echo "Seed-Job-Pod-Template-Label '$tmpl_label' matcht den Service-Selector —" >&2
    echo "der Seed-Pod wird zum pocket-id Service-Endpoint (Connection Refused)" >&2
    return 1
  fi
}
