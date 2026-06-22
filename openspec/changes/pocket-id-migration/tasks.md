---
title: "Pocket ID Migration — Keycloak ersetzen durch Pocket ID"
ticket_id: T001068
domains: [auth, infra, website, ops]
status: completed
file_locks: []
shared_changes: true
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Tasks: Pocket ID Migration (T001068)

- [x] Welle 0: Pocket ID deployen & konfigurieren (k3d/pocket-id.yaml, schema, envsubst)
- [x] Welle 1: 12 oauth2-proxy-Services auf Pocket ID umschwenken (config-only)
- [x] Welle 2: Custom-Integrationen (Website identity.ts, Nextcloud, Grafana, Brett)
- [x] Welle 3: Keycloak Shutdown (nach 14+7 Tagen Beobachtung)
- [x] Testing: BATS pocket-id-migration.bats + E2E-Tests erweitern
- [x] Final Verification: task test:changed + freshness + inventory

---

# Pocket ID Migration — Implementation Plan

Keycloak wird durch zwei unabhängige Pocket ID Instanzen (`id.mentolder.de` / `id.korczewski.de`) ersetzt. Treiber: Wartungslast (~512 MB RAM → ~50 MB, kein Realm-/Mapper-System mehr). Migration in 4 sequenziellen Wellen mit Rollback-Option bis Welle 3.

**Spec:** `docs/superpowers/specs/2026-06-21-pocket-id-migration-design.md`

---

## File Structure

```
k3d/pocket-id.yaml                                     ← NEU: Deployment + Service + IngressRoute + DB-Init-Job
prod/patch-pocket-id.yaml                              ← NEU: HTTPS, Hostname, PVC, Resource-Limits
k3d/kustomization.yaml                                 ← pocket-id.yaml in resources aufnehmen
prod/kustomization.yaml                                ← patch-pocket-id.yaml in patches aufnehmen
k3d/configmap-domains.yaml                             ← POCKET_ID_DOMAIN ergänzen
environments/schema.yaml                               ← 19 neue POCKET_ID_* Secrets + 2 Env-Vars
environments/dev.yaml                                  ← POCKET_ID_FRONTEND_URL + POCKET_ID_URL
environments/fleet-mentolder.yaml                      ← POCKET_ID_FRONTEND_URL + POCKET_ID_URL
environments/fleet-korczewski.yaml                     ← POCKET_ID_FRONTEND_URL + POCKET_ID_URL
Taskfile.yml                                           ← envsubst-Listen um POCKET_ID_* erweitern
k3d/oauth2-proxy-mailpit.yaml                          ← Welle 1
k3d/oauth2-proxy-traefik.yaml                          ← Welle 1
k3d/oauth2-proxy-comfy.yaml                            ← Welle 1
k3d/dev-stack/oauth2-proxy-brainstorm.yaml             ← Welle 1
k3d/dev-stack/oauth2-proxy-sessions.yaml               ← Welle 1
k3d/oauth2-proxy-mediaviewer.yaml                      ← Welle 1
k3d/oauth2-proxy-videovault.yaml                       ← Welle 1
k3d/oauth2-proxy-studio.yaml                           ← Welle 1
k3d/docs.yaml                                          ← Welle 1
k3d/oauth2-proxy-vaultwarden.yaml                      ← Welle 1
k3d/recovery-browser.yaml                              ← Welle 1
k3d/claude-code-mcp-auth-proxy.yaml                    ← Welle 1
website/src/lib/auth.ts                                ← Welle 2
website/src/lib/identity.ts                            ← NEU: Pocket ID Admin API
k3d/website.yaml                                       ← Welle 2
k3d/nextcloud-oidc-dev.php                             ← Welle 2
prod/nextcloud-oidc-prod.php                           ← Welle 2
prod/monitoring/grafana-oidc-patch.yaml                ← Welle 2
k3d/monitoring/grafana-oidc-secret.yaml                ← Welle 2
k3d/oauth2-proxy-brett.yaml                            ← Welle 2
brett/src/server/auth.ts                               ← Welle 2
tests/spec/pocket-id-migration.bats                    ← NEU: run first to verify they fail
tests/e2e/specs/systemtest-01-auth.spec.ts             ← URL-Assertions auf Pocket ID
tests/e2e/specs/sa-02-auth.spec.ts                     ← URL-Assertions auf Pocket ID
tests/e2e/specs/fa-15-oidc.spec.ts                     ← URL-Assertions auf Pocket ID
website/src/data/test-inventory.json                   ← regenerieren nach Test-Änderungen
```

---


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Keycloak with Pocket ID as the OIDC provider for both brands (mentolder + korczewski), cutting RAM from ~512 MB to ~50 MB and removing the realm/mapper maintenance burden, while keeping rollback open until Welle 3.

**Architecture:** Two independent Pocket ID instances — `pocket-id` Deployment in `workspace` (→ `id.mentolder.de`) and in `workspace-korczewski` (→ `id.korczewski.de`), each backed by its own database in the shared PostgreSQL (`pocket_id`, namespace-isolated per brand). Keycloak stays live on `auth.<domain>` for the whole migration. Migration proceeds in sequential waves (0→3); each wave is independently revertable until the Keycloak DB is dropped in Welle 3.

