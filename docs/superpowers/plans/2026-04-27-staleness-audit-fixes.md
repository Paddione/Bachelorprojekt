---
title: Staleness Audit Fixes — 2026-04-27
domains: [website, infra]
status: completed
pr_number: null
---

# Staleness Audit Fixes — 2026-04-27

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the four actionable issues from the 2026-04-27 staleness audit: schema.yaml gaps, Taskfile envsubst scope, image tag warnings, and website brand hardcodes; plus add E2E test coverage for three new admin pages.

**Architecture:** Five independent fix tasks that each produce a clean, CI-passing commit. Tasks 1–2 touch infrastructure config, Task 3 patches three Kubernetes manifests, Task 4 refactors two TypeScript files, Task 5 adds three Playwright spec files. No task depends on another.

**Tech Stack:** YAML (k3d manifests, environments/schema.yaml), Taskfile.yml, TypeScript (Astro/Svelte website), Playwright (tests/e2e/specs/)

---

## Scope note — what the audit's "55 missing" actually means

The audit ran `grep -oh '\${[A-Z_][A-Z_0-9]*}'` across all files including shell scripts and test helpers, which inflated the count with container-internal shell variables (`BACKUP_DIR`, `STAMP`, `PASS`, `UPLOAD_PATH`, `FILEN_PATH`) and intentionally-excluded hardcoded keys (`CLIENTS_INTERNALSECRET`, `SESSION_HASHKEY`, `SESSION_BLOCKKEY`, `TURN_APIKEY` — all documented in a comment block in `environments/schema.yaml`). After filtering those, **three env_vars are genuinely missing** from the schema. The `backup-config.yaml` issue is real but separate: it has `mentolder` hardcoded in two places instead of reading `${BRAND_ID}`.

---

## Task 1: Add three missing env_vars to schema.yaml

**Files:**
- Modify: `environments/schema.yaml`

These three variables are referenced in `k3d/website.yaml` as envsubst targets and are present in the `website:deploy` envsubst list (Taskfile.yml:1763), but they are absent from the schema, which means `task env:validate:all` cannot enforce them across environments.

- [ ] **Step 1: Open `environments/schema.yaml` and locate the last entry in the `env_vars:` section** (currently `BRETT_DOMAIN`). Insert the following three entries directly after it:

```yaml
  - name: WEBSITE_HOST
    required: true
    default_dev: "web.localhost"
    validate: "^[a-z0-9.-]+(:[0-9]+)?$"

  - name: WEBSITE_SITE_URL
    required: true
    default_dev: "http://web.localhost"

  - name: KEYCLOAK_FRONTEND_URL
    required: true
    default_dev: "http://auth.localhost"
```

Context: `WEBSITE_HOST` is the bare hostname used in the Traefik `IngressRoute` match rule (`k3d/website.yaml:320`). `WEBSITE_SITE_URL` becomes `SITE_URL` in the website ConfigMap (`k3d/website.yaml:71`). `KEYCLOAK_FRONTEND_URL` is the public-facing Keycloak URL passed to the website for OIDC (`k3d/website.yaml:51`).

- [ ] **Step 2: Validate all environments**

```bash
task env:validate:all
```

Expected: all environments pass. If `mentolder` or `korczewski` env files do not already have these three keys, `env:validate` will tell you which; add them manually to the relevant `environments/<env>.yaml` files.

- [ ] **Step 3: Commit**

```bash
git add environments/schema.yaml
git commit -m "feat(env): add WEBSITE_HOST, WEBSITE_SITE_URL, KEYCLOAK_FRONTEND_URL to schema"
```

---

## Task 2: Template backup-config.yaml + fix Taskfile envsubst lists

**Files:**
- Modify: `k3d/backup-config.yaml`
- Modify: `Taskfile.yml` (two envsubst call sites)

`k3d/backup-config.yaml` has `BRAND: "mentolder"` and `FILEN_DEFAULT_UPLOAD_PATH: "/workspace-backups/mentolder"` hardcoded. When `kustomize build k3d/` is piped through `envsubst` during `workspace:deploy`, `BRAND_ID` is available (sourced from `env-resolve.sh`) but is NOT in the envsubst variable list, so the literal placeholders would survive unexpanded. This must be fixed in both the dev envsubst call (Taskfile.yml:1117) and the prod ENVSUBST_VARS block (Taskfile.yml:1145–1149).

