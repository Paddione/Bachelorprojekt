#!/usr/bin/env bats
# tests/spec/sessions-server/domain-config.bats
# SSOT: openspec/specs/sessions-server.md — Zentrale Session-Domain-Konfiguration.
# Prüfmodus: Querschnitts-Konventionstest (Ergebnis manifestiert sich im
# Quelltext) — grep ist hier das angemessene Mittel; jeder Negativtest hat
# seinen Positiv-Anker im selben Test.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
}

@test "Positiv-Anker: SESSIONS_DOMAIN ist in configmap-domains.yaml zentral definiert" {
  grep -qE '^[[:space:]]+SESSIONS_DOMAIN:[[:space:]]+"' "$REPO_ROOT/k3d/configmap-domains.yaml"
  value="$(sed -n 's/^[[:space:]]*SESSIONS_DOMAIN:[[:space:]]*"\([^"]*\)".*/\1/p' "$REPO_ROOT/k3d/configmap-domains.yaml")"
  [ -n "$value" ]
  # Das nginx-Manifest referenziert den Platzhalter, nicht einen Literalwert.
  grep -qF '${SESSIONS_DOMAIN}' "$REPO_ROOT/k3d/sessions-server.yaml"
}

@test "Negativ-Guard: k3d-Basis-Manifeste härten keine neuen Session-Domain-Literale ein" {
  # Positiv-Anker: der bekannte Legacy-Fallback existiert im Hub-Script — der
  # Test misst also gegen eine nicht-leere Referenzmenge.
  grep -rqF 'sessions.mentolder.de' "$REPO_ROOT/scripts/session-hub.sh"

  # Kommentarzeilen sind exempt (narrative Bezüge); gezählt wird nur
  # konfigurativer Inhalt.
  offenders="$(grep -rnF --include='*.yaml' 'sessions.mentolder.de' \
                "$REPO_ROOT/k3d" \
                | grep -v 'configmap-domains.yaml:' \
                | grep -vE '^[^:]+:[0-9]+:[[:space:]]*#' || true)"
  [ -z "$offenders" ] || {
    echo "Hartcodierte Session-Domain außerhalb der zentralen ConfigMap:" >&2
    printf '%s\n' "$offenders" >&2
    return 1
  }
}
