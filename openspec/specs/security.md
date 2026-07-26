# security

<!-- merged from change delta security.md on 2026-06-21 -->

## Purpose

Plattform-weite Security-Policy: SSO via Pocket ID, mTLS für internen Cluster-Traffic, SealedSecrets für Out-of-Cluster-Secret-Lifecycle, DSGVO-konforme Session-Timeouts.

Der frühere zweite Bestandteil dieser Policy — das Hybrid-Auth-Modell (Service-zu-Service-Token + Keycloak-OIDC) für die `claude-code-mcp-monolith`-Workloads — ist mit dem MCP-Monolith-Decommission entfallen; siehe den Hinweis im nächsten Abschnitt.

> **Dekommissioniert (T002179).** Beide nachfolgenden Requirements beschreiben den
> `mcp-auth-proxy` des korczewski-MCP-Monolithen. Die Komponente existiert nicht mehr:
> `k3d/claude-code-mcp-auth-proxy.yaml` wurde mit dem MCP-Monolith-Decommission
> (#2052/#2061) gelöscht — festgehalten in `tests/spec/pocket-id-migration.bats:255`
> und `:180`. Ebenfalls nicht im Repository vorhanden: das Secret
> `MCP_KEYCLOAK_CLIENT_SECRET`, der Task `secret-rotation:rotate` (kein
> `secret-rotation`-Namespace im Taskfile) und die Routen `/api/mcp/svc/*` /
> `/api/mcp/user/*`.
>
> Der Text ist bewusst **nicht** auf Pocket ID umgeschrieben worden: das hätte eine
> entfernte Komponente mit dem aktuellen Provider beschrieben und wäre falscher
> gewesen als der veraltete Stand. Die Nennungen von Keycloak unterhalb dieser Zeile
> beschreiben historisches Verhalten und sind in diesem Sinne korrekt.

## Hybrid auth model — korczewski monolith (T001022)

### Decision matrix
| Caller | Auth | Path |
|---|---|---|
| Automation / cronjob | `BUSINESS_TOKEN` or `CLUSTER_TOKEN` | `/api/mcp/svc/*` |
| Human user (browser) | Keycloak OIDC (cookie session) | `/api/mcp/user/*` |

### Why no NetworkPolicy change in this PR
User decision (2026-06-21): NetworkPolicy hardening deferred to a follow-up
ticket. Current `allow-internet-egress` + `allow-egress-to-workspace` etc. remain.

### Operational runbook
Rotate `MCP_KEYCLOAK_CLIENT_SECRET`:
  `task secret-rotation:rotate ENV=korczewski TARGET=mcp-keycloak`
Then `kubectl --context fleet rollout restart deploy/mcp-auth-proxy -n workspace-korczewski`.

### Lineage
- T000973 (PR #1926) — mentolder hardening
- T000975 (PR #1939) — korczewski consolidation
- T001022 (this PR) — hybrid auth parity

## Requirements

### Requirement: Hybrid-Auth-Modell im korczewski mcp-auth-proxy

The system SHALL route `/api/mcp/svc/*` traffic through `BUSINESS_TOKEN`/`CLUSTER_TOKEN` validation and `/api/mcp/user/*` traffic through Keycloak-OIDC (cookie session) in the korczewski `mcp-auth-proxy`. The two paths SHALL be exposed by separate IngressRoute rules in `k3d/ingress.yaml`.

#### Scenario: Service-zu-Service-Call mit BUSINESS_TOKEN

- **GIVEN** ein Automation-Cronjob hat einen gültigen `BUSINESS_TOKEN`
- **WHEN** er `GET /api/mcp/svc/foo` aufruft
- **THEN** leitet der mcp-auth-proxy die Anfrage an den Upstream-Service durch (HTTP 200)

#### Scenario: Browser-Call ohne Keycloak-Session

- **GIVEN** ein Nutzer ohne Keycloak-Cookie ruft `GET /api/mcp/user/profile` auf
- **WHEN** die Anfrage den oauth2-proxy-Sidecar erreicht
- **THEN** leitet der Sidecar zum Keycloak-Login weiter (HTTP 302)

#### Scenario: NetworkPolicy-Hardening explizit ausgeschlossen

- **GIVEN** User-Entscheidung 2026-06-21
- **WHEN** das Hybrid-Auth-PR gemergt wird
- **THEN** enthält es KEINE NetworkPolicy-Änderung
- **AND** die bestehenden `allow-internet-egress` / `allow-egress-to-workspace` Regeln bleiben unverändert

### Requirement: Secret-Rotation für MCP_KEYCLOAK_CLIENT_SECRET

The system SHALL provide `task secret-rotation:rotate ENV=korczewski TARGET=mcp-keycloak` as the documented rotation path, followed by `kubectl --context fleet rollout restart deploy/mcp-auth-proxy -n workspace-korczewski` to pick up the new secret without a full cluster restart.

#### Scenario: Rotation path updates the secret without cluster restart

- **GIVEN** an operator needs to rotate `MCP_KEYCLOAK_CLIENT_SECRET` for the korczewski brand
- **WHEN** they run `task secret-rotation:rotate ENV=korczewski TARGET=mcp-keycloak` followed by `kubectl --context fleet rollout restart deploy/mcp-auth-proxy -n workspace-korczewski`
- **THEN** the deployment restarts with the new secret value
- **AND** no other workload in the namespace is restarted
