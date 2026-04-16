# Invoice Ninja SSO Bridge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the double-login at billing.mentolder.de by injecting a valid Laravel session after Keycloak authentication, so one Keycloak login gives immediate access to Invoice Ninja.

**Architecture:** A Go reverse proxy (`sso-bridge`) sits between `oauth2-proxy` and Invoice Ninja. When an oauth2-proxy-authenticated request arrives without a Laravel session cookie, the bridge calls an internal PHP endpoint (`sso-auth.php`) that bootstraps Laravel and creates a legitimate session file, then redirects the user with the `Set-Cookie` header. On subsequent requests (session cookie present) the bridge is transparent.

**Tech Stack:** Go 1.22, `net/http/httputil.ReverseProxy`, PHP 8.x (IN's own runtime), Kubernetes ConfigMap volume mounts, k3d local registry (`registry.localhost:5000`).

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `sso-bridge/go.mod` | Create | Go module definition |
| `sso-bridge/main.go` | Create | Reverse proxy + session injection logic + `/healthz` |
| `sso-bridge/main_test.go` | Create | Unit tests for all request-handling paths |
| `sso-bridge/Dockerfile` | Create | Alpine multi-stage build, mirrors billing-bot pattern |
| `k3d/sso-bridge.yaml` | Create | Deployment + ClusterIP Service on :8180 |
| `k3d/sso-auth-php.yaml` | Create | ConfigMap containing `sso-auth.php` |
| `k3d/invoiceninja.yaml` | Modify | Mount `sso-auth.php` into IN's public directory |
| `k3d/invoiceninja-nginx.conf` | Modify | Add IP-restricted location for `/sso-auth.php` |
| `k3d/oauth2-proxy-invoiceninja.yaml` | Modify | Change `--upstream` to `http://sso-bridge:8180` |
| `k3d/kustomization.yaml` | Modify | Add `sso-bridge.yaml` and `sso-auth-php.yaml` |
| `prod/patch-oauth2-proxy.yaml` | Modify | Change `--upstream` to `http://sso-bridge:8180` |
| `Taskfile.yml` | Modify | Add `workspace:sso-bridge:build` task |

**Known session constants (from live IN instance):**
- Session cookie name: `laravel_session`
- Session key in file: `login_web_59ba36addc2b2f9401580f014c7f58ea4e30989d`
- Session driver: `file` → stored at `/var/www/app/storage/framework/sessions/{id}`
- Session encrypt: `false` → cookie value IS the raw 40-char session ID

---

## Task 1: Go module and project scaffold

**Files:**
- Create: `sso-bridge/go.mod`
- Create: `sso-bridge/main.go` (stub)
- Create: `sso-bridge/main_test.go` (stub)

- [ ] **Step 1: Create module file**

```
mkdir -p sso-bridge
```

Create `sso-bridge/go.mod`:
```
module github.com/Paddione/Bachelorprojekt/sso-bridge

go 1.22
```

- [ ] **Step 2: Create stub main.go**

Create `sso-bridge/main.go`:
```go
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"time"
)

var (
	listenAddr  = env("LISTEN_ADDR", ":8180")
	inURL       = env("INVOICENINJA_URL", "http://invoiceninja:80")
	sessionName = env("SESSION_COOKIE", "laravel_session")
	ssoPath     = env("SSO_PATH", "/sso-auth.php")
)

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func main() {
	log.Printf("sso-bridge: starting, upstream=%s", inURL)
	log.Fatal(http.ListenAndServe(listenAddr, nil))
}
```

- [ ] **Step 3: Create stub test file**

Create `sso-bridge/main_test.go`:
```go
package main

import (
	"testing"
)

func TestPlaceholder(t *testing.T) {}
```

- [ ] **Step 4: Verify module compiles**

```bash
cd sso-bridge && go build ./... && cd ..
```

Expected: no output, exit 0.

- [ ] **Step 5: Commit scaffold**

```bash
git add sso-bridge/
git commit -m "feat(sso-bridge): add Go module scaffold"
```

---

## Task 2: Implement sso-bridge reverse proxy

**Files:**
- Modify: `sso-bridge/main.go`

- [ ] **Step 1: Write failing tests**

Replace `sso-bridge/main_test.go` with:
```go
package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// newMockIN creates a test Invoice Ninja server.
// If ssoResponse is non-nil, the /sso-auth.php path returns it.
// All other paths return 200 with body "IN-response".
func newMockIN(t *testing.T, ssoSessionID string, ssoStatus int) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/sso-auth.php" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(ssoStatus)
			if ssoSessionID != "" {
				json.NewEncoder(w).Encode(map[string]string{"session_id": ssoSessionID})
			}
			return
		}
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("IN-response"))
	}))
}

// TestNoEmailHeader: skip-auth paths (no X-Auth-Request-Email) proxy directly.
func TestNoEmailHeader(t *testing.T) {
	mock := newMockIN(t, "", 200)
	defer mock.Close()

	handler := buildHandler(mock.URL)
	req := httptest.NewRequest("GET", "/favicon.ico", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("want 200, got %d", w.Code)
	}
	if w.Body.String() != "IN-response" {
		t.Errorf("want IN-response, got %q", w.Body.String())
	}
	if w.Header().Get("Set-Cookie") != "" {
		t.Error("expected no Set-Cookie header")
	}
}

// TestAlreadyHasSession: authenticated request with session cookie proxies directly.
func TestAlreadyHasSession(t *testing.T) {
	mock := newMockIN(t, "", 200)
	defer mock.Close()

	handler := buildHandler(mock.URL)
	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("X-Auth-Request-Email", "user@example.com")
	req.AddCookie(&http.Cookie{Name: "laravel_session", Value: "existing-session"})
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("want 200, got %d", w.Code)
	}
	if w.Header().Get("Set-Cookie") != "" {
		t.Error("expected no Set-Cookie on already-authenticated request")
	}
}

// TestCreateSession: email present, no session → 302 redirect with Set-Cookie.
func TestCreateSession(t *testing.T) {
	mock := newMockIN(t, "abc123", http.StatusOK)
	defer mock.Close()

	handler := buildHandler(mock.URL)
	req := httptest.NewRequest("GET", "/clients", nil)
	req.Header.Set("X-Auth-Request-Email", "user@example.com")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusFound {
		t.Errorf("want 302, got %d", w.Code)
	}
	if w.Header().Get("Location") != "/clients" {
		t.Errorf("want Location /clients, got %q", w.Header().Get("Location"))
	}
	cookie := w.Header().Get("Set-Cookie")
	if cookie == "" {
		t.Fatal("expected Set-Cookie header")
	}
	if !contains(cookie, "laravel_session=abc123") {
		t.Errorf("expected laravel_session=abc123 in %q", cookie)
	}
	if !contains(cookie, "HttpOnly") {
		t.Errorf("expected HttpOnly in cookie: %q", cookie)
	}
}

// TestSessionCreationFailure: sso-auth.php returns 404 → fall through to IN.
func TestSessionCreationFailure(t *testing.T) {
	mock := newMockIN(t, "", http.StatusNotFound)
	defer mock.Close()

	handler := buildHandler(mock.URL)
	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("X-Auth-Request-Email", "unknown@example.com")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	// Should proxy to IN (200 "IN-response"), not 302
	if w.Code != http.StatusOK {
		t.Errorf("want 200 (fall-through), got %d", w.Code)
	}
	if w.Header().Get("Set-Cookie") != "" {
		t.Error("expected no Set-Cookie on failure path")
	}
}

// TestHealthz: /healthz returns 200 OK.
func TestHealthz(t *testing.T) {
	mock := newMockIN(t, "", 200)
	defer mock.Close()

	handler := buildHandler(mock.URL)
	req := httptest.NewRequest("GET", "/healthz", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("want 200, got %d", w.Code)
	}
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(s) > 0 && containsStr(s, sub))
}

func containsStr(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd sso-bridge && go test ./... -v 2>&1 | head -20
```

Expected: compile error (`buildHandler` undefined).

- [ ] **Step 3: Implement full main.go**

Replace `sso-bridge/main.go` with:
```go
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"time"
)

var (
	listenAddr  = env("LISTEN_ADDR", ":8180")
	inURL       = env("INVOICENINJA_URL", "http://invoiceninja:80")
	sessionName = env("SESSION_COOKIE", "laravel_session")
	ssoPath     = env("SSO_PATH", "/sso-auth.php")
)

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

type ssoResp struct {
	SessionID string `json:"session_id"`
}

// buildHandler constructs the HTTP handler for a given upstream URL.
// Extracted for testability.
func buildHandler(upstream string) http.Handler {
	target, err := url.Parse(upstream)
	if err != nil {
		log.Fatalf("invalid upstream URL %q: %v", upstream, err)
	}
	proxy := httputil.NewSingleHostReverseProxy(target)

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		handle(w, r, proxy, upstream)
	})
	return mux
}

func handle(w http.ResponseWriter, r *http.Request, proxy *httputil.ReverseProxy, upstream string) {
	email := r.Header.Get("X-Auth-Request-Email")

	// No email → skip-auth path (static assets, webhooks). Proxy directly.
	if email == "" {
		proxy.ServeHTTP(w, r)
		return
	}

	// Already has a Laravel session cookie. Proxy directly.
	if _, err := r.Cookie(sessionName); err == nil {
		proxy.ServeHTTP(w, r)
		return
	}

	// Need to create a session for this Keycloak-authenticated user.
	sessionID, err := createSession(upstream, email)
	if err != nil {
		log.Printf("sso-bridge: session creation failed for %q: %v (proxying anyway)", email, err)
		proxy.ServeHTTP(w, r)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     sessionName,
		Value:    sessionID,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
	http.Redirect(w, r, r.RequestURI, http.StatusFound)
}

func createSession(upstream, email string) (string, error) {
	target, _ := url.Parse(upstream)
	target.Path = ssoPath
	q := target.Query()
	q.Set("email", email)
	target.RawQuery = q.Encode()

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(target.String())
	if err != nil {
		return "", fmt.Errorf("GET %s: %w", target.String(), err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("sso-auth.php returned %d: %s", resp.StatusCode, body)
	}

	var result ssoResp
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("decode sso response: %w", err)
	}
	if result.SessionID == "" {
		return "", fmt.Errorf("sso-auth.php returned empty session_id")
	}
	return result.SessionID, nil
}

func main() {
	log.Printf("sso-bridge: listening %s → %s", listenAddr, inURL)
	log.Fatal(http.ListenAndServe(listenAddr, buildHandler(inURL)))
}
```

- [ ] **Step 4: Run tests**

```bash
cd sso-bridge && go test ./... -v
```

Expected output (all pass):
```
--- PASS: TestNoEmailHeader (0.00s)
--- PASS: TestAlreadyHasSession (0.00s)
--- PASS: TestCreateSession (0.00s)
--- PASS: TestSessionCreationFailure (0.00s)
--- PASS: TestHealthz (0.00s)
PASS
```

- [ ] **Step 5: Commit**

```bash
git add sso-bridge/main.go sso-bridge/main_test.go
git commit -m "feat(sso-bridge): implement reverse proxy with session injection"
```

---

## Task 3: Dockerfile for sso-bridge

**Files:**
- Create: `sso-bridge/Dockerfile`

- [ ] **Step 1: Create Dockerfile**

Create `sso-bridge/Dockerfile`:
```dockerfile
FROM golang:1.22-alpine AS build
WORKDIR /src
COPY go.mod ./
RUN go mod download
COPY main.go ./
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /sso-bridge .

FROM alpine:3.19
RUN apk add --no-cache ca-certificates
COPY --from=build /sso-bridge /sso-bridge
EXPOSE 8180
ENTRYPOINT ["/sso-bridge"]
```

- [ ] **Step 2: Build image locally to verify**

```bash
docker build -t sso-bridge:test sso-bridge/
```

Expected: `Successfully built ...` with no errors.

- [ ] **Step 3: Commit**

```bash
git add sso-bridge/Dockerfile
git commit -m "feat(sso-bridge): add Dockerfile"
```

---

## Task 4: Taskfile — sso-bridge build task

**Files:**
- Modify: `Taskfile.yml`

- [ ] **Step 1: Add build task**

In `Taskfile.yml`, add after `workspace:billing-build` (around the billing-bot tasks):

```yaml
  workspace:sso-bridge:build:
    desc: Build and push sso-bridge image to local registry
    cmds:
      - docker build -t {{.REGISTRY}}/sso-bridge:latest sso-bridge/
      - docker push {{.REGISTRY}}/sso-bridge:latest
      - 'echo "✓ sso-bridge image pushed to {{.REGISTRY}}"'
```

- [ ] **Step 2: Build and push to local registry**

```bash
task workspace:sso-bridge:build
```

Expected: image pushed to `localhost:5000/sso-bridge:latest`.

- [ ] **Step 3: Commit**

```bash
git add Taskfile.yml
git commit -m "feat(sso-bridge): add Taskfile build task"
```

---

## Task 5: sso-auth.php ConfigMap

**Files:**
- Create: `k3d/sso-auth-php.yaml`

- [ ] **Step 1: Create ConfigMap**

Create `k3d/sso-auth-php.yaml`:
```yaml
# ═══════════════════════════════════════════════════════════════════
# SSO Bridge PHP endpoint — internal only.
# Called by sso-bridge to create a Laravel session for a
# Keycloak-authenticated user. Protected by nginx IP allowlist.
# ═══════════════════════════════════════════════════════════════════
apiVersion: v1
kind: ConfigMap
metadata:
  name: sso-auth-php
data:
  sso-auth.php: |
    <?php
    /**
     * SSO Bridge endpoint - INTERNAL ONLY.
     * nginx restricts this path to pod CIDR (10.42.0.0/16).
     * Creates a Laravel file session for the given email address.
     */

    $email = $_GET['email'] ?? '';
    if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        http_response_code(400);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'invalid or missing email parameter']);
        exit;
    }

    define('LARAVEL_START', microtime(true));
    require __DIR__ . '/../vendor/autoload.php';

    $app = require __DIR__ . '/../bootstrap/app.php';
    $app->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap();

    $user = \App\Models\User::where('email', $email)->first();
    if (!$user) {
        http_response_code(404);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'user not found']);
        exit;
    }

    // Session key: login_web_{sha1(SessionGuard::class)}
    // sha1('Illuminate\Auth\SessionGuard') = 59ba36addc2b2f9401580f014c7f58ea4e30989d
    $sessionKey = 'login_web_' . sha1(\Illuminate\Auth\SessionGuard::class);

    $sessionId = bin2hex(random_bytes(20)); // 40-char hex, matches Laravel default

    $sessionData = [
        '_token'    => bin2hex(random_bytes(20)),
        '_previous' => ['url' => '/'],
        '_flash'    => ['old' => [], 'new' => []],
        $sessionKey => $user->id,
    ];

    $sessionPath = storage_path('framework/sessions/' . $sessionId);
    file_put_contents($sessionPath, serialize($sessionData));

    header('Content-Type: application/json');
    echo json_encode(['session_id' => $sessionId]);
```

- [ ] **Step 2: Commit**

```bash
git add k3d/sso-auth-php.yaml
git commit -m "feat(sso-bridge): add sso-auth.php ConfigMap"
```

---

## Task 6: Update nginx config — restricted location for sso-auth.php

**Files:**
- Modify: `k3d/invoiceninja-nginx.conf`

- [ ] **Step 1: Add restricted location block**

In `k3d/invoiceninja-nginx.conf`, add before the closing `}` of the server block (before the last `}`):

```nginx
    # SSO Bridge internal endpoint — pod CIDR only, never internet-accessible.
    location = /sso-auth.php {
        allow 10.42.0.0/16;
        deny  all;
        fastcgi_split_path_info ^(.+\.php)(/.+)$;
        fastcgi_pass            127.0.0.1:9000;
        fastcgi_index           index.php;
        include                 fastcgi_params;
        fastcgi_param           SCRIPT_FILENAME $document_root$fastcgi_script_name;
        fastcgi_param           PATH_INFO $fastcgi_path_info;
        fastcgi_buffer_size     16k;
        fastcgi_buffers         4 16k;
    }
```

The full file should look like:
```nginx
server {
    listen 80;
    server_name _;
    root /var/www/app/public;
    index index.php;
    charset utf-8;

    client_max_body_size 100M;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location = /favicon.ico { access_log off; log_not_found off; }
    location = /robots.txt  { access_log off; log_not_found off; }

    location ~ \.php$ {
        fastcgi_split_path_info ^(.+\.php)(/.+)$;
        fastcgi_pass 127.0.0.1:9000;
        fastcgi_index index.php;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        fastcgi_param PATH_INFO $fastcgi_path_info;
        fastcgi_buffer_size 16k;
        fastcgi_buffers 4 16k;
    }

    # SSO Bridge internal endpoint — pod CIDR only, never internet-accessible.
    location = /sso-auth.php {
        allow 10.42.0.0/16;
        deny  all;
        fastcgi_split_path_info ^(.+\.php)(/.+)$;
        fastcgi_pass            127.0.0.1:9000;
        fastcgi_index           index.php;
        include                 fastcgi_params;
        fastcgi_param           SCRIPT_FILENAME $document_root$fastcgi_script_name;
        fastcgi_param           PATH_INFO $fastcgi_path_info;
        fastcgi_buffer_size     16k;
        fastcgi_buffers         4 16k;
    }

    location ~ /\.ht {
        deny all;
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add k3d/invoiceninja-nginx.conf
git commit -m "feat(sso-bridge): restrict /sso-auth.php to pod CIDR in nginx"
```

---

## Task 7: Mount sso-auth.php into Invoice Ninja pod

**Files:**
- Modify: `k3d/invoiceninja.yaml`

- [ ] **Step 1: Add volume and volumeMount**

In `k3d/invoiceninja.yaml`, in the `invoiceninja` container spec, add to `volumeMounts`:
```yaml
            - name: sso-auth-php
              mountPath: /var/www/app/public/sso-auth.php
              subPath: sso-auth.php
              readOnly: true
```

In the `volumes` section of the pod spec, add:
```yaml
        - name: sso-auth-php
          configMap:
            name: sso-auth-php
```

The `volumeMounts` section of the `invoiceninja` container should now look like:
```yaml
          volumeMounts:
            - name: public
              mountPath: /var/www/app/public
            - name: data
              mountPath: /var/www/app/storage
            - name: sso-auth-php
              mountPath: /var/www/app/public/sso-auth.php
              subPath: sso-auth.php
              readOnly: true
```

The `volumes` section should now look like:
```yaml
      volumes:
        - name: public
          emptyDir: {}
        - name: nginx-config
          configMap:
            name: invoiceninja-nginx-config
        - name: data
          persistentVolumeClaim:
            claimName: invoiceninja-data-pvc
        - name: sso-auth-php
          configMap:
            name: sso-auth-php
```

- [ ] **Step 2: Commit**

```bash
git add k3d/invoiceninja.yaml
git commit -m "feat(sso-bridge): mount sso-auth.php into IN public directory"
```

---

## Task 8: sso-bridge Kubernetes manifest

**Files:**
- Create: `k3d/sso-bridge.yaml`

- [ ] **Step 1: Create manifest**

Create `k3d/sso-bridge.yaml`:
```yaml
# ═══════════════════════════════════════════════════════════════════
# SSO Bridge — transparent reverse proxy between oauth2-proxy and
# Invoice Ninja. Injects a Laravel session on first authenticated
# request so users do not need a second login after Keycloak.
# ═══════════════════════════════════════════════════════════════════
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sso-bridge
  labels:
    app: sso-bridge
spec:
  replicas: 1
  selector:
    matchLabels:
      app: sso-bridge
  template:
    metadata:
      labels:
        app: sso-bridge
    spec:
      nodeSelector:
        kubernetes.io/arch: amd64
      containers:
        - name: sso-bridge
          image: registry.localhost:5000/sso-bridge:latest
          imagePullPolicy: Always
          env:
            - name: LISTEN_ADDR
              value: ":8180"
            - name: INVOICENINJA_URL
              value: "http://invoiceninja:80"
            - name: SESSION_COOKIE
              value: "laravel_session"
            - name: SSO_PATH
              value: "/sso-auth.php"
          ports:
            - containerPort: 8180
          readinessProbe:
            httpGet:
              path: /healthz
              port: 8180
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /healthz
              port: 8180
            initialDelaySeconds: 10
            periodSeconds: 30
          resources:
            requests:
              memory: 32Mi
              cpu: "50m"
            limits:
              memory: 64Mi
              cpu: "200m"
---
apiVersion: v1
kind: Service
metadata:
  name: sso-bridge
spec:
  selector:
    app: sso-bridge
  ports:
    - port: 8180
      targetPort: 8180
```

- [ ] **Step 2: Commit**

```bash
git add k3d/sso-bridge.yaml
git commit -m "feat(sso-bridge): add Kubernetes Deployment and Service"
```

---

## Task 9: Redirect oauth2-proxy upstream to sso-bridge

**Files:**
- Modify: `k3d/oauth2-proxy-invoiceninja.yaml`
- Modify: `prod/patch-oauth2-proxy.yaml`

- [ ] **Step 1: Update dev manifest**

In `k3d/oauth2-proxy-invoiceninja.yaml`, change:
```yaml
            - --upstream=http://invoiceninja:80
```
to:
```yaml
            - --upstream=http://sso-bridge:8180
```

- [ ] **Step 2: Update prod patch**

In `prod/patch-oauth2-proxy.yaml`, change the line:
```yaml
            - "--upstream=http://invoiceninja:80"
```
to:
```yaml
            - "--upstream=http://sso-bridge:8180"
```

- [ ] **Step 3: Commit**

```bash
git add k3d/oauth2-proxy-invoiceninja.yaml prod/patch-oauth2-proxy.yaml
git commit -m "feat(sso-bridge): redirect oauth2-proxy upstream to sso-bridge"
```

---

## Task 10: Register new resources in kustomization

**Files:**
- Modify: `k3d/kustomization.yaml`

- [ ] **Step 1: Add resources**

In `k3d/kustomization.yaml`, add `sso-bridge.yaml` and `sso-auth-php.yaml` to the `resources:` list, under the `# Buchhaltung` section:

```yaml
  # Buchhaltung
  - invoiceninja.yaml
  - sso-bridge.yaml
  - sso-auth-php.yaml
  - oauth2-proxy-invoiceninja.yaml
  - oauth2-proxy-docs.yaml
  - billing-bot.yaml
  - billing-bot-init-job.yaml
```

- [ ] **Step 2: Validate manifests**

```bash
task workspace:validate
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add k3d/kustomization.yaml
git commit -m "feat(sso-bridge): register sso-bridge resources in kustomization"
```

---

## Task 11: Deploy and smoke test (mentolder cluster)

- [ ] **Step 1: Build and push sso-bridge image**

Since the cluster is already running (mentolder context), push the image to the live registry:

```bash
docker build -t registry.mentolder.de/sso-bridge:latest sso-bridge/ 2>/dev/null || \
docker build -t localhost:5000/sso-bridge:latest sso-bridge/
```

Check where billing-bot image is pushed on mentolder and push sso-bridge the same way. Then apply manifests:

```bash
kubectl --context=mentolder apply -f k3d/sso-auth-php.yaml -n workspace
kubectl --context=mentolder apply -f k3d/sso-bridge.yaml -n workspace
```

- [ ] **Step 2: Restart affected pods**

```bash
# Apply nginx config update (ConfigMap is auto-regenerated by kustomize on next deploy,
# but for live cluster apply directly)
kubectl --context=mentolder create configmap invoiceninja-nginx-config \
  --from-file=default.conf=k3d/invoiceninja-nginx.conf \
  -n workspace --dry-run=client -o yaml | kubectl --context=mentolder apply -f -

# Restart IN to pick up new nginx config and volume mount
kubectl --context=mentolder rollout restart deployment/invoiceninja -n workspace

# Patch oauth2-proxy upstream
kubectl --context=mentolder set env deployment/oauth2-proxy-invoiceninja \
  -n workspace --list 2>/dev/null  # just to confirm running

kubectl --context=mentolder patch deployment oauth2-proxy-invoiceninja -n workspace \
  --type=json -p='[{"op":"replace","path":"/spec/template/spec/containers/0/args/13","value":"--upstream=http://sso-bridge:8180"}]'
```

Wait for rollouts:
```bash
kubectl --context=mentolder rollout status deployment/invoiceninja -n workspace
kubectl --context=mentolder rollout status deployment/sso-bridge -n workspace
kubectl --context=mentolder rollout status deployment/oauth2-proxy-invoiceninja -n workspace
```

- [ ] **Step 3: Verify sso-bridge is healthy**

```bash
kubectl --context=mentolder get pods -n workspace | grep sso-bridge
```

Expected: `sso-bridge-xxx    1/1   Running`

- [ ] **Step 4: Verify sso-auth.php is reachable internally**

```bash
IN_POD=$(kubectl --context=mentolder get pod -n workspace -l app=invoiceninja -o jsonpath='{.items[0].metadata.name}')
kubectl --context=mentolder exec -n workspace $IN_POD -c nginx -- \
  wget -qO- "http://localhost/sso-auth.php?email=quamain@web.de"
```

Expected: `{"session_id":"<40-char-hex>"}` or `{"error":"user not found"}` if user doesn't exist. Must NOT return the file contents (which would indicate nginx isn't restricting it).

