---
title: Active Sessions Hub — Mediaviewer-Panel verlinkt aktive Forms/Brainstorm/Companion
ticket_id: T000975
status: plan_staged
date: 2026-06-20
domains: [website, infra, security]
spec_ref: docs/superpowers/specs/2026-06-20-active-sessions-hub-design.md
openspec_ref: openspec/changes/active-sessions-hub/
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Active Sessions Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface every running local dev session (HTML forms, brainstorm boards, visual companions) as clickable cards in the website Mediaviewer panel, reachable for external users (gekko) via Keycloak-gated sish tunnels.

**Architecture:** A `scripts/session-hub.sh` CLI writes a JSON registry at `~/.local/share/bachelorprojekt/active-sessions.json` and opens reverse-SSH (sish) tunnels per session. A new admin website API (`/api/admin/sessions`) reads/writes that registry; `SessionsListView.svelte` polls it every 10s and renders cards inside `MediaviewerPanel.svelte`'s idle state. A new dev-stack `oauth2-proxy-sessions.yaml` (mirroring `oauth2-proxy-brainstorm.yaml`) gates `session-*.${DEV_DOMAIN}` behind the Keycloak `session-hub-access` group.

**Tech Stack:** Bash (CLI + tunnel), Astro API routes + TypeScript, Svelte 5 (runes), Kustomize / Traefik IngressRoute / oauth2-proxy, Keycloak realm JSON, SealedSecrets, go-task.

## Global Constraints

- **S3 — no brand-domain literals.** `*.mentolder.de` / `*.korczewski.de` string literals are forbidden in `k3d/`, `prod*/`, `website/src/` (comments exempt). Dev-stack manifests are envsubst'd at apply time — use the `${DEV_DOMAIN}` variable in manifests and `.localhost` literals for in-cluster oauth2-proxy URLs (exactly as `oauth2-proxy-brainstorm.yaml` does). In TS/Svelte, never hardcode a host — read it from the API payload (`public_url`) or an existing prop.
- **S4 — no orphans.** Every new `k3d/*.yaml` must be referenced in a `kustomization.yaml`; every new `scripts/*.sh` must be reachable from a Taskfile/CI/doc/other script.
- **S1 — per-file line ratchet.** Files touched here and their budgets (all `nicht-baselined` → budget = static limit − current):
  - `website/src/components/MediaviewerPanel.svelte` — ist 147 · limit 500 → budget ~353. Ample.
  - `scripts/session-hub.sh` — NEW `.sh`, limit 500. Keep < ~400 for headroom.
  - `website/src/pages/api/admin/sessions/index.ts` — NEW `.ts`, limit 600. Keep < ~250.
  - `website/src/components/SessionsListView.svelte` — NEW `.svelte`, limit 500. Keep < ~300.
  - `k3d/dev-stack/oauth2-proxy-sessions.yaml`, `k3d/realm-workspace-dev.json`, `Taskfile.session.yml`, `environments/schema.yaml`, `environments/.secrets/mentolder.yaml`, `environments/sealed-secrets/mentolder.yaml`, SKILL/reference `.md` — no S1 line limit (`.yaml`/`.json`/`.yml`/`.md` are not in `gates.yaml:s1.limits`).
- **Admin auth pattern (copy verbatim).** API routes use `getSession(request.headers.get('cookie'))` + `isAdmin(session)` from `website/src/lib/auth.ts`, `export const prerender = false`, and `locals.requestLogger.error(...)` for errors. `UserSession` has `{ sub, email, preferred_username }`. Mirror `website/src/pages/api/admin/factory-control.ts`'s `authGuard()` helper.
- **Out of scope (do NOT implement):** prod/fleet deploy of the sessions oauth2-proxy, WebSocket push, cross-machine session sharing, a standalone `/admin/sessions` page. Polling + the Mediaviewer default view is the MVP.
- **`.claude/settings.json` is gitignored** (`.gitignore:103`). The SessionStart hook is a documented **local-add** instruction in a committed reference doc — never commit `settings.json` itself.

---

## File Structure

**Neu:**
- `scripts/session-hub.sh` — Registry + sish-Tunnel CLI
- `website/src/pages/api/admin/sessions/index.ts` — Admin-API (GET/POST/DELETE)
- `website/src/components/SessionsListView.svelte` — Session-Karten-UI (10s-Polling)
- `k3d/dev-stack/oauth2-proxy-sessions.yaml` — Keycloak-Gate für `session-*.${DEV_DOMAIN}`
- `Taskfile.session.yml` — `session:register`, `session:list`, `session:deregister` Tasks
- `~/.local/share/bachelorprojekt/active-sessions.json` — Laufzeit-Registry (nicht committet)

**Modifiziert:**
- `website/src/components/MediaviewerPanel.svelte` — Idle-State → SessionsListView
- `k3d/realm-workspace-dev.json` — Gruppe `session-hub-access`, Client `session-hub`
- `k3d/dev-stack/kustomization.yaml` — `oauth2-proxy-sessions.yaml` referenzieren
- `Taskfile.yml` — `Taskfile.session.yml` includen
- `environments/schema.yaml` — `SESSION_HUB_OIDC_SECRET` registrieren
- `environments/.secrets/mentolder.yaml` — Secret eintragen (gitignored)
- `environments/sealed-secrets/mentolder.yaml` — neu versiegeln
- `.claude/skills/feature-intake/SKILL.md` — `session-hub.sh start-form` nach HTTP-Server
- `.claude/skills/references/brainstorm-tunnel-setup.md` — `session-hub.sh register` nach Tunnel

---

### Task 1: SESSION_HUB_OIDC_SECRET — generate, register, seal

**Files:**
- Modify: `environments/.secrets/mentolder.yaml` (gitignored — add one key)
- Modify: `environments/schema.yaml` (register the var so `env:validate` passes)
- Modify: `environments/sealed-secrets/mentolder.yaml` (regenerated by `env:seal`)

**Interfaces:**
- Produces: a `SESSION_HUB_OIDC_SECRET` key inside the `workspace-secrets` Secret after deploy — consumed by Task 4's oauth2-proxy and Task 2's realm client `secret` field.

- [ ] **Step 1: Read the existing secrets file to find the BRAINSTORM_OIDC_SECRET line**

Run: `grep -n "BRAINSTORM_OIDC_SECRET" environments/.secrets/mentolder.yaml`
Expected: a line like `  BRAINSTORM_OIDC_SECRET: "<hex>"` under a `setup_vars:` / secret-values block. Note the indentation and surrounding block.

- [ ] **Step 2: Generate a 32-byte hex secret and add it next to BRAINSTORM_OIDC_SECRET**

```bash
SECRET=$(openssl rand -hex 32)
echo "Generated SESSION_HUB_OIDC_SECRET (do NOT echo in committed output): set in .secrets"
```

Edit `environments/.secrets/mentolder.yaml`: add, with the **same indentation** as `BRAINSTORM_OIDC_SECRET`, a new line:

```yaml
  SESSION_HUB_OIDC_SECRET: "<paste the openssl rand -hex 32 value here>"
```

Never paste this value into a commit, the plan, or chat. The `.secrets/` file is gitignored.

- [ ] **Step 3: Register the var in environments/schema.yaml**

Find the `BRAINSTORM_OIDC_SECRET` entry:

Run: `grep -n "BRAINSTORM_OIDC_SECRET" environments/schema.yaml`

Copy that entry's exact shape and add a sibling immediately after it. Example shape (match the real file's fields — `name`, `kind`/`secret: true`, `description`):

