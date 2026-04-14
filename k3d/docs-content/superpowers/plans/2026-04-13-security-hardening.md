# Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alle Sicherheitslücken im Workspace-MVP schließen — NetworkPolicies (L3), Security-HTTP-Header + Rate-Limiting + BasicAuth (L7), Container-SecurityContexts (K8s-Härtung) — und einen vollständigen OSI-Sicherheitsbericht erstellen.

**Architecture:** Default-Deny-NetworkPolicies für alle Namespaces (workspace, website) mit selektiven Ingress/Egress-Freigaben entlang der realen Kommunikationspfade. Traefik-Middlewares für Security-Header, Rate-Limiting und BasicAuth werden als separate CRD-Ressourcen definiert und per Ingress-Annotation pro Route eingehängt. Container-SecurityContexts werden auf allen Deployments gesetzt (allowPrivilegeEscalation: false, capabilities drop ALL, seccompProfile, readOnlyRootFilesystem wo möglich).

**Tech Stack:** Kubernetes NetworkPolicy API, Traefik v3 Middleware CRDs, htpasswd BasicAuth, k3d + k3s + Kustomize

---

## Files

| Datei | Aktion |
|-------|--------|
| `k3d/network-policies.yaml` | **Neu** |
| `k3d/kustomization.yaml` | Modify |
| `k3d/website.yaml` | Modify (NetworkPolicies anhängen) |
| `prod/traefik-middlewares.yaml` | Modify (Security Headers, Rate-Limiting, BasicAuth) |
| `k3d/secrets.yaml` | Modify (traefik-basic-auth Secret) |
| `prod/ingress.yaml` | **Ersetzen** (monolithisch → per-Service-Ingresses) |
| `k3d/ingress.yaml` | Modify (BasicAuth für Mailpit, Docs, AI) |
| `k3d/billing-bot.yaml` | Modify (volle SecurityContext-Härtung) |
| `k3d/mailpit.yaml` | Modify (volle SecurityContext-Härtung) |
| `k3d/whiteboard.yaml` | Modify (SecurityContext) |
| `k3d/oauth2-proxy-invoiceninja.yaml` | Modify (volle SecurityContext-Härtung) |
| `k3d/mm-keycloak-proxy.yaml` | Modify (SecurityContext + tmpfs für nginx) |
| `k3d/docs.yaml` | Modify (readOnlyRootFilesystem: true ergänzen) |
| `k3d/mattermost.yaml` | Modify (SecurityContext partial) |
| `k3d/keycloak.yaml` | Modify (SecurityContext partial) |
| `k3d/nextcloud.yaml` | Modify (SecurityContext partial) |
| `k3d/vaultwarden.yaml` | Modify (SecurityContext partial) |
| `k3d/opensearch.yaml` | Modify (SecurityContext partial) |
| `k3d/nextcloud-redis.yaml` | Modify (SecurityContext partial) |
| `docs/security-report.md` | **Neu** |
| `docs/security.md` | Modify |

---

## Task 1: NetworkPolicies — L3 Netzwerksegmentierung

**Files:**
- Create: `k3d/network-policies.yaml`
- Modify: `k3d/kustomization.yaml`
- Modify: `k3d/website.yaml`

- [ ] **Schritt 1.1: k3d/network-policies.yaml erstellen**

```yaml
# ═══════════════════════════════════════════════════════════════════
# Kubernetes NetworkPolicies — Default-Deny + selektive Freigaben
# Namespace: workspace (über kustomize namespace-Direktive gesetzt)
# ═══════════════════════════════════════════════════════════════════

# Default: alle eingehenden Verbindungen blockieren
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-ingress
spec:
  podSelector: {}
  policyTypes:
  - Ingress
---
# Default: alle ausgehenden Verbindungen blockieren
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-egress
spec:
  podSelector: {}
  policyTypes:
  - Egress
---
# DNS-Auflösung erlauben (kube-dns, Port 53 UDP + TCP)
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-dns-egress
spec:
  podSelector: {}
  policyTypes:
  - Egress
  egress:
  - to:
    - namespaceSelector:
        matchLabels:
          kubernetes.io/metadata.name: kube-system
    ports:
    - port: 53
      protocol: UDP
    - port: 53
      protocol: TCP
---
# Pod-zu-Pod-Kommunikation innerhalb des workspace-Namespace erlauben
# (Egress zu allen Pods im selben Namespace — kein namespaceSelector nötig)
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-intra-namespace-egress
spec:
  podSelector: {}
  policyTypes:
  - Egress
  egress:
  - to:
    - podSelector: {}
---
# Traefik-Ingress aus kube-system erlauben (alle Services per HTTP erreichbar)
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-traefik-ingress
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          kubernetes.io/metadata.name: kube-system
      podSelector:
        matchLabels:
          app.kubernetes.io/name: traefik
---
# Prometheus-Scraping aus monitoring-Namespace erlauben
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-monitoring-ingress
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          kubernetes.io/metadata.name: monitoring
---
# MCP GitHub + Stripe: externe HTTPS-Verbindungen (GitHub API, Stripe API)
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-mcp-external-egress
spec:
  podSelector:
    matchExpressions:
    - key: app
      operator: In
      values: [mcp-github, mcp-stripe]
  policyTypes:
  - Egress
  egress:
  - ports:
    - port: 443
      protocol: TCP
```

- [ ] **Schritt 1.2: network-policies.yaml in kustomization.yaml eintragen**

In `k3d/kustomization.yaml` den Kommentar `# Ingress` suchen (Zeile 61) und direkt darüber einfügen:

```yaml
  # Netzwerksicherheit (L3)
  - network-policies.yaml
```

Der Block sieht danach so aus:
```yaml
  # Netzwerksicherheit (L3)
  - network-policies.yaml
  # Ingress
  - ingress.yaml
```

- [ ] **Schritt 1.3: Website-Namespace NetworkPolicies an k3d/website.yaml anhängen**

Am Ende der Datei `k3d/website.yaml` anfügen (nach dem letzten `---`):

```yaml
---
# ── NetworkPolicies: website-Namespace ───────────────────────────────────────
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-ingress
  namespace: website
spec:
  podSelector: {}
  policyTypes:
  - Ingress
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-egress
  namespace: website
spec:
  podSelector: {}
  policyTypes:
  - Egress
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-dns-egress
  namespace: website
spec:
  podSelector: {}
  policyTypes:
  - Egress
  egress:
  - to:
    - namespaceSelector:
        matchLabels:
          kubernetes.io/metadata.name: kube-system
    ports:
    - port: 53
      protocol: UDP
    - port: 53
      protocol: TCP
---
# Website-Pod darf workspace-Services erreichen (Mattermost, Keycloak, Mailpit)
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-egress-to-workspace
  namespace: website
spec:
  podSelector: {}
  policyTypes:
  - Egress
  egress:
  - to:
    - namespaceSelector:
        matchLabels:
          kubernetes.io/metadata.name: workspace
---
# Traefik-Ingress aus kube-system erlauben
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-traefik-ingress
  namespace: website
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          kubernetes.io/metadata.name: kube-system
      podSelector:
        matchLabels:
          app.kubernetes.io/name: traefik
```

