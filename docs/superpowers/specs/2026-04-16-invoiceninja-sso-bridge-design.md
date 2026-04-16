# Invoice Ninja SSO Bridge — Design Spec

**Date:** 2026-04-16  
**Status:** Approved

## Problem

`billing.mentolder.de` requires two separate logins:
1. Keycloak (via oauth2-proxy)
2. Invoice Ninja's own login form

The goal is transparent single sign-on: one Keycloak login automatically establishes an Invoice Ninja session.

## Constraints

- Invoice Ninja v5 (Laravel 12) has no native generic OIDC support — only Google OAuth, Microsoft Graph, and Apple Sign-In.
- Session cookie (`laravel_session`) is **unencrypted** — the cookie value is the raw session ID.
- Session driver is **file** — sessions stored at `/var/www/app/storage/framework/sessions/{id}`.
- Login guard key: `login_web_59ba36addc2b2f9401580f014c7f58ea4e30989d`
- Must not modify Invoice Ninja's source or vendor code.
- Must not introduce a new container registry dependency (follow billing-bot pattern).

## Architecture

```
User
  → Traefik (TLS termination)
  → oauth2-proxy           Keycloak OIDC gate (unchanged)
                           Sets X-Auth-Request-Email on authenticated requests
  → sso-bridge             New session injection layer
  → Invoice Ninja (nginx)  Unchanged
```

The only change to the existing stack is:
- `oauth2-proxy --upstream` changes from `http://invoiceninja:80` → `http://sso-bridge:8180`

## Components

### 1. sso-bridge (Go microservice)

**What it does:**  
Transparent reverse proxy with session injection logic. Runs as a new Deployment in the `workspace` namespace, exposed on ClusterIP port 8180.

**Request handling logic:**

```
Receive request (from oauth2-proxy)
├── No X-Auth-Request-Email header
│   └── Proxy directly to invoiceninja:80  (skip-auth paths: static assets, webhooks)
├── X-Auth-Request-Email present + laravel_session cookie present
│   └── Proxy directly to invoiceninja:80  (user already has IN session)
└── X-Auth-Request-Email present + no laravel_session cookie
    ├── GET http://invoiceninja:80/sso-auth.php?email={email}
    ├── Parse {"session_id": "abc123..."}
    └── 302 to original path
        Set-Cookie: laravel_session=abc123; Path=/; HttpOnly; SameSite=Lax
```

After the redirect, the browser carries `laravel_session`, the bridge proxies the request straight through, and Invoice Ninja finds the session file and serves the authenticated dashboard.

**Implementation:**  
`httputil.ReverseProxy` for transparent proxying (handles all methods, streaming, response headers including IN-set cookies). Session creation is a simple `http.Get` to the internal PHP endpoint.

**Files:**
- `sso-bridge/main.go` — ~200 lines
- `sso-bridge/go.mod`
- `sso-bridge/Dockerfile` — Alpine multi-stage build
- `k3d/sso-bridge.yaml` — Deployment + ClusterIP Service (:8180)

---

### 2. sso-auth.php (ConfigMap-mounted PHP endpoint)

**What it does:**  
Bootstraps Laravel minimally (Eloquent + file session driver), finds the user by email, creates a legitimate session file in IN's storage volume, returns the session ID as JSON.

**Protection:** nginx `allow 10.42.0.0/16; deny all` — the pod CIDR. Unreachable from the internet.

**Session file written:** `storage/framework/sessions/{random_40_char_id}` containing a PHP-serialized array with `login_web_59ba36addc2b2f9401580f014c7f58ea4e30989d => {user_id}` and a CSRF `_token`.

**Returns:** `{"session_id": "abc123..."}` on success, `404` if email not found, `403` if caller not in pod CIDR.

**Files:**
- `k3d/sso-auth-php.yaml` — ConfigMap with PHP content

---

### 3. Invoice Ninja pod updates

