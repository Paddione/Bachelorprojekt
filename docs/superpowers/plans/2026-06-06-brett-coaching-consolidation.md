---
title: Brett → reines Coaching-Systembrett (Slice 1: Konsolidierung) Implementation Plan
ticket_id: T000447
domains: [website, infra, db, ops, test, security]
status: active
pr_number: null
---

# Brett → reines Coaching-Systembrett (Slice 1: Konsolidierung) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mayhem (the combat game) and the entire mode concept are removed from `brett/`, so both brands (mentolder + korczewski) serve one identical, quiet coaching-only Systembrett.

**Architecture:** `brett/` is a CommonJS Node.js app (`server.js`) serving a single static `public/index.html` 3D board (Three.js, inline `<script>`). The live coaching client is the inline scene-script (`window.__brettWS`) plus the ES-module bootstrap that mounts `coaching/*.mjs`. Mayhem lived as separate client JS (`assets/mayhem/*`, `assets/combat/*`, a React/JSX admin panel in `public/admin/`) plus server-side relay/game logic. Consolidation = delete the Mayhem client+server code, delete the mode concept end-to-end, run coaching unconditionally, and repair the korczewski kustomize overlay that patches brett env **by numeric index** (the highest-risk part). Deploy is push-based via `task feature:brett` after merge.

**Tech Stack:** Node.js 22 (CommonJS), `node:test` runner (`MOCK_DB=true`), Express 5, `ws`, Three.js (vendored `public/three.min.js`), Kustomize overlays (`prod-mentolder` / `prod-korczewski`, wrapped by `prod-fleet/*`), `task` (go-task).

---

## ⚠️ Pre-flight (read before starting)

**Verified ground truth (2026-06-06, real code in this worktree):**

- **`npm test` is only green after deps are installed.** A fresh worktree has no `brett/node_modules`; every `.test.js` that `require('../server.js')` then fails with `Cannot find module 'express'` (20 file-level failures), while pure `.mjs` tests pass. **After `cd brett && npm install`** the baseline is **174 tests, 0 fail**. Every verification step below assumes `brett/node_modules` exists. **Step 0 of Task 1 installs them.**
- The Dockerfile copies `public/` wholesale (`COPY public ./public`) — deleting any file under `public/` is safe re: the image build; no file is referenced by path in the Dockerfile.
- Env index map of `k3d/brett.yaml` container env (0-based, as JSON-Patch indexes it):
  `0 PORT · 1 WEBSITE_DB_PASSWORD · 2 DATABASE_URL · 3 KEYCLOAK_URL · 4 KEYCLOAK_REALM · 5 BRETT_KC_CLIENT_ID · 6 BRETT_OIDC_SECRET · 7 BRETT_PUBLIC_URL · 8 WEBSITE_INTERNAL_URL · 9 NODE_ENV · 10 BRETT_SESSION_SECRET · 11 BRETT_DEFAULT_MODE · 12 BRETT_PRESETS_PATH · 13 BRETT_BRAND`.
  Removing index 11 shifts `BRETT_PRESETS_PATH` → 11 and `BRETT_BRAND` → 12.
- **korczewski overlay** (`prod-korczewski/kustomization.yaml:124-139`) patches brett env by index: `env/11→mayhem` (delete), `env/3`, `env/7`, `env/8`, `env/13` (BRETT_BRAND). After removing base index 11, `env/13` no longer exists → patch breaks. This is **the** footgun.
- **mentolder overlay also patches brett env by index** (`prod-mentolder/kustomization.yaml:147-153`): `env/7`, `env/8` — both **below** index 11, so they are *not* shifted by removing index 11. (Spec did not mention this; the conversion in Task 12 covers it for safety/consistency.)

**Deviations from the spec found during verification (the orchestrator should be aware; this plan resolves each conservatively):**

1. **Larger Mayhem footprint than the spec's line lists.** Beyond `assets/mayhem/`, the live `public/index.html` and `package.json test` also pull in `assets/combat/` (combat-hud, controller, damage, weapons, pickups, respawn, fx), and there are non-spec Mayhem asset dirs: `assets/hud/` (weapon icons), `assets/icons/` (ability icons), `assets/sprites/` (blood/muzzle/slash), `assets/touch/`. Server.js Mayhem logic spans far more than the cited lines (duel/lms/coop/wave/minion/pickup spread across ~766–1554). The plan treats all of these as Mayhem and removes them.
2. **The skins/GLB system is entirely Mayhem.** `server.js:385` literally comments `Skins catalog (Mayhem character skins)`; `/api/skins*`, `validateGlb`, `listSkins`, `SKINS_DIR`, the `multer` upload, and `assets/loadout-modal.mjs` implement the "Custom-GLB-Personen" feature the spec's decision table **drops**. The coaching appearance system is **figure-pack-based** (`assets/figure-pack/` via `placement_spec.json`), independent of skins. The plan removes the whole skins/GLB system and its 3 tests (`skin-catalog`, `skin-upload`, `skin-validator`). The spec said "Mayhem-`assets/skins/`" implying a subset; in reality the entire `assets/skins/` tree is Mayhem.
3. **`figure_pack_extension/` is a dead duplicate.** Its accessory PNGs are a copy of `figure-pack/accessories/` and are referenced **only** by the static reference page `game_assets_*/catalog.html`, never by the live board (`figure-pack-assets.test.sh` validates only `figure-pack/`). The plan deletes `figure_pack_extension/` together with the static `game_assets_*` catalogs.
4. **E2E Playwright Mayhem specs exist outside `brett/`.** `tests/e2e/specs/brett-mayhem.spec.ts`, `brett-duel-*.spec.ts`, `fa-27-brett-r1-*.spec.ts`, `brett-mobile.spec.ts`, `brett-skins.spec.ts`, plus the `brett-mentolder` project in `tests/e2e/playwright.config.ts`. These run in nightly `e2e.yml` (not in `task test:all`), but would break post-merge. Task 13 removes them and regenerates `website/src/data/test-inventory.json` (CI fails if it drifts).

---

## File Structure

**Deleted (client):**
- `brett/public/assets/main.js`, `mode-select.mjs`, `mode-state.mjs`, `room-browser.js`, `scene.js`, `loadout-modal.mjs`, `ws.mjs`, `materials.js`
- `brett/public/assets/coaching/ws-gate.mjs`
- dirs: `brett/public/assets/mayhem/`, `combat/`, `touch/`, `sfx/`, `skins/`, `hud/`, `icons/`, `sprites/`, `game_assets_mentolder/`, `game_assets_korczewski/`, `figure_pack_extension/`
- `brett/public/admin/` (whole dir: 7 `.jsx` + `admin.css` + `mayhem.css`)

**Modified (client):**
- `brett/public/index.html` — strip Mayhem/admin script tags, React/Babel CDN, admin CSS links, inline Mayhem hooks, the `cfg.defaultMode` gate.

**Modified (server):**
- `brett/server.js` — remove mode/config logic, Mayhem relay/game/admin/skin logic; keep coaching, figures, locks, presence, phases, join-by-code, persistence, OIDC.

**Modified/added (tests):**
- Delete: `game-mode`, `physics`, `damage`, `pickups`, `keybindings`, `duel-server-auth`, `server-mayhem`, `mode-state`, `ws-gate`, `skin-catalog`, `skin-upload`, `skin-validator`.
- Rewrite: `coaching-isolation.test.mjs` (flip to absence assertions), `server-config.test.js`, `board-auth.test.js`, `server-admin.test.js`.
- Keep green: `appearance`, `coaching-steps`, `locks`, `presence`, `phases`, `hud-model`, `join-overlay`, `figure-label`, `figure-locks`, `session-state`, `session-code`, `join-code`, `participants`, `admin-token`, `brand-config`, `brand-persons`, `idle-timeout`, `reconnect-guard`, `ws-reconnect`.

**Modified (manifests):**
- `k3d/brett.yaml` — remove `BRETT_DEFAULT_MODE` env entry.
- `prod-korczewski/kustomization.yaml` — convert brett env repoints to strategic-merge-by-name (footgun fix), drop the mayhem op.
- `prod-mentolder/kustomization.yaml` — convert brett env repoints to strategic-merge-by-name (consistency).

**Modified (e2e + inventory):**
- `tests/e2e/playwright.config.ts`, delete obsolete `tests/e2e/specs/*` Mayhem specs, regenerate `website/src/data/test-inventory.json`.

---

## Task ordering rationale

Client-only deletions first (Task 1) keep the suite green immediately because the deleted client files have no live importer once their script tags / test files go. Tests are deleted/rewritten in the same task that removes the code they cover, so `npm test` is green after **every** task. Server changes (Tasks 7–10) are sliced so each leaves `buildStateFromMutations`/snapshot consistent. The manifest footgun (Tasks 11–12) is isolated and gated by `task workspace:validate` for **both** brands. E2E + inventory (Task 13) and the final acceptance sweep (Task 14) close out.

---

### Task 0: Worktree sanity & dependency install

**Files:** none (environment only)

- [x] **Step 1: Confirm worktree + branch**

Run: `git -C /home/patrick/Projects/wt-brett-coaching-consolidation branch --show-current`
Expected: `feature/brett-coaching-consolidation`

- [x] **Step 2: Install brett dependencies (required for any `npm test`)**

Run: `cd /home/patrick/Projects/wt-brett-coaching-consolidation/brett && npm install`
Expected: completes without error; `brett/node_modules/express` exists.

- [x] **Step 3: Capture green baseline**

Run: `cd /home/patrick/Projects/wt-brett-coaching-consolidation/brett && npm test 2>&1 | tail -8`
Expected: `# pass 174` / `# fail 0`.