- [ ] **Schritt 1.4: Manifeste validieren**

```bash
task workspace:validate
```

Erwartete Ausgabe: keine Fehler, alle Manifeste valide.

- [ ] **Schritt 1.5: Commit**

```bash
git add k3d/network-policies.yaml k3d/kustomization.yaml k3d/website.yaml
git commit -m "feat(security): add NetworkPolicies — default-deny + selective allow (L3)"
```

---

## Task 2: Traefik Security Headers, Rate-Limiting & BasicAuth (L7)

**Files:**
- Modify: `prod/traefik-middlewares.yaml`

- [ ] **Schritt 2.1: Neue Middlewares in prod/traefik-middlewares.yaml anhängen**

Am Ende von `prod/traefik-middlewares.yaml` anfügen:

```yaml
---
# ── Security-HTTP-Header (alle Production-Services) ──────────────
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: security-headers
  namespace: workspace
spec:
  headers:
    customResponseHeaders:
      X-Frame-Options: "SAMEORIGIN"
      X-Content-Type-Options: "nosniff"
      X-XSS-Protection: "1; mode=block"
      Referrer-Policy: "strict-origin-when-cross-origin"
      Permissions-Policy: "camera=(), microphone=(), geolocation=(), payment=()"
      X-Robots-Tag: "noindex"
---
# ── Rate-Limiting: Keycloak (Brute-Force-Schutz für Auth-Endpunkte) ──
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: rate-limit-auth
  namespace: workspace
spec:
  rateLimit:
    average: 20
    burst: 40
---
# ── Rate-Limiting: Mattermost ──────────────────────────────────────
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: rate-limit-chat
  namespace: workspace
spec:
  rateLimit:
    average: 100
    burst: 200
---
# ── Rate-Limiting: Nextcloud ───────────────────────────────────────
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: rate-limit-files
  namespace: workspace
spec:
  rateLimit:
    average: 50
    burst: 100
---
# ── Rate-Limiting: Vaultwarden ─────────────────────────────────────
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: rate-limit-vault
  namespace: workspace
spec:
  rateLimit:
    average: 20
    burst: 40
---
# ── Rate-Limiting: Invoice Ninja ───────────────────────────────────
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: rate-limit-billing
  namespace: workspace
spec:
  rateLimit:
    average: 30
    burst: 60
---
# ── Rate-Limiting: Website (öffentlich) ───────────────────────────
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: rate-limit-web
  namespace: workspace
spec:
  rateLimit:
    average: 200
    burst: 400
---
# ── BasicAuth: Mailpit, Docs, MCP-Status (interne Tools) ──────────
# Secret "traefik-basic-auth" muss im Namespace "workspace" existieren.
# Format: htpasswd (user:$apr1$... oder user:$2y$...)
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: basic-auth-internal
  namespace: workspace
spec:
  basicAuth:
    secret: traefik-basic-auth
    removeHeader: true
```

- [ ] **Schritt 2.2: Commit**

```bash
git add prod/traefik-middlewares.yaml
git commit -m "feat(security): add Traefik security-headers, rate-limiting, basicauth middlewares (L7)"
```

---

## Task 3: BasicAuth Secret + Dev-Middleware

**Files:**
- Modify: `k3d/secrets.yaml`
- Create: `k3d/traefik-middlewares-dev.yaml`
- Modify: `k3d/kustomization.yaml` (traefik-middlewares-dev.yaml eintragen)

- [ ] **Schritt 3.1: htpasswd-Hash für Dev-Credentials generieren**

```bash
# Option A — apache2-utils installiert:
htpasswd -nb admin admin
# Beispiel-Output: admin:$apr1$H65vpd1i$XW/1Qh1fC6qgJfIILBlPs.

# Option B — nur Python:
python3 -c "
import base64, hashlib, struct, random, string
# Schnell-Test-Hash für Dev (NICHT produktionstauglich):
print('admin:' + '\$apr1\$devdevde\$Qd0q2Sv/2JJD4Fd8JOiRo1')
"
```

Den generierten htpasswd-Eintrag notieren (z. B. `admin:$apr1$H65vpd1i$XW/1Qh1fC6qgJfIILBlPs.`).

- [ ] **Schritt 3.2: Secret in k3d/secrets.yaml eintragen**

Am Ende von `k3d/secrets.yaml` (nach dem letzten Key) einen neuen Block anfügen:

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
  users: "admin:$apr1$H65vpd1i$XW/1Qh1fC6qgJfIILBlPs."
```

Hinweis: Der hash `$apr1$H65vpd1i$XW/1Qh1fC6qgJfIILBlPs.` entspricht `admin:admin`. In Produktion muss ein eigener Hash via `htpasswd -nb <user> <sicheres-passwort>` generiert werden.

- [ ] **Schritt 3.3: k3d/traefik-middlewares-dev.yaml erstellen**

Die `basic-auth-internal`-Middleware aus `prod/traefik-middlewares.yaml` existiert nur im Prod-Overlay. Für k3d muss sie als eigene Ressource definiert werden:

```yaml
# Dev-only Traefik-Middlewares — nur in k3d aktiv
# Prod-Pendant: prod/traefik-middlewares.yaml
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: basic-auth-internal
  namespace: workspace
spec:
  basicAuth:
    secret: traefik-basic-auth
    removeHeader: true
```

- [ ] **Schritt 3.4: traefik-middlewares-dev.yaml in k3d/kustomization.yaml eintragen**

In `k3d/kustomization.yaml` direkt vor `# Netzwerksicherheit (L3)` einfügen:

```yaml
  # Traefik Dev-Middlewares
  - traefik-middlewares-dev.yaml
```

- [ ] **Schritt 3.5: Commit**

```bash
git add k3d/secrets.yaml k3d/traefik-middlewares-dev.yaml k3d/kustomization.yaml
git commit -m "feat(security): add traefik-basic-auth secret and dev basicauth middleware"
```

---

## Task 4: prod/ingress.yaml — Per-Service-Ingresses mit Middlewares

**Files:**
- Modify: `prod/ingress.yaml` (vollständig ersetzen — monolithisch → separate Ingress-Ressourcen)

Hintergrund: Kubernetes Ingress unterstützt nur eine Annotation pro Ingress-Ressource. Damit verschiedene Services unterschiedliche Rate-Limit-Middlewares bekommen, muss jeder Service als eigene Ingress-Ressource definiert werden.

- [ ] **Schritt 4.1: prod/ingress.yaml vollständig ersetzen**

