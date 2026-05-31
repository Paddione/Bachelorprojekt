---
title: Collaborative Brainstorm Tunnel — Implementation Plan
ticket_id: T000389
domains: [infra, security, test]
status: active
pr_number: null
---

# Collaborative Brainstorm Tunnel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let gekko (remote) join a live brainstorm/dev-flow and participate — free-text + clicks attributed by name, presence, dev-flow status pushed to the board, and the view link gated by Keycloak — by patch-extending the superpowers companion (reusing its existing multi-client WebSocket + the sish tunnel).

**Architecture:** Repo-owned, idempotent patch scripts apply small changes to the plugin-cached `helper.js` (append a self-contained collab block + tag events with `who`) and `server.cjs` (relay `chat`/`presence`/`note` to all clients + append `note`/`chat` to the events file). New `brainstorm:collab`/`brainstorm:push` tasks. SSO via a Traefik ForwardAuth → `oauth2-proxy-brainstorm` on the `brainstorm.${DEV_DOMAIN}` route.

**Tech Stack:** Bash patch driver (mirrors `scripts/superpowers-helper-patch.sh`), Node (companion `server.cjs`, edits via embedded node for robustness), browser JS (`helper.js`), Taskfile, Traefik IngressRoute+Middleware, oauth2-proxy/Keycloak, BATS + a headless `node:test` WS relay test.

---

## Conventions & invariants (read first)

- **Patch plugin files, never edit in place permanently.** The companion (`server.cjs`, `helper.js`) lives under `~/.claude/plugins/cache/**/superpowers/**/skills/brainstorming/scripts/`. Mirror `superpowers-helper-patch.sh`: iterate the cache roots, **guard on a marker** (skip if already patched), support `--check`, no backups (cache is regenerated from upstream). The patch must survive a plugin re-sync by being re-runnable (wire into the SessionStart hook alongside the wss patch).
- **Don't touch the existing wss/click plumbing.** The collab client block opens its **own** WebSocket to the same server (the server broadcasts to all sockets), so it never depends on the existing inner `ws`/`sendEvent` closure — except one tiny marker-guarded insertion to add `who` to outgoing events.
- **Server change is minimal & additive.** Only `handleMessage` gains a relay + a wider append condition. The screen/reload mechanism is untouched.
- **Dev-only.** The brainstorm broker is dev-stack sish (`k3d/dev-stack/sish.yaml`); there is no prod broker (T000364). All cluster changes target context `k3d-mentolder-dev` / ns `workspace-dev`.

## File structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `scripts/superpowers-collab-patch.sh` | Idempotent driver: patch helper.js + server.cjs in the plugin cache. |
| Create | `scripts/superpowers-collab/helper-collab.js` | The client collab block (panel, presence, chat, who-tagging) appended to helper.js. |
| Create | `scripts/superpowers-collab/relay-test.mjs` | Headless two-client WS relay test against a patched server.cjs. |
| Modify | `Taskfile.brainstorm.yml` | `collab` (publish + SSO link) and `push` (status screen) tasks. |
| Create | `tests/unit/superpowers-collab-patch.bats` | Idempotency + `--check` behaviour. |
| Create | `k3d/dev-stack/oauth2-proxy-brainstorm.yaml` | oauth2-proxy + Traefik Middleware(ForwardAuth) + IngressRoute gating `brainstorm.${DEV_DOMAIN}`. |
| Modify | `k3d/configmap-domains.yaml` | `BRAINSTORM_DOMAIN`. |
| Modify | `environments/schema.yaml` | register `BRAINSTORM_OIDC_SECRET`. |
| Modify | realm JSONs (dev realm `k3d/realm-workspace-dev.json`) | `brainstorm` OIDC client + `/brainstorm-access` group. |
| Modify | `.claude/skills/references/brainstorm-tunnel-setup.md` | document the collab flow. |

---

## Task 1: client collab block + who-tagging patch

