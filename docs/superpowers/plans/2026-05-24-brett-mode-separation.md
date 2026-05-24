---
domains: [website, infra]
status: staged
---

# Brett Mode Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate Coaching (figure-only) from Mayhem (3D combat) in the Systembrett: remove AI fill-bots, drive mode selection from server config, and default mentolder to coaching-only / korczewski to mayhem via env var.

**Architecture:** Server exposes `GET /api/config` returning `{ defaultMode, availableModes }` derived from a single `BRETT_DEFAULT_MODE` env var. Client fetches config at boot, conditionally renders the mode-select overlay (auto-skips when only one mode is available), and removes the Mayhem toolbar button from the DOM when Mayhem is not in `availableModes`. Per-cluster behavior is configured by a Kustomize JSON Patch in `prod-korczewski/`.

**Tech Stack:** Node.js + Express (server), vanilla ES modules (client), Kustomize (K8s), `node --test` (tests).

**Spec:** [`docs/superpowers/specs/2026-05-24-brett-mode-separation-design.md`](../specs/2026-05-24-brett-mode-separation-design.md)

---

## File Map

| File | Responsibility |
|---|---|
| `brett/server.js` | Add `buildConfig(env)` helper + `GET /api/config` route, export helper |
| `brett/test/server-config.test.js` | Unit-test `buildConfig` for all env-var combinations |
| `brett/public/assets/mode-state.mjs` | Add `'mayhem'` to VALID set |
| `brett/test/mode-state.test.mjs` | Add `setMode('mayhem')` assertion |
| `brett/public/assets/mode-select.mjs` | Accept `cfg`; auto-skip single mode; render two-card UI for multi-mode |
| `brett/public/assets/main.js` | Fetch `/api/config` (with fallback), pass to `showModeSelect`, hide `#mayhem-btn`, enable Mayhem after select |
| `brett/public/assets/style.css` | Styles for `.mode-card[data-mode="mayhem"]` highlight + Standard badge |
| `brett/public/assets/mayhem/mayhem.js` | Remove fill-bot loop, `spawnAIBot()`, bot-retire on join |
| `k3d/brett.yaml` | Add `BRETT_DEFAULT_MODE: "coaching"` env var (base default) |
| `prod-korczewski/kustomization.yaml` | JSON Patch overriding `BRETT_DEFAULT_MODE: mayhem` |

---

## Task 1: Server config helper + endpoint

**Files:**
- Modify: `brett/server.js` (add helper above route block at line ~145; extend `module.exports` at line 824)
- Create: `brett/test/server-config.test.js`

- [ ] **Step 1: Write the failing test**

Create `brett/test/server-config.test.js`:

```js
'use strict';
process.env.MOCK_DB = 'true';
const test = require('node:test');
const assert = require('node:assert');
const { buildConfig } = require('../server.js');

test('buildConfig: defaults to coaching when env var unset', () => {
  assert.deepStrictEqual(buildConfig({}), {
    defaultMode: 'coaching',
    availableModes: ['coaching'],
  });
});

test('buildConfig: coaching mode exposes only coaching', () => {
  assert.deepStrictEqual(buildConfig({ BRETT_DEFAULT_MODE: 'coaching' }), {
    defaultMode: 'coaching',
    availableModes: ['coaching'],
  });
});

test('buildConfig: mayhem mode exposes both', () => {
  assert.deepStrictEqual(buildConfig({ BRETT_DEFAULT_MODE: 'mayhem' }), {
    defaultMode: 'mayhem',
    availableModes: ['coaching', 'mayhem'],
  });
});

test('buildConfig: unknown value falls back to coaching', () => {
  assert.deepStrictEqual(buildConfig({ BRETT_DEFAULT_MODE: 'bogus' }), {
    defaultMode: 'coaching',
    availableModes: ['coaching'],
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd brett && npm test -- --test-name-pattern='buildConfig'
```

Expected: FAIL — `buildConfig is not a function` (not yet exported).

- [ ] **Step 3: Add `buildConfig` helper + route in `brett/server.js`**

Insert immediately after the `/healthz` route (currently line 145):

```js
function buildConfig(env) {
  const mode = env.BRETT_DEFAULT_MODE === 'mayhem' ? 'mayhem' : 'coaching';
  return {
    defaultMode: mode,
    availableModes: mode === 'mayhem' ? ['coaching', 'mayhem'] : ['coaching'],
  };
}

app.get('/api/config', (_req, res) => res.json(buildConfig(process.env)));
```

