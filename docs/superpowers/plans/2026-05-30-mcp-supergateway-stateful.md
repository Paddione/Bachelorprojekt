---
title: Fix: supergateway MCP servers emit no Mcp-Session-Id (add --stateful) — Implementation Plan
ticket_id: T000360
domains: [website, infra, ops, test, security]
status: active
pr_number: null
---

# Fix: supergateway MCP servers emit no Mcp-Session-Id (add --stateful) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the supergateway-fronted MCP servers (postgres, github, browser) on **both** monoliths emit an `Mcp-Session-Id` header so the claude.ai / Claude Code MCP HTTP client connects — matching the already-working native kubernetes server.

**Root cause (verified 2026-05-30):** supergateway 3.4.3's `stdio→streamableHttp` bridge only maintains sessions (and emits `Mcp-Session-Id`) when run with `--stateful` (default `false`). All six supergateway invocations (3 per monolith: postgres :3001, browser :3000, github :3002) omit it, so they return a valid `initialize` but no session id; the client reports "Failed to connect". The kubernetes container is the native `kubernetes_mcp_server` streamableHttp (NOT supergateway) and already emits a session id — leave it untouched.

**Fix:** Add `--stateful` to each supergateway invocation in both manifests. Routing/DNS already fixed (T000353); this is purely the per-server transport flag.

**Tech Stack:** Kubernetes manifests (plain Deployments), supergateway 3.4.3, kubectl, BATS, Bash.

**Spec:** n/a (small fix; root cause + approach captured here and in T000360)
**Ticket:** T000360 · **Branch:** `fix/mcp-supergateway-stateful`

---

## Failing test (already staged — red)

`tests/unit/mcp-supergateway-stateful.bats` asserts that in **both** `deploy/mcp/claude-code-mcp-monolith.yaml` and `k3d/dev-stack/mcp-monolith-dev.yaml`, the count of `--stateful` equals the count of `--outputTransport streamableHttp` (≥1). Currently RED (`3 bridges but only 0 carry --stateful`). Turns green after Task 1.

## Pre-flight (verify, don't assume)

- [ ] Confirm both manifests still have exactly 3 supergateway invocations each: `grep -c -- "--outputTransport streamableHttp" deploy/mcp/claude-code-mcp-monolith.yaml k3d/dev-stack/mcp-monolith-dev.yaml` → 3 + 3.
- [ ] Confirm the kubernetes container uses native streamableHttp (`args: ["--port","8080","--stateless",...]`) and is NOT supergateway-fronted — it stays unchanged.
- [ ] Re-confirm the flag name on the live image: `supergateway --help | grep -iE "stateful|sessionTimeout"` (already verified: `--stateful` boolean default false; optional `--sessionTimeout` ms).

## Task 1 — Add `--stateful` to all six supergateway invocations

- [ ] In `deploy/mcp/claude-code-mcp-monolith.yaml`, for each of the postgres (~L87), browser/playwright (~L162), github (~L190) `exec supergateway \` blocks, insert `--stateful \` immediately after the `--outputTransport streamableHttp \` line (keeping the trailing `--healthEndpoint /health` last).
- [ ] In `k3d/dev-stack/mcp-monolith-dev.yaml`, do the same for postgres (~L105), playwright (~L141), github (~L166).
- [ ] Keep formatting/indentation identical to the surrounding args (continuation `\`). Do NOT touch the kubernetes container.
- [ ] (Decision) `--sessionTimeout`: leave **unset** initially (supergateway default keeps the session until the stream closes). Only add an explicit timeout if dev validation shows stale-session buildup. Document this choice in a manifest comment near one invocation.

## Task 2 — Local verification (offline)

- [ ] `./tests/runner.sh local <test-id>` (or run the bats directly) → the new test now PASSES.
- [ ] `task test:all` green.
- [ ] `task workspace:validate` green (kustomize builds for `deploy/mcp` overlay and `k3d/dev-stack`).
- [ ] `kubectl kustomize deploy/mcp/ | grep -c -- --stateful` → 3; same for `k3d/dev-stack/`.
- [ ] `task test:inventory && git diff --exit-code website/src/data/test-inventory.json` — commit if it changed.

## Task 3 — Deploy + live validation (post-merge)

**Dev monolith** (k3d-mentolder-dev on k3s-1; `dev-auto-deploy` is broken per T000356, so deploy manually):
- [ ] Apply the updated `mcp-monolith-dev.yaml` to `k3d-mentolder-dev` (render + `kubectl --context k3d-mentolder-dev -n workspace-dev apply -f -` via `ssh gekko@k3s-1`, mirroring how the route was deployed), then `rollout status deploy/claude-code-mcp-monolith`.
- [ ] Validate (token from `environments/.secrets/mentolder.yaml:DEV_MCP_TOKEN`):
  `curl -D- -X POST 'https://mcp.dev.mentolder.de/postgres/mcp?token=$TOK' -H 'Accept: application/json, text/event-stream' -H 'Content-Type: application/json' -d '<initialize>'` → response now includes an `mcp-session-id` header. Repeat for `/github` and `/browser`.

**Prod monolith** (default ns, served via `mcp.mentolder.de` through the k3s-1 CNAME):
- [ ] Deploy via the prod MCP path — confirm the task with `bash scripts/task-oracle.sh 'deploy the mcp monolith to mentolder'` (expected `task mcp:deploy ENV=mentolder` or the documented prod MCP deploy), then `rollout status deployment/claude-code-mcp-monolith`.
- [ ] Validate `mcp.mentolder.de/postgres/mcp` and `/github` now return an `mcp-session-id` header (token = the configured CLUSTER_TOKEN in `mcp-tokens`).
- [ ] **Authoritative check:** `claude mcp list` — `postgres mentolder` flips from ✗ to **✓ Connected** (Kubernetes already ✓). If still ✗, the missing session id was not the sole cause → re-open investigation (capture `curl -v` handshake + supergateway logs) before claiming done.

## Task 4 — Close out

- [ ] If `claude mcp list` shows postgres connected, the fix is confirmed. Note in the ticket whether github/browser were also added to the client and connect.
- [ ] korczewski monolith: out of scope (no MCP gateway there — dormant per project topology); note it for when korczewski MCP is activated so the same flag is applied.

## Rollback

Remove `--stateful` from the six invocations and redeploy both monoliths → reverts to the prior (stateless, no-session) behavior. No data touched.

## Risks / watch-items

- **`--stateful` session memory:** supergateway will retain per-client session state; for low client counts (admin/dev use) this is negligible. Watch the postgres/github container memory after deploy; add `--sessionTimeout` if it grows.
- **Behavioral assumption:** the fix assumes the missing `Mcp-Session-Id` is the sole reason the client fails. Task 3's `claude mcp list` check is the gate — do not mark T000360 done on the structural test alone.
- **Two deploy targets, two mechanisms:** dev = manual apply on k3s-1 (auto-deploy broken, T000356); prod = the prod MCP deploy task via Flux/manual. Don't conflate them.
