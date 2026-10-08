---
page: infrastructure
ticket: T901054
status: complete
actions:
  - cluster-status
  - pods
  - services
  - pod-logs
  - context-select
  - setup-checklist
---

## Voraussetzungen

- `kubectl` auf PATH (sonst Warnung statt Abbruch).
- Gueltige Contexts: nur `fleet` und `devmesh` (kein hart codierter
  Knotenname — Knoten aus `kubectl get nodes`).
- Forward-Units als Status: devmesh-forward, pgvector-forward,
  postgres-prod-forward, mcp-gateway (Stand 2026-10-08: alle active).

## Geordnete Schritte

1. **cluster-status**: Contexts (Laufzeit-Abfrage) und Forward-Unit-Status.
2. **pods**: Pods via Terminal (`k9s`, Context fleet, Namespace workspace).
3. **services**: Services via Terminal (`kubectl get svc`).
4. **pod-logs**: Pod eingeben — Logs (`kubectl logs --tail 100`).
5. **context-select**: Anzeige-Context waehlen (fleet/devmesh) — kein
   Switch ohne Bestaetigung.
6. **setup-checklist**: Setup-Checkliste (dieses Runbook + `../SETUP_CHECKLIST.md`).

Status und Node Control sind ein Kapitel. kubectl.nvim, k9s und lazygit
als Terminal-Aktionen; keine Deploy-Aktion aus dem Editor.

## Erwartetes Ergebnis

Ein Kapitel, Laufzeit-Contexts/Knoten, drei Terminal-Aktionen, kein
Deploy, Forward-Units als Status.

## Troubleshooting

- **kubectl fehlt**: installieren, Aktionen degradieren mit Warnung.
- **devmesh-Verbindung verweigert**: Forward-Unit-Status pruefen
  (`systemctl --user status devmesh-forward`).

## Recovery

Keine: alle Aktionen sind lesend oder oeffnen nur Terminals.
