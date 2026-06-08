# AGENTS.md — High-Signal Reference for AI Agents

## Agent Routing

Check these signals before acting; delegate to the named sub-agent when they match:

| Signals | Agent |
|---------|-------|
| `website/`, Astro, Svelte, component, homepage, kore, brand, CSS, UI, frontend, design | `bachelorprojekt-website` |
| pod, logs, status, restart, crash, health, kubectl, "what's wrong", "why is X failing", "is X running" | `bachelorprojekt-ops` |
| `k3d/`, `prod*/`, manifest, kustomize, overlay, Taskfile, `ENV=`, `environments/`, deploy | `bachelorprojekt-infra` |
| test, `FA-*`, `SA-*`, `NFA-*`, `AK-*`, BATS, Playwright, `runner.sh` | `bachelorprojekt-test` |
| database, PostgreSQL, psql, schema, query, backup, restore, `v_timeline` | `bachelorprojekt-db` |
| SealedSecret, Keycloak realm, OIDC, DSGVO, credentials, rotate, certificate, secret | `bachelorprojekt-security` |

Before dispatching any agent: `bash scripts/plan-context.sh <role>` → prepend output as `<active-plans>`. Tie-break: prefer domain of files being changed. Cross-cutting requests stay with orchestrator.

## Core Commands

```bash
# Task oracle — primary CLI. Never hardcode task paths.
bash scripts/task-oracle.sh '<goal in plain English>'

# Dev cluster (k3d, default ENV=dev)
task cluster:create && task workspace:deploy && task workspace:office:deploy && task workspace:post-setup

# Tests
./tests/runner.sh local            # full suite against k3d
./tests/runner.sh local FA-01      # single test (IDs: FA-*, SA-*, NFA-*, AK-*)
task test:all                      # offline suite (BATS + manifests + dry-run)

# Prod — ENV= is always explicit
task workspace:deploy ENV=mentolder
task feature:deploy                # fan-out to both brands
```

## Workflow

- Branch naming: `feature/*`, `fix/*`, `chore/*`
- All changes via PRs → squash-and-merge. No direct pushes to `main`.
- For structured work: invoke `dev-flow-plan` skill (plan → push) then `dev-flow-execute` (implement → PR → deploy).
- CI must be green: `task test:all` before commit.
- Validate manifests: `task workspace:validate`.

## Architecture

- **Fleet cluster** (single k3s): mentolder → ns `workspace`, korczewski → ns `workspace-korczewski`. Both run on `fleet` context.
- **k3d/ is base** for all Kustomize manifests. Prod overlays: `prod-fleet/mentolder/` and `prod-fleet/korczewski/`.
- **No GitOps** — deploy is push-based (`task workspace:deploy ENV=<brand>`). Only website auto-deploys via GH Actions.
- **Centralized domains**: `k3d/configmap-domains.yaml` — never hardcode hostnames.
- **Secrets flow**: plaintext `environments/.secrets/<env>.yaml` → `task env:seal ENV=<env>` → SealedSecret in `environments/sealed-secrets/`.
- Cross-cutting DB/OIDC changes apply to **both** `workspace` and `workspace-korczewski` namespaces explicitly.

## Critical Footguns

- **`scripts/env-resolve.sh` must be sourced, not executed.** `bash scripts/env-resolve.sh` exits the parent shell.
- **Adding `${VAR}` to a manifest?** Register in `environments/schema.yaml` AND the `envsubst` list in every Taskfile task that builds that manifest.
- **Never SELECT * from `tickets.ticket_plans`** — `content` column is multi-MB markdown. Query metadata columns or filter by id/slug.
- **`docs:sync` does NOT work** — container rootfs is read-only. Deploy via `task docs:deploy`.
- **Website, Brett, Docs images use `:latest` intentionally** — don't "fix" to digests.
- **`env:generate ENV=<target>` must run before `env:seal`** — talk-hpb-setup.sh aborts on placeholder values.
- **Cluster reset order**: sealed-secrets:install → env:fetch-cert → env:seal → cert:install → cert:secret → workspace:deploy.

## Agent Coordination

Multiple agent sessions share one checkout. Use:

```bash
bash scripts/agent-lock.sh reap    # start of every session
bash scripts/agent-lock.sh claim ticket <id> --branch <b> --worktree <wt> --label <skill>
bash scripts/agent-lock.sh release ticket <id>
bash scripts/agent-lock.sh list    # see who is doing what
```

Use worktrees (`scripts/worktree-create.sh`) for isolation — main-checkout commits are gated by agent-lock.

## Task Reference

Use `bash scripts/task-oracle.sh '<goal>'` when unsure — it routes to the right task. The groups below are for quick orientation.

**Daily workflow**
```
task test:all                          # before every push (offline CI)
task freshness:regenerate              # after modifying generated artifacts
task workspace:validate                # validate manifests without deploying
task feature:website                   # rebuild + deploy website on both brands
task feature:brett                     # rebuild + deploy brett on both brands
task feature:deploy                    # all workspace changes on both brands
task workspace:deploy ENV=mentolder    # single brand deploy
```

**Dev cluster**
```
task up / task down / task clean
task cluster:create|delete|start|stop|status
task dev:deploy                        # build images + apply manifests to k3d
task dev:redeploy:website|brett        # fast redeploy single service
task dev:db:refresh                    # restore prod snapshot into dev DB
task website:dev                       # Astro hot-reload dev server
```

**Tests**
```
task test:all          # BATS unit + factory + agent-lock + manifests + dry-run
task test:unit         # BATS only
task test:manifests    # kustomize structure check
task test:factory      # FA-SF bats (Software Factory)
task test:e2e ENV=mentolder            # Playwright E2E
task test:e2e:all-prods               # E2E against both brands
```

**Secrets & environments**
```
task secrets:unlock KEY=<path>
task env:seal ENV=<brand>
task env:fetch-cert ENV=<brand>
task env:generate ENV=<brand>
task secrets:sync                      # apply SealedSecrets to both clusters
```

**Ops / health**
```
task health                            # cross-cluster health check
task workspace:status:all-prods        # pod/svc/ingress/PVC on both brands
task workspace:verify ENV=<brand>      # post-deploy sanity check
task workspace:backup ENV=<brand>      # trigger immediate DB backup
task workspace:db:restore -- <db> <ts> # restore DB from backup
task recovery:browse ENV=<brand>       # SSO-gated file recovery UI
```

**Software Factory (autopilot)**
```
task factory:autopilot:install|status|uninstall
task factory:enqueue -- <T-ID> <branch> <plan-file>
```

**Service-specific**
```
task brett:deploy|sync|logs|bot-setup ENV=...
task website:deploy|sync|logs|restart ENV=...
task arena:deploy|logs|status ENV=...
task keycloak:sync ENV=...
task llm:deploy|status|test ENV=...
task openclaw:start|status|logs
task docs:deploy
```

## Important Links

- `website/CLAUDE.md` — Astro/Svelte dev quick-start, content model, adding service pages, footguns
- `docs/agent-guide/README.md` — agent operating guide registry (taxonomy, guardrails, tools, goals)
- `CONTRIBUTING.md` — human-readable dev workflow, PR expectations
