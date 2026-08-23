# Proposal: pocket-id-seed-label-isolation

## Why

Der Seed-Job `pocket-id-client-seed` trägt im Pod-Template
(`k3d/pocket-id-client-seed.yaml`, `spec.template.metadata.labels`) das Label
`app: pocket-id`. Der Service `pocket-id` selektiert genau darauf
(`k3d/pocket-id.yaml` `spec.selector.app`) — der Seed-Pod wird dadurch zum
Service-Endpoint, und jeder zweite Request gegen `http://pocket-id:1411`
landet im Seed-Container (kein Listener) → Connection Refused.

Beleg: Während der Dev-Cluster-Migration (2026-08-23) verbrannte der
Original-Job sein BackoffLimit über 18 min; ein Lauf mit bereinigtem
Pod-Label lief in 9 min durch. Die unter T001327 dokumentierten
intermittierenden Verbindungsablehnungen sind damit systematisch erklärt.

## What

Pod-Template-Label ändern: `app: pocket-id` → `app: pocket-id-client-seed`.
Das Label am Job-Objekt selbst bleibt (Jobs sind keine Service-Endpoints).

Verifiziert sicher: Beide NetworkPolicies auf `app: pocket-id`
(`k3d/network-policies.yaml`, allow-website/devstack-to-pocket-id-ingress)
sind ingress-only und betreffen den nie angesprochenen Seed-Pod nicht;
RBAC-Labels (`*-rbac.yaml`) hängen an ServiceAccounts, nicht an Pod-Templates.
Eine dauerhafte Struktur-Prüfung verhindert die Rückkehr dieser Fehlerklasse:
`tests/spec/pocket-id-seed-label-isolation/` (RED bei Auslieferung dieses Plans).

_Ticket: T014938_