---

### Task 1: Delete dead client twins (`scene.js`, `main.js`) and their references

**Goal:** Remove the two files the spec verified as dead/Mayhem-only and the `assets/main.js` script tag. These have no live importer, so the suite stays green.

**Files:**
- Delete: `brett/public/assets/scene.js`
- Delete: `brett/public/assets/main.js`
- Modify: `brett/public/index.html:1996` (remove `<script type="module" src="assets/main.js">`)

- [x] **Step 1: Verify `scene.js` and `main.js` have no live importer**

Run:
```bash
cd /home/patrick/Projects/wt-brett-coaching-consolidation/brett
grep -rn "assets/scene.js\|setLightIntensity\|assets/main.js\|from './main\|require.*main.js" public server.js test
```
Expected: only the `<script src="assets/main.js">` tag at `index.html:1996` (no JS importer; `scene.js` has zero hits).

- [x] **Step 2: Delete the files**

```bash
cd /home/patrick/Projects/wt-brett-coaching-consolidation/brett
git rm public/assets/scene.js public/assets/main.js
```

- [x] **Step 3: Remove the `main.js` script tag from `index.html`**

Delete this exact line (was `index.html:1996`):
```html
<script type="module" src="assets/main.js"></script>
```

- [x] **Step 4: Run tests — still green**

Run: `cd /home/patrick/Projects/wt-brett-coaching-consolidation/brett && npm test 2>&1 | tail -4`
Expected: `# pass 174` (no change — neither file was tested).

- [x] **Step 5: Commit**

```bash
cd /home/patrick/Projects/wt-brett-coaching-consolidation
git add brett/public/index.html
git commit -m "chore(brett): delete dead scene.js + Mayhem main.js bootstrap"
```

---

### Task 2: Remove Mayhem + admin script tags and CDN/CSS from `index.html`

**Goal:** Strip the 21 Mayhem script tags, `room-browser.js`, the admin React mount + 7 JSX tags, the React/Babel CDN, and the admin CSS links. The board no longer loads any combat JS.

**Files:**
- Modify: `brett/public/index.html` (head lines 8-12; body lines ~1966-1995)

- [x] **Step 1: Remove the React/Babel CDN scripts and admin CSS from `<head>`**

Delete these exact lines (were `index.html:8-12`):
```html
  <script src="https://unpkg.com/react@18.3.1/umd/react.production.min.js" crossorigin></script>
  <script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js" crossorigin></script>
  <script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js"></script>
  <link rel="stylesheet" href="/admin/admin.css">
  <link rel="stylesheet" href="/admin/mayhem.css">
```

- [x] **Step 2: Remove the Mayhem/room-browser/admin block at the bottom of `<body>`**

Delete this exact contiguous block (was `index.html:1966-1995`):
```html
<script src="assets/mayhem/physics.js"></script>
<script src="assets/mayhem/chase-camera.js"></script>
<script src="assets/mayhem/skin-controller.js"></script>
<script src="assets/mayhem/player-avatar.js"></script>
<script src="assets/mayhem/vehicle.js"></script>
<script src="assets/mayhem/obstacles.js"></script>
<script src="assets/mayhem/weapons.js"></script>
<script src="assets/mayhem/heroes.js"></script>
<script src="assets/mayhem/hero-select.js"></script>
<script src="assets/mayhem/projectiles.js"></script>
<script src="assets/mayhem/effects.js"></script>
<script src="assets/mayhem/game-mode.js"></script>
<script src="assets/mayhem/ai-bot.js"></script>
<script src="assets/mayhem/keybindings.js"></script>
<script src="assets/mayhem/controls-panel.js"></script>
<script src="assets/mayhem/muzzle-flash.js"></script>
<script src="assets/mayhem/tracer.js"></script>
<script src="assets/mayhem/katana-trail.js"></script>
<script src="assets/mayhem/tina-vfx.js"></script>
<script src="assets/mayhem/post-fx.js"></script>
<script src="assets/mayhem/mayhem.js"></script>
<script src="assets/room-browser.js"></script>
<div id="admin-root"></div>
<script type="text/babel" data-presets="env,react" src="/admin/MayhemScene.jsx"></script>
<script type="text/babel" data-presets="env,react" src="/admin/tweaks-panel.jsx"></script>
<script type="text/babel" data-presets="env,react" src="/admin/screens-pregame.jsx"></script>
<script type="text/babel" data-presets="env,react" src="/admin/screens-setup.jsx"></script>
<script type="text/babel" data-presets="env,react" src="/admin/screens-live.jsx"></script>
<script type="text/babel" data-presets="env,react" src="/admin/screens-cmdk.jsx"></script>
<script type="text/babel" data-presets="env,react" src="/admin/App.jsx"></script>
```
The `</body></html>` (and the coaching module above) must remain.

- [x] **Step 3: Verify no Mayhem/admin/CDN tags remain**

Run:
```bash
cd /home/patrick/Projects/wt-brett-coaching-consolidation/brett
grep -nE "assets/mayhem|room-browser|/admin/|unpkg.com|text/babel|admin-root" public/index.html
```
Expected: no output.

- [x] **Step 4: Run tests — still green**

Run: `cd /home/patrick/Projects/wt-brett-coaching-consolidation/brett && npm test 2>&1 | tail -4`
Expected: `# pass 174` (coaching-isolation already asserts these tags are absent or dynamic).

- [x] **Step 5: Commit**

```bash
cd /home/patrick/Projects/wt-brett-coaching-consolidation
git add brett/public/index.html
git commit -m "chore(brett): drop Mayhem/admin script tags, React CDN and admin CSS from index.html"
```

---

### Task 3: Strip inline Mayhem hooks from the scene-script; keep `__brettWS` + coaching dispatch

**Goal:** Remove every `window.Mayhem`/`window.AdminPanel`/`__brettInitMayhem`/`_mayhemSpectator`/`brett:mayhem-enabled`/`brett_solo_mayhem` hook woven into the inline scene, while preserving `window.__brettWS = ws`, the coaching message dispatch (snapshot/add/update/move/delete/locks/info), `makeMannequin`, `addFigure`, and the figure/scene logic.

**Files:**
- Modify: `brett/public/index.html` (inline scene-script, ~1426-1634)

- [ ] **Step 1: Remove `mayhemSend` (only the Mayhem bridge used it)**

Delete (was `index.html:1426-1429`):
```javascript
  const mayhemSend = (msg) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try { ws.send(JSON.stringify(msg)); } catch (e) { /* ignore */ }
  };
```

- [ ] **Step 2: Remove the admin-panel mount + spectator flag from the WS `open` handler**

In the `ws.addEventListener("open", ...)` block, delete the admin mount and spectator lines (were `index.html:1438-1448`), keeping `wsReady = true;` and the `join` send:
```javascript
      // Mount admin panel if admin
      if (window._bretAdmin && window.AdminPanel) {
        const joinMode = sessionStorage.getItem('brett_admin_join_mode') || 'spectator';
        window.AdminPanel.mount({
          sendFn: (msg) => { try { ws.send(JSON.stringify(msg)); } catch {} },
          room: roomFromUrl,
          roomName: roomFromUrl,
          joinMode,
        });
        if (joinMode === 'spectator') window._mayhemSpectator = true;
      }
```
The handler must remain:
```javascript
    ws.addEventListener("open", () => {
      wsReady = true;
      ws.send(JSON.stringify({ type: "join", room: roomFromUrl }));
    });
```

- [ ] **Step 3: Remove the `__brettInitMayhem` bridge and the `brett:mayhem-enabled` listener**

Delete (was `index.html:1459-1476`), keeping the `connectWS();` call:
```javascript
  // Deferred init bridge: main.js calls this after mode selection resolves to 'mayhem'.
  window.__brettInitMayhem = function () {
    if (!window.Mayhem || window.Mayhem._initialized) return;
    window.Mayhem.init({
      scene, camera, canvas: renderer.domElement,
      makeMannequin: (id, pos, opts) => makeMannequin(id, pos, opts),
      sendMessage: mayhemSend,
      roomToken: roomFromUrl,
    });
    window.Mayhem._initialized = true;
  };

  connectWS();

  // Toast fires via custom event dispatched from mayhem.js setEnabled
  window.addEventListener('brett:mayhem-enabled', () => {
    window.MayhemControlsPanel?.showEntryToast();
  });
```
Replace with just:
```javascript
  connectWS();
```

- [ ] **Step 4: Remove the solo-Mayhem auto-enable + `window.Mayhem.onSnapshot` in the `snapshot` case**

Delete (was `index.html:1514-1521`), keeping the lock-rehydration above it:
```javascript
        // Solo AI Mayhem: auto-enable if triggered from mode-select
        if (sessionStorage.getItem('brett_solo_mayhem') === '1') {
          sessionStorage.removeItem('brett_solo_mayhem');
          if (window.Mayhem && !window.Mayhem._internal.localAvatar) {
            window.Mayhem.setEnabled(true);
          }
        }
        if (window.Mayhem) window.Mayhem.onSnapshot(msg);
```

- [ ] **Step 5: Remove `window.AdminPanel.onMessage` from the `info` case and the whole `default` case Mayhem/admin dispatch**

In the `info` case delete (was `index.html:1587`):
```javascript
        if (window.AdminPanel) window.AdminPanel.onMessage(msg);
```
Replace the `default` case (was `index.html:1589-1595`):
```javascript
      default:
        if (window.Mayhem) {
          if (msg.type === "snapshot") window.Mayhem.onSnapshot(msg);
          else window.Mayhem.onMessage(msg);
        }
        if (window.AdminPanel) window.AdminPanel.onMessage(msg);
        break;
```
with a no-op default (unknown message types are ignored gracefully):
```javascript
      default:
        break;
```

