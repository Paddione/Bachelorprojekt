# Workspace Theming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align Mattermost, Nextcloud, Docs (Docsify), and MCP Status Page to the mentolder/korczewski design palette: Dark Navy (`#0f1623`) + Gold (`#e8c870`).

**Architecture:** Pure CSS/HTML changes for Docs and MCP Status (ConfigMap edits). Env-var patch for Mattermost's banner. New script `scripts/set-mattermost-theme.sh` + `workspace:theme` Taskfile task push the full gold theme to all users via the Mattermost Admin API (same `kubectl exec ... curl` pattern as `scripts/stripe-setup.sh`). Nextcloud OCC commands extend `workspace:post-setup` and a new `workspace:theme:nextcloud` task.

**Tech Stack:** Kubernetes ConfigMaps (kustomize), Bash, Mattermost REST API v4, Nextcloud OCC CLI, Go-Task (Taskfile.yml)

---

## File Structure

| File | Action | What it does |
|------|--------|-------------|
| `deploy/mcp/mcp-status.yaml` | Modify | CSS color values → mentolder palette |
| `k3d/docs-content/index.html` | Modify | Replace CDN vue.css with inline dark CSS |
| `k3d/mattermost.yaml` | Modify | Banner color env vars → gold/dark |
| `prod/patch-mattermost.yaml` | Modify | Same banner color patch for prod |
| `scripts/set-mattermost-theme.sh` | Create | Push full theme JSON to all users via API |
| `Taskfile.yml` | Modify | Add `workspace:theme`, `workspace:theme:nextcloud`; extend `workspace:post-setup` |

---

## Task 1: MCP Status Page — CSS palette update

**Files:**
- Modify: `deploy/mcp/mcp-status.yaml` (lines 16–51)

- [ ] **Step 1: Read the current CSS block**

  ```bash
  grep -n "background\|color\|#[0-9a-f]" deploy/mcp/mcp-status.yaml | head -20
  ```

  Expected output shows slate grays (`#0f172a`, `#1e293b`, `#94a3b8`, `#64748b`, `#e2e8f0`).

- [ ] **Step 2: Replace CSS color values**

  In `deploy/mcp/mcp-status.yaml`, find the `<style>` block and replace all occurrences:

  | Find | Replace |
  |------|---------|
  | `background: #0f172a` | `background: #0f1623` |
  | `color: #e2e8f0` (body) | `color: #e8e8f0` |
  | `color: #94a3b8` (h2) | `color: #e8c870` |
  | `background: #1e293b` (card) | `background: #1a2235` |
  | `background: #22c55e` (.dot.up) | `background: #4caf50` |
  | `color: #94a3b8` (.time) | `color: #6b7a8d` |
  | `color: #64748b` (footer) | `color: #6b7a8d` |
  | `background: #64748b` (.dot.unknown) | `background: #6b7a8d` |

  Also add a gold accent to the `h1` title:
  ```css
  h1 { text-align: center; margin-bottom: 2rem; font-size: 1.8rem; color: #e8c870; }
  ```
  (replace the existing `h1` rule that has no color set).

- [ ] **Step 3: Smoke-test locally**

  ```bash
  kubectl apply -f deploy/mcp/mcp-status.yaml
  kubectl rollout restart deployment/mcp-status -n workspace 2>/dev/null || \
    kubectl rollout restart deployment -n workspace -l app=mcp-status 2>/dev/null || true
  sleep 3
  curl -sf http://mcp.localhost/ | grep -c "MCP Server Status" && echo "OK"
  ```

  Expected: `1` + `OK`. Open `http://mcp.localhost/` in browser — background should be `#0f1623`, title gold, cards darker navy.

- [ ] **Step 4: Commit**

  ```bash
  git add deploy/mcp/mcp-status.yaml
  git commit -m "feat(theme): apply dark+gold palette to MCP status page"
  ```

---

## Task 2: Docs — dark theme (replace CDN vue.css)

**Files:**
- Modify: `k3d/docs-content/index.html` (line 8 — the CDN stylesheet link)

> **Context:** `k3d/kustomization.yaml` generates the `docs-content` ConfigMap from all files in `k3d/docs-content/`. Editing `index.html` here is the only change needed — no separate ConfigMap YAML to touch.

