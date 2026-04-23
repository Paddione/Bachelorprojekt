# Mailpit OIDC + Basic-Auth Retirement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace htpasswd basic-auth on `mail.<domain>` with Keycloak-backed OIDC via a dedicated oauth2-proxy, then delete the now-unused `traefik-basic-auth` Secret + `basic-auth-internal` middleware.

**Architecture:** A new `oauth2-proxy-mailpit` Deployment acts as a ForwardAuth gatekeeper — Traefik calls `/oauth2/auth` for every request; a 401 triggers the errors middleware, which redirects the browser to the oauth2-proxy sign-in flow and then Keycloak. The upstream `mailpit:8025` is never touched directly by unauthenticated clients. Pattern is identical to `oauth2-proxy-traefik` (commit `08e2a6c`).

**Tech Stack:** Kubernetes (Kustomize), Traefik IngressRoute CRDs (traefik.io/v1alpha1), oauth2-proxy v7.9.0, Keycloak OIDC, SealedSecrets.

---

## File Map

| Action | File |
|--------|------|
| Create | `k3d/oauth2-proxy-mailpit.yaml` |
| Create | `k3d/mail-ingressroute-dev.yaml` |
| Create | `prod/patch-oauth2-proxy-mailpit.yaml` |
| Create | `prod/mail-ingressroute.yaml` |
| Modify | `k3d/kustomization.yaml` |
| Modify | `k3d/ingress.yaml` |
| Modify | `k3d/secrets.yaml` |
| Modify | `k3d/keycloak.yaml` |
| Modify | `k3d/realm-import-entrypoint.sh` |
| Modify | `k3d/realm-workspace-dev.json` |
| Modify | `scripts/import-entrypoint.sh` |
| Modify | `prod/kustomization.yaml` |
| Modify | `prod/ingress.yaml` |
| Modify | `prod-mentolder/realm-workspace-mentolder.json` |
| Modify | `prod-korczewski/realm-workspace-korczewski.json` |
| Modify | `environments/schema.yaml` |
| Modify | `environments/mentolder.yaml` |
| Modify | `environments/korczewski.yaml` |
| Modify | `environments/.secrets/mentolder.yaml` |
| Modify | `environments/.secrets/korczewski.yaml` |
| Modify | `environments/sealed-secrets/mentolder.yaml` |
| Modify | `environments/sealed-secrets/korczewski.yaml` |
| Modify | `scripts/secrets-audit.sh` |
| Modify | `k3d/website.yaml` |
| Modify | `Taskfile.yml` |
| Modify | `website/src/pages/admin.astro` |
| Modify | `k3d/docs-content/security.md` |
| Modify | `k3d/docs-content/architecture.md` |
| Modify | `k3d/docs-content/security-report.md` |
| Delete | `k3d/traefik-middlewares-dev.yaml` |
| Delete | `prod/patch-traefik-basic-auth.yaml` |

---

## Task 1: Create `k3d/oauth2-proxy-mailpit.yaml`

**Files:**
- Create: `k3d/oauth2-proxy-mailpit.yaml`

- [ ] **Step 1: Create the file**

```yaml
# k3d/oauth2-proxy-mailpit.yaml
# OAuth2 Proxy — Keycloak SSO gateway for Mailpit (mail.<domain>)
# ForwardAuth mode: authenticates via /oauth2/auth (202/401). Traefik's
# errors middleware redirects 401s to /oauth2/sign_in.
# Access is restricted to the emails listed in authenticated-emails-file.
apiVersion: v1
kind: ConfigMap
metadata:
  name: oauth2-proxy-mailpit-allowed-emails
data:
  # Admin allow-list. Must match users' Keycloak email addresses.
  allowed-emails: |
    patrick@korczewski.de
    quamain@web.de
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: oauth2-proxy-mailpit
  labels:
    app: oauth2-proxy-mailpit
spec:
  replicas: 1
  selector:
    matchLabels:
      app: oauth2-proxy-mailpit
  template:
    metadata:
      labels:
        app: oauth2-proxy-mailpit
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
            - --client-id=mailpit-admin
            - --client-secret=$(MAIL_OIDC_SECRET)
            - --redirect-url=http://mail.localhost/oauth2/callback
            - --oidc-issuer-url=http://keycloak:8080/realms/workspace
            - --ssl-insecure-skip-verify=true
            - --skip-oidc-discovery=true
            - --login-url=http://auth.localhost/realms/workspace/protocol/openid-connect/auth
            - --redeem-url=http://keycloak:8080/realms/workspace/protocol/openid-connect/token
            - --oidc-jwks-url=http://keycloak:8080/realms/workspace/protocol/openid-connect/certs
            - --profile-url=http://keycloak:8080/realms/workspace/protocol/openid-connect/userinfo
            - --upstream=static://202
            - --reverse-proxy=true
            - --http-address=0.0.0.0:4180
            - --cookie-secure=false
            - --cookie-name=_oauth2_proxy_mailpit
            - --authenticated-emails-file=/etc/oauth2/allowed-emails
            - --pass-access-token=true
            - --pass-authorization-header=true
            - --set-xauthrequest=true
            - --skip-provider-button=true
            - --code-challenge-method=S256
            - --insecure-oidc-allow-unverified-email=true
            - --oidc-extra-audience=mailpit-admin
            - --scope=openid email profile
            - --whitelist-domain=mail.localhost
          env:
            - name: MAIL_OIDC_SECRET
              valueFrom:
                secretKeyRef:
                  name: workspace-secrets
                  key: MAIL_OIDC_SECRET
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
            - name: allowed-emails
              mountPath: /etc/oauth2
              readOnly: true
      volumes:
        - name: oauth2-config
          emptyDir: {}
        - name: allowed-emails
          configMap:
            name: oauth2-proxy-mailpit-allowed-emails
            items:
              - key: allowed-emails
                path: allowed-emails
---
apiVersion: v1
kind: Service
metadata:
  name: oauth2-proxy-mailpit
spec:
  selector:
    app: oauth2-proxy-mailpit
  ports:
    - port: 4180
      targetPort: 4180
```