- [ ] **Step 6: Remove `window.Mayhem.tick(dt)` from the render loop**

Delete (was `index.html:1632`):
```javascript
    if (window.Mayhem) window.Mayhem.tick(dt);
```

- [ ] **Step 7: Verify the scene-script is Mayhem-free but `__brettWS` survives**

Run:
```bash
cd /home/patrick/Projects/wt-brett-coaching-consolidation/brett
grep -nE "Mayhem|AdminPanel|_bretAdmin|_mayhemSpectator|brett_solo_mayhem|__brettInitMayhem|mayhemSend" public/index.html
grep -n "window.__brettWS = ws" public/index.html
```
Expected: first grep → no output; second grep → exactly one hit (live coaching socket preserved).

- [ ] **Step 8: Run tests — still green**

Run: `cd /home/patrick/Projects/wt-brett-coaching-consolidation/brett && npm test 2>&1 | tail -4`
Expected: `# pass 174`. (`coaching-isolation` asserts no unconditional `window.Mayhem.init()` in the open handler — now there is none at all.)

- [ ] **Step 9: Commit**

```bash
cd /home/patrick/Projects/wt-brett-coaching-consolidation
git add brett/public/index.html
git commit -m "refactor(brett): strip inline Mayhem/admin hooks, keep coaching WS + scene"
```

---

### Task 4: Make coaching run unconditionally (drop `cfg.defaultMode` gate)

**Goal:** The coaching bootstrap module currently runs only `if (cfg.defaultMode === 'coaching')`. After the mode concept is removed, `/api/config` no longer returns `defaultMode`, so the guard must go and coaching must always run.

**Files:**
- Modify: `brett/public/index.html` (coaching bootstrap module, ~1938-1965)

- [ ] **Step 1: Remove the `defaultMode` gate, keep `cfg` only for `brand`-aware code elsewhere**

Replace the module body (was `index.html:1941-1964`). Old:
```javascript
  const cfg = await fetch('/api/config').then((r) => r.json());
  if (cfg.defaultMode === 'coaching') {
    const me = await fetch('/auth/me').then((r) => r.json()).catch(() => ({}));
    const wire = createWire(() => window.__brettWS);
    const tryAttach = () => { if (!wire.attach()) setTimeout(tryAttach, 150); };
    tryAttach();

    const hasRoom = new URLSearchParams(location.search).has('room');
    if (!hasRoom) {
      const { mountJoinOverlay } = await import('/assets/coaching/join.mjs');
      mountJoinOverlay({});
    } else {
      mountCoachingHud({ wire, isAdmin: !!me.isAdmin });
    }

    wire.on('session_created', (m) => {
      ...toast...
    });
  }
```
New (un-indent one level, drop the guard; keep the `session_created` toast verbatim):
```javascript
  const me = await fetch('/auth/me').then((r) => r.json()).catch(() => ({}));
  const wire = createWire(() => window.__brettWS);
  const tryAttach = () => { if (!wire.attach()) setTimeout(tryAttach, 150); };
  tryAttach();

  const hasRoom = new URLSearchParams(location.search).has('room');
  if (!hasRoom) {
    const { mountJoinOverlay } = await import('/assets/coaching/join.mjs');
    mountJoinOverlay({});
  } else {
    mountCoachingHud({ wire, isAdmin: !!me.isAdmin });
  }

  wire.on('session_created', (m) => {
    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;bottom:12px;left:12px;z-index:100;background:#161b22ee;border:1px solid #2a3340;border-radius:10px;padding:12px 16px;color:#e6edf3;font:13px system-ui;min-width:200px;box-shadow:0 4px 12px rgba(0,0,0,0.5);';
    toast.innerHTML = `<div style="font-weight:bold;margin-bottom:4px;color:#3fb950;">Session erstellt!</div>` +
      `Code: <strong style="font-family:monospace;font-size:14px;color:#ffaa44;">${m.code}</strong><br/>` +
      `<a href="/api/join?code=${m.code}" style="color:#58a6ff;text-decoration:none;display:inline-block;margin-top:6px;" onclick="navigator.clipboard.writeText(this.href); this.textContent='Kopiert!'; return false;">Link kopieren</a>`;
    document.body.appendChild(toast);
  });
```

- [ ] **Step 2: Verify no `defaultMode` dependency remains in the client**

Run:
```bash
cd /home/patrick/Projects/wt-brett-coaching-consolidation/brett
grep -n "defaultMode\|availableModes" public/index.html public/assets/coaching/*.mjs
```
Expected: no output.

- [ ] **Step 3: Confirm the coaching HUD import is still present (isolation test relies on it)**

Run: `grep -n "mountCoachingHud\|coaching/hud.mjs" public/index.html`
Expected: at least one hit.

- [ ] **Step 4: Run tests — still green**

Run: `cd /home/patrick/Projects/wt-brett-coaching-consolidation/brett && npm test 2>&1 | tail -4`
Expected: `# pass 174`.

- [ ] **Step 5: Commit**

```bash
cd /home/patrick/Projects/wt-brett-coaching-consolidation
git add brett/public/index.html
git commit -m "refactor(brett): run coaching unconditionally, drop /api/config defaultMode gate"
```

---

### Task 5: Delete the obsolete client modules and their unit tests

**Goal:** Remove `mode-select.mjs`, `mode-state.mjs`, `coaching/ws-gate.mjs`, `loadout-modal.mjs`, `room-browser.js`, `ws.mjs`, `materials.js`, and delete `mode-state.test.mjs` + `ws-gate.test.mjs` (they import deleted modules).

**Files:**
- Delete: `brett/public/assets/mode-select.mjs`, `mode-state.mjs`, `loadout-modal.mjs`, `room-browser.js`, `ws.mjs`, `materials.js`
- Delete: `brett/public/assets/coaching/ws-gate.mjs`
- Delete: `brett/test/mode-state.test.mjs`, `brett/test/ws-gate.test.mjs`

- [ ] **Step 1: Confirm none are referenced by surviving live code**

Run:
```bash
cd /home/patrick/Projects/wt-brett-coaching-consolidation/brett
grep -rnE "mode-select|mode-state|ws-gate|loadout-modal|room-browser|assets/ws.mjs|assets/materials.js|shouldConnectAuxWs|createModeState" public/index.html public/assets/coaching server.js
```
Expected: no output (only the now-deleted test files referenced them, and those are deleted in Step 2).

- [ ] **Step 2: Delete modules and their tests**

```bash
cd /home/patrick/Projects/wt-brett-coaching-consolidation/brett
git rm public/assets/mode-select.mjs public/assets/mode-state.mjs \
       public/assets/loadout-modal.mjs public/assets/room-browser.js \
       public/assets/ws.mjs public/assets/materials.js \
       public/assets/coaching/ws-gate.mjs \
       test/mode-state.test.mjs test/ws-gate.test.mjs
```

- [ ] **Step 3: Run tests — green with reduced count**

Run: `cd /home/patrick/Projects/wt-brett-coaching-consolidation/brett && npm test 2>&1 | tail -4`
Expected: `# fail 0`; total drops by the 2 deleted suites' test count (≈174 → ~171).

- [ ] **Step 4: Commit**

```bash
cd /home/patrick/Projects/wt-brett-coaching-consolidation
git commit -m "chore(brett): delete mode/ws-gate/loadout/room-browser modules and their tests"
```

---

### Task 6: Delete Mayhem/combat client assets and the admin React panel

**Goal:** Remove every Mayhem/combat asset directory and `public/admin/`. Before deleting `assets/skins/` and `assets/sfx/`, confirm no coaching asset lives there (the coaching appearance system is `figure-pack/`, not these).

**Files:**
- Delete dirs: `brett/public/assets/mayhem/`, `combat/`, `touch/`, `sfx/`, `skins/`, `hud/`, `icons/`, `sprites/`, `game_assets_mentolder/`, `game_assets_korczewski/`, `figure_pack_extension/`
- Delete dir: `brett/public/admin/`

- [ ] **Step 1: Verify `skins/` and `sfx/` hold no coaching asset, and `figure-pack/` is self-contained**

Run:
```bash
cd /home/patrick/Projects/wt-brett-coaching-consolidation/brett
# Live board references only figure-pack/ + coaching/ + lib/ — confirm:
grep -noE "(assets|lib)/[A-Za-z0-9_./-]+" public/index.html | sort -u
# Confirm figure-pack has all accessories the board uses (extension is a dead duplicate):
ls public/assets/figure-pack/accessories | wc -l
```
Expected: index.html references only `assets/figure-pack/*`, `assets/coaching/*`, `lib/GLTFLoader.js`; figure-pack/accessories has 22 files. No reference to `skins/`, `sfx/`, `combat/`, `hud/`, `icons/`, `sprites/`, `touch/`, `game_assets_*`, `figure_pack_extension/`.

- [ ] **Step 2: Verify combat/game-asset dirs are referenced only by themselves or the deleted catalog pages**

Run:
```bash
cd /home/patrick/Projects/wt-brett-coaching-consolidation/brett
grep -rnE "assets/combat|assets/touch|assets/sfx|assets/hud/|assets/icons/|assets/sprites|game_assets_|figure_pack_extension" public/index.html public/assets/coaching server.js
```
Expected: no output (only `game_assets_*/catalog.html` referenced `figure_pack_extension`, and those are being deleted).

- [ ] **Step 3: Delete the directories**