- [ ] **Step 1: Replace the CDN stylesheet link with inline CSS**

  In `k3d/docs-content/index.html`, replace:
  ```html
  <link rel="stylesheet" href="//cdn.jsdelivr.net/npm/docsify/lib/themes/vue.css">
  ```
  With:
  ```html
  <style>
    :root { --theme-color: #e8c870; --sidebar-width: 260px; }
    * { box-sizing: border-box; }
    body { background: #0f1623; color: #e8e8f0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; }
    .sidebar { background: #0a0f1a; border-right: 1px solid #243049; padding: 20px 0; }
    .sidebar-nav { padding: 0 16px; }
    .sidebar-nav ul { padding-left: 16px; }
    .sidebar-nav li a { color: #aabbcc; text-decoration: none; font-size: 0.9rem; line-height: 1.8; }
    .sidebar-nav li.active > a, .sidebar-nav li > a:hover { color: #e8c870; }
    .sidebar > h1 a { color: #e8c870 !important; font-size: 1.2rem; padding: 0 16px; display: block; }
    .sidebar-toggle { background: #0a0f1a; border: none; }
    .sidebar-toggle span { background-color: #e8c870; }
    .app-nav { background: #0a0f1a; border-bottom: 1px solid #243049; }
    .app-nav a { color: #aabbcc; text-decoration: none; }
    .app-nav a:hover { color: #e8c870; }
    .content { padding: 30px 40px; max-width: 860px; }
    h1, h2, h3, h4, h5, h6 { color: #e8e8f0; border-bottom-color: #243049; }
    h2 { border-bottom: 1px solid #243049; padding-bottom: 8px; }
    a { color: #e8c870; }
    a:hover { color: #f0d88a; }
    p { color: #e8e8f0; line-height: 1.7; }
    code { background: #1a2235; color: #e8e8f0; padding: 2px 6px; border-radius: 3px; font-size: 0.88em; }
    pre { background: #1a2235; border-radius: 6px; padding: 16px; overflow-x: auto; }
    pre code { background: none; padding: 0; }
    blockquote { border-left: 4px solid #e8c870; background: #1a2235; margin: 16px 0; padding: 12px 16px; color: #aabbcc; }
    table { border-collapse: collapse; width: 100%; }
    table th { background: #1a2235; color: #e8c870; padding: 8px 12px; text-align: left; }
    table td { padding: 8px 12px; border-bottom: 1px solid #243049; color: #e8e8f0; }
    table tr:nth-child(even) { background: #1a2235; }
    hr { border-color: #243049; }
    .markdown-section img { max-width: 100%; }
    .anchor span { color: #e8c870; }
    /* Search */
    .search input { background: #1a2235; color: #e8e8f0; border: 1px solid #243049; border-radius: 4px; padding: 6px 10px; width: 100%; }
    .search input::placeholder { color: #6b7a8d; }
    .search .clear-button { color: #6b7a8d; }
    .results-panel { background: #0a0f1a; border: 1px solid #243049; }
    .results-panel .matching-post { border-bottom: 1px solid #243049; }
    .results-panel .matching-post a { color: #e8c870; }
    /* Mermaid diagrams */
    .mermaid { background: #1a2235; border-radius: 6px; padding: 16px; }
  </style>
  ```

- [ ] **Step 2: Apply the ConfigMap and verify**

  ```bash
  kubectl apply -k k3d/
  kubectl rollout restart deployment/docs -n workspace
  kubectl rollout status deployment/docs -n workspace --timeout=30s
  curl -sf http://docs.localhost/ | grep -c "docsify" && echo "OK"
  ```

  Open `http://docs.localhost/` — sidebar should be `#0a0f1a`, background `#0f1623`, links gold.

- [ ] **Step 3: Commit**

  ```bash
  git add k3d/docs-content/index.html
  git commit -m "feat(theme): apply dark+gold theme to Docsify docs"
  ```

---

## Task 3: Mattermost — banner env vars (manifests)

**Files:**
- Modify: `k3d/mattermost.yaml` (lines 91–94)
- Modify: `prod/patch-mattermost.yaml` (add banner color entries)

> **Context:** `k3d/mattermost.yaml` is the dev base. `prod/patch-mattermost.yaml` is a strategic-merge patch applied on top for production. The banner color is currently `#1E88E5` (blue) in k3d and not set in prod (so it inherits the k3d default).

- [ ] **Step 1: Patch k3d/mattermost.yaml banner colors**

  Find (around line 91–94):
  ```yaml
              - name: MM_ANNOUNCEMENTSETTINGS_BANNERCOLOR
                value: "#1E88E5"
              - name: MM_ANNOUNCEMENTSETTINGS_BANNERTEXTCOLOR
                value: "#FFFFFF"
  ```
  Replace with:
  ```yaml
              - name: MM_ANNOUNCEMENTSETTINGS_BANNERCOLOR
                value: "#0f1623"
              - name: MM_ANNOUNCEMENTSETTINGS_BANNERTEXTCOLOR
                value: "#e8c870"
  ```

  Also add the default theme env var immediately after `MM_ANNOUNCEMENTSETTINGS_BANNERTEXTCOLOR`:
  ```yaml
              - name: MM_DISPLAYSETTINGS_DEFAULTTHEME
                value: "mattermostDark"
  ```

