# p4 — OpenSpec-Prosa entfernen (4/7)

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

- `tests/spec/ci-cd/fix-ticket-commit-guard.bats`
- `tests/spec/ci-cd/freshness-check-base-mismatch.bats`
- `tests/spec/ci-cd/freshness-regen-rebase-guard.bats`
- `tests/spec/ci-cd/git-flow-poll-and-branch-order.bats`
- `tests/spec/ci-cd/gitlab-pipeline-check.bats`
- `tests/spec/ci-cd/gitlab-registry-mirror.bats`
- `tests/spec/ci-cd/gitlab-runner-executor-rbac.bats`
- `tests/spec/ci-cd/gitlab-runner-fleet-guardrails.bats`
- `tests/spec/ci-cd/gitlab-runner-nonroot-uid.bats`
- `tests/spec/ci-cd/gitlab-runner-quota-fit.bats`
- `tests/spec/ci-cd/pr-auto-title-scope-extraction.bats`
- `tests/spec/ci-cd/spec-tracked-file-guard-isolation.bats`
- `tests/spec/ci-cd/website-fast-path.bats`
- `tests/spec/ci-cd/worktrees-not-tracked.bats`
- `tests/spec/coaching-sessions-polish-guide.bats`
- `tests/spec/code-quality.bats`
- `tests/spec/code-quality/s2-madge-invocation.bats`
- `tests/spec/collabora-integration.bats`
- `tests/spec/commit-scope-vokabular/mcp-gateway-alias.bats`
- `tests/spec/commit-signing.bats`
- `tests/spec/database.bats`
- `tests/spec/datev-export.bats`
- `tests/spec/db-quality-goals.bats`
- `tests/spec/dev-flow-chore-ticket-ops-mishaps.bats`
- `tests/spec/dev-flow-plan.bats`
- `tests/spec/dev-flow-plan/red-phase-and-handoff-conventions.bats`
- `tests/spec/dev-flow-plan/worktree-remove-claim-guard.bats`
- `tests/spec/dev-machine-onboarding/install-dev-tools-user.bats`
- `tests/spec/dev-machine-onboarding/key-register.bats`
- `tests/spec/dev-machine-onboarding/onboard-machine.bats`
- `tests/spec/dev-pod-mcp-bundle/dev-pod.bats`
- `tests/spec/dev-stack-tmp-mounts.bats`
- `tests/spec/divergence-guard.bats`
- `tests/spec/divergence-guard/branch-prefix-suggestion.bats`
- `tests/spec/docker-build-speedup.bats`
- `tests/spec/dora-dashboard.bats`
- `tests/spec/e2e-test-infrastructure.bats`
- `tests/spec/e2e-test-infrastructure/bats-nonascii-testnames.bats`
- `tests/spec/e2e-test-infrastructure/purge-fn-website-sync.bats`
- `tests/spec/e2e-test-infrastructure/purge-test-data-missing-table.bats`
- `tests/spec/e2e-test-infrastructure/vision-sweep.bats`
- `tests/spec/e2e-testing.bats`
- `tests/spec/env-seal-empty-value-keys.bats`
- `tests/spec/factory-reclaim-lock-respect/pid-dead-worktree-match-T002849.bats`
- `tests/spec/factory/vda-frontmatter.bats`
- `tests/spec/finetune-hf-jobs.bats`
- `tests/spec/fleet-operations.bats`
- `tests/spec/fleet-operations/cronjob-hygiene.bats`
- `tests/spec/fleet-operations/dev-env-split.bats`
- `tests/spec/fleet-operations/dev-node-binding.bats`
- `tests/spec/fleet-operations/ghcr-pull-secret.bats`
- `tests/spec/fleet-operations/internal-endpoints.bats`
- `tests/spec/fleet-operations/membership-drift.bats`
- `tests/spec/fleet-operations/monitoring-ready.bats`
- `tests/spec/fleet-operations/reflector-annotations.bats`
- `tests/spec/fleet-operations/sdlc-console-fleet.bats`
- `tests/spec/fleet-operations/staging-flux-wiring.bats`
- `tests/spec/fleet-operations/vaultwarden-smtp-from.bats`
- `tests/spec/flux-render-security/immutable-image-refs.bats`
- `tests/spec/g-cq02-any-types.bats`
- `tests/spec/g-cq08-knip-dead-code.bats`
- `tests/spec/g-dep01-npm-vuln.bats`
- `tests/spec/g-fe02-bundle-budget.bats`
- `tests/spec/g-fe03-structured-logger.bats`

## Abschluss

```bash
bats tests/spec/os-retirement-prose.bats
```

Der Test wird erst grün, wenn alle Partials fertig sind. Für diesen Partial reicht, dass keine Datei dieser Liste mehr gemeldet wird.