Then extend the existing `module.exports` block (line 824) to include `buildConfig`:

```js
module.exports = {
  app, server, pool, wss,
  applyMutation, buildStateFromMutations, figureMaps,
  handleDisconnect,
  RELAY_TYPES, TRANSIENT_TYPES, lmsAlive, handleLmsDeath,
  pickupState, ensurePickups, spawnPickup,
  isAdminFromClaims,
  validateAppearance,
  buildConfig,
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd brett && npm test -- --test-name-pattern='buildConfig'
```

Expected: PASS — 4 tests pass.

- [ ] **Step 5: Run full brett test suite to confirm nothing else broke**

```bash
cd brett && npm test
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add brett/server.js brett/test/server-config.test.js
git commit -m "feat(brett): add /api/config endpoint driven by BRETT_DEFAULT_MODE"
```

---

## Task 2: Extend mode-state VALID set

**Files:**
- Modify: `brett/public/assets/mode-state.mjs:2`
- Modify: `brett/test/mode-state.test.mjs` (append test)

- [ ] **Step 1: Write the failing test**

Append to `brett/test/mode-state.test.mjs`:

```js
test('setMode("mayhem") is accepted', () => {
  const state = createModeState({ storage: { getItem: () => null, setItem: () => {} } });
  assert.strictEqual(state.setMode('mayhem'), true);
  assert.strictEqual(state.current(), 'mayhem');
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd brett && npm test -- --test-name-pattern='mayhem'
```

Expected: FAIL — `setMode('mayhem')` returns `false` because `'mayhem'` is not in VALID.

- [ ] **Step 3: Add `'mayhem'` to VALID set in `brett/public/assets/mode-state.mjs`**

Change line 2:

```js
const VALID = new Set(['coaching', 'mode-select', 'mayhem']);
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd brett && npm test -- --test-name-pattern='mayhem'
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add brett/public/assets/mode-state.mjs brett/test/mode-state.test.mjs
git commit -m "feat(brett): add 'mayhem' to mode-state VALID set"
```

---

## Task 3: Mode-select overlay — accept config, auto-skip, two-card UI

**Files:**
- Modify: `brett/public/assets/mode-select.mjs` (full rewrite)
- Modify: `brett/public/assets/style.css` (append styles)

- [ ] **Step 1: Rewrite `brett/public/assets/mode-select.mjs`**

Replace entire file with:

```js
// brett/public/assets/mode-select.mjs
export function showModeSelect(modeState, cfg = { defaultMode: 'coaching', availableModes: ['coaching'] }) {
  const modes = cfg.availableModes || ['coaching'];

  // Single mode → skip overlay, auto-enter
  if (modes.length === 1) {
    modeState.setMode(modes[0]);
    return Promise.resolve(modes[0]);
  }

  return new Promise(resolve => {
    const el = document.createElement('div');
    el.className = 'mode-select-overlay';
    const isMayhemDefault = cfg.defaultMode === 'mayhem';
    el.innerHTML = `
      <div class="mode-select-card">
        <h2>Wähle deinen Modus</h2>
        <div class="mode-grid">
          <button class="mode-card" data-mode="coaching">
            <div class="title">Coaching</div>
            <div class="sub">Systemische Aufstellung</div>
          </button>
          <button class="mode-card mode-card-mayhem${isMayhemDefault ? ' mode-card-default' : ''}" data-mode="mayhem">
            <div class="title">🤸 Mayhem${isMayhemDefault ? ' <span class="badge">Standard</span>' : ''}</div>
            <div class="sub">3D Kampfmodus · Waffen · Fahrzeuge</div>
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(el);
    el.addEventListener('click', e => {
      const card = e.target.closest('.mode-card');
      if (!card || card.disabled) return;
      const mode = card.dataset.mode;
      modeState.setMode(mode);
      el.remove();
      resolve(mode);
    });
  });
}
```

- [ ] **Step 2: Append styles to `brett/public/assets/style.css`**

Append at end of file:

```css
/* Mode-select Mayhem highlight */
.mode-card-mayhem {
  border: 2px solid #e07a3a;
  box-shadow: 0 0 12px rgba(224, 122, 58, 0.35);
}
.mode-card-mayhem.mode-card-default {
  background: linear-gradient(135deg, rgba(224, 122, 58, 0.12), transparent);
}
.mode-card-mayhem .badge {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  font-size: 0.7em;
  font-weight: 600;
  color: #1a1a1a;
  background: #e07a3a;
  border-radius: 4px;
  vertical-align: middle;
}
```

- [ ] **Step 3: Verify no test regressions**

```bash
cd brett && npm test
```

Expected: All tests pass (no test covers `mode-select.mjs` directly — visual flow is verified in Task 6).

- [ ] **Step 4: Commit**

```bash
git add brett/public/assets/mode-select.mjs brett/public/assets/style.css
git commit -m "feat(brett): mode-select supports mayhem card + single-mode auto-skip"
```

---

## Task 4: Wire main.js to fetch config and gate Mayhem UI

**Files:**
- Modify: `brett/public/assets/main.js` (replace line 21 block)
- Modify: `brett/public/index.html:1297` area (entry now driven by main.js, not inline)

- [ ] **Step 1: Read current `main.js` and `index.html` Mayhem trigger context**

Inspect:
- `brett/public/assets/main.js:21` — currently `showModeSelect(modeState);`
- `brett/public/index.html:1297` — `window.Mayhem.setEnabled(true);` (look at the surrounding 10 lines to know what triggers it today)

- [ ] **Step 2: Replace bottom of `brett/public/assets/main.js`**

Replace line 21 (`showModeSelect(modeState);`) with:

```js
const cfg = await fetch('/api/config')
  .then(r => r.json())
  .catch(() => ({ defaultMode: 'coaching', availableModes: ['coaching'] }));

