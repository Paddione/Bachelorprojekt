---
title: Recovery Browse Surface — Implementation Plan (Plan 2 of 2)
ticket_id: T000387
domains: [infra, security, test]
status: active
pr_number: null
---

# Recovery Browse Surface — Implementation Plan (Plan 2 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Parallel-safe:** Touches `k3d/recovery-browser.yaml`, `k3d/configmap-domains.yaml`, the two realm JSONs, `environments/schema.yaml`, `tests/unit/recovery-browser-manifest.bats` — **disjoint** from Plan 1 (`feature/recovery-engine`). Shared contract: PVC name `recovery-pvc`, path layout `/recovery/<ts>/<service>/`, manifest filename `k3d/recovery-browser.yaml`, filebrowser mounts read-only.
>
> **Spec:** `docs/superpowers/specs/2026-05-31-recovery-staging-design.md` (lives on `feature/recovery-engine`; reachable on `main` once that merges — read it there for full context).

**Goal:** An on-demand, SSO-gated, read-only web filebrowser over the recovery staging volume so an operator can "straight up see and browse the files" of a backup, plus the Keycloak `recovery` client and `recover.<domain>` route it needs.

**Architecture:** A single self-contained manifest `k3d/recovery-browser.yaml` (NOT in `k3d/kustomization.yaml` — applied on demand, like office-stack/coturn): a `filebrowser/filebrowser` Deployment+Service mounting `recovery-pvc:/recovery` read-only, fronted by an `oauth2-proxy-recovery` Deployment+Service (clone of `oauth2-proxy-docs.yaml`, gated to Keycloak group `/recovery-access`), and a Traefik `IngressRoute` for `recover.<domain>`. Env values come via `envsubst` at apply time (the `recovery:browse` task sources `env-resolve.sh`).

**Tech Stack:** Kubernetes Deployment/Service, Traefik IngressRoute CRD, `quay.io/oauth2-proxy/oauth2-proxy:v7.9.0` (keycloak-oidc), `filebrowser/filebrowser:v2`, Keycloak realm JSON, BATS manifest validation.

---

## Integration notes (cross-plan)

- **Apply path:** Plan 1's `browse`/`unbrowse` run `kubectl apply/delete -f k3d/recovery-browser.yaml`. Because this manifest uses `${RECOVER_DOMAIN}` / `${TLS_SECRET_NAME}` / `${PROD_DOMAIN}` / `${KC_DOMAIN}` placeholders, **`browse` must pipe through `envsubst`** with env-resolve sourced. Coordinate one of:
  - Plan 1 `browse` becomes: `envsubst '$RECOVER_DOMAIN $TLS_SECRET_NAME $PROD_DOMAIN $KC_DOMAIN' < "$MANIFEST" | $KC apply -n "$NS" -f -`, **or**
  - the `recovery:browse` Taskfile task does the `envsubst | kubectl apply` itself.
  Pick the Taskfile-side option if Plan 1 already merged with the plain `apply`. Document the chosen path in the PR.
- **Read-only contract:** the filebrowser mounts `recovery-pvc` **read-only** — it can never mutate staged data. Selective restore is Plan 1's `restore-file` only.

## File structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `k3d/recovery-browser.yaml` | filebrowser + oauth2-proxy-recovery + Service(s) + IngressRoute. |
| Modify | `k3d/configmap-domains.yaml` | `RECOVER_DOMAIN` (dev default). |
| Modify | `environments/schema.yaml` | register `RECOVERY_OIDC_SECRET` + `RECOVER_DOMAIN`. |
| Modify | `prod-mentolder/realm-workspace-mentolder.json` | `recovery` OIDC client + `/recovery-access` group + mapper. |
| Modify | `prod-korczewski/realm-workspace-korczewski.json` | same. |
| Create | `tests/unit/recovery-browser-manifest.bats` | manifest structure assertions. |

---

## Task 1: domains + secret schema

**Files:** Modify `k3d/configmap-domains.yaml`, `environments/schema.yaml`

- [ ] **Step 1: Add the dev domain**

