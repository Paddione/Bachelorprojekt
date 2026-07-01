---
title: "rustdesk-msi-installer — Implementation Plan"
ticket_id: T001378
domains: [infra, ci-cd]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# rustdesk-msi-installer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a single WiX-built Windows `.msi` that silently installs the official RustDesk client and auto-provisions relay config + a shared unattended password, distributed only through a new SSO-gated `downloads` surface.

**Architecture:** A WiX wrapper MSI (`rustdesk-installer/`) embeds the version+SHA256-pinned official RustDesk MSI, installs it silent via a deferred custom action, then runs `rustdesk.exe --config` / `rustdesk.exe --password` after polling the RustDesk service to `Running`. A manual-only `workflow_dispatch` CI job on `windows-latest` injects two GitHub-Actions repo secrets, smoke-tests the MSI, bakes it into a static-web-server image, and rolls out a new mentolder-namespaced `downloads` Deployment gated by an `oauth2-proxy` + Pocket ID OIDC client (docs-service pattern).

**Tech Stack:** WiX Toolset v4/v5 (`dotnet tool install --global wix`), PowerShell, GitHub Actions (`windows-latest`), Kustomize (`k3d/` base), oauth2-proxy + Pocket ID, `joseluisq/static-web-server`, ghcr.io.

## Global Constraints

