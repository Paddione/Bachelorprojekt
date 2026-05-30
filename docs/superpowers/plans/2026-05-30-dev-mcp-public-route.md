---
title: Public token-authenticated route for the dev MCP monolith — Implementation Plan
ticket_id: T000352
domains: [website, infra, ops, test, security]
status: active
pr_number: null
---

# Public token-authenticated route for the dev MCP monolith — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the dev MCP monolith (`claude-code-mcp-monolith`, ns `workspace-dev`, k3d-mentolder-dev on k3s-1) a durable, token-authenticated public route at `https://mcp.dev.mentolder.de/{kubernetes,postgres,github,browser}/mcp` usable from any Claude Code client.

**Architecture:** Approach B — minimal prod surface. Add `--skip-auth-route` to the existing `oauth2-proxy-dev` reverse proxy (the only hostNetwork bridge from prod Traefik to the k3d Traefik LB at `127.0.0.1:18080`) so MCP path prefixes bypass the OIDC `/dev-access` gate but are still proxied into k3d. Host the **token gate + path routing entirely inside the dev k3d cluster**, porting the prod MCP pattern (`deploy/mcp/`): an nginx ForwardAuth (`mcp-auth-proxy-dev`) + a Traefik `IngressRoute` for `Host(mcp.dev.mentolder.de)` with a strip-prefix/forward-auth middleware chain. `mcp.dev.mentolder.de` already resolves via the `*.dev` wildcard and is covered by `workspace-dev-wildcard-tls` — no new DNS/cert.

**Tech Stack:** Kustomize, kubectl (`k3d-mentolder-dev` + `mentolder` contexts), Traefik IngressRoute/Middleware CRDs, nginx ForwardAuth, oauth2-proxy v7.9.0, envsubst, BATS, Bash.

**Spec:** `docs/superpowers/specs/2026-05-30-dev-mcp-public-route-design.md`
**Ticket:** T000352 · **Branch:** `feature/dev-mcp-public-route`

---

## Pre-flight (verify before editing — do not assume)

- [ ] Confirm object names/ports still match the spec:
  - `kubectl --context mentolder -n workspace get deploy oauth2-proxy-dev -o jsonpath='{.spec.template.spec.containers[0].args}'` — confirm no existing `--skip-auth-route`.
  - `kubectl --context k3d-mentolder-dev -n workspace-dev get svc claude-code-mcp-monolith -o jsonpath='{.spec.ports[*].name}'` — expect `kubernetes postgres browser github`.
- [ ] Confirm `kubectl kustomize prod-mentolder/ | grep -c oauth2-proxy-dev` and `kubectl kustomize k3d/dev-stack/` both build clean today (baseline before changes).
- [ ] Re-read `deploy/mcp/mcp-auth-proxy.yaml`, `deploy/mcp/ingress.yaml`, `deploy/mcp/mcp-tokens.yaml` — these are the templates being ported.

---

## Task 1 — Generate + register the dev MCP token (secret plumbing)

- [ ] Add a `DEV_MCP_TOKEN` key to `environments/.secrets/mentolder.yaml` (gitignored). Generate with `openssl rand -hex 32`. (Operator action — file is off-limits to read/echo; ask the operator to add it, or add via an explicit instruction.)
- [ ] In `Taskfile.dev-stack.yml`, extend the imperative secret materialisation (the step that creates `claude-code-secrets` for the monolith) to also create/patch a `mcp-tokens` Secret in `{{.NS_DEV}}` with key `CLUSTER_TOKEN` = `$DEV_MCP_TOKEN`, read from `environments/.secrets/mentolder.yaml` via the same parsing used for `DEV_SHARED_DB_PASSWORD`. Use `kubectl create secret generic mcp-tokens --from-literal=... --dry-run=client -o yaml | kubectl apply` for idempotency.
- [ ] Verify: after a dev deploy, `kubectl --context k3d-mentolder-dev -n workspace-dev get secret mcp-tokens -o jsonpath='{.data.CLUSTER_TOKEN}' | base64 -d` is non-empty.

**Note:** dev has no sealed-secrets controller — do NOT seal. This mirrors how `claude-code-secrets` is already made (`k3d/dev-stack/mcp-monolith-dev.yaml:11-13`).