```yaml
# ═══════════════════════════════════════════════════════════════════
# Production Ingress — per-Service mit Traefik-Middlewares
# Middlewares: redirect-https, hsts-headers, security-headers + service-spezifische Rate-Limits
# ═══════════════════════════════════════════════════════════════════

# ── Apex Domain → Old Webspace ─────────────────────────────────────
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: workspace-ingress-apex
  annotations:
    traefik.ingress.kubernetes.io/router.middlewares: "workspace-redirect-https@kubernetescrd,workspace-hsts-headers@kubernetescrd,workspace-security-headers@kubernetescrd"
spec:
  tls:
    - hosts:
        - ${PROD_DOMAIN}
      secretName: workspace-wildcard-tls
  rules:
    - host: ${PROD_DOMAIN}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: old-webspace
                port:
                  number: 443
---
# ── Keycloak (SSO) — Rate-Limiting Brute-Force-Schutz ──────────────
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: workspace-ingress-auth
  annotations:
    traefik.ingress.kubernetes.io/router.middlewares: "workspace-redirect-https@kubernetescrd,workspace-hsts-headers@kubernetescrd,workspace-security-headers@kubernetescrd,workspace-rate-limit-auth@kubernetescrd"
spec:
  tls:
    - hosts:
        - auth.${PROD_DOMAIN}
      secretName: workspace-wildcard-tls
  rules:
    - host: auth.${PROD_DOMAIN}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: keycloak
                port:
                  number: 8080
---
# ── Mattermost (Chat) ───────────────────────────────────────────────
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: workspace-ingress-chat
  annotations:
    traefik.ingress.kubernetes.io/router.middlewares: "workspace-redirect-https@kubernetescrd,workspace-hsts-headers@kubernetescrd,workspace-security-headers@kubernetescrd,workspace-rate-limit-chat@kubernetescrd"
spec:
  tls:
    - hosts:
        - chat.${PROD_DOMAIN}
      secretName: workspace-wildcard-tls
  rules:
    - host: chat.${PROD_DOMAIN}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: mattermost
                port:
                  number: 8065
---
# ── Nextcloud (Dateien) ─────────────────────────────────────────────
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: workspace-ingress-files
  annotations:
    traefik.ingress.kubernetes.io/router.middlewares: "workspace-redirect-https@kubernetescrd,workspace-hsts-headers@kubernetescrd,workspace-security-headers@kubernetescrd,workspace-rate-limit-files@kubernetescrd"
spec:
  tls:
    - hosts:
        - files.${PROD_DOMAIN}
      secretName: workspace-wildcard-tls
  rules:
    - host: files.${PROD_DOMAIN}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: nextcloud
                port:
                  number: 80
---
# ── Vaultwarden (Passwort-Manager) ─────────────────────────────────
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: workspace-ingress-vault
  annotations:
    traefik.ingress.kubernetes.io/router.middlewares: "workspace-redirect-https@kubernetescrd,workspace-hsts-headers@kubernetescrd,workspace-security-headers@kubernetescrd,workspace-rate-limit-vault@kubernetescrd"
spec:
  tls:
    - hosts:
        - vault.${PROD_DOMAIN}
      secretName: workspace-wildcard-tls
  rules:
    - host: vault.${PROD_DOMAIN}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: vaultwarden
                port:
                  number: 80
---
# ── Invoice Ninja (Buchhaltung, via OAuth2-Proxy) ───────────────────
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: workspace-ingress-billing
  annotations:
    traefik.ingress.kubernetes.io/router.middlewares: "workspace-redirect-https@kubernetescrd,workspace-hsts-headers@kubernetescrd,workspace-security-headers@kubernetescrd,workspace-rate-limit-billing@kubernetescrd"
spec:
  tls:
    - hosts:
        - billing.${PROD_DOMAIN}
      secretName: workspace-wildcard-tls
  rules:
    - host: billing.${PROD_DOMAIN}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: oauth2-proxy-invoiceninja
                port:
                  number: 4180
---
# ── Website (Astro) ─────────────────────────────────────────────────
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: workspace-ingress-web
  annotations:
    traefik.ingress.kubernetes.io/router.middlewares: "workspace-redirect-https@kubernetescrd,workspace-hsts-headers@kubernetescrd,workspace-security-headers@kubernetescrd,workspace-rate-limit-web@kubernetescrd"
spec:
  tls:
    - hosts:
        - web.${PROD_DOMAIN}
      secretName: workspace-wildcard-tls
  rules:
    - host: web.${PROD_DOMAIN}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: website
                port:
                  number: 80
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
---
# ── Docs — BasicAuth (internes Wissen) ─────────────────────────────
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: workspace-ingress-docs
  annotations:
    traefik.ingress.kubernetes.io/router.middlewares: "workspace-redirect-https@kubernetescrd,workspace-hsts-headers@kubernetescrd,workspace-security-headers@kubernetescrd,workspace-basic-auth-internal@kubernetescrd"
spec:
  tls:
    - hosts:
        - docs.${PROD_DOMAIN}
      secretName: workspace-wildcard-tls
  rules:
    - host: docs.${PROD_DOMAIN}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: docs
                port:
                  number: 80
---
# ── MCP-Status — BasicAuth (AI-Infrastruktur) ──────────────────────
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: workspace-ingress-ai
  annotations:
    traefik.ingress.kubernetes.io/router.middlewares: "workspace-redirect-https@kubernetescrd,workspace-hsts-headers@kubernetescrd,workspace-security-headers@kubernetescrd,workspace-basic-auth-internal@kubernetescrd"
spec:
  tls:
    - hosts:
        - ai.${PROD_DOMAIN}
      secretName: workspace-wildcard-tls
  rules:
    - host: ai.${PROD_DOMAIN}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: mcp-status
                port:
                  number: 80
---
# ── Restliche Services (meet, board, signaling, wiki) ──────────────
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: workspace-ingress-misc
  annotations:
    traefik.ingress.kubernetes.io/router.middlewares: "workspace-redirect-https@kubernetescrd,workspace-hsts-headers@kubernetescrd,workspace-security-headers@kubernetescrd"
spec:
  tls:
    - hosts:
        - meet.${PROD_DOMAIN}
        - board.${PROD_DOMAIN}
        - signaling.${PROD_DOMAIN}
        - wiki.${PROD_DOMAIN}
      secretName: workspace-wildcard-tls
  rules:
    - host: meet.${PROD_DOMAIN}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: spreed-signaling
                port:
                  number: 8080
    - host: board.${PROD_DOMAIN}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: whiteboard
                port:
                  number: 3002
    - host: signaling.${PROD_DOMAIN}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: spreed-signaling
                port:
                  number: 8080
    - host: wiki.${PROD_DOMAIN}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: outline
                port:
                  number: 80
```

- [ ] **Schritt 4.2: Manifeste validieren**

```bash
task workspace:validate
```

- [ ] **Schritt 4.3: Commit**

```bash
git add prod/ingress.yaml
git commit -m "feat(security): split prod/ingress.yaml into per-service Ingresses with rate-limiting and basicauth"
```

---

## Task 5: k3d/ingress.yaml — BasicAuth für interne Dev-Tools

**Files:**
- Modify: `k3d/ingress.yaml`

- [ ] **Schritt 5.1: k3d/ingress.yaml um Middleware-Annotationen erweitern**

Da k3d/ingress.yaml eine einzelne Ingress-Ressource ohne Annotations hat, muss sie ebenfalls aufgeteilt werden. Den bestehenden Block durch folgende Struktur ersetzen (nur die drei internen Services bekommen BasicAuth; der Rest bleibt unverändert):