- [ ] **Step 2: Add to `k3d/kustomization.yaml` resources**

In `k3d/kustomization.yaml`, find the block:
```yaml
  # Traefik dashboard SSO gateway
  - oauth2-proxy-traefik.yaml
```
Add `oauth2-proxy-mailpit.yaml` immediately after it:
```yaml
  # Traefik dashboard SSO gateway
  - oauth2-proxy-traefik.yaml
  # Mailpit SSO gateway
  - oauth2-proxy-mailpit.yaml
```

- [ ] **Step 3: Commit**

```bash
git add k3d/oauth2-proxy-mailpit.yaml k3d/kustomization.yaml
git commit -m "feat(mailpit): add oauth2-proxy-mailpit deployment + service + allowed-emails ConfigMap"
```

---

## Task 2: Dev IngressRoute for `mail.localhost`

**Files:**
- Create: `k3d/mail-ingressroute-dev.yaml`
- Modify: `k3d/ingress.yaml`
- Modify: `k3d/kustomization.yaml`

- [ ] **Step 1: Create `k3d/mail-ingressroute-dev.yaml`**

```yaml
# k3d/mail-ingressroute-dev.yaml
# Mailpit — OIDC-protected via oauth2-proxy (dev, HTTP only)
# Flow: ForwardAuth → 202 (pass) or 401 → errors middleware → sign_in → Keycloak
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: mailpit-auth
  namespace: workspace
spec:
  forwardAuth:
    address: http://oauth2-proxy-mailpit.workspace.svc.cluster.local:4180/oauth2/auth
    trustForwardHeader: true
    authResponseHeaders:
      - X-Auth-Request-User
      - X-Auth-Request-Email
      - X-Auth-Request-Access-Token
---
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: mailpit-errors
  namespace: workspace
spec:
  errors:
    status:
      - "401"
    service:
      name: oauth2-proxy-mailpit
      port: 4180
    query: "/oauth2/sign_in?rd={scheme}://{host}{url}"
---
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: mailpit-dev
  namespace: workspace
spec:
  entryPoints:
    - web
  routes:
    # oauth2-proxy endpoints — no auth middleware
    - match: Host(`mail.localhost`) && PathPrefix(`/oauth2`)
      kind: Rule
      services:
        - name: oauth2-proxy-mailpit
          port: 4180
    # Mailpit UI — require auth
    - match: Host(`mail.localhost`)
      kind: Rule
      middlewares:
        - name: mailpit-errors
        - name: mailpit-auth
      services:
        - name: mailpit
          port: 8025
```

- [ ] **Step 2: Remove `mail.localhost` rule from `workspace-ingress-internal` in `k3d/ingress.yaml`**

Current block (lines 80-110):
```yaml
---
# ─── Interne Tools — BasicAuth (Mailpit, Docs) ───────────
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: workspace-ingress-internal
  annotations:
    traefik.ingress.kubernetes.io/router.middlewares: "workspace-basic-auth-internal@kubernetescrd"
spec:
  rules:
    - host: mail.localhost
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: mailpit
                port:
                  number: 8025
    - host: docs.localhost
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: oauth2-proxy-docs
                port:
                  number: 4180
```

Replace with (remove mail rule, remove basic-auth annotation, update comment):
```yaml
---
# ─── Interne Tools (Docs, oauth2-proxy-protected) ────────
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: workspace-ingress-internal
spec:
  rules:
    - host: docs.localhost
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: oauth2-proxy-docs
                port:
                  number: 4180
```

- [ ] **Step 3: Add `mail-ingressroute-dev.yaml` to `k3d/kustomization.yaml`**

