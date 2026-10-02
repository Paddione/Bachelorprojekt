# p2 — OpenSpec-Prosa entfernen (2/7)

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

- `docs/mishap-rollup-carried-findings.md`
- `docs/runbooks/asset-gen-gpu-host.md`
- `docs/runbooks/db-audit-playbook.md`
- `docs/runbooks/devmesh-tailnet.md`
- `docs/runbooks/gitlab-runner.md`
- `docs/runbooks/neovim-plugin-scouting.md`
- `docs/runbooks/plan-runner.md`
- `docs/runbooks/vendor-sync.md`
- `docs/sdlc-stack/README.md`
- `docs/sdlc-stack/e3-cutover.md`
- `docs/spec-atlas.md`
- `environments/dev.yaml`
- `k3d/dev-pod/deployment.yaml`
- `k3d/studio.yaml`
- `migrations/20260804-restore-knowledge-chunks-hnsw.sql`
- `prod/traefik-values.yaml`
- `scripts/agent-collision.sh`
- `scripts/agent-skills/project.mjs`
- `scripts/bge-mcp/check-client-env.sh`
- `scripts/build-portrait-derivatives.sh`
- `scripts/ci-diff-base.sh`
- `scripts/ci/provision-gh-runner.sh`
- `scripts/ci/runner-placement-check.sh`
- `scripts/comfy-image-mcp/README.md`
- `scripts/context-retrieve.mjs`
- `scripts/devflow-post-merge-deploy.sh`
- `scripts/filter-generated.sh`
- `scripts/gen-goals-data.mjs`
- `scripts/glimmer-worker-mcp/README.md`
- `scripts/glimmer-worker-mcp/server.mjs`
- `scripts/hermes-mcp-provision.sh`
- `scripts/index-repo.test.ts`
- `scripts/install-dev-tools.sh`
- `scripts/lib/ci-checks.sh`
- `scripts/lib/worktree-set.sh`
- `scripts/llm/README-laptop-bge.md`
- `scripts/llm/bench-ifstruct.sh`
- `scripts/llm/glimmer.service`
- `scripts/llm/measurements/2026-09-04-freetoken-vs-llamacpp.md`
- `scripts/one-shot/purge-billing-testdata.sql`
- `scripts/openspec-atlas-groups.yaml`
- `scripts/openspec-embed-lib.sh`
- `scripts/plan-lint.sh`
- `scripts/plan-touched-files.sh`
- `scripts/repo-hygiene-cron.sh`
- `scripts/spec-shard.sh`
- `scripts/spec-tracked-file-guard.sh`
- `scripts/ticket-mcp/go/internal/runner/run_ticket.go`
- `scripts/validate-commit-msg.sh`
- `scripts/vda/ticket/_ticket-core.sh`
- `scripts/vda/ticket/update-status.sh`
- `taskfiles/Taskfile.test.yml`
- `templates/brain/SCHEMA.md`
- `templates/brain/wiki/cheatsheet.md`
- `templates/brain/wiki/first-aid.md`
- `templates/brain/wiki/llm-workflows.md`
- `templates/brain/wiki/quality-goals.md`
- `templates/brain/wiki/usage.md`
- `tests/CLAUDE.md`
- `tests/README.md`
- `tests/e2e/specs/fa-bugs-notifications.spec.ts`
- `tests/evals/golden/task-list-all.txt`
- `tests/evals/main-commit-guard.bats`
- `tests/fixtures/openspec/ssot-sample.md`

## Abschluss

```bash
bats tests/spec/os-retirement-prose.bats
```

Der Test wird erst grün, wenn alle Partials fertig sind. Für diesen Partial reicht, dass keine Datei dieser Liste mehr gemeldet wird.