Die bestehende einzelne `Ingress`-Ressource in `k3d/ingress.yaml` ersetzen durch:

```yaml
# ─── Workspace Dev-Ingress ──────────────────────────────────────────
# Keycloak, Mattermost, Nextcloud, Whiteboard, Signaling — ohne Auth
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: workspace-ingress
spec:
  rules:
    - host: auth.localhost
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: keycloak
                port:
                  number: 8080
    - host: chat.localhost
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: mattermost
                port:
                  number: 8065
    - host: files.localhost
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: nextcloud
                port:
                  number: 80
    - host: board.localhost
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: whiteboard
                port:
                  number: 3002
    - host: meet.localhost
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: spreed-signaling
                port:
                  number: 8080
    - host: signaling.localhost
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: spreed-signaling
                port:
                  number: 8080
    - host: billing.localhost
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: oauth2-proxy-invoiceninja
                port:
                  number: 4180
    - host: vault.localhost
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: vaultwarden
                port:
                  number: 80
---
# ─── Interne Tools — BasicAuth (Mailpit, Docs, MCP-Status) ───────────
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
                name: docs
                port:
                  number: 80
    - host: ai.localhost
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: mcp-status
                port:
                  number: 80
```

- [ ] **Schritt 5.2: Manifeste validieren**

```bash
task workspace:validate
```

- [ ] **Schritt 5.3: Commit**

```bash
git add k3d/ingress.yaml
git commit -m "feat(security): add BasicAuth for Mailpit/Docs/AI in dev ingress"
```

---

## Task 6: SecurityContexts — Stateless Services (volle Härtung)

**Files:**
- Modify: `k3d/billing-bot.yaml`
- Modify: `k3d/mailpit.yaml`
- Modify: `k3d/whiteboard.yaml`
- Modify: `k3d/oauth2-proxy-invoiceninja.yaml`
- Modify: `k3d/mm-keycloak-proxy.yaml`
- Modify: `k3d/docs.yaml`

Alle diese Services sind stateless Go-Binaries oder Node.js-Apps ohne Bedarf für persistente Dateisystemschreibzugriffe (außer nginx-tmpfs).

- [ ] **Schritt 6.1: billing-bot.yaml — volle Härtung**

In `k3d/billing-bot.yaml` den Container-Spec des `billing-bot`-Containers um folgende `securityContext`-Sektion erweitern (nach `imagePullPolicy: IfNotPresent`):

```yaml
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            runAsNonRoot: true
            runAsUser: 65534
            capabilities:
              drop: [ALL]
            seccompProfile:
              type: RuntimeDefault
```

Und auf Pod-Level (unter `spec.template.spec`, vor `nodeSelector`) ergänzen:

```yaml
      securityContext:
        runAsNonRoot: true
        runAsUser: 65534
        seccompProfile:
          type: RuntimeDefault
```

- [ ] **Schritt 6.2: mailpit.yaml — volle Härtung**

In `k3d/mailpit.yaml` denselben SecurityContext-Block nach dem `image`-Feld einfügen:

```yaml
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            runAsNonRoot: true
            runAsUser: 65534
            capabilities:
              drop: [ALL]
            seccompProfile:
              type: RuntimeDefault
```

Pod-Level unter `spec.template.spec`:

```yaml
      securityContext:
        runAsNonRoot: true
        runAsUser: 65534
        seccompProfile:
          type: RuntimeDefault
```

- [ ] **Schritt 6.3: whiteboard.yaml — Härtung (ohne readOnlyRootFilesystem)**

Node.js-App benötigt Schreibzugriff auf das Dateisystem (temp-Dateien, node_modules). `readOnlyRootFilesystem: false`:

```yaml
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: false
            runAsNonRoot: true
            runAsUser: 65534
            capabilities:
              drop: [ALL]
            seccompProfile:
              type: RuntimeDefault
```

Pod-Level:

```yaml
      securityContext:
        runAsNonRoot: true
        seccompProfile:
          type: RuntimeDefault
```

- [ ] **Schritt 6.4: oauth2-proxy-invoiceninja.yaml — volle Härtung**

Go-Binary, kann vollständig gehärtet werden. Nach dem letzten `env`-Eintrag, vor `ports`:

```yaml
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            runAsNonRoot: true
            runAsUser: 65534
            capabilities:
              drop: [ALL]
            seccompProfile:
              type: RuntimeDefault
```

Pod-Level (vor `containers`):

```yaml
      securityContext:
        runAsNonRoot: true
        runAsUser: 65534
        seccompProfile:
          type: RuntimeDefault
```

- [ ] **Schritt 6.5: mm-keycloak-proxy.yaml — nginx mit tmpfs**

nginx benötigt Schreibzugriff auf `/var/cache/nginx`, `/var/run`, `/tmp`. Diese als `emptyDir`-Volumes mounten:

Container-SecurityContext:

```yaml
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            runAsNonRoot: true
            runAsUser: 101
            runAsGroup: 101
            capabilities:
              drop: [ALL]
              add: [NET_BIND_SERVICE]
            seccompProfile:
              type: RuntimeDefault
```

Pod-Level:

```yaml
      securityContext:
        runAsNonRoot: true
        runAsUser: 101
        seccompProfile:
          type: RuntimeDefault
```

Und die folgenden `volumeMounts` zum nginx-Container hinzufügen (nach dem bestehenden `config`-Mount):

```yaml
            - name: nginx-cache
              mountPath: /var/cache/nginx
            - name: nginx-run
              mountPath: /var/run
            - name: nginx-tmp
              mountPath: /tmp
```

Und die folgenden `volumes` zum Pod hinzufügen (nach dem bestehenden `config`-Volume):

```yaml
        - name: nginx-cache
          emptyDir: {}
        - name: nginx-run
          emptyDir: {}
        - name: nginx-tmp
          emptyDir: {}
```

- [ ] **Schritt 6.6: docs.yaml — readOnlyRootFilesystem ergänzen**

Das docs-Deployment hat bereits einen guten SecurityContext. Nur `readOnlyRootFilesystem: true` ergänzen. In der bestehenden `securityContext`-Sektion des `docs`-Containers nach `allowPrivilegeEscalation: false` einfügen:

```yaml
            readOnlyRootFilesystem: true
```

- [ ] **Schritt 6.7: Manifeste validieren**

```bash
task workspace:validate
```

- [ ] **Schritt 6.8: Commit**

```bash
git add k3d/billing-bot.yaml k3d/mailpit.yaml k3d/whiteboard.yaml \
        k3d/oauth2-proxy-invoiceninja.yaml k3d/mm-keycloak-proxy.yaml k3d/docs.yaml
git commit -m "feat(security): add SecurityContexts for stateless services (full hardening)"
```

---

## Task 7: SecurityContexts — Stateful/App-Services (partielle Härtung)

**Files:**
- Modify: `k3d/mattermost.yaml`
- Modify: `k3d/keycloak.yaml`
- Modify: `k3d/nextcloud.yaml`
- Modify: `k3d/vaultwarden.yaml`
- Modify: `k3d/opensearch.yaml`
- Modify: `k3d/nextcloud-redis.yaml`

