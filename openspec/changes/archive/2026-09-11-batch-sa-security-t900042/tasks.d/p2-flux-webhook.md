# Partial p2-flux-webhook: Literal domains for flux-webhook cert and ingressroute

## Focus
Platzhalter in flux-webhook Manifesten durch feste Domain flux-webhook.mentolder.de ersetzen.

## Touched Files
- flux/clusters/fleet/bootstrap/certificate-flux-webhook.yaml
- flux/clusters/fleet/bootstrap/ingressroute-flux-webhook.yaml

## Steps
1. flux/clusters/fleet/bootstrap/certificate-flux-webhook.yaml: dnsNames von flux-webhook.${PROD_DOMAIN} auf flux-webhook.mentolder.de aendern.
2. flux/clusters/fleet/bootstrap/ingressroute-flux-webhook.yaml: Host-Match von ${FLUX_WEBHOOK_HOST} auf flux-webhook.mentolder.de aendern.
3. Manifest-Validierung pruefen.
