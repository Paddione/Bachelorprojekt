# Design: Batch: SA-Security-Fixes (SEC-01/02/03/04)

## Architecture & Implementation Strategy

### 1. SEC-01: SESSIONS_DOMAIN in schema.yaml & mentolder.yaml
- **Schema**: In environments/schema.yaml eine neue env_vars-Definition fuer SESSIONS_DOMAIN aufnehmen:
  - required: false
  - default_dev: ""
  - In environments/fleet-mentolder.yaml ist SESSIONS_DOMAIN: sessions.mentolder.de bereits vorhanden.
  - In environments/mentolder.yaml ebenfalls nachtragen, damit env-resolve.sh mentolder konsistent bleibt.
- **Render-Guard**: BATS-Guard in tests/spec/fleet-operations/vaultwarden-smtp-from.bats oder neuem Guard, der prueft, dass sessions-wildcard niemals dnsNames: ["*."] enthaelt.

### 2. SEC-02: flux-webhook Platzhalter
- flux/clusters/fleet/ ist cluster-spezifisch (nur fuer Fleet Mentolder).
- In flux/clusters/fleet/bootstrap/certificate-flux-webhook.yaml:
  - dnsNames: ["flux-webhook.mentolder.de"]
- In flux/clusters/fleet/bootstrap/ingressroute-flux-webhook.yaml:
  - match: Host("flux-webhook.mentolder.de")

### 3. SEC-03: ipv64 ACME-Challenge Cleanup
- Untersuchung der Berechtigungen des gesetzten API-Tokens in cert-manager/ipv64-api-key.
- Loeschen der verwaisten Challenge workspace-wildcard-1-2121410201-4187026561 im Namespace workspace-korczewski.

### 4. SEC-04: korczewski.de Rechtssicherheit (503 Impressum/Datenschutz)
- Das Deployment website im Namespace website-korczewski steht auf replicas: 0.
- Fuer korczewski.de:
  - Bereitstellung einer leichtgewichtigen statischen HTML-Seite fuer /impressum und /datenschutz in website-korczewski (1 Pod) ausserhalb des suspendierten Stacks.