Find:
```yaml
  # Mailpit SSO gateway
  - oauth2-proxy-mailpit.yaml
```
Add `mail-ingressroute-dev.yaml` after it:
```yaml
  # Mailpit SSO gateway
  - oauth2-proxy-mailpit.yaml
  - mail-ingressroute-dev.yaml
```

- [ ] **Step 4: Commit**

```bash
git add k3d/mail-ingressroute-dev.yaml k3d/ingress.yaml k3d/kustomization.yaml
git commit -m "feat(mailpit): add dev IngressRoute for mail.localhost + remove basic-auth from workspace-ingress-internal"
```

---

## Task 3: Prod IngressRoute + patch + remove prod basic-auth Ingress

**Files:**
- Create: `prod/patch-oauth2-proxy-mailpit.yaml`
- Create: `prod/mail-ingressroute.yaml`
- Modify: `prod/ingress.yaml`
- Modify: `prod/kustomization.yaml`

- [ ] **Step 1: Create `prod/patch-oauth2-proxy-mailpit.yaml`**

```yaml
# prod/patch-oauth2-proxy-mailpit.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: oauth2-proxy-mailpit
spec:
  template:
    spec:
      containers:
        - name: oauth2-proxy
          args:
            - "--config=/run/config/oauth2-extra.cfg"
            - "--provider=keycloak-oidc"
            - "--client-id=mailpit-admin"
            - "--client-secret=$(MAIL_OIDC_SECRET)"
            - "--redirect-url=https://mail.${PROD_DOMAIN}/oauth2/callback"
            - "--oidc-issuer-url=https://auth.${PROD_DOMAIN}/realms/workspace"
            - "--ssl-insecure-skip-verify=true"
            - "--skip-oidc-discovery=true"
            - "--login-url=https://auth.${PROD_DOMAIN}/realms/workspace/protocol/openid-connect/auth"
            - "--redeem-url=http://keycloak:8080/realms/workspace/protocol/openid-connect/token"
            - "--oidc-jwks-url=http://keycloak:8080/realms/workspace/protocol/openid-connect/certs"
            - "--profile-url=http://keycloak:8080/realms/workspace/protocol/openid-connect/userinfo"
            - "--upstream=static://202"
            - "--reverse-proxy=true"
            - "--http-address=0.0.0.0:4180"
            - "--cookie-secure=true"
            - "--cookie-name=_oauth2_proxy_mailpit"
            - "--authenticated-emails-file=/etc/oauth2/allowed-emails"
            - "--pass-access-token=true"
            - "--pass-authorization-header=true"
            - "--set-xauthrequest=true"
            - "--skip-provider-button=true"
            - "--code-challenge-method=S256"
            - "--insecure-oidc-allow-unverified-email=true"
            - "--oidc-extra-audience=mailpit-admin"
            - "--scope=openid email profile"
            - "--whitelist-domain=mail.${PROD_DOMAIN}"
          env:
            - name: MAIL_OIDC_SECRET
              valueFrom:
                secretKeyRef:
                  name: workspace-secrets
                  key: MAIL_OIDC_SECRET
```

- [ ] **Step 2: Create `prod/mail-ingressroute.yaml`**

```yaml
# prod/mail-ingressroute.yaml
# Mailpit — OIDC-protected via oauth2-proxy (prod, HTTPS)
# Flow: ForwardAuth → 202 (pass) or 401 → errors middleware → Keycloak sign-in
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: mailpit-auth
  namespace: workspace
spec:
  forwardAuth:
    address: http://oauth2-proxy-mailpit.workspace.svc.cluster.local:4180/oauth2/auth
    trustForwardHeader: true
    authResponseHeaders:
      - X-Auth-Request-User
      - X-Auth-Request-Email
      - X-Auth-Request-Access-Token
---
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: mailpit-errors
  namespace: workspace
spec:
  errors:
    status:
      - "401"
    service:
      name: oauth2-proxy-mailpit
      port: 4180
    query: "/oauth2/sign_in?rd={scheme}://{host}{url}"
---
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: mailpit
  namespace: workspace
spec:
  entryPoints:
    - websecure
  routes:
    # oauth2-proxy endpoints — no auth middleware
    - match: Host(`mail.${PROD_DOMAIN}`) && PathPrefix(`/oauth2`)
      kind: Rule
      middlewares:
        - name: hsts-headers
        - name: security-headers
      services:
        - name: oauth2-proxy-mailpit
          port: 4180
    # Mailpit UI — require auth
    - match: Host(`mail.${PROD_DOMAIN}`)
      kind: Rule
      middlewares:
        - name: hsts-headers
        - name: security-headers
        - name: mailpit-errors
        - name: mailpit-auth
      services:
        - name: mailpit
          port: 8025
  tls:
    secretName: workspace-wildcard-tls
```

- [ ] **Step 3: Remove `workspace-ingress-mail` block from `prod/ingress.yaml`**