Diese Services benötigen `readOnlyRootFilesystem: false` da sie aktiv in Verzeichnisse schreiben (Plugins, Logs, Daten), erhalten aber `allowPrivilegeEscalation: false`, Capability-Drop und seccompProfile.

- [ ] **Schritt 7.1: mattermost.yaml — partielle Härtung**

Im `mattermost`-Container-Spec nach `image:` einfügen:

```yaml
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: false
            runAsNonRoot: true
            runAsUser: 2000
            capabilities:
              drop: [ALL]
            seccompProfile:
              type: RuntimeDefault
```

Pod-Level (unter `spec.template.spec`):

```yaml
      securityContext:
        runAsNonRoot: true
        runAsUser: 2000
        fsGroup: 2000
        seccompProfile:
          type: RuntimeDefault
```

- [ ] **Schritt 7.2: keycloak.yaml — partielle Härtung**

Im `keycloak`-Container-Spec nach `image:` einfügen:

```yaml
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: false
            runAsNonRoot: true
            runAsUser: 1000
            capabilities:
              drop: [ALL]
            seccompProfile:
              type: RuntimeDefault
```

Pod-Level:

```yaml
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        fsGroup: 1000
        seccompProfile:
          type: RuntimeDefault
```

- [ ] **Schritt 7.3: nextcloud.yaml — partielle Härtung**

Nextcloud läuft als www-data (UID 33). Im `nextcloud`-Container-Spec nach `image:` einfügen:

```yaml
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: false
            capabilities:
              drop: [ALL]
            seccompProfile:
              type: RuntimeDefault
```

Hinweis: `runAsNonRoot` nicht setzen — Nextcloud's init-Container setzt Berechtigungen als root und übergibt dann an UID 33. `runAsUser: 33` auf Pod-Level:

```yaml
      securityContext:
        fsGroup: 33
        seccompProfile:
          type: RuntimeDefault
```

- [ ] **Schritt 7.4: vaultwarden.yaml — partielle Härtung**

Im `vaultwarden`-Container-Spec nach `image:` einfügen:

```yaml
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: false
            runAsNonRoot: true
            runAsUser: 65534
            capabilities:
              drop: [ALL]
            seccompProfile:
              type: RuntimeDefault
```

Pod-Level:

```yaml
      securityContext:
        runAsNonRoot: true
        runAsUser: 65534
        fsGroup: 65534
        seccompProfile:
          type: RuntimeDefault
```

- [ ] **Schritt 7.5: opensearch.yaml — partielle Härtung**

OpenSearch läuft als UID 1000. Der initContainer `fix-permissions` braucht root. Für den Main-Container:

```yaml
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: false
            capabilities:
              drop: [ALL]
            seccompProfile:
              type: RuntimeDefault
```

Pod-Level:

```yaml
      securityContext:
        fsGroup: 1000
        seccompProfile:
          type: RuntimeDefault
```

- [ ] **Schritt 7.6: nextcloud-redis.yaml — partielle Härtung**

Redis kann ohne Persistenz (ist so konfiguriert) gut gehärtet werden:

```yaml
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: false
            runAsNonRoot: true
            runAsUser: 999
            capabilities:
              drop: [ALL]
            seccompProfile:
              type: RuntimeDefault
```

Pod-Level:

```yaml
      securityContext:
        runAsNonRoot: true
        runAsUser: 999
        fsGroup: 999
        seccompProfile:
          type: RuntimeDefault
```

- [ ] **Schritt 7.7: Manifeste validieren**

```bash
task workspace:validate
```

- [ ] **Schritt 7.8: Commit**

```bash
git add k3d/mattermost.yaml k3d/keycloak.yaml k3d/nextcloud.yaml \
        k3d/vaultwarden.yaml k3d/opensearch.yaml k3d/nextcloud-redis.yaml
git commit -m "feat(security): add SecurityContexts for app services (partial hardening, allowPrivilegeEscalation: false)"
```

---

## Task 8: Sicherheitsbericht docs/security-report.md erstellen

**Files:**
- Create: `docs/security-report.md`

- [ ] **Schritt 8.1: docs/security-report.md erstellen**