**Files:** Create `scripts/superpowers-collab/helper-collab.js`; (driver comes in Task 3)

- [ ] **Step 1: Write the client collab block**

Create `scripts/superpowers-collab/helper-collab.js` — a self-contained IIFE appended to `helper.js`. It opens its OWN WebSocket, so it is independent of the existing closure:

```js
/* brainstorm-collab v1 — appended by scripts/superpowers-collab-patch.sh (idempotent marker) */
(function () {
  if (window.__brainstormCollab) return;            // guard against double-injection
  window.__brainstormCollab = true;

  const WS = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
  let who = localStorage.getItem('brainstorm_who');
  if (!who) { who = (prompt('Dein Name für diese Session:') || 'Gast').slice(0, 24); localStorage.setItem('brainstorm_who', who); }

  // ---- panel ----
  const panel = document.createElement('div');
  panel.id = 'bs-collab';
  panel.style.cssText = 'position:fixed;right:12px;bottom:12px;width:260px;max-height:50vh;display:flex;flex-direction:column;background:#0f1623;color:#e8e8e8;border:1px solid #2a3550;border-radius:10px;font:13px system-ui;z-index:99998;box-shadow:0 6px 24px rgba(0,0,0,.5)';
  panel.innerHTML =
    '<div style="padding:6px 10px;border-bottom:1px solid #2a3550;font-weight:600">👥 <span id="bs-presence">'+who+'</span></div>' +
    '<div id="bs-log" style="flex:1;overflow:auto;padding:8px 10px;display:flex;flex-direction:column;gap:4px"></div>' +
    '<form id="bs-form" style="display:flex;border-top:1px solid #2a3550">' +
      '<input id="bs-in" autocomplete="off" placeholder="Mitschreiben…" style="flex:1;background:transparent;border:0;color:inherit;padding:8px 10px;outline:none">' +
      '<button style="background:#e8c870;color:#0f1623;border:0;padding:0 12px;cursor:pointer;font-weight:600">↵</button>' +
    '</form>';
  document.body.appendChild(panel);
  const log = panel.querySelector('#bs-log');
  const presenceEl = panel.querySelector('#bs-presence');
  const seen = new Map();                            // who -> last-seen ts

  function addLine(w, text, kind) {
    const row = document.createElement('div');
    row.innerHTML = '<strong style="color:' + (kind === 'note' ? '#8fd3ff' : '#e8c870') + '">' + w + ':</strong> ' + text.replace(/</g, '&lt;');
    log.appendChild(row); log.scrollTop = log.scrollHeight;
  }
  function renderPresence() {
    const now = Date.now();
    const live = [...seen.entries()].filter(([, t]) => now - t < 20000).map(([w]) => w);
    presenceEl.textContent = live.length ? live.join(', ') : who;
  }

  let cws;
  function connect() {
    cws = new WebSocket(WS);
    cws.onopen = () => { send({ type: 'presence', who }); };
    cws.onmessage = (m) => {
      let d; try { d = JSON.parse(m.data); } catch { return; }
      if (d.type === 'presence' && d.who) { seen.set(d.who, Date.now()); renderPresence(); }
      else if (d.type === 'chat' && d.who) { addLine(d.who, d.text, 'chat'); }
      else if (d.type === 'note' && d.who) { addLine(d.who, d.text, 'note'); }
    };
    cws.onclose = () => setTimeout(connect, 1000);
  }
  function send(o) { o.who = who; o.ts = Date.now(); try { cws && cws.readyState === 1 && cws.send(JSON.stringify(o)); } catch (e) {} }

  panel.querySelector('#bs-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const i = panel.querySelector('#bs-in'); const t = i.value.trim(); if (!t) return;
    // `note` is the durable, agent-read kind; also echo locally immediately.
    send({ type: 'note', text: t }); addLine(who, t, 'note'); i.value = '';
  });

  setInterval(() => { send({ type: 'presence', who }); renderPresence(); }, 8000);
  connect();
})();
```

