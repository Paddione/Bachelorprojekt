# Brainstorming Visual Companion Tunnel Setup & Reference

This guide details how to start and publish the Visual Companion brainstorming tunnel.

## Step 1: Ensure wss:// and collab patches are applied

```bash
bash scripts/superpowers-helper-patch.sh
bash scripts/superpowers-collab-patch.sh
```

Both patches are idempotent and wired as SessionStart hooks. Re-run after any
superpowers plugin update (`bash scripts/superpowers-collab-patch.sh --check`
exits non-zero if a re-apply is needed).

If exit ≠ 0, retry or run manually.

## Step 2: Start Visual Companion server

```bash
START_SCRIPT=$(find ~/.claude/plugins/cache/claude-plugins-official/superpowers \
  -name start-server.sh | sort -V | tail -1)
RESULT=$(bash "$START_SCRIPT" --project-dir /home/patrick/Bachelorprojekt)
PORT=$(echo "$RESULT" | jq -r '.port')
SCREEN_DIR=$(echo "$RESULT" | jq -r '.screen_dir')
STATE_DIR=$(echo "$RESULT" | jq -r '.state_dir')
```

Always derive the PORT dynamically from the start script result. Never guess or reuse old ports.

## Step 3: Verify sish setup and keys

```bash
task brainstorm:status >/tmp/brainstorm-status.log 2>&1 || true
grep -q 'Running' /tmp/brainstorm-status.log || { echo "sish pod not Running — aborting"; cat /tmp/brainstorm-status.log; exit 1; }

# Check that at least one authorized key is present in secrets
KEY_COUNT=$(kubectl --context fleet -n workspace get secret workspace-secrets \
  -o jsonpath='{.data.DEV_SISH_AUTHORIZED_KEYS}' 2>/dev/null | base64 -d 2>/dev/null | grep -c '^ssh-' || echo 0)
if [[ "$KEY_COUNT" -lt 1 ]]; then
  echo "⚠️ Keine authorized_keys in workspace-secrets. Key in environments/.secrets/mentolder.yaml unter DEV_SISH_AUTHORIZED_KEYS ergänzen, dann: task env:seal ENV=mentolder"
  exit 1
fi
```

## Step 4: Kill stale tunnels & Publish

```bash
# Kill stale SSH forwards on sish port 32223
pkill -f "ssh.*[3]2223" 2>/dev/null && echo "Stale ssh tunnel(s) killed" || echo "Kein staler Tunnel gefunden"
sleep 1

# Publish tunnel (run_in_background)
task brainstorm:publish -- $PORT >/tmp/brainstorm-publish.log 2>&1
```

## Step 5: Verify the Tunnel is Live

Wait up to 15 seconds for `https://brainstorm.dev.mentolder.de` to reply:

```bash
for i in $(seq 1 15); do
  CODE=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 3 https://brainstorm.dev.mentolder.de/ || echo 000)
  if [[ "$CODE" == "200" || "$CODE" == "302" || "$CODE" == "301" ]]; then
    echo "✓ Tunnel live (HTTP $CODE) nach ${i}s"
    break
  fi
  sleep 1
done
if [[ "$CODE" != "200" && "$CODE" != "302" && "$CODE" != "301" ]]; then
  echo "✗ Tunnel failed (HTTP: $CODE)"
  cat /tmp/brainstorm-publish.log
  exit 1
fi
```

If the companion server terminates right after verification, restart it:
```bash
if ! ss -ltn 2>/dev/null | grep -q ":${PORT} "; then
  RESULT=$(bash "$START_SCRIPT" --project-dir /home/patrick/Bachelorprojekt)
  PORT=$(echo "$RESULT" | jq -r '.port')
fi
```
Tell the user: **"Visual-Companion running at https://brainstorm.dev.mentolder.de"**

---

## Collaborative Session

Use `task brainstorm:collab` to start a session that gekko can join:

```bash
# Apply collab patch + publish + print the SSO link
task brainstorm:collab -- $PORT
```

This runs the collab patch, prints the SSO link, then delegates to `task brainstorm:publish`.

### Prerequisites for gekko

1. gekko must have a Keycloak account in the workspace realm.
2. Add gekko to the `/brainstorm-access` group (Keycloak admin UI → Groups → brainstorm-access → Members).
3. Share the printed link: `https://brainstorm.dev.mentolder.de`
4. gekko logs in via Keycloak; without `/brainstorm-access` membership they get a 403.

### Dev-flow status pushes

During a dev-flow, push milestone updates to the board so gekko can follow along:

```bash
task brainstorm:push TITLE='Task 3 — Patch driver' STATUS='bats grün, driver fertig'
```

The companion's `fs.watch` broadcasts a reload automatically; both screens update.

### First-time setup: BRAINSTORM_OIDC_SECRET

Before applying `oauth2-proxy-brainstorm.yaml` to the dev cluster:

```bash
# 1. Add BRAINSTORM_OIDC_SECRET to environments/.secrets/mentolder.yaml
# 2. Re-seal:
task env:seal ENV=mentolder
# 3. Apply the dev-stack with the new manifest:
task dev:deploy
```

The Keycloak `brainstorm` client and `/brainstorm-access` group are pre-configured
in `k3d/realm-workspace-dev.json` and will be imported on the next realm import.

### WebSocket passthrough note

The SSO gate uses Traefik ForwardAuth (not a full upstream proxy). Traefik
authenticates the initial HTTP upgrade, then passes the `wss://` connection
directly to sish. Both the click-loop and the collab WebSocket survive this hop.
If the WS upgrade breaks in practice (check browser DevTools → Network → WS
frames), fall back to running oauth2-proxy with `--upstream=http://sish:80`
(full-proxy mode) and remove the IngressRoute routing to sish — the proxy
handles all traffic end-to-end in that case.
