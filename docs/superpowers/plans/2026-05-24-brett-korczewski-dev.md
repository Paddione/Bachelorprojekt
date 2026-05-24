---
title: Brett Korczewski Dev Start Script + EROFS Fix Implementation Plan
ticket_id: null
domains: []
status: active
pr_number: null
---

# Brett Korczewski Dev Start Script + EROFS Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the EROFS crash that occurs when Brett tries to write `presets.json` to the read-only container filesystem, and add a dev start script that wires up the korczewski cluster's DB, Keycloak, and sish tunnel automatically so Brett can be developed locally without storing secrets.

**Architecture:** Two independent changes. The EROFS fix is a one-line server.js change plus an emptyDir volume in the k8s manifest — no data migration, no init container needed (loadPresets already returns [] on missing file). The dev script is a standalone bash script that pulls live secrets via kubectl, backgrounded port-forwards, a sish tunnel, and nodemon — all cleaned up on exit via a trap.

**Tech Stack:** Node.js (brett/server.js), Kubernetes YAML (k3d/brett.yaml), Bash (brett/dev-start.sh), kubectl, ssh, jq, npx/nodemon.

---

## File Map

| File | Action | What changes |
|------|--------|-------------|
| `brett/server.js` | Modify line 9 | `PRESETS_FILE` reads `BRETT_PRESETS_PATH` env var first |
| `k3d/brett.yaml` | Modify | Add `BRETT_PRESETS_PATH` env var, `volumeMounts`, and `volumes` |
| `brett/dev-start.sh` | Create | Full dev bootstrap script |

---

## Task 1: Fix EROFS — server.js one-liner

**Files:**
- Modify: `brett/server.js:9`

- [ ] **Step 1.1: Verify the current line**

```bash
sed -n '9p' brett/server.js
```
Expected output:
```
const PRESETS_FILE = path.join(__dirname, 'presets.json');
```

- [ ] **Step 1.2: Apply the fix**

In `brett/server.js`, replace line 9:

```js
// Before (line 9):
const PRESETS_FILE = path.join(__dirname, 'presets.json');

// After (line 9):
const PRESETS_FILE = process.env.BRETT_PRESETS_PATH || path.join(__dirname, 'presets.json');
```

Use Edit tool — old_string: `const PRESETS_FILE = path.join(__dirname, 'presets.json');`

- [ ] **Step 1.3: Verify the change looks correct**

```bash
sed -n '7,11p' brett/server.js
```
Expected:
```js
const { randomUUID } = require('crypto');

const PRESETS_FILE = process.env.BRETT_PRESETS_PATH || path.join(__dirname, 'presets.json');

const SPEC_PATH = path.join(__dirname, 'public', 'assets', 'figure-pack', 'placement_spec.json');
```

- [ ] **Step 1.4: Confirm loadPresets graceful fallback (read-only check)**

```bash
grep -A 12 'function loadPresets' brett/server.js
```
Confirm the catch block returns `[]` — meaning if the file doesn't exist yet (fresh emptyDir), Brett returns an empty preset list safely. No code change needed here.

- [ ] **Step 1.5: Run Brett's existing unit tests to confirm no regression**

