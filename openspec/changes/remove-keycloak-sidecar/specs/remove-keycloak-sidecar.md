---
title: "keycloak-MCP-Sidecar entfernen — Spec"
domains: [infra]
ticket_id: T002311
status: active
---

## ADDED Requirements

### Requirement: Diagnose - Keycloak Container Restarts identifizieren

The system SHALL diagnose whether the keycloak container is the sole or primary cause of restarts in the `claude-code-mcp-monolith` deployment before removing it.

#### Scenario: Keycloak identified as restart cause

- **GIVEN** The deployment `claude-code-mcp-monolith` läuft mit 55+ Restarts
- **WHEN** Die Restarts pro Container werden aufgeschlüsselt
- **THEN** `kubectl get pod -l app=claude-code-mcp-monolith -o jsonpath` zeigt, ob der `keycloak`-Container der alleinige oder Hauptverursacher der Restarts ist

### Requirement: Keycloak Container entfernen

The system SHALL remove the keycloak container from the deployment once it is confirmed as the restart cause, and document the obsolete secret.

#### Scenario: Container removal and verification

- **GIVEN** Der keycloak-Container ist als Restart-Verursacher bestätigt
- **WHEN** Der Container wird aus dem Deployment entfernt
- **THEN**
  1. `keycloak`-Container-Spezifikation aus `claude-code-mcp-monolith-deploy.yaml` löschen
  2. Secret `claude-code-secrets/KEYCLOAK_ADMIN_PASSWORD` als DEPRECATED markieren
  3. Pod-Restarts nach dem Rollout auf null bestätigen

#### Scenario: Acceptance criteria

- **GIVEN** Der keycloak-Container wurde aus dem Deployment entfernt
- **WHEN** Das Deployment neu gerollt wurde
- **THEN**
  - `kubectl get pod -l app=claude-code-mcp-monolith` zeigt 0 Restarts nach dem Rollout
  - `kubectl logs <pod> -c keycloak` schlägt fehl (Container existiert nicht mehr) — das ist der erwartete Zustand
  - Das Secret wird nicht gelöscht, nur dokumentiert als obsolet (kann später in einem separaten Chore entfernt werden)