```yaml
  - name: SESSION_HUB_OIDC_SECRET
    secret: true
    description: "OIDC client secret for the session-hub oauth2-proxy (Keycloak confidential client `session-hub`). Gates session-*.${DEV_DOMAIN} behind the /session-hub-access group."
```

- [ ] **Step 4: Validate schema, then seal**

```bash
task env:validate ENV=mentolder
task env:seal ENV=mentolder
```

Expected: `env:validate` passes (no "unknown var" / "missing var"); `env:seal` rewrites `environments/sealed-secrets/mentolder.yaml` with the new encrypted field. Verify the sealed file changed and now contains a `SESSION_HUB_OIDC_SECRET` key:

Run: `grep -c "SESSION_HUB_OIDC_SECRET" environments/sealed-secrets/mentolder.yaml`
Expected: `1`

- [ ] **Step 5: Commit**

```bash
git add environments/schema.yaml environments/sealed-secrets/mentolder.yaml
git commit -m "feat(secrets): add SESSION_HUB_OIDC_SECRET for session-hub oauth2-proxy [T000975]"
```

(`environments/.secrets/mentolder.yaml` is gitignored and is intentionally NOT staged.)

---

### Task 2: Keycloak realm — session-hub client, session-hub-access group, members

**Files:**
- Modify: `k3d/realm-workspace-dev.json` (add 1 client, 1 group, set membership on `Paddione` + `gekko`)

**Interfaces:**
- Consumes: nothing.
- Produces: Keycloak confidential client `session-hub` (redirect URI `http://session-hub.localhost/oauth2/callback`) and group `/session-hub-access` with members `Paddione`, `gekko` — consumed by Task 4's oauth2-proxy (`--client-id=session-hub`, `--allowed-group=/session-hub-access`).

> **Note on usernames:** the realm `users` array uses `Paddione` (capital P) and `gekko`. Both currently have `"groups": null`. The brainstorm client uses `http://brainstorm.localhost/oauth2/callback` — mirror the `.localhost` form (S3-safe; not a brand domain).

- [ ] **Step 1: Add the session-hub client (mirror the brainstorm client)**

Run: `jq '.clients[] | select(.clientId=="brainstorm")' k3d/realm-workspace-dev.json`

Copy that object verbatim into the `clients` array as a new entry, changing only:
- `clientId`: `"brainstorm"` → `"session-hub"`
- `id` (if present): generate a fresh UUID (`uuidgen | tr A-Z a-z`)
- `secret`: `"${SESSION_HUB_OIDC_SECRET}"` (the realm import substitutes this; confirm brainstorm uses the same `${...}` placeholder form — if brainstorm hardcodes a literal, use the literal value `MANAGED_EXTERNALLY` and rely on the oauth2-proxy reading the secret from `workspace-secrets`, matching the brainstorm convention)
- `redirectUris`: `["http://session-hub.localhost/oauth2/callback"]`
- any `name`/`description` text mentioning brainstorm → session-hub

Edit the JSON with a real editor (preserve formatting). After editing, validate it parses:

Run: `jq '.clients[] | select(.clientId=="session-hub") | {clientId, redirectUris, publicClient, standardFlowEnabled}' k3d/realm-workspace-dev.json`
Expected: prints the new client with `publicClient: false`, `standardFlowEnabled: true`.

- [ ] **Step 2: Add the /session-hub-access group**

Copy the `brainstorm-access` group object:

Run: `jq '.groups[] | select(.name=="brainstorm-access")' k3d/realm-workspace-dev.json`

Add a sibling in `groups` with `name: "session-hub-access"`, `path: "/session-hub-access"`, empty `attributes`/`realmRoles`/`clientRoles`/`subGroups` (same shape as brainstorm-access).

Run: `jq '.groups[] | select(.name=="session-hub-access") | .path' k3d/realm-workspace-dev.json`
Expected: `"/session-hub-access"`

- [ ] **Step 3: Add Paddione + gekko to the group**

For each of the two `users` entries (`Paddione`, `gekko`), set their `groups` to include `/session-hub-access`. Since both are currently `null`, set:

```json
"groups": ["/session-hub-access"]
```

(If a user already has a non-null `groups` array after a future change, append instead of replacing.)

Run: `jq -r '.users[] | select(.username=="Paddione" or .username=="gekko") | "\(.username): \(.groups)"' k3d/realm-workspace-dev.json`
Expected:
```
Paddione: ["/session-hub-access"]
gekko: ["/session-hub-access"]
```

- [ ] **Step 4: Full-file JSON validity gate**

Run: `jq empty k3d/realm-workspace-dev.json && echo "VALID JSON"`
Expected: `VALID JSON` (no parse error).

- [ ] **Step 5: Commit**

```bash
git add k3d/realm-workspace-dev.json
git commit -m "feat(keycloak): add session-hub client + session-hub-access group [T000975]"
```

---

### Task 3: scripts/session-hub.sh — registry + tunnel CLI

**Files:**
- Create: `scripts/session-hub.sh`

**Interfaces:**
- Consumes: `$DEV_DOMAIN` (via `source scripts/env-resolve.sh mentolder`), sish SSH endpoint (k3d loadbalancer host port `2222`, user `tunnel`), `~/.ssh/id_ed25519`.
- Produces: subcommands `start-form`, `register`, `list`, `deregister`, `reap`. Registry file `~/.local/share/bachelorprojekt/active-sessions.json` — a JSON array of objects `{slug,type,title,port,public_url,local_url,tunnel_pid,server_pid,started_at}`. This exact JSON shape is consumed by Task 6's API. `list` prints the registry JSON to stdout.

> **Style:** follow `scripts/agent-lock.sh` — `#!/usr/bin/env bash`, `set -uo pipefail`, a header comment block ending in `[T000975]`, `_`-prefixed helpers, a `case "$cmd" in … esac` dispatcher at the bottom, and a `usage()` that lists subcommands. Use `jq` for all registry mutation (atomic write to a `.tmp` then `mv`). Keep the file under ~400 lines (limit 500).

- [ ] **Step 1: Write the BATS test first**

Create `tests/unit/session-hub.bats`:

```bash
#!/usr/bin/env bats
# Unit tests for scripts/session-hub.sh — registry mutation only (no real SSH).

setup() {
  export SESSION_HUB_REGISTRY="$BATS_TEST_TMPDIR/active-sessions.json"
  export SESSION_HUB_NO_TUNNEL=1   # skip ssh; only exercise registry logic
  export DEV_DOMAIN="dev.example.test"
  SCRIPT="$BATS_TEST_DIRNAME/../../scripts/session-hub.sh"
}

@test "register adds a session to an empty registry" {
  run bash "$SCRIPT" register --name foo --port 18080 --type brainstorm --title "Foo Board"
  [ "$status" -eq 0 ]
  run jq -r '.[0].slug' "$SESSION_HUB_REGISTRY"
  [ "$output" = "foo" ]
  run jq -r '.[0].public_url' "$SESSION_HUB_REGISTRY"
  [ "$output" = "https://session-foo.dev.example.test" ]
}

@test "list prints the registry JSON" {
  bash "$SCRIPT" register --name bar --port 18081 --type form --title "Bar"
  run bash "$SCRIPT" list
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.[] | select(.slug=="bar")'
}

@test "deregister removes a session by name" {
  bash "$SCRIPT" register --name baz --port 18082 --type form --title "Baz"
  run bash "$SCRIPT" deregister --name baz
  [ "$status" -eq 0 ]
  run jq -r 'length' "$SESSION_HUB_REGISTRY"
  [ "$output" = "0" ]
}

@test "reap drops entries whose pids are dead" {
  bash "$SCRIPT" register --name dead --port 18083 --type form --title "Dead"
  # patch the stored pids to a guaranteed-dead pid
  jq '(.[0].tunnel_pid)=999999 | (.[0].server_pid)=999999' "$SESSION_HUB_REGISTRY" > "$SESSION_HUB_REGISTRY.t" && mv "$SESSION_HUB_REGISTRY.t" "$SESSION_HUB_REGISTRY"
  run bash "$SCRIPT" reap
  [ "$status" -eq 0 ]
  run jq -r 'length' "$SESSION_HUB_REGISTRY"
  [ "$output" = "0" ]
}

@test "register is idempotent on slug (replaces, no duplicate)" {
  bash "$SCRIPT" register --name dup --port 1 --type form --title "v1"
  bash "$SCRIPT" register --name dup --port 2 --type form --title "v2"
  run jq -r '[.[] | select(.slug=="dup")] | length' "$SESSION_HUB_REGISTRY"
  [ "$output" = "1" ]
  run jq -r '.[] | select(.slug=="dup") | .port' "$SESSION_HUB_REGISTRY"
  [ "$output" = "2" ]
}
```

