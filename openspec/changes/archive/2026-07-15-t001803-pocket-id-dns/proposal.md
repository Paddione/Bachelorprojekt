---
ticket_id: T001803
---

# Proposal: t001803-pocket-id-dns

## Why

Die Website im `website` Namespace kann `pocket-id:1411` nicht erreichen.
Der OIDC-Login schlägt fehl, weil DNS `pocket-id` (kurzer Name) im
`workspace` Namespace aufgelöst wird — die Website läuft aber im
separaten `website` Namespace. Dort existiert kein `pocket-id` Service,
also schlägt die Auflösung mit `NXDOMAIN` fehl.

Ursache: `fleet-mentolder.yaml` setzt `POCKET_ID_URL` auf den kurzen
Namen `http://pocket-id:1411`, obwohl Website und Pocket-ID in
unterschiedlichen Namespaces laufen. Die `mentolder.yaml` (non-fleet)
hat korrekt den FQDN `http://pocket-id.workspace.svc.cluster.local:1411`.

In dev ist `POCKET_ID_URL: "http://pocket-id:1411"` korrekt, weil dort
Website und Pocket-ID im selben `workspace` Namespace leben.

NetworkPolicies sind korrekt konfiguriert:
- `allow-egress-to-workspace` im `website` Namespace erlaubt Egress
  an alle Pods im `workspace` Namespace (keine Port-Beschränkung).
- `allow-website-to-pocket-id-ingress` im `workspace` Namespace erlaubt
  Ingress von `${WEBSITE_NAMESPACE}` auf Port 1411/TCP.

## What

`POCKET_ID_URL` in `fleet-mentolder.yaml` und `fleet-korczewski.yaml`
auf den FQDN setzen, damit DNS-Auflösung über Namespace-Grenzen hinweg
funktioniert. Den irreführenden Kommentar in `k3d/pocket-id.yaml`
korrigieren, der behauptet, der kurze Name funktioniere in beiden
Environments.

## Purpose

Der OIDC-Login-Flow (Website → Pocket-ID Token-Exchange) soll in der
Prod-Umgebung (fleet) funktionieren, ohne dass die Website im selben
Namespace wie Pocket-ID laufen muss. Beide Brand-Deployments
(mentolder, korczewski) sollen den korrekten FQDN verwenden.

## Requirements

### Requirement: Website erreicht Pocket-ID über FQDN

The website pods SHALL resolve `pocket-id` via the fully-qualified
cluster DNS name `<pocket-id-service>.<workspace-namespace>.svc.cluster.local`,
not via the short service name. The `POCKET_ID_URL` env var in the
fleet overlay configs SHALL contain the FQDN.

#### Scenario: fleet-mentolder uses FQDN

- **GIVEN** the fleet-mentolder env file (`environments/fleet-mentolder.yaml`) is read by the deploy task
- **WHEN** the website pod starts and reads `POCKET_ID_URL` from its ConfigMap
- **THEN** the value is `http://pocket-id.workspace.svc.cluster.local:1411`
- **AND** DNS resolution of `pocket-id.workspace.svc.cluster.local` succeeds from the `website` namespace

#### Scenario: fleet-korczewski uses FQDN

- **GIVEN** the fleet-korczewski env file (`environments/fleet-korczewski.yaml`) is read by the deploy task
- **WHEN** the website pod starts and reads `POCKET_ID_URL` from its ConfigMap
- **THEN** the value is `http://pocket-id.workspace-korczewski.svc.cluster.local:1411`
- **AND** DNS resolution of `pocket-id.workspace-korczewski.svc.cluster.local` succeeds from the `website` namespace

### Requirement: Short name stays valid in dev

The dev environment SHALL continue to use the short service name
`http://pocket-id:1411` because both the website and pocket-id pods
run in the same `workspace` namespace there. No change to
`environments/dev.yaml` is required.

#### Scenario: dev unchanged

- **GIVEN** the dev env file (`environments/dev.yaml`) is read by the deploy task
- **WHEN** the website pod starts and reads `POCKET_ID_URL` from its ConfigMap
- **THEN** the value remains `http://pocket-id:1411` (short name, same namespace)

### Requirement: pocket-id.yaml comment is accurate

The comment in `k3d/pocket-id.yaml` (lines 105–108) that states
"POCKET_ID_URL stays http://pocket-id:1411 in both dev and prod"
SHALL be corrected to reflect the FQDN requirement for prod.

#### Scenario: Comment reflects actual behavior

- **GIVEN** a developer reads the pocket-id.yaml comment block
- **WHEN** they look at the POCKET_ID_URL documentation
- **THEN** the comment explains that dev uses the short name (same namespace) and prod uses the FQDN (cross-namespace)

## Impact

- **Env files (changed):** `environments/fleet-mentolder.yaml`, `environments/fleet-korczewski.yaml` — `POCKET_ID_URL` FQDN fix.
- **Manifest comment (changed):** `k3d/pocket-id.yaml` — corrected comment about POCKET_ID_URL behavior.
- **No code changes:** `website/src/lib/auth.ts`, `website/src/lib/identity.ts` — already support FQDN via `process.env.POCKET_ID_URL`.
- **No NetworkPolicy changes:** existing policies correctly allow cross-namespace traffic.
- **Dev unaffected:** `environments/dev.yaml` unchanged (short name works in same namespace).
- **Non-fleet prod unaffected:** `environments/mentolder.yaml` and `environments/korczewski.yaml` already have correct FQDNs.

_Ticket: T001803_
