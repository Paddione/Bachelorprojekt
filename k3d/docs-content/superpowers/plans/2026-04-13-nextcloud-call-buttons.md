# Nextcloud Call Buttons in Mattermost — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/call` slash command to Mattermost on all three clusters (dev, korczewski, mentolder) that creates a fresh Nextcloud Talk room on demand and posts a "Join Call" link card to the channel.

**Architecture:** `/call` is registered as a Mattermost slash command pointing to the existing billing-bot `/slash` endpoint. When invoked, billing-bot calls the Nextcloud OCS Talk API to create a public room, then responds with an in-channel message attachment containing a clickable call link.

**Tech Stack:** Go (billing-bot), Mattermost REST API v4, Nextcloud OCS API v2 / Talk API v4, Kubernetes (k3d + prod overlays), Bash (slash-command registration script), go-task.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `billing-bot/main.go` | Add NC config vars, `NCRoomResponse` type, `Title`/`TitleLink` on `Attachment`, dispatch `/call` in `handleSlash`, add `handleCallCommand` + `createNextcloudRoom` |
| Modify | `billing-bot/main_test.go` | Tests for new `/call` handler and NC room creation |
| Modify | `k3d/billing-bot.yaml` | Add 5 new env vars for NC access |
| Modify | `prod/patch-billing-bot.yaml` | Override `SCHEME=https` for prod |
| Create | `scripts/call-setup.sh` | Register `/call` slash command in all Mattermost teams |
| Modify | `Taskfile.yml` | Add `workspace:call-setup`, `workspace:call-setup:all-prods`; append call-setup to `workspace:up` |

---

## Task 1: Extend Attachment struct and add NC config vars

**Files:**
- Modify: `billing-bot/main.go` (config block ~L23, Attachment struct ~L68)

- [ ] **Step 1: Add `Title` and `TitleLink` to the `Attachment` struct**

In `billing-bot/main.go`, replace the existing `Attachment` struct:

```go
type Attachment struct {
	Text      string   `json:"text,omitempty"`
	Color     string   `json:"color,omitempty"`
	Title     string   `json:"title,omitempty"`
	TitleLink string   `json:"title_link,omitempty"`
	Actions   []Action `json:"actions,omitempty"`
}
```

- [ ] **Step 2: Add NC config vars to the `var` block**

After `billingDomain = env("BILLING_DOMAIN", "billing.localhost")`, add:

```go
	// Nextcloud Talk config (for /call command)
	nextcloudURL       = env("NEXTCLOUD_URL", "http://nextcloud.workspace.svc.cluster.local:80")
	nextcloudAdminUser = env("NEXTCLOUD_ADMIN_USER", "admin")
	nextcloudAdminPass = env("NEXTCLOUD_ADMIN_PASSWORD", "")
	ncDomain           = env("NC_DOMAIN", "files.localhost")
	scheme             = env("SCHEME", "https")
```

- [ ] **Step 3: Add startup warning for missing NC password**

At the top of `main()`, after the `log.Printf("billing-bot listening on %s", listenAddr)` line, add:

```go
	if nextcloudAdminPass == "" {
		log.Printf("WARNING: NEXTCLOUD_ADMIN_PASSWORD not set — /call command will return errors")
	}
```

- [ ] **Step 4: Build to verify no compile errors**

```bash
cd billing-bot && go build ./...
```

Expected: no output (success).

- [ ] **Step 5: Commit**

```bash
git add billing-bot/main.go
git commit -m "feat(billing-bot): add Attachment Title/TitleLink fields and NC config vars"
```

---

## Task 2: Add NCRoomResponse type and createNextcloudRoom function

**Files:**
- Modify: `billing-bot/main.go` (after IN types ~L145)
- Modify: `billing-bot/main_test.go`

- [ ] **Step 1: Write a failing test for `createNextcloudRoom`**

In `billing-bot/main_test.go`, add this test at the end of the file:

```go
func TestCreateNextcloudRoomParsesToken(t *testing.T) {
	// Mock Nextcloud OCS API
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			t.Errorf("Expected POST, got %s", r.Method)
		}
		if r.Header.Get("OCS-APIRequest") != "true" {
			t.Error("Missing OCS-APIRequest header")
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, `{"ocs":{"meta":{"status":"ok","statuscode":200},"data":{"token":"abc123xyz"}}}`)
	}))
	defer srv.Close()

	// Temporarily override the NC URL
	orig := nextcloudURL
	nextcloudURL = srv.URL
	origPass := nextcloudAdminPass
	nextcloudAdminPass = "testpass"
	defer func() { nextcloudURL = orig; nextcloudAdminPass = origPass }()

	token, err := createNextcloudRoom("general")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if token != "abc123xyz" {
		t.Errorf("expected token abc123xyz, got %s", token)
	}
}

func TestCreateNextcloudRoomNoPassword(t *testing.T) {
	orig := nextcloudAdminPass
	nextcloudAdminPass = ""
	defer func() { nextcloudAdminPass = orig }()

	_, err := createNextcloudRoom("general")
	if err == nil {
		t.Error("expected error when password is empty")
	}
}
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd billing-bot && go test ./... -run TestCreateNextcloudRoom -v
```

Expected: `FAIL — undefined: createNextcloudRoom`

- [ ] **Step 3: Add `NCRoomResponse` type and `createNextcloudRoom` function**

In `billing-bot/main.go`, after the last `IN*` type (around L143), add:

```go
// ── Nextcloud Talk Types ─────────────────────────────────────────

type NCRoomResponse struct {
	OCS struct {
		Data struct {
			Token string `json:"token"`
		} `json:"data"`
	} `json:"ocs"`
}

// ── Nextcloud Talk ───────────────────────────────────────────────

// createNextcloudRoom creates a fresh public Nextcloud Talk room named
// "#<channelName> Call" and returns its token.
func createNextcloudRoom(channelName string) (string, error) {
	if nextcloudAdminPass == "" {
		return "", fmt.Errorf("NEXTCLOUD_ADMIN_PASSWORD not configured")
	}

	body, _ := json.Marshal(map[string]interface{}{
		"roomType": 3,
		"roomName": "#" + channelName + " Call",
	})

	req, err := http.NewRequest("POST",
		nextcloudURL+"/ocs/v2.php/apps/spreed/api/v4/room",
		bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("build request: %w", err)
	}
	req.SetBasicAuth(nextcloudAdminUser, nextcloudAdminPass)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("OCS-APIRequest", "true")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("call NC API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		b, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("NC API returned %d: %s", resp.StatusCode, b)
	}

	var ncResp NCRoomResponse
	if err := json.NewDecoder(resp.Body).Decode(&ncResp); err != nil {
		return "", fmt.Errorf("decode NC response: %w", err)
	}

	if ncResp.OCS.Data.Token == "" {
		return "", fmt.Errorf("NC API returned empty token")
	}

	return ncResp.OCS.Data.Token, nil
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
cd billing-bot && go test ./... -run TestCreateNextcloudRoom -v
```

Expected:
```
--- PASS: TestCreateNextcloudRoomParsesToken (0.00s)
--- PASS: TestCreateNextcloudRoomNoPassword (0.00s)
PASS
```

- [ ] **Step 5: Commit**

```bash
git add billing-bot/main.go billing-bot/main_test.go
git commit -m "feat(billing-bot): add createNextcloudRoom — OCS Talk API room creation"
```

---

## Task 3: Add handleCallCommand and wire /call into handleSlash

**Files:**
- Modify: `billing-bot/main.go` (handleSlash ~L167, add handleCallCommand)
- Modify: `billing-bot/main_test.go`

- [ ] **Step 1: Write failing tests for the /call slash handler**

In `billing-bot/main_test.go`, add:

```go
func TestHandleSlashCallNoPassword(t *testing.T) {
	orig := nextcloudAdminPass
	nextcloudAdminPass = ""
	defer func() { nextcloudAdminPass = orig }()

	form := url.Values{}
	form.Add("command", "/call")
	form.Add("channel_name", "general")
	form.Add("channel_id", "ch1")
	form.Add("user_id", "u1")
	form.Add("user_name", "testuser")

	req := httptest.NewRequest("POST", "/slash", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	w := httptest.NewRecorder()

	handleSlash(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d", w.Code)
	}
	var resp SlashResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if resp.ResponseType != "ephemeral" {
		t.Errorf("expected ephemeral on error, got %s", resp.ResponseType)
	}
	if !strings.Contains(resp.Text, "Fehler") {
		t.Errorf("expected Fehler in error text, got: %s", resp.Text)
	}
}

func TestHandleSlashCallSuccess(t *testing.T) {
	// Mock Nextcloud Talk API
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"ocs":{"meta":{"status":"ok","statuscode":200},"data":{"token":"testtoken99"}}}`)
	}))
	defer srv.Close()

	origURL := nextcloudURL
	nextcloudURL = srv.URL
	origPass := nextcloudAdminPass
	nextcloudAdminPass = "pass"
	origDomain := ncDomain
	ncDomain = "files.example.com"
	origScheme := scheme
	scheme = "https"
	defer func() {
		nextcloudURL = origURL
		nextcloudAdminPass = origPass
		ncDomain = origDomain
		scheme = origScheme
	}()

	form := url.Values{}
	form.Add("command", "/call")
	form.Add("channel_name", "general")
	form.Add("channel_id", "ch1")
	form.Add("user_id", "u1")
	form.Add("user_name", "testuser")

	req := httptest.NewRequest("POST", "/slash", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	w := httptest.NewRecorder()

	handleSlash(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d", w.Code)
	}
	var resp SlashResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if resp.ResponseType != "in_channel" {
		t.Errorf("expected in_channel, got %s", resp.ResponseType)
	}
	if len(resp.Attachments) == 0 {
		t.Fatal("expected at least one attachment")
	}
	att := resp.Attachments[0]
	if !strings.Contains(att.TitleLink, "testtoken99") {
		t.Errorf("expected call URL with token in TitleLink, got: %s", att.TitleLink)
	}
	if !strings.Contains(att.Text, "general") {
		t.Errorf("expected channel name in text, got: %s", att.Text)
	}
}
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd billing-bot && go test ./... -run TestHandleSlashCall -v
```

Expected: `FAIL` — the `/call` command currently hits the `default` case in handleSlash and returns "Unbekannter Befehl", not the expected responses.

- [ ] **Step 3: Fix handleSlash to read the command field**

In `handleSlash`, update the `req` struct initialization to read the `command` form value. Find the block starting at ~L173 and replace:

```go
	req := SlashRequest{
		ChannelID:   r.FormValue("channel_id"),
		ChannelName: r.FormValue("channel_name"),
		UserID:      r.FormValue("user_id"),
		UserName:    r.FormValue("user_name"),
		Text:        strings.TrimSpace(r.FormValue("text")),
		ResponseURL: r.FormValue("response_url"),
	}
```

with:

```go
	req := SlashRequest{
		Command:     r.FormValue("command"),
		ChannelID:   r.FormValue("channel_id"),
		ChannelName: r.FormValue("channel_name"),
		UserID:      r.FormValue("user_id"),
		UserName:    r.FormValue("user_name"),
		Text:        strings.TrimSpace(r.FormValue("text")),
		ResponseURL: r.FormValue("response_url"),
	}
