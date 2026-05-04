# Dashboard Deployment — Korczewski Parity

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the operator dashboard (dashboard-web + oauth2-proxy) to the korczewski cluster, matching the feature already live on mentolder.

**Architecture:** Three new manifest files are added to `prod-korczewski/`, a dedicated `dashboard` Keycloak OIDC client is added to the korczewski realm (replacing the provisional redirect piggy-backed on the `traefik-dashboard` client), and `DASHBOARD_OIDC_SECRET` is added to korczewski's sealed secrets. No new images or application code needed.

**Tech Stack:** Kubernetes/Kustomize, Keycloak realm JSON, Sealed Secrets (`kubeseal`), Traefik IngressRoute, oauth2-proxy v7.9.0.

---

## File Map

| Action | Path |
|--------|------|
| Create | `prod-korczewski/dashboard-web.yaml` |
| Create | `prod-korczewski/oauth2-proxy-dashboard.yaml` |
| Create | `prod-korczewski/ingress-dashboard.yaml` |
| Modify | `prod-korczewski/kustomization.yaml` |
| Modify | `prod-korczewski/realm-workspace-korczewski.json` |
| Modify | `prod-mentolder/ingress-dashboard.yaml` (fix hardcoded TLS secret) |
| Modify | `environments/.secrets/korczewski.yaml` |
| Modify | `environments/sealed-secrets/korczewski.yaml` (re-sealed) |
| Modify | `Taskfile.yml` (dashboard:web:deploy + dashboard:web:logs) |

---

### Task 1: Generate and seal DASHBOARD_OIDC_SECRET for korczewski

**Files:**
- Modify: `environments/.secrets/korczewski.yaml`
- Modify: `environments/sealed-secrets/korczewski.yaml`

- [ ] **Step 1: Generate a random secret and add it to the plaintext secrets file**

```bash
SECRET=$(openssl rand -hex 20)
echo "DASHBOARD_OIDC_SECRET: \"$SECRET\""
```

Copy the printed value and add it to `environments/.secrets/korczewski.yaml` in alphabetical order among the other `D*` keys:

```yaml
DASHBOARD_OIDC_SECRET: "<generated-value>"
```

- [ ] **Step 2: Validate the env file**

```bash
task env:validate ENV=korczewski
```

Expected: no errors.

- [ ] **Step 3: Re-seal the korczewski secrets**

```bash
task env:seal ENV=korczewski
```

Expected: `environments/sealed-secrets/korczewski.yaml` is updated with the new encrypted key. The diff should show only the addition of `DASHBOARD_OIDC_SECRET` ciphertext.

- [ ] **Step 4: Verify**

```bash
grep -c "DASHBOARD_OIDC_SECRET" environments/sealed-secrets/korczewski.yaml
```

Expected: `1`

- [ ] **Step 5: Commit**

```bash
git add environments/.secrets/korczewski.yaml environments/sealed-secrets/korczewski.yaml
git commit -m "chore(secrets): add DASHBOARD_OIDC_SECRET to korczewski sealed secrets"
```

---

### Task 2: Add dashboard OIDC client to korczewski realm

**Files:**
- Modify: `prod-korczewski/realm-workspace-korczewski.json`

The korczewski realm currently routes dashboard auth through the `traefik-dashboard` client (lines 242–246). Replace that with a dedicated `dashboard` client (matching the mentolder realm) and clean up the `traefik-dashboard` client.

- [ ] **Step 1: Remove dashboard redirects from traefik-dashboard client**

In `prod-korczewski/realm-workspace-korczewski.json`, find the `traefik-dashboard` client block and change:

```json
      "redirectUris": [
        "https://${TRAEFIK_DOMAIN}/oauth2/callback",
        "https://${DASHBOARD_DOMAIN}/oauth2/callback"
      ],
      "webOrigins": [
        "https://${TRAEFIK_DOMAIN}",
        "https://${DASHBOARD_DOMAIN}"
      ],
```

to:

```json
      "redirectUris": [
        "https://${TRAEFIK_DOMAIN}/oauth2/callback"
      ],
      "webOrigins": [
        "https://${TRAEFIK_DOMAIN}"
      ],
```

- [ ] **Step 2: Add the dedicated dashboard OIDC client**

In `prod-korczewski/realm-workspace-korczewski.json`, before the final `]` that closes the `"clients"` array, add a comma after the last client's closing `}` and then insert:

```json
    {
      "clientId": "dashboard",
      "name": "Operator Dashboard",
      "enabled": true,
      "clientAuthenticatorType": "client-secret",
      "secret": "${DASHBOARD_OIDC_SECRET}",
      "redirectUris": [
        "https://${DASHBOARD_DOMAIN}/oauth2/callback"
      ],
      "webOrigins": [
        "https://${DASHBOARD_DOMAIN}"
      ],
      "standardFlowEnabled": true,
      "implicitFlowEnabled": false,
      "directAccessGrantsEnabled": false,
      "serviceAccountsEnabled": false,
      "protocol": "openid-connect",
      "publicClient": false,
      "attributes": {
        "oidc.ciba.grant.enabled": "false",
        "oauth2.device.authorization.grant.enabled": "false",
        "backchannel.logout.session.required": "true"
      },
      "protocolMappers": [
        {
          "name": "email",
          "protocol": "openid-connect",
          "protocolMapper": "oidc-usermodel-property-mapper",
          "consentRequired": false,
          "config": {
            "userinfo.token.claim": "true",
            "user.attribute": "email",
            "id.token.claim": "true",
            "access.token.claim": "true",
            "claim.name": "email",
            "jsonType.label": "String"
          }
        },
        {
          "name": "username",
          "protocol": "openid-connect",
          "protocolMapper": "oidc-usermodel-property-mapper",
          "consentRequired": false,
          "config": {
            "userinfo.token.claim": "true",
            "user.attribute": "username",
            "id.token.claim": "true",
            "access.token.claim": "true",
            "claim.name": "preferred_username",
            "jsonType.label": "String"
          }
        },
        {
          "name": "audience",
          "protocol": "openid-connect",
          "protocolMapper": "oidc-audience-mapper",
          "consentRequired": false,
          "config": {
            "included.client.audience": "dashboard",
            "id.token.claim": "true",
            "access.token.claim": "true"
          }
        }
      ]
    }
```

- [ ] **Step 3: Validate JSON**

```bash
python3 -m json.tool prod-korczewski/realm-workspace-korczewski.json > /dev/null && echo "valid"
```

Expected: `valid`

- [ ] **Step 4: Commit**

```bash
git add prod-korczewski/realm-workspace-korczewski.json
git commit -m "feat(keycloak): add dashboard OIDC client to korczewski realm"
```

---

### Task 3: Create prod-korczewski/dashboard-web.yaml

**Files:**
- Create: `prod-korczewski/dashboard-web.yaml`

The korczewski version is almost identical to `prod-mentolder/dashboard-web.yaml` but drops the cross-cluster kubeconfig volume — on korczewski the app uses its own in-cluster ServiceAccount token to monitor the korczewski cluster directly.

- [ ] **Step 1: Create the file**

Create `prod-korczewski/dashboard-web.yaml` with the following content:

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: dashboard-web
  namespace: workspace
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: dashboard-readonly
  namespace: workspace
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
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: dashboard-readonly
  namespace: workspace
subjects:
  - kind: ServiceAccount
    name: dashboard-web
    namespace: workspace
roleRef:
  kind: Role
  name: dashboard-readonly
  apiGroup: rbac.authorization.k8s.io
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: dashboard-readonly-argocd
  namespace: argocd
rules:
  - apiGroups: [argoproj.io]
    resources: [applications]
    verbs: [get, list, watch]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: dashboard-readonly-argocd
  namespace: argocd
subjects:
  - kind: ServiceAccount
    name: dashboard-web
    namespace: workspace
roleRef:
  kind: Role
  name: dashboard-readonly-argocd
  apiGroup: rbac.authorization.k8s.io
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: dashboard-web
  namespace: workspace
  labels:
    app: dashboard-web