- [ ] **Step 2: Run the test, confirm it fails (script missing)**

Run: `bats tests/unit/session-hub.bats`
Expected: FAIL — `scripts/session-hub.sh` does not exist / `No such file`.

- [ ] **Step 3: Write scripts/session-hub.sh**

```bash
#!/usr/bin/env bash
# scripts/session-hub.sh — Active Sessions Hub registry + sish tunnel CLI. [T000975]
#
# Why: dev sessions (HTML forms, brainstorm boards, visual companions) are only
# reachable via localhost. This CLI publishes each one over the dev-stack sish
# tunnel as session-<slug>.${DEV_DOMAIN} (Keycloak-gated) and records it in a
# JSON registry the website Mediaviewer reads.
#
# Registry: ~/.local/share/bachelorprojekt/active-sessions.json (array). Override
# with SESSION_HUB_REGISTRY (used by tests). Set SESSION_HUB_NO_TUNNEL=1 to skip
# the ssh -R call (unit tests / dry runs).
#
# Subcommands: start-form | register | list | deregister | reap
set -uo pipefail

REGISTRY="${SESSION_HUB_REGISTRY:-$HOME/.local/share/bachelorprojekt/active-sessions.json}"
SSH_PORT="${SESSION_HUB_SSH_PORT:-2222}"
SSH_KEY="${SESSION_HUB_SSH_KEY:-$HOME/.ssh/id_ed25519}"

_now_iso() { date -u +%Y-%m-%dT%H:%M:%SZ; }
_slug() { printf '%s' "$1" | tr '[:upper:] ' '[:lower:]-' | tr -cd 'a-z0-9-'; }

_ensure_registry() {
  mkdir -p "$(dirname "$REGISTRY")"
  [ -f "$REGISTRY" ] || printf '[]\n' > "$REGISTRY"
}

# Atomic write: pipe new JSON via stdin, replace the registry.
_write() { local tmp="$REGISTRY.tmp.$$"; cat > "$tmp" && mv "$tmp" "$REGISTRY"; }

_resolve_domain() {
  if [ -n "${DEV_DOMAIN:-}" ]; then return 0; fi
  # shellcheck disable=SC1091
  source scripts/env-resolve.sh "${ENV:-mentolder}" 2>/dev/null || true
  [ -n "${DEV_DOMAIN:-}" ] || { echo "session-hub: DEV_DOMAIN unresolved (source env-resolve.sh)" >&2; return 1; }
}

_pid_alive() { [ -n "${1:-}" ] && [ "$1" != "null" ] && kill -0 "$1" 2>/dev/null; }

# Open a reverse-SSH tunnel session-<slug>:80 → localhost:<port>. Echoes the PID.
_open_tunnel() {
  local slug="$1" port="$2"
  if [ -n "${SESSION_HUB_NO_TUNNEL:-}" ]; then echo "0"; return 0; fi
  _resolve_domain || return 1
  ssh -p "$SSH_PORT" -N \
    -o StrictHostKeyChecking=accept-new \
    -o ExitOnForwardFailure=yes \
    -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \
    -i "$SSH_KEY" \
    -R "session-${slug}:80:localhost:${port}" \
    "tunnel@${DEV_DOMAIN}" >/dev/null 2>&1 &
  echo "$!"
}

# Insert/replace a registry entry keyed by slug.
_upsert() {
  local slug="$1" type="$2" title="$3" port="$4" local_url="$5" tunnel_pid="$6" server_pid="$7"
  _resolve_domain || return 1
  _ensure_registry
  local public_url="https://session-${slug}.${DEV_DOMAIN}"
  jq \
    --arg slug "$slug" --arg type "$type" --arg title "$title" \
    --argjson port "$port" --arg public "$public_url" --arg local "$local_url" \
    --argjson tpid "${tunnel_pid:-0}" --argjson spid "${server_pid:-0}" \
    --arg started "$(_now_iso)" \
    '[ .[] | select(.slug != $slug) ] + [{
       slug:$slug, type:$type, title:$title, port:$port,
       public_url:$public, local_url:$local,
       tunnel_pid:$tpid, server_pid:$spid, started_at:$started
     }]' "$REGISTRY" | _write
  echo "registered $slug → $public_url"
}

cmd_register() {
  local name="" port="" type="companion" title=""
  while [ $# -gt 0 ]; do case "$1" in
    --name) name="$2"; shift 2;;
    --port) port="$2"; shift 2;;
    --type) type="$2"; shift 2;;
    --title) title="$2"; shift 2;;
    *) echo "register: unknown arg $1" >&2; return 2;;
  esac; done
  [ -n "$name" ] && [ -n "$port" ] || { echo "register: --name and --port required" >&2; return 2; }
  local slug; slug="$(_slug "$name")"
  [ -n "$title" ] || title="$name"
  local tpid; tpid="$(_open_tunnel "$slug" "$port")" || return 1
  _upsert "$slug" "$type" "$title" "$port" "http://localhost:${port}/" "$tpid" "0"
}

cmd_start_form() {
  local file="" name="" port=""
  while [ $# -gt 0 ]; do case "$1" in
    --file) file="$2"; shift 2;;
    --name) name="$2"; shift 2;;
    --port) port="$2"; shift 2;;
    *) echo "start-form: unknown arg $1" >&2; return 2;;
  esac; done
  [ -n "$file" ] && [ -n "$name" ] || { echo "start-form: --file and --name required" >&2; return 2; }
  [ -f "$file" ] || { echo "start-form: file not found: $file" >&2; return 1; }
  local slug; slug="$(_slug "$name")"
  [ -n "$port" ] || port=$(( 18000 + (RANDOM % 1000) ))
  local dir base spid
  dir="$(cd "$(dirname "$file")" && pwd)"; base="$(basename "$file")"
  if [ -z "${SESSION_HUB_NO_TUNNEL:-}" ]; then
    ( cd "$dir" && exec python3 -m http.server "$port" --bind 127.0.0.1 ) >/dev/null 2>&1 &
    spid="$!"; sleep 1
  else spid="0"; fi
  local tpid; tpid="$(_open_tunnel "$slug" "$port")" || return 1
  _upsert "$slug" "form" "$name" "$port" "http://localhost:${port}/${base}" "$tpid" "$spid"
}

cmd_list() { _ensure_registry; cat "$REGISTRY"; }

cmd_deregister() {
  local name=""
  while [ $# -gt 0 ]; do case "$1" in
    --name) name="$2"; shift 2;;
    *) echo "deregister: unknown arg $1" >&2; return 2;;
  esac; done
  [ -n "$name" ] || { echo "deregister: --name required" >&2; return 2; }
  local slug; slug="$(_slug "$name")"
  _ensure_registry
  # kill pids before dropping the entry
  local tpid spid
  tpid="$(jq -r --arg s "$slug" '.[] | select(.slug==$s) | .tunnel_pid' "$REGISTRY")"
  spid="$(jq -r --arg s "$slug" '.[] | select(.slug==$s) | .server_pid' "$REGISTRY")"
  _pid_alive "$tpid" && kill "$tpid" 2>/dev/null || true
  _pid_alive "$spid" && kill "$spid" 2>/dev/null || true
  jq --arg s "$slug" '[ .[] | select(.slug != $s) ]' "$REGISTRY" | _write
  echo "deregistered $slug"
}

cmd_reap() {
  _ensure_registry
  # keep only entries whose tunnel pid is still alive (server pid optional)
  local kept removed total
  total="$(jq -r 'length' "$REGISTRY")"
  local survivors="[]"
  while IFS= read -r row; do
    [ -n "$row" ] || continue
    local tpid; tpid="$(printf '%s' "$row" | jq -r '.tunnel_pid')"
    if _pid_alive "$tpid"; then
      survivors="$(jq -c --argjson r "$row" '. + [$r]' <<<"$survivors")"
    fi
  done < <(jq -c '.[]' "$REGISTRY")
  printf '%s\n' "$survivors" | _write
  kept="$(jq -r 'length' "$REGISTRY")"; removed=$(( total - kept ))
  echo "reaped $removed stale session(s); $kept active"
}

usage() {
  cat >&2 <<'USAGE'
session-hub.sh — Active Sessions Hub registry + tunnel CLI
  start-form  --file <html> --name <name> [--port <p>]   start python http.server + tunnel + register
  register    --name <n> --port <p> [--type <t>] [--title <s>]   register an already-listening port
  list                                                   print the JSON registry
  deregister  --name <n>                                 kill pids + drop from registry
  reap                                                   drop entries with dead tunnel pids
USAGE
}

main() {
  local cmd="${1:-}"; shift 2>/dev/null || true
  case "$cmd" in
    start-form) cmd_start_form "$@";;
    register)   cmd_register "$@";;
    list)       cmd_list "$@";;
    deregister) cmd_deregister "$@";;
    reap)       cmd_reap "$@";;
    -h|--help|help|"") usage; [ -z "$cmd" ] && return 2 || return 0;;
    *) echo "session-hub: unknown subcommand: $cmd" >&2; usage; return 2;;
  esac
}

main "$@"
```