In `k3d/configmap-domains.yaml`, add after `DOCS_DOMAIN` (line ~14):

```yaml
  RECOVER_DOMAIN: "recover.localhost"
```

(Prod overlays set `recover.<PROD_DOMAIN>` — handled by the existing per-env domain overrides; mirror how `DOCS_DOMAIN` is overridden in `prod-mentolder`/`prod-korczewski`.)

- [ ] **Step 2: Register the OIDC secret + domain in the schema**

In `environments/schema.yaml`, add `RECOVERY_OIDC_SECRET` next to `DOCS_OIDC_SECRET` (same section/shape) and `RECOVER_DOMAIN` next to `DOCS_DOMAIN`. Run:

```bash
cd /tmp/wt-recovery-browse && grep -n "DOCS_OIDC_SECRET\|DOCS_DOMAIN" environments/schema.yaml
```
Mirror each matched entry with a `RECOVERY_`/`RECOVER_` twin.

- [ ] **Step 3: Validate the schema + domains parse**

Run: `cd /tmp/wt-recovery-browse && kubectl apply --dry-run=client -f k3d/configmap-domains.yaml && task env:validate ENV=mentolder 2>&1 | tail -5`
Expected: ConfigMap dry-run OK; `env:validate` does not complain about an unknown var (the new keys are now in schema).

> The actual secret VALUE (`RECOVERY_OIDC_SECRET`) is generated/sealed by the security flow (`task env:generate` → `env:seal`), not committed here. Note in the PR that a reseal is required before prod `browse` works — mirror `DOCS_OIDC_SECRET`.

- [ ] **Step 4: Commit**

```bash
git add k3d/configmap-domains.yaml environments/schema.yaml
git commit -m "feat(recovery): RECOVER_DOMAIN + RECOVERY_OIDC_SECRET registration"
```

---

## Task 2: the `recovery-browser.yaml` manifest

**Files:** Create `k3d/recovery-browser.yaml`; Test `tests/unit/recovery-browser-manifest.bats`

- [ ] **Step 1: Write the failing manifest test**

Create `tests/unit/recovery-browser-manifest.bats`:

```bash
#!/usr/bin/env bats
# recovery-browser-manifest.bats — structural checks on the on-demand recovery UI.

setup() { MF="${BATS_TEST_DIRNAME}/../../k3d/recovery-browser.yaml"; }

@test "manifest exists and is valid YAML (client dry-run)" {
  run kubectl apply --dry-run=client -f "$MF"
  [ "$status" -eq 0 ]
}

@test "filebrowser mounts recovery-pvc READ-ONLY" {
  run grep -A3 "claimName: recovery-pvc" "$MF"
  [ "$status" -eq 0 ]
  grep -q "readOnly: true" "$MF"
}

@test "oauth2-proxy is gated to the /recovery-access group" {
  grep -q -- "--allowed-groups=/recovery-access" "$MF"
}

@test "oauth2-proxy uses the recovery client and upstreams the filebrowser" {
  grep -q -- "--client-id=recovery" "$MF"
  grep -q -- "--upstream=http://recovery-browser" "$MF"
}

@test "IngressRoute routes the recover domain" {
  grep -q "kind: IngressRoute" "$MF"
  grep -q "RECOVER_DOMAIN" "$MF"
}

@test "NOT registered in the base kustomization (on-demand only)" {
  run grep -q "recovery-browser.yaml" "${BATS_TEST_DIRNAME}/../../k3d/kustomization.yaml"
  [ "$status" -ne 0 ]
}
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /tmp/wt-recovery-browse && bats tests/unit/recovery-browser-manifest.bats`
Expected: FAIL — manifest does not exist.

- [ ] **Step 3: Read the SSO pattern to clone**

Run: `cd /tmp/wt-recovery-browse && sed -n '1,141p' k3d/oauth2-proxy-docs.yaml`
Expected: confirm the init-container cookie-secret pattern, the keycloak-oidc args, and the Service shape — clone them, swapping docs→recovery.

- [ ] **Step 4: Create `k3d/recovery-browser.yaml`**