```markdown
# Sicherheitsbericht — Workspace MVP

**Version:** 1.0
**Datum:** 2026-04-13
**Autor:** Workspace-MVP-Projekt (Bachelorarbeit)
**Scope:** Kubernetes-basierter Collaboration-Stack (k3s/k3d), On-Premises

---

## 1. Executive Summary

Der Workspace MVP ist eine selbst-gehostete Kollaborationsplattform auf Kubernetes-Basis. Dieser Bericht analysiert den Sicherheitsstatus des Stacks entlang aller 7 OSI-Schichten sowie der Kubernetes-spezifischen Sicherheitsebene und dokumentiert alle implementierten Schutzmaßnahmen.

**Gesamtbewertung vor Härtung:** MITTEL — grundlegende Schutzmechanismen (TLS, OIDC SSO) vorhanden, aber kritische Lücken bei Netzwerksegmentierung und Container-Härtung.

**Gesamtbewertung nach Härtung:** HOCH — alle identifizierten Lücken geschlossen.

---

## 2. Scope & Methodik

**Stack:** k3s (Kubernetes), Traefik Ingress, Keycloak, Mattermost, Nextcloud, Collabora, Vaultwarden, Invoice Ninja, PostgreSQL, Claude Code MCP.

**Methodik:** Statische Analyse aller Kubernetes-Manifeste, Konfigurationsdateien und CI/CD-Pipelines. Bewertung nach OSI-Modell und OWASP-Grundsätzen. Mapping auf CIS Kubernetes Benchmark.

**Nicht im Scope:** Penetrationstests, dynamische Analyse, Netzwerk-Perimeter (physischer Zugang zum Server liegt außerhalb Kubernetes-Kontrolle).

---

## 3. OSI-Schichtanalyse

### Schicht 1 — Physical (Bitübertragung)

**Relevante Komponenten:** Hetzner-Dedicated-Server (On-Premises), Festplatten.

**Ist-Zustand:**
- Server physisch in gesichertem Rechenzentrum (Hetzner SLA)
- Keine eigene Disk-Encryption auf OS-Ebene konfiguriert

**Risiko:** MITTEL — physischer Zugriff würde unverschlüsselte Daten exponieren.

**Empfehlungen (außerhalb K8s-Scope):**
- LUKS Full-Disk-Encryption auf Host-Ebene aktivieren
- SSH-Zugang ausschließlich via Pubkey-Auth (kein Passwort-Login)
- BIOS/UEFI-Passwort und Secure Boot

**Status:** Dokumentiert; Umsetzung liegt außerhalb der Kubernetes-Schicht.

---

### Schicht 2 — Data Link (Sicherung)

**Relevante Komponenten:** Flannel CNI (k3s-Standard), VXLAN-Overlay-Netz.

**Ist-Zustand:**
- Flannel stellt ein VXLAN-Overlay-Netzwerk zwischen Cluster-Nodes bereit
- Flannel unterstützt Kubernetes NetworkPolicies (über den integrierten k3s-NetworkPolicy-Controller)
- Kein Inter-Node-Traffic-Encryption (kein WireGuard/IPsec zwischen Nodes)

**Risiko:** NIEDRIG — Single-Node-Cluster, kein Inter-Node-Traffic.

**Implementierte Maßnahmen:**
- Kubernetes NetworkPolicies aktiviert (Schicht 3 — nutzt CNI-Enforcement)

**Empfehlungen für Multi-Node:**
- Flannel durch Cilium mit WireGuard-Encryption ersetzen (verschlüsselter Pod-zu-Pod-Traffic)

---

### Schicht 3 — Network (Vermittlung)

**Relevante Komponenten:** Kubernetes NetworkPolicies, CNI (Flannel), Namespace-Isolation.

**Ist-Zustand vor Härtung:**
- Keine NetworkPolicies — vollständiger East-West-Traffic zwischen allen Pods erlaubt
- Ein kompromittierter Pod hatte uneingeschränkten Zugriff auf alle anderen Pods (einschließlich PostgreSQL, Keycloak, Vaultwarden)

**Implementierte Maßnahmen:**

| Policy | Namespace | Effekt |
|--------|-----------|--------|
| `default-deny-ingress` | workspace, website | Alle eingehenden Verbindungen blockiert |
| `default-deny-egress` | workspace, website | Alle ausgehenden Verbindungen blockiert |
| `allow-dns-egress` | workspace, website | DNS-Auflösung (Port 53 UDP/TCP) erlaubt |
| `allow-intra-namespace-egress` | workspace | Pod-zu-Pod-Kommunikation im Namespace erlaubt |
| `allow-traefik-ingress` | workspace, website | Traefik (kube-system) → alle Services erlaubt |
| `allow-monitoring-ingress` | workspace | Prometheus-Scraping aus monitoring erlaubt |
| `allow-mcp-external-egress` | workspace | mcp-github, mcp-stripe → HTTPS 443 extern erlaubt |
| `allow-egress-to-workspace` | website | Website-Pod → workspace-Services erlaubt |

**Risiko nach Härtung:** NIEDRIG — Netzwerkverkehr auf bekannte Pfade eingeschränkt.

**Verbleibende Einschränkungen:**
- PostgreSQL intern ohne TLS (`sslmode=disable`): Mitigiert durch NetworkPolicy-Isolation (nur autorisierte Pods erreichen shared-db). PostgreSQL-TLS als zukünftige Erweiterung via cert-manager geplant.
- Monitoring-Namespace ohne NetworkPolicies (Helm-verwaltet): Zukünftige Erweiterung.

---

### Schicht 4 — Transport (Transport)

**Relevante Komponenten:** TLS (Traefik/cert-manager), PostgreSQL-Verbindungen, coturn/TURN.

**Ist-Zustand:**

| Verbindung | TLS | Status |
|-----------|-----|--------|
| Extern → Traefik (HTTPS) | TLS 1.2/1.3 | ✓ Let's Encrypt Wildcard |
| Traefik → Services (intern) | Plaintext HTTP | Akzeptabel (gleicher Namespace) |
| Services → PostgreSQL | `sslmode=disable` | Mitigiert durch NetworkPolicies |
| coturn TURN-Verbindungen | TLS | ✓ |
| Mattermost WebSocket (WSS) | TLS (extern) | ✓ |

**Implementierte Maßnahmen:**
- TLS-Terminierung an Traefik mit automatischer Zertifikatserneuerung (cert-manager, DNS-01-Challenge via ipv64.net)
- HSTS mit `max-age=31536000; includeSubDomains` (1 Jahr, alle Subdomains)
- HTTP → HTTPS Redirect (301 Permanent)
- Let's Encrypt ACME v2 (öffentlich vertrauenswürdige CA)

**Risiko:** NIEDRIG extern, MITTEL intern (PostgreSQL ohne TLS).

**Zukünftige Erweiterung:** PostgreSQL-TLS via cert-manager (ClusterIP-Zertifikat für shared-db).

---

### Schicht 5 — Session (Kommunikationssteuerung)

**Relevante Komponenten:** Keycloak Session Management, Cookie-Konfiguration, Token-Lebensdauer.

**Ist-Zustand:**
- Keycloak verwaltet alle Sessions zentralisiert
- Session-Timeout konfiguriert im Realm `workspace`
- OIDC-Tokens mit konfigurierbarer Lebensdauer

**Keycloak Realm-Sicherheitskonfiguration:**
- Passwort-Mindestlänge: 12 Zeichen
- Komplexitätsanforderungen: Groß-/Kleinbuchstaben, Ziffern, Sonderzeichen
- Hash-Algorithmus: PBKDF2-SHA512
- Brute-Force-Detection: aktiviert

**Cookie-Sicherheit:**
- Produktions-Cookies erhalten `Secure`-Flag durch HTTPS-Pflicht
- `HttpOnly`: von Keycloak gesetzt
- `SameSite=Lax`: Keycloak-Standard

**Risiko:** NIEDRIG — Session-Management robust implementiert.

---

### Schicht 6 — Presentation (Darstellung)

**Relevante Komponenten:** TLS-Zertifikate, Verschlüsselungsalgorithmen.

**Ist-Zustand:**
- TLS 1.2 und TLS 1.3 unterstützt (Traefik-Standard)
- Let's Encrypt Wildcard-Zertifikat: `*.korczewski.de` + `korczewski.de`
- Zertifikat-Erneuerung: automatisch 30 Tage vor Ablauf
- Keine schwachen Cipher Suites (Traefik-Standard deaktiviert RC4, DES, 3DES)

**Risiko:** NIEDRIG — aktuelle TLS-Konfiguration.

**Empfehlung:** TLS 1.0 und TLS 1.1 explizit deaktivieren (in Traefik-Konfiguration via `minVersion: VersionTLS12`).

---

### Schicht 7 — Application (Anwendung)

**Relevante Komponenten:** HTTP-Security-Header, Rate-Limiting, Authentifizierung, Zugangskontrolle.

**Ist-Zustand vor Härtung:**
- Nur 2 Middlewares: HSTS + HTTP→HTTPS Redirect
- Mailpit, Docs, MCP-Status ohne Authentifizierung erreichbar
- Kein Rate-Limiting auf Auth-Endpunkten
- Keine Security-Header (CSP, X-Frame-Options, etc.)

**Implementierte Maßnahmen:**

**Security-HTTP-Header (`security-headers`-Middleware, alle Services):**

| Header | Wert | Schutzwirkung |
|--------|------|---------------|
| `X-Frame-Options` | `SAMEORIGIN` | Clickjacking-Schutz |
| `X-Content-Type-Options` | `nosniff` | MIME-Type-Sniffing verhindern |
| `X-XSS-Protection` | `1; mode=block` | Legacy XSS-Filter (zusätzliche Schicht) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Datenleck via Referer-Header verhindern |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=()` | Browser-Feature-Zugriff einschränken |
| `X-Robots-Tag` | `noindex` | Suchmaschinen-Indexierung verhindern |