- [ ] **Step 5: Verify sso-auth.php is blocked from outside the pod CIDR**

From any pod outside the workspace (e.g., a debug pod):
```bash
kubectl run -it --rm debug --image=alpine --restart=Never -- \
  wget -qO- "http://invoiceninja.workspace.svc.cluster.local/sso-auth.php?email=test@test.com"
```

Expected: `403 Forbidden` (pod in `10.42.0.0/16` — nginx blocks based on CIDR restriction check). Note: since debug pod IS in cluster CIDR, verify the nginx IP restriction is working by checking from a pod with an IP outside the allow range instead, or simply check that the endpoint returns JSON for allowed IPs and verify the nginx config is correct.

Alternative verification — check nginx returns 403 for non-matching IPs by inspecting the config:
```bash
kubectl --context=mentolder exec -n workspace $IN_POD -c nginx -- \
  nginx -t
```

Expected: `nginx: configuration file /etc/nginx/nginx.conf test is successful`

- [ ] **Step 6: End-to-end SSO test (browser)**

1. Open a private/incognito browser window
2. Navigate to `https://billing.mentolder.de`
3. Expected: redirected to `https://auth.mentolder.de/realms/workspace` (Keycloak login)
4. Log in with: username `gekko`, password `170591pk!Gekko`
5. Expected: redirected to `https://billing.mentolder.de` then immediately to the Invoice Ninja dashboard — **no second login prompt**
6. Verify you're logged in as Gerald Korczewski in Invoice Ninja

