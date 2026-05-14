# Deployed Dashboard + Ticket Thread — Design

**Date:** 2026-05-04
**Status:** Approved (brainstorming)
**Hostname:** `dashboard.mentolder.de`

## Goal

Deploy a web-accessible, SSO-gated, admin-only dashboard for the mentolder workspace that gives the admin (Patrick) two things from anywhere on the internet:

1. **Read-only operational visibility** across the mentolder and korczewski clusters (pod status, services, ingress, last-200-line logs, ArgoCD app status, recent backups).
2. **A ticket conversation panel** wired to the existing `bugs.bug_tickets` table, extended with a comment thread so the dashboard becomes the persistent communication channel between Patrick and Claude (or any future operator).

## Non-Goals

- Not a remote shell. The deployed dashboard does **not** execute `task` commands.
- Not a destructive ops console. No `delete`, `apply`, `restart`, `scale`, `exec`, `port-forward`, or `--follow` log streaming.
- Not a replacement for the local `dashboard/server.js` — that keeps the full task-runner surface bound to `127.0.0.1`.
- Not a ticket-intake form. Filing tickets stays on `web.mentolder.de` via the existing `bug-report.ts` flow.
- Not multi-tenant. One admin allowlist (`PORTAL_ADMIN_USERNAME`), one cluster pair, one DB.

## Pre-migration: free up `dashboard.${PROD_DOMAIN}`

Today, `dashboard.${PROD_DOMAIN}` is a second hostname for the Traefik admin UI (`prod/traefik-dashboard.yaml`), authenticated via `oauth2-proxy-traefik` against a Keycloak client named `traefik-dashboard`. The Keycloak client's redirect URI is mistakenly templated against `${DASHBOARD_DOMAIN}` rather than `${TRAEFIK_DOMAIN}`.

Three small edits free the hostname:

1. `prod/traefik-dashboard.yaml`: remove `Host(\`dashboard.${PROD_DOMAIN}\`)` from both the `/oauth2` rule and the catch-all rule. Traefik UI ends up reachable only at `traefik.${PROD_DOMAIN}`.
2. `prod/patch-oauth2-proxy-traefik.yaml`: remove the `--whitelist-domain=dashboard.${PROD_DOMAIN}` arg.
3. `k3d/realm-workspace-dev.json` and `prod-mentolder/realm-workspace-mentolder.json`: in the `traefik-dashboard` client, change the redirect URI templates from `${DASHBOARD_DOMAIN}` to `${TRAEFIK_DOMAIN}` (both vars are already in `prod/import-entrypoint.sh` and `k3d/realm-import-entrypoint.sh`'s envsubst list).

After those edits, `dashboard.${PROD_DOMAIN}` is unrouted and the Keycloak `dashboard` client name is unused — both available for the new app.

## Architecture

```
Internet
  │ TLS via existing wildcard cert
  ▼
Traefik IngressRoute (dashboard.mentolder.de)
  │
  ▼
oauth2-proxy-dashboard ─── Keycloak (workspace realm, client `dashboard`)
  │ pass X-Auth-Request-User
  ▼
dashboard-web (Node, single replica, namespace workspace)
  ├── kubectl (in-cluster ServiceAccount, mentolder, read-only Role)
  ├── kubectl (mounted kubeconfig SealedSecret, korczewski, read-only Role)
  └── Postgres (shared-db, role `website`, schema `bugs`)
```

The local dashboard at `dashboard/server.js` is unchanged and not part of this deployment.

## Components

### 1. `dashboard/web/` — new Node app

Forked from the current `dashboard/`. The `task`-runner pathway (spawn of `task` binary, `ALLOWED_COMMANDS`, `PROMPT_COMMANDS`, kubectl context switcher) is removed. Kept and reshaped: the static asset server, the Socket.io transport, the ENV input regex.

Folder layout:

```
dashboard/web/
  package.json
  server.js                  # Express + WebSocket
  lib/
    kubectl.js               # readonly helper, allowlist verbs/resources/namespaces
    db.js                    # pg pool, ticket + comment queries
    auth.js                  # X-Auth-Request-User → admin check
  public/
    index.html
    app.js
    style.css
```

Decision: factored into its own folder rather than a build-time flag in `dashboard/server.js`. Two reasons:
- Surface area diverges meaningfully (different auth, different transport for kubectl, different scope).
- A misconfigured flag must not be the only thing standing between the public internet and `task workspace:teardown`.

### 2. `kubectlReadonly()` helper

Hard-coded allowlists, no escape hatches:

| List       | Values                                                            |
|------------|-------------------------------------------------------------------|
| Verbs      | `get`, `logs`                                                     |
| Resources  | `pods`, `services`, `ingress`, `ingressroutes`, `applications`, `jobs` |
| Namespaces | `workspace`, `argocd`                                             |
| Contexts   | `mentolder` (default, in-cluster), `korczewski` (mounted kubeconfig) |

All argument values pass an `isArgSafe`-style regex (`/^[a-z][a-z0-9-]{0,63}$/` for resource names, no shell metachars). `kubectl` is invoked with `shell: false`, args as an array. Logs are fetched with `--tail=200`, never `--follow`.

### 3. RBAC

Applied on each cluster.

```yaml
# Namespace: workspace
kind: Role
metadata: { name: dashboard-readonly, namespace: workspace }
rules:
  - apiGroups: [""]
    resources: [pods, services]
    verbs: [get, list, watch]
  - apiGroups: [""]
    resources: [pods/log]
    verbs: [get, list]
  - apiGroups: [networking.k8s.io]
    resources: [ingresses]
    verbs: [get, list, watch]
  - apiGroups: [traefik.io]
    resources: [ingressroutes]
    verbs: [get, list, watch]
  - apiGroups: [batch]
    resources: [jobs]
    verbs: [get, list, watch]
---
# Namespace: argocd (mentolder hub only)
kind: Role
metadata: { name: dashboard-readonly-argocd, namespace: argocd }
rules:
  - apiGroups: [argoproj.io]
    resources: [applications]
    verbs: [get, list, watch]
```

Bound to ServiceAccount `dashboard-web` in each namespace via two RoleBindings on mentolder, one on korczewski (no argocd binding on korczewski — argocd is hub-only).

### 4. Korczewski kubeconfig

The mentolder pod holds a kubeconfig pointing at the korczewski API server with a non-expiring `kubernetes.io/service-account-token` token, scoped to the `dashboard-readonly` Role on korczewski.

- Generated once via `task dashboard:bootstrap-korczewski`. The task creates SA + Role + RoleBinding on korczewski, extracts the token, writes a kubeconfig YAML, seals it into mentolder's `environments/sealed-secrets/mentolder.yaml` as `dashboard-korczewski-kubeconfig`.
- Mounted in the dashboard-web pod at `/var/run/dashboard/kubeconfig-korczewski` (read-only). `kubectlReadonly()` selects it via `--kubeconfig=/var/run/dashboard/kubeconfig-korczewski` when context is `korczewski`.
- Acknowledged risk: this token grants read access to korczewski pod logs from a mentolder pod. A compromise of dashboard-web exposes log content (which can include connection strings, request bodies). Verbs are still get/list only, never exec.

### 5. Authentication and authorization

- **AuthN:** `oauth2-proxy-dashboard` modeled on `k3d/oauth2-proxy-docs.yaml`. New Keycloak OIDC client `dashboard` in the workspace realm, redirect URL `https://dashboard.mentolder.de/oauth2/callback`. Cookie name `_oauth2_proxy_dashboard`. Client secret stored as `DASHBOARD_OIDC_SECRET` in the SealedSecret.
- **AuthZ:** middleware in `dashboard/web/lib/auth.js` reads the upstream-trusted `X-Auth-Request-User` header. If the username isn't in `PORTAL_ADMIN_USERNAME` (comma-separated env var, same source the website uses), respond 403. Applied to every route except `/healthz`.

### 6. Ticket data model (additive migration)

```sql
CREATE TABLE IF NOT EXISTS bugs.bug_ticket_comments (
  id          BIGSERIAL PRIMARY KEY,
  ticket_id   TEXT NOT NULL REFERENCES bugs.bug_tickets(ticket_id) ON DELETE CASCADE,
  author      TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'comment'
              CHECK (kind IN ('comment', 'status_change', 'system')),
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bug_ticket_comments_ticket_idx
  ON bugs.bug_ticket_comments(ticket_id, created_at);
```

- Migration runs once on dashboard-web boot via `initBugTicketCommentsTable()`, mirroring the existing `initBugTicketsTable()` pattern in `website/src/lib/website-db.ts`.
- The existing `bugs.bug_tickets.resolution_note` column stays in place so `web.mentolder.de/admin/bugs` keeps working unchanged. Resolutions made through the dashboard write **both** the legacy `resolution_note` (for the website's view) and a `status_change` comment (for the thread).
- Reopen sets `status` back to `open`, clears `resolved_at` and `resolution_note` to NULL, appends a `status_change` comment.

### 7. REST API

All routes require admin auth. JSON request/response bodies. Mounted at `/api/...`.

| Method | Path                                | Body                  | Returns                         |
|--------|-------------------------------------|-----------------------|---------------------------------|
| GET    | `/api/tickets`                      | —                     | `BugTicketRow[]` (filtered)     |
| GET    | `/api/tickets/:id`                  | —                     | `{ticket, comments[]}`          |
| POST   | `/api/tickets/:id/comments`         | `{body}`              | the new comment                 |
| POST   | `/api/tickets/:id/resolve`          | `{note}`              | updated ticket                  |
| POST   | `/api/tickets/:id/reopen`           | `{reason}`            | updated ticket                  |
| POST   | `/api/tickets/:id/archive`          | —                     | updated ticket                  |
| GET    | `/api/k8s/pods?context=`            | —                     | `[{name,phase,age,restarts}]`   |
| GET    | `/api/k8s/services?context=`        | —                     | `[{name,type,clusterIP,ports}]` |
| GET    | `/api/k8s/ingress?context=`         | —                     | `[{name,host,paths}]`           |
| GET    | `/api/k8s/logs?context=&pod=`       | —                     | `{lines: string[]}` (last 200)  |
| GET    | `/api/k8s/argocd-apps`              | —                     | mentolder-only ArgoCD app status|
| GET    | `/api/k8s/backups?context=`         | —                     | recent backup jobs              |

`?context=` accepts `mentolder` | `korczewski`. Anything else: 400.

### 8. UI

Single-page app served from `dashboard/web/public/`. Plain HTML + vanilla JS, no build step (matches current `dashboard/public/`). Sections:

- **Top bar:** brand title, current username (from `X-Auth-Request-User` rendered server-side into `index.html` via a small template), cluster toggle (mentolder ↔ korczewski) bound to ops endpoints only.
- **Left nav:** `Tickets` (default landing) | `Pods & Services` | `Logs` | `ArgoCD` | `Backups`.
- **Tickets:** filter strip (status / category / free-text) → ticket list → ticket detail with chronological thread of `comments` (rendered inline regardless of `kind`, with status changes styled distinctly). Comment composer at the bottom. Resolve / Reopen / Archive in the detail header. Optimistic UI on comment post; polls `/api/tickets/:id` every 15s when the tab is focused.
- **Pods & Services / ArgoCD / Backups:** plain tables with a Refresh button. No auto-poll.
- **Logs:** select pod from a dropdown → click Fetch → static `<pre>` block with the last 200 lines. Refresh button only.

### 9. Manifests

- `k3d/dashboard.yaml` — Deployment, Service (`dashboard-web:3000`), ServiceAccount, Role, RoleBinding (workspace), RoleBinding (argocd, mentolder only — guarded in overlay), korczewski-kubeconfig volume mount referencing `dashboard-korczewski-kubeconfig` SealedSecret. Single replica, `imagePullPolicy: IfNotPresent`, image pinned by digest.
- `k3d/oauth2-proxy-dashboard.yaml` — clone of `k3d/oauth2-proxy-docs.yaml` with `--client-id=dashboard`, `--upstream=http://dashboard-web:3000`, `--cookie-name=_oauth2_proxy_dashboard`, `--redirect-url=https://dashboard.mentolder.de/oauth2/callback`.
- IngressRoute for `dashboard.mentolder.de` → `oauth2-proxy-dashboard:4180` defined in `prod-mentolder/ingress-dashboard.yaml`.
- **Not added to the base `k3d/kustomization.yaml`.** Only `prod-mentolder/kustomization.yaml` includes `../k3d/dashboard.yaml` and `../k3d/oauth2-proxy-dashboard.yaml`. Dev/k3d does not deploy the web dashboard. Korczewski overlay does not deploy it.
- Keycloak realm: new `dashboard` confidential client added to `prod-mentolder/realm-workspace-mentolder.json`. Client secret stored as `DASHBOARD_OIDC_SECRET` in `environments/.secrets/mentolder.yaml`, sealed.

### 10. Image build

`docker/Dockerfile.dashboard-web`:

```dockerfile
FROM node:22-alpine
RUN apk add --no-cache kubectl
WORKDIR /app
COPY dashboard/web/package*.json ./
RUN npm ci --omit=dev
COPY dashboard/web/ ./
USER node
EXPOSE 3000
CMD ["node", "server.js"]
```

Pushed to the existing internal registry. Pinned by digest in `k3d/dashboard.yaml`.

### 11. Taskfile additions

Added under a new namespace block in `Taskfile.yml`:

- `dashboard:web:build` — build image, push, update digest in manifest.
- `dashboard:web:deploy ENV=mentolder` — guards `ENV=mentolder` only, applies manifest, restarts pod.
- `dashboard:web:logs ENV=mentolder` — `kubectl -n workspace logs deploy/dashboard-web --tail=200`.
- `dashboard:bootstrap-korczewski` — one-shot:
  1. Apply SA + Role + RoleBinding on korczewski.
  2. Wait for the SA's auto-generated token Secret.
  3. Build a kubeconfig YAML pointing at korczewski API + embedded token + CA bundle.
  4. Seal into mentolder's `environments/sealed-secrets/mentolder.yaml` under key `dashboard-korczewski-kubeconfig`.

The existing `dashboard:*` tasks (if any in `Taskfile.yml`) for the local dashboard are not modified.

## Testing

- **Manifest validation:** `task workspace:validate` — covered by existing kubeconform CI pipeline.
- **Live smoke (`tests/runner.sh local FA-30`):** GET `https://dashboard.mentolder.de/` and assert 302 to Keycloak. Run after every prod deploy.
- **AuthZ unit (BATS):** Bash test that POSTs `/api/tickets/X/resolve` with a non-admin `X-Auth-Request-User` header (simulating the upstream side of oauth2-proxy locally) and asserts 403.
- **Manual QA checklist (in PR body):** open a ticket via website → see it in dashboard list → comment → resolve → verify website's `/admin/bugs` shows it as resolved with the resolution note → reopen → verify status_change row in `bug_ticket_comments`.
- **No automated coverage of the kubectl helper.** The verb/resource/namespace allowlists are short and grep-able; readability beats mocking.

## Out of scope (explicit YAGNI)

- Live log streaming.
- Multi-replica HA.
- Prometheus scraping.
- Audit log of admin actions (oauth2-proxy access logs + Kubernetes API server audit log are sufficient for one admin).
- Mobile-specific UI (responsive, but not custom).
- Write-back to `inbox_items` (the existing trigger in `initBugTicketsTable` already handles inbox sync on resolve/archive).
- Korczewski-side dashboard. If needed later, replicate the deployment, do not merge.

## Operational notes for future me / Claude

- **The location of this tool is `https://dashboard.mentolder.de`.** Admin-only, SSO via Keycloak workspace realm.
- **The ticket DB is `shared-db.workspace.svc.cluster.local`, schema `bugs`, tables `bug_tickets` and `bug_ticket_comments`.** Both the website (`/admin/bugs`) and this dashboard read/write here. The schema is shared; coordinate any schema changes with `website/src/lib/website-db.ts`.
- **To open a ticket programmatically (Claude → human):** use the existing `insertBugTicket(...)` path in `website-db.ts` or POST `/api/admin/bugs/create` on the website with a valid admin session. The dashboard does not duplicate intake.
- **To leave a comment on a ticket:** POST `/api/tickets/:id/comments` on the dashboard, or insert directly into `bugs.bug_ticket_comments` with `author = 'claude'` (or whatever bot identity).
- **Local destructive ops still happen via `dashboard/server.js` on `127.0.0.1`** (or directly via `task` CLI). Don't try to do them through the deployed dashboard — they're not exposed.

## Risks and mitigations

| Risk                                                                 | Mitigation                                                                 |
|----------------------------------------------------------------------|----------------------------------------------------------------------------|
| Stolen admin session                                                 | No mutating cluster ops exposed; ticket actions are all reversible.       |
| Dashboard-web compromise leaks korczewski log content                | RBAC limited to `get/list` on a small resource set; no exec; no follow.   |
| Schema drift between website and dashboard                           | One migration helper per table, idempotent, runs on both services' boot.  |
| `PORTAL_ADMIN_USERNAME` differs between website and dashboard envs   | Same env var, same source-of-truth in `environments/mentolder.yaml`.       |
| oauth2-proxy misconfigured (open redirect / accepts any user)        | Backend re-checks admin allowlist independent of proxy; non-admin = 403.  |
| Comment author spoofing                                              | `author` is set server-side from `X-Auth-Request-User`, never client body.|