```bash
cd /home/patrick/Projects/wt-brett-coaching-consolidation/brett
git rm -r public/assets/mayhem public/assets/combat public/assets/touch \
          public/assets/sfx public/assets/skins public/assets/hud \
          public/assets/icons public/assets/sprites \
          public/assets/game_assets_mentolder public/assets/game_assets_korczewski \
          public/assets/figure_pack_extension public/admin
```

- [ ] **Step 4: Verify coaching + figure-pack assets survive**

Run:
```bash
cd /home/patrick/Projects/wt-brett-coaching-consolidation/brett
ls public/assets   # expect: coaching figure-pack style.css
ls public/assets/figure-pack   # expect: accessories colors_and_type.css faces placement_spec.json
```

- [ ] **Step 5: Run tests — still green**

Run: `cd /home/patrick/Projects/wt-brett-coaching-consolidation/brett && npm test 2>&1 | tail -4`
Expected: `# fail 0` (skin/combat tests are deleted in Tasks 5 & 9; assets aren't directly tested except figure-pack which survives).

- [ ] **Step 6: Run the figure-pack asset gate (proves coaching appearance intact)**

Run: `cd /home/patrick/Projects/wt-brett-coaching-consolidation && bash tests/figure-pack-assets.test.sh`
Expected: `OK: all figure-pack assets present`.

- [ ] **Step 7: Commit**

```bash
cd /home/patrick/Projects/wt-brett-coaching-consolidation
git commit -m "chore(brett): remove Mayhem/combat assets, admin React panel, dead game_assets catalogs"
```

---

### Task 7: Remove mode config from `server.js` (`buildConfig`, `/api/config`, board gating)

**Goal:** `/api/config` stops returning `defaultMode`/`availableModes`; the board is **always** SSO-gated (no "mayhem stays public" branch). Rewrite `server-config.test.js` (red→green) and `board-auth.test.js` accordingly.

**Files:**
- Modify: `brett/server.js:245-268` (`buildConfig`, `boardAuthRedirect`, `/api/config`), exports block
- Rewrite: `brett/test/server-config.test.js`, `brett/test/board-auth.test.js`

- [ ] **Step 1: Rewrite `server-config.test.js` to the new contract (RED)**

Replace the file with:
```javascript
'use strict';
process.env.MOCK_DB = 'true';
const test = require('node:test');
const assert = require('node:assert');
const { buildConfig } = require('../server.js');

test('buildConfig: returns only non-mode config (brand resolved separately)', () => {
  assert.deepStrictEqual(buildConfig({}), {});
});

test('buildConfig: ignores any BRETT_DEFAULT_MODE env (mode concept removed)', () => {
  assert.deepStrictEqual(buildConfig({ BRETT_DEFAULT_MODE: 'mayhem' }), {});
});
```

- [ ] **Step 2: Rewrite `board-auth.test.js` to "always gated" (RED)**

Replace the file with:
```javascript
// brett/test/board-auth.test.js
'use strict';
process.env.MOCK_DB = 'true';
const test = require('node:test');
const assert = require('node:assert');
const { boardAuthRedirect } = require('../server.js');

test('no session → redirect to login with returnTo', () => {
  const r = boardAuthRedirect({ session: {}, path: '/' }, {});
  assert.strictEqual(r, '/auth/login?returnTo=%2F');
});
test('authenticated session → no redirect', () => {
  const r = boardAuthRedirect({ session: { userId: 'u1' }, path: '/' }, {});
  assert.strictEqual(r, null);
});
test('board is always gated regardless of env (no mayhem-public bypass)', () => {
  const r = boardAuthRedirect({ session: {}, path: '/' }, { BRETT_DEFAULT_MODE: 'mayhem' });
  assert.strictEqual(r, '/auth/login?returnTo=%2F');
});
test('e2e secret header bypasses the gate', () => {
  const r = boardAuthRedirect(
    { session: {}, path: '/', header: () => 'sekret' },
    { BRETT_OIDC_SECRET: 'sekret' });
  assert.strictEqual(r, null);
});
```

- [ ] **Step 3: Run the two tests — verify they FAIL**

Run: `cd /home/patrick/Projects/wt-brett-coaching-consolidation/brett && npm test test/server-config.test.js test/board-auth.test.js 2>&1 | tail -6`
Expected: failures (old `buildConfig` returns `{defaultMode,...}`; old gate bypasses on mayhem).

- [ ] **Step 4: Simplify `buildConfig` and `boardAuthRedirect` in `server.js`**

Replace (was `server.js:245-265`):
```javascript
function buildConfig(env) {
  const mode = env.BRETT_DEFAULT_MODE === 'mayhem' ? 'mayhem' : 'coaching';
  return {
    defaultMode: mode,
    availableModes: mode === 'mayhem' ? ['coaching', 'mayhem'] : ['coaching'],
  };
}

function resolveBrand(env) {
  return env.BRETT_BRAND || 'mentolder';
}

// Returns a redirect URL when the coaching board must be gated, else null.
function boardAuthRedirect(req, env) {
  if (buildConfig(env).defaultMode !== 'coaching') return null; // mayhem stays public
  if (req.session && req.session.userId) return null;
  const e2eSecret = env.BRETT_OIDC_SECRET;
  if (e2eSecret && typeof req.header === 'function' && req.header('x-e2e-secret') === e2eSecret) return null;
  const returnTo = encodeURIComponent(req.path || '/');
  return `/auth/login?returnTo=${returnTo}`;
}
```
with:
```javascript
// Non-mode config returned to the client. Mode concept removed — coaching is the only board.
function buildConfig(_env) {
  return {};
}

function resolveBrand(env) {
  return env.BRETT_BRAND || 'mentolder';
}

// The board is always SSO-gated. Returns a redirect URL when unauthenticated, else null.
function boardAuthRedirect(req, env) {
  if (req.session && req.session.userId) return null;
  const e2eSecret = env.BRETT_OIDC_SECRET;
  if (e2eSecret && typeof req.header === 'function' && req.header('x-e2e-secret') === e2eSecret) return null;
  const returnTo = encodeURIComponent(req.path || '/');
  return `/auth/login?returnTo=${returnTo}`;
}
```
(`/api/config` at line 267-268 keeps `{ ...buildConfig(process.env), brand: resolveBrand(process.env) }` — now resolves to `{ brand }`.)

- [ ] **Step 5: Run the two tests — verify they PASS**

Run: `cd /home/patrick/Projects/wt-brett-coaching-consolidation/brett && npm test test/server-config.test.js test/board-auth.test.js 2>&1 | tail -6`
Expected: `# fail 0`.

- [ ] **Step 6: Run the full suite — green**

Run: `cd /home/patrick/Projects/wt-brett-coaching-consolidation/brett && npm test 2>&1 | tail -4`
Expected: `# fail 0`.

- [ ] **Step 7: Commit**

```bash
cd /home/patrick/Projects/wt-brett-coaching-consolidation
git add brett/server.js brett/test/server-config.test.js brett/test/board-auth.test.js
git commit -m "feat(brett): remove mode config; board is always SSO-gated"
```

---

### Task 8: Remove Mayhem/game relay types and the mode mutations from `server.js`

**Goal:** Strip Mayhem/game entries from `RELAY_TYPES` and `TRANSIENT_TYPES`, remove the `mayhem_mode` and `game_mode_change` mutation cases and their `buildStateFromMutations`/snapshot/join wiring, while keeping all coaching state and graceful-ignoring unknown message types. Rewrite `server-admin.test.js`; delete `server-mayhem.test.js`.

**Files:**
- Modify: `brett/server.js` — `RELAY_TYPES` (766-779), `TRANSIENT_TYPES` (781-787), `applyMutation` cases (1000-1009), `SPECIAL`/state assembly (1060-1080), join hydration (1205-1220), snapshot `mayhem`/`gameMode` fields (1174-1175, 1252-1253)
- Rewrite: `brett/test/server-admin.test.js`
- Delete: `brett/test/server-mayhem.test.js`

- [ ] **Step 1: Delete `server-mayhem.test.js` and rewrite `server-admin.test.js` (RED for the Mayhem assertions)**

```bash
cd /home/patrick/Projects/wt-brett-coaching-consolidation/brett
git rm test/server-mayhem.test.js
```
Replace `test/server-admin.test.js` with (drops the RELAY_TYPES bot/mayhem/game-mode assertions, keeps `isAdminFromClaims` + a coaching mutation):
```javascript
'use strict';
process.env.MOCK_DB = 'true';
const test   = require('node:test');
const assert = require('node:assert');
const { isAdminFromClaims, RELAY_TYPES, applyMutation, buildStateFromMutations } = require('../server.js');

test('isAdminFromClaims: true when admin role present', () => {
  const claims = { realm_access: { roles: ['offline_access', 'admin', 'uma_authorization'] } };
  assert.strictEqual(isAdminFromClaims(claims), true);
});

test('isAdminFromClaims: false when admin role missing', () => {
  const claims = { realm_access: { roles: ['offline_access'] } };
  assert.strictEqual(isAdminFromClaims(claims), false);
});

test('isAdminFromClaims: false for null/undefined/empty claims', () => {
  assert.strictEqual(isAdminFromClaims(null), false);
  assert.strictEqual(isAdminFromClaims(undefined), false);
  assert.strictEqual(isAdminFromClaims({}), false);
});

test('RELAY_TYPES: contains only coaching/figure types, no Mayhem types', () => {
  for (const t of ['mayhem_mode','game_mode_change','hit','player_death','vehicle_spawn','hero_select','duel_start','bot_spawn']) {
    assert.ok(!RELAY_TYPES.includes(t), `RELAY_TYPES must not include ${t}`);
  }
  for (const t of ['add','move','update','delete','clear','optik','stiffness']) {
    assert.ok(RELAY_TYPES.includes(t), `RELAY_TYPES must include ${t}`);
  }
});

test('applyMutation: coaching steps round-trip through state', () => {
  const room = 'admin-ws-test-coaching';
  applyMutation(room, { type: 'coaching_steps_set', steps: ['a', 'b'], index: 1 });
  const state = buildStateFromMutations(room);
  assert.deepStrictEqual(state.coachingSteps, { steps: ['a', 'b'], index: 1 });
});
```

- [ ] **Step 2: Run the rewritten test — verify RED**

Run: `cd /home/patrick/Projects/wt-brett-coaching-consolidation/brett && npm test test/server-admin.test.js 2>&1 | tail -6`
Expected: FAIL on the new RELAY_TYPES assertion (Mayhem types still present).

- [ ] **Step 3: Reduce `RELAY_TYPES` to coaching/figure types only**

Replace (was `server.js:766-779`):
```javascript
const RELAY_TYPES = [
  'add','move','update','delete','clear','optik','stiffness','jump',
  'mayhem_mode','player_join','player_state','player_leave',
  'hit','vehicle_spawn',
  'hp_update','player_death','player_respawn',
  'obstacle_layout','game_mode_change',
  'damage_event','death_event','pickup_request','pickup_taken','pickup_spawned',
  'snapshot','request_state_snapshot',
  'bot_spawn','bot_despawn','round_reset',
  'wave_start','wave_complete','coop_win','coop_lose','coop_wave_sync',
  'hero_select', 'duel_start',
  'hero_stealth', 'hero_teleport', 'minion_spawn', 'minion_update', 'minion_die', 'hero_slow',
  'vehicle_switch', 'vehicle_repair', 'motorcycle_sprint',
];
```
with:
```javascript
const RELAY_TYPES = [
  'add','move','update','delete','clear','optik','stiffness','jump',
  'snapshot','request_state_snapshot',
];
```

- [ ] **Step 4: Reduce `TRANSIENT_TYPES` to coaching transients only**

Replace (was `server.js:781-787`):
```javascript
const TRANSIENT_TYPES = new Set([
  'jump','player_join','player_state','player_leave','hit','vehicle_spawn',
  'hp_update','player_death','player_respawn',
  'wave_start','wave_complete','coop_win','coop_lose','coop_wave_sync',
  'hero_select', 'duel_start', 'hero_stealth', 'hero_teleport', 'minion_update', 'hero_slow',
  'vehicle_switch', 'vehicle_repair', 'motorcycle_sprint',
]);
```
with:
```javascript
const TRANSIENT_TYPES = new Set([
  'jump',
]);
```

- [ ] **Step 5: Remove the `mayhem_mode` and `game_mode_change` mutation cases**

Delete from `applyMutation` (was `server.js:1000-1009`):
```javascript
    case 'mayhem_mode':
      if (typeof msg.enabled === 'boolean') {
        figs.set('__mayhem__', { id: '__mayhem__', enabled: msg.enabled });
      }
      break;
    case 'game_mode_change':
      if (typeof msg.mode === 'string') {
        figs.set('__game_mode__', { id: '__game_mode__', mode: msg.mode });
      }
      break;
```

- [ ] **Step 6: Remove `__mayhem__`/`__game_mode__` from `buildStateFromMutations`**

In `SPECIAL` (was `server.js:1061`) change:
```javascript
    '__optik__', '__stiffness__', '__mayhem__', '__game_mode__',
```
to:
```javascript
    '__optik__', '__stiffness__',
```
Then delete the entry reads + result fields (was `server.js:1069-1070` and `1079-1080`):
```javascript
  const mayhemEntry   = figs.get('__mayhem__');
  const gameModeEntry = figs.get('__game_mode__');
```
and
```javascript
  if (mayhemEntry)   result.mayhem    = !!mayhemEntry.enabled;
  if (gameModeEntry) result.gameMode  = gameModeEntry.mode;
```

- [ ] **Step 7: Remove mayhem/gameMode from join hydration and both snapshot payloads**

In the join hydration block delete (was `server.js:1205-1220`):
```javascript
          if (typeof state.mayhem === 'boolean') {
            figs.set('__mayhem__', { id: '__mayhem__', enabled: state.mayhem });
          }
          let initialGameMode = state.gameMode;
          if (!initialGameMode && typeof msg.room === 'string') {
            if (msg.room.startsWith('solo-')) {
              initialGameMode = 'duel';
            } else if (msg.room.startsWith('duel-')) {
              initialGameMode = 'duel';
            } else if (msg.room.startsWith('ffa-')) {
              initialGameMode = 'deathmatch';
            }
          }
          if (typeof initialGameMode === 'string') {
            figs.set('__game_mode__', { id: '__game_mode__', mode: initialGameMode });
          }
```
In the `request_state_snapshot` payload delete (was `server.js:1174-1175`):
```javascript
            mayhem: state.mayhem ?? true,
            gameMode: state.gameMode,
```
In the `join` snapshot payload delete (was `server.js:1252-1253`):
```javascript
          mayhem: state.mayhem ?? true,
          gameMode: state.gameMode,
```

- [ ] **Step 8: Run the rewritten admin test — verify GREEN**

Run: `cd /home/patrick/Projects/wt-brett-coaching-consolidation/brett && npm test test/server-admin.test.js 2>&1 | tail -6`
Expected: `# fail 0`.

- [ ] **Step 9: Run the full suite — green (server-mayhem and the death/duel handlers still present but unreferenced from RELAY_TYPES; removed in Task 9)**

Run: `cd /home/patrick/Projects/wt-brett-coaching-consolidation/brett && npm test 2>&1 | tail -6`
Expected: `# fail 0`. If any *coaching* test fails, STOP and debug — coaching state must survive.

- [ ] **Step 10: Commit**

```bash
cd /home/patrick/Projects/wt-brett-coaching-consolidation
git add brett/server.js brett/test/server-admin.test.js
git commit -m "feat(brett): strip Mayhem relay/mode types and state from server"
```

---

### Task 9: Remove Mayhem game logic, message handlers, admin cases, and the skins/GLB system from `server.js`

**Goal:** Delete the duel/lms/coop/pickup logic, the death/damage/pickup/duel message handlers, the Mayhem admin cases, the skins catalog/upload/GLB validator + endpoints, and prune the exports. Delete the dependent tests (`game-mode`, `physics`, `damage`, `pickups`, `keybindings`, `duel-server-auth`, `skin-catalog`, `skin-upload`, `skin-validator`). Keep coaching admin cases (`admin_kick`, `admin_session_create`, `admin_handoff_token`, `admin_round_stop`, `admin_round_pause`, `admin_coaching_steps_set`, `admin_broadcast`).

**Files:**
- Modify: `brett/server.js` — death/pickup handlers (1141-1162), duel handlers (1295-1342), RELAY post-processing branches (1368-1432), `ADMIN_TYPES` + `admin_mayhem_toggle`/`admin_mode_set`/`admin_bot_*`/`admin_round_reset` cases (1435-1502), lms/duel helpers (789-825, 795-815), pickup helpers (928-...), skins block (10-95, 385-437), exports (1641-1660)
- Delete tests: `game-mode`, `physics`, `damage`, `pickups`, `keybindings`, `duel-server-auth`, `skin-catalog`, `skin-upload`, `skin-validator`

> Because these tests directly `require` the modules/exports being removed, delete them **first** (Step 1) so the suite can run; the deletions are pure removals (no red→green needed beyond "suite still green").

- [ ] **Step 1: Delete the Mayhem/skin tests**

```bash
cd /home/patrick/Projects/wt-brett-coaching-consolidation/brett
git rm test/game-mode.test.js test/physics.test.js test/damage.test.mjs \
       test/pickups.test.mjs test/keybindings.test.js test/duel-server-auth.test.js \
       test/skin-catalog.test.js test/skin-upload.test.js test/skin-validator.test.js
```

- [ ] **Step 2: Remove the death/damage/pickup message handlers**

Delete (was `server.js:1141-1162`): the `damage_event`, `death_event`, `pickup_request` handlers and the trailing pickup-respawn `setTimeout`. Keep the `pong` handler above and the `request_state_snapshot` handler below.

- [ ] **Step 3: Remove the duel message handlers**

Delete (was `server.js:1295-1342`): the `duel_start`, `rematch_request`, and `duel_abandoned_request` blocks. Keep the appearance-validation blocks (1280-1293) above and the `figure_lock`/`figure_unlock` blocks (1344-1363) below.

- [ ] **Step 4: Simplify the `RELAY_TYPES.includes(msg.type)` post-processing**

Replace (was `server.js:1365-1433`) the whole block:
```javascript
      if (RELAY_TYPES.includes(msg.type)) {
        applyMutation(room, msg);
        broadcast(room, msg, ws);
        if (msg.type === 'player_join' && typeof msg.playerId === 'string') {
          ...
        } else if (msg.type === 'game_mode_change' ...) {
          ...
        } else if (msg.type === 'player_death' ...) {
          ...duel/lms...
        } else if (msg.type === 'wave_start' ...) {
          ...
        } else if (msg.type === 'clear') {
          flushImmediate(room).catch(err => console.error('[brett] flush:', err));
        }
        if (!TRANSIENT_TYPES.has(msg.type) && msg.type !== 'clear') {
          schedulePersist(room);
        }
      }
```
with the coaching-only version:
```javascript
      if (RELAY_TYPES.includes(msg.type)) {
        applyMutation(room, msg);
        broadcast(room, msg, ws);
        if (msg.type === 'clear') {
          flushImmediate(room).catch(err => console.error('[brett] flush:', err));
        }
        if (!TRANSIENT_TYPES.has(msg.type) && msg.type !== 'clear') {
          schedulePersist(room);
        }
      }
```

- [ ] **Step 5: Trim `ADMIN_TYPES` and delete the Mayhem admin cases**

Replace `ADMIN_TYPES` (was `server.js:1435-1440`):
```javascript
      const ADMIN_TYPES = [
        'admin_mayhem_toggle','admin_mode_set','admin_kick',
        'admin_bot_spawn','admin_bot_despawn','admin_round_reset','admin_broadcast',
        'admin_session_create','admin_handoff_token','admin_round_stop','admin_round_pause',
        'admin_coaching_steps_set',
      ];
```
with:
```javascript
      const ADMIN_TYPES = [
        'admin_kick','admin_broadcast',
        'admin_session_create','admin_handoff_token','admin_round_stop','admin_round_pause',
        'admin_coaching_steps_set',
      ];
```
Then delete the `case 'admin_mayhem_toggle'`, `case 'admin_mode_set'`, `case 'admin_bot_spawn'`, `case 'admin_bot_despawn'`, and `case 'admin_round_reset'` switch arms (was `server.js:1448-1502`). Keep `admin_kick`, `admin_broadcast`, `admin_session_create`, `admin_handoff_token`, `admin_round_stop`, `admin_round_pause`, `admin_coaching_steps_set`.

- [ ] **Step 6: Remove lms/duel helpers and their module-level state**

Delete (was `server.js:789-825`): `lmsAlive`, `duelRooms`, `rematchRequests`, `duelInactivityTimers`, `roomMeta` declarations and the functions `handleLmsDeath`, `handleDuelDeath`, `_armDuelInactivityTimer`, `_clearDuelInactivityTimer` (and any remaining `_clearDuelInactivityTimer` body just below). Also remove the `coop_wave_sync` join-time sync (was `server.js:1268-1271`, the `meta.coopWave` block) since `roomMeta` is gone.

- [ ] **Step 7: Remove the pickup subsystem**

Delete the `ensurePickups`/`spawnPickup`/`pickupState` definitions (was `server.js:928-...`) and the pickup-spawn loop in the `request_state_snapshot` handler (was `server.js:1181-1187`, the `const pickups = ensurePickups(room); pickups.forEach(...)` block).

- [ ] **Step 8: Remove the skins/GLB system**

Delete: the `multer` import + `skinUpload` config (was `server.js:1, 10-16`) — keep `multer` out of `require`s if unused elsewhere (verify in Step 11); `validateGlb` (20-52); `SKINS_DIR_NAME`/`SKINS_DIR`/`listSkins`/`slugifyForSkin` (56-95); the `app.get('/api/skins')`, `app.post('/api/skins/upload')`, `app.delete('/api/skins/:id')` routes (385-437).

- [ ] **Step 9: Prune the exports block**

In `module.exports` (was `server.js:1641-1660`) remove the now-undefined names:
```javascript
  RELAY_TYPES, TRANSIENT_TYPES, lmsAlive, handleLmsDeath,
  duelRooms, handleDuelDeath,
  pickupState, ensurePickups, spawnPickup,
  ...
  validateGlb,
  SKINS_DIR,
  listSkins,
  slugifyForSkin,
```
Keep `RELAY_TYPES` and `TRANSIENT_TYPES` (still defined, still used by `server-admin.test.js`); remove `lmsAlive, handleLmsDeath, duelRooms, handleDuelDeath, pickupState, ensurePickups, spawnPickup, validateGlb, SKINS_DIR, listSkins, slugifyForSkin`. Final exports retain: `app, server, pool, wss, applyMutation, buildStateFromMutations, figureMaps, handleDisconnect, RELAY_TYPES, TRANSIENT_TYPES, isAdminFromClaims, validateAppearance, resolveBrand, buildConfig, boardAuthRedirect, acquireFigureLock, releaseFigureLock, releaseLocksForUser, listFigureLocks, addParticipant, removeParticipant, listParticipants, transitionPhase, generateSessionCode` (and any other surviving coaching exports).

- [ ] **Step 10: Remove the `multer` dependency from `package.json` if no longer used**

Run: `cd /home/patrick/Projects/wt-brett-coaching-consolidation/brett && grep -n "multer" server.js`
If no hits, remove `"multer": "^1.4.5-lts.1",` from `package.json` dependencies and run `npm install` to update the lockfile.
Expected after: `grep multer server.js` → no output.

- [ ] **Step 11: Verify the server still requires cleanly and has no dangling Mayhem refs**

Run:
```bash
cd /home/patrick/Projects/wt-brett-coaching-consolidation/brett
MOCK_DB=true node -e "require('./server.js'); console.log('server loads OK')"
grep -niE "mayhem|game_mode|gameMode|duel|lms|pickup|hero|vehicle|wave_|coop|validateGlb|SKINS_DIR|listSkins|/api/skins" server.js
```
Expected: `server loads OK`; second grep → no output.

- [ ] **Step 12: Run the full suite — green**

Run: `cd /home/patrick/Projects/wt-brett-coaching-consolidation/brett && npm test 2>&1 | tail -6`
Expected: `# fail 0` (only coaching/figure/session/locks/presence/phases/appearance/brand suites remain).

- [ ] **Step 13: Commit**

```bash
cd /home/patrick/Projects/wt-brett-coaching-consolidation
git add brett/server.js brett/package.json brett/package-lock.json
git commit -m "feat(brett): remove Mayhem game logic, skins/GLB system, and dead exports"
```

---

### Task 10: Flip `coaching-isolation.test.mjs` to assert Mayhem absence

**Goal:** The isolation test currently asserts Mayhem is *gated/deferred*. Rewrite it to assert Mayhem is *gone* from the repo: no `assets/mayhem/` dir, no Mayhem script tags / admin tags / mode tokens in `index.html`, no Mayhem tokens in `server.js`.

**Files:**
- Rewrite: `brett/test/coaching-isolation.test.mjs`

- [ ] **Step 1: Rewrite the test (RED first if any token still leaks)**

Replace the file with:
```javascript
// Verifies Mayhem is fully removed and the board is coaching-only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dir, '../public/index.html'), 'utf8');
const server = readFileSync(join(__dir, '../server.js'), 'utf8');

test('no assets/mayhem directory remains', () => {
  assert.ok(!existsSync(join(__dir, '../public/assets/mayhem')), 'assets/mayhem must be deleted');
});

test('no assets/combat directory remains', () => {
  assert.ok(!existsSync(join(__dir, '../public/assets/combat')), 'assets/combat must be deleted');
});

test('no public/admin React panel remains', () => {
  assert.ok(!existsSync(join(__dir, '../public/admin')), 'public/admin must be deleted');
});

test('index.html has no Mayhem/admin script tags or mode tokens', () => {
  for (const token of ['assets/mayhem', 'room-browser.js', '/admin/', 'text/babel',
                       'defaultMode', 'availableModes', 'mode-select', 'mode-state',
                       'window.Mayhem', '__brettInitMayhem']) {
    assert.ok(!html.includes(token), `index.html must not contain "${token}"`);
  }
});

test('index.html still loads the coaching HUD module and the live coaching socket', () => {
  assert.ok(html.includes('coaching/hud.mjs'), 'coaching HUD module must be imported');
  assert.ok(html.includes('window.__brettWS = ws'), 'live coaching WebSocket must be exposed');
});

test('server.js has no Mayhem/game-mode/skins tokens', () => {
  for (const token of ['mayhem_mode', 'game_mode_change', 'gameMode', 'handleDuelDeath',
                       'handleLmsDeath', '/api/skins', 'validateGlb', 'ensurePickups']) {
    assert.ok(!server.includes(token), `server.js must not contain "${token}"`);
  }
});

test('named persons are still brand-tagged so mentolder can hide them', () => {
  assert.ok(html.includes("brand: 'korczewski'"), 'NAMED_PERSONS entries must carry a brand tag');
});

test('add message still carries the figure label', () => {
  assert.ok(/type:\s*['"]add['"][\s\S]{0,400}label/.test(html), 'add payload should include label');
});
```

- [ ] **Step 2: Run it — verify GREEN (all earlier tasks already removed the tokens)**

Run: `cd /home/patrick/Projects/wt-brett-coaching-consolidation/brett && npm test test/coaching-isolation.test.mjs 2>&1 | tail -8`
Expected: `# fail 0`. If any token leaks, STOP and remove it in the owning file before continuing.

- [ ] **Step 3: Run the full suite — green**

Run: `cd /home/patrick/Projects/wt-brett-coaching-consolidation/brett && npm test 2>&1 | tail -4`
Expected: `# fail 0`.

- [ ] **Step 4: Commit**

```bash
cd /home/patrick/Projects/wt-brett-coaching-consolidation
git add brett/test/coaching-isolation.test.mjs
git commit -m "test(brett): flip coaching-isolation to assert Mayhem absence"
```

---

### Task 11: Remove `BRETT_DEFAULT_MODE` from the base manifest

**Goal:** Delete the `BRETT_DEFAULT_MODE` env entry from `k3d/brett.yaml`. This shifts the index of every env after it (PRESETS_PATH 12→11, BRAND 13→12) — Task 12 repairs the overlays *first conceptually* but this task is committed together with Task 12 (do **not** validate between 11 and 12; the overlay would be momentarily broken).

> Execute Task 11 and Task 12 back-to-back; run `task workspace:validate` only after Task 12.

**Files:**
- Modify: `k3d/brett.yaml:87-88`

- [ ] **Step 1: Delete the env entry**

Delete (was `k3d/brett.yaml:87-88`):
```yaml
            - name: BRETT_DEFAULT_MODE
              value: "coaching"
```
The surrounding entries (`BRETT_SESSION_SECRET` above, `BRETT_PRESETS_PATH` below) remain.

- [ ] **Step 2: Confirm `BRETT_DEFAULT_MODE` is gone from the base**

Run: `cd /home/patrick/Projects/wt-brett-coaching-consolidation && grep -rn "BRETT_DEFAULT_MODE" k3d/`
Expected: no output.

- [ ] **Step 3: (No validate yet — proceed straight to Task 12.)**

---

### Task 12: Repair the env-index footgun — convert brett env repoints to strategic-merge-by-name

**Goal:** Replace the index-based JSON6902 brett env patches in **both** brand overlays with strategic-merge patches keyed by env `name`, so removing a base env entry can never shift a patched index again. Drop the `mayhem` op entirely. Gate with `task workspace:validate` for **both** brands.

**Files:**
- Modify: `prod-korczewski/kustomization.yaml:118-139`
- Modify: `prod-mentolder/kustomization.yaml:144-153`

> Strategic-merge patches merge `containers[].env[]` by the `name` key (kustomize uses `name` as the env list merge key), so order/index is irrelevant. The node-affinity `op: replace` patches stay as-is (they target `affinity`, not env, and are unaffected by env reordering).

- [ ] **Step 1: korczewski — replace the index-based env patch with a strategic-merge patch (drop mayhem)**

In `prod-korczewski/kustomization.yaml`, replace the brett env patch block (was lines 118-139):
```yaml
  # brett Deployment — flip default mode to mayhem on korczewski.
  # Base sets BRETT_DEFAULT_MODE=coaching at env index 11; replace the value here.
  # mentolder keeps the base default (coaching only).
  - target:
      kind: Deployment
      name: brett
    patch: |-
      - op: replace
        path: /spec/template/spec/containers/0/env/11/value
        value: mayhem
      - op: replace
        path: /spec/template/spec/containers/0/env/3/value
        value: "http://keycloak.workspace-korczewski.svc.cluster.local:8080"
      - op: replace
        path: /spec/template/spec/containers/0/env/7/value
        value: "https://brett.korczewski.de"
      - op: replace
        path: /spec/template/spec/containers/0/env/8/value
        value: "http://website.website-korczewski.svc.cluster.local"
      - op: replace
        path: /spec/template/spec/containers/0/env/13/value
        value: korczewski
```
with a name-keyed strategic-merge patch (no mode flip — both brands are coaching-only now):
```yaml
  # brett Deployment — korczewski brand/OIDC/routing repoints.
  # Strategic-merge by env `name` (index-agnostic) so base env reordering can't
  # silently retarget the wrong variable. Mode concept removed → no mayhem flip.
  - patch: |-
      apiVersion: apps/v1
      kind: Deployment
      metadata:
        name: brett
      spec:
        template:
          spec:
            containers:
              - name: brett
                env:
                  - name: KEYCLOAK_URL
                    value: "http://keycloak.workspace-korczewski.svc.cluster.local:8080"
                  - name: BRETT_PUBLIC_URL
                    value: "https://brett.korczewski.de"
                  - name: WEBSITE_INTERNAL_URL
                    value: "http://website.website-korczewski.svc.cluster.local"
                  - name: BRETT_BRAND
                    value: korczewski
```

- [ ] **Step 2: mentolder — convert its index-based brett env patch to strategic-merge too**

In `prod-mentolder/kustomization.yaml`, replace the brett env patch (was lines 144-153):
```yaml
  - target:
      kind: Deployment
      name: brett
    patch: |-
      - op: replace
        path: /spec/template/spec/containers/0/env/7/value
        value: "https://brett.mentolder.de"
      - op: replace
        path: /spec/template/spec/containers/0/env/8/value
        value: "http://website.website.svc.cluster.local"
```
with:
```yaml
  # brett Deployment — mentolder routing repoints (index-agnostic strategic merge).
  - patch: |-
      apiVersion: apps/v1
      kind: Deployment
      metadata:
        name: brett
      spec:
        template:
          spec:
            containers:
              - name: brett
                env:
                  - name: BRETT_PUBLIC_URL
                    value: "https://brett.mentolder.de"
                  - name: WEBSITE_INTERNAL_URL
                    value: "http://website.website.svc.cluster.local"
```

- [ ] **Step 3: Verify no remaining index-based brett env patches in either overlay**

Run:
```bash
cd /home/patrick/Projects/wt-brett-coaching-consolidation
grep -nE "/env/[0-9]+/value" prod-korczewski/kustomization.yaml prod-mentolder/kustomization.yaml
grep -rn "mayhem" prod-korczewski/kustomization.yaml prod-mentolder/kustomization.yaml
```
Expected: both → no output.

- [ ] **Step 4: Validate the base + dev manifests**

Run: `cd /home/patrick/Projects/wt-brett-coaching-consolidation && task workspace:validate`
Expected: `✓ Manifests are valid`.

- [ ] **Step 5: Validate the rendered korczewski overlay and confirm env correctness**

Run:
```bash
cd /home/patrick/Projects/wt-brett-coaching-consolidation
kubectl kustomize prod-fleet/korczewski --load-restrictor=LoadRestrictionsNone > /tmp/korcz.yaml && echo "korczewski overlay builds"
# Confirm the brett container got the korczewski repoints and NO BRETT_DEFAULT_MODE:
awk '/name: brett$/{f=1} f&&/BRETT_BRAND|BRETT_PUBLIC_URL|KEYCLOAK_URL|BRETT_DEFAULT_MODE|brett.korczewski.de|workspace-korczewski/{print}' /tmp/korcz.yaml | sort -u
```
Expected: overlay builds; output shows `brett.korczewski.de`, `workspace-korczewski` keycloak URL, `BRETT_BRAND: korczewski`; **no** `BRETT_DEFAULT_MODE`.

- [ ] **Step 6: Validate the rendered mentolder overlay**

Run:
```bash
cd /home/patrick/Projects/wt-brett-coaching-consolidation
kubectl kustomize prod-fleet/mentolder --load-restrictor=LoadRestrictionsNone > /tmp/ment.yaml && echo "mentolder overlay builds"
awk '/name: brett$/{f=1} f&&/BRETT_BRAND|BRETT_PUBLIC_URL|BRETT_DEFAULT_MODE|brett.mentolder.de/{print}' /tmp/ment.yaml | sort -u
```
Expected: overlay builds; shows `brett.mentolder.de`, `BRETT_BRAND: mentolder` (base default); **no** `BRETT_DEFAULT_MODE`.

- [ ] **Step 7: Commit (Task 11 + Task 12 together)**

```bash
cd /home/patrick/Projects/wt-brett-coaching-consolidation
git add k3d/brett.yaml prod-korczewski/kustomization.yaml prod-mentolder/kustomization.yaml
git commit -m "fix(brett): remove BRETT_DEFAULT_MODE, convert overlay env repoints to strategic-merge"
```

---

### Task 13: Remove obsolete Mayhem E2E specs and regenerate the test inventory

**Goal:** Delete the Playwright Mayhem specs and the `brett-mentolder` (Mayhem) project from `tests/e2e/playwright.config.ts`, then regenerate `website/src/data/test-inventory.json` (CI fails if it drifts).

**Files:**
- Modify: `tests/e2e/playwright.config.ts`
- Delete: obsolete `tests/e2e/specs/*` Mayhem specs
- Modify (generated): `website/src/data/test-inventory.json`

- [ ] **Step 1: Identify the Mayhem E2E specs**

Run:
```bash
cd /home/patrick/Projects/wt-brett-coaching-consolidation
grep -rln "mayhem\|duel\|deathmatch\|pointerlock\|crosshair\|muzzle\|tracer\|submode\|touch-mount\|loadout\|brett-skins" tests/e2e/specs
```
Expected list includes: `brett-mayhem.spec.ts`, `brett-duel-rematch.spec.ts`, `brett-duel-spec-hud.spec.ts`, `fa-27-brett-r1-p1-crosshair.spec.ts`, `fa-27-brett-r1-p1-pointerlock.spec.ts`, `fa-27-brett-r1-p2-muzzle-tracer.spec.ts`, `fa-27-brett-r1-p3-submode-picker.spec.ts`, `fa-27-brett-r1-p4-touch-mount.spec.ts`, `brett-mobile.spec.ts`, `brett-skins.spec.ts`, `brett-duel-mode.spec.ts`, `brett-controls.spec.ts`. Review each: delete only Mayhem-only specs; keep coaching/mannequin specs (e.g. `brett-mannequin.spec.ts`, `brett.spec.ts`, `brett-art.spec.ts` — inspect headers before deciding).

- [ ] **Step 2: Delete the Mayhem-only specs (after confirming each is Mayhem-only)**

```bash
cd /home/patrick/Projects/wt-brett-coaching-consolidation
git rm tests/e2e/specs/brett-mayhem.spec.ts \
       tests/e2e/specs/brett-duel-rematch.spec.ts \
       tests/e2e/specs/brett-duel-spec-hud.spec.ts \
       tests/e2e/specs/brett-duel-mode.spec.ts \
       tests/e2e/specs/fa-27-brett-r1-p1-crosshair.spec.ts \
       tests/e2e/specs/fa-27-brett-r1-p1-pointerlock.spec.ts \
       tests/e2e/specs/fa-27-brett-r1-p2-muzzle-tracer.spec.ts \
       tests/e2e/specs/fa-27-brett-r1-p3-submode-picker.spec.ts \
       tests/e2e/specs/fa-27-brett-r1-p4-touch-mount.spec.ts \
       tests/e2e/specs/brett-mobile.spec.ts \
       tests/e2e/specs/brett-skins.spec.ts \
       tests/e2e/specs/brett-controls.spec.ts
```
(Adjust the list to exactly the specs Step 1 confirmed Mayhem-only. Do not delete coaching/mannequin specs.)

- [ ] **Step 3: Remove the Mayhem Playwright project from the config**

In `tests/e2e/playwright.config.ts` remove the `brett-mentolder-setup` and `brett-mentolder` project entries (was ~190-206, the project running `brett-mayhem.spec.ts`) and the stale comment at line 142. Keep any coaching brett project if one exists. Verify the config still parses:
Run: `cd /home/patrick/Projects/wt-brett-coaching-consolidation/tests/e2e && [ -d node_modules ] || npm ci; node -e "require('./playwright.config.ts')" 2>/dev/null || ./node_modules/.bin/playwright test --list >/dev/null 2>&1 && echo "config OK"`
Expected: `config OK` (or a clean `--list` with no reference to deleted specs).

- [ ] **Step 4: Regenerate the test inventory**

Run: `cd /home/patrick/Projects/wt-brett-coaching-consolidation && task test:inventory`
Expected: regenerates `website/src/data/test-inventory.json` with the Mayhem brett specs removed.

- [ ] **Step 5: Confirm the inventory check would pass in CI (no drift)**

Run: `cd /home/patrick/Projects/wt-brett-coaching-consolidation && git diff --stat website/src/data/test-inventory.json`
Expected: the file is staged-clean after committing (no further drift on a second `task test:inventory` run).

- [ ] **Step 6: Commit**

```bash
cd /home/patrick/Projects/wt-brett-coaching-consolidation
git add tests/e2e/playwright.config.ts website/src/data/test-inventory.json
git commit -m "test(e2e): remove Mayhem brett specs/project, regenerate test inventory"
```

---

### Task 14: Final acceptance sweep + dev smoke

**Goal:** Verify all spec acceptance criteria with concrete commands, plus a manual dev smoke on `brett.localhost`.

**Files:** none (verification only)

- [ ] **Step 1: No Mayhem/mode artifacts in runnable code**

Run:
```bash
cd /home/patrick/Projects/wt-brett-coaching-consolidation
test ! -d brett/public/assets/mayhem && echo "no assets/mayhem"
test ! -d brett/public/admin && echo "no public/admin"
test ! -f brett/public/assets/scene.js && test ! -f brett/public/assets/main.js && echo "no scene.js/main.js"
test ! -f brett/public/assets/mode-select.mjs && test ! -f brett/public/assets/mode-state.mjs && echo "no mode-select/mode-state"
grep -ri "mayhem" brett/server.js brett/public/index.html brett/public/assets brett/test || echo "no mayhem in runnable code"
grep -rn "BRETT_DEFAULT_MODE\|defaultMode\|availableModes" brett k3d prod-mentolder prod-korczewski || echo "no mode concept"
```
Expected: each `echo` fires; the two `grep` lines print their "no ..." fallback (no real hits). (Hits in `brett/CHANGELOG.md` are acceptable as history — restrict the grep to runnable paths as above.)

- [ ] **Step 2: Full unit suite green**

Run: `cd /home/patrick/Projects/wt-brett-coaching-consolidation/brett && npm test 2>&1 | tail -6`
Expected: `# fail 0`.

- [ ] **Step 3: Manifests valid + both overlays build**

Run:
```bash
cd /home/patrick/Projects/wt-brett-coaching-consolidation
task workspace:validate
kubectl kustomize prod-fleet/mentolder  --load-restrictor=LoadRestrictionsNone >/dev/null && echo "mentolder OK"
kubectl kustomize prod-fleet/korczewski --load-restrictor=LoadRestrictionsNone >/dev/null && echo "korczewski OK"
```
Expected: `✓ Manifests are valid`, `mentolder OK`, `korczewski OK`.

- [ ] **Step 4: Offline CI parity**

Run: `cd /home/patrick/Projects/wt-brett-coaching-consolidation && task test:all 2>&1 | tail -20`
Expected: all sub-tasks pass (notably the test-inventory check inside CI won't drift since Task 13 regenerated it). If `task test:all` requires services unavailable locally, at minimum run `task test:manifests` and `task test:dry-run`.

- [ ] **Step 5: Dev smoke on `brett.localhost`**

Build + run the brett image locally (or `task brett:build` then port-forward / dev cluster) and manually verify against `https://brett.localhost`:
- Figur setzen (add) und per Ziehen umstellen (move) — sofortiges Neupositionieren, kein Gait.
- Pose/Stellung wählen, Blickrichtung (facingY) ändern, Label setzen.
- Phasen durchschalten (warmup → active → paused → ended).
- Join-by-Code (Session erstellen → Code-Toast → Beitreten über `/api/join?code=...`).
- Snapshot-Persistenz über Reconnect (Figur setzen → Tab neu laden → Figur ist noch da).
- Es erscheint **kein** Mode-Select-Screen, **kein** Combat-HUD, **keine** React/Babel-CDN-Konsolenfehler.
Expected: all coaching flows work; no Mayhem UI; no 404s for deleted assets in the network tab.

- [ ] **Step 6: Push the branch**

```bash
cd /home/patrick/Projects/wt-brett-coaching-consolidation
git push -u origin feature/brett-coaching-consolidation
```

---

## Self-Review — spec coverage check

| Spec section / acceptance criterion | Task(s) |
|---|---|
| A · Server: remove `buildConfig` mode logic + `/api/config` mode fields | Task 7 |
| A · Server: `boardAuthRedirect` always-gated | Task 7 |
| A · Server: remove `mayhem_mode` / `game_mode_change` mutations | Task 8 |
| A · Server: remove `admin_mayhem_toggle` / `admin_mode_set` | Task 9 |
| A · Server: remove `player_death` / `handleLmsDeath` / `handleDuelDeath` | Task 9 |
| A · Server: prune Mayhem from `RELAY_TYPES` / `TRANSIENT_TYPES` | Task 8 |
| A · Server: keep coaching mutations (`session_*`, `coaching_steps_*`) | Task 8 (kept), Task 9 (admin kept) |
| A · Server: graceful-ignore of unknown/old message types | Task 3 (client `default: break`), Task 8/9 (server: non-RELAY types fall through, no crash) |
| B · Client: delete main.js/mode-select/mode-state/ws-gate/loadout/room-browser/scene.js | Tasks 1, 5 |
| B · Client: delete mayhem/, admin/, touch/, sfx/, skins/, game_assets_* dirs | Task 6 |
| B · Client: verify skins/sfx hold no coaching asset before deleting | Task 6 Step 1-2 |
| B · Client: delete mayhem.css/admin.css | Task 2 (links), Task 6 (files in public/admin) |
| B · Client: remove 21 mayhem tags + room-browser + 7 admin JSX + main.js tag | Tasks 1, 2 |
| B · Client: verify+remove React/Babel CDN | Task 2 |
| B · Client: strip `__brettInitMayhem` + Mayhem hooks, keep makeMannequin/addFigure | Task 3 |
| B · Client: remove `cfg.defaultMode` guard, coaching unconditional | Task 4 |
| B · Client: combat→coaching status-pill text | Task 14 Step 5 (verify); strip in Task 3 (default no-op) — *see note below* |
| C · Manifests: remove `BRETT_DEFAULT_MODE` from k3d/brett.yaml | Task 11 |
| C · Manifests: remove `env/11→mayhem` patch; keep env/3,7,8,13 repoints | Task 12 |
| C · Index-footgun: strategic-merge-by-name + validate both brands | Task 12 |
| D · Delete Mayhem tests | Tasks 5, 8, 9 |
| D · Flip `coaching-isolation.test.mjs` to absence | Task 10 |
| D · Keep coaching suite green | every task ends with `npm test` |
| D · `npm test` (MOCK_DB=true) green | Task 0/2/.../14 |
| D · `task workspace:validate` both brands | Task 12, Task 14 |
| D · Dev-smoke on brett.localhost | Task 14 Step 5 |
| E · Deploy via `task feature:brett` after merge | post-merge (dev-flow-execute), noted; not a code task |
| Acceptance: no mayhem/mode-select/scene.js/main.js/admin in repo | Task 14 Step 1 |
| Acceptance: `grep -ri mayhem brett/` clean in runnable code | Task 14 Step 1 |
| Acceptance: no mode concept anywhere | Task 14 Step 1 |
| Acceptance: both brands identical coaching board; korczewski OIDC/routing intact | Task 12 Step 5-6, Task 14 Step 3 |
| Acceptance: npm test + validate both brands green | Task 14 Steps 2-3 |
| Acceptance: dev-smoke passes | Task 14 Step 5 |

**Note on status-pill/combat text:** The spec asks to reword combat-flavored status-pill/hint text to coaching guidance. During Tasks 3–4 the implementer should `grep -niE "combat|kampf|waffe|gegner|leben|hp|töten|kill" brett/public/index.html` and reword any surviving Mayhem-flavored UI strings to coaching language (e.g. "Auswählen, Ziehen zum Stellen"). This is folded into Task 3 (cleanup of the inline UI) and confirmed in Task 14 Step 5; if a substantial number of strings exist, add a dedicated commit `chore(brett): reword combat status text to coaching guidance`.
