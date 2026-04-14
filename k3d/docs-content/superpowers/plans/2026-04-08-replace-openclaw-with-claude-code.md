# Replace OpenClaw with Claude Code — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the self-hosted OpenClaw (Open-WebUI) with two Claude Code environments accessing the existing MCP servers via bearer-token-authenticated Traefik routes, plus a lightweight status page at `ai.mentolder.de`.

**Architecture:** MCP servers stay as-is. A new ForwardAuth nginx proxy validates bearer tokens and enforces role-based path access (cluster vs business). Two Claude Code settings templates provide preconfigured MCP connections. A simple status page replaces the Open-WebUI at `ai.{domain}`.

**Tech Stack:** nginx (ForwardAuth), Traefik IngressRoute (CRD), Kubernetes Secrets, Claude Code `mcpServers` config, vanilla HTML/CSS/JS (status page)

**Spec:** `docs/superpowers/specs/2026-04-08-replace-openclaw-with-claude-code-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `deploy/mcp/mcp-auth-proxy.yaml` | ForwardAuth nginx: Deployment + Service + ConfigMap (token validation + role-based path enforcement) |
| `deploy/mcp/mcp-tokens.yaml` | Secret template with CLUSTER_TOKEN + BUSINESS_TOKEN placeholders |
| `deploy/mcp/mcp-status.yaml` | Status page: Deployment + Service + ConfigMap (HTML + health-check sidecar) |
| `claude-code/cluster.settings.json` | Claude Code MCP config template for Patrick (all 9 servers) |
| `claude-code/business.settings.json` | Claude Code MCP config template for Gekko (4 business servers) |

### Modified Files
| File | Change |
|------|--------|
| `deploy/mcp/ingress.yaml` | Replace `mcp-ipallow` with `mcp-forwardauth`, remove OpenClaw catch-all, add `/browser` route |
| `deploy/mcp/kustomization.yaml` | Add `mcp-auth-proxy.yaml`, `mcp-tokens.yaml`, `mcp-status.yaml` to resources |
| `k3d/kustomization.yaml` | Remove `openclaw-webui.yaml` and `openclaw-init-job.yaml` from resources |
| `k3d/ingress.yaml` | Change `ai.localhost` backend from `openclaw:8080` to `mcp-status:80` |
| `prod/kustomization.yaml` | Remove `patch-openclaw-webui.yaml` from patches (if present) |
| `prod/ingress.yaml` | Change `ai.${PROD_DOMAIN}` backend from `openclaw:8080` to `mcp-status:80` |
| `Taskfile.yml` | Remove `workspace:openclaw:setup`, update `workspace:deploy` rollout list, add `claude-code:setup` and `claude-code:rotate-tokens` tasks, update `mcp:deploy` and `mcp:status` |

### Deleted Files
| File | Reason |
|------|--------|
| `k3d/openclaw-webui.yaml` | Open-WebUI replaced by Claude Code |
| `k3d/openclaw-init-job.yaml` | No WebUI to initialize |
| `prod/patch-openclaw-webui.yaml` | No WebUI to patch |

---

### Task 1: Create the MCP auth proxy

**Files:**
- Create: `deploy/mcp/mcp-auth-proxy.yaml`
- Create: `deploy/mcp/mcp-tokens.yaml`

- [ ] **Step 1: Create the tokens Secret template**

```yaml
# deploy/mcp/mcp-tokens.yaml
apiVersion: v1
kind: Secret
metadata:
  name: mcp-tokens
type: Opaque
stringData:
  # Replace with real tokens at deploy time (task claude-code:rotate-tokens)
  CLUSTER_TOKEN: "dev-cluster-token-placeholder"
  BUSINESS_TOKEN: "dev-business-token-placeholder"