Find and delete these lines (125–148 in committed state; check with your editor):
```yaml
---
# ── Mailpit (Dev SMTP) — BasicAuth (internes Tool) ──────────────────
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: workspace-ingress-mail
  annotations:
    traefik.ingress.kubernetes.io/router.middlewares: "workspace-redirect-https@kubernetescrd,workspace-hsts-headers@kubernetescrd,workspace-security-headers@kubernetescrd,workspace-basic-auth-internal@kubernetescrd"
spec:
  tls:
    - hosts:
        - mail.${PROD_DOMAIN}
      secretName: workspace-wildcard-tls
  rules:
    - host: mail.${PROD_DOMAIN}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: mailpit
                port:
                  number: 8025
```

- [ ] **Step 4: Update `prod/kustomization.yaml`**

Add `patch-oauth2-proxy-mailpit.yaml` after `patch-oauth2-proxy-traefik.yaml` in the patches list:
```yaml
  - path: patch-oauth2-proxy-docs.yaml
  - path: patch-oauth2-proxy-traefik.yaml
  - path: patch-oauth2-proxy-mailpit.yaml
```

Add `mail-ingressroute.yaml` in the resources list alongside `traefik-dashboard.yaml`:
```yaml
  - traefik-dashboard.yaml
  - mail-ingressroute.yaml
```

- [ ] **Step 5: Commit**

```bash
git add prod/patch-oauth2-proxy-mailpit.yaml prod/mail-ingressroute.yaml prod/ingress.yaml prod/kustomization.yaml
git commit -m "feat(mailpit): add prod IngressRoute + oauth2-proxy patch, remove basic-auth Ingress"
```

---

## Task 4: Keycloak — `mailpit-admin` client in all three realms + env wiring

**Files:**
- Modify: `k3d/realm-workspace-dev.json`
- Modify: `prod-mentolder/realm-workspace-mentolder.json`
- Modify: `prod-korczewski/realm-workspace-korczewski.json`
- Modify: `k3d/keycloak.yaml`
- Modify: `k3d/realm-import-entrypoint.sh`
- Modify: `scripts/import-entrypoint.sh`

- [ ] **Step 1: Add `mailpit-admin` client to `k3d/realm-workspace-dev.json`**

The `clients` array currently ends with the `traefik-dashboard` object closing with `}` followed by `]`. Find the end of the array:
```json
      ]
    }
  ]
}
```
The second-to-last `}` closes `traefik-dashboard`, the `]` closes `clients`, the final `}` closes the realm.

Add a comma after the traefik-dashboard closing `}` and insert the mailpit-admin object. Change:
```json
      ]
    }
  ]
}
```
To:
```json
      ]
    },
    {
      "clientId": "mailpit-admin",
      "name": "Mailpit Admin",
      "enabled": true,
      "clientAuthenticatorType": "client-secret",
      "secret": "${MAIL_OIDC_SECRET}",
      "redirectUris": [
        "http://${MAIL_DOMAIN}/oauth2/callback"
      ],
      "webOrigins": [
        "http://${MAIL_DOMAIN}"
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
        }
      ]
    }
  ]
}
```

Verify the JSON is valid: `python3 -m json.tool k3d/realm-workspace-dev.json > /dev/null && echo OK`

- [ ] **Step 2: Add `mailpit-admin` client to `prod-mentolder/realm-workspace-mentolder.json`**

Same edit as Step 1 but with `https://` instead of `http://`:

Change the end of the `clients` array from:
```json
      ]
    }
  ]
}
```
To:
```json
      ]
    },
    {
      "clientId": "mailpit-admin",
      "name": "Mailpit Admin",
      "enabled": true,
      "clientAuthenticatorType": "client-secret",
      "secret": "${MAIL_OIDC_SECRET}",
      "redirectUris": [
        "https://${MAIL_DOMAIN}/oauth2/callback"
      ],
      "webOrigins": [
        "https://${MAIL_DOMAIN}"
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
        }
      ]
    }
  ]
}
```

Verify: `python3 -m json.tool prod-mentolder/realm-workspace-mentolder.json > /dev/null && echo OK`

- [ ] **Step 3: Add `mailpit-admin` client to `prod-korczewski/realm-workspace-korczewski.json`**

Identical edit to Step 2 (both prod realms have the same structure; `https://` URLs). Verify with: `python3 -m json.tool prod-korczewski/realm-workspace-korczewski.json > /dev/null && echo OK`

- [ ] **Step 4: Wire `MAIL_OIDC_SECRET` and `MAIL_DOMAIN` into `k3d/keycloak.yaml`**

Find the block ending with `TRAEFIK_DOMAIN`:
```yaml
            - name: TRAEFIK_DOMAIN
              valueFrom:
                configMapKeyRef:
                  name: domain-config
                  key: TRAEFIK_DOMAIN
```
Add `MAIL_OIDC_SECRET` and `MAIL_DOMAIN` immediately after it:
```yaml
            - name: TRAEFIK_DOMAIN
              valueFrom:
                configMapKeyRef:
                  name: domain-config
                  key: TRAEFIK_DOMAIN
            - name: MAIL_OIDC_SECRET
              valueFrom:
                secretKeyRef:
                  name: workspace-secrets
                  key: MAIL_OIDC_SECRET
            - name: MAIL_DOMAIN
              valueFrom:
                configMapKeyRef:
                  name: domain-config
                  key: MAIL_DOMAIN
```

