# Mailpit OIDC Migration + Basic-Auth Retirement

**Date:** 2026-04-23
**Status:** Approved — ready for implementation plan
**Scope:** Replace htpasswd basic-auth on `mail.<domain>` with Keycloak-backed SSO via a dedicated oauth2-proxy, mirroring the pattern shipped for the Traefik dashboard in commit `08e2a6c`. Delete the `traefik-basic-auth` Secret and `basic-auth-internal` middleware once Mailpit is the last consumer.

## Motivation

The `traefik-basic-auth` Secret (htpasswd for `admin:…`) protects three admin surfaces today: the Traefik dashboard, Mailpit (`mail.<domain>`), and mcp-status (`ai.<domain>`). The Traefik dashboard was migrated to OIDC in `08e2a6c`; a parallel effort is removing mcp-status / `ai.<domain>` entirely. That leaves Mailpit as the sole remaining basic-auth consumer — so moving it to OIDC lets us delete the Secret + middleware wholesale and erase the drift-risk footnote flagged in the prior PR review.

## Non-goals

- Touching `ai.<domain>` / mcp-status manifests — the separate "remove ai/mcp" PR owns that work.
- Adding an admin-panel tile for AI MCP Status — it's going away.
- Refactoring the shipped `oauth2-proxy-traefik` into a shared admin proxy (rejected: either leaks admin cookies via a `.${PROD_DOMAIN}` cookie-domain, or forces per-host re-login anyway; small cost of a second Deployment is preferable to either tradeoff).

## Architecture

```
Browser
  └─ https://mail.<domain>/
       │
       ▼
   Traefik IngressRoute (mail-<env>)
       ├─ PathPrefix(/oauth2)   ──► oauth2-proxy-mailpit :4180 (no auth middleware)
       │                             (sign_in, start, callback, sign_out)
       │
       └─ Host(mail.<domain>)    ──► mailpit :8025
            ├─ mailpit-errors    (401 → oauth2-proxy /oauth2/sign_in?rd=…)
            ├─ mailpit-auth      (ForwardAuth → oauth2-proxy /oauth2/auth → 202|401)
            ├─ security-headers
            └─ hsts-headers

oauth2-proxy-mailpit (Deployment)
  ├─ Keycloak client: mailpit-admin
  ├─ Cookie: _oauth2_proxy_mailpit (per-host; no cookie-domain)
  ├─ whitelist-domain: mail.<domain>
  └─ authenticated-emails-file: patrick@korczewski.de, quamain@web.de
```

Flow matches the Traefik dashboard precisely — only the client ID, cookie name, allow-list ConfigMap, Deployment name, and whitelisted host change.

## Components

### 1. `k3d/oauth2-proxy-mailpit.yaml` (new)

Copy of `k3d/oauth2-proxy-traefik.yaml` with these substitutions:
- `oauth2-proxy-traefik` → `oauth2-proxy-mailpit` (Deployment, Service, ConfigMap name)
- `--client-id=traefik-dashboard` → `--client-id=mailpit-admin`
- `--client-secret=$(TRAEFIK_OIDC_SECRET)` → `--client-secret=$(MAIL_OIDC_SECRET)`
- `--redirect-url=http://traefik.localhost/oauth2/callback` → `http://mail.localhost/oauth2/callback`
- `--cookie-name=_oauth2_proxy_traefik` → `--cookie-name=_oauth2_proxy_mailpit`
- `--oidc-extra-audience=traefik-dashboard` → `--oidc-extra-audience=mailpit-admin`
- `--whitelist-domain=traefik.localhost` → `--whitelist-domain=mail.localhost`
- env `TRAEFIK_OIDC_SECRET` → `MAIL_OIDC_SECRET`
- allow-list ConfigMap `oauth2-proxy-traefik-allowed-emails` → `oauth2-proxy-mailpit-allowed-emails`, same two emails.

Added to `k3d/kustomization.yaml` resources list.

### 2. `prod/patch-oauth2-proxy-mailpit.yaml` (new)

Copy of `prod/patch-oauth2-proxy-traefik.yaml` with the same string substitutions plus `${PROD_DOMAIN}` wiring: `redirect-url=https://mail.${PROD_DOMAIN}/oauth2/callback`, `whitelist-domain=mail.${PROD_DOMAIN}`, `--cookie-secure=true`. Added to `prod/kustomization.yaml` patches list.

### 3. `prod/mail-ingressroute.yaml` (new)

IngressRoute CRD for `mail.${PROD_DOMAIN}` — replaces the plain `Ingress` block currently in `prod/ingress.yaml`. Two `Middleware` CRDs co-located:
- `mailpit-auth` — ForwardAuth to `oauth2-proxy-mailpit.workspace.svc.cluster.local:4180/oauth2/auth`
- `mailpit-errors` — errors middleware with status `401` → `oauth2-proxy-mailpit:4180/oauth2/sign_in?rd=…`

Two routes:
- `Host(mail.${PROD_DOMAIN}) && PathPrefix(/oauth2)` → `oauth2-proxy-mailpit` (no auth middleware; security + hsts only)
- `Host(mail.${PROD_DOMAIN})` → `mailpit` (hsts + security-headers + mailpit-errors + mailpit-auth)

TLS via `workspace-wildcard-tls`.

Added to `prod/kustomization.yaml` resources list. The existing `Ingress` block for `mail.${PROD_DOMAIN}` in `prod/ingress.yaml` is **removed** (not patched — it becomes an `IngressRoute`, a different CRD).

### 4. Dev-side `mail.localhost` route