- [ ] **Step 2: Patch prod/patch-mattermost.yaml banner colors**

  Append to the `env:` list at the bottom of `prod/patch-mattermost.yaml`:
  ```yaml
            - name: MM_ANNOUNCEMENTSETTINGS_BANNERCOLOR
              value: "#0f1623"
            - name: MM_ANNOUNCEMENTSETTINGS_BANNERTEXTCOLOR
              value: "#e8c870"
            - name: MM_DISPLAYSETTINGS_DEFAULTTHEME
              value: "mattermostDark"
  ```

- [ ] **Step 3: Validate manifests**

  ```bash
  task workspace:validate
  ```
  Expected: no errors.

- [ ] **Step 4: Apply to dev and verify**

  ```bash
  kubectl apply -k k3d/
  kubectl rollout restart deployment/mattermost -n workspace
  kubectl rollout status deployment/mattermost -n workspace --timeout=90s
  kubectl exec -n workspace deploy/mattermost -- \
    printenv MM_ANNOUNCEMENTSETTINGS_BANNERCOLOR
  ```
  Expected: `#0f1623`

- [ ] **Step 5: Commit**

  ```bash
  git add k3d/mattermost.yaml prod/patch-mattermost.yaml
  git commit -m "feat(theme): set dark+gold banner colors and mattermostDark default in Mattermost"
  ```

---

## Task 4: Mattermost — full gold theme script + workspace:theme task

**Files:**
- Create: `scripts/set-mattermost-theme.sh`
- Modify: `Taskfile.yml` (add `workspace:theme` and `workspace:theme:nextcloud`)

> **Context:** The existing scripts (e.g. `scripts/stripe-setup.sh`) use `kubectl exec -n workspace deploy/mattermost -- curl -s ...` to make in-cluster API calls. This script follows the same pattern. Runs on developer machine, calls Mattermost API through the pod.

- [ ] **Step 1: Create `scripts/set-mattermost-theme.sh`**

  ```bash
  #!/usr/bin/env bash
  # ════════════════════════════════════════════════════════════
  # set-mattermost-theme.sh
  #
  # Pushes the dark+gold custom theme to all non-bot users in
  # Mattermost via the REST API. Idempotent — safe to re-run.
  #
  # Usage:
  #   bash scripts/set-mattermost-theme.sh [namespace]
  #
  # Requirements:
  #   kubectl context pointing at the target cluster
  # ════════════════════════════════════════════════════════════
  set -euo pipefail

  NAMESPACE="${1:-workspace}"
  MM_URL="http://mattermost.workspace.svc.cluster.local:8065"

  _mm() { kubectl exec -n "$NAMESPACE" deploy/mattermost -- curl -s "$@" 2>/dev/null; }

  # ── Admin credentials ──────────────────────────────────────
  MM_ADMIN_USER="${MM_ADMIN_USER:-admin}"
  MM_ADMIN_PASS="${MM_ADMIN_PASS:-$(kubectl get secret workspace-secrets \
    -n "$NAMESPACE" -o jsonpath='{.data.MATTERMOST_ADMIN_PASSWORD}' 2>/dev/null \
    | base64 -d 2>/dev/null || echo "devadmin")}"

  # ── Login → Bearer token ───────────────────────────────────
  echo "Logging in as $MM_ADMIN_USER..."
  TOKEN=$(_mm -X POST "$MM_URL/api/v4/users/login" \
    -H "Content-Type: application/json" \
    -d "{\"login_id\":\"$MM_ADMIN_USER\",\"password\":\"$MM_ADMIN_PASS\"}" \
    -D - -o /dev/null \
    | grep -i "^token:" | awk '{print $2}' | tr -d '\r\n')

  [[ -z "$TOKEN" ]] && { echo "ERROR: Mattermost login failed"; exit 1; }
  echo "  Token obtained."

  # ── Theme JSON (mentolder dark+gold) ───────────────────────
  THEME='{"sidebarBg":"#0f1623","sidebarText":"#e8e8f0","sidebarUnreadText":"#ffffff","sidebarTextHoverBg":"#1a2235","sidebarTextActiveBorder":"#e8c870","sidebarTextActiveColor":"#e8c870","sidebarHeaderBg":"#0a0f1a","sidebarTeamBarBg":"#070c15","sidebarHeaderTextColor":"#e8e8f0","onlineIndicator":"#4caf50","awayIndicator":"#ff9800","dndIndicator":"#ef4444","mentionBg":"#e8c870","mentionColor":"#0f1623","centerChannelBg":"#0f1623","centerChannelColor":"#e8e8f0","newMessageSeparator":"#e8c870","linkColor":"#e8c870","buttonBg":"#e8c870","buttonColor":"#0f1623","errorTextColor":"#ef4444","mentionHighlightBg":"#1a2235","mentionHighlightLink":"#e8c870","codeTheme":"monokai"}'
  THEME_ESCAPED=$(echo "$THEME" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().strip()))")

  # ── All non-bot users ──────────────────────────────────────
  USER_IDS=$(_mm -H "Authorization: Bearer $TOKEN" \
    "$MM_URL/api/v4/users?per_page=200&active=true" \
    | python3 -c "
  import sys, json
  users = json.load(sys.stdin)
  print('\n'.join(u['id'] for u in users if not u.get('is_bot', False)))
  ")

  echo "Setting theme for $(echo "$USER_IDS" | wc -l | tr -d ' ') users..."

  for UID in $USER_IDS; do
    # Get team IDs for this user
    TEAM_IDS=$(_mm -H "Authorization: Bearer $TOKEN" \
      "$MM_URL/api/v4/users/$UID/teams" \
      | python3 -c "
  import sys, json
  teams = json.load(sys.stdin)
  if isinstance(teams, list):
      print('\n'.join(t['id'] for t in teams))
  " 2>/dev/null || true)

    # Build preferences array: one entry per team + one global (empty name)
    PREFS="["
    for TID in $TEAM_IDS; do
      PREFS+="{\"user_id\":\"$UID\",\"category\":\"theme\",\"name\":\"$TID\",\"value\":$THEME_ESCAPED},"
    done
    PREFS+="{\"user_id\":\"$UID\",\"category\":\"theme\",\"name\":\"\",\"value\":$THEME_ESCAPED}]"

    _mm -X PUT \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "$PREFS" \
      "$MM_URL/api/v4/users/$UID/preferences" >/dev/null

    echo "  ✓ $UID"
  done

  echo "Mattermost theme applied to all users."
  ```