```

- [ ] **Step 2: Create the ForwardAuth proxy manifest**

Create `deploy/mcp/mcp-auth-proxy.yaml` with:
- A ConfigMap `mcp-auth-proxy-config` containing an nginx.conf that:
  - Listens on port 80 at `/auth`
  - Reads the `Authorization` header, extracts the bearer token
  - Compares against `CLUSTER_TOKEN` and `BUSINESS_TOKEN` env vars
  - Returns `401` if no match
  - On match, determines role (`cluster` or `business`)
  - Checks the `X-Forwarded-Uri` header (set by Traefik) against allowed paths for that role
  - Business role allows: `/mattermost`, `/nextcloud`, `/invoiceninja`, `/stripe`
  - Cluster role allows: all paths
  - Returns `403` if role doesn't match path
  - Returns `200` with `X-MCP-Role` response header on success
- A Deployment (1 replica, `nginx:1.27-alpine-perl`)
- A Service on port 80

```yaml
# deploy/mcp/mcp-auth-proxy.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: mcp-auth-proxy-config
data:
  nginx.conf: |
    env CLUSTER_TOKEN;
    env BUSINESS_TOKEN;

    events { worker_connections 64; }

    http {
      # Import tokens from environment via perl module
      perl_modules /etc/nginx/perl;
      perl_set $cluster_token 'sub { return $ENV{"CLUSTER_TOKEN"}; }';
      perl_set $business_token 'sub { return $ENV{"BUSINESS_TOKEN"}; }';

      server {
        listen 80;

        location /auth {
          # Extract bearer token from Authorization header
          set $token "";
          if ($http_authorization ~* "^Bearer\s+(.+)$") {
            set $token $1;
          }

          # No token -> 401
          if ($token = "") {
            return 401 '{"error":"missing bearer token"}';
          }

          # Match token to role
          set $role "";
          if ($token = $cluster_token) {
            set $role "cluster";
          }
          if ($token = $business_token) {
            set $role "business";
          }

          # Unknown token -> 401
          if ($role = "") {
            return 401 '{"error":"invalid token"}';
          }

          # For cluster role, allow everything
          # For business role, check path from X-Forwarded-Uri
          set $check "${role}:${http_x_forwarded_uri}";

          # Business role -- block cluster-only paths
          # Nginx doesn't support nested ifs, so we use a deny variable
          set $deny "";
          if ($check ~ "^business:/kubernetes") { set $deny "1"; }
          if ($check ~ "^business:/postgres")   { set $deny "1"; }
          if ($check ~ "^business:/keycloak")   { set $deny "1"; }
          if ($check ~ "^business:/browser")    { set $deny "1"; }
          if ($check ~ "^business:/github")     { set $deny "1"; }

          if ($deny = "1") {
            return 403 '{"error":"insufficient permissions"}';
          }

          # Authorized
          add_header X-MCP-Role $role always;
          return 200 '{"role":"$role"}';
        }

        location /healthz {
          return 200 'ok';
        }
      }
    }
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mcp-auth-proxy
  labels:
    app: mcp-auth-proxy
spec:
  replicas: 1
  selector:
    matchLabels:
      app: mcp-auth-proxy
  template:
    metadata:
      labels:
        app: mcp-auth-proxy
    spec:
      containers:
        - name: nginx
          image: nginx:1.27-alpine-perl
          ports:
            - containerPort: 80
          env:
            - name: CLUSTER_TOKEN
              valueFrom:
                secretKeyRef:
                  name: mcp-tokens
                  key: CLUSTER_TOKEN
            - name: BUSINESS_TOKEN
              valueFrom:
                secretKeyRef:
                  name: mcp-tokens
                  key: BUSINESS_TOKEN
          volumeMounts:
            - name: config
              mountPath: /etc/nginx/nginx.conf
              subPath: nginx.conf
          readinessProbe:
            httpGet: { path: /healthz, port: 80 }
            initialDelaySeconds: 2
            periodSeconds: 5
          livenessProbe:
            httpGet: { path: /healthz, port: 80 }
            initialDelaySeconds: 5
            periodSeconds: 15
          resources:
            requests: { memory: 16Mi, cpu: 10m }
            limits:   { memory: 64Mi }
      volumes:
        - name: config
          configMap:
            name: mcp-auth-proxy-config
---
apiVersion: v1
kind: Service
metadata:
  name: mcp-auth-proxy
spec:
  selector:
    app: mcp-auth-proxy
  ports:
    - port: 80
      targetPort: 80