Create the manifest (filebrowser + oauth2-proxy-recovery + Services + IngressRoute). `${...}` are substituted by `envsubst` at `browse` time:

```yaml
# Recovery filebrowser — ON-DEMAND, SSO-gated, READ-ONLY view of recovery-pvc:/recovery.
# Brought up by `backup-restore.sh browse`, removed by `unbrowse`. NOT in kustomization.
apiVersion: apps/v1
kind: Deployment
metadata:
  name: recovery-browser
  labels: { app: recovery-browser }
spec:
  replicas: 1
  selector: { matchLabels: { app: recovery-browser } }
  template:
    metadata:
      labels: { app: recovery-browser }
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 65534
        fsGroup: 65534
        seccompProfile: { type: RuntimeDefault }
      containers:
        - name: filebrowser
          image: filebrowser/filebrowser:v2
          imagePullPolicy: IfNotPresent
          args:
            - --noauth                      # auth is handled by oauth2-proxy in front
            - --root=/srv
            - --database=/tmp/filebrowser.db
            - --address=0.0.0.0
            - --port=8080
          securityContext:
            allowPrivilegeEscalation: false
            runAsNonRoot: true
            runAsUser: 65534
            capabilities: { drop: ["ALL"] }
          ports:
            - containerPort: 8080
          volumeMounts:
            - { name: recovery, mountPath: /srv, readOnly: true }
            - { name: scratch,  mountPath: /tmp }
          resources:
            requests: { memory: 64Mi, cpu: "50m" }
            limits:   { memory: 256Mi, cpu: "500m" }
      volumes:
        - { name: recovery, persistentVolumeClaim: { claimName: recovery-pvc } }
        - { name: scratch,  emptyDir: {} }
---
apiVersion: v1
kind: Service
metadata:
  name: recovery-browser
spec:
  selector: { app: recovery-browser }
  ports:
    - { port: 80, targetPort: 8080 }
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: oauth2-proxy-recovery
  labels: { app: oauth2-proxy-recovery }
spec:
  replicas: 1
  selector: { matchLabels: { app: oauth2-proxy-recovery } }
  template:
    metadata:
      labels: { app: oauth2-proxy-recovery }
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 65534
        seccompProfile: { type: RuntimeDefault }
      initContainers:
        - name: write-cookie-secret
          image: busybox:1.37
          command: ["/bin/sh", "-c"]
          args:
            - printf 'cookie_secret = "%s"\n' "$(printf '%s' "$OAUTH2_PROXY_COOKIE_SECRET" | cut -c1-32)" > /run/config/oauth2-extra.cfg
          securityContext:
            allowPrivilegeEscalation: false
            runAsNonRoot: true
            runAsUser: 65534
            capabilities: { drop: ["ALL"] }
          env:
            - { name: OAUTH2_PROXY_COOKIE_SECRET, valueFrom: { secretKeyRef: { name: workspace-secrets, key: OAUTH2_PROXY_COOKIE_SECRET } } }
          volumeMounts:
            - { name: oauth2-config, mountPath: /run/config }
      containers:
        - name: oauth2-proxy
          image: quay.io/oauth2-proxy/oauth2-proxy:v7.9.0
          args:
            - --config=/run/config/oauth2-extra.cfg
            - --provider=keycloak-oidc
            - --client-id=recovery
            - --client-secret=$(RECOVERY_OIDC_SECRET)
            - --redirect-url=https://${RECOVER_DOMAIN}/oauth2/callback
            - --oidc-issuer-url=https://${KC_DOMAIN}/realms/workspace
            - --login-url=https://${KC_DOMAIN}/realms/workspace/protocol/openid-connect/auth
            - --redeem-url=http://keycloak:8080/realms/workspace/protocol/openid-connect/token
            - --oidc-jwks-url=http://keycloak:8080/realms/workspace/protocol/openid-connect/certs
            - --profile-url=http://keycloak:8080/realms/workspace/protocol/openid-connect/userinfo
            - --upstream=http://recovery-browser:80
            - --http-address=0.0.0.0:4180
            - --cookie-name=_oauth2_proxy_recovery
            - --cookie-secure=true
            - --email-domain=*
            - --allowed-groups=/recovery-access
            - --pass-access-token=true
            - --set-xauthrequest=true
            - --skip-provider-button=true
            - --code-challenge-method=S256
            - --insecure-oidc-allow-unverified-email=true
            - --oidc-extra-audience=recovery
            - --scope=openid email profile
          env:
            - { name: RECOVERY_OIDC_SECRET, valueFrom: { secretKeyRef: { name: workspace-secrets, key: RECOVERY_OIDC_SECRET } } }
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            runAsNonRoot: true
            runAsUser: 65534
            capabilities: { drop: [ALL] }
            seccompProfile: { type: RuntimeDefault }
          ports:
            - containerPort: 4180
          readinessProbe:
            httpGet: { path: /ping, port: 4180 }
            initialDelaySeconds: 5
            periodSeconds: 10
          resources:
            requests: { memory: 64Mi, cpu: "50m" }
            limits:   { memory: 128Mi, cpu: "200m" }
          volumeMounts:
            - { name: oauth2-config, mountPath: /run/config, readOnly: true }
      volumes:
        - { name: oauth2-config, emptyDir: {} }
---
apiVersion: v1
kind: Service
metadata:
  name: oauth2-proxy-recovery
spec:
  selector: { app: oauth2-proxy-recovery }
  ports:
    - { port: 4180, targetPort: 4180 }
---
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: recovery
spec:
  entryPoints: [websecure]
  routes:
    - match: Host(`${RECOVER_DOMAIN}`)
      kind: Rule
      services:
        - name: oauth2-proxy-recovery
          port: 4180
  tls:
    secretName: ${TLS_SECRET_NAME}
```