## Task 2 — Dev-side token ForwardAuth (`k3d/dev-stack/mcp-auth-proxy-dev.yaml`)

- [ ] Port `deploy/mcp/mcp-auth-proxy.yaml` to a new `k3d/dev-stack/mcp-auth-proxy-dev.yaml`. Changes from the prod original:
  - Single token tier: keep `CLUSTER_TOKEN` logic, **drop** `BUSINESS_TOKEN` (env, perl_set, and the business `if`-block).
  - **Drop** the `node-location=hetzner` nodeAffinity (dev k3d is a single node).
  - Keep the nginx ForwardAuth `/auth` (200 + `X-MCP-Role: cluster` / 401) and the `/healthz` endpoint, the `Authorization: Bearer` + `?token=` (`X-Forwarded-Uri`) fallback logic, the `mcp-tokens` Secret ref, ConfigMap mount, probes, resources.
  - Resource names: ConfigMap `mcp-auth-proxy-dev-config`, Deployment/Service `mcp-auth-proxy-dev`.
- [ ] Add `mcp-auth-proxy-dev.yaml` to `k3d/dev-stack/kustomization.yaml` `resources:`.

## Task 3 — Dev-side routing + middleware (`k3d/dev-stack/mcp-ingress-dev.yaml`)

- [ ] Create `k3d/dev-stack/mcp-ingress-dev.yaml` porting `deploy/mcp/ingress.yaml`, scoped to ns `workspace-dev`. Contents:
  - `Middleware mcp-dev-forwardauth` → `forwardAuth.address: http://mcp-auth-proxy-dev:80/auth`, `authResponseHeaders: ["X-MCP-Role"]`.
  - `Middleware mcp-dev-strip-auth-header` → strips `Authorization`, sets `Accept` (mirror prod `mcp-strip-auth-header`).
  - One `Middleware` per service to strip the path prefix (`mcp-dev-strip-kubernetes` → stripPrefix `/kubernetes`, etc.) OR a single stripPrefix middleware per route — match whatever prod `mcp-strip-service-prefix` does. **Read prod first** to copy the exact stripPrefix style.
  - `IngressRoute` `mcp-dev` on `entryPoints: [web]`, `Host(\`mcp.dev.mentolder.de\`)` with **four routes** (one per path prefix) — but note `${DEV_DOMAIN}` is `dev.mentolder.de`, so use `mcp.${DEV_DOMAIN}` via envsubst (see Task 5). Each route: `Host(\`mcp.${DEV_DOMAIN}\`) && PathPrefix(\`/postgres\`)` → service `claude-code-mcp-monolith:3001`, middlewares `[forwardauth, strip-auth, strip-postgres]`. Set route `priority` high enough to beat `sish-catchall` (priority 1) — e.g. 10.
  - Map: `/kubernetes`→8080, `/postgres`→3001, `/github`→3002, `/browser`→3000.
- [ ] Add `mcp-ingress-dev.yaml` to `k3d/dev-stack/kustomization.yaml` `resources:` (after the wildcard ingress so it is unambiguous).

## Task 4 — Prod bridge: skip-auth on `oauth2-proxy-dev`

- [ ] Edit `prod-mentolder/oauth2-proxy-dev.yaml` args list (after line 90, `--keycloak-group=/dev-access`): add
  `--skip-auth-route=^/(kubernetes|postgres|github|browser)(/|$)`.
  (oauth2-proxy v7.9.0 accepts repeatable `--skip-auth-route=<path_regex>`; a single regex covering all four prefixes is sufficient.)
- [ ] Confirm this does NOT widen real-app auth: the skipped paths only reach an MCP backend on the `mcp.dev` host inside k3d; `web.dev`/`brett.dev` define no such paths and 404 at k3d. Document this in a manifest comment.

## Task 5 — envsubst wiring

- [ ] `mcp-ingress-dev.yaml` references `mcp.${DEV_DOMAIN}` → confirm `$DEV_DOMAIN` is already in the `dev:apply` envsubst list (`Taskfile.dev-stack.yml`); it is. No new var needed unless a literal host is used (prefer `${DEV_DOMAIN}`).
- [ ] `prod-mentolder/oauth2-proxy-dev.yaml` change introduces no new `${VAR}` — no prod envsubst list change.