// Remove Mayhem toolbar button when Mayhem is not available on this cluster
if (!cfg.availableModes.includes('mayhem')) {
  document.getElementById('mayhem-btn')?.remove();
}

const chosen = await showModeSelect(modeState, cfg);
if (chosen === 'mayhem') {
  // Mayhem boot is idempotent — main.js owns enabling it post-select
  window.Mayhem?.setEnabled(true);
}
```

(Top-level `await` is allowed because `main.js` is loaded as a module — its `import` statements at line 1-4 already require module context.)

- [ ] **Step 3: Verify `index.html` still loads `main.js` as a module**

Run:

```bash
grep -n 'src="assets/main.js"' brett/public/index.html
```

Expected: a line like `<script type="module" src="assets/main.js"></script>`. If `type="module"` is missing, add it — top-level await will otherwise throw.

- [ ] **Step 4: Manual smoke test (dev)**

Start brett locally and open in a browser:

```bash
cd brett && MOCK_DB=true npm start
# Then in another shell:
curl -s http://localhost:3000/api/config
```

Expected: `{"defaultMode":"coaching","availableModes":["coaching"]}`.

Open `http://localhost:3000` — overlay should NOT appear (auto-enters coaching), and the `🤸 Mayhem` button should be removed from the toolbar.

- [ ] **Step 5: Manual smoke test (mayhem default)**

```bash
cd brett && MOCK_DB=true BRETT_DEFAULT_MODE=mayhem npm start
```

Open `http://localhost:3000` — overlay should show two cards (Coaching + Mayhem). Mayhem card has the orange border + "Standard" badge. The `🤸 Mayhem` button is still visible in the toolbar. Clicking Mayhem auto-enables it.

- [ ] **Step 6: Commit**

```bash
git add brett/public/assets/main.js brett/public/index.html
git commit -m "feat(brett): bootstrap config fetch + gate Mayhem button on availableModes"
```

---

## Task 5: Remove AI fill-bots from Mayhem

**Files:**
- Modify: `brett/public/assets/mayhem/mayhem.js` (3 ranges per spec)

- [ ] **Step 1: Remove fill-bot loop in `start()`**

In `brett/public/assets/mayhem/mayhem.js`, find the block at lines 218-220:

```js
    // Fill remaining slots with AI bots so there are always MAX_PLAYERS combatants
    const humanCount = remoteAvatars.size + 1; // +1 for local player
    for (let i = humanCount; i < MAX_PLAYERS; i++) spawnAIBot(i - humanCount);
```

Delete those 3 lines entirely (keep the blank line above the `// ── AI Bots ──` comment).

- [ ] **Step 2: Remove `spawnAIBot()` function**