```

- [ ] **Step 3: Verify manifests are valid YAML**

Run: `python3 -c "import yaml; yaml.safe_load_all(open('deploy/mcp/mcp-auth-proxy.yaml')); print('OK')"`
Expected: `OK`

Run: `python3 -c "import yaml; yaml.safe_load_all(open('deploy/mcp/mcp-tokens.yaml')); print('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add deploy/mcp/mcp-auth-proxy.yaml deploy/mcp/mcp-tokens.yaml
git commit -m "feat: add MCP ForwardAuth proxy and tokens Secret"
```

---

### Task 2: Update the MCP ingress

**Files:**
- Modify: `deploy/mcp/ingress.yaml`

- [ ] **Step 1: Replace IP allowlist middleware with ForwardAuth**

In `deploy/mcp/ingress.yaml`, replace the `mcp-ipallow` Middleware (lines 8-18) with a `mcp-forwardauth` Middleware:

```yaml
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: mcp-forwardauth
spec:
  forwardAuth:
    address: http://mcp-auth-proxy.default.svc.cluster.local:80/auth
    authResponseHeaders:
      - X-MCP-Role
```

- [ ] **Step 2: Update the middleware chain**

Replace `mcp-ipallow` with `mcp-forwardauth` in the `mcp-chain` Middleware (line 38):

Change:
```yaml
    middlewares:
      - name: mcp-ipallow
      - name: mcp-strip-service-prefix
```

To:
```yaml
    middlewares:
      - name: mcp-forwardauth
      - name: mcp-strip-service-prefix
```

- [ ] **Step 3: Add the browser MCP route**

Add a new route block before the GitHub route (before line 109):

```yaml
    # ── Browser MCP (Playwright) ──────────────────────────────────
    - kind: Rule
      match: Host(`mcp-${PROD_DOMAIN}`) && PathPrefix(`/browser`)
      middlewares:
        - name: mcp-chain
      services:
        - name: openclaw-mcp-browser
          port: 3000