- [ ] **Step 2: Make executable**

  ```bash
  chmod +x scripts/set-mattermost-theme.sh
  ```

- [ ] **Step 3: Add tasks to Taskfile.yml**

  Find the `workspace:theme:nextcloud` section (does not exist yet) — add these two tasks after `workspace:post-setup` in `Taskfile.yml`:

  ```yaml
    workspace:theme:nextcloud:
      desc: Apply dark+gold Nextcloud branding via OCC (idempotent)
      vars:
        NC_EXEC: "kubectl exec -n workspace -c nextcloud deploy/nextcloud -- su -s /bin/bash www-data -c"
        BRAND: '{{.BRAND_NAME | default "mentolder"}}'
        DOMAIN: '{{.PROD_DOMAIN | default "mentolder.localhost"}}'
      cmds:
        - '{{.NC_EXEC}} "php occ config:app:set theming name           --value={{.BRAND}}"'
        - '{{.NC_EXEC}} "php occ config:app:set theming url            --value=https://web.{{.DOMAIN}}"'
        - '{{.NC_EXEC}} "php occ config:app:set theming color          --value=#e8c870"'
        - '{{.NC_EXEC}} "php occ config:app:set theming enforce-theme  --value=dark"'
        - echo "Nextcloud theme applied."

    workspace:theme:
      desc: Apply dark+gold theme to Mattermost + Nextcloud (idempotent, run after post-setup)
      cmds:
        - echo "=== Mattermost Theme ==="
        - bash scripts/set-mattermost-theme.sh
        - echo "=== Nextcloud Theme ==="
        - task: workspace:theme:nextcloud
        - echo "All themes applied."
  ```

- [ ] **Step 4: Run and verify in dev**

  ```bash
  task workspace:theme
  ```

  Expected output ends with `All themes applied.`

  Then open `http://chat.localhost/` — sidebar background should be `#0f1623`, active channel label gold, buttons gold. If the browser still shows the old theme, clear local storage (`F12 → Application → Local Storage → Clear`) and reload.

- [ ] **Step 5: Commit**

  ```bash
  git add scripts/set-mattermost-theme.sh Taskfile.yml
  git commit -m "feat(theme): add workspace:theme task + Mattermost gold theme script"
  ```

---

## Task 5: Nextcloud — extend post-setup + verify

**Files:**
- Modify: `Taskfile.yml` — extend `workspace:post-setup` to call `workspace:theme:nextcloud`