**Tech Stack:** Kubernetes (Kustomize base `k3d/` + `prod/` overlay), Traefik IngressRoute, oauth2-proxy v7.9.0 (`--provider=oidc`), Pocket ID (`stonith404/pocket-id`, port 1411, OIDC + REST Admin API with API-key auth), Astro/TypeScript website, PHP Nextcloud OIDC plugin, Grafana native generic-OAuth, BATS + Playwright.

## Global Constraints

- Pocket ID image: `stonith404/pocket-id`; default container port **1411**; cluster-internal Service `http://pocket-id:1411`.
- Pocket ID discovery document lives at `/.well-known/openid-configuration`; OIDC endpoints are `/authorize`, `/api/oidc/token`, `/api/oidc/userinfo`, `/api/oidc/end-session`, JWKS at `/.well-known/jwks.json`.
- Pocket ID Admin REST API uses **API-key bearer auth**: header `Authorization: Bearer ${POCKET_ID_API_KEY}`. No OAuth password grant.
- Pocket ID role model is `isAdmin: boolean` per user — there are **no realm roles or groups**.
- All new secrets are named `POCKET_ID_*`. Keep every existing `KEYCLOAK_*` / `*_OIDC_SECRET` secret in place until Welle 3 (parallel operation requires both).
- Client IDs registered in Pocket ID stay **identical** to the Keycloak client IDs (e.g. `mailpit-admin`, `website`, `grafana`) so consumer config changes stay minimal.
- No brand-domain literals in manifests or code — use `${PROD_DOMAIN}` / `${POCKET_ID_DOMAIN}` (manifests) or `process.env.POCKET_ID_URL` / `POCKET_ID_FRONTEND_URL` (code). Dev literal is `id.localhost`.
- Every new `${VAR}` in a manifest MUST be registered in `environments/schema.yaml` AND added to the `envsubst` list of every Taskfile task that renders that manifest (see `docs/superpowers/references/envsubst-variable-management.md`).
- `scripts/env-resolve.sh` is **sourced, never executed**.
- Cross-cutting changes apply to **both** namespaces (`workspace` and `workspace-korczewski`) explicitly — there is no GitOps reconciler.
- **Arena is out of scope** (separate ticket, blocked on `korczewski-monolith-keycloak-auth`).
- After any test addition, regenerate `website/src/data/test-inventory.json` (`task test:inventory`) and commit it — CI fails on drift.

---

## Welle 0 — Pocket ID deployen & konfigurieren

### Requirement: Pocket ID runs in both namespaces and answers OIDC discovery

#### Scenario: Domain config carries the Pocket ID hostname

- [ ] Add `POCKET_ID_DOMAIN: "id.localhost"` to the `data:` block of `k3d/configmap-domains.yaml` (prod resolves via envsubst to `id.${PROD_DOMAIN}`).
- [ ] target_files: [`k3d/configmap-domains.yaml`]
- **Acceptance:** `grep POCKET_ID_DOMAIN k3d/configmap-domains.yaml` prints the dev literal; `task workspace:validate` (kustomize build) stays green.

#### Scenario: shared-db hosts the Pocket ID database

- [ ] Add a `Job` named `pocket-id-db-init` to a new manifest `k3d/pocket-id.yaml` that runs `psql` against `shared-db` and idempotently creates the DB:
  `SELECT 'CREATE DATABASE pocket_id' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='pocket_id')\gexec`
  plus a role: `DO $$ BEGIN CREATE ROLE pocket_id LOGIN PASSWORD '...'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;` then `GRANT ALL ON DATABASE pocket_id TO pocket_id;`. The namespace selects which brand's shared-db it lands in, so one manifest name serves both `pocket_id_mentolder`/`pocket_id_korczewski` logically (DB named `pocket_id`, namespace-isolated). Pull the superuser password from `secretKeyRef: { name: workspace-secrets, key: SHARED_DB_PASSWORD }` and the role password from `POCKET_ID_DB_PASSWORD`.
- [ ] Read `k3d/videovault.yaml` (its DB-init Job) first and copy its exact `securityContext`, image (`postgres:16-alpine`), and connection-string pattern so this Job matches house style.
- [ ] target_files: [`k3d/pocket-id.yaml`]
- **Acceptance:** `kubectl apply --dry-run=client -f k3d/pocket-id.yaml` passes for the Job.

#### Scenario: Pocket ID Deployment + Service + IngressRoute exist in the base

- [ ] In `k3d/pocket-id.yaml` add a `Deployment` `pocket-id` (1 replica, image `stonith404/pocket-id`, containerPort 1411). Env from `domain-config` ConfigMap + `workspace-secrets`:
  - `APP_URL=${POCKET_ID_FRONTEND_URL}` (public base)
  - `TRUST_PROXY=true`
  - `DB_CONNECTION_STRING` built from `POCKET_ID_DB_PASSWORD` → `postgresql://pocket_id:<pw>@shared-db:5432/pocket_id?sslmode=disable`
  - SMTP block for magic-link mails: `SMTP_HOST=${SMTP_HOST}`, `SMTP_PORT=${SMTP_PORT}`, `SMTP_USER=${SMTP_USER}`, `SMTP_PASSWORD` from secret, `SMTP_FROM=${SMTP_FROM}`.
  - `securityContext`: `runAsNonRoot: true`; mount an `emptyDir` at `/app/data` in dev (Pocket ID writes its data dir there); the prod patch swaps it for a PVC.