spec:
  replicas: 1
  selector:
    matchLabels:
      app: dashboard-web
  template:
    metadata:
      labels:
        app: dashboard-web
    spec:
      serviceAccountName: dashboard-web
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: dashboard-web
          image: ghcr.io/paddione/workspace-dashboard:0.1.0
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 3000
          env:
            - name: PORT
              value: "3000"
            - name: BRAND
              value: "${BRAND_ID}"
            - name: PORTAL_ADMIN_USERNAME
              valueFrom:
                secretKeyRef:
                  name: workspace-secrets
                  key: PORTAL_ADMIN_USERNAME
            - name: PGHOST
              value: shared-db.workspace.svc.cluster.local
            - name: PGUSER
              value: website
            - name: PGDATABASE
              value: website
            - name: PGPASSWORD
              valueFrom:
                secretKeyRef:
                  name: workspace-secrets
                  key: WEBSITE_DB_PASSWORD
          readinessProbe:
            httpGet: { path: /healthz, port: 3000 }
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            httpGet: { path: /healthz, port: 3000 }
            initialDelaySeconds: 10
            periodSeconds: 30
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop: [ALL]
          resources:
            requests: { memory: 128Mi, cpu: "50m" }
            limits:   { memory: 256Mi, cpu: "300m" }
---
apiVersion: v1
kind: Service
metadata:
  name: dashboard-web
  namespace: workspace
spec:
  selector: { app: dashboard-web }
  ports:
    - port: 3000
      targetPort: 3000
```

- [ ] **Step 2: Commit**

```bash
git add prod-korczewski/dashboard-web.yaml
git commit -m "feat(dashboard): add dashboard-web manifest to korczewski overlay"
```

---

### Task 4: Create prod-korczewski/oauth2-proxy-dashboard.yaml

**Files:**
- Create: `prod-korczewski/oauth2-proxy-dashboard.yaml`

Identical to `prod-mentolder/oauth2-proxy-dashboard.yaml` — all values are templated via `${PROD_DOMAIN}` / `${DASHBOARD_DOMAIN}` / secrets, so no korczewski-specific changes needed.

- [ ] **Step 1: Create the file**

Create `prod-korczewski/oauth2-proxy-dashboard.yaml` with the following content:

```yaml
# ═══════════════════════════════════════════════════════════════════
# OAuth2 Proxy — Keycloak SSO gateway for Dashboard
# Authenticates users via OIDC, then forwards to dashboard-web:3000
# ═══════════════════════════════════════════════════════════════════
apiVersion: apps/v1
kind: Deployment
metadata:
  name: oauth2-proxy-dashboard
  labels:
    app: oauth2-proxy-dashboard
spec:
  replicas: 1
  selector:
    matchLabels:
      app: oauth2-proxy-dashboard
  template:
    metadata:
      labels:
        app: oauth2-proxy-dashboard
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 65534
        seccompProfile:
          type: RuntimeDefault
      initContainers:
        - name: write-cookie-secret
          image: busybox:1.36
          imagePullPolicy: Always
          command: ["/bin/sh", "-c"]
          args:
            - printf 'cookie_secret = "%s"\n' "$(printf '%s' "$OAUTH2_PROXY_COOKIE_SECRET" | cut -c1-32)" > /run/config/oauth2-extra.cfg
          securityContext:
            allowPrivilegeEscalation: false
            runAsNonRoot: true
            runAsUser: 65534
            capabilities:
              drop: ["ALL"]
          env:
            - name: OAUTH2_PROXY_COOKIE_SECRET
              valueFrom:
                secretKeyRef:
                  name: workspace-secrets
                  key: OAUTH2_PROXY_COOKIE_SECRET
          volumeMounts:
            - name: oauth2-config
              mountPath: /run/config
      containers:
        - name: oauth2-proxy
          image: quay.io/oauth2-proxy/oauth2-proxy:v7.9.0
          imagePullPolicy: Always
          args:
            - --config=/run/config/oauth2-extra.cfg
            - --provider=keycloak-oidc
            - --client-id=dashboard
            - --client-secret=$(DASHBOARD_OIDC_SECRET)
            - --redirect-url=https://${DASHBOARD_DOMAIN}/oauth2/callback
            - --oidc-issuer-url=http://keycloak:8080/realms/workspace
            - --ssl-insecure-skip-verify=true
            - --skip-oidc-discovery=true
            - --login-url=https://auth.${PROD_DOMAIN}/realms/workspace/protocol/openid-connect/auth
            - --redeem-url=http://keycloak:8080/realms/workspace/protocol/openid-connect/token
            - --oidc-jwks-url=http://keycloak:8080/realms/workspace/protocol/openid-connect/certs
            - --profile-url=http://keycloak:8080/realms/workspace/protocol/openid-connect/userinfo
            - --upstream=http://dashboard-web:3000
            - --http-address=0.0.0.0:4180
            - --cookie-secure=true
            - --cookie-name=_oauth2_proxy_dashboard
            - --email-domain=*
            - --pass-access-token=true
            - --pass-authorization-header=true
            - --set-xauthrequest=true
            - --skip-provider-button=true
            - --code-challenge-method=S256
            - --insecure-oidc-allow-unverified-email=true
            - --oidc-extra-audience=dashboard
            - --scope=openid email profile
          env:
            - name: DASHBOARD_OIDC_SECRET
              valueFrom:
                secretKeyRef:
                  name: workspace-secrets
                  key: DASHBOARD_OIDC_SECRET
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            runAsNonRoot: true
            runAsUser: 65534
            capabilities:
              drop: [ALL]
            seccompProfile:
              type: RuntimeDefault
          ports:
            - containerPort: 4180
          readinessProbe:
            httpGet:
              path: /ping
              port: 4180
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /ping
              port: 4180
            initialDelaySeconds: 10
            periodSeconds: 30
          resources:
            requests:
              memory: 64Mi
              cpu: "50m"
            limits:
              memory: 128Mi
              cpu: "200m"
          volumeMounts:
            - name: oauth2-config
              mountPath: /run/config
              readOnly: true
      volumes:
        - name: oauth2-config
          emptyDir: {}