- [ ] **Step 2: Sanity-check it parses as JS**

Run: `cd /tmp/wt-brainstorm-collab && node --check scripts/superpowers-collab/helper-collab.js`
Expected: no output, exit 0.

- [ ] **Step 3: Commit**

```bash
git add scripts/superpowers-collab/helper-collab.js
git commit -m "feat(brainstorm-collab): client collab block (presence, chat, notes, who)"
```

---

## Task 2: server relay test (TDD for the server patch)

**Files:** Create `scripts/superpowers-collab/relay-test.mjs`

- [ ] **Step 1: Write the headless relay test**

This test patches a COPY of `server.cjs` (so it doesn't depend on the patch being applied yet), starts it, connects two WS clients, and asserts a `chat` from A reaches B and a `note` is appended to the events file. (It encodes the minimal client→server WS framing inline.) Create `scripts/superpowers-collab/relay-test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, writeFileSync, copyFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';

// locate the companion server.cjs in the plugin cache
function findServer() {
  const root = join(process.env.HOME, '.claude/plugins/cache');
  const hits = [];
  (function walk(d) { for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) { if (!p.includes('node_modules')) walk(p); }
    else if (e.name === 'server.cjs' && p.includes('brainstorming')) hits.push(p);
  }})(root);
  return hits.sort().pop();
}

// minimal RFC6455 client frame (masked) + unmask of server frames — see server.cjs
function clientFrame(str) {
  const payload = Buffer.from(str); const mask = crypto.randomBytes(4);
  const len = payload.length; let header;
  if (len < 126) { header = Buffer.from([0x81, 0x80 | len]); }
  else { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 0x80 | 126; header.writeUInt16BE(len, 2); }
  const masked = Buffer.alloc(len); for (let i = 0; i < len; i++) masked[i] = payload[i] ^ mask[i % 4];
  return Buffer.concat([header, mask, masked]);
}
function decodeServer(buf) { // unmasked text frames from server
  const len = buf[1] & 0x7f; const data = buf.slice(2, 2 + len); return data.toString();
}
function wsConnect(port) {
  return new Promise((res) => {
    const s = net.connect(port, '127.0.0.1', () => {
      const key = crypto.randomBytes(16).toString('base64');
      s.write('GET / HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ' + key + '\r\nSec-WebSocket-Version: 13\r\n\r\n');
    });
    let upgraded = false;
    s.on('data', (d) => { if (!upgraded && d.toString().includes('101')) { upgraded = true; res(s); } });
  });
}