Delete the entire `spawnAIBot(colorIndex)` function and the `// ── AI Bots ──` header comment block (lines 223-248 inclusive — function declaration through the closing `}`). The next block (`// ── Co-op wave spawning ──` at line 250) remains untouched.

- [ ] **Step 3: Remove bot-retire on `player_join`**

In the `case 'player_join':` handler (around line 538-545), delete only the bot-retire block:

```js
        // Retire one bot to make room for the real player
        if (aiBots.size > 0) {
          const [firstBotId] = aiBots.keys();
          const firstBot = aiBots.get(firstBotId);
          aiBots.delete(firstBotId);
          remoteAvatars.delete(firstBotId);
          firstBot.remove(scene);
        }
```

The mannequin-creation block below stays.

- [ ] **Step 4: Verify `spawnWave()` and `aiBots` Map are still used**

Run:

```bash
grep -n 'spawnAIBot\|aiBots' brett/public/assets/mayhem/mayhem.js
```

Expected: `spawnAIBot` returns ZERO matches; `aiBots` still appears in `spawnWave()` and its cleanup (those references must remain — co-op wave bots use the same Map).

- [ ] **Step 5: Run brett tests**

```bash
cd brett && npm test
```

Expected: All tests pass. `server-mayhem.test.js` should be unaffected (it tests room-state mutations, not client-side spawning).

- [ ] **Step 6: Add regression test — no fill-bots in a fresh Mayhem room**

Read `brett/test/server-mayhem.test.js` to find the existing pattern for spinning up a room and inspecting state. Append a test asserting that after enabling mayhem mode for a single player, the room snapshot contains zero `bot-` prefixed avatars (only the human player). Use the same imports and helper style as the surrounding tests.

If the existing tests work purely on `applyMutation`/`buildStateFromMutations` and don't touch the client-side spawn logic at all, skip this step — the manual smoke test in Step 7 is the verification.

- [ ] **Step 7: Manual smoke test**

```bash
cd brett && MOCK_DB=true BRETT_DEFAULT_MODE=mayhem npm start
```

Open `http://localhost:3000`, select Mayhem. Expected: only the local player avatar appears. No bots wandering around. Wave-based co-op bots only spawn when a wave is triggered (unchanged).

- [ ] **Step 8: Commit**

```bash
git add brett/public/assets/mayhem/mayhem.js brett/test/server-mayhem.test.js
git commit -m "fix(brett): remove AI fill-bots from Mayhem (co-op waves preserved)"
```

---

## Task 6: Base K8s manifest — add BRETT_DEFAULT_MODE env

**Files:**
- Modify: `k3d/brett.yaml` (env block around line 55-82)

- [ ] **Step 1: Add env var to brett container spec**

In `k3d/brett.yaml`, locate the brett Deployment's container `env:` block (starts ~line 55, contains `BRETT_KC_CLIENT_ID`, `BRETT_PUBLIC_URL`, etc.). Append a new entry — placement at end of the block is fine:

```yaml
            - name: BRETT_DEFAULT_MODE
              value: "coaching"
```

Match the indentation of the surrounding entries exactly (12 spaces before `-`).

- [ ] **Step 2: Validate manifest**

```bash
task workspace:validate
```

Expected: No errors (env var addition is a simple field append).

- [ ] **Step 3: Commit**

```bash
git add k3d/brett.yaml
git commit -m "feat(brett): add BRETT_DEFAULT_MODE=coaching to base manifest"
```

---

## Task 7: korczewski overlay — override to mayhem

**Files:**
- Modify: `prod-korczewski/kustomization.yaml` (append to existing brett patch block at line ~101)

- [ ] **Step 1: Append a new patch entry under `patches:`**

In `prod-korczewski/kustomization.yaml`, after the existing brett affinity patch (ends around line 113 with the `- pk-hetzner-8` line), add a new patch block:

```yaml
  # brett Deployment — flip default mode to mayhem on korczewski.
  # Base sets BRETT_DEFAULT_MODE=coaching; this overrides via JSON Patch
  # add-to-env-array. mentolder keeps the base default (coaching only).
  - target:
      kind: Deployment
      name: brett
    patch: |-
      - op: add
        path: /spec/template/spec/containers/0/env/-
        value:
          name: BRETT_DEFAULT_MODE
          value: mayhem
```

