# Skills Overview

22 project-local skills grouped by domain. Each skill has its own `SKILL.md` with full runbook details. Invoke any skill by its name.

---

## Development Flow (sequential pipeline)

| Skill | When to use |
|---|---|
| `dev-flow-plan` | **Entry point** for all repo changes — determines feature/fix/chore path, runs brainstorming, creates spec + plan, commits to branch. Chores finish inline. |
| `dev-flow-execute` | After `dev-flow-plan` has pushed a staged plan — implements, verifies, opens PR, merges, deploys. |
| `dev-flow-e2e` | After `dev-flow-execute` has merged and deployed — writes + runs Playwright E2E tests against live environment. |

---

## Infrastructure Lifecycle

| Skill | When to use |
|---|---|
| `hetzner-node` | Provision or reset a Hetzner node (cloud-config, Rescue Mode, k3s join, WireGuard mesh). Use **before** `new-environment`. |
| `new-environment` | Stand up a brand-new cluster from scratch — enforces sealed-secrets → cert-manager → workspace:deploy ordering. Cross-ref: `secret-rotation` (Type C), `hetzner-node`. |
| `deployment-assist` | Re-deploy or repair an existing but degraded cluster — phased credential check + task orchestration. Cross-ref: `new-environment` (fresh cluster), `fleet-ops`. |
| `fleet-ops` | Cross-cluster fan-out operations: `task feature:*`, schema changes, Keycloak sync, and **Flux GitOps** reconciliation across mentolder + korczewski. Absorbs `flux-day2-ops`. |
| `dev-stack-ops` | Operate the dev.mentolder.de k3d stack on k3s-1 — cluster create/destroy, dev DB refresh, firewall, Keycloak /dev-access group. |

> **`flux-day2-ops`** is now a redirect to the "Flux GitOps Operations" section of `fleet-ops`.

---

## Secret & Auth Management

| Skill | When to use |
|---|---|
| `secret-rotation` | Rotate DB passwords, API keys, SealedSecrets keypair (post-reset), Claude Code tokens, or service credentials across both clusters. |
| `keycloak-realm-sync` | Reconcile Keycloak realm JSON → push OIDC client changes, group mappings, mappers, SSO login fixes. |

---

## Service-Specific Operations

| Skill | When to use |
|---|---|
| `arena-brett-deploy` | Build, push, and deploy arena-server (korczewski-only) or brett (both clusters). Covers proto-drift copy step. |
| `livekit-setup` | Setup/repair LiveKit WebRTC stack — DNS pinning, ufw rules, node affinity, ICE failure diagnosis, RTMP/recording. |
| `openclaw-ops` | Bootstrap, restart, debug, or reset OpenClaw on the WSL host (local AI gateway → GPU box Ollama). |

---

## Knowledge & Coaching Content

| Skill | When to use |
|---|---|
| `coaching-pipeline` | Ingest coaching books/PDFs → classify chunks with LLM → review drafts at `/admin/knowledge/drafts`. Cross-ref: `knowledge-reindex`. |
| `knowledge-reindex` | Re-index general knowledge collections (PRs, docs, bugs, web crawls) after source data changes. Cross-ref: `coaching-pipeline`, `backup-check`. |

> Both share embedding model isolation rules (bge-m3 vs voyage-multilingual-2 never interchangeable).

---

## Database

| Skill | When to use |
|---|---|
| `db-migration` | Add/change tables, columns, indexes, schemas, or roles — applies to both clusters, re-grants permissions, updates ER diagram. |
| `backup-check` | Audit + test the DB backup/restore process end-to-end (trigger backup → verify encryption → safe restore to temp DB). |

---

## Operations & Incident Management

| Skill | When to use |
|---|---|
| `incident-response` | Production incident triage — scope → RCA → fix or rollback → verification → post-mortem. |
| `ticket-management` | Work through open tickets, clean stale worktrees/branches, merge PRs, fix CI failures. |
| `mishap-tracker` | **Internal utility** — converts `MISHAP_LOG` entries into DB tickets. Never invoke directly; always called from another skill's post-execution section. |

---

## Skill Relationships at a Glance

```
hetzner-node
    └→ new-environment
           └→ secret-rotation (keypair refresh)
           └→ deployment-assist
                  └→ fleet-ops (includes Flux day-2)

dev-flow-plan
    └→ dev-flow-execute
           └→ dev-flow-e2e

coaching-pipeline ←→ knowledge-reindex
                             └→ backup-check (on 0-doc failure)

incident-response → fleet-ops (Flux reconcile to fix drift)
                  → secret-rotation (if auth broken)
                  → keycloak-realm-sync (if SSO broken)
```
