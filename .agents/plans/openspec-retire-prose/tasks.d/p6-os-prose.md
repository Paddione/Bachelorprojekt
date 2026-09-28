# p6 — OpenSpec-Prosa entfernen (6/7)

Ticket: T900724. Kontext: `design.md`. 64 Dateien.

## Regeln

Nur Prosa und Kommentare, kein Verhalten ändern.

Für jede Datei der Liste jede Erwähnung von OpenSpec entfernen (`openspec/…`-Pfade, `openspec`-Wort,
`openspec-*`-Skills, `/opsx:*`, „SSOT-Delta“/„Spec-Delta“ mit OpenSpec-Pfad):

1. Zeile ist nur ein Verweis (z. B. `# SSOT-Delta: openspec/changes/x/…`, `# Spec: openspec/specs/x.md`) → Zeile löschen.
2. Satz besteht nur aus dem Verweis → Satz löschen.
3. Satz hat weiteren Inhalt → nur den OpenSpec-Teil streichen, Rest grammatisch lassen.
4. Keinen neuen Verweis erfinden, nichts umformulieren, was nicht OpenSpec betrifft.
5. In `.bats`-Dateien nur Kommentarzeilen und `@test`-Titel ändern. Ändert sich ein `@test`-Titel,
   bleibt die Ticket-ID am Anfang erhalten.

Nach jeder Datei: `grep -in openspec <datei>` ist leer.

## Dateien

- `tests/spec/mcp-gateway/mcp-sync-drift-no-secret-leak.bats`
- `tests/spec/mcp-gateway/native-server-startup-token.bats`
- `tests/spec/mcp-gateway/node-mcp-server-startup.bats`
- `tests/spec/mcp-gateway/opencode-env-placeholder.bats`
- `tests/spec/mcp-gateway/start-windows-unc.bats`
- `tests/spec/mcp-gateway/token-drift-auto-sync.bats`
- `tests/spec/mcp-skill-integration.bats`
- `tests/spec/mcp-skill-integration/psql-fallback-ticket-ssot.bats`
- `tests/spec/mcp-task-runner.bats`
- `tests/spec/mcp-task-runner/planner-sees-real-deps.bats`
- `tests/spec/mediaviewer.bats`
- `tests/spec/mishap-t002424.bats`
- `tests/spec/mishap-tracking/dedupe-korpus.bats`
- `tests/spec/mishap-tracking/go-tests-registriert.bats`
- `tests/spec/monitoring-alerts.bats`
- `tests/spec/monitoring-alerts/backup-alerting.bats`
- `tests/spec/monitoring-alerts/backup-recipient-daily-repeat.bats`
- `tests/spec/network-address-plan/networks-registry.bats`
- `tests/spec/newsletter-system.bats`
- `tests/spec/nextcloud-integration.bats`
- `tests/spec/opencode-local-model-runner.bats`
- `tests/spec/openspec-workflow/plan-archive-git-add-coverage.bats`
- `tests/spec/pipeline-interface.bats`
- `tests/spec/plan-context.bats`
- `tests/spec/plan-partials-embedding/size-gate.bats`
- `tests/spec/planning-office/epic-lastenheft.bats`
- `tests/spec/pocket-id-client-seed-auth-header.bats`
- `tests/spec/pocket-id-client-seed-early-abort.bats`
- `tests/spec/pocket-id-client-seed-pagination.bats`
- `tests/spec/pocket-id-client-seed-secret-writeback.bats`
- `tests/spec/pocket-id-client-seed-timeout.bats`
- `tests/spec/pocket-id-migration.bats`
- `tests/spec/pocket-id-proxy-ip.bats`
- `tests/spec/projekttickets-cockpit.bats`
- `tests/spec/questionnaire-system.bats`
- `tests/spec/react-homepage-blocks.bats`
- `tests/spec/react-login-edit-homepage.bats`
- `tests/spec/release-notes-erden.bats`
- `tests/spec/repo-health-goals.bats`
- `tests/spec/repo-hygiene/dead-path-references.bats`
- `tests/spec/repo-hygiene/signal-gaps.bats`
- `tests/spec/repo-hygiene/worktree-stash-inspection.bats`
- `tests/spec/repo-structure/components-group.bats`
- `tests/spec/repo-structure/inventory-registered.bats`
- `tests/spec/repo-structure/root-agent-md.bats`
- `tests/spec/repo-structure/spec-suite-website-leak.bats`
- `tests/spec/repo-structure/website-moved.bats`
- `tests/spec/rustdesk-server/on-demand-lifecycle.bats`
- `tests/spec/s1-violations-batch2.bats`
- `tests/spec/s1-violations.bats`
- `tests/spec/s2-cycles-g-cq07.bats`
- `tests/spec/scripts/check-worktree-live-no-env.bats`
- `tests/spec/sdlc-cockpit/action-inventory.bats`
- `tests/spec/sdlc-cockpit/adapter-sdlc-paths.bats`
- `tests/spec/sdlc-cockpit/api-inventory-drift.bats`
- `tests/spec/sdlc-cockpit/daemon-token-endpoint-removed.bats`
- `tests/spec/sdlc-cockpit/endpoint-host-map.bats`
- `tests/spec/sdlc-cockpit/kit-artifacts-exist.bats`
- `tests/spec/sdlc-cockpit/kit-binding.bats`
- `tests/spec/sdlc-cockpit/leitstand-absorption.bats`
- `tests/spec/sdlc-cockpit/leitstand-ds-tokens.bats`
- `tests/spec/sdlc-cockpit/leitstand-help-overlay.bats`
- `tests/spec/sdlc-cockpit/leitstand-livedaten.bats`
- `tests/spec/sdlc-cockpit/leitstand-url-scheme.bats`

## Abschluss

```bash
bats tests/spec/os-retirement-prose.bats
```

Der Test wird erst grün, wenn alle Partials fertig sind. Für diesen Partial reicht, dass keine Datei dieser Liste mehr gemeldet wird.