---
apiVersion: v1
kind: Service
metadata:
  name: oauth2-proxy-dashboard
spec:
  selector:
    app: oauth2-proxy-dashboard
  ports:
    - port: 4180
      targetPort: 4180
```

- [ ] **Step 2: Commit**

```bash
git add prod-korczewski/oauth2-proxy-dashboard.yaml
git commit -m "feat(dashboard): add oauth2-proxy-dashboard manifest to korczewski overlay"
```

---

### Task 5: Create prod-korczewski/ingress-dashboard.yaml and fix mentolder version

**Files:**
- Create: `prod-korczewski/ingress-dashboard.yaml`
- Modify: `prod-mentolder/ingress-dashboard.yaml`

The korczewski ingress uses `korczewski-tls` (env var `TLS_SECRET_NAME=korczewski-tls`). The mentolder version currently hardcodes `workspace-wildcard-tls` — fix both to use `${TLS_SECRET_NAME}` which is already in the prod deploy envsubst list.

- [ ] **Step 1: Create korczewski ingress**

Create `prod-korczewski/ingress-dashboard.yaml`:

```yaml
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: dashboard
  namespace: workspace
spec:
  entryPoints:
    - websecure
  routes:
    - match: Host(`${DASHBOARD_DOMAIN}`)
      kind: Rule
      middlewares:
        - name: hsts-headers
        - name: security-headers
      services:
        - name: oauth2-proxy-dashboard
          port: 4180
  tls:
    secretName: ${TLS_SECRET_NAME}
```

- [ ] **Step 2: Fix mentolder ingress to also use ${TLS_SECRET_NAME}**

In `prod-mentolder/ingress-dashboard.yaml` change line 19:

```yaml
    secretName: workspace-wildcard-tls
```

to:

```yaml
    secretName: ${TLS_SECRET_NAME}
```

- [ ] **Step 3: Commit**

```bash
git add prod-korczewski/ingress-dashboard.yaml prod-mentolder/ingress-dashboard.yaml
git commit -m "feat(dashboard): add korczewski ingress + use TLS_SECRET_NAME in both overlays"
```

---

### Task 6: Update prod-korczewski/kustomization.yaml

**Files:**
- Modify: `prod-korczewski/kustomization.yaml`

- [ ] **Step 1: Add the three dashboard resources**

In `prod-korczewski/kustomization.yaml`, change the `resources:` block from:

```yaml
resources:
  - ../prod
  - ddns-updater.yaml
```

to:

```yaml
resources:
  - ../prod
  - ddns-updater.yaml
  - dashboard-web.yaml
  - oauth2-proxy-dashboard.yaml
  - ingress-dashboard.yaml