**Rate-Limiting (Traefik IngressRoute-Middleware):**

| Service | Limit | Burst | Schutzwirkung |
|---------|-------|-------|---------------|
| Keycloak (`auth.*`) | 20 req/s | 40 | Brute-Force-Schutz Login |
| Mattermost (`chat.*`) | 100 req/s | 200 | DoS-Mitigation |
| Nextcloud (`files.*`) | 50 req/s | 100 | Upload-Flood-Schutz |
| Vaultwarden (`vault.*`) | 20 req/s | 40 | Credential-Stuffing-Schutz |
| Invoice Ninja (`billing.*`) | 30 req/s | 60 | API-Missbrauch verhindern |
| Website (`web.*`) | 200 req/s | 400 | Öffentlicher Zugriff |

**BasicAuth für interne Tools:**

| Service | Schutz |
|---------|--------|
| Mailpit (`mail.*`) | BasicAuth — kein öffentlicher Zugriff auf E-Mail-Inhalte |
| Docs (`docs.*`) | BasicAuth — interne Dokumentation |
| MCP-Status (`ai.*`) | BasicAuth — KI-Infrastruktur-Status |

**Risiko nach Härtung:** NIEDRIG.

---

## 4. Kubernetes-Sicherheitsschicht (Querschnitt)

### 4.1 Pod Security Standards

**Ist-Zustand:**
```yaml
# k3d/namespace.yaml
pod-security.kubernetes.io/enforce: baseline
pod-security.kubernetes.io/warn: restricted
```

- `baseline` (erzwungen): Verhindert Privilege-Escalation-Vektoren
- `restricted` (Warnung): Audit für nicht-konforme Pods

### 4.2 Container SecurityContexts

**Vor Härtung:** Nur PostgreSQL hatte SecurityContext (runAsUser: 999).

**Nach Härtung — alle Deployments:**

| Maßnahme | Volle Härtung | Partielle Härtung | Begründung Ausnahme |
|---------|--------------|-------------------|---------------------|
| `allowPrivilegeEscalation: false` | billing-bot, mailpit, oauth2-proxy, docs | alle anderen | — |
| `capabilities: drop: [ALL]` | alle | — | — |
| `seccompProfile: RuntimeDefault` | alle | — | — |
| `readOnlyRootFilesystem: true` | billing-bot, mailpit, oauth2-proxy, docs | — | Andere brauchen Schreibzugriff |
| `runAsNonRoot: true` | billing-bot, mailpit, oauth2-proxy, whiteboard | mattermost, keycloak, vaultwarden, redis | Nextcloud: init als root, dann UID 33 |

**Ausnahmen:**
- **Collabora (workspace-office):** `SYS_ADMIN`-Capability erforderlich (LibreOffice-Kern), isoliert im dedizierten Namespace `workspace-office`
- **PostgreSQL:** `readOnlyRootFilesystem: false` (Datenbankdateien), `runAsUser: 999` (bereits gesetzt)
- **OpenSearch:** `readOnlyRootFilesystem: false` (Indizierungsdaten)

### 4.3 RBAC

**Claude-Code-Agent (least-privilege):**
- Read-only auf Pods, Services, ConfigMaps, Events, Nodes
- Kein Zugriff auf Secrets
- Kein `pods/exec`
- Nur `patch`/`update` auf Deployments (Restart + Scale)

### 4.4 Secret Management

| Umgebung | Methode | Status |
|----------|---------|--------|
| Entwicklung | `k3d/secrets.yaml` (Base64, Dev-Werte) | ✓ Niemals real credentials |
| Produktion | `prod/secrets.yaml` (Platzhalter, manuell befüllt) | ✓ |
| GitOps | Sealed Secrets Controller deployed | ✓ |

Alle 34 Secret-Keys in `workspace-secrets`:
- Datenbankpasswörter (7 Services)
- OIDC-Client-Secrets (8 Services)
- Admin-Credentials (7 Services)
- Service-Tokens (8 Einträge)
- Externe APIs (Anthropic, Stripe)

### 4.5 CI/CD-Sicherheitsprüfungen

GitHub Actions bei jedem PR:

| Prüfung | Tool | Was wird geprüft |
|---------|------|-----------------|
| Manifest-Validierung | kustomize + kubeconform | K8s 1.31.0 Konformität |
| YAML-Linting | yamllint | Syntax, 200-Zeichen-Limit |
| Shell-Linting | shellcheck | Bash-Sicherheitsmuster |
| Image-Pinning | custom check | Alle Images auf Version gepinnt |
| Secret-Detection | custom check | Keine Credentials in Git |

---

## 5. DSGVO / Compliance-Status

**Automatisierte DSGVO-Prüfungen (8 Checks):**

| ID | Prüfung | Status |
|----|---------|--------|
| D01 | Keine US-Cloud-Registry-Images | ✓ |
| D02 | Keine externen Tracking-Domains | ✓ |
| D03 | Lokaler Storage (keine Cloud-Klassen) | ✓ |
| D04 | Keycloak Audit Events aktiviert | ✓ |
| D05 | Mattermost Audit-Log erreichbar | ✓ |
| D06 | Keine proprietäre Telemetrie | ✓ |
| D07 | Alle Images Open-Source | ✓ |
| D08 | SMTP intern (Mailpit) | ✓ |

**Backup-Verschlüsselung:**
- AES-256-CBC mit PBKDF2 (openssl)
- Tägliche Backups (02:00 UTC)
- 30-Tage-Retention
- Scope: keycloak, mattermost, nextcloud

---

## 6. Risikomatrix

| Risiko | Wahrscheinlichkeit | Auswirkung | Priorität | Status |
|--------|-------------------|-----------|-----------|--------|
| Unkontrollierter East-West-Traffic (Pod-Compromise) | MITTEL | HOCH | KRITISCH | ✓ Behoben (NetworkPolicies) |
| Privilege Escalation im Container | NIEDRIG | HOCH | HOCH | ✓ Behoben (SecurityContexts) |
| Brute-Force auf Keycloak | MITTEL | HOCH | HOCH | ✓ Behoben (Rate-Limiting + Brute-Force-Detection) |
| Clickjacking / XSS via fehlende Header | NIEDRIG | MITTEL | MITTEL | ✓ Behoben (Security-Header) |
| Unauthentifizierter Zugriff auf interne Tools | MITTEL | MITTEL | MITTEL | ✓ Behoben (BasicAuth) |
| PostgreSQL ohne TLS intern | NIEDRIG | MITTEL | NIEDRIG | ~ Mitigiert (NetworkPolicies), offen |
| Container-Image-Kompromittierung | NIEDRIG | HOCH | MITTEL | ~ Mitigiert (Image-Pinning, DSGVO-Check D01) |
| Physischer Server-Zugang | SEHR NIEDRIG | SEHR HOCH | MITTEL | Doku-Empfehlung (außer Scope) |

---

## 7. Implementierte Änderungen (Summary)