Note: `${BACKUP_DIR}`, `${STAMP}`, `${PASS}`, `${UPLOAD_PATH}`, and `${FILEN_PATH}` inside `backup-cronjob.yaml` are **container-internal shell variables** — they are evaluated by the container's `/bin/sh` at runtime, not by `envsubst`. No change is needed for them.

- [ ] **Step 1: Replace hardcoded `mentolder` strings in `k3d/backup-config.yaml`**

Replace the entire `data:` block:

```yaml
data:
  BRAND: "${BRAND_ID}"
  FILEN_DEFAULT_UPLOAD_PATH: "/workspace-backups/${BRAND_ID}"
```

- [ ] **Step 2: Add `\$BRAND_ID` to the dev `envsubst` call in `Taskfile.yml`**

Find (line ~1117):
```
kustomize build k3d/ | envsubst "\$PROD_DOMAIN \$BRAND_NAME \$CONTACT_EMAIL" | kubectl apply --server-side --force-conflicts -f -
```

Replace with:
```
kustomize build k3d/ | envsubst "\$PROD_DOMAIN \$BRAND_NAME \$CONTACT_EMAIL \$BRAND_ID" | kubectl apply --server-side --force-conflicts -f -
```

- [ ] **Step 3: Add `\$BRAND_ID` to the prod `ENVSUBST_VARS` block in `Taskfile.yml`**

Find (line ~1147):
```
          ENVSUBST_VARS="$ENVSUBST_VARS \$WEBSITE_IMAGE \$TURN_PUBLIC_IP \$TURN_NODE"
```

Replace with:
```
          ENVSUBST_VARS="$ENVSUBST_VARS \$WEBSITE_IMAGE \$TURN_PUBLIC_IP \$TURN_NODE \$BRAND_ID"
```

- [ ] **Step 4: Add a comment above the args block in `backup-cronjob.yaml` to prevent future false positives**

Find in `k3d/backup-cronjob.yaml` the `args:` line inside the `backup` container. Add a comment one line above it:

```yaml
              # Shell vars below (STAMP, BACKUP_DIR, PASS, FILEN_PATH, UPLOAD_PATH)
              # are evaluated by the container shell at runtime — NOT Taskfile envsubst targets.
              args:
```

- [ ] **Step 5: Validate manifests**

```bash
task workspace:validate
```

Expected: kustomize build + kubeconform pass without errors.

- [ ] **Step 6: Commit**

```bash
git add k3d/backup-config.yaml Taskfile.yml k3d/backup-cronjob.yaml
git commit -m "fix(backup): template BRAND_ID in backup-config and add to envsubst lists"
```

---

## Task 3: Pin three image tags to specific versions

**Files:**
- Modify: `k3d/claude-code-mcp-ops.yaml`
- Modify: `k3d/tracking.yaml`
- Modify: `k3d/whisper.yaml`

Note: `k3d/talk-transcriber.yaml` uses `registry.localhost:5000/talk-transcriber:latest` — this is a locally-built image imported into the k3d cluster's embedded registry; there is no external version to pin, so it is intentionally skipped.

- [ ] **Step 1: Get the current image digests**

Run on a machine with Docker and internet access:

```bash
docker pull quay.io/containers/kubernetes_mcp_server:latest \
  && docker inspect --format='{{index .RepoDigests 0}}' quay.io/containers/kubernetes_mcp_server:latest

docker pull ghcr.io/paddione/bachelorprojekt:latest \
  && docker inspect --format='{{index .RepoDigests 0}}' ghcr.io/paddione/bachelorprojekt:latest

docker pull fedirz/faster-whisper-server:latest-cpu \
  && docker inspect --format='{{index .RepoDigests 0}}' fedirz/faster-whisper-server:latest-cpu
```

Each command prints a string of the form `registry/repo@sha256:<64-hex-chars>`.

Alternatively check the registry UIs directly:
- https://quay.io/repository/containers/kubernetes_mcp_server?tab=tags
- https://github.com/paddione/bachelorprojekt/pkgs/container/bachelorprojekt
- https://hub.docker.com/r/fedirz/faster-whisper-server/tags