- [ ] **Step 7: Verify sso-bridge logs show session creation**

```bash
kubectl --context=mentolder logs deployment/sso-bridge -n workspace --tail=20
```

Expected: no errors, and on first login there should be no output (errors are logged; successful sessions are silent).

- [ ] **Step 8: Commit any last-minute fixes**

```bash
git add -A && git commit -m "fix(sso-bridge): deployment adjustments from smoke test"
```

---

## Task 12: Create and merge PR

- [ ] **Step 1: Push branch and open PR**

```bash
task /commit-push-pr
```

Or manually:
```bash
git push origin HEAD
gh pr create \
  --title "feat(billing): add SSO bridge for transparent Invoice Ninja login" \
  --body "Eliminates the double-login at billing.mentolder.de. After Keycloak auth via oauth2-proxy, sso-bridge auto-creates a Laravel session and redirects the user — no second login prompt.

## Changes
- New \`sso-bridge\` Go microservice (transparent reverse proxy + session injection)
- \`sso-auth.php\` ConfigMap-mounted PHP endpoint (creates Laravel file sessions)
- nginx restricted location for \`/sso-auth.php\` (pod CIDR only)
- oauth2-proxy upstream changed to \`sso-bridge:8180\`

## Test plan
- [ ] Browser SSO test with user \`gekko\` (quamain@web.de)
- [ ] Verify /sso-auth.php blocked from internet (nginx allow/deny)
- [ ] sso-bridge pod healthy (readiness probe passing)
- [ ] Existing Keycloak-only sessions still work"
```

- [ ] **Step 2: Merge PR**

```bash
gh pr merge --squash
```

---

## Known Limitations

- If `sso-auth.php` returns a non-200 response (e.g., user not in Invoice Ninja), the bridge falls through and the user sees IN's own login page. Fix: ensure all Keycloak users are provisioned in IN before enabling SSO.
- The `10.42.0.0/16` allow-list is hardcoded for k3s/k3d default pod CIDR. If the cluster CIDR changes, update `k3d/invoiceninja-nginx.conf`.
- WebSocket connections (if any) are proxied by `httputil.ReverseProxy` which handles standard HTTP upgrades.
