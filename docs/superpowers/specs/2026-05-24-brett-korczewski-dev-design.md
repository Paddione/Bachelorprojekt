# Brett Korczewski Dev Start Script + EROFS presets.json Fix

**Date:** 2026-05-24  
**Branch:** feature/brett-korczewski-dev  
**Scope:** Two independent changes bundled in one PR — a dev convenience script and a production bug fix.

---

## 1. Problem

### 1.1 EROFS crash in production

`brett/server.js` writes `presets.json` to `path.join(__dirname, 'presets.json')`, which resolves to `/app/presets.json` inside the Docker image. The Brett Deployment sets `readOnlyRootFilesystem: true` and has no writable volume, so every preset save call crashes with `EROFS: read-only file system`.

### 1.2 No local dev workflow

There is no way to run Brett locally against the korczewski cluster. Developers must rebuild the Docker image and redeploy to k3d to test any change, even trivial ones. The korczewski secrets (DB password, OIDC secret) live only in the cluster; there is no local `.env` file.

---

## 2. Solution

### 2.1 EROFS fix

**Files changed:** `brett/server.js`, `k3d/brett.yaml`

**server.js** — change one line (line ~9):
```js
// Before:
const PRESETS_FILE = path.join(__dirname, 'presets.json');

// After:
const PRESETS_FILE = process.env.BRETT_PRESETS_PATH || path.join(__dirname, 'presets.json');
```

No other logic in server.js changes. `loadPresets()` already returns a default object if the file is missing. `savePresets()` writes to whatever `PRESETS_FILE` resolves to.

**k3d/brett.yaml** — add to the `brett` container and Deployment:
```yaml
# Under containers[0].env:
- name: BRETT_PRESETS_PATH
  value: /app/presets/presets.json

# Under containers[0]:
volumeMounts:
  - name: presets-data
    mountPath: /app/presets

# Under spec.template.spec:
volumes:
  - name: presets-data
    emptyDir: {}
```

**Behavior:** On first preset save after a fresh pod start, the file is created in the emptyDir volume at `/app/presets/presets.json`. Presets survive hot-reloads (nodemon restarts) and survive pod-level container restarts without pod deletion. Presets reset to defaults when the pod is deleted/rescheduled — acceptable for a game preset config.

**No init container needed:** `loadPresets()` returns a safe default when the file does not exist; the first `savePresets()` call creates it.

### 2.2 Dev start script

**New file:** `brett/dev-start.sh`

The script is run from the **repo root** by the developer on their local machine (PK-Desktop / WSL). It requires no local secret storage — everything is pulled live from the korczewski cluster.

#### Prerequisites (checked at startup)
- `kubectl` available and `korczewski` context reachable
- `node` / `npx` available  
- `ssh` available
- `brett/server.js` exists (confirms the script is being run from repo root)
- `npm install` has been run in `brett/` (checked by testing for `brett/node_modules`)

#### Execution sequence

```
Step 1: Pull secrets from cluster
  kubectl get secret workspace-secrets \
    -n workspace-korczewski --context fleet \
    -o json | jq -r '.data.BRETT_OIDC_SECRET | @base64d'
  → BRETT_OIDC_SECRET

  kubectl get secret workspace-secrets \
    -n workspace-korczewski --context fleet \
    -o json | jq -r '.data.WEBSITE_DB_PASSWORD | @base64d'
  → WEBSITE_DB_PASSWORD

Step 2: Start port-forwards (background)
  kubectl port-forward svc/shared-db 5432:5432 \
    -n workspace-korczewski --context fleet &
  PF_DB_PID=$!

  kubectl port-forward svc/keycloak 8080:8080 \
    -n workspace-korczewski --context fleet &
  PF_KC_PID=$!

Step 3: Register cleanup trap
  trap 'kill $PF_DB_PID $PF_KC_PID $SISH_PID 2>/dev/null; exit' INT TERM EXIT

Step 4: Short settle wait (2 seconds)
  sleep 2

Step 5: Open sish tunnel (background)
  ssh -R "brett-dev:80:localhost:3000" \
    -p 32224 korczewski.de \
    -o StrictHostKeyChecking=no \
    -o ServerAliveInterval=30 \
    -o ServerAliveCountMax=3 \
    -N &
  SISH_PID=$!

Step 6: Start Brett with nodemon
  NODE_ENV=development \
  BRETT_PUBLIC_URL=https://brett-dev.korczewski.de \
  KEYCLOAK_URL=http://localhost:8080 \
  KEYCLOAK_REALM=workspace \
  BRETT_KC_CLIENT_ID=brett \
  BRETT_OIDC_SECRET="${BRETT_OIDC_SECRET}" \
  BRETT_SESSION_SECRET="${BRETT_OIDC_SECRET}" \
  DATABASE_URL="postgresql://website:${WEBSITE_DB_PASSWORD}@localhost:5432/website" \
  npx nodemon brett/server.js
```

#### Error handling
- `set -euo pipefail` — script exits on any error
- `jq` is checked alongside other prerequisites
- If a port-forward PID is not alive after the settle wait, script prints a diagnostic and exits (so the dev doesn't start nodemon against a broken DB connection)
- Cleanup trap fires on Ctrl+C, SIGTERM, and normal exit — always kills the three background processes

#### What the script does NOT handle
- `npm install` in `brett/` — developer must run this once manually
- Keycloak redirect URI registration — `https://brett-dev.korczewski.de/callback` must be added to the `brett` OIDC client in the korczewski Keycloak admin UI (one-time manual step, noted in the script header comment)
- Deploying the korczewski dev stack (sish must already be running on pk-desktop, port 32224)
- The `BRETT_PRESETS_PATH` env var is NOT set by the dev script (intentionally) — local dev writes presets to `brett/presets.json` on disk, which is the correct behavior for development (changes persist across nodemon restarts)

---

## 3. Files Changed

| File | Change |
|------|--------|
| `brett/server.js` | 1-line change: `PRESETS_FILE` reads from `process.env.BRETT_PRESETS_PATH` |
| `k3d/brett.yaml` | Add `BRETT_PRESETS_PATH` env var + emptyDir volume + volumeMount |
| `brett/dev-start.sh` | New file (chmod +x) |

---

## 4. Testing

### EROFS fix
- `task workspace:validate` — kustomize build must succeed with new volume config
- Manual verify: deploy to korczewski, save a preset, confirm no EROFS error in logs
- CI: `task test:all` (kustomize manifest structure test covers `k3d/brett.yaml`)

### Dev start script
- Run `bash brett/dev-start.sh` from repo root on PK-Desktop
- Confirm Brett starts and responds at `http://localhost:3000`
- Confirm tunnel exposes it at `https://brett-dev.korczewski.de`
- Confirm OIDC login works (requires redirect URI pre-registered in KC)

---

## 5. Out of Scope

- Persisting presets to the database (future enhancement)
- Deploying the korczewski dev sish stack
- Registering the KC redirect URI (one-time manual step, documented in script header)
- Windows/PowerShell version of the dev start script
