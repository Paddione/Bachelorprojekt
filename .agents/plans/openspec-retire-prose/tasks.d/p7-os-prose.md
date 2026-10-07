# p7 — OpenSpec-Prosa entfernen (7/7)

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

- `tests/spec/sdlc-cockpit/login-redirect-all-pages.bats`
- `tests/spec/sdlc-cockpit/navigation-no-dead-links.bats`
- `tests/spec/sdlc-cockpit/redesign-struktur.bats`
- `tests/spec/sdlc-cockpit/write-token-removed.bats`
- `tests/spec/sdlc-isolation/build-target-split.bats`
- `tests/spec/sdlc-isolation/e2-local-stack.bats`
- `tests/spec/sdlc-isolation/e3-backup.bats`
- `tests/spec/sdlc-isolation/e3-tickets-lokal.bats`
- `tests/spec/sdlc-isolation/fleet-sequence-split.bats`
- `tests/spec/sdlc-isolation/llm-up-health.bats`
- `tests/spec/sdlc-isolation/sdlc-up-command.bats`
- `tests/spec/sealed-secret-cluster-drift.bats`
- `tests/spec/secret-rotation.bats`
- `tests/spec/secrets-deploy-automation.bats`
- `tests/spec/secrets-deploy-automation/schema-dev-secrets-sync.bats`
- `tests/spec/security.bats`
- `tests/spec/security/cluster-admin-audit.bats`
- `tests/spec/security/website-clusterrole-least-privilege.bats`
- `tests/spec/security/workload-exec-rbac.bats`
- `tests/spec/sessions-server.bats`
- `tests/spec/sessions-server/deregister-reap.bats`
- `tests/spec/sessions-server/domain-config.bats`
- `tests/spec/sessions-server/form-lifecycle.bats`
- `tests/spec/sessions-server/reap-untracked.bats`
- `tests/spec/sessions-server/register-list.bats`
- `tests/spec/sessions-server/wildcard-render-guard.bats`
- `tests/spec/sidekick-assistant.bats`
- `tests/spec/software-factory/decommission-guard.bats`
- `tests/spec/t001356-git02-conventional-commit.bats`
- `tests/spec/t001408-mishap-bundle.bats`
- `tests/spec/t002204-mishap-bundle.bats`
- `tests/spec/terminal-sidekick.bats`
- `tests/spec/ticket-mcp/phase-events-at-column.bats`
- `tests/spec/ticket-mcp/triage-projection.bats`
- `tests/spec/ticket-ops/triage-status-ssot.bats`
- `tests/spec/ticket-ops/wave1-state-refetch.bats`
- `tests/spec/ticket-system.bats`
- `tests/spec/ticket-system/areas-csv-trim.bats`
- `tests/spec/ticket-system/backfill-id-sequence.bats`
- `tests/spec/ticket-system/exec-sql-error-visibility-T900239.bats`
- `tests/spec/ticket-system/get-timeline-brand-flag-removed-T900246.bats`
- `tests/spec/ticket-system/get-timeline-plan-brand-column-T900243.bats`
- `tests/spec/ticket-system/list-status-comma-list.bats`
- `tests/spec/ticket-system/list-test-data-filter.bats`
- `tests/spec/ticket-system/read-path-fail-closed.bats`
- `tests/spec/ts-suppression.bats`
- `tests/spec/unsloth-eval-harness/tandem-candidates.bats`
- `tests/spec/vaultwarden-integration.bats`
- `tests/spec/warden-mcp/config-guards.bats`
- `tests/spec/warden-mcp/launcher.bats`
- `tests/spec/website-core.bats`
- `tests/spec/website-core/admin-nav-no-sdlc-routes.bats`
- `tests/spec/website-core/email-notifications.bats`
- `tests/spec/website-core/portrait-derivate-crop.bats`
- `tests/spec/website-core/web-audit.bats`
- `tests/spec/website-interfaces.bats`
- `tests/spec/workspace-deploy-secrets-scope.bats`
- `tests/spec/workspace-deploy.bats`
- `tests/spec/workspace-deploy/flux-secrets-ordering.bats`
- `tests/spec/workspace-deploy/ntfy-token-escaping-T900059.bats`
- `tests/spec/worktree-divergence-guard-T002387.bats`
- `tests/spec/wsl-exit-docs.bats`
- `tests/unit/cockpit-panel.test.ts`
- `tests/unit/dead-node-affinity.bats`

## Abschluss

```bash
bats tests/spec/os-retirement-prose.bats
```

Der Test wird erst grün, wenn alle Partials fertig sind. Für diesen Partial reicht, dass keine Datei dieser Liste mehr gemeldet wird.