```

- [ ] **Step 4: Remove the OpenClaw WebUI catch-all route**

Delete lines 129-143 (the catch-all route that proxies to `openclaw` service in workspace namespace). Keep the `tls` block at the end.

- [ ] **Step 5: Delete the mcp-ipallow Middleware resource**

Remove the entire `mcp-ipallow` Middleware YAML document (lines 8-18) since it's replaced by `mcp-forwardauth`.

- [ ] **Step 6: Verify the updated ingress**

Run: `python3 -c "import yaml; list(yaml.safe_load_all(open('deploy/mcp/ingress.yaml'))); print('OK')"`
Expected: `OK`

- [ ] **Step 7: Commit**

```bash
git add deploy/mcp/ingress.yaml
git commit -m "feat: replace MCP IP allowlist with ForwardAuth token validation"
```

---

### Task 3: Create the MCP status page

**Files:**
- Create: `deploy/mcp/mcp-status.yaml`

- [ ] **Step 1: Create the status page manifest**

Create `deploy/mcp/mcp-status.yaml` with:
- A ConfigMap `mcp-status-html` containing `index.html` — a self-contained HTML page with:
  - Fetches `/health.json` every 10 seconds
  - Displays two groups: "Cluster Management" (kubernetes, postgres, keycloak, browser, github) and "Business" (mattermost, nextcloud, invoiceninja, stripe)
  - Each server shows: name, green/red status badge, last checked timestamp
  - Minimal dark-themed CSS, no framework
  - **IMPORTANT:** Use safe DOM methods (createElement, textContent, appendChild) instead of innerHTML to prevent XSS
- A ConfigMap `mcp-status-healthcheck` containing `healthcheck.sh` — a shell script that:
  - Loops every 30 seconds
  - Curls each MCP server's health endpoint (with 3s timeout)
  - Writes results as JSON to `/usr/share/nginx/html/health.json`
- A Deployment (1 replica) with:
  - An init container that copies the HTML from ConfigMap to the shared emptyDir
  - `nginx:1.27-alpine` serving the HTML on port 80
  - `alpine/curl` running the healthcheck script as a sidecar
  - Shared emptyDir volume mounted at `/usr/share/nginx/html`
- A Service on port 80

```yaml
# deploy/mcp/mcp-status.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: mcp-status-html
data:
  index.html: |
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>MCP Server Status</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
               background: #0f172a; color: #e2e8f0; padding: 2rem; }
        h1 { font-size: 1.5rem; margin-bottom: 1.5rem; color: #f8fafc; }
        h2 { font-size: 1.1rem; margin: 1.5rem 0 0.75rem; color: #94a3b8;
             text-transform: uppercase; letter-spacing: 0.05em; font-weight: 500; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 0.75rem; }
        .card { background: #1e293b; border-radius: 8px; padding: 1rem;
                display: flex; align-items: center; gap: 0.75rem; }
        .dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
        .dot.up { background: #22c55e; box-shadow: 0 0 6px #22c55e80; }
        .dot.down { background: #ef4444; box-shadow: 0 0 6px #ef444480; }
        .dot.unknown { background: #64748b; }
        .name { font-weight: 600; font-size: 0.95rem; }
        .time { font-size: 0.75rem; color: #64748b; }
        .footer { margin-top: 2rem; font-size: 0.8rem; color: #475569; }
      </style>
    </head>
    <body>
      <h1>MCP Server Status</h1>
      <h2>Cluster Management</h2>
      <div class="grid" id="cluster"></div>
      <h2>Business</h2>
      <div class="grid" id="business"></div>
      <p class="footer">Auto-refreshes every 10s</p>
      <script>
        var clusterServers = ['kubernetes','postgres','keycloak','browser','github'];
        var businessServers = ['mattermost','nextcloud','invoiceninja','stripe'];

        function createCard(name, statusClass, timeText) {
          var card = document.createElement('div');
          card.className = 'card';

          var dot = document.createElement('div');
          dot.className = 'dot ' + statusClass;

          var info = document.createElement('div');

          var nameEl = document.createElement('div');
          nameEl.className = 'name';
          nameEl.textContent = name;

          var timeEl = document.createElement('div');
          timeEl.className = 'time';
          timeEl.textContent = timeText;

          info.appendChild(nameEl);
          info.appendChild(timeEl);
          card.appendChild(dot);
          card.appendChild(info);
          return card;
        }

        function render(data) {
          var groups = [
            { id: 'cluster', servers: clusterServers },
            { id: 'business', servers: businessServers }
          ];
          groups.forEach(function(group) {
            var el = document.getElementById(group.id);
            while (el.firstChild) { el.removeChild(el.firstChild); }
            group.servers.forEach(function(name) {
              var s = data[name] || {};
              var status = s.status || 'unknown';
              var time = s.checked ? new Date(s.checked).toLocaleTimeString() : '-';
              el.appendChild(createCard(name, status, time));
            });
          });
        }

        function refresh() {
          fetch('/health.json')
            .then(function(r) { return r.json(); })
            .then(render)
            .catch(function() {});
        }

        render({});
        refresh();
        setInterval(refresh, 10000);
      </script>
    </body>
    </html>
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: mcp-status-healthcheck
data:
  healthcheck.sh: |
    #!/bin/sh
    # Health check loop -- curls each MCP server and writes JSON
    OUTPUT="/usr/share/nginx/html/health.json"

    while true; do
      NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
      JSON="{"

      check() {
        NAME="$1"; URL="$2"
        STATUS="down"
        if curl -sf --max-time 3 "$URL" > /dev/null 2>&1; then
          STATUS="up"
        fi
        echo "\"$NAME\":{\"status\":\"$STATUS\",\"checked\":\"$NOW\"}"
      }

      JSON="$JSON$(check kubernetes   http://openclaw-mcp-core:8080/mcp)"
      JSON="$JSON,$(check postgres     http://openclaw-mcp-core:3001/health)"
      JSON="$JSON,$(check mattermost   http://openclaw-mcp-core:8000/health)"
      JSON="$JSON,$(check nextcloud    http://openclaw-mcp-apps:8000/health/ready)"
      JSON="$JSON,$(check invoiceninja http://openclaw-mcp-apps:8080/mcp)"
      JSON="$JSON,$(check keycloak     http://openclaw-mcp-auth:8080/q/health)"
      JSON="$JSON,$(check browser      http://openclaw-mcp-browser:3000/health)"
      JSON="$JSON,$(check github       http://mcp-github:3002/mcp)"
      JSON="$JSON,$(check stripe       http://mcp-stripe:3003/mcp)"

      JSON="$JSON}"

      echo "$JSON" > "$OUTPUT"
      sleep 30
    done
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mcp-status
  labels:
    app: mcp-status
spec:
  replicas: 1
  selector:
    matchLabels:
      app: mcp-status
  template:
    metadata:
      labels:
        app: mcp-status
    spec:
      initContainers:
        - name: copy-html
          image: alpine:3.19
          command: ["cp", "/src/index.html", "/html/index.html"]
          volumeMounts:
            - name: html-src
              mountPath: /src
            - name: html
              mountPath: /html
      containers:
        - name: nginx
          image: nginx:1.27-alpine
          ports:
            - containerPort: 80
          volumeMounts:
            - name: html
              mountPath: /usr/share/nginx/html
          resources:
            requests: { memory: 16Mi, cpu: 5m }
            limits:   { memory: 64Mi }
        - name: healthcheck
          image: alpine/curl:latest
          command: ["/bin/sh", "/scripts/healthcheck.sh"]
          volumeMounts:
            - name: html
              mountPath: /usr/share/nginx/html
            - name: healthcheck-script
              mountPath: /scripts
          resources:
            requests: { memory: 16Mi, cpu: 5m }
            limits:   { memory: 64Mi }
      volumes:
        - name: html
          emptyDir: {}
        - name: html-src
          configMap:
            name: mcp-status-html
        - name: healthcheck-script
          configMap:
            name: mcp-status-healthcheck
            defaultMode: 0755
---
apiVersion: v1
kind: Service
metadata:
  name: mcp-status
spec:
  selector:
    app: mcp-status
  ports:
    - port: 80
      targetPort: 80
```

- [ ] **Step 2: Verify manifest**

Run: `python3 -c "import yaml; list(yaml.safe_load_all(open('deploy/mcp/mcp-status.yaml'))); print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add deploy/mcp/mcp-status.yaml
git commit -m "feat: add MCP status page deployment"
```

---

### Task 4: Update kustomization files

**Files:**
- Modify: `deploy/mcp/kustomization.yaml`
- Modify: `k3d/kustomization.yaml`

- [ ] **Step 1: Add new resources to deploy/mcp/kustomization.yaml**

Add three new resource lines after `- openclaw-mcp-stripe.yaml` (line 14) and before the ingress comment (line 15):

```yaml
  # Auth + Status
  - mcp-tokens.yaml             # Bearer tokens for Claude Code access
  - mcp-auth-proxy.yaml         # ForwardAuth proxy (token validation + role enforcement)
  - mcp-status.yaml             # Health status page (replaces OpenClaw WebUI)
```

- [ ] **Step 2: Remove OpenClaw WebUI and init job from k3d/kustomization.yaml**

Remove these two lines from `k3d/kustomization.yaml` (lines 47-48):

```
  - openclaw-webui.yaml
  - openclaw-init-job.yaml
```

- [ ] **Step 3: Verify kustomize builds**

Run: `kustomize build deploy/mcp/ 2>&1 | head -5`
Expected: Should output valid YAML (apiVersion line)

- [ ] **Step 4: Commit**

```bash
git add deploy/mcp/kustomization.yaml k3d/kustomization.yaml
git commit -m "chore: update kustomization resources for Claude Code migration"
```

---

### Task 5: Update ingress rules for ai.{domain}

**Files:**
- Modify: `k3d/ingress.yaml` (lines 139-149)
- Modify: `prod/ingress.yaml` (lines 157-167)

- [ ] **Step 1: Update k3d dev ingress**

In `k3d/ingress.yaml`, replace the OpenClaw rule (lines 139-149):

Change:
```yaml
    # ── OpenClaw (KI-Assistent) ─────────────────────────────────
    - host: ai.localhost
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: openclaw
                port:
                  number: 8080
```

To:
```yaml
    # ── MCP Status (replaces OpenClaw WebUI) ────────────────────
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

- [ ] **Step 2: Update prod ingress**

In `prod/ingress.yaml`, replace the OpenClaw rule (lines 157-167):

Change:
```yaml
    # OpenClaw (KI-Assistent)
    - host: ai.${PROD_DOMAIN}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: openclaw
                port:
                  number: 8080
```

To:
```yaml
    # MCP Status (replaces OpenClaw WebUI)
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
```

- [ ] **Step 3: Commit**

```bash
git add k3d/ingress.yaml prod/ingress.yaml
git commit -m "feat: route ai.{domain} to MCP status page instead of OpenClaw"
```

---

### Task 6: Remove OpenClaw WebUI files

**Files:**
- Delete: `k3d/openclaw-webui.yaml`
- Delete: `k3d/openclaw-init-job.yaml`
- Delete: `prod/patch-openclaw-webui.yaml`

- [ ] **Step 1: Delete the files**

```bash
git rm k3d/openclaw-webui.yaml k3d/openclaw-init-job.yaml prod/patch-openclaw-webui.yaml
```

- [ ] **Step 2: Verify kustomize still builds**

Run: `kustomize build k3d/ 2>&1 | head -5`
Expected: Valid YAML output (no "file not found" errors)

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: remove OpenClaw WebUI and init job manifests"
```

---

### Task 7: Create Claude Code settings templates

**Files:**
- Create: `claude-code/cluster.settings.json`
- Create: `claude-code/business.settings.json`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p claude-code
```

- [ ] **Step 2: Create the cluster settings template**

Create `claude-code/cluster.settings.json`:

```json
{
  "mcpServers": {
    "kubernetes": {
      "type": "url",
      "url": "https://mcp-${PROD_DOMAIN}/kubernetes/mcp",
      "headers": {
        "Authorization": "Bearer ${CLUSTER_TOKEN}"
      }
    },
    "postgres": {
      "type": "url",
      "url": "https://mcp-${PROD_DOMAIN}/postgres/mcp",
      "headers": {
        "Authorization": "Bearer ${CLUSTER_TOKEN}"
      }
    },
    "mattermost": {
      "type": "url",
      "url": "https://mcp-${PROD_DOMAIN}/mattermost/mcp",
      "headers": {
        "Authorization": "Bearer ${CLUSTER_TOKEN}"
      }
    },
    "nextcloud": {
      "type": "url",
      "url": "https://mcp-${PROD_DOMAIN}/nextcloud/mcp",
      "headers": {
        "Authorization": "Bearer ${CLUSTER_TOKEN}"
      }
    },
    "invoiceninja": {
      "type": "url",
      "url": "https://mcp-${PROD_DOMAIN}/invoiceninja/mcp",
      "headers": {
        "Authorization": "Bearer ${CLUSTER_TOKEN}"
      }
    },
    "keycloak": {
      "type": "url",
      "url": "https://mcp-${PROD_DOMAIN}/keycloak/mcp/sse",
      "headers": {
        "Authorization": "Bearer ${CLUSTER_TOKEN}"
      }
    },
    "browser": {
      "type": "url",
      "url": "https://mcp-${PROD_DOMAIN}/browser/mcp",
      "headers": {
        "Authorization": "Bearer ${CLUSTER_TOKEN}"
      }
    },
    "github": {
      "type": "url",
      "url": "https://mcp-${PROD_DOMAIN}/github/mcp",
      "headers": {
        "Authorization": "Bearer ${CLUSTER_TOKEN}"
      }
    },
    "stripe": {
      "type": "url",
      "url": "https://mcp-${PROD_DOMAIN}/stripe/mcp",
      "headers": {
        "Authorization": "Bearer ${CLUSTER_TOKEN}"
      }
    }
  }
}
```

- [ ] **Step 3: Create the business settings template**

Create `claude-code/business.settings.json`:

```json
{
  "mcpServers": {
    "mattermost": {
      "type": "url",
      "url": "https://mcp-${PROD_DOMAIN}/mattermost/mcp",
      "headers": {
        "Authorization": "Bearer ${BUSINESS_TOKEN}"
      }
    },
    "nextcloud": {
      "type": "url",
      "url": "https://mcp-${PROD_DOMAIN}/nextcloud/mcp",
      "headers": {
        "Authorization": "Bearer ${BUSINESS_TOKEN}"
      }
    },
    "invoiceninja": {
      "type": "url",
      "url": "https://mcp-${PROD_DOMAIN}/invoiceninja/mcp",
      "headers": {
        "Authorization": "Bearer ${BUSINESS_TOKEN}"
      }
    },
    "stripe": {
      "type": "url",
      "url": "https://mcp-${PROD_DOMAIN}/stripe/mcp",
      "headers": {
        "Authorization": "Bearer ${BUSINESS_TOKEN}"
      }
    }
  }
}
```

- [ ] **Step 4: Verify JSON is valid**

Run: `python3 -c "import json; json.load(open('claude-code/cluster.settings.json')); print('OK')"`
Expected: `OK`

Run: `python3 -c "import json; json.load(open('claude-code/business.settings.json')); print('OK')"`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add claude-code/
git commit -m "feat: add Claude Code MCP settings templates for cluster and business"
```

---

### Task 8: Add Taskfile commands

**Files:**
- Modify: `Taskfile.yml`

- [ ] **Step 1: Remove workspace:openclaw:setup task**

Delete the `workspace:openclaw:setup` task (lines 448-461 in Taskfile.yml):

```yaml
  workspace:openclaw:setup:
    desc: Register all MCP servers in the OpenClaw database
    cmds:
      - |
        kubectl wait --for=condition=Ready pod -l app=openclaw -n workspace --timeout=120s
        OC_POD=$(kubectl get pod -n workspace -l app=openclaw -o jsonpath='{.items[0].metadata.name}')
        echo "Registering MCP servers in OpenClaw ($OC_POD)..."
        kubectl cp scripts/openclaw-mcp-register.py workspace/$OC_POD:/tmp/mcp-register.py
        kubectl exec -n workspace $OC_POD -- python3 /tmp/mcp-register.py
        kubectl exec -n workspace $OC_POD -- rm /tmp/mcp-register.py
        # Restart pod to pick up changes (especially if in config table)
        kubectl rollout restart deployment/openclaw -n workspace
        kubectl rollout status deployment/openclaw -n workspace --timeout=120s
      - echo "✓ MCP servers registered in OpenClaw"
```

- [ ] **Step 2: Remove openclaw from workspace:deploy rollout list**

In the `workspace:deploy` task, update the `for svc in ...` loop (line 423):

Change:
```bash
for svc in keycloak mm-keycloak-proxy mattermost nextcloud spreed-signaling collabora whiteboard openclaw opensearch invoiceninja oauth2-proxy-invoiceninja billing-bot docs; do
```

To:
```bash
for svc in keycloak mm-keycloak-proxy mattermost nextcloud spreed-signaling collabora whiteboard opensearch invoiceninja oauth2-proxy-invoiceninja billing-bot docs; do
```

- [ ] **Step 3: Remove the workspace:openclaw:setup call from workspace:deploy**

Remove line 430:
```yaml
      - task: workspace:openclaw:setup
```

- [ ] **Step 4: Update mcp:deploy to include auth proxy and status page**

In the `mcp:deploy` task, add rollout waits after the existing ones (after line 691):

```yaml
      - kubectl rollout status deployment/mcp-auth-proxy --timeout=60s
      - kubectl rollout status deployment/mcp-status --timeout=60s
```

Update the summary echo (line 692):

Change:
```yaml
      - 'echo "✓ All MCP pods deployed (3 pods, 7 containers)"'
```

To:
```yaml
      - 'echo "✓ All MCP pods deployed (3 pods + auth proxy + status page)"'
```

- [ ] **Step 5: Update mcp:status to include new pods**

In the `mcp:status` task, update the label selector (line 699):

Change:
```yaml
      - kubectl get pods -l 'app in (openclaw-mcp-core,openclaw-mcp-apps,openclaw-mcp-auth,mcp-github)' -o wide
```

To:
```yaml
      - kubectl get pods -l 'app in (openclaw-mcp-core,openclaw-mcp-apps,openclaw-mcp-auth,mcp-github,mcp-auth-proxy,mcp-status)' -o wide
```

Update the container status loop similarly (line 703):

Change:
```yaml
        for pod in $(kubectl get pods -l 'app in (openclaw-mcp-core,openclaw-mcp-apps,openclaw-mcp-auth)' -o name 2>/dev/null); do
```

To:
```yaml
        for pod in $(kubectl get pods -l 'app in (openclaw-mcp-core,openclaw-mcp-apps,openclaw-mcp-auth,mcp-auth-proxy,mcp-status)' -o name 2>/dev/null); do
```

- [ ] **Step 6: Add claude-code:setup task**

Add a new task section after the MCP section (after `mcp:set-github-pat` task, around line 757):

```yaml
  # ─────────────────────────────────────────────
  # Claude Code Setup
  # ─────────────────────────────────────────────
  claude-code:setup:
    desc: "Generate Claude Code settings.json (usage: task claude-code:setup -- cluster|business)"
    cmds:
      - |
        ROLE="{{.CLI_ARGS}}"
        if [ "$ROLE" != "cluster" ] && [ "$ROLE" != "business" ]; then
          echo "Usage: task claude-code:setup -- cluster|business"
          echo ""
          echo "  cluster  -- All 9 MCP servers (for platform admin)"
          echo "  business -- 4 business MCP servers (for business user)"
          exit 1
        fi

        TEMPLATE="claude-code/${ROLE}.settings.json"
        if [ ! -f "$TEMPLATE" ]; then
          echo "ERROR: Template $TEMPLATE not found"
          exit 1
        fi

        # Read token from k8s Secret
        TOKEN_KEY="$(echo ${ROLE} | tr '[:lower:]' '[:upper:]')_TOKEN"
        TOKEN=$(kubectl get secret mcp-tokens -o jsonpath="{.data.${TOKEN_KEY}}" 2>/dev/null | base64 -d)
        if [ -z "$TOKEN" ]; then
          echo "ERROR: Could not read ${TOKEN_KEY} from mcp-tokens Secret"
          echo "Deploy MCP first: task mcp:deploy"
          exit 1
        fi

        export PROD_DOMAIN="{{.PROD_DOMAIN}}"
        export CLUSTER_TOKEN="$TOKEN"
        export BUSINESS_TOKEN="$TOKEN"

        OUTPUT="$HOME/.claude/settings.json"
        mkdir -p "$(dirname "$OUTPUT")"

        envsubst < "$TEMPLATE" > "$OUTPUT"
        echo "Claude Code settings written to $OUTPUT"
        echo "  Role: $ROLE"
        echo "  MCP endpoint: https://mcp-{{.PROD_DOMAIN}}"
        echo ""
        echo "Configured servers:"
        grep -o '"[a-z]*":' "$OUTPUT" | tr -d '":' | sed 's/^/  - /'
```

- [ ] **Step 7: Add claude-code:rotate-tokens task**

Add immediately after `claude-code:setup`:

```yaml
  claude-code:rotate-tokens:
    desc: Generate new MCP access tokens and update the Secret
    cmds:
      - |
        NEW_CLUSTER=$(openssl rand -hex 32)
        NEW_BUSINESS=$(openssl rand -hex 32)

        kubectl patch secret mcp-tokens --type='json' -p="[
          {\"op\":\"replace\",\"path\":\"/data/CLUSTER_TOKEN\",\"value\":\"$(echo -n $NEW_CLUSTER | base64 -w0)\"},
          {\"op\":\"replace\",\"path\":\"/data/BUSINESS_TOKEN\",\"value\":\"$(echo -n $NEW_BUSINESS | base64 -w0)\"}
        ]"

        kubectl rollout restart deployment/mcp-auth-proxy
        kubectl rollout status deployment/mcp-auth-proxy --timeout=60s

        echo "MCP tokens rotated"
        echo ""
        echo "IMPORTANT: Re-run 'task claude-code:setup -- cluster' and"
        echo "           'task claude-code:setup -- business' on each machine"
        echo "           to update the local Claude Code config."
```

- [ ] **Step 8: Update workspace:up output**

In `workspace:up` task (line 385), change:
```yaml
      - 'echo "  OpenClaw (AI): http://ai.localhost"'
```

To:
```yaml
      - 'echo "  MCP Status:   http://ai.localhost"'
```

- [ ] **Step 9: Commit**

```bash
git add Taskfile.yml
git commit -m "feat: add Claude Code setup tasks, remove OpenClaw WebUI references"
```

---

### Task 9: Validation and smoke test

**Files:** None (testing only)

- [ ] **Step 1: Validate all kustomize builds**

Run: `kustomize build k3d/ > /dev/null && echo "k3d OK"`
Expected: `k3d OK`

Run: `kustomize build deploy/mcp/ > /dev/null && echo "mcp OK"`
Expected: `mcp OK`

- [ ] **Step 2: Check for stale openclaw WebUI references**

Run: `grep -rn "openclaw-webui\|openclaw-init-job\|name: openclaw$" k3d/ prod/ deploy/ --include="*.yaml"`
Expected: No output. Note: `openclaw-config`, `openclaw-secrets`, `openclaw-rbac`, `openclaw-mcp-*` are MCP infrastructure and should still exist.

- [ ] **Step 3: Verify no broken Taskfile references**

Run: `task --list 2>&1 | grep -i "openclaw:setup"`
Expected: No output (the `workspace:openclaw:setup` task should be gone)

Run: `task --list 2>&1 | grep -i "claude-code"`
Expected: Shows `claude-code:setup` and `claude-code:rotate-tokens`

- [ ] **Step 4: Run YAML lint if available**

Run: `yamllint deploy/mcp/mcp-auth-proxy.yaml deploy/mcp/mcp-tokens.yaml deploy/mcp/mcp-status.yaml 2>&1 | head -20`
Expected: No errors (warnings about line length are OK)

- [ ] **Step 5: Commit any fixes**

If any validation step found issues, fix them and commit:
```bash
git add -A
git commit -m "fix: address validation issues from smoke test"
```