- [ ] **Step 5: Add `MAIL_OIDC_SECRET` and `MAIL_DOMAIN` to both import entrypoint scripts**

In `k3d/realm-import-entrypoint.sh`, find:
```sh
for var in NEXTCLOUD_OIDC_SECRET \
           VAULTWARDEN_OIDC_SECRET WEBSITE_OIDC_SECRET CLAUDE_CODE_OIDC_SECRET \
           DOCS_OIDC_SECRET TRAEFIK_OIDC_SECRET \
           NC_DOMAIN WEB_DOMAIN VAULT_DOMAIN DOCS_DOMAIN TRAEFIK_DOMAIN; do
```
Replace with:
```sh
for var in NEXTCLOUD_OIDC_SECRET \
           VAULTWARDEN_OIDC_SECRET WEBSITE_OIDC_SECRET CLAUDE_CODE_OIDC_SECRET \
           DOCS_OIDC_SECRET TRAEFIK_OIDC_SECRET MAIL_OIDC_SECRET \
           NC_DOMAIN WEB_DOMAIN VAULT_DOMAIN DOCS_DOMAIN TRAEFIK_DOMAIN MAIL_DOMAIN; do
```

Apply the **identical** change to `scripts/import-entrypoint.sh`.

- [ ] **Step 6: Commit**

```bash
git add k3d/realm-workspace-dev.json prod-mentolder/realm-workspace-mentolder.json \
        prod-korczewski/realm-workspace-korczewski.json k3d/keycloak.yaml \
        k3d/realm-import-entrypoint.sh scripts/import-entrypoint.sh
git commit -m "feat(mailpit): add mailpit-admin Keycloak client + MAIL_OIDC_SECRET env in keycloak pod"
```

---

## Task 5: Schema + env files + dev secrets

**Files:**
- Modify: `environments/schema.yaml`
- Modify: `environments/mentolder.yaml`
- Modify: `environments/korczewski.yaml`
- Modify: `environments/.secrets/mentolder.yaml`
- Modify: `environments/.secrets/korczewski.yaml`
- Modify: `k3d/secrets.yaml`

- [ ] **Step 1: Add `MAIL_OIDC_SECRET` to `environments/schema.yaml`**

Find:
```yaml
  - name: TRAEFIK_OIDC_SECRET
    required: true
    generate: true
    length: 40
```
Add `MAIL_OIDC_SECRET` immediately after it:
```yaml
  - name: TRAEFIK_OIDC_SECRET
    required: true
    generate: true
    length: 40

  - name: MAIL_OIDC_SECRET
    required: true
    generate: true
    length: 40
```

- [ ] **Step 2: Add `MAIL_EXTERNAL_URL` to `environments/schema.yaml`**

Find:
```yaml
  - name: TRAEFIK_EXTERNAL_URL
    required: false
    default_dev: "http://traefik.localhost"
```
Add `MAIL_EXTERNAL_URL` immediately after it:
```yaml
  - name: TRAEFIK_EXTERNAL_URL
    required: false
    default_dev: "http://traefik.localhost"

  - name: MAIL_EXTERNAL_URL
    required: false
    default_dev: "http://mail.localhost"
```

- [ ] **Step 3: Remove `TRAEFIK_BASIC_AUTH_USERS` from `environments/schema.yaml`**

Find and delete the entire entry (two lines):
```yaml
  - name: TRAEFIK_BASIC_AUTH_USERS
    required: false
    generate: false
```

- [ ] **Step 4: Add `MAIL_EXTERNAL_URL` to `environments/mentolder.yaml`**

Find:
```yaml
  TRAEFIK_EXTERNAL_URL: "https://traefik.mentolder.de"
```
Add the line immediately after:
```yaml
  TRAEFIK_EXTERNAL_URL: "https://traefik.mentolder.de"
  MAIL_EXTERNAL_URL: "https://mail.mentolder.de"
```

- [ ] **Step 5: Add `MAIL_EXTERNAL_URL` to `environments/korczewski.yaml`**

Find:
```yaml
  TRAEFIK_EXTERNAL_URL: "https://traefik.korczewski.de"
```
Add the line immediately after:
```yaml
  TRAEFIK_EXTERNAL_URL: "https://traefik.korczewski.de"
  MAIL_EXTERNAL_URL: "https://mail.korczewski.de"
```

- [ ] **Step 6: Generate `MAIL_OIDC_SECRET` values and update `.secrets/` files**

Generate two distinct 40-char secrets (one per env):
```bash
openssl rand -hex 20   # run twice; copy each output
```