**nginx config** (`k3d/invoiceninja-nginx.conf`):  
Add a dedicated restricted location for `/sso-auth.php`:
```nginx
location = /sso-auth.php {
    allow 10.42.0.0/16;
    deny  all;
    fastcgi_pass            127.0.0.1:9000;
    fastcgi_split_path_info ^(.+\.php)(/.+)$;
    include                 fastcgi_params;
    fastcgi_param           SCRIPT_FILENAME $document_root$fastcgi_script_name;
}
```

**IN Deployment** (`k3d/invoiceninja.yaml`):  
Add a `volumeMount` + `volume` entry that mounts the `sso-auth-php` ConfigMap as `/var/www/app/public/sso-auth.php`.

---

### 4. oauth2-proxy update

`k3d/oauth2-proxy-invoiceninja.yaml`: change one arg:
```
--upstream=http://sso-bridge:8180
```
All other args unchanged (Keycloak client, cookie config, skip-auth-regex, etc.).

---

### 5. Kustomization + Taskfile

- `k3d/kustomization.yaml` — add `sso-bridge.yaml` and `sso-auth-php.yaml` to resources
- `Taskfile.yml` — add `workspace:sso-bridge:build` task (build + k3d image import, mirrors `workspace:billing-setup`)

---

## Data Flow (first visit)

```
1. GET billing.mentolder.de/
2. oauth2-proxy: no _oauth2_proxy_billing cookie → redirect to auth.mentolder.de
3. User logs into Keycloak (username: gekko, password: 170591pk!Gekko)
4. Keycloak redirects back to /oauth2/callback
5. oauth2-proxy validates, sets X-Auth-Request-Email: quamain@web.de, forwards to sso-bridge
6. sso-bridge: no laravel_session cookie
7. sso-bridge → GET http://invoiceninja:80/sso-auth.php?email=quamain%40web.de
8. sso-auth.php: finds user (id=4), creates session file, returns {"session_id":"xyz..."}
9. sso-bridge → 302 / with Set-Cookie: laravel_session=xyz...; Path=/; HttpOnly; SameSite=Lax
10. Browser follows redirect, sends laravel_session=xyz...
11. sso-bridge: email present + session cookie present → proxy to invoiceninja:80
12. Invoice Ninja reads session file → user is authenticated → serves dashboard
```

## Security Analysis

| Threat | Mitigation |
|--------|-----------|
| Direct internet access to `/sso-auth.php` | nginx `allow 10.42.0.0/16; deny all` — pod CIDR only, no route from internet |
| Forged `X-Auth-Request-Email` header by end user | Header only trusted when set by oauth2-proxy; end-user requests go through oauth2-proxy first which overwrites this header |
| Session fixation | PHP endpoint generates a fresh random session ID on every call via `Str::random(40)` |
| Expired/revoked Keycloak session | oauth2-proxy handles token refresh (`--cookie-refresh=1h`); failed refresh triggers Keycloak re-auth |
| Bridge calling arbitrary URLs | Bridge only calls the hardcoded `http://invoiceninja:80/sso-auth.php` endpoint, email is URL-encoded |

## Files Changed / Created

| File | Type |
|------|------|
| `sso-bridge/main.go` | New |
| `sso-bridge/go.mod` | New |
| `sso-bridge/Dockerfile` | New |
| `k3d/sso-bridge.yaml` | New — Deployment + Service |
| `k3d/sso-auth-php.yaml` | New — ConfigMap |
| `k3d/invoiceninja.yaml` | Modified — volumeMount for sso-auth.php |
| `k3d/invoiceninja-nginx.conf` | Modified — add restricted location |
| `k3d/oauth2-proxy-invoiceninja.yaml` | Modified — upstream URL |
| `k3d/kustomization.yaml` | Modified — add new resources |
| `Taskfile.yml` | Modified — add sso-bridge build task |

## Out of Scope

- korczewski.de deployment (apply separately after mentolder.de is validated)
- Automatic user provisioning (new Keycloak users still need a manual IN account created)
- WebSocket support in the bridge (not required by IN's web UI)