```

- [ ] **Step 2: Validate the kustomize build**

```bash
task workspace:validate ENV=korczewski 2>&1 | tail -20
```

Expected: no errors (validation may warn about server-side resources but should produce a manifest).

- [ ] **Step 3: Commit**

```bash
git add prod-korczewski/kustomization.yaml
git commit -m "feat(dashboard): wire dashboard manifests into korczewski kustomization"
```

---

### Task 7: Update Taskfile dashboard tasks to support both environments

**Files:**
- Modify: `Taskfile.yml` lines 37–54

The `dashboard:web:deploy` and `dashboard:web:logs` tasks are hardcoded to mentolder. Make them env-aware.

- [ ] **Step 1: Update dashboard:web:deploy**

Replace the existing `dashboard:web:deploy` task (lines 37–49) with:

```yaml
  dashboard:web:deploy:
    desc: Deploy dashboard-web to mentolder or korczewski (SSO-gated operator dashboard)
    vars:
      ENV: '{{.ENV | default "mentolder"}}'
    preconditions:
      - sh: '[ "{{.ENV}}" = "mentolder" ] || [ "{{.ENV}}" = "korczewski" ]'
        msg: "dashboard:web:deploy requires ENV=mentolder or ENV=korczewski, got ENV={{.ENV}}"
    cmds:
      - task: workspace:deploy
        vars: { ENV: "{{.ENV}}" }
      - kubectl --context {{.ENV}} -n workspace rollout restart deploy/dashboard-web
      - kubectl --context {{.ENV}} -n workspace rollout restart deploy/oauth2-proxy-dashboard
      - kubectl --context {{.ENV}} -n workspace rollout status deploy/dashboard-web --timeout=120s
      - 'echo "✓ Deployed at https://dashboard.{{.ENV}}.de"'
```

- [ ] **Step 2: Update dashboard:web:logs**

Replace the existing `dashboard:web:logs` task (lines 51–54) with:

```yaml
  dashboard:web:logs:
    desc: Tail dashboard-web logs (ENV=mentolder|korczewski, default mentolder)
    vars:
      ENV: '{{.ENV | default "mentolder"}}'
    cmds:
      - kubectl --context {{.ENV}} -n workspace logs deploy/dashboard-web --tail=200 -f
```

- [ ] **Step 3: Verify Taskfile syntax**

```bash
task --list 2>&1 | grep dashboard
```

Expected: both tasks appear without error.

- [ ] **Step 4: Commit**

```bash
git add Taskfile.yml
git commit -m "chore(taskfile): make dashboard:web:deploy/logs support ENV=korczewski"
```

---

### Task 8: CI validation and deploy

- [ ] **Step 1: Run manifest validation**

```bash
task workspace:validate ENV=korczewski 2>&1 | grep -E "error|Error|FAIL" | head -20
```

Expected: no errors.

- [ ] **Step 2: Lint YAML (CI requirement: 200-char line limit)**

```bash
yamllint -d '{extends: relaxed, rules: {line-length: {max: 200}}}' \
  prod-korczewski/dashboard-web.yaml \
  prod-korczewski/oauth2-proxy-dashboard.yaml \
  prod-korczewski/ingress-dashboard.yaml
```

Expected: no errors.

- [ ] **Step 3: Deploy to korczewski**

```bash
task workspace:deploy ENV=korczewski
```

- [ ] **Step 4: Verify pods are running**

```bash
kubectl --context korczewski -n workspace get pods -l 'app in (dashboard-web,oauth2-proxy-dashboard)'
```

Expected: both pods `Running` and `1/1 Ready`.

- [ ] **Step 5: Smoke-test the dashboard URL**

Open `https://dashboard.korczewski.de` in a browser. Expected: Keycloak login redirect, then dashboard loads after auth.

- [ ] **Step 6: Push and open PR**

```bash
git push origin feature/deployed-dashboard-spec
gh pr create --title "feat(dashboard): deploy operator dashboard to korczewski" \
  --body "$(cat <<'EOF'
## Summary
- Adds dashboard-web, oauth2-proxy-dashboard, and IngressRoute to the korczewski overlay
- Adds dedicated `dashboard` Keycloak OIDC client to korczewski realm (replaces provisional redirect in traefik-dashboard client)
- Generates and seals DASHBOARD_OIDC_SECRET for korczewski
- Makes dashboard:web:deploy and dashboard:web:logs tasks env-aware (mentolder + korczewski)
- Fixes prod-mentolder/ingress-dashboard.yaml to use \${TLS_SECRET_NAME} consistently

## Test plan
- [ ] `task workspace:validate ENV=korczewski` passes
- [ ] yamllint passes on new files
- [ ] Both dashboard-web and oauth2-proxy-dashboard pods Running on korczewski after deploy
- [ ] https://dashboard.korczewski.de redirects to Keycloak and loads after auth
- [ ] mentolder dashboard still works (no regression)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