- **One installer for both brands** — the relay is brand-independent (REQ-RUSTDESK-RELAY-001). No per-brand installer variant.
- **Two new GitHub-Actions repo secrets only:** `RUSTDESK_CLIENT_CONFIG_STRING`, `RUSTDESK_UNATTENDED_PASSWORD`. No SealedSecret, no `environments/schema.yaml` entry, no `environments/.secrets/` entry for these two — the sole consumer is the CI build job, not a running pod.
- **Password is never read back / logged / diffed.** The CI smoke test asserts only non-sensitive facts (config TOML exists and targets the expected ID-server host).
- **Build trigger is `workflow_dispatch` only** (REQ-RUSTDESK-CLIENT-004). No `push:` trigger.
- **The built MSI must never become a public workflow artifact** (REQ-RUSTDESK-CLIENT-003) — the repo is public. Distribution is exclusively via the SSO-gated `downloads` surface.
- **`downloads` is deployed once in the `workspace` namespace (mentolder)**, not duplicated to `workspace-korczewski`.
- **No brand-domain literals** in `k3d/` or `prod/` (S3): the dev ingress/domain entries use `downloads.localhost`; the `prod/` overlay entries use `downloads.${PROD_DOMAIN}` (mirroring the existing `docs.${PROD_DOMAIN}` pattern verbatim) — never a literal `mentolder.de`/`korczewski.de`.
- **`prod/` wiring is mandatory, not optional:** without it, `downloads.mentolder.de` is unreachable on the real fleet cluster (only `k3d/` dev works) — undermining the entire point of a distribution surface Patrick/gekko fetch from a real Windows machine. `prod/` has no per-brand sub-overlay for `docs`/`downloads` (confirmed: no `prod-mentolder/` or `prod-fleet/mentolder/` override touches either service) — the shared `prod/` layer alone patches it, so Task 4 only needs to touch `prod/`, not a deeper overlay chain.
- **No new DNS action needed for `downloads.mentolder.de`.** Verified against `scripts/fleet-dns-cutover.sh`: the root/wildcard A-record prefixes (`""`, `"*"`) already round-robin across all three fleet public IPs (`204.168.244.104` / `37.27.251.38` / `62.238.23.79`); only the raw-TCP `livekit`/`stream`/`turn` prefixes get a pinned per-node record. `docs.mentolder.de` has no dedicated DNS entry either — it resolves via the same wildcard, and Traefik does host-based routing on whichever fleet node the request lands on. `downloads.mentolder.de` is architecturally identical (plain HTTPS via Traefik + oauth2-proxy), so it inherits the same wildcard coverage automatically. This is unrelated to `rustdesk.mentolder.de` itself (the RustDesk ID-server's own raw-TCP hostname, pinned per `REQ-RUSTDESK-RELAY-005` in the already-archived parent spec) — out of scope here.
- **`prod/wildcard-certificate.yaml`** already issues `*.${PROD_DOMAIN}` + `${PROD_DOMAIN}` — covers `downloads.${PROD_DOMAIN}` automatically. No new `Certificate` resource needed.
- **`ghcr.io/paddione/downloads-content` must stay `private`** — no GitHub API can set package visibility (verified this session, only the web UI "Danger Zone" can); Task 8 Step 4 adds a read + hard-fail verification on every run, and Prerequisite 5 documents the one-time manual check/fix after the first push.
- **WiX syntax is unverified in the intel bundle** (`intel.json` risks[]) — Task 5 begins with an explicit WiX-doc verification step against the official docs; do not trust hand-written `.wxs` element/attribute spelling without it.
- **Line budget (S1):** every touched extension in this change (`.yaml`, `.yml`, `.wxs`, `.ps1`, `Dockerfile`) is S1-ungated (`_ext_limit` default 0 in `scripts/plan-lint.sh`). No line-budget constraint applies to any file here.

---

## Prerequisites (manual, one-time — NOT tasks)

These are human bootstrap steps outside the automatable plan; record them in the PR description:

1. On an already-configured RustDesk client: **Settings → Network → Export Server Config** to obtain the opaque config-string (it cannot be computed from host+key without RustDesk Server Pro). Set it as repo secret `RUSTDESK_CLIENT_CONFIG_STRING`.
2. Choose the shared unattended password and set it as repo secret `RUSTDESK_UNATTENDED_PASSWORD`.
3. Both secrets are set once in **GitHub repo Settings → Secrets and variables → Actions**. No further rotation automation exists; a suspected leak means a manual re-build + re-distribution.
4. **No manual DNS step required.** Researched and confirmed (see Global Constraints): `downloads.mentolder.de` is already covered by the existing wildcard `*.mentolder.de` A record (same mechanism serving `docs.mentolder.de` today) — do not create a dedicated A record for it.
5. **After the very first successful run of Task 8's workflow, manually confirm `ghcr.io/paddione/downloads-content`'s visibility is `private`** (GitHub → your profile → Packages → `downloads-content` → Package settings → "Danger Zone" → "Change visibility" if it is not). Researched and confirmed this session: **no REST or GraphQL API exists to set package visibility** — only the web UI can change it — so this first-run check cannot be automated away; Task 8 Step 4 only *verifies* it (every run, hard-failing if it drifts back to public) and cannot fix it.

## Requirement coverage

- **REQ-RUSTDESK-CLIENT-001** (auto-preconfigured installer → connects to the ID server): Task 5 (wrapper installs official MSI), Task 7 (`--config` custom action), Task 6/7 smoke test.
- **REQ-RUSTDESK-CLIENT-002** (unattended password, no manual entry): Task 7 (`--password` custom action). Verified manually only — the password is never read back.
- **REQ-RUSTDESK-CLIENT-003** (private, SSO-gated distribution; no public artifact): Tasks 1–4 (downloads SSO surface, incl. Task 4 `prod/` overlay wiring so `downloads.mentolder.de` is actually reachable on the fleet cluster), Task 8 (image push + rollout, no artifact upload, plus the Step 4 package-visibility hard-fail gate that backstops this requirement against a public `downloads-content` package bypassing the SSO gate — see Prerequisite 5 for the one-time manual fix path, since no API can set visibility).
- **REQ-RUSTDESK-CLIENT-004** (manual `workflow_dispatch` build only): Task 6 (trigger config).

## Quality-gate mapping (S2/S3/S4)

- **S2 (import cycles):** none — no TypeScript graph files touched.
- **S3 (no brand-domain literals):** `k3d/ingress.yaml` + `k3d/configmap-domains.yaml` use `downloads.localhost`; `prod/ingress.yaml` + `prod/configmap-domains.yaml` use `downloads.${PROD_DOMAIN}` (never a literal brand domain, mirroring the existing `docs.${PROD_DOMAIN}` entries); the workflow's `EXPECTED_ID_SERVER` lives in `.github/workflows/` (outside S3 scope).
- **S4 (no orphan manifests/scripts):** `k3d/downloads.yaml` + `k3d/oauth2-proxy-downloads.yaml` are registered in `k3d/kustomization.yaml` (Task 1); `prod/patch-oauth2-proxy-downloads.yaml` is registered in `prod/kustomization.yaml` (Task 4); `scripts/downloads.Dockerfile` is referenced by the new workflow (Task 8).

## File Structure

**New files:**
- `k3d/downloads.yaml` — `downloads` Deployment + Service (static-web-server serving the MSI on `:8787`, exposed as Service `:80`). Clone of `k3d/docs.yaml` shape.
- `k3d/oauth2-proxy-downloads.yaml` — `oauth2-proxy-downloads` Deployment + Service (`:4180`), OIDC client-id `downloads`, upstream `http://downloads:80`. Clone of `k3d/oauth2-proxy-docs.yaml`.
- `rustdesk-installer/Package.wxs` — WiX wrapper package: embeds + silent-installs the official MSI, wires the provisioning custom action.
- `rustdesk-installer/rustdesk-installer.wixproj` — WiX project (or a documented `wix build` invocation).
- `rustdesk-installer/provision.ps1` — post-install helper: polls the RustDesk service to `Running`, then applies `--config` / `--password` (values baked at build time).
- `.github/workflows/build-rustdesk-installer.yml` — manual `workflow_dispatch` build/smoke/pack/deploy pipeline on `windows-latest`.
- `scripts/downloads.Dockerfile` — minimal static-web-server image with the MSI baked into `/public`. Clone of `scripts/docs.Dockerfile`.
- `prod/patch-oauth2-proxy-downloads.yaml` — prod strategic-merge patch: `--redirect-url=https://downloads.${PROD_DOMAIN}/oauth2/callback`. Clone of `prod/patch-oauth2-proxy-docs.yaml`.

**Modified files:**
- `k3d/kustomization.yaml` — add `downloads.yaml` + `oauth2-proxy-downloads.yaml` to `resources`.
- `k3d/ingress.yaml` — add `downloads.localhost` host route → `oauth2-proxy-downloads:4180`.
- `k3d/configmap-domains.yaml` — add `DOWNLOADS_DOMAIN: "downloads.localhost"`.
- `k3d/pocket-id-client-seed.yaml` — add the `downloads` OIDC client row + its `SECRET_downloads` env.
- `environments/schema.yaml` — add `POCKET_ID_DOWNLOADS_SECRET` (`generate: true`, `length: 40`).
- `prod/configmap-domains.yaml` — add `DOWNLOADS_DOMAIN: "downloads.${PROD_DOMAIN}"`.
- `prod/ingress.yaml` — add a new `workspace-ingress-downloads` Ingress (own `tls.hosts` + host rule for `downloads.${PROD_DOMAIN}` → `oauth2-proxy-downloads:4180`), mirroring the existing `workspace-ingress-docs` block.
- `prod/kustomization.yaml` — register `patch-oauth2-proxy-downloads.yaml` under `patches:`.

---

### Task 1: Downloads static-file server + OIDC proxy manifests

**Files:**
- Create: `k3d/downloads.yaml`
- Create: `k3d/oauth2-proxy-downloads.yaml`
- Modify: `k3d/kustomization.yaml`

**Interfaces:**
- Produces: Deployment/Service `downloads` (Service port `80` → container `8787`); Deployment/Service `oauth2-proxy-downloads` (Service port `4180`). Both consumed by the ingress (Task 3) and OIDC client (Task 2).

- [x] **Step 1: Create `k3d/downloads.yaml`** — clone of `k3d/docs.yaml` with `docs` → `downloads` and the image swapped to the downloads-content image:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: downloads
  labels:
    app: downloads
spec:
  replicas: 1
  selector:
    matchLabels:
      app: downloads
  template:
    metadata:
      labels:
        app: downloads
    spec:
      imagePullSecrets:
        - name: ghcr-pull-secret
      containers:
        - name: downloads
          image: ghcr.io/paddione/downloads-content:latest
          imagePullPolicy: Always
          ports:
            - containerPort: 8787
          env:
            - name: SERVER_ROOT
              value: /public
            - name: SERVER_PORT
              value: "8787"
            - name: SERVER_CACHE_CONTROL_HEADERS
              value: "false"
          resources:
            requests:
              memory: 32Mi
              cpu: "50m"
            limits:
              memory: 128Mi
              cpu: "200m"
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            runAsNonRoot: true
            runAsUser: 1000
            capabilities:
              drop: ["ALL"]
            seccompProfile:
              type: RuntimeDefault
          readinessProbe:
            httpGet:
              path: /
              port: 8787
            initialDelaySeconds: 2
            periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: downloads
  labels:
    app: downloads
spec:
  selector:
    app: downloads
  ports:
    - port: 80
      targetPort: 8787
```

- [x] **Step 2: Create `k3d/oauth2-proxy-downloads.yaml`** — clone of `k3d/oauth2-proxy-docs.yaml` with every `docs` token replaced by `downloads`: `--client-id=downloads`, `--client-secret=$(POCKET_ID_DOWNLOADS_SECRET)`, `--redirect-url=http://downloads.localhost/oauth2/callback`, `--upstream=http://downloads:80`, `--cookie-name=_oauth2_proxy_downloads`, `--oidc-extra-audience=downloads`, and the `POCKET_ID_DOWNLOADS_SECRET` env `secretKeyRef` (name `workspace-secrets`, key `POCKET_ID_DOWNLOADS_SECRET`). Keep the `write-cookie-secret` initContainer (reads `OAUTH2_PROXY_COOKIE_SECRET` from `workspace-secrets`) and the pinned `oauth2-proxy` / `busybox` image digests unchanged. Deployment + Service `oauth2-proxy-downloads` on port `4180`.

- [x] **Step 3: Register both manifests in `k3d/kustomization.yaml`** — add under `resources:` next to the docs entry:

```yaml
  # Dokumentation
  - docs.yaml
  # SSO-gated downloads (RustDesk MSI distribution — mentolder only)
  - downloads.yaml
  - oauth2-proxy-downloads.yaml
```

- [x] **Step 4: Verify the base builds and includes the new resources**

Run: `kubectl kustomize k3d/ > /dev/null && kubectl kustomize k3d/ | grep -Ec 'name: downloads$|name: oauth2-proxy-downloads$'`
Expected: PASS — build succeeds and the count is `4` (two Deployments + two Services).

- [x] **Step 5: Commit**

```bash
git add k3d/downloads.yaml k3d/oauth2-proxy-downloads.yaml k3d/kustomization.yaml
git commit -m "feat(infra): add SSO-gated downloads service manifests [T001378]"
```

---

### Task 2: Downloads OIDC client secret + seed row

**Files:**
- Modify: `environments/schema.yaml`
- Modify: `k3d/pocket-id-client-seed.yaml`

**Interfaces:**
- Consumes: `oauth2-proxy-downloads` expects `workspace-secrets/POCKET_ID_DOWNLOADS_SECRET` (Task 1).
- Produces: the `downloads` OIDC client registered in Pocket ID with callback `${SCHEME}://downloads.${SUFFIX}/oauth2/callback`.

- [x] **Step 1: Add the schema entry** — insert after the `POCKET_ID_DOCS_SECRET` block in `environments/schema.yaml`, mirroring it exactly:

```yaml
  - name: POCKET_ID_DOWNLOADS_SECRET
    required: false
    generate: true
    length: 40
    description: "OIDC client secret for the `downloads` Pocket ID client (oauth2-proxy-downloads)."
```

- [x] **Step 2: Add the seed env** — in `k3d/pocket-id-client-seed.yaml`, add next to `SECRET_docs`:

```yaml
            - name: SECRET_downloads
              valueFrom: { secretKeyRef: { name: workspace-secrets, key: POCKET_ID_DOWNLOADS_SECRET, optional: true } }
```

- [x] **Step 3: Add the client row** — in the `ROWS` heredoc of `k3d/pocket-id-client-seed.yaml`, add directly under the `docs|SECRET_docs|...` line (matching the verified row format `id|secretEnv|callbackUrl`):

```
              downloads|SECRET_downloads|${SCHEME}://downloads.${SUFFIX}/oauth2/callback
```

- [x] **Step 4: Verify schema YAML parses and both files carry the new key**

Run:
```bash
python3 -c "import yaml,sys; yaml.safe_load(open('environments/schema.yaml')); print('schema ok')"
grep -c POCKET_ID_DOWNLOADS_SECRET environments/schema.yaml k3d/pocket-id-client-seed.yaml
grep -c 'downloads|SECRET_downloads' k3d/pocket-id-client-seed.yaml
```
Expected: PASS — `schema ok`, the secret key appears in both files, and the row grep returns `1`.

- [x] **Step 5: Commit**

```bash
git add environments/schema.yaml k3d/pocket-id-client-seed.yaml
git commit -m "feat(infra): register downloads Pocket ID client + secret [T001378]"
```

---

### Task 3: Downloads ingress route + domain config

**Files:**
- Modify: `k3d/ingress.yaml`
- Modify: `k3d/configmap-domains.yaml`

**Interfaces:**
- Consumes: Service `oauth2-proxy-downloads:4180` (Task 1).
- Produces: dev host route `downloads.localhost`; ConfigMap key `DOWNLOADS_DOMAIN`.

- [x] **Step 1: Add the dev host route** — in `k3d/ingress.yaml`, inside the `workspace-ingress-internal` Ingress (the oauth2-proxy-protected block, alongside `docs.localhost`), add:

```yaml
    - host: downloads.localhost
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: oauth2-proxy-downloads
                port:
                  number: 4180
```

- [x] **Step 2: Add the domain key** — in `k3d/configmap-domains.yaml`, add next to `DOCS_DOMAIN`:

```yaml
  DOWNLOADS_DOMAIN: "downloads.localhost"
```

- [x] **Step 3: Verify the base still builds and the route resolves the proxy backend**

Run: `kubectl kustomize k3d/ | grep -A6 'host: downloads.localhost' | grep -q 'oauth2-proxy-downloads' && echo route-ok`
Expected: PASS — prints `route-ok`.

- [x] **Step 4: Confirm S3 compliance (no brand-domain literal added)**

Run: `grep -nE 'mentolder\.de|korczewski\.de' k3d/ingress.yaml k3d/configmap-domains.yaml | grep -v '^\s*#' || echo s3-clean`
Expected: PASS — prints `s3-clean` (no non-comment brand-domain literal).

- [x] **Step 5: Commit**

```bash
git add k3d/ingress.yaml k3d/configmap-domains.yaml
git commit -m "feat(infra): add downloads.localhost ingress route + domain key [T001378]"
```

---

### Task 4: Prod overlay wiring for `downloads` (fleet reachability)

**Files:**
- Create: `prod/patch-oauth2-proxy-downloads.yaml`
- Modify: `prod/configmap-domains.yaml`
- Modify: `prod/ingress.yaml`
- Modify: `prod/kustomization.yaml`

**Interfaces:**
- Consumes: Service `oauth2-proxy-downloads:4180` (Task 1); ConfigMap key `DOWNLOADS_DOMAIN` (this task, prod-scoped override of the Task 3 dev default); the existing `${PROD_DOMAIN}` / `${TLS_SECRET_NAME}` / `${WORKSPACE_NAMESPACE}` substitution vars already resolved by `scripts/env-resolve.sh` for every other prod service.
- Produces: `downloads.${PROD_DOMAIN}` reachable through Traefik on the real fleet cluster, TLS-terminated via the existing `workspace-wildcard` certificate, OIDC-redirecting to `https://auth.${PROD_DOMAIN}`. Without this task, `downloads.mentolder.de` only works in local k3d dev (Tasks 1–3 alone are k3d-only).

Without this task, `downloads.mentolder.de` would be unreachable on the real fleet cluster (only local k3d/dev works) — silently undermining REQ-RUSTDESK-CLIENT-003, since Patrick/gekko need to fetch the MSI from a real Windows machine over the real internet. `prod/` has no per-brand sub-overlay for `docs` (no `prod-mentolder/`/`prod-fleet/mentolder/` override touches it) — only this shared `prod/` layer needs new files.

- [x] **Step 1: Create `prod/patch-oauth2-proxy-downloads.yaml`** — clone of `prod/patch-oauth2-proxy-docs.yaml` with every `docs` token replaced by `downloads`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: oauth2-proxy-downloads
spec:
  template:
    spec:
      containers:
        - name: oauth2-proxy
          args:
            - "--config=/run/config/oauth2-extra.cfg"
            - "--provider=oidc"
            - "--client-id=downloads"
            - "--client-secret=$(POCKET_ID_DOWNLOADS_SECRET)"
            - "--redirect-url=https://downloads.${PROD_DOMAIN}/oauth2/callback"
            - "--oidc-issuer-url=https://auth.${PROD_DOMAIN}"
            - "--ssl-insecure-skip-verify=true"
            - "--skip-oidc-discovery=true"
            - "--login-url=https://auth.${PROD_DOMAIN}/authorize"
            - "--redeem-url=https://auth.${PROD_DOMAIN}/api/oidc/token"
            - "--oidc-jwks-url=https://auth.${PROD_DOMAIN}/.well-known/jwks.json"
            - "--profile-url=https://auth.${PROD_DOMAIN}/api/oidc/userinfo"
            - "--upstream=http://downloads:80"
            - "--http-address=0.0.0.0:4180"
            - "--cookie-secure=true"
            - "--cookie-name=_oauth2_proxy_downloads"
            - "--email-domain=*"
            - "--pass-access-token=true"
            - "--pass-authorization-header=true"
            - "--set-xauthrequest=true"
            - "--skip-provider-button=true"
            - "--code-challenge-method=S256"
            - "--insecure-oidc-allow-unverified-email=true"
            - "--oidc-extra-audience=downloads"
            - "--scope=openid email profile"
          env:
            - name: POCKET_ID_DOWNLOADS_SECRET
              valueFrom:
                secretKeyRef:
                  name: workspace-secrets
                  key: POCKET_ID_DOWNLOADS_SECRET
```

- [x] **Step 2: Register the patch in `prod/kustomization.yaml`** — add next to the existing `patch-oauth2-proxy-docs.yaml` entry under `patches:`:

```yaml
  - path: patch-oauth2-proxy-docs.yaml
  - path: patch-oauth2-proxy-downloads.yaml
```

- [x] **Step 3: Add the prod domain override** — in `prod/configmap-domains.yaml`, add next to `DOCS_DOMAIN`:

```yaml
  DOWNLOADS_DOMAIN: "downloads.${PROD_DOMAIN}"
```

- [x] **Step 4: Add the prod ingress route** — in `prod/ingress.yaml`, add a new dedicated Ingress block directly after the existing `workspace-ingress-docs` block (same annotations, same TLS-secret pattern, own `tls.hosts` list — mirrors that block exactly, not a shared list append):

```yaml
---
# ── Downloads — Pocket ID SSO (oauth2-proxy) — RustDesk MSI distribution ──
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: workspace-ingress-downloads
  annotations:
    traefik.ingress.kubernetes.io/router.middlewares: "${WORKSPACE_NAMESPACE}-redirect-https@kubernetescrd,${WORKSPACE_NAMESPACE}-hsts-headers@kubernetescrd,${WORKSPACE_NAMESPACE}-security-headers@kubernetescrd"
spec:
  tls:
    - hosts:
        - downloads.${PROD_DOMAIN}
      secretName: ${TLS_SECRET_NAME}
  rules:
    - host: downloads.${PROD_DOMAIN}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: oauth2-proxy-downloads
                port:
                  number: 4180
```

- [x] **Step 5: Verify the prod overlay builds and no brand-domain literal was introduced (S3)**

Run:
```bash
kubectl kustomize prod/ > /dev/null && echo prod-build-ok
grep -c 'downloads\.\${PROD_DOMAIN}' prod/configmap-domains.yaml prod/ingress.yaml
grep -nE 'mentolder\.de|korczewski\.de' prod/patch-oauth2-proxy-downloads.yaml prod/configmap-domains.yaml prod/ingress.yaml prod/kustomization.yaml | grep -v '^\s*#' || echo s3-clean
```
Expected: PASS — prints `prod-build-ok`, both grep counts are `>= 1`, and prints `s3-clean` (no non-comment brand-domain literal).

- [x] **Step 6: Commit**

```bash
git add prod/patch-oauth2-proxy-downloads.yaml prod/configmap-domains.yaml prod/ingress.yaml prod/kustomization.yaml
git commit -m "feat(infra): wire downloads service into the prod overlay for fleet reachability [T001378]"
```

---

### Task 5: WiX wrapper — silent-install of the official RustDesk MSI

**Files:**
- Create: `rustdesk-installer/Package.wxs`
- Create: `rustdesk-installer/rustdesk-installer.wixproj`

**Interfaces:**
- Produces: a `wix build` target emitting `rustdesk-workspace-installer.msi` that silently installs the pinned official RustDesk MSI. No provisioning yet (added in Task 7) — this is the RED baseline for the Task 6 smoke test.

- [x] **Step 1: Verify WiX v4/v5 authoring syntax against the official docs** (intel.json risks[] — do NOT invent element/attribute spelling). Use the context7 MCP (`resolve-library-id` for "WiX Toolset", then `query-docs`) or WebFetch against the official WiX docs (`https://docs.firegiant.com/wix/` / `https://wixtoolset.org/docs/`). Confirm the exact spelling for: a `Package` authored as an MSI; carrying the official MSI as an embedded payload `File`/`Binary`; a deferred `CustomAction` (`Execute="deferred"`, `Impersonate="no"`, `ExeCommand` / `msiexec` invocation); sequencing it via `Custom` in `InstallExecuteSequence`; and passing build-time values with `wix build -d Name=Value` → `$(Name)`. Record the confirmed element/attribute names as inline comments in `Package.wxs`.

- [x] **Step 2: Author `rustdesk-installer/Package.wxs`** using the verified syntax. Structure (finalize spelling against Step 1 — the skeleton below is the intended shape, not verbatim-final XML):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!-- Element/attribute spelling confirmed against WiX docs in Step 1. -->
<Wix xmlns="http://wixtoolset.org/schemas/v4/wxs">
  <Package Name="RustDesk Workspace Installer"
           Manufacturer="Workspace" Version="1.0.0.0"
           UpgradeCode="PUT-A-STABLE-GUID-HERE" Scope="perMachine">
    <MajorUpgrade DowngradeErrorMessage="A newer version is already installed." />

    <!-- Payload: the pinned official RustDesk MSI, downloaded by CI to this path. -->
    <Binary Id="OfficialRustDeskMsi" SourceFile="official-rustdesk.msi" />

    <!-- Deferred CA: silent-install the embedded official MSI. -->
    <CustomAction Id="InstallOfficialRustDesk"
                  BinaryRef="OfficialRustDeskMsi"
                  Execute="deferred" Impersonate="no" Return="check"
                  ExeCommand="msiexec /i official-rustdesk.msi /qn /norestart" />

    <InstallExecuteSequence>
      <Custom Action="InstallOfficialRustDesk" After="InstallFiles" Condition="NOT Installed" />
    </InstallExecuteSequence>

    <Feature Id="Main">
      <ComponentGroupRef Id="ProductComponents" />
    </Feature>
  </Package>
</Wix>
```

- [x] **Step 3: Author `rustdesk-installer/rustdesk-installer.wixproj`** (or document the equivalent `wix build rustdesk-installer/Package.wxs -o rustdesk-workspace-installer.msi` invocation the CI will call). Keep it minimal — no extensions beyond what Step 1 confirms are needed for the deferred `ExeCommand` custom action.

- [x] **Step 4: Static-validate the WiX source parses as XML** (the actual `wix build` runs only on `windows-latest` in Task 5):

Run: `python3 -c "import xml.dom.minidom as m; m.parse('rustdesk-installer/Package.wxs'); print('wxs xml ok')"`
Expected: PASS — prints `wxs xml ok`.

- [x] **Step 5: Commit**

```bash
git add rustdesk-installer/Package.wxs rustdesk-installer/rustdesk-installer.wixproj
git commit -m "feat(installer): WiX wrapper that silent-installs official RustDesk MSI [T001378]"
```

---

### Task 6: CI workflow — build + smoke test (RED)

**Files:**
- Create: `.github/workflows/build-rustdesk-installer.yml`

**Interfaces:**
- Consumes: the Task 5 `wix build` target; repo secrets `RUSTDESK_CLIENT_CONFIG_STRING` / `RUSTDESK_UNATTENDED_PASSWORD` (config-string used in Task 7; here only the build runs).
- Produces: a manual `workflow_dispatch` pipeline whose smoke step asserts the installed client's config targets `EXPECTED_ID_SERVER`.

- [x] **Step 1: Author the workflow** — build + smoke only (no provisioning custom action wired yet, so the smoke test is expected to fail):

```yaml
name: Build RustDesk Installer

on:
  workflow_dispatch: {}   # REQ-RUSTDESK-CLIENT-004: manual trigger ONLY — no push:

permissions:
  contents: read
  packages: write

env:
  # Non-sensitive public relay host; used ONLY to assert the client was configured.
  EXPECTED_ID_SERVER: rustdesk.mentolder.de
  # Supply-chain pin — set exact values in Step 2 after verifying the release.
  RUSTDESK_VERSION: "PIN-IN-STEP-2"
  RUSTDESK_MSI_URL: "PIN-IN-STEP-2"
  RUSTDESK_MSI_SHA256: "PIN-IN-STEP-2"

jobs:
  build:
    name: Build & smoke-test the wrapper MSI
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@93cb6efe18208431cddfb8368fd83d5badbf9bfd  # v5

      - name: Install WiX Toolset
        run: dotnet tool install --global wix

      - name: Download + pin-verify official RustDesk MSI
        shell: pwsh
        run: |
          Invoke-WebRequest -Uri $env:RUSTDESK_MSI_URL -OutFile rustdesk-installer/official-rustdesk.msi
          $got = (Get-FileHash rustdesk-installer/official-rustdesk.msi -Algorithm SHA256).Hash.ToLower()
          if ($got -ne $env:RUSTDESK_MSI_SHA256.ToLower()) {
            Write-Error "SHA256 mismatch: got $got expected $env:RUSTDESK_MSI_SHA256"; exit 1
          }
          Write-Host "official MSI pin verified"

      - name: Build wrapper MSI
        run: wix build rustdesk-installer/Package.wxs -o rustdesk-workspace-installer.msi

      - name: Silent-install the wrapper MSI
        shell: pwsh
        run: |
          $p = Start-Process msiexec -ArgumentList '/i','rustdesk-workspace-installer.msi','/qn','/l*v','install.log' -Wait -PassThru
          if ($p.ExitCode -ne 0) { Get-Content install.log -Tail 40; Write-Error "install failed ($($p.ExitCode))"; exit 1 }

      - name: Smoke test — config targets the expected ID server
        shell: pwsh
        run: |
          # Exact TOML path depends on the CA security context (per-user vs
          # LocalService vs SYSTEM profile) — confirmed in Task 5 Step 1.
          $candidates = @(
            "$env:APPDATA\RustDesk\config\RustDesk2.toml",
            "C:\Windows\ServiceProfiles\LocalService\AppData\Roaming\RustDesk\config\RustDesk2.toml",
            "C:\Windows\System32\config\systemprofile\AppData\Roaming\RustDesk\config\RustDesk2.toml"
          )
          $cfg = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
          if (-not $cfg) { Write-Error "RustDesk config TOML not found"; exit 1 }
          if (-not (Select-String -Path $cfg -SimpleMatch $env:EXPECTED_ID_SERVER -Quiet)) {
            Write-Error "config does not target $env:EXPECTED_ID_SERVER"; exit 1
          }
          Write-Host "smoke ok: config targets $env:EXPECTED_ID_SERVER"
```

- [x] **Step 2: Pin the official MSI** — determine the current stable RustDesk Windows MSI from `github.com/rustdesk/rustdesk/releases`, set `RUSTDESK_VERSION`, the exact `RUSTDESK_MSI_URL`, and compute `RUSTDESK_MSI_SHA256` (`Get-FileHash -Algorithm SHA256`), then replace the three `PIN-IN-STEP-2` values.

- [x] **Step 3: Run the workflow and observe RED**

Run: `gh workflow run build-rustdesk-installer.yml && gh run watch`
Expected: FAIL — the `Smoke test` step fails because no provisioning custom action has been wired yet, so the client config never targets `rustdesk.mentolder.de` (config TOML missing or lacking the host). This is the intended red state.

- [x] **Step 4: Commit**

```bash
git add .github/workflows/build-rustdesk-installer.yml
git commit -m "ci: manual build+smoke workflow for RustDesk installer (RED) [T001378]"
```

---

### Task 7: Provisioning custom action — config + unattended password (GREEN)

**Files:**
- Create: `rustdesk-installer/provision.ps1`
- Modify: `rustdesk-installer/Package.wxs`
- Modify: `.github/workflows/build-rustdesk-installer.yml`

**Interfaces:**
- Consumes: `RUSTDESK_CLIENT_CONFIG_STRING` / `RUSTDESK_UNATTENDED_PASSWORD` (baked into `provision.ps1` at build time); verified CLI flags `rustdesk.exe --config <config-string>` / `rustdesk.exe --password <password>`.
- Produces: the deferred custom action that makes the Task 6 smoke test pass (GREEN).

- [x] **Step 1: Create `rustdesk-installer/provision.ps1`** — polls the service, then applies config + password. Placeholders are substituted by CI at build time (no real secret is committed):

```powershell
# provision.ps1 — runs as a deferred custom action after the official MSI is
# installed. Waits for the RustDesk service to reach 'Running' (race: the
# chained MSI starts it asynchronously), then applies the baked-in server
# config + unattended password via the official CLI. __RUSTDESK_CONFIG__ and
# __RUSTDESK_PASSWORD__ are replaced at build time by the CI workflow.
$ErrorActionPreference = 'Stop'
$exe = Join-Path $env:ProgramFiles 'RustDesk\rustdesk.exe'
if (-not (Test-Path $exe)) { $exe = Join-Path ${env:ProgramFiles(x86)} 'RustDesk\rustdesk.exe' }

$deadline = (Get-Date).AddSeconds(120)
do {
  $svc = Get-Service -Name 'RustDesk' -ErrorAction SilentlyContinue
  if ($svc -and $svc.Status -eq 'Running') { break }
  Start-Sleep -Seconds 2
} while ((Get-Date) -lt $deadline)
if (-not $svc -or $svc.Status -ne 'Running') { Write-Error 'RustDesk service not Running'; exit 1 }

& $exe --config '__RUSTDESK_CONFIG__'
& $exe --password '__RUSTDESK_PASSWORD__'
exit $LASTEXITCODE
```

- [x] **Step 2: Wire the deferred custom action in `rustdesk-installer/Package.wxs`** (finalize spelling against Task 5 Step 1) — embed `provision.ps1` as a payload and run it after the official-MSI install:

```xml
    <Binary Id="ProvisionScript" SourceFile="provision.ps1" />
    <CustomAction Id="ProvisionRustDesk"
                  BinaryRef="ProvisionScript"
                  Execute="deferred" Impersonate="no" Return="check"
                  ExeCommand="powershell.exe -ExecutionPolicy Bypass -NonInteractive -File provision.ps1" />
    <!-- add after the existing InstallOfficialRustDesk entry: -->
    <!-- <Custom Action="ProvisionRustDesk" After="InstallOfficialRustDesk" Condition="NOT Installed" /> -->
```

- [x] **Step 3: Add the build-time secret substitution step to the workflow** — insert before `Build wrapper MSI`:

```yaml
      - name: Bake secrets into provision.ps1
        shell: pwsh
        env:
          RD_CONFIG: ${{ secrets.RUSTDESK_CLIENT_CONFIG_STRING }}
          RD_PASSWORD: ${{ secrets.RUSTDESK_UNATTENDED_PASSWORD }}
        run: |
          # Writing to a file is not logged; Actions masks these secret values.
          $p = Get-Content rustdesk-installer/provision.ps1 -Raw
          $p = $p.Replace('__RUSTDESK_CONFIG__', $env:RD_CONFIG).Replace('__RUSTDESK_PASSWORD__', $env:RD_PASSWORD)
          Set-Content -Path rustdesk-installer/provision.ps1 -Value $p -NoNewline
```

- [x] **Step 4: Run the workflow and observe GREEN**

Run: `gh workflow run build-rustdesk-installer.yml && gh run watch`
Expected: PASS — the `Smoke test` step now finds the config TOML targeting `rustdesk.mentolder.de`. The password is never read back or logged.

- [x] **Step 5: Commit**

```bash
git add rustdesk-installer/provision.ps1 rustdesk-installer/Package.wxs .github/workflows/build-rustdesk-installer.yml
git commit -m "feat(installer): auto-provision relay config + unattended password (GREEN) [T001378]"
```

---

### Task 8: Distribution pipeline — pack image + roll out downloads

**Files:**
- Create: `scripts/downloads.Dockerfile`
- Modify: `.github/workflows/build-rustdesk-installer.yml`

**Interfaces:**
- Consumes: the built `rustdesk-workspace-installer.msi`; repo secret `FLEET_KUBECONFIG` (existing precedent, `build-docs.yml`); repo secret `GH_PAT` (already used for the GHCR login below) for the Step 4 visibility read-check.
- Produces: `ghcr.io/paddione/downloads-content` image with the MSI in `/public`; a rolled-out `deployment/downloads -n workspace`. The MSI is never uploaded as a workflow artifact (REQ-RUSTDESK-CLIENT-003).
- **Package-visibility gate (REQ-RUSTDESK-CLIENT-003 backstop):** `ghcr.io/paddione/downloads-content` MUST stay `private` — a public package lets anyone `docker pull` it and extract the baked unattended password straight from the image layers, bypassing the Pocket ID SSO gate entirely (the exact bypass REQ-RUSTDESK-CLIENT-003 forbids for GitHub Releases/Artifacts, just via a different channel). **Verified against official GitHub REST/GraphQL docs this session: there is no API endpoint to set/PATCH a package's visibility** — `GET /user/packages/{package_type}/{package_name}` exposes `visibility` as a **read-only** response field; the only documented way to change it is the web UI's package Settings → "Danger Zone" → "Change visibility" (`docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility`). GitHub's docs state a personal-account-scoped package defaults to **private** on first publish — but a package auto-linked to its source repository (e.g. via an OCI `org.opencontainers.image.source` label, or any Actions-published package connected to the repo) can instead **inherit that repository's visibility**, which is **public** here. Step 4 is therefore a **read + hard-fail verification on every run**, not a set-via-API step; if it ever fails, the fix is the one-time manual UI step in Prerequisite 5.

- [x] **Step 1: Create `scripts/downloads.Dockerfile`** — clone of `scripts/docs.Dockerfile`, baking the MSI into `/public`. Deliberately **no** `org.opencontainers.image.source` (or other repo-linking) `LABEL` — omitting it avoids one known trigger for a package auto-linking to this public repo and inheriting its visibility, though Step 4 is the actual enforced backstop regardless:

```dockerfile
FROM joseluisq/static-web-server:2.36-alpine
# static-web-server runs as uid 1000 and serves SERVER_ROOT (/public).
# No org.opencontainers.image.source LABEL: avoids auto-linking this image to
# the public source repo, which can make GHCR inherit the repo's (public)
# visibility instead of the package's own private default. See Step 4.
COPY rustdesk-workspace-installer.msi /public/rustdesk-workspace-installer.msi
ENV SERVER_ROOT=/public
ENV SERVER_PORT=8787
ENV SERVER_CACHE_CONTROL_HEADERS=false
```

- [x] **Step 2: Confirm the linux-image build+push mechanism for `windows-latest`** — the MSI must NOT leave the runner as a workflow artifact, so the pack+push runs on the same job. Verify which mechanism works on the current hosted runner image and pick one: (a) a Linux-engine `docker build -f scripts/downloads.Dockerfile` if the runner's Docker supports linux containers, (b) `docker buildx` with QEMU for `--platform linux/amd64`, or (c) `oras` to push the static-server layers. Record the chosen mechanism as a workflow comment.

- [x] **Step 3: Add the pack + push + rollout steps to the workflow** — appended after the smoke test, using the confirmed mechanism from Step 2 and the `FLEET_KUBECONFIG` deploy pattern from `build-docs.yml`:

```yaml
      - name: Log in to GHCR
        uses: docker/login-action@c94ce9fb468520275223c153574b00df6fe4bcc9  # v3
        with:
          registry: ghcr.io
          username: ${{ github.repository_owner }}
          password: ${{ secrets.GH_PAT }}

      - name: Build & push downloads image
        shell: pwsh
        run: |
          $sha = "sha-$(git rev-parse --short HEAD)"
          # Mechanism confirmed in Step 2 (linux/amd64 image, MSI baked in).
          docker build -f scripts/downloads.Dockerfile `
            -t "ghcr.io/paddione/downloads-content:$sha" `
            -t "ghcr.io/paddione/downloads-content:latest" .
          docker push "ghcr.io/paddione/downloads-content:$sha"
          docker push "ghcr.io/paddione/downloads-content:latest"

      - name: Roll out downloads (mentolder only)
        shell: bash
        env:
          KUBECONFIG_DATA: ${{ secrets.FLEET_KUBECONFIG }}
        run: |
          curl -sSL "https://dl.k8s.io/release/v1.31.0/bin/windows/amd64/kubectl.exe" -o kubectl.exe
          mkdir -p "$HOME/.kube"
          echo "$KUBECONFIG_DATA" | base64 -d > "$HOME/.kube/config"
          ./kubectl.exe rollout restart deployment/downloads -n workspace
          ./kubectl.exe rollout status  deployment/downloads -n workspace --timeout=120s
```

- [x] **Step 4: Verify `downloads-content` package visibility is `private` (every run) — insert between "Build & push downloads image" and "Roll out downloads"** in the workflow. This is a **read-only check that hard-fails the run**, not a set-via-API step (none exists — see Interfaces above):

```yaml
      - name: Verify downloads-content package is private
        shell: bash
        env:
          GH_TOKEN: ${{ secrets.GH_PAT }}
        run: |
          visibility=$(gh api /user/packages/container/downloads-content --jq '.visibility')
          echo "downloads-content visibility: $visibility"
          if [ "$visibility" != "private" ]; then
            echo "FATAL: ghcr.io/paddione/downloads-content is '$visibility', not 'private'." >&2
            echo "No API can fix this — go to the package's GitHub Settings > Danger Zone >" >&2
            echo "'Change visibility' and set it to Private, then re-run this workflow." >&2
            exit 1
          fi
```

`gh` is preinstalled on GitHub-hosted runners, including `windows-latest`; `shell: bash` (Git Bash, also preinstalled) keeps the `gh api --jq` syntax identical to a Linux runner. `GH_PAT` already authenticates `docker/login-action` above (at least `write:packages`); **unconfirmed this session whether `write:packages` alone also grants the `read:packages` scope this GET call needs** — if this step fails with an HTTP 403 (as opposed to a `visibility != private` failure), add the `read:packages` scope to `GH_PAT` in GitHub Settings → Developer settings → Personal access tokens.

- [x] **Step 5: Verify the Dockerfile is reachable (S4) and the workflow references both new steps**

Run:
```bash
grep -q 'scripts/downloads.Dockerfile' .github/workflows/build-rustdesk-installer.yml && echo dockerfile-referenced
grep -q 'Verify downloads-content package is private' .github/workflows/build-rustdesk-installer.yml && echo visibility-gate-referenced
```
Expected: PASS — prints `dockerfile-referenced` and `visibility-gate-referenced`.

- [x] **Step 6: Run the workflow end-to-end and confirm the download is SSO-gated**

Run: `gh workflow run build-rustdesk-installer.yml && gh run watch`; then in a browser open `https://downloads.mentolder.de/rustdesk-workspace-installer.msi` while logged out.
Expected: PASS — the run is green (including the Step 4 visibility gate), and the unauthenticated request is redirected to Pocket ID login (REQ-RUSTDESK-CLIENT-003), while an authenticated session downloads the MSI.

- [x] **Step 7: Commit**

```bash
git add scripts/downloads.Dockerfile .github/workflows/build-rustdesk-installer.yml
git commit -m "ci: pack MSI into downloads image + roll out downloads service [T001378]"
```

---

### Task 9: Final verification

**Files:** none (verification only).

- [x] **Step 1: Validate manifests** — build the base + prod overlay and lint kustomize output (this exercises both the Task 1 `k3d/` and the Task 4 `prod/` wiring):

Run: `task workspace:validate`
Expected: PASS — kustomize builds cleanly with the new `downloads` resources in both the `k3d/` base and the `prod/` overlay.

- [x] **Step 2: Regenerate test inventory** (a new workflow file was added; keep the generated inventory in sync):

Run: `task test:inventory`
Expected: PASS — `website/src/data/test-inventory.json` is regenerated (commit it if it changed).

- [x] **Step 3: Run the three mandatory CI gates**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
Expected: PASS — targeted tests green; freshness artifacts regenerated; `quality:check` (S1–S4 ratchet) + baseline key-count assertion pass.

- [x] **Step 4: Validate the OpenSpec change**

Run: `bash scripts/openspec.sh validate`
Expected: PASS — `openspec validate: OK`.

- [x] **Step 5: Commit any regenerated artifacts**

```bash
git add -A
git commit -m "chore: regenerate freshness artifacts for downloads + installer [T001378]"
```