```bash
cd brett && NODE_ENV=test MOCK_DB=true node --test test/ws-reconnect.test.mjs test/physics.test.js test/damage.test.mjs test/pickups.test.mjs test/mode-state.test.mjs 2>&1; cd ..
```
Expected: all tests pass (no preset-related tests exist yet — that's fine, the integration is verified in Task 2).

- [ ] **Step 1.6: Commit**

```bash
cd /tmp/wt-brett-korczewski-dev
git add brett/server.js
git commit -m "fix(brett): read PRESETS_FILE path from BRETT_PRESETS_PATH env var"
```

---

## Task 2: Fix EROFS — k3d/brett.yaml volume

**Files:**
- Modify: `k3d/brett.yaml`

The manifest currently ends the container spec at the `resources` block (around line 105). There are no `volumeMounts` or `volumes` at all. We add:
1. A new env var `BRETT_PRESETS_PATH` inside the container's `env` list
2. A `volumeMounts` block inside the container spec (after `resources`)
3. A `volumes` block inside `spec.template.spec` (at the pod level, after `containers`)

- [ ] **Step 2.1: Add the BRETT_PRESETS_PATH env var to the container**

In `k3d/brett.yaml`, find the env entry for `BRETT_DEFAULT_MODE`:
```yaml
            - name: BRETT_DEFAULT_MODE
              value: "coaching"
```

Replace it with (adds the new env var directly after):
```yaml
            - name: BRETT_DEFAULT_MODE
              value: "coaching"
            - name: BRETT_PRESETS_PATH
              value: /app/presets/presets.json
```

- [ ] **Step 2.2: Add volumeMounts to the container**

In `k3d/brett.yaml`, find the `resources` block at the end of the container spec:
```yaml
          resources:
            requests:
              memory: 128Mi
              cpu: "100m"
            limits:
              memory: 512Mi
              cpu: "500m"
```

Replace it with (appends `volumeMounts` after `resources`):
```yaml
          resources:
            requests:
              memory: 128Mi
              cpu: "100m"
            limits:
              memory: 512Mi
              cpu: "500m"
          volumeMounts:
            - name: presets-data
              mountPath: /app/presets
```

- [ ] **Step 2.3: Add the volumes block at pod level**

In `k3d/brett.yaml`, find the line that ends the containers list and starts the Service separator:
```yaml
---
apiVersion: v1
kind: Service
```

Replace it with (inserts `volumes` at `spec.template.spec` level, before the `---`):
```yaml
      volumes:
        - name: presets-data
          emptyDir: {}
---
apiVersion: v1
kind: Service
```

- [ ] **Step 2.4: Validate kustomize build**

```bash
cd /tmp/wt-brett-korczewski-dev
task workspace:validate
```
Expected: exits 0 with no errors. Any YAML structure issue will surface here.

- [ ] **Step 2.5: Spot-check the rendered output**

```bash
kubectl kustomize k3d/ | grep -A 20 'name: brett$' | grep -E "BRETT_PRESETS|presets-data|emptyDir|mountPath"
```
Expected output contains all four strings:
```
BRETT_PRESETS_PATH
presets-data
emptyDir
mountPath
```

- [ ] **Step 2.6: Run the full offline test suite**

```bash
task test:all
```
Expected: green. The kustomize manifest structure tests cover `k3d/brett.yaml`.

- [ ] **Step 2.7: Commit**

```bash
cd /tmp/wt-brett-korczewski-dev
git add k3d/brett.yaml
git commit -m "fix(brett): mount emptyDir at /app/presets to allow preset writes on readOnlyRootFilesystem [fixes EROFS]"
```

---

## Task 3: Write brett/dev-start.sh

**Files:**
- Create: `brett/dev-start.sh`

- [ ] **Step 3.1: Create the script**

Create `brett/dev-start.sh` with the following content:

```bash
#!/usr/bin/env bash
# brett/dev-start.sh — run Brett locally against the korczewski cluster
#
# Prerequisites (one-time manual setup):
#   1. npm install  (run once inside brett/)
#   2. Register https://brett-dev.korczewski.de/callback as a valid redirect URI
#      in the 'brett-app' OIDC client via the korczewski Keycloak admin UI:
#      https://keycloak.korczewski.de/admin → workspace realm → Clients → brett-app
#   3. Ensure the korczewski dev sish stack is running (port 32224 on korczewski.de)
#
# Usage: run from repo root
#   bash brett/dev-start.sh

set -euo pipefail

# ── prerequisite checks ───────────────────────────────────────────────────────
check_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "ERROR: '$1' not found in PATH" >&2; exit 1; }
}

check_cmd kubectl
check_cmd jq
check_cmd node
check_cmd npx
check_cmd ssh

[[ -f brett/server.js ]] || { echo "ERROR: run this script from the repo root (brett/server.js not found)" >&2; exit 1; }
[[ -d brett/node_modules ]] || { echo "ERROR: run 'npm install' inside brett/ first" >&2; exit 1; }

echo "[brett-dev] checking korczewski cluster reachability..."
kubectl --context korczewski cluster-info --request-timeout=5s >/dev/null \
  || { echo "ERROR: cannot reach korczewski context — check kubectl config" >&2; exit 1; }

# ── pull secrets from cluster ─────────────────────────────────────────────────
echo "[brett-dev] pulling secrets from workspace-secrets (workspace-korczewski)..."
SECRET_JSON=$(kubectl get secret workspace-secrets \
  -n workspace-korczewski --context korczewski -o json)

BRETT_OIDC_SECRET=$(echo "$SECRET_JSON" | jq -r '.data.BRETT_OIDC_SECRET | @base64d')
WEBSITE_DB_PASSWORD=$(echo "$SECRET_JSON" | jq -r '.data.WEBSITE_DB_PASSWORD | @base64d')

[[ -n "$BRETT_OIDC_SECRET" ]] \
  || { echo "ERROR: BRETT_OIDC_SECRET is empty in workspace-secrets" >&2; exit 1; }
[[ -n "$WEBSITE_DB_PASSWORD" ]] \
  || { echo "ERROR: WEBSITE_DB_PASSWORD is empty in workspace-secrets" >&2; exit 1; }

echo "[brett-dev] secrets pulled OK"

# ── port-forwards ─────────────────────────────────────────────────────────────
echo "[brett-dev] starting port-forwards..."
kubectl port-forward svc/shared-db 5432:5432 \
  -n workspace-korczewski --context korczewski \
  >/tmp/brett-dev-pf-db.log 2>&1 &
PF_DB_PID=$!

kubectl port-forward svc/keycloak 8080:8080 \
  -n workspace-korczewski --context korczewski \
  >/tmp/brett-dev-pf-kc.log 2>&1 &
PF_KC_PID=$!

# ── cleanup trap ──────────────────────────────────────────────────────────────
SISH_PID=""
cleanup() {
  echo ""
  echo "[brett-dev] shutting down..."
  [[ -n "$SISH_PID" ]] && kill "$SISH_PID" 2>/dev/null || true
  kill "$PF_DB_PID" 2>/dev/null || true
  kill "$PF_KC_PID" 2>/dev/null || true
}
trap cleanup INT TERM EXIT

# ── wait for port-forwards to settle ─────────────────────────────────────────
sleep 2

if ! kill -0 "$PF_DB_PID" 2>/dev/null; then
  echo "ERROR: DB port-forward failed to start. Log:" >&2
  cat /tmp/brett-dev-pf-db.log >&2
  exit 1
fi
if ! kill -0 "$PF_KC_PID" 2>/dev/null; then
  echo "ERROR: Keycloak port-forward failed to start. Log:" >&2
  cat /tmp/brett-dev-pf-kc.log >&2
  exit 1
fi
echo "[brett-dev] port-forwards alive (DB :5432, Keycloak :8080)"

# ── sish tunnel ───────────────────────────────────────────────────────────────
echo "[brett-dev] opening sish tunnel → https://brett-dev.korczewski.de ..."
ssh -R "brett-dev:80:localhost:3000" \
  -p 32224 korczewski.de \
  -o StrictHostKeyChecking=no \
  -o ServerAliveInterval=30 \
  -o ServerAliveCountMax=3 \
  -N &
SISH_PID=$!

echo "[brett-dev] starting nodemon..."
echo "[brett-dev] local:  http://localhost:3000"
echo "[brett-dev] tunnel: https://brett-dev.korczewski.de"
echo ""

# ── start Brett ───────────────────────────────────────────────────────────────
NODE_ENV=development \
BRETT_PUBLIC_URL=https://brett-dev.korczewski.de \
KEYCLOAK_URL=http://localhost:8080 \
KEYCLOAK_REALM=workspace \
BRETT_KC_CLIENT_ID=brett-app \
BRETT_OIDC_SECRET="${BRETT_OIDC_SECRET}" \
BRETT_SESSION_SECRET="${BRETT_OIDC_SECRET}" \
DATABASE_URL="postgresql://website:${WEBSITE_DB_PASSWORD}@localhost:5432/website?sslmode=disable" \
npx nodemon brett/server.js
```

- [ ] **Step 3.2: Make it executable**

```bash
chmod +x brett/dev-start.sh
```

- [ ] **Step 3.3: Syntax-check the script**

```bash
bash -n brett/dev-start.sh && echo "syntax OK"
```
Expected: `syntax OK`

- [ ] **Step 3.4: Verify shebang and executable bit**

```bash
head -1 brett/dev-start.sh && ls -la brett/dev-start.sh
```
Expected first line: `#!/usr/bin/env bash`
Expected: `-rwxr-xr-x` permissions.

- [ ] **Step 3.5: Dry-run the prereq checks (should succeed on a machine with the right tools)**

```bash
bash -c '
  set -euo pipefail
  check_cmd() { command -v "$1" >/dev/null 2>&1 || { echo "MISSING: $1"; return 1; }; echo "OK: $1"; }
  check_cmd kubectl; check_cmd jq; check_cmd node; check_cmd npx; check_cmd ssh
  [[ -f brett/server.js ]] && echo "OK: brett/server.js" || echo "MISSING: brett/server.js"
  [[ -d brett/node_modules ]] && echo "OK: brett/node_modules" || echo "MISSING: brett/node_modules (run npm install)"
'
```
Expected: all lines print `OK:`. Fix any `MISSING:` before proceeding.

- [ ] **Step 3.6: Commit**

```bash
cd /tmp/wt-brett-korczewski-dev
git add brett/dev-start.sh
git commit -m "feat(brett): add dev-start.sh — local dev against korczewski cluster"
```

---

## Task 4: Final verification + PR

- [ ] **Step 4.1: Run full test suite from the worktree**

```bash
cd /tmp/wt-brett-korczewski-dev
task test:all
```
Expected: green.

- [ ] **Step 4.2: Run Brett unit tests**

```bash
cd /tmp/wt-brett-korczewski-dev
npm ci --prefix brett && node --test brett/test/ws-reconnect.test.mjs brett/test/physics.test.js brett/test/damage.test.mjs brett/test/pickups.test.mjs brett/test/mode-state.test.mjs
```
Expected: all pass.

- [ ] **Step 4.3: Validate kustomize one final time**

```bash
cd /tmp/wt-brett-korczewski-dev
task workspace:validate
```
Expected: exits 0.

- [ ] **Step 4.4: Confirm git log looks right**

```bash
cd /tmp/wt-brett-korczewski-dev
git log --oneline origin/main..HEAD
```
Expected (3 commits, newest first):
```
<hash> feat(brett): add dev-start.sh — local dev against korczewski cluster
<hash> fix(brett): mount emptyDir at /app/presets to allow preset writes on readOnlyRootFilesystem [fixes EROFS]
<hash> fix(brett): read PRESETS_FILE path from BRETT_PRESETS_PATH env var
<hash> chore(specs): add brett-korczewski-dev design spec
```

- [ ] **Step 4.5: Push and open PR**

```bash
cd /tmp/wt-brett-korczewski-dev
git push -u origin feature/brett-korczewski-dev

gh pr create \
  --title "fix(brett): EROFS presets fix + korczewski dev start script" \
  --body "$(cat <<'EOF'
## Summary
- Fixes EROFS crash: `server.js` now reads `BRETT_PRESETS_PATH` env var for the presets file path; `k3d/brett.yaml` mounts an `emptyDir` volume at `/app/presets` and sets `BRETT_PRESETS_PATH=/app/presets/presets.json` — no init container needed since `loadPresets()` already returns `[]` on missing file
- Adds `brett/dev-start.sh`: one-command local dev against korczewski cluster — auto-pulls secrets via kubectl, port-forwards DB+Keycloak, opens sish tunnel to `brett-dev.korczewski.de`, starts nodemon; cleans up all background processes on exit

## Test plan
- [ ] `task test:all` green
- [ ] `task workspace:validate` green
- [ ] Brett unit tests pass (`node --test brett/test/*.mjs brett/test/*.js`)
- [ ] Manual: deploy to korczewski, save a preset → no EROFS error in pod logs
- [ ] Manual: run `bash brett/dev-start.sh` from repo root → Brett starts at localhost:3000

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4.6: Merge immediately**

```bash
gh pr merge --squash --delete-branch
```

- [ ] **Step 4.7: Deploy to both clusters**

```bash
# Back in main repo (not worktree)
cd /home/patrick/Bachelorprojekt
git pull --rebase origin main
task feature:deploy
```

This triggers a rollout on both korczewski and mentolder. The emptyDir volume will be mounted and BRETT_PRESETS_PATH will be active on the next pod start.