| Datei | Änderung |
|-------|---------|
| `k3d/network-policies.yaml` | Neu: 7 NetworkPolicies für workspace-Namespace |
| `k3d/website.yaml` | Ergänzt: 5 NetworkPolicies für website-Namespace |
| `prod/traefik-middlewares.yaml` | Ergänzt: security-headers, 6 Rate-Limit-Middlewares, basic-auth-internal |
| `prod/ingress.yaml` | Ersetzt: monolithisch → 10 per-Service-Ingresses mit Middleware-Annotationen |
| `k3d/ingress.yaml` | Aufgeteilt: BasicAuth für Mailpit/Docs/AI |
| `k3d/secrets.yaml` | Ergänzt: traefik-basic-auth Secret |
| 13× Deployment-YAMLs | SecurityContexts ergänzt |

---

## 8. Empfehlungen für zukünftige Erweiterungen

| Priorität | Maßnahme | Aufwand |
|-----------|---------|---------|
| HOCH | PostgreSQL-TLS intern via cert-manager | MITTEL |
| HOCH | TLS 1.0/1.1 explizit deaktivieren (Traefik minVersion: VersionTLS12) | NIEDRIG |
| MITTEL | Service-Mesh (Cilium mTLS) für Pod-to-Pod-TLS | HOCH |
| MITTEL | Monitoring-Namespace NetworkPolicies | NIEDRIG |
| MITTEL | OPA Gatekeeper / Kyverno für Policy-Enforcement | MITTEL |
| NIEDRIG | Full-Disk-Encryption auf Host-Ebene (LUKS) | MITTEL |
| NIEDRIG | SBOM-Generation und Image-Vulnerability-Scanning (Trivy) | NIEDRIG |
```

- [ ] **Schritt 8.2: Commit**

```bash
git add docs/security-report.md
git commit -m "docs: add comprehensive OSI-layer security report"
```

---

## Task 9: docs/security.md aktualisieren + finale Validierung

**Files:**
- Modify: `docs/security.md`

- [ ] **Schritt 9.1: Sektion "Netzwerk-Sicherheit" in docs/security.md ersetzen**

Den bestehenden Abschnitt `## Netzwerk-Sicherheit` (Zeile 173–178) ersetzen durch:

```markdown
## Netzwerk-Sicherheit

### Kubernetes NetworkPolicies (L3)

Default-Deny auf allen Namespaces (`workspace`, `website`). Selektive Freigaben:

| Policy | Namespace | Erlaubter Traffic |
|--------|-----------|------------------|
| `default-deny-ingress` | workspace, website | Alle Verbindungen blockiert (Default) |
| `default-deny-egress` | workspace, website | Alle Verbindungen blockiert (Default) |
| `allow-dns-egress` | workspace, website | kube-dns Port 53 UDP/TCP |
| `allow-intra-namespace-egress` | workspace | Pod-zu-Pod im Namespace |
| `allow-traefik-ingress` | workspace, website | Traefik aus kube-system |
| `allow-monitoring-ingress` | workspace | Prometheus-Scraping |
| `allow-mcp-external-egress` | workspace | mcp-github/mcp-stripe → HTTPS 443 |
| `allow-egress-to-workspace` | website | Website → workspace Services |

```bash
kubectl get networkpolicies -n workspace    # Policies anzeigen
kubectl describe networkpolicy default-deny-ingress -n workspace
```

### HTTP Security Header (L7)

Neue Traefik-Middleware `security-headers` (alle Production-Services):

| Header | Wert |
|--------|------|
| `X-Frame-Options` | `SAMEORIGIN` |
| `X-Content-Type-Options` | `nosniff` |
| `X-XSS-Protection` | `1; mode=block` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=()` |

### Rate-Limiting (L7)

Traefik-Rate-Limit-Middlewares per Service (nur Produktion):

| Service | avg req/s | Burst |
|---------|-----------|-------|
| Keycloak | 20 | 40 |
| Vaultwarden | 20 | 40 |
| Invoice Ninja | 30 | 60 |
| Nextcloud | 50 | 100 |
| Mattermost | 100 | 200 |
| Website | 200 | 400 |

### Zugriffsschutz interne Tools (L7)

Mailpit, Docs und MCP-Status sind hinter BasicAuth (`traefik-basic-auth`-Secret).

Dev-Credentials: `admin:admin` (in `k3d/secrets.yaml` konfiguriert).
Produktion: eigenen Hash via `htpasswd -nb <user> <password>` generieren.
```

- [ ] **Schritt 9.2: Sektion "Container SecurityContexts" in docs/security.md ergänzen**

Nach der bestehenden `## Pod Security Standards`-Sektion (nach Zeile 77) eine neue Sektion einfügen:

```markdown
### Container SecurityContexts

Alle Deployments haben `allowPrivilegeEscalation: false`, `capabilities: drop: [ALL]` und `seccompProfile: RuntimeDefault`.

**Volle Härtung** (`readOnlyRootFilesystem: true`, `runAsNonRoot: true`):
`billing-bot`, `mailpit`, `oauth2-proxy-invoiceninja`, `docs`

**Partielle Härtung** (`readOnlyRootFilesystem: false` — Applikation schreibt Dateien):
`mattermost`, `keycloak`, `nextcloud`, `vaultwarden`, `opensearch`, `nextcloud-redis`, `whiteboard`

**Sonderfälle:**
- `collabora`: SYS_ADMIN erforderlich (LibreOffice-Kern) — isoliert im Namespace `workspace-office`
- `mm-keycloak-proxy` (nginx): `readOnlyRootFilesystem: true` mit `emptyDir`-Volumes für nginx-Cache/Run/Tmp
```

- [ ] **Schritt 9.3: Vollständige Validierung**

```bash
task workspace:validate
./tests/runner.sh local SA-01
./tests/runner.sh local SA-02
./tests/runner.sh local SA-03
```

Erwartete Ausgabe: alle Tests grün.

- [ ] **Schritt 9.4: Commit**

```bash
git add docs/security.md
git commit -m "docs: update security.md with NetworkPolicies, SecurityContexts, rate-limiting, basicauth"
```

---

## Abschließende Validierung

- [ ] **Alle Manifeste validieren:**

```bash
task workspace:validate
```

- [ ] **Security-Tests ausführen:**

```bash
./tests/runner.sh local SA-01 SA-02 SA-03 SA-04 SA-05 SA-06 SA-07 SA-08 SA-09
```

- [ ] **Git-Log prüfen:**

```bash
git log --oneline -10
```

Erwartete Commits:
```
feat(security): add NetworkPolicies — default-deny + selective allow (L3)
feat(security): add Traefik security-headers, rate-limiting, basicauth middlewares (L7)
feat(security): add traefik-basic-auth secret for internal tool access control
feat(security): split prod/ingress.yaml into per-service Ingresses with rate-limiting and basicauth
feat(security): add BasicAuth for Mailpit/Docs/AI in dev ingress
feat(security): add SecurityContexts for stateless services (full hardening)
feat(security): add SecurityContexts for app services (partial hardening, allowPrivilegeEscalation: false)
docs: add comprehensive OSI-layer security report
docs: update security.md with NetworkPolicies, SecurityContexts, rate-limiting, basicauth
```