## Task 6 — Structural test (TDD-ish, offline)

- [ ] Add a BATS test (`tests/...` per existing kustomize-structure test conventions) that runs `kubectl kustomize k3d/dev-stack/` (with the dev envsubst vars set to placeholders) and asserts:
  - an `IngressRoute` named `mcp-dev` exists with a `Host(...mcp...)` match and references `mcp-auth-proxy-dev`,
  - a Deployment `mcp-auth-proxy-dev` exists,
  - the four path prefixes (`/kubernetes /postgres /github /browser`) are present.
- [ ] Add an assertion that `kubectl kustomize prod-mentolder/` output for `oauth2-proxy-dev` contains the `--skip-auth-route` arg.
- [ ] Run `task test:inventory && git diff --exit-code website/src/data/test-inventory.json` — regenerate + stage if it changed.
- [ ] `./tests/runner.sh local <new-test-id>` → expect PASS after Tasks 2–4; capture output.

## Task 7 — Deploy + live verification (post-merge, both layers)

- [ ] Prod layer: `task workspace:deploy ENV=mentolder` (applies the oauth2-proxy-dev arg change). Verify the pod rolled (`Recreate` strategy) and is Ready: `kubectl --context mentolder -n workspace rollout status deploy/oauth2-proxy-dev`.
- [ ] Dev layer: `task dev:apply` (or the appropriate `dev:redeploy`/`dev:deploy` task per the oracle) against `k3d-mentolder-dev`. Verify `mcp-auth-proxy-dev` pod Ready and the `mcp-dev` IngressRoute present.
- [ ] Acceptance checks (from the spec):
  - `curl -s -o /dev/null -w '%{http_code}' https://mcp.dev.mentolder.de/postgres/mcp` → **401** (token gate, not 302 OIDC, not 404).
  - `POST .../postgres/mcp?token=$DEV_MCP_TOKEN` with an MCP `initialize` body → valid `initialize` result.
  - repeat for `/kubernetes/mcp` and `/github/mcp`.
  - `curl -sI https://web.dev.mentolder.de/` still 302→Keycloak (SSO intact).
- [ ] Note: mentolder DNS round-robins three IPs incl. the dead fleet `204.168.244.104` — if a check flakes, retry / `--resolve` to a live IP. (Pre-existing; logged as mishap.)

## Task 8 — Client registration + docs

- [ ] Print the `claude mcp add --transport http -s user` commands for each of the four endpoints with `?token=$DEV_MCP_TOKEN`, for the operator to run. (A newly added MCP server connects on the **next** Claude Code session, not mid-session.)
- [ ] Add a short "dev MCP monolith — public access" subsection to `docs/dev-stack/README.md` documenting the URL pattern, the token location, and the skip-auth carve-out.
- [ ] Update `CLAUDE.md` §Gotchas (dev.mentolder.de stack) with a one-liner: `mcp.dev.mentolder.de` is token-gated (dev-side ForwardAuth) and skip-auth'd at oauth2-proxy-dev — not OIDC-gated.

---

## Rollback

- Prod: remove the `--skip-auth-route` arg, redeploy `oauth2-proxy-dev` → MCP paths fall back under the OIDC gate (route becomes unreachable to token clients, fail-closed).
- Dev: drop `mcp-ingress-dev.yaml` + `mcp-auth-proxy-dev.yaml` from `k3d/dev-stack/kustomization.yaml`, re-apply. Monolith returns to ClusterIP-only. No data touched.

## Risks / watch-items

- **Shared oauth2-proxy-dev change** affects all `*.dev` hosts (path-scoped). Verify SSO still gates real app paths (acceptance check). Reversible.
- **Fleet Phase-2a interaction:** `prod-fleet/mentolder` already excludes the 8 dev.mentolder.de resources (incl. `oauth2-proxy-dev`) from the fleet overlay, so the arg change does not propagate to fleet. No new prod resource is added, so nothing new for the fleet overlay to exclude. Confirm no merge collision with `feature/fleet-phase2-cutover`.
- **Token in URL:** acceptable for `claude.ai`-style header-less clients; prefer the `Authorization: Bearer` form when the client supports it.