Same conversion in `k3d/ingress.yaml` — remove the existing `mail.localhost` `Ingress` block, and add an `IngressRoute` + the `mailpit-auth` / `mailpit-errors` Middleware CRDs in a new file `k3d/mail-ingressroute-dev.yaml`. The dev route uses the `web` entrypoint (plain HTTP) and no TLS block.

### 5. Keycloak realm client `mailpit-admin`

Add a new client to:
- `k3d/realm-workspace-dev.json`
- `prod-mentolder/realm-workspace-mentolder.json`
- `prod-korczewski/realm-workspace-korczewski.json`

Identical shape to `traefik-dashboard` client, with:
- `clientId: mailpit-admin`
- `secret: ${MAIL_OIDC_SECRET}`
- `redirectUris: ["http(s)://${MAIL_DOMAIN}/oauth2/callback"]`
- `webOrigins: ["http(s)://${MAIL_DOMAIN}"]`

### 6. Realm import sed loop

`k3d/realm-import-entrypoint.sh` + `scripts/import-entrypoint.sh`: add `MAIL_OIDC_SECRET` to the placeholder-substitution list. `MAIL_DOMAIN` is already substituted — no change needed there.

### 7. `k3d/keycloak.yaml` env

Add `MAIL_OIDC_SECRET` env entry alongside `TRAEFIK_OIDC_SECRET`, sourced from `workspace-secrets`.

### 8. Secrets / schema

- `environments/schema.yaml`: new entry `MAIL_OIDC_SECRET` — `generated: true`, `length: 40`, consumed by `keycloak` + `oauth2-proxy-mailpit`.
- `k3d/secrets.yaml`: add placeholder `MAIL_OIDC_SECRET: "dev-mailpit-oidc-secret-change-me"` (base64-encoded inline).
- `environments/.secrets/mentolder.yaml` + `environments/.secrets/korczewski.yaml`: generate + add `MAIL_OIDC_SECRET`.
- `environments/sealed-secrets/mentolder.yaml` + `environments/sealed-secrets/korczewski.yaml`: reseal both via `task env:seal ENV=mentolder` and `task env:seal ENV=korczewski`.
- `scripts/secrets-audit.sh`: add `MAIL_OIDC_SECRET` to the parity check.

### 9. Basic-auth cleanup

Delete:
- The `basic-auth-internal` Middleware block in `k3d/traefik-middlewares-dev.yaml` (the file contains only this one resource — delete the whole file and remove it from `k3d/kustomization.yaml`).
- The `traefik-basic-auth` Secret block in `k3d/secrets.yaml` (lines 55–66 — the `---` separator, the comment header, and the Secret manifest).
- `prod/patch-traefik-basic-auth.yaml` (removed from `prod/kustomization.yaml` patches list).

Pre-check before deletion: `grep -rn 'basic-auth-internal\|traefik-basic-auth' k3d/ prod/ prod-mentolder/ prod-korczewski/` must return zero hits (excluding `k3d/docs-content/`) after my mail conversion. If the `ai./mcp-status` removal PR hasn't merged yet, those references still exist — in that case leave the Secret + middleware in place and drop the cleanup into a tiny follow-up PR. **Acceptance criterion for merging this PR: the grep returns zero hits outside docs-content, or the cleanup is deferred.**

### 10. Docs content cleanup

Update these files to reflect the new reality (Traefik dashboard + Mailpit are OIDC-protected; AI/MCP is gone; basic-auth is retired):
- `k3d/docs-content/security.md` (lines 55, 108) — remove `basic-auth-internal` rows; mention OIDC protection for both admin surfaces.
- `k3d/docs-content/architecture.md` (line 250) — remove the `basic-auth-internal` middleware description.
- `k3d/docs-content/security-report.md` (line 71) — replace the basic-auth paragraph with an OIDC paragraph.

Do **not** touch `k3d/docs-content/superpowers/plans/2026-04-13-security-hardening.md` — plans are immutable historical records.

After the doc edits, run `kubectl rollout restart deploy/docs -n workspace --context <env>` (per CLAUDE.md gotchas) — or just rely on the docs ConfigMap re-apply during the next `workspace:deploy`.

### 11. Website admin tile

- `k3d/website.yaml` ConfigMap: add `MAIL_EXTERNAL_URL: "https://mail.${PROD_DOMAIN}"` (dev variant: `http://mail.localhost`).
- `Taskfile.yml` `website:deploy` envsubst list: append `MAIL_EXTERNAL_URL`.
- `website/src/pages/admin.astro`: add a Mailpit tile next to Traefik (icon: envelope; label: "Mailpit"; href: `import.meta.env.PUBLIC_MAIL_EXTERNAL_URL`).
- `scripts/secrets-audit.sh`: add `MAIL_EXTERNAL_URL` to the ConfigMap parity list (parallel to `TRAEFIK_EXTERNAL_URL`).

## Test plan

- `task workspace:validate` — passes (kustomize build + kubeconform).
- `task env:validate ENV=mentolder` / `ENV=korczewski` — passes.
- Manually on mentolder after deploy: `curl -I https://mail.mentolder.de/` → `302` to Keycloak; sign in with patrick@korczewski.de → Mailpit UI renders; sign in with a non-admin Keycloak user → `403` from oauth2-proxy.
- `grep -rn 'basic-auth-internal\|traefik-basic-auth' .` → zero matches (excluding docs / git history).

## Rollback

If OIDC misbehaves in prod, revert the PR; basic-auth comes back with it. Emergency bypass: port-forward `mailpit:8025` locally — Mailpit itself has no auth and is cluster-internal.

## Open questions

None. Design approved in conversation on 2026-04-23.
