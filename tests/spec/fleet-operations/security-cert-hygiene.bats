#!/usr/bin/env bats
# tests/spec/fleet-operations/security-cert-hygiene.bats
# Verifiziert SA-SEC-01 und SA-SEC-02:
# 1. SESSIONS_DOMAIN ist im Schema deklariert und mentolder setzt sie.
# 2. flux-webhook Manifeste enthalten keine unersetzten ${PROD_DOMAIN} oder ${FLUX_WEBHOOK_HOST} Platzhalter.

setup() {
  load "../../unit/lib/bats-support/load"
  load "../../unit/lib/bats-assert/load"
}

@test "SA-SEC-01: SESSIONS_DOMAIN ist in schema.yaml und mentolder.yaml definiert" {
  run grep -n "name: SESSIONS_DOMAIN" environments/schema.yaml
  assert_success

  run grep -n "SESSIONS_DOMAIN: sessions.mentolder.de" environments/mentolder.yaml
  assert_success
}

@test "SA-SEC-02: flux-webhook Certificate enthaelt keine ${PROD_DOMAIN} Platzhalter" {
  run grep "\${PROD_DOMAIN}" flux/clusters/fleet/bootstrap/certificate-flux-webhook.yaml
  assert_failure

  run grep "flux-webhook.mentolder.de" flux/clusters/fleet/bootstrap/certificate-flux-webhook.yaml
  assert_success
}

@test "SA-SEC-02: flux-webhook IngressRoute enthaelt keine ${FLUX_WEBHOOK_HOST} Platzhalter" {
  run grep "\${FLUX_WEBHOOK_HOST}" flux/clusters/fleet/bootstrap/ingressroute-flux-webhook.yaml
  assert_failure

  run grep "flux-webhook.mentolder.de" flux/clusters/fleet/bootstrap/ingressroute-flux-webhook.yaml
  assert_success
}