```

- [ ] **Step 4: Add /call dispatch to the switch in handleSlash**

In `handleSlash`, add a new case BEFORE the existing `case req.Text == "" || req.Text == "help":` line:

```go
	switch {
	case req.Command == "/call":
		resp = handleCallCommand(req)
	case req.Text == "" || req.Text == "help":
```

- [ ] **Step 5: Add handleCallCommand function**

After the `handleSlash` function (around ~L206), add:

```go
// handleCallCommand handles the /call slash command.
// It creates a fresh Nextcloud Talk room and returns an in-channel message
// with a clickable "Join Call" card. On error it returns an ephemeral message.
func handleCallCommand(req SlashRequest) SlashResponse {
	token, err := createNextcloudRoom(req.ChannelName)
	if err != nil {
		log.Printf("handleCallCommand: createNextcloudRoom error: %v", err)
		return SlashResponse{
			ResponseType: "ephemeral",
			Text:         "Fehler: Nextcloud Talk-Raum konnte nicht erstellt werden. Bitte versuche es erneut.",
		}
	}

	callURL := fmt.Sprintf("%s://%s/apps/spreed/call/%s", scheme, ncDomain, token)

	return SlashResponse{
		ResponseType: "in_channel",
		Attachments: []Attachment{
			{
				Color:     "#1f9b00",
				Text:      fmt.Sprintf("📹 **#%s Call** gestartet", req.ChannelName),
				Title:     "▶ Join Call",
				TitleLink: callURL,
			},
		},
	}
}
```

- [ ] **Step 6: Run the tests to confirm they pass**

```bash
cd billing-bot && go test ./... -v
```

Expected: all tests pass, including the two new `TestHandleSlashCall*` tests.

- [ ] **Step 7: Commit**

```bash
git add billing-bot/main.go billing-bot/main_test.go
git commit -m "feat(billing-bot): add /call slash command handler with Nextcloud Talk room creation"
```

---

## Task 4: Add env vars to k3d/billing-bot.yaml

**Files:**
- Modify: `k3d/billing-bot.yaml`

- [ ] **Step 1: Read the current env block**

Open `k3d/billing-bot.yaml` and find the `env:` section of the `billing-bot` container. It ends with the `BILLING_DOMAIN` configMapKeyRef entry.

- [ ] **Step 2: Add the five new env vars**

After the `BILLING_DOMAIN` env entry, add:

```yaml
            - name: NEXTCLOUD_URL
              value: "http://nextcloud.workspace.svc.cluster.local:80"
            - name: NEXTCLOUD_ADMIN_USER
              value: "admin"
            - name: NEXTCLOUD_ADMIN_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: workspace-secrets
                  key: NEXTCLOUD_ADMIN_PASSWORD
            - name: NC_DOMAIN
              valueFrom:
                configMapKeyRef:
                  name: domain-config
                  key: NC_DOMAIN
            - name: SCHEME
              value: "http"
```

- [ ] **Step 3: Validate the manifest**

```bash
kubectl kustomize k3d/ > /dev/null && echo "OK"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add k3d/billing-bot.yaml
git commit -m "feat(k8s): add Nextcloud env vars to billing-bot deployment"
```

---

## Task 5: Add SCHEME=https to prod overlay

**Files:**
- Modify: `prod/patch-billing-bot.yaml`

- [ ] **Step 1: Read current prod patch**

The file currently looks like:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: billing-bot
spec:
  template:
    spec:
      imagePullSecrets:
        - name: ghcr-pull-secret
      containers:
        - name: billing-bot
          image: ghci.io/paddione/billing-bot:latest
          imagePullPolicy: Always
```

- [ ] **Step 2: Add the SCHEME env var override**

Append to the `containers[0]` section:

```yaml
          env:
            - name: SCHEME
              value: "https"
```

The full file should now be:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: billing-bot
spec:
  template:
    spec:
      imagePullSecrets:
        - name: ghcr-pull-secret
      containers:
        - name: billing-bot
          image: ghcr.io/paddione/billing-bot:latest
          imagePullPolicy: Always
          env:
            - name: SCHEME
              value: "https"
```

- [ ] **Step 3: Validate the prod kustomization**

```bash
kubectl kustomize prod/ > /dev/null && echo "OK"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add prod/patch-billing-bot.yaml
git commit -m "feat(prod): override SCHEME=https in billing-bot prod overlay"
```

---

## Task 6: Add scripts/call-setup.sh

**Files:**
- Create: `scripts/call-setup.sh`

- [ ] **Step 1: Create the script**

```bash
cat > scripts/call-setup.sh << 'SCRIPT'
#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# call-setup.sh
# Registers the /call slash command in Mattermost (all teams).
# Pointing to billing-bot /slash endpoint.
#
# Usage:
#   bash scripts/call-setup.sh                         # auto-detect via mmctl
#   MM_TOKEN=<token> bash scripts/call-setup.sh        # use API token
#
# Environment:
#   MM_URL       - Mattermost URL (default: auto-detect from SiteURL)
#   MM_TOKEN     - Personal access token (skip mmctl)
#   NAMESPACE    - Kubernetes namespace (default: workspace)
#   KUBE_CONTEXT - kubectl context to use (optional, for prod clusters)
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

NAMESPACE="${NAMESPACE:-workspace}"
MM_URL="${MM_URL:-}"
MM_TOKEN="${MM_TOKEN:-}"
KUBE_CTX_FLAG=""

if [ -n "${KUBE_CONTEXT:-}" ]; then
  KUBE_CTX_FLAG="--context=${KUBE_CONTEXT}"
fi

KUBECTL="kubectl ${KUBE_CTX_FLAG}"

echo "=== /call Slash-Command Setup ==="
echo ""

# ── Auto-detect Mattermost URL ────────────────────────────────────────────
if [ -z "${MM_URL}" ]; then
  MM_URL=$(${KUBECTL} exec -n "${NAMESPACE}" deploy/mattermost -- \
    printenv MM_SERVICESETTINGS_SITEURL 2>/dev/null || echo "http://chat.localhost")
fi

echo "  Mattermost: ${MM_URL}"

# ── Generate token via mmctl if needed ──────────────────────────────────
if [ -z "${MM_TOKEN}" ]; then
  ADMIN_USER_ID=$(${KUBECTL} exec -n "${NAMESPACE}" deploy/mattermost -- \
    mmctl --local user list --json 2>/dev/null | \
    python3 -c "
import sys,json
users = json.load(sys.stdin) or []
admins = [u for u in users if 'system_admin' in u.get('roles','')]
if admins: print(admins[0]['id'])
" 2>/dev/null) || true

  if [ -n "${ADMIN_USER_ID}" ]; then
    TOKEN_OUTPUT=$(${KUBECTL} exec -n "${NAMESPACE}" deploy/mattermost -- \
      mmctl --local token generate "${ADMIN_USER_ID}" "call-setup-$(date +%s)" 2>/dev/null) || true
    MM_TOKEN=$(echo "${TOKEN_OUTPUT}" | grep -oP '^[a-z0-9]{26}' | head -1) || true
  fi

  if [ -z "${MM_TOKEN}" ]; then
    echo "FEHLER: Konnte keinen API-Token generieren."
    exit 1
  fi
  CLEANUP_TOKEN="true"
fi

# ── Helper: REST API ─────────────────────────────────────────────────────
mm_api() {
  local method="$1" endpoint="$2"
  shift 2
  curl -sf -X "${method}" "${MM_URL}/api/v4${endpoint}" \
    -H "Authorization: Bearer ${MM_TOKEN}" \
    -H "Content-Type: application/json" \
    "$@"
}

# ── Get all teams ────────────────────────────────────────────────────────
TEAMS=$(mm_api GET "/teams")
TEAM_COUNT=$(echo "${TEAMS}" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")

if [ "${TEAM_COUNT}" = "0" ] || [ -z "${TEAM_COUNT}" ]; then
  echo "FEHLER: Keine Teams gefunden."
  exit 1
fi

echo "  ${TEAM_COUNT} Team(s) gefunden."
echo ""

# ── Register /call in each team ──────────────────────────────────────────
echo "${TEAMS}" | python3 -c "
import sys,json
for t in json.load(sys.stdin):
    print(t['id'], t['name'])
" | while read -r TEAM_ID TEAM_NAME; do
  echo "── Team: ${TEAM_NAME} ──────────────────────────────────"

  EXISTING=$(mm_api GET "/teams/${TEAM_ID}/commands" 2>/dev/null | python3 -c "
import sys,json
cmds = json.load(sys.stdin) or []
for c in cmds:
    if c.get('trigger') == 'call':
        print(c['id'])
        break
" 2>/dev/null || echo "")

  PAYLOAD="{
    \"team_id\": \"${TEAM_ID}\",
    \"trigger\": \"call\",
    \"method\": \"P\",
    \"url\": \"http://billing-bot:8090/slash\",
    \"display_name\": \"Nextcloud Talk Call\",
    \"description\": \"Erstellt einen Nextcloud Talk Video-Call-Raum\",
    \"auto_complete\": true,
    \"auto_complete_hint\": \"\",
    \"auto_complete_desc\": \"Neuen Video-Call in Nextcloud Talk starten\"
  }"

  if [ -n "${EXISTING}" ]; then
    mm_api PUT "/commands/${EXISTING}" \
      -d "$(echo "${PAYLOAD}" | python3 -c "import sys,json; d=json.load(sys.stdin); d['id']='${EXISTING}'; print(json.dumps(d))")" \
      > /dev/null 2>&1 \
      && echo "  /call aktualisiert." \
      || echo "  WARNUNG: /call konnte nicht aktualisiert werden."
  else
    mm_api POST "/commands" -d "${PAYLOAD}" > /dev/null 2>&1 \
      && echo "  /call registriert." \
      || echo "  FEHLER: /call konnte nicht registriert werden."
  fi
done

# ── Cleanup token ────────────────────────────────────────────────────────
if [ "${CLEANUP_TOKEN:-}" = "true" ] && [ -n "${MM_TOKEN}" ]; then
  TOKEN_ID=$(mm_api GET "/users/me/tokens" 2>/dev/null | python3 -c "
import sys,json
for t in (json.load(sys.stdin) or []):
    if 'call-setup' in t.get('description',''):
        print(t['id']); break
" 2>/dev/null || echo "")
  if [ -n "${TOKEN_ID}" ]; then
    mm_api POST "/users/tokens/revoke" -d "{\"token_id\": \"${TOKEN_ID}\"}" > /dev/null 2>&1
    echo ""
    echo "  Temporaerer Token bereinigt."
  fi
fi

echo ""
echo "=== /call Setup abgeschlossen ==="
echo "  Verwende /call in einem beliebigen Mattermost-Kanal."
SCRIPT
chmod +x scripts/call-setup.sh
```

- [ ] **Step 2: Lint the script**

```bash
shellcheck scripts/call-setup.sh
```

Expected: no errors (exit 0). If there are warnings about variables set but not used, they can be ignored.

- [ ] **Step 3: Commit**

```bash
git add scripts/call-setup.sh
git commit -m "feat(scripts): add call-setup.sh — register /call slash command in Mattermost"
```

---

## Task 7: Add Taskfile tasks

**Files:**
- Modify: `Taskfile.yml`

- [ ] **Step 1: Add workspace:call-setup task**

In `Taskfile.yml`, after the `workspace:connectors:` task block (around line 525), add:

```yaml
  workspace:call-setup:
    desc: "Register /call slash command in Mattermost (ENV=dev|mentolder|korczewski)"
    vars:
      ENV: '{{.ENV | default "dev"}}'
    preconditions:
      - sh: kubectl get deployment mattermost -n workspace > /dev/null 2>&1
        msg: "Mattermost not deployed. Run 'task workspace:deploy' first."
    cmds:
      - |
        source scripts/env-resolve.sh "{{.ENV}}"
        [ "{{.ENV}}" != "dev" ] && export KUBE_CONTEXT="${ENV_CONTEXT}" || true
        bash scripts/call-setup.sh

  workspace:call-setup:all-prods:
    desc: Register /call slash command in both production clusters (mentolder + korczewski)
    cmds:
      - task: workspace:call-setup
        vars: { ENV: "mentolder" }
      - task: workspace:call-setup
        vars: { ENV: "korczewski" }
```

- [ ] **Step 2: Add workspace:call-setup to workspace:up**

In the `workspace:up` task (around line 265), add after `- task: workspace:connectors`:

```yaml
      - task: workspace:call-setup
```

- [ ] **Step 3: Dry-run validate**

```bash
task --dry workspace:call-setup > /dev/null && echo "OK"
task --dry workspace:call-setup:all-prods > /dev/null && echo "OK"
```

Expected: both print `OK`.

- [ ] **Step 4: Commit**

```bash
git add Taskfile.yml
git commit -m "feat(tasks): add workspace:call-setup and workspace:call-setup:all-prods tasks"
```

---

## Task 8: Build billing-bot Docker image and deploy to dev

**Files:**
- No new files — uses existing `Dockerfile` and CI build

- [ ] **Step 1: Run the full test suite**

```bash
cd billing-bot && go test ./... -v
```

Expected: all tests pass (should see `TestHandleSlashHelp`, `TestHandleSlashUnknown`, `TestEnv`, `TestCreateNextcloudRoomParsesToken`, `TestCreateNextcloudRoomNoPassword`, `TestHandleSlashCallNoPassword`, `TestHandleSlashCallSuccess`).

- [ ] **Step 2: Build the Docker image locally**

```bash
docker build -t registry.localhost:5000/billing-bot:latest billing-bot/
docker push registry.localhost:5000/billing-bot:latest
```

Expected: image pushed successfully.

- [ ] **Step 3: Apply the updated manifests to the dev cluster**

```bash
task workspace:deploy
```

Expected: `deployment.apps/billing-bot configured`

- [ ] **Step 4: Wait for billing-bot to be ready**

```bash
kubectl rollout status deployment/billing-bot -n workspace --timeout=2m
```

Expected: `deployment "billing-bot" successfully rolled out`

- [ ] **Step 5: Register /call on the dev cluster**

```bash
task workspace:call-setup
```

Expected:
```
=== /call Slash-Command Setup ===
  1 Team(s) gefunden.
── Team: workspace ──
  /call registriert.
=== /call Setup abgeschlossen ===
```

- [ ] **Step 6: Smoke-test in Mattermost**

Open Mattermost at `http://chat.localhost`, go to any channel, type `/call` and hit Enter.

Expected: an in-channel message appears with a green card titled "▶ Join Call" and the text "📹 **#<channel> Call** gestartet". Clicking the title opens a Nextcloud Talk room.

- [ ] **Step 7: Commit any remaining changes (e.g. go.sum if it changed)**

```bash
git status
# if go.sum changed:
git add billing-bot/go.sum
git commit -m "chore: update go.sum after billing-bot build" || true
```

---

## Task 9: Deploy to production clusters

- [ ] **Step 1: Register /call on production clusters**

```bash
task workspace:call-setup:all-prods
```

Expected: output for both mentolder and korczewski showing `/call registriert.` or `/call aktualisiert.` (if re-running).

- [ ] **Step 2: Verify billing-bot env vars are present on each prod cluster**

```bash
# Check mentolder
kubectl --context=<mentolder-context> exec -n workspace deploy/billing-bot -- env | grep -E "NEXTCLOUD|NC_DOMAIN|SCHEME"

# Check korczewski
kubectl --context=<korczewski-context> exec -n workspace deploy/billing-bot -- env | grep -E "NEXTCLOUD|NC_DOMAIN|SCHEME"
```

Expected: `NEXTCLOUD_URL`, `NEXTCLOUD_ADMIN_USER`, `NEXTCLOUD_ADMIN_PASSWORD`, `NC_DOMAIN`, and `SCHEME=https` present on both clusters.

Note: The prod billing-bot image is pulled from ghcr.io. After Task 8's code changes are merged to `main`, the CI pipeline will build and push a new `ghcr.io/paddione/billing-bot:latest`. Trigger a rollout restart to pick up the new image:

```bash
kubectl --context=<mentolder-context> rollout restart deployment/billing-bot -n workspace
kubectl --context=<korczewski-context> rollout restart deployment/billing-bot -n workspace
```

- [ ] **Step 3: Smoke-test on each prod cluster**

On `chat.mentolder.de` and the korczewski Mattermost: type `/call` in a channel. Expected: green call card with a link to `https://files.<domain>/apps/spreed/call/<token>`.

---

## Self-Review Checklist

Spec sections vs tasks:

| Spec requirement | Task |
|-----------------|------|
| billing-bot: NC config vars | Task 1 |
| billing-bot: handleCallCommand + createNextcloudRoom | Tasks 2, 3 |
| Attachment Title/TitleLink fields | Task 1 |
| k3d/billing-bot.yaml env vars | Task 4 |
| prod/patch-billing-bot.yaml SCHEME=https | Task 5 |
| scripts/call-setup.sh | Task 6 |
| workspace:call-setup + workspace:call-setup:all-prods tasks | Task 7 |
| Add call-setup to workspace:up | Task 7 |
| Deploy to dev + smoke test | Task 8 |
| Deploy to prod | Task 9 |
| Startup warning for missing NC password | Task 1 |
| Error handling: ephemeral error response | Task 3 |