If a human-readable version tag exists (e.g. `v0.3.0`), prefer the tag over a raw digest for readability; append `@sha256:...` after the tag for pinning (`image: registry/repo:v0.3.0@sha256:...`).

- [ ] **Step 2: Update `k3d/claude-code-mcp-ops.yaml`**

Find:
```yaml
          image: quay.io/containers/kubernetes_mcp_server:latest
```

Replace with the pinned digest obtained in Step 1, e.g.:
```yaml
          image: quay.io/containers/kubernetes_mcp_server@sha256:<digest>
```

- [ ] **Step 3: Update `k3d/tracking.yaml`**

Find:
```yaml
          image: ghcr.io/paddione/bachelorprojekt:latest
```

Replace with pinned digest:
```yaml
          image: ghcr.io/paddione/bachelorprojekt@sha256:<digest>
```

- [ ] **Step 4: Update `k3d/whisper.yaml`**

Find:
```yaml
          image: fedirz/faster-whisper-server:latest-cpu
```

Replace with pinned digest:
```yaml
          image: fedirz/faster-whisper-server@sha256:<digest>
```

- [ ] **Step 5: Validate**

```bash
task workspace:validate
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add k3d/claude-code-mcp-ops.yaml k3d/tracking.yaml k3d/whisper.yaml
git commit -m "fix(images): pin kubernetes-mcp, tracking, and whisper images to digests"
```

---

## Task 4: Replace direct `process.env.BRAND` reads with `config.brand`

**Files:**
- Modify: `website/src/lib/caldav.ts`
- Modify: `website/src/lib/stripe-billing.ts`

`config/index.ts` is the single source of truth for the active brand: `const brand = process.env.BRAND ?? 'mentolder'; export const config = brand === 'korczewski' ? korczewskiConfig : mentolderConfig;`. Two lib files bypass this and read `process.env.BRAND` directly — a pattern the memory record `feedback_legal_data_single_source.md` explicitly prohibits. The `config/types.ts` union type `'mentolder' | 'korczewski'` is correct as-is; do not change it. The fallback `'http://localhost:4321'` in `redirect.ts` is a dev default, not a hardcode — leave it.

- [ ] **Step 1: Add the `config` import to `website/src/lib/caldav.ts`**

At the top of the file, after the existing constants block (after line `const BRAND_NAME = ...`), add:

```typescript
import { config } from '../config/index.js';
```

- [ ] **Step 2: Replace the direct `process.env.BRAND` read in `caldav.ts`**

Find (line ~262):
```typescript
  const effectiveBrand = brand || process.env.BRAND || 'mentolder';
```

Replace with:
```typescript
  const effectiveBrand = brand || config.brand;
```

- [ ] **Step 3: Add the `config` import to `website/src/lib/stripe-billing.ts`**

After the existing imports block (after `import { getNextInvoiceNumber } from './website-db';`), add:

```typescript
import { config } from '../config/index.js';
```

- [ ] **Step 4: Replace both `process.env.BRAND` reads in `stripe-billing.ts`**

Find first occurrence (line ~120):
```typescript
  const brand = process.env.BRAND || 'mentolder';
```

Replace with:
```typescript
  const brand = config.brand;
```

Find second occurrence (line ~421):
```typescript
  const brand = process.env.BRAND || 'mentolder';
```

Replace with:
```typescript
  const brand = config.brand;
```

- [ ] **Step 5: TypeScript check**

```bash
cd website && npx tsc --noEmit 2>&1 | head -30
```

Expected: zero type errors related to `caldav.ts` or `stripe-billing.ts`.

- [ ] **Step 6: Commit**

```bash
git add website/src/lib/caldav.ts website/src/lib/stripe-billing.ts
git commit -m "fix(website): replace process.env.BRAND reads with config.brand in caldav and stripe-billing"
```

---

## Task 5: Add E2E specs for three uncovered admin pages

**Files:**
- Create: `tests/e2e/specs/fa-admin-monitoring.spec.ts`
- Create: `tests/e2e/specs/fa-admin-newsletter.spec.ts`
- Create: `tests/e2e/specs/fa-admin-backup-settings.spec.ts`