> **Context:** `workspace:post-setup` already installs apps and runs OCC commands. Adding a `task: workspace:theme:nextcloud` call at the end ensures theming is applied automatically on every fresh deployment. Task 4 already created `workspace:theme:nextcloud`.

- [ ] **Step 1: Add theme task call to workspace:post-setup**

  In `Taskfile.yml`, find `workspace:post-setup`. At the very end of its `cmds:` list (after the `notify_push` ready-check block), add:

  ```yaml
        - echo ""
        - echo "Applying Nextcloud branding..."
        - task: workspace:theme:nextcloud
  ```

- [ ] **Step 2: Verify the OCC commands work**

  ```bash
  task workspace:theme:nextcloud
  ```

  Expected:
  ```
  Nextcloud theme applied.
  ```

  Then run:
  ```bash
  kubectl exec -n workspace -c nextcloud deploy/nextcloud -- \
    su -s /bin/bash www-data -c \
    "php occ config:app:get theming color"
  ```
  Expected: `#e8c870`

  ```bash
  kubectl exec -n workspace -c nextcloud deploy/nextcloud -- \
    su -s /bin/bash www-data -c \
    "php occ config:app:get theming enforce-theme"
  ```
  Expected: `dark`

- [ ] **Step 3: Visual check**

  Open `http://files.localhost/` — the top navigation bar should be dark (`#0f1623`), the accent color (buttons, active links) gold (`#e8c870`), content area dark.

- [ ] **Step 4: Commit**

  ```bash
  git add Taskfile.yml
  git commit -m "feat(theme): extend workspace:post-setup to apply Nextcloud branding automatically"
  ```

---

## Task 6: Apply to both production clusters

> **Context:** mentolder = `--context=mentolder`, korczewski = `--context=korczewski`. Both clusters run the same manifests from this repo via ArgoCD or manual deploy. Prod overlays are in `prod/`.

- [ ] **Step 1: Deploy prod manifests to mentolder**

  ```bash
  task workspace:prod:deploy
  ```
  Or if not available:
  ```bash
  kubectl --context=mentolder apply -k prod/
  kubectl --context=mentolder rollout restart deployment/mattermost -n workspace
  kubectl --context=mentolder rollout status deployment/mattermost -n workspace --timeout=90s
  ```

- [ ] **Step 2: Run theme tasks on mentolder**

  ```bash
  KUBECONFIG=~/.kube/config kubectl config use-context mentolder
  task workspace:theme
  task workspace:theme:nextcloud DOMAIN=mentolder.de BRAND=mentolder
  ```

- [ ] **Step 3: Smoke-test mentolder**

  ```bash
  curl -sf https://chat.mentolder.de/api/v4/system/ping | python3 -c "import sys,json; print(json.load(sys.stdin).get('status'))"
  curl -sf https://files.mentolder.de/status.php | grep -c "installed" && echo "Nextcloud OK"
  curl -sf https://mcp.mentolder.de/ | grep -c "MCP Server Status" && echo "MCP OK"
  curl -sf https://docs.mentolder.de/ | grep -c "docsify" && echo "Docs OK"
  ```
  Each expected: `1` + label.

- [ ] **Step 4: Deploy to korczewski**

  ```bash
  kubectl config use-context korczewski
  kubectl --context=korczewski apply -k prod/
  kubectl --context=korczewski rollout restart deployment/mattermost -n workspace
  kubectl --context=korczewski rollout status deployment/mattermost -n workspace --timeout=90s
  task workspace:theme
  task workspace:theme:nextcloud DOMAIN=korczewski.de BRAND=korczewski
  ```

- [ ] **Step 5: Smoke-test korczewski**

  ```bash
  curl -sf https://chat.korczewski.de/api/v4/system/ping | python3 -c "import sys,json; print(json.load(sys.stdin).get('status'))"
  curl -sf https://files.korczewski.de/status.php | grep -c "installed" && echo "Nextcloud OK"
  ```

- [ ] **Step 6: Post update to both Mattermost bugs channels**

  ```python
  # mentolder
  import urllib.request, json
  for cluster, token, channel in [
    ("mentolder", "8kxk39ddqbfdpmox9zfef6w3yw", "c74p6ea1ojfqzfyogryfmd1kbw"),
    # korczewski token TBD at runtime
  ]:
    pass
  ```

  Or use the Mattermost task approach from prior sprints: post directly to `#bugs` channels on both clusters confirming theme deployment.

- [ ] **Step 7: Final commit tag**

  ```bash
  git add -A
  git commit -m "chore: confirm workspace theming deployed to mentolder + korczewski" --allow-empty
  ```