- [ ] Add a `Service` `pocket-id` (port 1411 → targetPort 1411).
- [ ] Add a Traefik `IngressRoute` `pocket-id` matching `Host(\`${POCKET_ID_DOMAIN}\`)` → Service `pocket-id:1411`, entryPoint `web` (dev). Copy the IngressRoute shape from `k3d/vaultwarden.yaml`.
- [ ] target_files: [`k3d/pocket-id.yaml`]
- **Acceptance:** `kubectl apply --dry-run=client -f k3d/pocket-id.yaml` succeeds; manifest references only `${POCKET_ID_DOMAIN}`, `${POCKET_ID_FRONTEND_URL}`, `${SMTP_*}`, and schema-declared secret keys.

#### Scenario: Pocket ID is wired into the kustomize base

- [ ] Add `pocket-id.yaml` to the `resources:` list in `k3d/kustomization.yaml` (alphabetical position near `nextcloud.yaml`).
- [ ] target_files: [`k3d/kustomization.yaml`]
- **Acceptance:** `kubectl kustomize k3d/ | grep -c 'name: pocket-id'` ≥ 2 (Deployment + Service).

#### Scenario: Prod overlay adds HTTPS, hostname, and persistence

- [ ] Create `prod/patch-pocket-id.yaml`: (a) IngressRoute patch giving the `websecure` entryPoint + `tls.secretName: ${TLS_SECRET_NAME}` and `Host(\`id.${PROD_DOMAIN}\`)`; (b) a patch swapping the `/app/data` `emptyDir` for a `PersistentVolumeClaim` (`pocket-id-data`, 1Gi); (c) resource `limits`/`requests` (request 64Mi/50m, limit 128Mi/200m). Model it on `prod/patch-vaultwarden.yaml`.
- [ ] Register `prod/patch-pocket-id.yaml` in `prod/kustomization.yaml` under `patches:` (and the PVC under `resources:` if a separate PVC manifest is used).
- [ ] target_files: [`prod/patch-pocket-id.yaml`, `prod/kustomization.yaml`]
- **Acceptance:** `kubectl kustomize prod-fleet/mentolder/ | grep -A2 'kind: IngressRoute'` shows `websecure` for the pocket-id route; `task workspace:validate` green.

#### Scenario: New secrets and env-vars are declared in the schema and env files