test('patched server relays chat A→B and appends note to events', async () => {
  const SRC = findServer();
  assert.ok(SRC, 'companion server.cjs found');
  const dir = mkdtempSync(join(tmpdir(), 'bs-relay-'));
  // apply the relay patch to a copy (Task 3 ships the real patcher; here we inline the same transform)
  const patched = join(dir, 'server.cjs');
  let src = readFileSync(SRC, 'utf8');
  src = src.replace(
    /if \(event\.choice\) \{[\s\S]*?\n  \}/,
    `if (event.type === 'chat' || event.type === 'presence' || event.type === 'note') { broadcast(event); }
  if (event.choice || event.type === 'note' || event.type === 'chat') {
    const eventsFile = path.join(STATE_DIR, 'events');
    fs.appendFileSync(eventsFile, JSON.stringify(event) + '\\n');
  }`);
  writeFileSync(patched, src);
  // companion reads frame-template.html + helper.js from __dirname — copy them next to the patched file
  for (const f of ['frame-template.html', 'helper.js']) copyFileSync(join(dirname(SRC), f), join(dir, f));

  const PORT = 53110;
  const env = { ...process.env, BRAINSTORM_PORT: String(PORT), BRAINSTORM_DIR: join(dir, 'sess') };
  const proc = spawn('node', [patched], { env });
  await new Promise(r => setTimeout(r, 800));
  try {
    const a = await wsConnect(PORT); const b = await wsConnect(PORT);
    const got = new Promise((res) => b.on('data', (d) => { const t = decodeServer(d); if (t.includes('hallo')) res(t); }));
    a.write(clientFrame(JSON.stringify({ type: 'chat', who: 'A', text: 'hallo' })));
    const relayed = await Promise.race([got, new Promise((_, rej) => setTimeout(() => rej(new Error('no relay')), 3000))]);
    assert.match(relayed, /hallo/);
    a.write(clientFrame(JSON.stringify({ type: 'note', who: 'A', text: 'persist-me' })));
    await new Promise(r => setTimeout(r, 300));
    const ev = join(dir, 'sess', 'state', 'events');
    assert.ok(existsSync(ev) && readFileSync(ev, 'utf8').includes('persist-me'), 'note appended to events');
    a.destroy(); b.destroy();
  } finally { proc.kill(); }
});
```

- [ ] **Step 2: Run it to verify it PASSES (the test inlines the patch transform)**

Run: `cd /tmp/wt-brainstorm-collab && node --test scripts/superpowers-collab/relay-test.mjs`
Expected: PASS. (This proves the relay transform is correct against the real upstream `server.cjs` before the driver applies it in place.)

> If `findServer()` returns nothing in CI (no plugin cache), the test should `skip` — wrap the body in `if (!SRC) { test.skip(); return; }`. Add that guard.

- [ ] **Step 3: Commit**

```bash
git add scripts/superpowers-collab/relay-test.mjs
git commit -m "test(brainstorm-collab): headless WS relay + events-append test"
```

---

## Task 3: the idempotent patch driver

**Files:** Create `scripts/superpowers-collab-patch.sh`; Test `tests/unit/superpowers-collab-patch.bats`

- [ ] **Step 1: Write the failing idempotency test**

Create `tests/unit/superpowers-collab-patch.bats`:

```bash
#!/usr/bin/env bats
# superpowers-collab-patch.bats — the collab patch is idempotent and re-appliable.

setup() {
  ROOT="${BATS_TEST_TMPDIR}/cache/x/superpowers/y/skills/brainstorming/scripts"
  mkdir -p "$ROOT"
  # minimal stand-ins carrying the anchors the patch looks for
  cp "${BATS_TEST_DIRNAME}/../../scripts/superpowers-collab/helper-collab.js" "${BATS_TEST_TMPDIR}/helper-collab.js" 2>/dev/null || true
  cat > "$ROOT/helper.js" <<'EOF'
(function(){ function sendEvent(event){ event.timestamp = Date.now(); } connect(); })();
EOF
  cat > "$ROOT/server.cjs" <<'EOF'
function handleMessage(text){ let event; event=JSON.parse(text);
  if (event.choice) {
    const eventsFile = path.join(STATE_DIR, 'events');
    fs.appendFileSync(eventsFile, JSON.stringify(event) + '\n');
  }
}
EOF
  export HOME="${BATS_TEST_TMPDIR}"   # patch driver scans $HOME/.claude/plugins/cache
  mkdir -p "${BATS_TEST_TMPDIR}/.claude/plugins"
  ln -s "${BATS_TEST_TMPDIR}/cache" "${BATS_TEST_TMPDIR}/.claude/plugins/cache"
  SCRIPT="${BATS_TEST_DIRNAME}/../../scripts/superpowers-collab-patch.sh"
}

@test "applies the collab block + who-tag + server relay" {
  run bash "$SCRIPT"
  [ "$status" -eq 0 ]
  grep -q "brainstorm-collab v1" "$ROOT/helper.js"
  grep -q "event.who" "$ROOT/helper.js"
  grep -q "broadcast(event)" "$ROOT/server.cjs"
}