- [ ] **Step 4: Make executable, run the tests, confirm they pass**

```bash
chmod +x scripts/session-hub.sh
bats tests/unit/session-hub.bats
```
Expected: all 5 tests PASS.

- [ ] **Step 5: Line-budget check**

Run: `wc -l scripts/session-hub.sh`
Expected: < 500 (target < ~420). If over, extract the `cmd_*` dispatch help text — do not cosmetically collapse.

- [ ] **Step 6: Commit**

```bash
git add scripts/session-hub.sh tests/unit/session-hub.bats
git commit -m "feat(session-hub): add session-hub.sh registry + tunnel CLI [T000975]"
```

---

### Task 4: oauth2-proxy-sessions.yaml — Keycloak gate for session-*.${DEV_DOMAIN}

**Files:**
- Create: `k3d/dev-stack/oauth2-proxy-sessions.yaml`
- Modify: `k3d/dev-stack/kustomization.yaml` (add the new manifest to `resources:`)

**Interfaces:**
- Consumes: Task 2's `session-hub` client + `/session-hub-access` group; Task 1's `SESSION_HUB_OIDC_SECRET` in `workspace-secrets`; the existing `sish` Service (port 80); `${DEV_DOMAIN}` (envsubst'd by `task dev:deploy`).
- Produces: a Traefik IngressRoute matching `HostRegexp(session-{slug}.${DEV_DOMAIN})`, ForwardAuth-gated by oauth2-proxy `session-hub`, forwarding to sish.

> **S3:** the in-cluster oauth2-proxy URLs use `.localhost` literals (like brainstorm — these are not brand domains). The public host appears only via the `${DEV_DOMAIN}` envsubst variable, which `task dev:deploy` substitutes at apply time (it pipes the kustomize output through `envsubst '$DEV_DOMAIN …'`). Do not write `*.mentolder.de` literally anywhere.

- [ ] **Step 1: Create the manifest (adapt oauth2-proxy-brainstorm.yaml)**

Start from `k3d/dev-stack/oauth2-proxy-brainstorm.yaml` and produce `k3d/dev-stack/oauth2-proxy-sessions.yaml` with these substitutions:
- All `brainstorm` → `session-hub` in resource names/labels/Service (`oauth2-proxy-session-hub`).
- `--client-id=brainstorm` → `--client-id=session-hub`
- `--client-secret=$(BRAINSTORM_OIDC_SECRET)` → `--client-secret=$(SESSION_HUB_OIDC_SECRET)` and the `env:` `secretKeyRef.key` `BRAINSTORM_OIDC_SECRET` → `SESSION_HUB_OIDC_SECRET` (both the init-less container env block).
- `--redirect-url=http://brainstorm.localhost/oauth2/callback` → `--redirect-url=http://session-hub.localhost/oauth2/callback`
- `--cookie-name=_oauth2_proxy_brainstorm` → `--cookie-name=_oauth2_proxy_session_hub`
- `--allowed-group=/brainstorm-access` → `--allowed-group=/session-hub-access`
- `--oidc-extra-audience=brainstorm` → `--oidc-extra-audience=session-hub`
- `--whitelist-domain=brainstorm.localhost` → add **two**: `--whitelist-domain=session-hub.localhost` and `--whitelist-domain=*.${DEV_DOMAIN}` (wildcard so the post-auth redirect back to any `session-*` host is allowed; the `${DEV_DOMAIN}` is envsubst'd).
- Middleware names: `brainstorm-auth` → `session-hub-auth`, `brainstorm-errors` → `session-hub-errors`. Update the `errors` middleware `service.name` to `oauth2-proxy-session-hub`, and the ForwardAuth `address` host to `oauth2-proxy-session-hub.workspace-dev.svc.cluster.local:4180/oauth2/auth`.
- Replace the brainstorm IngressRoute with a wildcard one (note the regex `subdomain` capture mirrors `traefik-wildcard-ingress.yaml`):

```yaml
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: session-hub-auth-route
spec:
  entryPoints:
    - web
  routes:
    # oauth2 callback / sign_in endpoints — no auth, direct to the proxy
    - match: HostRegexp(`session-{slug:[a-z0-9-]+}.${DEV_DOMAIN}`) && PathPrefix(`/oauth2`)
      kind: Rule
      priority: 20
      services:
        - name: oauth2-proxy-session-hub
          port: 4180
    # all other session-* traffic — ForwardAuth gated, then sish routes by subdomain
    - match: HostRegexp(`session-{slug:[a-z0-9-]+}.${DEV_DOMAIN}`)
      kind: Rule
      priority: 11
      middlewares:
        - name: session-hub-errors
        - name: session-hub-auth
      services:
        - name: sish
          port: 80
```

Keep the top-of-file `⚠️ NEEDS-HUMAN VERIFICATION` comment block, adapted to session-hub (mention `task env:seal ENV=mentolder` after adding `SESSION_HUB_OIDC_SECRET`, and the `/session-hub-access` group). Set priority `11` so it beats the sish-catchall (`priority: 1`) but is distinct from brainstorm's `10`.

- [ ] **Step 2: Add to the kustomization**

Edit `k3d/dev-stack/kustomization.yaml`, add under `resources:` after `oauth2-proxy-brainstorm.yaml`:

```yaml
  - oauth2-proxy-sessions.yaml
```

- [ ] **Step 3: Kustomize build gate (S4 — manifest must be referenced & parse)**

```bash
DEV_DOMAIN=dev.example.test kubectl kustomize k3d/dev-stack/ \
  | DEV_DOMAIN=dev.example.test envsubst '$DEV_DOMAIN' \
  | grep -c "oauth2-proxy-session-hub"
```
Expected: a count > 0 (the Deployment/Service/Middleware names render). If `kubectl kustomize` errors with "file not referenced" or YAML parse failure, fix before continuing.

- [ ] **Step 4: Confirm no brand-domain literal slipped in (S3 self-check)**

Run: `grep -nE 'mentolder\.de|korczewski\.de' k3d/dev-stack/oauth2-proxy-sessions.yaml | grep -v '^[0-9]*:#' || echo "S3 OK — no brand literals outside comments"`
Expected: `S3 OK — no brand literals outside comments`.

- [ ] **Step 5: Commit**

```bash
git add k3d/dev-stack/oauth2-proxy-sessions.yaml k3d/dev-stack/kustomization.yaml
git commit -m "feat(dev-stack): add oauth2-proxy gate for session-*.\${DEV_DOMAIN} [T000975]"
```

---

### Task 5: Taskfile.session.yml — session:* tasks + wire into Taskfile.yml

**Files:**
- Create: `Taskfile.session.yml`
- Modify: `Taskfile.yml` (add a `session:` include) — this is what makes `scripts/session-hub.sh` Taskfile-reachable (S4).

**Interfaces:**
- Consumes: `scripts/session-hub.sh` (Task 3).
- Produces: `task session:register`, `task session:list`, `task session:deregister`, `task session:reap`, `task session:start-form` — thin wrappers passing `{{.CLI_ARGS}}` to the script.

- [ ] **Step 1: Create Taskfile.session.yml**

```yaml
# Taskfile.session.yml
# ─────────────────────────────────────────────────────────────────────────────
# Active Sessions Hub — register / list / deregister local dev sessions that the
# website Mediaviewer surfaces. Wraps scripts/session-hub.sh. Tunnels go over the
# dev-stack sish broker (k3d loadbalancer host port 2222) as
# session-<slug>.${DEV_DOMAIN}. [T000975]
# ─────────────────────────────────────────────────────────────────────────────
version: "3"

vars:
  ENV: mentolder

tasks:
  list:
    desc: "[session] Print the active-sessions JSON registry"
    cmds:
      - bash scripts/session-hub.sh list

  register:
    desc: "[session] Register a listening port. Usage: task session:register -- --name foo --port 8080 --type brainstorm --title 'Foo'"
    cmds:
      - |
        source scripts/env-resolve.sh "{{.ENV}}"
        bash scripts/session-hub.sh register {{.CLI_ARGS}}

  start-form:
    desc: "[session] Serve an HTML file + tunnel + register. Usage: task session:start-form -- --file /tmp/foo.html --name foo"
    cmds:
      - |
        source scripts/env-resolve.sh "{{.ENV}}"
        bash scripts/session-hub.sh start-form {{.CLI_ARGS}}

  deregister:
    desc: "[session] Kill pids + drop a session. Usage: task session:deregister -- --name foo"
    cmds:
      - bash scripts/session-hub.sh deregister {{.CLI_ARGS}}

  reap:
    desc: "[session] Drop registry entries whose tunnel pid is dead"
    cmds:
      - bash scripts/session-hub.sh reap
```

- [ ] **Step 2: Wire the include into Taskfile.yml**

Edit `Taskfile.yml`. After the `brainstorm:` include block (around line 40), add:

```yaml
  # Active Sessions Hub — register/list local dev sessions for the Mediaviewer.
  # See Taskfile.session.yml + scripts/session-hub.sh.
  session:
    taskfile: ./Taskfile.session.yml
    dir: .
```

- [ ] **Step 3: Verify tasks resolve (dry-run)**

```bash
task session:list --dry-run
task session:reap --dry-run
```
Expected: both print the resolved command (`bash scripts/session-hub.sh …`) without error. If `task` reports "task not found", the include is mis-wired.

- [ ] **Step 4: Commit**

```bash
git add Taskfile.session.yml Taskfile.yml
git commit -m "feat(taskfile): add session:* tasks wrapping session-hub.sh [T000975]"
```

---

### Task 6: website/src/pages/api/admin/sessions/index.ts — GET/POST/DELETE

**Files:**
- Create: `website/src/pages/api/admin/sessions/index.ts`
- Test: `website/src/pages/api/admin/sessions/index.test.ts`

**Interfaces:**
- Consumes: `getSession`, `isAdmin` from `../../../../lib/auth` (note depth: file is at `api/admin/sessions/index.ts` → four `../` to `src/lib`); the registry file written by Task 3.
- Produces: `GET /api/admin/sessions` → `{ sessions: Session[] }`; `POST` → registers (body `{name,port,type,title}`); `DELETE /api/admin/sessions?slug=<slug>` → removes. `Session` type fields match the registry: `{slug,type,title,port,public_url,local_url,started_at}`.

> **Registry access from the website:** the website runs in-cluster and cannot see the operator's `~/.local/share`. Read the path from `process.env.SESSION_HUB_REGISTRY` with a default of `~/.local/share/bachelorprojekt/active-sessions.json` (expanded via `os.homedir()`). When the file is absent, return an **empty list** (not a 500) — a missing registry just means "no sessions". POST/DELETE shell out to `scripts/session-hub.sh` via `child_process.execFile` **only when `SESSION_HUB_REGISTRY_WRITABLE === 'true'`** (default off in prod); otherwise return `501 not_implemented`. This keeps the MVP read-only in-cluster and avoids a silent no-op.

- [ ] **Step 1: Write the failing test**

Create `website/src/pages/api/admin/sessions/index.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// auth is mocked: admin vs non-admin vs anon
vi.mock('../../../../lib/auth', () => ({
  getSession: vi.fn(),
  isAdmin: vi.fn(),
}));
import { getSession, isAdmin } from '../../../../lib/auth';
import { GET } from './index';

const mkReq = () => new Request('http://x/api/admin/sessions', { headers: { cookie: 's=1' } });
const locals = { requestLogger: { error: vi.fn() } } as any;

describe('GET /api/admin/sessions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('401 when anonymous', async () => {
    (getSession as any).mockResolvedValue(null);
    const res = await GET({ request: mkReq(), locals } as any);
    expect(res.status).toBe(401);
  });

  it('403 when non-admin', async () => {
    (getSession as any).mockResolvedValue({ preferred_username: 'bob', sub: 'b', email: 'b@x' });
    (isAdmin as any).mockReturnValue(false);
    const res = await GET({ request: mkReq(), locals } as any);
    expect(res.status).toBe(403);
  });

  it('returns sessions from the registry for an admin', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sess-'));
    const reg = join(dir, 'active-sessions.json');
    writeFileSync(reg, JSON.stringify([
      { slug: 'foo', type: 'form', title: 'Foo', port: 1, public_url: 'https://session-foo.dev.example.test', local_url: 'http://localhost:1/', started_at: '2026-06-20T00:00:00Z' },
    ]));
    process.env.SESSION_HUB_REGISTRY = reg;
    (getSession as any).mockResolvedValue({ preferred_username: 'admin', sub: 'a', email: 'a@x' });
    (isAdmin as any).mockReturnValue(true);
    const res = await GET({ request: mkReq(), locals } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessions[0].slug).toBe('foo');
  });

  it('returns an empty list when the registry file is absent', async () => {
    process.env.SESSION_HUB_REGISTRY = join(tmpdir(), 'does-not-exist-' + Date.now() + '.json');
    (getSession as any).mockResolvedValue({ preferred_username: 'admin', sub: 'a', email: 'a@x' });
    (isAdmin as any).mockReturnValue(true);
    const res = await GET({ request: mkReq(), locals } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessions).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test, confirm it fails (module missing)**

Run: `cd website && npx vitest run src/pages/api/admin/sessions/index.test.ts`
Expected: FAIL — cannot resolve `./index`.

- [ ] **Step 3: Write the API route**

```ts
import type { APIRoute } from 'astro';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getSession, isAdmin } from '../../../../lib/auth';

export const prerender = false;

const execFileAsync = promisify(execFile);

interface SessionEntry {
  slug: string;
  type: string;
  title: string;
  port: number;
  public_url: string;
  local_url: string;
  started_at: string;
}

function registryPath(): string {
  return process.env.SESSION_HUB_REGISTRY
    ?? `${homedir()}/.local/share/bachelorprojekt/active-sessions.json`;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function authGuard(session: Awaited<ReturnType<typeof getSession>>): Response | null {
  if (!session) return json({ error: 'Unauthorized' }, 401);
  if (!isAdmin(session)) return json({ error: 'Forbidden' }, 403);
  return null;
}

async function readRegistry(): Promise<SessionEntry[]> {
  try {
    const raw = await readFile(registryPath(), 'utf8');
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as SessionEntry[]) : [];
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return []; // no registry = no sessions
    throw err;
  }
}

export const GET: APIRoute = async ({ request, locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  const guard = authGuard(session);
  if (guard) return guard;
  try {
    return json({ sessions: await readRegistry() }, 200);
  } catch (err) {
    locals.requestLogger.error({ err }, '[api/admin/sessions] GET error:');
    return json({ error: 'read_failed' }, 500);
  }
};

async function runHub(args: string[], locals: any): Promise<Response> {
  if (process.env.SESSION_HUB_REGISTRY_WRITABLE !== 'true') {
    return json({ error: 'not_implemented', detail: 'registry is read-only in this environment' }, 501);
  }
  try {
    await execFileAsync('bash', ['scripts/session-hub.sh', ...args], { timeout: 15_000 });
    return json({ sessions: await readRegistry() }, 200);
  } catch (err) {
    locals.requestLogger.error({ err }, '[api/admin/sessions] hub error:');
    return json({ error: 'hub_failed' }, 500);
  }
}

export const POST: APIRoute = async ({ request, locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  const guard = authGuard(session);
  if (guard) return guard;
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return json({ error: 'invalid_json' }, 400); }
  const name = String(body.name ?? '').trim();
  const port = String(body.port ?? '').trim();
  if (!name || !/^\d+$/.test(port)) return json({ error: 'name_and_port_required' }, 400);
  const type = String(body.type ?? 'companion').trim();
  const title = String(body.title ?? name).trim();
  return runHub(['register', '--name', name, '--port', port, '--type', type, '--title', title], locals);
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  const guard = authGuard(session);
  if (guard) return guard;
  const slug = new URL(request.url).searchParams.get('slug')?.trim();
  if (!slug) return json({ error: 'slug_required' }, 400);
  return runHub(['deregister', '--name', slug], locals);
};
```

- [ ] **Step 4: Run the tests, confirm they pass**

Run: `cd website && npx vitest run src/pages/api/admin/sessions/index.test.ts`
Expected: all 4 tests PASS.

- [ ] **Step 5: Line-budget check**

Run: `wc -l website/src/pages/api/admin/sessions/index.ts`
Expected: < 600 (target ~150). 

- [ ] **Step 6: Commit**

```bash
git add website/src/pages/api/admin/sessions/index.ts website/src/pages/api/admin/sessions/index.test.ts
git commit -m "feat(api): add /api/admin/sessions registry endpoint [T000975]"
```

---

### Task 7: website/src/components/SessionsListView.svelte — polling card list

**Files:**
- Create: `website/src/components/SessionsListView.svelte`
- Test: `website/src/components/SessionsListView.test.ts`

**Interfaces:**
- Consumes: `GET /api/admin/sessions` → `{ sessions: Session[] }`.
- Produces: renders one card per session; clicking a card dispatches a `window` `CustomEvent('mediaviewer:open-session', { detail: { url, slug, type } })`. Consumed by Task 8.

> **Svelte 5 runes** (`$state`, `$effect`). No hardcoded host — every URL comes from `session.public_url`. Poll every 10s via `setInterval`; clean up in the `$effect` return. Keep < ~300 lines.

- [ ] **Step 1: Write the failing test**

Create `website/src/components/SessionsListView.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import SessionsListView from './SessionsListView.svelte';

const sample = {
  sessions: [
    { slug: 'feature-intake', type: 'form', title: 'Feature-Intake', port: 1,
      public_url: 'https://session-feature-intake.dev.example.test',
      local_url: 'http://localhost:1/x.html', started_at: '2026-06-20T00:00:00Z' },
  ],
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => sample }));
});
afterEach(() => vi.unstubAllGlobals());

