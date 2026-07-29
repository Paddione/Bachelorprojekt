---
title: "keycloak-MCP-Sidecar aus claude-code-mcp-monolith entfernen"
domains: [infra]
ticket_id: T002311
status: active
---

# keycloak-MCP-Sidecar aus claude-code-mcp-monolith entfernen

**Ticket:** T002311

## Problem

`k3d/default/claude-code-mcp-monolith-deploy.yaml` definiert einen `keycloak`-Container,
der gegen `http://keycloak.workspace.svc.cluster.local:8080` läuft. Die Plattform nutzt
Pocket ID als OIDC-Provider — einen Keycloak-Service gibt es nicht. Der Container kann
seine Readiness-Probe nie erfüllen.

Beleg: `kubectl get pod -l app=claude-code-mcp-monolith` zeigt 55 Restarts in 18 Tagen.

## Lösung

1. Restarts pro Container aufschlüsseln, um den keycloak-Container zu bestätigen
2. `keycloak`-Container aus dem Deployment entfernen
3. Secret `KEYCLOAK_ADMIN_PASSWORD` aus `claude-code-secrets` als obsolet markieren oder
   entfernen

## Risiken

- Falls irgendein anderer Container den Keycloak-Sidecar via localhost erwartet, muss
  vorher die Unabhängigkeit bestätigt werden. (Vermutlich kein Konsument — der Container
  war nie healthy.)

## Nicht im Scope

- Umstellung auf einen Pocket-ID-fähigen MCP-Server (separates Ticket, falls gewünscht)