- [ ] **Step 5: Reconcile the IngressRoute with the repo's actual ingress convention**

Run: `cd /tmp/wt-recovery-browse && grep -n "IngressRoute\|entryPoints\|secretName\|traefik.io" k3d/ingress.yaml | head -20`
Match the entryPoint name (`websecure` vs `web`/custom), the `traefik.io` apiVersion, and TLS pattern actually used. Adjust the IngressRoute block to match. If the repo uses plain `networking.k8s.io/v1 Ingress` instead of Traefik CRDs, mirror that form instead.

- [ ] **Step 6: Run to verify pass**

Run: `cd /tmp/wt-recovery-browse && bats tests/unit/recovery-browser-manifest.bats`
Expected: PASS. (The dry-run test needs CRDs for IngressRoute; if `kubectl apply --dry-run=client` rejects the CRD kind offline, switch that test to a YAML lint, e.g. `python -c "import yaml,sys; list(yaml.safe_load_all(open('$MF')))"`, and keep the grep-based structural tests.)

- [ ] **Step 7: Commit**

```bash
git add k3d/recovery-browser.yaml tests/unit/recovery-browser-manifest.bats
git commit -m "feat(recovery): on-demand SSO filebrowser over recovery-pvc (read-only)"
```

---

## Task 3: Keycloak `recovery` client + `/recovery-access` group

**Files:** Modify `prod-mentolder/realm-workspace-mentolder.json`, `prod-korczewski/realm-workspace-korczewski.json`

- [ ] **Step 1: Inspect the existing `docs` client to mirror it**

Run: `cd /tmp/wt-recovery-browse && python3 -c "import json; r=json.load(open('prod-mentolder/realm-workspace-mentolder.json')); print([c['clientId'] for c in r.get('clients',[])])"`
Then dump the `docs` client: `python3 -c "import json; r=json.load(open('prod-mentolder/realm-workspace-mentolder.json')); print(json.dumps([c for c in r['clients'] if c['clientId']=='docs'][0], indent=2))"`
Expected: a confidential client with `redirectUris`, `secret`/`clientAuthenticatorType`, standardFlow enabled.

- [ ] **Step 2: Add the `recovery` client (both realms)**