describe('SessionsListView', () => {
  it('renders a card per session from the API', async () => {
    const { getByText } = render(SessionsListView);
    await waitFor(() => expect(getByText('Feature-Intake')).toBeTruthy());
  });

  it('dispatches mediaviewer:open-session on card click', async () => {
    const handler = vi.fn();
    window.addEventListener('mediaviewer:open-session', handler as any);
    const { getByRole } = render(SessionsListView);
    await waitFor(() => getByRole('button', { name: /Feature-Intake/i }));
    await fireEvent.click(getByRole('button', { name: /Feature-Intake/i }));
    expect(handler).toHaveBeenCalledOnce();
    const ev = handler.mock.calls[0][0] as CustomEvent;
    expect(ev.detail.url).toBe('https://session-feature-intake.dev.example.test');
    expect(ev.detail.slug).toBe('feature-intake');
    window.removeEventListener('mediaviewer:open-session', handler as any);
  });

  it('shows an empty state when there are no sessions', async () => {
    (fetch as any).mockResolvedValue({ ok: true, json: async () => ({ sessions: [] }) });
    const { getByText } = render(SessionsListView);
    await waitFor(() => expect(getByText(/Keine aktiven Sessions/i)).toBeTruthy());
  });
});
```

- [ ] **Step 2: Run the test, confirm it fails (component missing)**

Run: `cd website && npx vitest run src/components/SessionsListView.test.ts`
Expected: FAIL — cannot resolve `./SessionsListView.svelte`.

- [ ] **Step 3: Write the component**

```svelte
<script lang="ts">
  interface Session {
    slug: string; type: string; title: string; port: number;
    public_url: string; local_url: string; started_at: string;
  }

  let sessions = $state<Session[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  async function load() {
    try {
      const res = await fetch('/api/admin/sessions', { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      sessions = Array.isArray(body.sessions) ? body.sessions : [];
      error = null;
    } catch (e) {
      error = e instanceof Error ? e.message : 'load failed';
    } finally {
      loading = false;
    }
  }

  function icon(type: string): string {
    if (type === 'form') return '📋';
    if (type === 'brainstorm') return '🎯';
    return '🧩';
  }

  function host(url: string): string {
    try { return new URL(url).host; } catch { return url; }
  }

  function open(s: Session) {
    window.dispatchEvent(new CustomEvent('mediaviewer:open-session', {
      detail: { url: s.public_url, slug: s.slug, type: s.type },
    }));
  }

  $effect(() => {
    load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  });
</script>

<div class="sessions">
  <header>
    <span>Aktive Sessions</span>
    <button class="refresh" type="button" onclick={load} aria-label="Aktualisieren">↺</button>
  </header>

  {#if loading && sessions.length === 0}
    <p class="muted">Lädt…</p>
  {:else if error}
    <p class="muted">Fehler: {error}</p>
  {:else if sessions.length === 0}
    <p class="muted">(Keine aktiven Sessions)</p>
  {:else}
    <ul>
      {#each sessions as s (s.slug)}
        <li>
          <button type="button" class="card" onclick={() => open(s)} aria-label={s.title}>
            <span class="ic">{icon(s.type)}</span>
            <span class="meta">
              <span class="title">{s.title}</span>
              <span class="sub">{s.type} · {host(s.public_url)}</span>
            </span>
            <span class="go" aria-hidden="true">→</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .sessions { flex: 1; display: flex; flex-direction: column; min-height: 0; color: #cdd6e4; background: #0b111c; padding: 0.75rem; gap: 0.5rem; }
  header { display: flex; justify-content: space-between; align-items: center; font-weight: 600; }
  .refresh { background: none; border: 1px solid #2a3a52; color: inherit; border-radius: 6px; cursor: pointer; padding: 0.1rem 0.5rem; }
  ul { list-style: none; margin: 0; padding: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 0.4rem; }
  .card { width: 100%; display: flex; align-items: center; gap: 0.6rem; background: #111a29; border: 1px solid #243349; border-radius: 8px; padding: 0.6rem 0.7rem; color: inherit; cursor: pointer; text-align: left; }
  .card:hover { border-color: #3a567d; }
  .ic { font-size: 1.2rem; }
  .meta { display: flex; flex-direction: column; flex: 1; min-width: 0; }
  .title { font-weight: 600; }
  .sub { font-size: 0.8rem; color: #8aa0bd; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .go { color: #6f8bb0; }
  .muted { color: #7c8aa0; }
</style>
```

- [ ] **Step 4: Run the tests, confirm they pass**

Run: `cd website && npx vitest run src/components/SessionsListView.test.ts`
Expected: all 3 tests PASS. (If `@testing-library/svelte` is not present, check `website/package.json` — these tests follow the existing component-test convention; align the imports with a neighboring `*.svelte.test.ts`/`*.test.ts` that already renders a component.)

- [ ] **Step 5: Commit**

```bash
git add website/src/components/SessionsListView.svelte website/src/components/SessionsListView.test.ts
git commit -m "feat(website): add SessionsListView mediaviewer card list [T000975]"
```

---

### Task 8: MediaviewerPanel.svelte — idle default view + open-session listener

**Files:**
- Modify: `website/src/components/MediaviewerPanel.svelte` (ist 147 · limit 500 — ample budget)

**Interfaces:**
- Consumes: `SessionsListView` (Task 7); the `mediaviewer:open-session` `CustomEvent`.
- Produces: when `mode === 'idle'` and `defaultView === 'sessions'`, renders `SessionsListView`; on `mediaviewer:open-session`, sets an internal `iframeSrc` and switches to an embed view.

> The current component always renders the widget iframe. Add: a new `'idle'` value to the `mode` prop union, a new `defaultView` prop (default `'sessions'`), an internal `embedUrl` state, and a window listener for `mediaviewer:open-session`. Keep the existing widget/grilling behavior untouched. Net add is small (~40 lines) — well within budget.

- [ ] **Step 1: Add the props and state**

In the `$props()` destructuring, extend the `mode` union and add `defaultView`:

```ts
    mode = 'video',
    defaultView = 'sessions',
```
and in the type block:
```ts
    mode?: 'video' | 'grilling' | 'brainstorm' | 'idle';
    defaultView?: 'sessions' | 'empty';
```

Add internal state near `let iframeEl = $state…`:

```ts
  import SessionsListView from './SessionsListView.svelte';
  let embedUrl = $state<string | null>(null);
```

(Place the `import` with the other imports at the top of the `<script>`.)

- [ ] **Step 2: Add the open-session listener**

Add a new `$effect` alongside the existing ones:

```ts
  $effect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ url: string }>).detail;
      if (detail?.url) embedUrl = detail.url;
    };
    window.addEventListener('mediaviewer:open-session', onOpen);
    return () => window.removeEventListener('mediaviewer:open-session', onOpen);
  });
```

- [ ] **Step 3: Branch the template**

Replace the single `<div class="mv-panel">…</div>` body with a three-way branch (embed-from-session → idle-sessions → existing widget iframe):

```svelte
<div class="mv-panel">
  {#if embedUrl}
    <iframe src={embedUrl} title="Session" allow="fullscreen"></iframe>
  {:else if mode === 'idle' && defaultView === 'sessions'}
    <SessionsListView />
  {:else}
    <iframe
      bind:this={iframeEl}
      src={embedSrc}
      title="Mediaviewer"
      allow="autoplay; fullscreen; picture-in-picture"
      onload={() => { pushMode(); pushVideos(); pushGrillingData(); }}
    ></iframe>
  {/if}
</div>
```

(The widget iframe binding `bind:this={iframeEl}` stays in the `{:else}` branch so all existing postMessage effects keep working when a video/grilling session is active.)

- [ ] **Step 4: Build / type-check gate**

Run: `cd website && npx svelte-check --tsconfig ./tsconfig.json --threshold error 2>&1 | tail -20`
Expected: no new errors referencing `MediaviewerPanel.svelte` (the `mode='idle'`, `defaultView`, `embedUrl`, `SessionsListView` additions type-check). If `svelte-check` isn't wired, run `cd website && npm run build` and confirm it compiles.

- [ ] **Step 5: Line-budget check**

Run: `wc -l website/src/components/MediaviewerPanel.svelte`
Expected: < 500 (≈ 190 after the additions).

- [ ] **Step 6: Commit**

```bash
git add website/src/components/MediaviewerPanel.svelte
git commit -m "feat(website): show active sessions in MediaviewerPanel idle state [T000975]"
```

---

### Task 9: Skill integration — feature-intake, brainstorm-tunnel-setup, SessionStart hook doc

**Files:**
- Modify: `.claude/skills/feature-intake/SKILL.md` (add a `start-form` call in the "Formular liefern" step)
- Modify: `.claude/skills/references/brainstorm-tunnel-setup.md` (add a `register` call after publish)
- Modify: `.claude/skills/references/brainstorm-tunnel-setup.md` (document the SessionStart-hook local-add — `settings.json` is gitignored so it can only be documented, not committed)

**Interfaces:**
- Consumes: `scripts/session-hub.sh` (Task 3).
- Produces: docs that wire the hybrid registration described in the spec.

> `.md` files have no S1 line limit. **Do not create or commit `.claude/settings.json`** — `.gitignore:103` ignores it; the hook is a documented manual local-add (consistent with the existing CLAUDE.md "Optionaler SessionStart-Reaper" pattern).

- [ ] **Step 1: feature-intake — register the form after delivery**

In `.claude/skills/feature-intake/SKILL.md`, find "### Schritt 4 — Formular liefern" (around line 122). After the existing `SendUserFile` sentence, add:

````markdown
Wenn das Formular zusätzlich für gekko über den Mediaviewer erreichbar sein soll, registriere es im Active Sessions Hub (startet HTTP-Server + sish-Tunnel + Registry-Eintrag):

```bash
bash scripts/session-hub.sh start-form --file "$HTML_FILE" --name "feature-intake"
```

Die Session erscheint dann als Karte im Mediaviewer-Panel und unter `https://session-feature-intake.${DEV_DOMAIN}` (Keycloak-Gruppe `/session-hub-access`).
````

(Use `$HTML_FILE` / `${DEV_DOMAIN}` placeholders — no brand-domain literal.)

- [ ] **Step 2: brainstorm-tunnel-setup — register after publish**

In `.claude/skills/references/brainstorm-tunnel-setup.md`, after "Step 4: Kill stale tunnels & Publish" (the `task brainstorm:publish` block), add:

````markdown
### Step 4b: Register in the Active Sessions Hub

So the board shows up as a card in the website Mediaviewer:

```bash
bash scripts/session-hub.sh register \
  --name "brainstorm" --port "$PORT" --type brainstorm \
  --title "Brainstorm: $(date +%F)"
```
````

- [ ] **Step 3: Document the SessionStart hook (local-add)**

In `.claude/skills/references/brainstorm-tunnel-setup.md`, append a new section:

````markdown
## Active Sessions Hub — SessionStart reap (optional local hook)

`.claude/settings.json` is gitignored (machine-local). To auto-reap dead session
tunnels at every session start, add locally:

```json
{ "hooks": { "SessionStart": [ { "hooks": [
  { "type": "command", "command": "bash scripts/session-hub.sh reap 2>/dev/null || true" }
] } ] } }
```

Merge this into any existing `SessionStart` hooks rather than overwriting them
(e.g. the agent-lock reaper documented in CLAUDE.md).
````

- [ ] **Step 4: Doc-link sanity (no broken intra-repo paths) + S3 self-check**

Run:
```bash
grep -nE 'session-hub\.sh' .claude/skills/feature-intake/SKILL.md .claude/skills/references/brainstorm-tunnel-setup.md
grep -nE 'mentolder\.de|korczewski\.de' .claude/skills/feature-intake/SKILL.md | grep -v '^[0-9]*:.*#' || echo "feature-intake S3 OK"
```
Expected: the `session-hub.sh` references appear in both files; no brand-domain literal added (the `${DEV_DOMAIN}` placeholder is used). (`.claude/**` is outside the S3-scanned paths, but keep it clean for copy-paste safety.)

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/feature-intake/SKILL.md .claude/skills/references/brainstorm-tunnel-setup.md
git commit -m "docs(skills): wire session-hub register into intake + brainstorm flows [T000975]"
```

---

### Task 10: Verification — full CI-equivalent gate

**Files:** none (verification only).

**Interfaces:** consumes everything above.

> This is the mandatory final gate from `plan-quality-gates.md`. Run each step; every command must succeed before the PR.

- [ ] **Step 1: Targeted tests for changed domains**

```bash
task test:changed
```
Expected: PASS — runs vitest `--changed` (picks up the new API + component tests), the BATS selection (picks up `tests/unit/session-hub.bats`), and `quality:check`.

- [ ] **Step 2: Manifest validation (the new dev-stack manifest)**

```bash
DEV_DOMAIN=dev.example.test kubectl kustomize k3d/dev-stack/ >/dev/null && echo "kustomize OK"
```
Expected: `kustomize OK`.

- [ ] **Step 3: OpenSpec validation**

```bash
task test:openspec
```
Expected: PASS — `openspec/changes/active-sessions-hub/` (proposal + tasks + spec delta) validates.

- [ ] **Step 4: Regenerate freshness artifacts (test-inventory, repo-index, …)**

```bash
task test:inventory
task freshness:regenerate
```
Expected: regenerates `website/src/data/test-inventory.json` (now including the new tests) and other generated artifacts. Stage whatever changed.

- [ ] **Step 5: Freshness + quality ratchet (CI equivalent — S1–S4 + baseline assertion)**

```bash
task freshness:check
```
Expected: PASS — confirms no S1 line-limit regressions, no S2 import cycles, no S3 brand-domain literals, no S4 orphans, and that `baseline.json` key count did not grow. If S3 fails, re-check Task 4/9 for a literal `*.mentolder.de`. If S4 fails, re-check Task 4 (kustomization ref) and Task 5 (Taskfile include).

- [ ] **Step 6: Commit regenerated artifacts**

```bash
git add website/src/data/test-inventory.json docs/code-quality/ docs/generated/ 2>/dev/null || true
git status --short
git commit -m "chore: regenerate freshness artifacts for active-sessions-hub [T000975]" || echo "nothing to regenerate"
```

(If a freshness regen conflicts on rebase, resolve generated artifacts with `git checkout --ours <file>` per CLAUDE.md.)

---

## Self-Review (performed against the spec)

**Spec coverage** — every section maps to a task:
- Session types / registry format → Task 3 (registry shape) + Task 6 (`SessionEntry` type).
- `session-hub.sh` `start-form`/`register`/`list`/`deregister`/`reap` → Task 3 (all five, BATS-tested).
- sish tunnel (`ssh -R session-<slug>:80:localhost:<port>`) → Task 3 `_open_tunnel`.
- `/api/admin/sessions` GET/POST/DELETE + `isAdmin` guard → Task 6.
- `SessionsListView.svelte` (cards, 10s poll, `mediaviewer:open-session`) → Task 7.
- `MediaviewerPanel.svelte` idle default view + event listener → Task 8.
- Keycloak `session-hub` client + `/session-hub-access` group + `paddione`/`gekko` → Task 2.
- `oauth2-proxy-sessions.yaml` + HostRegexp wildcard → Task 4.
- `SESSION_HUB_OIDC_SECRET` in `.secrets` + `env:seal` + `schema.yaml` → Task 1.
- `Taskfile` `session:*` tasks → Task 5.
- Skill integration (feature-intake + brainstorm + SessionStart hook) → Task 9.
- Verification gate → Task 10.
- Acceptance criteria 1–7: AC1→T3/T6, AC2→T7/T8, AC3→T7/T8, AC4→T2/T4, AC5→T3 (`reap` BATS test), AC6→T2, AC7→T9.

**Out-of-scope items respected:** no prod oauth2-proxy deploy, no WebSocket push, no cross-machine sharing, no standalone `/admin/sessions` page.

**Type consistency:** registry fields `{slug,type,title,port,public_url,local_url,tunnel_pid,server_pid,started_at}` are identical in Task 3 (`jq` upsert), Task 6 (`SessionEntry`), and Task 7 (`Session`). Event name `mediaviewer:open-session` with `detail:{url,slug,type}` matches between Task 7 (dispatch) and Task 8 (listener). Group path `/session-hub-access` and client id `session-hub` match between Task 2 and Task 4.