In `environments/.secrets/mentolder.yaml`, add after the `TRAEFIK_OIDC_SECRET` line:
```yaml
MAIL_OIDC_SECRET: "<generated-40-char-hex-1>"
```
Also delete the `TRAEFIK_BASIC_AUTH_USERS` line (line 43).

In `environments/.secrets/korczewski.yaml`, add after the `TRAEFIK_OIDC_SECRET` line:
```yaml
MAIL_OIDC_SECRET: "<generated-40-char-hex-2>"
```
Also delete the `TRAEFIK_BASIC_AUTH_USERS` line (line 42).

- [ ] **Step 7: Update `k3d/secrets.yaml` (dev placeholder + remove basic-auth)**

Add dev placeholder for `MAIL_OIDC_SECRET` in the `workspace-secrets` Secret. Find:
```yaml
  TRAEFIK_BASIC_AUTH_USERS: "admin:$apr1$5eWIMTsW$DxkncjqowMl8AONonaHmk/"
```
Replace with (add MAIL_OIDC_SECRET, remove TRAEFIK_BASIC_AUTH_USERS):
```yaml
  MAIL_OIDC_SECRET: "dev-mailpit-oidc-secret-change-me-40chars1"
```

Then delete the entire `traefik-basic-auth` Secret block (the `---` separator, comment, and Secret manifest) — lines 55–66 in the committed version. The block to delete is:
```yaml
---
# Traefik BasicAuth für interne Tools (Mailpit, Docs, MCP-Status)
# Dev-Credentials: admin:admin
# Erneuerung: htpasswd -nb <user> <password> > neuer Wert
apiVersion: v1
kind: Secret
metadata:
  name: traefik-basic-auth
  namespace: workspace
type: Opaque
stringData:
  users: "admin:$apr1$5eWIMTsW$DxkncjqowMl8AONonaHmk/"
```

- [ ] **Step 8: Validate schema**

```bash
task env:validate ENV=dev
```
Expected: no errors about missing required keys.

- [ ] **Step 9: Commit**

```bash
git add environments/schema.yaml environments/mentolder.yaml environments/korczewski.yaml \
        environments/.secrets/mentolder.yaml environments/.secrets/korczewski.yaml \
        k3d/secrets.yaml
git commit -m "feat(mailpit): add MAIL_OIDC_SECRET + MAIL_EXTERNAL_URL to schema/env files; remove TRAEFIK_BASIC_AUTH_USERS"
```

---

## Task 6: Seal environments

**Files:**
- Modify: `environments/sealed-secrets/mentolder.yaml`
- Modify: `environments/sealed-secrets/korczewski.yaml`

- [ ] **Step 1: Seal mentolder**

```bash
task env:seal ENV=mentolder
```
Expected: `environments/sealed-secrets/mentolder.yaml` updated with new `MAIL_OIDC_SECRET` entry and without `TRAEFIK_BASIC_AUTH_USERS`.

- [ ] **Step 2: Seal korczewski**

```bash
task env:seal ENV=korczewski
```
Expected: `environments/sealed-secrets/korczewski.yaml` updated similarly.

- [ ] **Step 3: Verify sealed secrets contain MAIL_OIDC_SECRET and lack TRAEFIK_BASIC_AUTH_USERS**

```bash
grep -c "MAIL_OIDC_SECRET" environments/sealed-secrets/mentolder.yaml environments/sealed-secrets/korczewski.yaml
grep "TRAEFIK_BASIC_AUTH_USERS" environments/sealed-secrets/mentolder.yaml environments/sealed-secrets/korczewski.yaml
```
Expected: two `1`s from the first command (one hit per file); no output from the second command.

- [ ] **Step 4: Commit**

```bash
git add environments/sealed-secrets/mentolder.yaml environments/sealed-secrets/korczewski.yaml
git commit -m "chore: reseal environments — add MAIL_OIDC_SECRET, drop TRAEFIK_BASIC_AUTH_USERS"
```

---

## Task 7: Delete basic-auth files + update kustomization

**Files:**
- Delete: `k3d/traefik-middlewares-dev.yaml`
- Delete: `prod/patch-traefik-basic-auth.yaml`
- Modify: `k3d/kustomization.yaml`
- Modify: `prod/kustomization.yaml`

- [ ] **Step 1: Verify no remaining references to basic-auth (excluding docs-content)**

```bash
grep -rn "basic-auth-internal\|traefik-basic-auth" k3d/ prod/ prod-mentolder/ prod-korczewski/ \
  --include="*.yaml" --include="*.json" --include="*.sh" \
  | grep -v "k3d/docs-content"
```
Expected: **zero output**. If any hits remain, fix them before proceeding.

- [ ] **Step 2: Delete `k3d/traefik-middlewares-dev.yaml`**

```bash
git rm k3d/traefik-middlewares-dev.yaml
```

- [ ] **Step 3: Remove `traefik-middlewares-dev.yaml` from `k3d/kustomization.yaml`**