Append a `recovery` client to the `clients` array in BOTH realm JSONs, mirroring `docs` but with:
- `clientId: "recovery"`
- `redirectUris: ["https://recover.<DOMAIN>/oauth2/callback"]` (mentolder.de / korczewski.de respectively)
- `secret`: a placeholder that the seal/realm-sync flow replaces (mirror how `docs` carries its secret), and add a `recovery` audience mapper like docs has.
- a protocol mapper adding the user's groups to the token (so oauth2-proxy `--allowed-groups` works) — mirror any existing `groups` mapper in the realm (search: `python3 -c "import json;r=json.load(open('prod-mentolder/realm-workspace-mentolder.json'));print([m for c in r['clients'] for m in c.get('protocolMappers',[]) if 'group' in m.get('name','').lower()])"`). If no group mapper exists on docs, add a `group-membership` mapper (`full.path=true`, claim name `groups`).

- [ ] **Step 3: Add the `/recovery-access` group (both realms)**

Add a top-level group `recovery-access` to the realm's `groups` array (mirror an existing group like `dev-access` if present: `python3 -c "import json;r=json.load(open('prod-mentolder/realm-workspace-mentolder.json'));print([g['name'] for g in r.get('groups',[])])"`).

- [ ] **Step 4: Validate JSON**

Run: `cd /tmp/wt-recovery-browse && for f in prod-mentolder/realm-workspace-mentolder.json prod-korczewski/realm-workspace-korczewski.json; do python3 -m json.tool "$f" >/dev/null && echo "$f OK"; done`
Expected: both `OK` (valid JSON after edits).

- [ ] **Step 5: Commit**

```bash
git add prod-mentolder/realm-workspace-mentolder.json prod-korczewski/realm-workspace-korczewski.json
git commit -m "feat(recovery): keycloak recovery client + /recovery-access group (both realms)"
```

---

## Task 4: Verification + docs

**Files:** none new (verification) + `database-ops` skill note.

- [ ] **Step 1: Manifest + offline suite**

Run: `cd /tmp/wt-recovery-browse && bats tests/unit/recovery-browser-manifest.bats && task test:all`
Expected: green. If test-inventory flags the new BATS file, run `task test:inventory` and commit the regenerated JSON.

- [ ] **Step 2: Security review of the exposed surface**

Confirm: filebrowser mount is `readOnly: true`; oauth2-proxy has `--allowed-groups=/recovery-access` and `--cookie-secure=true`; the manifest is NOT in `k3d/kustomization.yaml` (so it never auto-deploys); the IngressRoute only exists while `browse` is up. Document these in the PR description.

- [ ] **Step 3: database-ops skill runbook (do in whichever plan merges last)**

If Plan 1 didn't already add it, append the stage→browse→selective-restore runbook to `.claude/skills/database-ops/SKILL.md`, including the `/recovery-access` group prerequisite and the `task recovery:browse` / `recovery:unbrowse` lifecycle.

- [ ] **Step 4: PR**

Open the PR for `feature/recovery-browse` (squash-merge, CI green). Mergeable independently of Plan 1; the route/filebrowser only become reachable once Plan 1's `recovery-pvc` + `browse` also merge and a backup is staged. Note the required SSO reseal (`RECOVERY_OIDC_SECRET`) + realm-sync in the PR.

---

## Self-review (author)

- **Spec coverage:** browse-files (web) → filebrowser over recovery-pvc read-only (T2); SSO gating → oauth2-proxy clone + `/recovery-access` (T2/T3); on-demand → not in kustomization, applied by `browse` (T2 + integration note); domain/secret plumbing → T1.
- **Placeholder scan:** real manifest + real tests; the realm edits are "mirror the existing `docs` client" with exact inspection commands rather than guessed JSON (the realm files are large and env-specific — mirroring the proven client is correct and safe).
- **Consistency:** client-id `recovery`, group `/recovery-access`, secret key `RECOVERY_OIDC_SECRET`, domain `RECOVER_DOMAIN`, upstream `recovery-browser:80`, PVC `recovery-pvc` — all consistent with Plan 1's contract.
- **Cross-plan:** the envsubst integration is called out explicitly so `browse` substitutes `${RECOVER_DOMAIN}` etc.; read-only mount enforced and tested.