- [ ] Add to the `secrets:` block of `environments/schema.yaml` (all `required: false` so prod `env:validate` doesn't demand them before they exist; `generate: true`):
  - `POCKET_ID_API_KEY` (length 64) with `extra_namespaces: [{ namespace: website, secret: website-secrets }]`
  - `POCKET_ID_DB_PASSWORD` (length 32)
  - `POCKET_ID_MAIL_SECRET`, `POCKET_ID_TRAEFIK_SECRET`, `POCKET_ID_COMFY_SECRET`, `POCKET_ID_MEDIAVIEWER_SECRET`, `POCKET_ID_VIDEOVAULT_SECRET`, `POCKET_ID_STUDIO_SECRET`, `POCKET_ID_DOCS_SECRET`, `POCKET_ID_VAULTWARDEN_SECRET`, `POCKET_ID_RECOVERY_SECRET`, `POCKET_ID_CLAUDE_CODE_SECRET`, `POCKET_ID_NEXTCLOUD_SECRET` (each length 40)
  - `POCKET_ID_GRAFANA_SECRET` (length 40) with `extra_namespaces: [{ namespace: monitoring, secret: grafana-oidc }]`
  - `POCKET_ID_WEBSITE_SECRET`, `POCKET_ID_BRETT_SECRET` (length 40) with `extra_namespaces: [{ namespace: website, secret: website-secrets }]`
  - `POCKET_ID_BRAINSTORM_SECRET` (length 40, `required: false` — dev-only)
  - `POCKET_ID_SESSION_HUB_SECRET` (length 64, `required: false` — dev-only)
- [ ] Add to `env_vars:` of `environments/schema.yaml`:
  - `POCKET_ID_FRONTEND_URL` (`required: false`, `default_dev: "http://id.localhost"`)
  - `POCKET_ID_URL` (`required: false`, `default_dev: "http://pocket-id:1411"`)
- [ ] Add `POCKET_ID_FRONTEND_URL` + `POCKET_ID_URL` to `env_vars:` of `environments/dev.yaml`, `environments/fleet-mentolder.yaml`, `environments/fleet-korczewski.yaml` (FRONTEND_URL resolved to `https://id.mentolder.de` / `https://id.korczewski.de`; URL = `http://pocket-id:1411`).
- [ ] target_files: [`environments/schema.yaml`, `environments/dev.yaml`, `environments/fleet-mentolder.yaml`, `environments/fleet-korczewski.yaml`]
- **Acceptance:** `task env:validate ENV=fleet-mentolder`, `ENV=fleet-korczewski`, `ENV=dev` all pass.

#### Scenario: envsubst lists know the new variables

- [ ] In `Taskfile.yml`, add `${POCKET_ID_DOMAIN} ${POCKET_ID_FRONTEND_URL} ${POCKET_ID_URL}` to the envsubst variable list of every task that renders `k3d/configmap-domains.yaml`, `k3d/pocket-id.yaml`, and the prod overlay (`workspace:deploy` at minimum). Grep for the existing `${VAULT_DOMAIN}` token to locate the right lists.
- [ ] target_files: [`Taskfile.yml`]
- **Acceptance:** rendering `workspace:deploy ENV=dev` leaves no literal `${POCKET_ID_*}` tokens — verify with `kubectl kustomize` of the rendered output.

#### Scenario: Discovery endpoint is reachable on both brands (manual gate)

- [ ] Seal + deploy: `task env:seal ENV=fleet-mentolder && task env:seal ENV=fleet-korczewski`, then `task workspace:deploy ENV=mentolder && task workspace:deploy ENV=korczewski`.
- [ ] Manually create 1–3 admin accounts in each Pocket ID Web UI (`https://id.<domain>`); enable passkeys for them.
- [ ] Register all OIDC clients (Welle 1 + Welle 2) in each Pocket ID instance with the matching client IDs and the generated `POCKET_ID_*_SECRET` values; set each client's redirect URI to the existing `…/oauth2/callback` (oauth2-proxy) or the consumer's callback (website/grafana/nextcloud).
- [ ] target_files: []
- **Acceptance (gate):** `curl -fsS https://id.mentolder.de/.well-known/openid-configuration` and the korczewski equivalent both return valid JSON with `issuer`, `authorization_endpoint`, `token_endpoint`, `userinfo_endpoint`; admin login succeeds in both Web UIs; **Keycloak `auth.<domain>` discovery doc still serves** (untouched).

---

## Welle 1 — oauth2-proxy-Services auf Pocket ID umschwenken

> Each service below is the **same config-only edit** (no app-code change). For one oauth2-proxy manifest, replace the Keycloak args with the Pocket ID equivalent:
> ```yaml
> - --provider=oidc                          # was: --provider=keycloak-oidc
> - --client-id=<unchanged client id>
> - --client-secret=$(POCKET_ID_<SERVICE>_SECRET)
> - --oidc-issuer-url=http://pocket-id:1411     # dev; prod patch → https://id.${PROD_DOMAIN}
> - --login-url=http://id.localhost/authorize
> - --redeem-url=http://pocket-id:1411/api/oidc/token
> - --oidc-jwks-url=http://pocket-id:1411/.well-known/jwks.json
> - --profile-url=http://pocket-id:1411/api/oidc/userinfo
> ```
> Drop the Keycloak-realm `--skip-oidc-discovery=true` line if Pocket ID discovery resolves cleanly; otherwise keep `--skip-oidc-discovery=true` with the explicit URLs above. Rename the `env:` `secretKeyRef.key` and the local env var from the old `*_OIDC_SECRET` to `POCKET_ID_<SERVICE>_SECRET`. Keep `--oidc-extra-audience` only if the Pocket ID client emits that audience; otherwise remove it. Update the manifest's leading comment (Keycloak → Pocket ID).

### Requirement: Mailpit authenticates via Pocket ID

#### Scenario: oauth2-proxy-mailpit uses the Pocket ID issuer

- [ ] Edit `k3d/oauth2-proxy-mailpit.yaml`: apply the rewrite; `--provider=oidc`; rename `MAIL_OIDC_SECRET` → `POCKET_ID_MAIL_SECRET` (both `--client-secret=$(...)` and the `env:` `name`/`secretKeyRef.key`); keep `--client-id=mailpit-admin`.
- [ ] target_files: [`k3d/oauth2-proxy-mailpit.yaml`]
- **Acceptance:** `kubectl apply --dry-run=client -f k3d/oauth2-proxy-mailpit.yaml` passes; manual login at `mail.<domain>` redirects to Pocket ID and back; E2E `systemtest-01-auth.spec.ts` + `sa-02-auth.spec.ts` green.

### Requirement: Traefik dashboard authenticates via Pocket ID

#### Scenario: oauth2-proxy-traefik uses the Pocket ID issuer

- [ ] Edit `k3d/oauth2-proxy-traefik.yaml`: apply the rewrite; rename `TRAEFIK_OIDC_SECRET` → `POCKET_ID_TRAEFIK_SECRET`.
- [ ] target_files: [`k3d/oauth2-proxy-traefik.yaml`]
- **Acceptance:** dry-run passes; `traefik.<domain>` login flow works.

### Requirement: ComfyUI authenticates via Pocket ID

#### Scenario: oauth2-proxy-comfy uses the Pocket ID issuer

- [ ] Edit `k3d/oauth2-proxy-comfy.yaml`: apply the rewrite; rename `COMFY_OIDC_SECRET` → `POCKET_ID_COMFY_SECRET`.
- [ ] target_files: [`k3d/oauth2-proxy-comfy.yaml`]
- **Acceptance:** dry-run passes; `ai.<domain>` login flow works.

### Requirement: Brainstorm (dev) authenticates via Pocket ID

#### Scenario: oauth2-proxy-brainstorm uses the Pocket ID issuer

- [ ] Edit `k3d/dev-stack/oauth2-proxy-brainstorm.yaml`: apply the rewrite; rename `BRAINSTORM_OIDC_SECRET` → `POCKET_ID_BRAINSTORM_SECRET`.
- [ ] target_files: [`k3d/dev-stack/oauth2-proxy-brainstorm.yaml`]
- **Acceptance:** dry-run passes; dev brainstorm login flow works.

### Requirement: Session Hub (dev) authenticates via Pocket ID

#### Scenario: oauth2-proxy-sessions uses the Pocket ID issuer

- [ ] Edit `k3d/dev-stack/oauth2-proxy-sessions.yaml`: apply the rewrite; rename `SESSION_HUB_OIDC_SECRET` → `POCKET_ID_SESSION_HUB_SECRET`. The old config gated on the Keycloak `/session-hub-access` group — Pocket ID has no groups; gate via `--authenticated-emails-file` allow-list instead.
- [ ] target_files: [`k3d/dev-stack/oauth2-proxy-sessions.yaml`]
- **Acceptance:** dry-run passes; dev session-hub login flow works.

### Requirement: MediaViewer authenticates via Pocket ID

#### Scenario: oauth2-proxy-mediaviewer uses the Pocket ID issuer

- [ ] Edit `k3d/oauth2-proxy-mediaviewer.yaml`: apply the rewrite; rename `MEDIAVIEWER_OIDC_CLIENT_SECRET` → `POCKET_ID_MEDIAVIEWER_SECRET`.
- [ ] target_files: [`k3d/oauth2-proxy-mediaviewer.yaml`]
- **Acceptance:** dry-run passes; `mediaviewer.<domain>` login flow works.

### Requirement: VideoVault authenticates via Pocket ID

#### Scenario: oauth2-proxy-videovault uses the Pocket ID issuer

- [ ] Edit `k3d/oauth2-proxy-videovault.yaml`: apply the rewrite; rename `VIDEOVAULT_OIDC_SECRET` → `POCKET_ID_VIDEOVAULT_SECRET`.
- [ ] target_files: [`k3d/oauth2-proxy-videovault.yaml`]
- **Acceptance:** dry-run passes; `videovault.<domain>` login flow works.

### Requirement: Studio authenticates via Pocket ID

#### Scenario: oauth2-proxy-studio uses the Pocket ID issuer

- [ ] Edit `k3d/oauth2-proxy-studio.yaml`: apply the rewrite; rename `STUDIO_OIDC_SECRET` → `POCKET_ID_STUDIO_SECRET`. The old config gated on the Keycloak `/coach-access` group — replace with an `--authenticated-emails-file` allow-list (add coach emails to the ConfigMap); document this in the manifest comment.
- [ ] target_files: [`k3d/oauth2-proxy-studio.yaml`]
- **Acceptance:** dry-run passes; `studio.<domain>` login works for a coach email; a non-coach email is rejected.

### Requirement: DocuSeal/Docs authenticates via Pocket ID

#### Scenario: docs.yaml oauth2-proxy section uses the Pocket ID issuer

- [ ] Edit the oauth2-proxy container section inside `k3d/docs.yaml`: apply the rewrite; rename `DOCS_OIDC_SECRET` → `POCKET_ID_DOCS_SECRET`.
- [ ] target_files: [`k3d/docs.yaml`]
- **Acceptance:** dry-run passes; `docs.<domain>` login flow works.

### Requirement: Vaultwarden authenticates via Pocket ID

#### Scenario: oauth2-proxy-vaultwarden uses the Pocket ID issuer

- [ ] Edit `k3d/oauth2-proxy-vaultwarden.yaml`: apply the rewrite; rename `VAULTWARDEN_OIDC_SECRET` → `POCKET_ID_VAULTWARDEN_SECRET`. If Vaultwarden has its own OIDC env block, repoint its issuer to the Pocket ID URL too.
- [ ] target_files: [`k3d/oauth2-proxy-vaultwarden.yaml`]
- **Acceptance:** dry-run passes; `vault.<domain>` login flow works.

### Requirement: Recovery browser authenticates via Pocket ID

#### Scenario: oauth2-proxy-recovery uses the Pocket ID issuer

- [ ] Edit the oauth2-proxy section of `k3d/recovery-browser.yaml`: apply the rewrite; rename `RECOVERY_OIDC_SECRET` → `POCKET_ID_RECOVERY_SECRET`. This manifest references `KC_DOMAIN` for its login URL — repoint to `POCKET_ID_DOMAIN`.
- [ ] target_files: [`k3d/recovery-browser.yaml`]
- **Acceptance:** dry-run passes; `recover.<domain>` login flow works.

### Requirement: Claude Code MCP auth proxy authenticates via Pocket ID

#### Scenario: claude-code-mcp-auth-proxy uses the Pocket ID issuer

- [ ] Edit `k3d/claude-code-mcp-auth-proxy.yaml`: apply the rewrite; rename `CLAUDE_CODE_OIDC_SECRET` → `POCKET_ID_CLAUDE_CODE_SECRET`.
- [ ] target_files: [`k3d/claude-code-mcp-auth-proxy.yaml`]
- **Acceptance:** dry-run passes; Claude Code MCP auth flow works.

### Requirement: All renamed secrets are sealed

#### Scenario: every renamed secret key exists in the sealed secret

- [ ] Re-seal after all renames: `task env:seal ENV=mentolder && task env:seal ENV=korczewski` (the `POCKET_ID_*` keys were declared in Welle 0).
- [ ] target_files: []
- **Acceptance:** `kubectl get secret workspace-secrets -n workspace -o json | jq '.data | keys[]' | grep -c POCKET_ID` ≥ 16 after deploy.

---

## Welle 2 — Custom-Integrationen

### Requirement: Website OIDC login uses Pocket ID

#### Scenario: auth.ts points at Pocket ID OIDC endpoints

- [ ] Edit `website/src/lib/auth.ts`: replace the Keycloak constants with Pocket ID equivalents —
  - `const PI_FRONTEND_URL = process.env.POCKET_ID_FRONTEND_URL || ''`
  - `const PI_INTERNAL_URL = process.env.POCKET_ID_URL || 'http://pocket-id.workspace.svc.cluster.local:1411'`
  - `const AUTH_ENDPOINT = \`${PI_FRONTEND_URL}/authorize\``
  - `const TOKEN_ENDPOINT = \`${PI_INTERNAL_URL}/api/oidc/token\``
  - `const USERINFO_ENDPOINT = \`${PI_INTERNAL_URL}/api/oidc/userinfo\``
  - `const LOGOUT_ENDPOINT = \`${PI_FRONTEND_URL}/api/oidc/end-session\``
  - `const CLIENT_SECRET = process.env.POCKET_ID_WEBSITE_SECRET || process.env.WEBSITE_OIDC_SECRET || 'devwebsiteoidcsecret12345'`
  - Keep `CLIENT_ID = 'website'`, the PG session store, cookie logic, `exchangeCode`, `refreshTokens`, `getSession`, `issueSession` structurally unchanged.
- [ ] **Roles:** Pocket ID has no realm roles. Replace `decodeRealmRoles(...)`: set `realmRoles: userInfo.isAdmin ? ['admin'] : []` in `exchangeCode` (and in the refresh path). Drop the `missingArenaAud` refresh trigger (arena out of scope); keep the `exp`-based and web-session-expiry triggers. Keep the `UserSession.realmRoles` field for downstream compatibility.
- [ ] target_files: [`website/src/lib/auth.ts`]
- **Acceptance:** `cd website && npx tsc --noEmit` passes; existing `auth.ts` consumers compile unchanged.

#### Scenario: identity.ts replaces keycloak.ts as the user-management module

- [ ] Create `website/src/lib/identity.ts` exporting the **same public surface** the ~26 existing call sites import from `keycloak.ts`, re-implemented against the Pocket ID Admin REST API (`Authorization: Bearer ${process.env.POCKET_ID_API_KEY}`, base `${process.env.POCKET_ID_URL || 'http://pocket-id.workspace.svc.cluster.local:1411'}`):
  - `interface CreateUserParams { email: string; firstName: string; lastName: string; phone?: string; company?: string }`
  - `createUser(params): Promise<{ success: boolean; userId?: string; error?: string }>` → dedupe via `GET /api/users?search=<email>`, then `POST /api/users { email, firstName, lastName, isAdmin: false }`.
  - `setUserPassword(userId, password, temporary?): Promise<boolean>` → Pocket ID is passkey/magic-link first. **Execution decision:** verify against the running instance whether a one-time-access-token endpoint (`POST /api/users/:id/one-time-access-token`) exists; if yes, use it for the system-test seed flow; if no, implement as a no-op returning `true` and switch the seed flow to magic-link redeem. Document the chosen path in a code comment.
  - `sendPasswordResetEmail(userId): Promise<boolean>` → trigger Pocket ID magic-link / one-time-access email.
  - `interface PiUser { id: string; username: string; email?: string; firstName?: string; lastName?: string; enabled: boolean; isAdmin?: boolean }`
  - `listUsers(): Promise<PiUser[]>` → `GET /api/users`.
  - `getUserById(userId): Promise<PiUser | null>` → `GET /api/users/:id` (404 → null).
  - `deleteUser(userId): Promise<boolean>` → `DELETE /api/users/:id` (ok or 404 → true).
  - `updateUser(userId, { firstName?; lastName?; email?; enabled? }): Promise<boolean>` → `PUT /api/users/:id`.
  - `updateUserAttribute(userId, key, value): Promise<boolean>` → no arbitrary attributes in Pocket ID; map to custom-claims if available, else no-op returning `true` (phone/company are non-load-bearing). Comment this.
  - **Roles/groups compat shim** (preserves the build without a 26-file refactor): `interface KcRole { id: string; name: string }`; `listRealmRoles()` → `[{id:'admin',name:'admin'}]`; `getUserRealmRoles(userId)` → `[{id:'admin',name:'admin'}]` iff the user `isAdmin`, else `[]`; `assignRealmRole(userId, roles)` → if any role name is `admin`, `PUT /api/users/:id { isAdmin: true }`; `removeRealmRole(userId, roles)` → if `admin`, set `isAdmin: false`; `interface KcGroup { id: string; name: string; path?: string }`; `listGroups()` → `[]`; `assignUserToGroups()` → `true` (no-op).
- [ ] Repoint imports: for every file in `grep -rl "lib/keycloak" website/src`, change the import specifier from `…/lib/keycloak` to `…/lib/identity` (named symbols are unchanged thanks to the compat shim). **Do not delete `keycloak.ts` yet** (Welle 3).
- [ ] Adjust `website/src/pages/api/admin/systemtest/seed.test.ts` mocks from `keycloak` to `identity` if it mocks the module path.
- [ ] target_files: [`website/src/lib/identity.ts`, plus every file listed by `grep -rl "lib/keycloak" website/src` (≈26 files under `website/src/pages/api/**`, `website/src/lib/**`, `website/src/pages/admin/**`), `website/src/pages/api/admin/systemtest/seed.test.ts`]
- **Acceptance:** `cd website && npx tsc --noEmit` passes; `grep -rl "lib/keycloak" website/src` returns only `website/src/lib/keycloak.ts`.

#### Scenario: Website env carries Pocket ID URLs and API key

- [ ] In `k3d/website.yaml` add `POCKET_ID_FRONTEND_URL`, `POCKET_ID_URL` to the website ConfigMap env and `POCKET_ID_WEBSITE_SECRET`, `POCKET_ID_API_KEY` to the website Secret env (mirror how `KEYCLOAK_FRONTEND_URL` / `WEBSITE_OIDC_SECRET` are injected). Keep the old `KEYCLOAK_*` website env until Welle 3.
- [ ] target_files: [`k3d/website.yaml`]
- **Acceptance:** `kubectl kustomize k3d/ | grep -c POCKET_ID_API_KEY` ≥ 1; after deploy `kubectl exec deploy/website -n website -- printenv | grep POCKET_ID` shows both.

### Requirement: Nextcloud SSO uses Pocket ID

#### Scenario: Nextcloud OIDC provider URL points at Pocket ID

- [ ] Edit `k3d/nextcloud-oidc-dev.php`: `'oidc_login_provider_url' => 'http://pocket-id:1411'`; update `'oidc_login_client_id'` to the Pocket ID `nextcloud` client id and the client secret to read `POCKET_ID_NEXTCLOUD_SECRET`. If the file maps Keycloak group claims, map `isAdmin` → admin group instead.
- [ ] Edit `prod/nextcloud-oidc-prod.php`: `'oidc_login_provider_url' => 'https://id.${PROD_DOMAIN}'`; same client-id/secret update.
- [ ] target_files: [`k3d/nextcloud-oidc-dev.php`, `prod/nextcloud-oidc-prod.php`]
- **Acceptance:** `php -l` valid on both; after deploy Nextcloud SSO login via Pocket ID succeeds and first login provisions the user in Nextcloud.

### Requirement: Grafana native OIDC uses Pocket ID

#### Scenario: Grafana generic-OAuth env points at Pocket ID

- [ ] Edit `prod/monitoring/grafana-oidc-patch.yaml` (the `generic_oauth` ini block) — set the auth/token/api URLs to `https://id.${PROD_DOMAIN}/authorize`, `…/api/oidc/token`, `…/api/oidc/userinfo`; point the client secret at the `grafana-oidc` secret key `POCKET_ID_GRAFANA_SECRET`; replace the Keycloak `realm_access.roles` `role_attribute_path` JMESPath with one keying on the `isAdmin` claim (Admin if true, else Viewer). Update `k3d/monitoring/grafana-oidc-secret.yaml` so it carries `POCKET_ID_GRAFANA_SECRET` (dev value). Check `k3d/monitoring/grafana-ingress.yaml` for any embedded OIDC env too.
- [ ] target_files: [`prod/monitoring/grafana-oidc-patch.yaml`, `k3d/monitoring/grafana-oidc-secret.yaml`]
- **Acceptance:** dry-run apply passes; Grafana login via Pocket ID succeeds; an admin user lands with the Admin role.

### Requirement: Brett authenticates via Pocket ID

#### Scenario: Brett oauth2-proxy + native auth point at Pocket ID

- [ ] Edit `k3d/oauth2-proxy-brett.yaml` with the Welle 1 rewrite; rename `BRETT_OIDC_SECRET` → `POCKET_ID_BRETT_SECRET`.
- [ ] Edit `brett/src/server/auth.ts` (read it first): repoint the OIDC issuer/discovery URL from the Keycloak realm URL to `${POCKET_ID_URL}` / `https://id.${PROD_DOMAIN}`; change only the issuer/endpoint constants; update token-claim role extraction to use `isAdmin`.
- [ ] target_files: [`k3d/oauth2-proxy-brett.yaml`, `brett/src/server/auth.ts`]
- **Acceptance:** `cd brett && npx tsc --noEmit` passes (if Brett has a TS check); `brett.<domain>` auth flow green.

---

## Welle 3 — Keycloak Shutdown (nach 14+7 Tagen Beobachtung)

### Requirement: Keycloak is scaled down and observed

#### Scenario: Keycloak runs at zero replicas

- [x] After ≥14 days of Pocket ID in prod without rollback: `kubectl scale deployment keycloak --replicas=0 -n workspace` and `-n workspace-korczewski`. Observe 7 days. (Completed earlier — pods confirmed gone.)
- [ ] target_files: []
- **Acceptance:** all auth flows continue working with Keycloak at 0 replicas for 7 days; dashboards/alerts show no auth errors.

### Requirement: Keycloak manifests and code are removed; realm JSONs archived

#### Scenario: Keycloak Kubernetes resources are deleted

- [x] Remove `k3d/keycloak.yaml` and its `k3d/kustomization.yaml` entry; remove `prod/patch-keycloak.yaml` and its `prod/kustomization.yaml` entry; remove `k3d/realm-import-entrypoint.sh`. Remove the `auth.<domain>` IngressRoutes (in `k3d/keycloak.yaml` if co-located, else wherever defined).
- [x] target_files: [`k3d/keycloak.yaml`, `prod/patch-keycloak.yaml`, `k3d/realm-import-entrypoint.sh`, `k3d/kustomization.yaml`, `prod/kustomization.yaml`]
- **Acceptance:** `kubectl kustomize k3d/` and `kubectl kustomize prod-fleet/mentolder/` build with no `keycloak` resources.

#### Scenario: Realm JSONs are archived, not deleted

- [x] `git mv` the realm JSONs to an archive dir (`docs/archive/keycloak-realms/`): `k3d/realm-workspace-dev.json`, `prod/realm-workspace-prod.json`, `prod-mentolder/realm-workspace-mentolder.json`, `prod-korczewski/realm-workspace-korczewski.json`. Also archived staging: `prod-fleet/staging/realm-workspace-staging.json`.
- [ ] target_files: [the four realm JSONs + their new archive location]
- **Acceptance:** files exist under the archive path; `grep -rl realm-workspace k3d prod prod-mentolder prod-korczewski` is empty.

#### Scenario: keycloak.ts and keycloak scripts are removed

- [x] Delete `website/src/lib/keycloak.ts`. `git mv` to archive `scripts/keycloak-sync.sh`, `scripts/keycloak-ensure-mappers.sh`. Remove `tests/unit/keycloak-sync.bats`. Remove Taskfile call sites that invoke the deleted scripts.
- [ ] target_files: [`website/src/lib/keycloak.ts`, `scripts/keycloak-*.sh`, `Taskfile.yml`]
- **Acceptance:** `cd website && npx tsc --noEmit` passes (no `lib/keycloak` import remains); `grep -rl keycloak-sync Taskfile.yml scripts` resolved.

#### Scenario: Old KEYCLOAK_* secrets and the Keycloak DB are removed

- [x] Remove `KEYCLOAK_DB_PASSWORD`, `KEYCLOAK_ADMIN_PASSWORD`, `KEYCLOAK_FRONTEND_URL`, `KC_DOMAIN`, and every `*_OIDC_SECRET` superseded by a `POCKET_ID_*_SECRET` from `environments/schema.yaml`. Replaced with DROP DATABASE instructions comment (point of no return). Note: k3d/ files and .secrets/sealed-secrets still carry these (k3d shared-db still needs keycloak user; sealed secrets kept for backward compat).
- [ ] Drop the Keycloak DB: `kubectl exec` into shared-db → `DROP DATABASE keycloak` (both namespaces). **Point of no return — only after the 7-day observation.**
- [x] target_files: [`environments/schema.yaml`]
- **Acceptance:** `task env:validate ENV=fleet-mentolder` + `ENV=fleet-korczewski` pass; `grep -rE 'KEYCLOAK_DB_PASSWORD|KEYCLOAK_ADMIN_PASSWORD|KEYCLOAK_FRONTEND_URL' environments/schema.yaml` returns only comment markers (no active entries).

---

## Testing

### Requirement: Migration has automated coverage

#### Scenario: Write tests first — run them to verify they fail before Welle 0

- [ ] Write `tests/spec/pocket-id-migration.bats` skeleton with all planned `@test` cases, then `bats tests/spec/pocket-id-migration.bats` — to verify they fail (Pocket ID not yet deployed). Confirms the tests detect the missing state before migration begins.
- [ ] target_files: [`tests/spec/pocket-id-migration.bats`]
- **Acceptance:** `bats tests/spec/pocket-id-migration.bats` exits non-zero before Welle 0; exits zero after Welle 2 is deployed.

#### Scenario: New BATS spec validates the Pocket ID config surface

- [ ] Create `tests/spec/pocket-id-migration.bats` (model on `tests/spec/software-factory.bats`) with `@test` cases:
  - `pocket-id.yaml exists and is in the kustomize base` — assert `kubectl kustomize k3d/ | grep -q 'name: pocket-id'`.
  - `all migrated oauth2-proxy manifests use --provider=oidc (not keycloak-oidc)` — grep each migrated manifest.
  - `all migrated oauth2-proxy manifests reference a POCKET_ID_*_SECRET` — grep for the renamed keys.
  - `schema declares all POCKET_ID_* secrets` — assert each appears in `environments/schema.yaml`.
  - `no orphaned KEYCLOAK_* refs after Welle 3` — `skip` until the Welle 3 marker, then assert `grep -rE 'KEYCLOAK_(DB|ADMIN|FRONTEND)' k3d prod` is empty.
- [ ] target_files: [`tests/spec/pocket-id-migration.bats`]
- **Acceptance:** `bats tests/spec/pocket-id-migration.bats` green.

#### Scenario: E2E auth specs target Pocket ID

- [ ] Extend `tests/e2e/specs/systemtest-01-auth.spec.ts`, `tests/e2e/specs/sa-02-auth.spec.ts`, `tests/e2e/specs/fa-15-oidc.spec.ts`: update hard-coded `auth.<domain>` / `/realms/workspace` selectors and URL assertions to the Pocket ID equivalents (`id.<domain>`, `/authorize`, `/api/oidc/token`); keep the same success assertions (redirect → session cookie set).
- [ ] target_files: [`tests/e2e/specs/systemtest-01-auth.spec.ts`, `tests/e2e/specs/sa-02-auth.spec.ts`, `tests/e2e/specs/fa-15-oidc.spec.ts`]
- **Acceptance:** the three specs pass against a deployed Pocket ID environment (run via the `task` E2E entrypoint or `dev-flow-e2e`).

---

## Final Verification

### Requirement: All gates pass before PR

#### Scenario: Run the full verification suite and commit generated artifacts

- [ ] task test:changed
- [ ] task freshness:regenerate
- [ ] task freshness:check
- [ ] task test:inventory (bei Test-Änderungen — pocket-id-migration.bats + 3 E2E specs were added)
- [ ] git add tests/ website/src/data/test-inventory.json && git commit (Inventar-Commit)
- [ ] bash scripts/openspec.sh validate
- **Acceptance:** `task test:changed` and `task freshness:check` exit 0; `git status` shows `website/src/data/test-inventory.json` clean (committed); `bash scripts/openspec.sh validate` reports no new FAIL for `pocket-id-migration`.