Find and delete these two lines:
```yaml
  # Traefik Dev-Middlewares
  - traefik-middlewares-dev.yaml
```

- [ ] **Step 4: Delete `prod/patch-traefik-basic-auth.yaml`**

```bash
git rm prod/patch-traefik-basic-auth.yaml
```

- [ ] **Step 5: Remove `patch-traefik-basic-auth.yaml` from `prod/kustomization.yaml`**

Find and delete these two lines:
```yaml
  # Override traefik basic-auth with production credentials (replaces dev admin:admin hash)
  - path: patch-traefik-basic-auth.yaml
```

- [ ] **Step 6: Validate manifests**

```bash
task workspace:validate
```
Expected: `kustomize build` + `kubeconform` both pass without errors.

- [ ] **Step 7: Commit**

```bash
git add k3d/kustomization.yaml prod/kustomization.yaml
git commit -m "chore: delete traefik-basic-auth Secret + basic-auth-internal middleware — Mailpit now OIDC-protected"
```

---

## Task 8: Update `scripts/secrets-audit.sh`

**Files:**
- Modify: `scripts/secrets-audit.sh`

- [ ] **Step 1: Add `MAIL_OIDC_SECRET` to SOLO_LABELS**

Find in `SOLO_LABELS`:
```bash
  "TRAEFIK_OIDC_SECRET"
```
Add `MAIL_OIDC_SECRET` on the next line:
```bash
  "TRAEFIK_OIDC_SECRET"
  "MAIL_OIDC_SECRET"
```

- [ ] **Step 2: Add `MAIL_OIDC_SECRET` to SOLO_MEMBERS**

Find in `SOLO_MEMBERS`:
```bash
  "workspace:workspace-secrets:TRAEFIK_OIDC_SECRET"
```
Add `MAIL_OIDC_SECRET` on the next line:
```bash
  "workspace:workspace-secrets:TRAEFIK_OIDC_SECRET"
  "workspace:workspace-secrets:MAIL_OIDC_SECRET"
```

- [ ] **Step 3: Remove `traefik-basic-auth: users (htpasswd)` from SOLO_LABELS**

Find and delete the line:
```bash
  "traefik-basic-auth: users (htpasswd)"
```

- [ ] **Step 4: Remove the corresponding SOLO_MEMBERS entry**

Find and delete the line (currently line 182):
```bash
  "workspace:traefik-basic-auth:users"
```

Verify it's gone: `grep "traefik-basic-auth" scripts/secrets-audit.sh` → no output.

- [ ] **Step 5: Commit**

```bash
git add scripts/secrets-audit.sh
git commit -m "chore(secrets-audit): add MAIL_OIDC_SECRET parity check, remove traefik-basic-auth entry"
```

---

## Task 9: Website admin tile for Mailpit

**Files:**
- Modify: `k3d/website.yaml`
- Modify: `Taskfile.yml`
- Modify: `website/src/pages/admin.astro`

- [ ] **Step 1: Add `MAIL_EXTERNAL_URL` to `k3d/website.yaml` ConfigMap**

Find:
```yaml
  TRAEFIK_EXTERNAL_URL: "${TRAEFIK_EXTERNAL_URL}"
```
Add the line after it:
```yaml
  TRAEFIK_EXTERNAL_URL: "${TRAEFIK_EXTERNAL_URL}"
  MAIL_EXTERNAL_URL: "${MAIL_EXTERNAL_URL}"
```

- [ ] **Step 2: Add `MAIL_EXTERNAL_URL` to the Taskfile envsubst list**