Note: this adds a SECOND `BRETT_DEFAULT_MODE` entry. The last one wins in Kubernetes env resolution, so the overlay value takes precedence. (Kustomize strategic-merge would dedupe by name, but JSON Patch on array elements does not — that's why we use `add` to `/env/-`, matching the spec.)

- [ ] **Step 2: Verify the rendered manifest**

```bash
kubectl kustomize prod-korczewski/ | grep -A1 "BRETT_DEFAULT_MODE"
```

Expected: TWO env entries — first `value: coaching` (from base), then `value: mayhem` (from overlay). The runtime container env will resolve to `mayhem` (last entry wins).

- [ ] **Step 3: Validate full workspace**

```bash
task workspace:validate
```

Expected: clean validation.

- [ ] **Step 4: Commit**

```bash
git add prod-korczewski/kustomization.yaml
git commit -m "feat(brett): korczewski sets BRETT_DEFAULT_MODE=mayhem via overlay"
```

---

## Task 8: PR + deploy + post-merge verification

- [ ] **Step 1: Push branch and open PR**

```bash
git push -u origin feature/brett-mode-separation
gh pr create --title "feat(brett): separate coaching from mayhem; remove fill-bots" \
  --body "$(cat <<'EOF'
## Summary
- Remove AI fill-bots from Mayhem (co-op wave-bots preserved)
- Add `GET /api/config` returning `{ defaultMode, availableModes }` from `BRETT_DEFAULT_MODE` env
- Mode-select auto-skips when only one mode is available; Mayhem card highlighted as default on korczewski
- Mayhem toolbar button removed from DOM when not in `availableModes`
- `BRETT_DEFAULT_MODE=coaching` in base; korczewski overlay overrides to `mayhem`

Spec: `docs/superpowers/specs/2026-05-24-brett-mode-separation-design.md`

## Test plan
- [ ] CI green (offline tests + manifest validation)
- [ ] mentolder: `https://brett.<mentolder-domain>` — no mode overlay, no Mayhem button
- [ ] korczewski: `https://brett.<korczewski-domain>` — mode overlay shows both cards, Mayhem highlighted; selecting Mayhem starts with only the local player (no bots)
EOF
)"
```

- [ ] **Step 2: Wait for CI, then squash-merge**

After CI green, squash-merge via GitHub UI (or `gh pr merge --squash`).

- [ ] **Step 3: Build + push brett image, roll out on both clusters**

```bash
task feature:brett
```

(This task builds `ghcr.io/paddione/brett:latest` and restarts the brett Deployment on both mentolder and korczewski.)

- [ ] **Step 4: Verify live — mentolder**

Open `https://brett.<mentolder-prod-domain>` in a browser. Expected:
- No mode-select overlay
- Toolbar has no `🤸 Mayhem` button
- `curl https://brett.<mentolder-prod-domain>/api/config` returns `{"defaultMode":"coaching","availableModes":["coaching"]}`

- [ ] **Step 5: Verify live — korczewski**

Open `https://brett.<korczewski-prod-domain>` in a browser. Expected:
- Mode-select overlay shows two cards
- Mayhem card has orange border + "Standard" badge
- Click Mayhem → game starts with only your avatar (no bots)
- `curl https://brett.<korczewski-prod-domain>/api/config` returns `{"defaultMode":"mayhem","availableModes":["coaching","mayhem"]}`

- [ ] **Step 6: Verify Flux reconciliation picked up the manifest change**

```bash
flux reconcile source git flux-system --context korczewski
flux reconcile kustomization workspace --context korczewski
kubectl --context korczewski -n workspace-korczewski get deploy brett -o jsonpath='{.spec.template.spec.containers[0].env[?(@.name=="BRETT_DEFAULT_MODE")].value}{"\n"}'
```

Expected: prints `coaching\nmayhem` (both entries, last one wins at runtime — pod env will resolve to `mayhem`).

- [ ] **Step 7: Invoke dev-flow-e2e if regression tests are desired**

The dev-flow-e2e skill can author Playwright specs hitting both `brett.<domain>` URLs and asserting the overlay presence/absence. Optional — manual verification above covers the acceptance criteria.

---

## Non-Goals (from spec)

- Restructuring the Mayhem scripts loading in `index.html` (all stay loaded, just unused in coaching)
- Removing `ai-bot.js` (still needed for co-op wave enemies)
- Admin override mechanism for Mayhem on mentolder
- Persisting mode choice across sessions
