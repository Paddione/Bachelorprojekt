# p3 — OpenSpec-Prosa entfernen (3/7)

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

- `tests/fixtures/task-context-channel/proposal.md`
- `tests/fixtures/task-context-channel/tasks.d/p1-generator.md`
- `tests/fixtures/task-context-channel/tasks.d/p2-assembler.md`
- `tests/fixtures/task-context-channel/tasks.d/p3-gate-wiring.md`
- `tests/fixtures/task-context-channel/tasks.md`
- `tests/spec/active-sessions-hub.bats`
- `tests/spec/active-sessions-hub/agent-lock-main-checkout-reclaim.bats`
- `tests/spec/active-sessions-hub/agent-lock-release-cwd.bats`
- `tests/spec/active-sessions-hub/agent-lock-s1-budget-T900023.bats`
- `tests/spec/active-sessions-hub/agent-lock-scope-regelwerk.bats`
- `tests/spec/active-sessions-hub/agent-lock-windows-drive-path-T900023.bats`
- `tests/spec/active-sessions-hub/agy-session-id-stable.bats`
- `tests/spec/active-sessions-hub/claim-persistence-verified-T002826.bats`
- `tests/spec/active-sessions-hub/lock-ownership-cwd-independent-T003110.bats`
- `tests/spec/active-sessions-hub/opencode-session-id-stable.bats`
- `tests/spec/active-sessions-hub/session-activity-visibility-T003098.bats`
- `tests/spec/active-sessions-hub/ticket-lock-closure-T003102.bats`
- `tests/spec/admin-cockpit.bats`
- `tests/spec/admin-token-consolidation.bats`
- `tests/spec/admin-ui-modal-drawer.bats`
- `tests/spec/agent-lock-claim-persist.bats`
- `tests/spec/agent-lock-force-claim.bats`
- `tests/spec/agent-lock-liveness-heartbeat.bats`
- `tests/spec/agent-lock-lsp-reap-T900306.bats`
- `tests/spec/agent-skills.bats`
- `tests/spec/agent-skills/agent-lock-claim-help-flag.bats`
- `tests/spec/agent-skills/automerge-preflight-check.bats`
- `tests/spec/agent-skills/check-pr-automerge-fail-closed.bats`
- `tests/spec/agent-skills/devflow-worktree-cwd-guard.bats`
- `tests/spec/agent-skills/executor-post-merge-death.bats`
- `tests/spec/agent-skills/finalize-worktree-branch-validation.bats`
- `tests/spec/agent-skills/guard-semantics-konvention.bats`
- `tests/spec/agent-skills/portable-inventory.bats`
- `tests/spec/agent-skills/post-merge-finalize-guards.bats`
- `tests/spec/agent-skills/review-gate-before-auto-merge.bats`
- `tests/spec/agent-skills/superpowers-harness-parity.bats`
- `tests/spec/agent-skills/vendor-sync.bats`
- `tests/spec/agent-skills/worktree-remove-managed.bats`
- `tests/spec/agent-skills/worktree-write-guard-abspath-T900047.bats`
- `tests/spec/agentic-tooling-quality-goals.bats`
- `tests/spec/agentic-tooling-quality-goals/g-agentic01-unresolved-tools.bats`
- `tests/spec/astro-type-check.bats`
- `tests/spec/auth-sso.bats`
- `tests/spec/autodocs-removal-guard.bats`
- `tests/spec/backup-pipeline/filen-remote-retention.bats`
- `tests/spec/backup-pipeline/render-escaping.bats`
- `tests/spec/billing-pipeline.bats`
- `tests/spec/brain-auto-memory.bats`
- `tests/spec/brain-foundation.bats`
- `tests/spec/brain-gekko-inbox.bats`
- `tests/spec/brain-k4-brain-wiki/parent-moc.bats`
- `tests/spec/brett.bats`
- `tests/spec/cbm-stampede-guard.bats`
- `tests/spec/chat-inbox.bats`
- `tests/spec/ci-cd/actionlint-workflow-gate.bats`
- `tests/spec/ci-cd/cfr-trend-window.bats`
- `tests/spec/ci-cd/changed-tests-env-hermetic.bats`
- `tests/spec/ci-cd/ci-wait-loop-nonempty-guard.bats`
- `tests/spec/ci-cd/devflow-ci-watch-merged-exit.bats`
- `tests/spec/ci-cd/devflow-ci-watch-rollup-headsha.bats`
- `tests/spec/ci-cd/devflow-ci-watch-run-lookup.bats`
- `tests/spec/ci-cd/devflow-ciwatch-ticket-path.bats`
- `tests/spec/ci-cd/devflow-execute-hardening-t002365.bats`
- `tests/spec/ci-cd/fetch-refspec-forced.bats`

## Abschluss

```bash
bats tests/spec/os-retirement-prose.bats
```

Der Test wird erst grün, wenn alle Partials fertig sind. Für diesen Partial reicht, dass keine Datei dieser Liste mehr gemeldet wird.
