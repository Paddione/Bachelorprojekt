---
ticket_id: null
plan_ref: null
status: active
date: 2026-08-23
---

# Design: pocket-id-seed-label-isolation

## Why

Der Seed-Job `pocket-id-client-seed` trägt im Pod-Template (`k3d/pocket-id-client-seed.yaml:70`)
das Label `app: pocket-id`. Der Service `pocket-id` selektiert genau auf dieses Label
(`k3d/pocket-id.yaml:361-362`) — der Seed-Pod wird dadurch zum Service-Endpoint. Jeder zweite
Request gegen `http://pocket-id:1411` landet im Seed-Container (kein Listener auf 1411) →
Connection Refused.

Beleg (Live, 2026-08-23): Während der Dev-Cluster-Migration verbrannte der Original-Job sein
BackoffLimit über 18 min; ein Lauf mit bereinigtem Pod-Label lief in 9 min durch. Die früher als
„Pocket-ID-Macke" dokumentierten intermittierenden Verbindungsablehnungen (T001327) sind damit
systematisch erklärt.

## What

Pod-Template-Label ändern: `app: pocket-id` → `app: pocket-id-client-seed`
(`spec.template.metadata.labels`, Zeile ~70). Das Label am Job-Objekt selbst (Zeile ~64) bleibt:
Jobs sind keine Service-Endpoints und harmlos.

## Decisions

| Frage | Entscheidung | Begründung |
|---|---|---|
| Umbenennen vs. Entfernen des Labels | **Umbenennen** | Erhält bewusste Label-Gruppierung/Dokumentierbarkeit; Entfernen bringt keinen Zusatznutzen |
| Job-Objekt-Label (Z.64) | **unverändert lassen** | Jobs erscheinen nicht als Endpoints |
| NetworkPolicy-Auswirkung | **sicher** | Beide Policies auf `app: pocket-id` (`k3d/network-policies.yaml:346,368`) sind ingress-only; niemand spricht den Seed-Pod an; Egress hängt nicht am Label |
| RBAC-Dateien (`*-rbac.yaml`) | **unverändert** | Labels dort hängen an ServiceAccount/Role-Bindings, nicht an Pod-Templates |

## Verification

Nach Apply: `kubectl get endpoints pocket-id -n <ns>` darf nur noch die Deployment-Pods zeigen;
der Failing Test (`tests/spec/pocket-id-seed-label-isolation/`) prüft die Struktur dauerhaft:
Template-Label des Seed-Jobs ≠ Service-Selector.