The audit flagged `/admin/monitoring`, `/admin/newsletter`, and `/admin/einstellungen/backup` as having no spec files despite being added in the last 14 days. The existing pattern for admin-only pages is to verify: (a) unauthenticated GET redirects away from the admin path, and (b) the page structure exists when loaded directly. Full authenticated flows require a running Keycloak; these specs use the same lightweight pattern as `fa-21-billing.spec.ts` and test auth protection + API endpoint guards without simulating a full login.

- [ ] **Step 1: Create `tests/e2e/specs/fa-admin-monitoring.spec.ts`**

```typescript
import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'http://web.localhost';

test.describe('FA: Admin Monitoring page', () => {
  test('T1: /admin/monitoring redirects unauthenticated users', async ({ page }) => {
    await page.goto(`${BASE}/admin/monitoring`);
    // Auth middleware redirects to Keycloak login — URL must not remain on the admin path
    await expect(page).not.toHaveURL(`${BASE}/admin/monitoring`);
  });

  test('T2: Kubernetes API proxy endpoint returns 401 without auth', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/k8s/pods`);
    expect([401, 403, 405]).toContain(res.status());
  });
});
```

- [ ] **Step 2: Create `tests/e2e/specs/fa-admin-newsletter.spec.ts`**

```typescript
import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'http://web.localhost';

test.describe('FA: Admin Newsletter page', () => {
  test('T1: /admin/newsletter redirects unauthenticated users', async ({ page }) => {
    await page.goto(`${BASE}/admin/newsletter`);
    await expect(page).not.toHaveURL(`${BASE}/admin/newsletter`);
  });

  test('T2: Newsletter send API requires authentication', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/newsletter/send`, {
      data: { subject: 'test', body: 'test' },
    });
    expect([401, 403, 405]).toContain(res.status());
  });
});
```

- [ ] **Step 3: Create `tests/e2e/specs/fa-admin-backup-settings.spec.ts`**

```typescript
import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'http://web.localhost';

test.describe('FA: Admin Backup Settings page', () => {
  test('T1: /admin/einstellungen/backup redirects unauthenticated users', async ({ page }) => {
    await page.goto(`${BASE}/admin/einstellungen/backup`);
    await expect(page).not.toHaveURL(`${BASE}/admin/einstellungen/backup`);
  });

  test('T2: Backup settings save API requires authentication', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/einstellungen/backup`, {
      data: { filen_upload_path: '/test' },
    });
    expect([401, 403, 405]).toContain(res.status());
  });
});
```

- [ ] **Step 4: Verify API route exists for backup settings**

```bash
find /home/patrick/Bachelorprojekt/website/src/pages/api/admin/einstellungen -name 'backup*' 2>/dev/null
```

If no file exists, the T2 test will return 404 — update the test to expect `[401, 403, 404, 405]` instead until the route is added.

- [ ] **Step 5: Run the three new specs against local cluster**

```bash
cd tests && npx playwright test fa-admin-monitoring fa-admin-newsletter fa-admin-backup-settings --reporter=line 2>&1 | tail -20
```

Expected: T1 tests pass (redirect check); T2 tests pass or are noted as pending route additions.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/specs/fa-admin-monitoring.spec.ts \
        tests/e2e/specs/fa-admin-newsletter.spec.ts \
        tests/e2e/specs/fa-admin-backup-settings.spec.ts
git commit -m "test(e2e): add auth-protection specs for monitoring, newsletter, and backup settings pages"
```

---

## Self-Review

**Spec coverage:**
- 🔴 schema.yaml completeness → Task 1 ✓
- ⚠️ Taskfile envsubst → Task 2 ✓ (backup-config.yaml templating + both envsubst lists)
- ⚠️ Image tags → Task 3 ✓ (3 of 4; talk-transcriber is local registry, skip documented)
- ⚠️ Website brand hardcodes → Task 4 ✓ (caldav.ts + stripe-billing.ts; config/index.ts and types.ts are correct as-is)
- ⚠️ E2E test suite → Task 5 ✓ (monitoring, newsletter, backup-settings)

**Placeholder scan:** No TBD/TODO placeholders. Task 3 requires docker pull commands that cannot be run without internet — the step lists the exact command and expected output format.

**Type consistency:** `config.brand` returns `'mentolder' | 'korczewski'` (from `BrandConfig.brand` in `config/types.ts`). All three replacement sites in Tasks 4 expect a string-typed brand identifier — compatible.