@test "re-running is a no-op (idempotent)" {
  bash "$SCRIPT"
  cp "$ROOT/helper.js" "$ROOT/helper.js.1"; cp "$ROOT/server.cjs" "$ROOT/server.cjs.1"
  bash "$SCRIPT"
  diff "$ROOT/helper.js" "$ROOT/helper.js.1"
  diff "$ROOT/server.cjs" "$ROOT/server.cjs.1"
}

@test "--check exits non-zero before patching, zero after" {
  run bash "$SCRIPT" --check
  [ "$status" -ne 0 ]
  bash "$SCRIPT"
  run bash "$SCRIPT" --check
  [ "$status" -eq 0 ]
}
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /tmp/wt-brainstorm-collab && bats tests/unit/superpowers-collab-patch.bats`
Expected: FAIL — `superpowers-collab-patch.sh` does not exist.

- [ ] **Step 3: Write the patch driver**

Create `scripts/superpowers-collab-patch.sh` (mirror `superpowers-helper-patch.sh`'s structure; use embedded node for the multi-line server transform):

```bash
#!/usr/bin/env bash
# scripts/superpowers-collab-patch.sh — patch the brainstorming companion for
# collaboration: append the client collab block + who-tag outgoing events
# (helper.js), and relay chat/presence/note + append note/chat to events
# (server.cjs). Idempotent and marker-guarded; safe as a SessionStart hook.
# Usage: bash scripts/superpowers-collab-patch.sh [--check]
set -euo pipefail
MODE="${1:-apply}"
REPO_ROOT=$(cd "$(dirname "$0")" && pwd)/..
COLLAB_BLOCK="${REPO_ROOT}/scripts/superpowers-collab/helper-collab.js"
MARKER="brainstorm-collab v1"
shopt -s nullglob globstar
need=0; done_n=0

for root in "$HOME/.claude/plugins/cache" "$HOME/.config/claude/plugins/cache"; do
  [[ -d "$root" ]] || continue
  for helper in "$root"/**/superpowers/**/skills/brainstorming/scripts/helper.js; do
    [[ -f "$helper" ]] || continue
    server="$(dirname "$helper")/server.cjs"
    hp=1; sp=1
    grep -qF "$MARKER" "$helper" && hp=0
    grep -qF "/* collab-relay */" "$server" 2>/dev/null && sp=0
    if [[ "$MODE" == "--check" ]]; then
      [[ $hp -eq 1 || $sp -eq 1 ]] && { echo "unpatched: $helper" >&2; need=1; }
      continue
    fi
    if [[ $hp -eq 1 ]]; then
      # who-tag: insert after the first 'event.timestamp = Date.now();'
      node -e '
        const fs=require("fs"); const f=process.argv[1];
        let s=fs.readFileSync(f,"utf8");
        if(!s.includes("event.who =")){
          s=s.replace("event.timestamp = Date.now();",
            "event.timestamp = Date.now(); try{event.who=localStorage.getItem(\"brainstorm_who\")||event.who||\"anon\";}catch(e){}");
        }
        fs.writeFileSync(f,s);
      ' "$helper"
      printf '\n<!-- collab -->\n<script>\n%s\n</script>\n' "$(cat "$COLLAB_BLOCK")" >> "$helper"
      # NOTE: helper.js is injected inside <script> by the server already, so append
      # the raw JS (not wrapped). Correct form below — keep ONLY this one:
      : # (the printf above is illustrative; the implementer appends raw JS — see Step 3a)
      echo "patched helper: $helper"; done_n=$((done_n+1))
    fi
    if [[ $sp -eq 1 ]]; then
      node -e '
        const fs=require("fs"); const f=process.argv[1];
        let s=fs.readFileSync(f,"utf8");
        if(!s.includes("/* collab-relay */")){
          s=s.replace(/if \(event\.choice\) \{[\s\S]*?\n  \}/,
            `/* collab-relay */
  if (event.type === "chat" || event.type === "presence" || event.type === "note") { broadcast(event); }
  if (event.choice || event.type === "note" || event.type === "chat") {
    const eventsFile = path.join(STATE_DIR, "events");
    fs.appendFileSync(eventsFile, JSON.stringify(event) + "\\n");
  }`);
        }
        fs.writeFileSync(f,s);
      ' "$server"
      echo "patched server: $server"; done_n=$((done_n+1))
    fi
  done