In `Taskfile.yml`, find (the `website:deploy` task's envsubst line, around line 1629):
```
envsubst "... \$TRAEFIK_EXTERNAL_URL \$STRIPE_PUBLISHABLE_KEY" < k3d/website.yaml
```
Add `\$MAIL_EXTERNAL_URL` before `\$STRIPE_PUBLISHABLE_KEY`:
```
envsubst "... \$TRAEFIK_EXTERNAL_URL \$MAIL_EXTERNAL_URL \$STRIPE_PUBLISHABLE_KEY" < k3d/website.yaml
```

- [ ] **Step 3: Add Mailpit tile to `website/src/pages/admin.astro`**

Find the `traefikUrl` declaration:
```typescript
const traefikUrl  = process.env.TRAEFIK_EXTERNAL_URL ?? '';
```
Add `mailUrl` immediately after:
```typescript
const traefikUrl  = process.env.TRAEFIK_EXTERNAL_URL ?? '';
const mailUrl     = process.env.MAIL_EXTERNAL_URL ?? '';
```

Find the Traefik link in `adminLinks`:
```typescript
  ...(traefikUrl  ? [{ href: traefikUrl,        label: 'Traefik',    icon: '🛣️' }] : []),
```
Add the Mailpit link after it:
```typescript
  ...(traefikUrl  ? [{ href: traefikUrl,        label: 'Traefik',    icon: '🛣️' }] : []),
  ...(mailUrl     ? [{ href: mailUrl,            label: 'Mailpit',    icon: '✉️' }] : []),
```

- [ ] **Step 4: Commit**

```bash
git add k3d/website.yaml Taskfile.yml website/src/pages/admin.astro
git commit -m "feat(mailpit): add Mailpit admin tile + MAIL_EXTERNAL_URL to website ConfigMap"
```

---

## Task 10: Docs content cleanup

**Files:**
- Modify: `k3d/docs-content/security.md`
- Modify: `k3d/docs-content/architecture.md`
- Modify: `k3d/docs-content/security-report.md`

- [ ] **Step 1: Update `k3d/docs-content/security.md`**

Find the `basic-auth-internal` row in the middlewares table (around line 55):
```markdown
| `basic-auth-internal` | Mailpit, MCP-Status | HTTP Basic Auth |
```
Delete that row entirely.

Find the paragraph around line 108 that says:
```markdown
- **Mailpit** (`mail.*`) und **MCP-Status** (`ai.*`): HTTP Basic Auth über `basic-auth-internal`-Middleware (Secret `traefik-basic-auth`)
```
Replace with:
```markdown
- **Mailpit** (`mail.*`): Keycloak OIDC über `oauth2-proxy-mailpit` (ForwardAuth), Zugang auf Admin-E-Mail-Adressen beschränkt
```

- [ ] **Step 2: Update `k3d/docs-content/architecture.md`**

Find (around line 250):
```markdown
- **`basic-auth-internal`** -- HTTP Basic Auth fuer interne Dienste (Secret `traefik-basic-auth`)
```
Delete that line entirely.

- [ ] **Step 3: Update `k3d/docs-content/security-report.md`**

Find (around line 71) the paragraph that says Mailpit and MCP-Status are protected by basic-auth. Replace with:
```markdown
Mailpit ist über OIDC (Keycloak + oauth2-proxy-mailpit) geschützt. Nur admin-gelistete E-Mail-Adressen erhalten Zugang. Das frühere HTTP Basic Auth (`basic-auth-internal`) wurde vollständig entfernt.
```

- [ ] **Step 4: Commit**

```bash
git add k3d/docs-content/security.md k3d/docs-content/architecture.md k3d/docs-content/security-report.md
git commit -m "docs: update security/architecture/report docs — Mailpit OIDC, basic-auth retired"
```

---

## Task 11: Final validation

- [ ] **Step 1: Full manifest validation**

```bash
task workspace:validate
```
Expected: exits 0 with no kubeconform errors.

- [ ] **Step 2: Schema validation for all envs**

```bash
task env:validate:all
```
Expected: all three envs (dev, mentolder, korczewski) pass.

- [ ] **Step 3: Final basic-auth grep (should be zero hits outside docs)**

```bash
grep -rn "basic-auth-internal\|traefik-basic-auth" k3d/ prod/ prod-mentolder/ prod-korczewski/ \
  --include="*.yaml" --include="*.json" --include="*.sh" \
  | grep -v "k3d/docs-content"
```
Expected: zero output.

- [ ] **Step 4: YAML lint check (CI parity)**

```bash
yamllint -d '{extends: relaxed, rules: {line-length: {max: 200}}}' \
  k3d/oauth2-proxy-mailpit.yaml \
  k3d/mail-ingressroute-dev.yaml \
  prod/patch-oauth2-proxy-mailpit.yaml \
  prod/mail-ingressroute.yaml
```
Expected: no errors.

- [ ] **Step 5: Push and create PR**

```bash
git push -u origin feat/mailpit-oidc
gh pr create \
  --title "feat(mailpit): OIDC-protect Mailpit + retire traefik-basic-auth" \
  --body "$(cat <<'EOF'
## Summary
- New \`oauth2-proxy-mailpit\` Deployment + Keycloak client \`mailpit-admin\` replaces htpasswd basic-auth for \`mail.<domain>\`
- Access restricted to \`patrick@korczewski.de\` and \`quamain@web.de\` (same list as Traefik dashboard)
- \`traefik-basic-auth\` Secret + \`basic-auth-internal\` middleware deleted wholesale; \`TRAEFIK_BASIC_AUTH_USERS\` removed from sealed secrets
- Mailpit admin tile added to website admin panel
- Mirrors pattern from commit \`08e2a6c\` (Traefik dashboard OIDC)

## Test plan
- [ ] Browse \`https://mail.mentolder.de/\` → redirects to Keycloak login
- [ ] Sign in as \`patrick@korczewski.de\` → Mailpit UI loads
- [ ] Sign in as non-admin Keycloak user → 403 from oauth2-proxy
- [ ] Verify admin panel at \`https://web.mentolder.de/admin\` shows Mailpit tile
- [ ] \`task workspace:validate\` passes
- [ ] \`task env:validate:all\` passes

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