done

if [[ "$MODE" == "--check" ]]; then
  [[ $need -eq 1 ]] && { echo "collab patch needed" >&2; exit 1; }
  echo "collab patch present"; exit 0
fi
echo "collab patch: ${done_n} file edit(s) applied"
```

- [ ] **Step 3a: Fix the helper append to raw JS**

The server injects `helper.js` already wrapped in `<script>` (see `server.cjs` `helperInjection`). So append the **raw** collab JS to `helper.js` (not wrapped). Replace the illustrative `printf … <script> … ` block with:

```bash
      { printf '\n/* %s */\n' "$MARKER"; cat "$COLLAB_BLOCK"; } >> "$helper"
```

(The collab block's own `if (window.__brainstormCollab) return;` guard + the `$MARKER` grep make double-append impossible.)

- [ ] **Step 4: Run to verify pass**

Run: `cd /tmp/wt-brainstorm-collab && bats tests/unit/superpowers-collab-patch.bats`
Expected: PASS (apply, idempotent re-run, `--check`).

- [ ] **Step 5: Apply for real + re-run the relay test against the now-patched server**

Run: `cd /tmp/wt-brainstorm-collab && bash scripts/superpowers-collab-patch.sh && node --check "$(dirname "$(find "$HOME/.claude/plugins/cache" -path '*brainstorming/scripts/helper.js' | head -1)")/helper.js"`
Expected: patch applied; patched helper.js still parses as JS.

- [ ] **Step 6: Wire into the SessionStart hook (alongside the wss patch)**

Find where `superpowers-helper-patch.sh` is invoked (SessionStart hook in `.claude/settings*.json` or a hook script) and add `bash scripts/superpowers-collab-patch.sh || true` next to it. Run: `grep -rn "superpowers-helper-patch" .claude/ scripts/ 2>/dev/null` and add the collab patch at the same call site.

- [ ] **Step 7: Commit**

```bash
git add scripts/superpowers-collab-patch.sh tests/unit/superpowers-collab-patch.bats .claude/
git commit -m "feat(brainstorm-collab): idempotent patch driver + SessionStart wiring"
```

---

## Task 4: `brainstorm:collab` + `brainstorm:push` tasks

**Files:** Modify `Taskfile.brainstorm.yml`

- [ ] **Step 1: Add the tasks**

In `Taskfile.brainstorm.yml`, add after `publish:` (reuse its `ssh -R` body; `collab` just ensures the patch + prints the SSO URL; `push` writes a status screen into the active session's content dir):

```yaml
  collab:
    desc: "[brainstorm] Apply the collab patch, then publish a local port + print the SSO link for gekko. Usage: task brainstorm:collab -- <localport>"
    cmds:
      - bash scripts/superpowers-collab-patch.sh || true
      - |
        set -euo pipefail
        source scripts/env-resolve.sh "{{.ENV}}"
        echo "Teile diesen Link mit gekko (Keycloak-Login, Gruppe /brainstorm-access):"
        echo "  https://brainstorm.${DEV_DOMAIN}"
      - task: publish
        vars: { CLI_ARGS: "{{.CLI_ARGS}}" }

  push:
    desc: "[brainstorm] Push a dev-flow status screen to the live board. Usage: task brainstorm:push -- '<title>' '<status>'"
    cmds:
      - |
        set -euo pipefail
        SESS=$(ls -dt "$HOME"/Bachelorprojekt/.superpowers/brainstorm/*/ 2>/dev/null | head -1)
        [[ -n "$SESS" ]] || { echo "no active brainstorm session dir found" >&2; exit 1; }
        TITLE=$(echo "{{.CLI_ARGS}}" | awk -F"' '" '{gsub(/^'\''/,"",$1); print $1}')
        STATUS=$(echo "{{.CLI_ARGS}}" | awk -F"' '" '{gsub(/'\''$/,"",$2); print $2}')
        TS=$(date +%s)
        cat > "${SESS}content/devflow-${TS}.html" <<HTML
        <h2>🔧 ${TITLE}</h2>
        <p class="subtitle">Live aus dem Dev-Flow</p>
        <div class="mockup"><div class="mockup-body" style="text-align:left;white-space:pre-wrap">${STATUS}</div></div>
        HTML
        echo "pushed devflow-${TS}.html → board reloads"
```

> The `push` task's arg parsing is shown for two single-quoted args; if the project's task-arg convention differs, simplify to a single `STATUS` arg. The companion's `fs.watch` broadcasts a reload on the new file automatically.

- [ ] **Step 2: Validate the Taskfile parses**

Run: `cd /tmp/wt-brainstorm-collab && task --list 2>&1 | grep -E "brainstorm:(collab|push)"`
Expected: both tasks listed.

- [ ] **Step 3: Commit**

```bash
git add Taskfile.brainstorm.yml
git commit -m "feat(brainstorm-collab): collab (publish+SSO link) and push (devflow screen) tasks"
```

---

## Task 5: SSO gating of the brainstorm route (highest-risk — discovery first)

**Files:** Create `k3d/dev-stack/oauth2-proxy-brainstorm.yaml`; Modify `k3d/configmap-domains.yaml`, `environments/schema.yaml`, `k3d/realm-workspace-dev.json`

- [ ] **Step 1: Discover how `brainstorm.${DEV_DOMAIN}` is routed today**

Run:
```bash
cd /tmp/wt-brainstorm-collab
sed -n '1,200p' k3d/dev-stack/sish.yaml
grep -rn "brainstorm\|sish" k3d/dev-stack/ | grep -iE "ingress|route|middleware|host" | head
```
Expected: learn whether an IngressRoute/Ingress fronts sish for `brainstorm.*` (Traefik) and the entrypoint/TLS used. The gating attaches to THAT route.

- [ ] **Step 2: Add domain + secret registration**

In `k3d/configmap-domains.yaml` add `BRAINSTORM_DOMAIN: "brainstorm.localhost"`; in `environments/schema.yaml` register `BRAINSTORM_OIDC_SECRET` next to `DOCS_OIDC_SECRET`. Commit gate: `kubectl apply --dry-run=client -f k3d/configmap-domains.yaml`.

- [ ] **Step 3: Create the oauth2-proxy + ForwardAuth gating manifest**

Create `k3d/dev-stack/oauth2-proxy-brainstorm.yaml`: clone `k3d/oauth2-proxy-docs.yaml` (Deployment + Service) with `--client-id=brainstorm`, `--client-secret=$(BRAINSTORM_OIDC_SECRET)`, `--upstream` = the sish service for the brainstorm host (from Step 1), `--allowed-groups=/brainstorm-access`, `--cookie-name=_oauth2_proxy_brainstorm`, `--reverse-proxy=true` (for ForwardAuth), and the dev issuer URLs (`http://keycloak.../realms/workspace`). Add a Traefik `Middleware` (forwardAuth → `http://oauth2-proxy-brainstorm:4180/oauth2/auth`) and attach it to the brainstorm IngressRoute discovered in Step 1. **Verify WebSocket passthrough**: ForwardAuth only authenticates the upgrade request; the IngressRoute must still route `wss://` to sish — Traefik forwards upgrades by default, but add a test note.

Mirror the exact Deployment/init-container/cookie-secret pattern from `oauth2-proxy-docs.yaml` (lines 26–129).

- [ ] **Step 4: Keycloak `brainstorm` client + `/brainstorm-access` group (dev realm)**

In `k3d/realm-workspace-dev.json`, mirror the `docs` client → `brainstorm` (redirect `https://brainstorm.<dev domain>/oauth2/callback`, a `groups` mapper) and add a top-level group `brainstorm-access`. Validate JSON: `python3 -m json.tool k3d/realm-workspace-dev.json >/dev/null`.

- [ ] **Step 5: Validate manifests**

Run: `cd /tmp/wt-brainstorm-collab && kubectl apply --dry-run=client -f k3d/dev-stack/oauth2-proxy-brainstorm.yaml 2>&1 | tail` (CRD kinds like Middleware/IngressRoute may need `--validate=false` offline — fall back to a YAML parse check).

- [ ] **Step 6: Commit**

```bash
git add k3d/dev-stack/oauth2-proxy-brainstorm.yaml k3d/configmap-domains.yaml environments/schema.yaml k3d/realm-workspace-dev.json
git commit -m "feat(brainstorm-collab): Keycloak SSO gate (/brainstorm-access) on the brainstorm route"
```

> Risk note for the PR: this is dev-stack only; verify end-to-end that (a) an un-grouped user is bounced, (b) a `/brainstorm-access` member loads the board, (c) the `wss://` collab socket survives the ForwardAuth hop. If ForwardAuth breaks the WS upgrade, fall back to fronting sish with the oauth2-proxy as a full upstream proxy instead of ForwardAuth.

---

## Task 6: Verification + docs

- [ ] **Step 1: Unit + relay + patch tests**

Run: `cd /tmp/wt-brainstorm-collab && bats tests/unit/superpowers-collab-patch.bats && node --test scripts/superpowers-collab/relay-test.mjs && task test:all`
Expected: green (relay test skips cleanly if no plugin cache in CI).

- [ ] **Step 2: Live two-person smoke (manual)**

`task brainstorm:collab -- <port>` on your machine; open the SSO link in a second browser profile as a `/brainstorm-access` member; confirm: presence shows both names, a typed note appears on both screens and in the events file, `task brainstorm:push -- 'Schritt 1' 'läuft…'` reloads both boards.

- [ ] **Step 3: Update the runbook**

Append a "Collaborative session" section to `.claude/skills/references/brainstorm-tunnel-setup.md`: `task brainstorm:collab`, the `/brainstorm-access` prerequisite, `task brainstorm:push` for dev-flow status, and the patch-after-plugin-update note. Commit.

- [ ] **Step 4: PR**

Open the PR for `feature/brainstorm-collab` (squash-merge, CI green). Note the required dev-realm sync + `BRAINSTORM_OIDC_SECRET` generation before SSO works.

---

## Self-review (author)

- **Spec coverage:** free-text → collab block notes + server append (T1/T2/T3); identity & presence → `who` tag + heartbeat presence (T1/T3); watch dev-flow → `brainstorm:push` + convention (T4); secure link → Keycloak SSO gate (T5); one-command → `brainstorm:collab` (T4). Tests → relay (T2), patch idempotency (T3), manifest (T5).
- **Placeholder scan:** real code throughout; the two explicitly-flagged spots (the illustrative printf in T3 → fixed in T3a; the push arg-parsing in T4) carry resolution instructions. T5 is intentionally discovery-first because the sish routing must be read before gating.
- **Consistency:** marker `brainstorm-collab v1` / `/* collab-relay */` used in both the driver and the tests; event kinds `chat`/`presence`/`note` consistent across client, server patch, and relay test; `who` everywhere; group `/brainstorm-access`, client `brainstorm`, secret `BRAINSTORM_OIDC_SECRET`, domain `BRAINSTORM_DOMAIN`.
- **Risk honesty:** plugin-file patching (idempotent + hook-wired), WS-through-ForwardAuth (explicit verify + fallback), dev-flow-push as convention — all surfaced in the spec and T5 risk note.
