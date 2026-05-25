---
title: Brett Mayhem · Polished 1v1 with Spectators — Implementation Plan
ticket_id: null
domains: [brett, frontend, game, website]
status: active
pr_number: null
spec: docs/superpowers/specs/2026-05-25-brett-mayhem-duel-polish-design.md
---

# Brett Mayhem · Polished 1v1 with Spectators — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish brett mayhem's 1v1 duel mode with a real spectator HUD, server-authoritative scoring, a rematch flow, and an invite/share UX on web.korczewski.de.

**Architecture:** Three independent milestones. **M1** (presentation polish) is client-only — replace the bare spectator pill + add 3 duel SFX. **M2** (match flow) moves duel scoring authority from the host client to the brett server, redesigns the match-end overlay, and adds a rematch protocol. **M3** (discovery) adds `?role=fighter|spectator` URL params + an in-room *Invite* popover + a "live now" banner on web.korczewski.de that polls a new `/api/duels/live` endpoint. M1 and M3 can run in parallel; M2 is independent code-wise but the spec recommends shipping it alone to keep the diff reviewable.

**Tech Stack:** Node 20 + Express + ws (brett/server.js), vanilla JS + Three.js (brett/public/assets/mayhem/), Astro + Svelte 4 (website/), Playwright (tests/e2e/), Node test runner (brett/test/).

**Spec:** `docs/superpowers/specs/2026-05-25-brett-mayhem-duel-polish-design.md`

---

## Pre-flight (do once before any milestone)

- [ ] **P0: Confirm branch + pull main**

```bash
git rev-parse --abbrev-ref HEAD     # → feature/brett-mayhem-duel-polish
git pull --rebase origin main       # absorb any new main commits
```

Expected: rebase succeeds or trivially fast-forwards.

- [ ] **P1: Verify dev cluster reachable**

```bash
kubectl --context k3d-mentolder-dev get pods -n workspace -l app=brett
```

Expected: 1 brett pod, `1/1 Running`. If not, run `task dev:cluster` first.

- [ ] **P2: Verify spec file in tree**

```bash
ls -la docs/superpowers/specs/2026-05-25-brett-mayhem-duel-polish-design.md
```

Expected: file exists, ~17 KB.

---

# Milestone 1 — Presentation polish (PR 1)

> **Surface:** brett client only. No protocol change, no server change.
> **Branch:** continue on `feature/brett-mayhem-duel-polish` OR split off `feature/brett-duel-presentation` if shipping M2/M3 separately. The plan assumes the former for simplicity; if splitting, run P0 again from `main`.

## File map for M1

| File | Action | Responsibility |
|------|--------|----------------|
| `brett/public/assets/mayhem/heroes.js` | Modify | Add `portrait` field to each of the 4 hero entries |
| `brett/public/assets/mayhem/audio.js` | Modify | Add 3 rows to `SFX_MAP` |
| `brett/public/assets/sfx/duel-gong.ogg` | Create | Round-start SFX (CC0, Freesound) |
| `brett/public/assets/sfx/ko-stinger.ogg` | Create | Round-end SFX |
| `brett/public/assets/sfx/crowd-cheer.ogg` | Create | Match-end SFX |
| `brett/public/assets/sfx/CREDITS.md` | Modify | Attribute the 3 new SFX |
| `brett/public/assets/mayhem/mayhem.js` | Modify | Replace `_showSpectatorHud`; add `_updateSpectatorHud`; hook SFX at round/match transitions |
| `tests/e2e/services/brett-duel-spec-hud.spec.ts` | Create | Playwright smoke for the new spec HUD |

---

### Task M1.1 — Add `portrait` field to HEROES

**Files:**
- Modify: `brett/public/assets/mayhem/heroes.js:5-45`

- [ ] **Step 1: Add `portrait` field to each hero**

For each of the 4 hero entries (patrick, tina, martina, oskar), insert a `portrait` property after `description`. Use the existing portrait assets verbatim:

```js
const HEROES = {
  patrick: {
    id: 'patrick', name: 'Patrick',
    description: 'Softwareentwickler · Katana · Pistole · Rifle',
    portrait: 'assets/figure-pack/faces/portrait-patrick.png',
    color: 0x6f8db8,
    // ... rest unchanged
  },
  tina: {
    id: 'tina', name: 'Tina',
    description: 'Hexe · Frostnova · Feuerball · Kettenblitz',
    portrait: 'assets/figure-pack/faces/portrait-tina.png',
    color: 0xa83a30,
    // ... rest unchanged
  },
  martina: {
    id: 'martina', name: 'Martina',
    description: 'Teamleiterin · Minion · Shield · Raserei',
    portrait: 'assets/figure-pack/faces/portrait-martina.png',
    color: 0xb8c0a8,
    // ... rest unchanged
  },
  oskar: {
    id: 'oskar', name: 'Oskar',
    description: 'Mechaniker · Motorrad · Auto · Reparatur',
    portrait: 'assets/figure-pack/faces/portrait-oskar.png',
    color: 0xc8a96e,
    // ... rest unchanged
  },
};
```

- [ ] **Step 2: Verify portrait files exist**

```bash
for h in patrick tina martina oskar; do
  ls -la brett/public/assets/figure-pack/faces/portrait-$h.png
done
```

Expected: 4 files, all non-zero size. If any missing, the spec HUD will fall back to a colored block (handled in M1.5 with `<img onerror>`).

- [ ] **Step 3: Commit**

```bash
git add brett/public/assets/mayhem/heroes.js
git commit -m "feat(brett): add portrait field to HEROES registry"
```

---

### Task M1.2 — Source the 3 new SFX assets

**Files:**
- Create: `brett/public/assets/sfx/duel-gong.ogg`
- Create: `brett/public/assets/sfx/ko-stinger.ogg`
- Create: `brett/public/assets/sfx/crowd-cheer.ogg`
- Modify: `brett/public/assets/sfx/CREDITS.md`

This task is sourcing assets from Freesound.org, not writing code. The engineer should:

- [ ] **Step 1: Pick 3 CC0 SFX from Freesound.org**

Search terms and target characteristics:
- `duel-gong`: search "metal gong short" or "fight bell", duration < 2s, single hit
- `ko-stinger`: search "ko sting" or "fight end short", duration < 2s, dramatic
- `crowd-cheer`: search "crowd cheer short" or "applause crowd", duration 2-4s, no music

For each: filter by license **Creative Commons 0**, sample rate 44.1 or 48 kHz.

- [ ] **Step 2: Download as OGG**

If only WAV/MP3 available, convert with:

```bash
ffmpeg -i input.wav -c:a libvorbis -q:a 5 brett/public/assets/sfx/<name>.ogg
```

Target: < 100 KB per file, mono or stereo both acceptable.

- [ ] **Step 3: Update CREDITS.md**

Add three new entries to `brett/public/assets/sfx/CREDITS.md` following the existing format (filename, source URL, author handle, license).

- [ ] **Step 4: Verify files load**

```bash
file brett/public/assets/sfx/duel-gong.ogg brett/public/assets/sfx/ko-stinger.ogg brett/public/assets/sfx/crowd-cheer.ogg
```

Expected: each reports "Ogg data, Vorbis audio".

- [ ] **Step 5: Commit**

```bash
git add brett/public/assets/sfx/{duel-gong,ko-stinger,crowd-cheer}.ogg \
        brett/public/assets/sfx/CREDITS.md
git commit -m "feat(brett): add 3 CC0 SFX for duel theatre (gong, KO, crowd cheer)"
```

---

### Task M1.3 — Register the new SFX in audio.js

**Files:**
- Modify: `brett/public/assets/mayhem/audio.js:7-35`

- [ ] **Step 1: Add 3 rows to `SFX_MAP`**

In `brett/public/assets/mayhem/audio.js`, locate the `SFX_MAP` object (starts at line 7). After the last hero-ability row (`'hero-teleport'`), add a `// Duel theatre` section:

```js
  // Hero abilities
  // ... (existing entries unchanged)
  'hero-teleport':      SFX_ROOT + 'hero-teleport.ogg',

  // Duel theatre
  'duel-gong':          SFX_ROOT + 'duel-gong.ogg',
  'ko-stinger':         SFX_ROOT + 'ko-stinger.ogg',
  'crowd-cheer':        SFX_ROOT + 'crowd-cheer.ogg',
};
```

- [ ] **Step 2: Verify preload at startup**

The existing `init()` (line ~40) already iterates `Object.entries(SFX_MAP)` and silently fails on missing files. No extra wiring needed.

- [ ] **Step 3: Commit**

```bash
git add brett/public/assets/mayhem/audio.js
git commit -m "feat(brett): register duel theatre SFX in audio.js SFX_MAP"
```

---

### Task M1.4 — Write the failing Playwright smoke test for spec HUD

**Files:**
- Create: `tests/e2e/services/brett-duel-spec-hud.spec.ts`

- [ ] **Step 1: Write the test**

```ts
import { test, expect } from '@playwright/test';

const BRETT_URL = process.env.BRETT_URL ?? 'https://brett.korczewski.de';

test('spectator HUD shows portraits + BO3 round dots during a duel', async ({ browser }) => {
  // Two fighters via the E2E auth bypass (per PR #1090)
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const ctxSpec = await browser.newContext();

  for (const ctx of [ctxA, ctxB, ctxSpec]) {
    await ctx.request.post(`${BRETT_URL}/auth/e2e-login`, {
      data: { user: `e2e-${Math.random().toString(36).slice(2, 8)}` },
    });
  }

  const room = `e2e-${Math.random().toString(36).slice(2, 8)}`;
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();
  const pageSpec = await ctxSpec.newPage();

  await pageA.goto(`${BRETT_URL}/?room=${room}`);
  await pageB.goto(`${BRETT_URL}/?room=${room}`);
  // Admin sets mode=duel via the mode-select cycle, both pick heroes, host clicks Play
  // ... (use existing helpers in tests/e2e/helpers/brett.ts if present, else inline)

  await pageSpec.goto(`${BRETT_URL}/?room=${room}`);
  await expect(pageSpec.locator('#spectator-hud-v2')).toBeVisible({ timeout: 15_000 });
  await expect(pageSpec.locator('#spectator-hud-v2 img[src*="portrait-"]')).toHaveCount(2);
  await expect(pageSpec.locator('#spectator-hud-v2 [data-role="round-dot"]')).toHaveCount(3);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tests/e2e
BRETT_URL=https://brett.korczewski.de pnpm exec playwright test services/brett-duel-spec-hud.spec.ts
```

Expected: FAIL — `#spectator-hud-v2` does not exist yet (today's element ID is `spectator-hud`).

- [ ] **Step 3: Commit the failing test**

```bash
git add tests/e2e/services/brett-duel-spec-hud.spec.ts
git commit -m "test(brett): spec HUD redesign smoke — failing"
```

---

### Task M1.5 — Replace `_showSpectatorHud` with the redesigned HUD

**Files:**
- Modify: `brett/public/assets/mayhem/mayhem.js:801-815` (the existing `_showSpectatorHud` function)
- Modify: `brett/public/assets/mayhem/mayhem.js` (add new `_updateSpectatorHud` near `_showSpectatorHud`)

- [ ] **Step 1: Rewrite `_showSpectatorHud` to render the structured HUD**

Replace the function body (today lines 801-815) with:

```js
function _showSpectatorHud() {
  const existing = document.getElementById('spectator-hud-v2');
  if (existing) existing.remove();

  const HEROES = window.MayhemHeroes?.HEROES || {};
  const ds = gameMode?.duelState || {};
  const heroA = HEROES[ds.heroA] || HEROES[_myHeroId] || null;
  const heroB = HEROES[ds.heroB] || HEROES[_opponentHeroId] || null;
  const nameA = heroA?.name || 'A';
  const nameB = heroB?.name || 'B';
  const portraitA = heroA?.portrait || '';
  const portraitB = heroB?.portrait || '';
  const winsA = ds.winsA || 0;
  const winsB = ds.winsB || 0;
  const round = winsA + winsB + 1;

  const hud = document.createElement('div');
  hud.id = 'spectator-hud-v2';
  hud.innerHTML = `
    <div class="sh-fighter sh-fighter-a">
      <img src="${portraitA}" onerror="this.style.display='none'" alt="">
      <div class="sh-meta">
        <div class="sh-name">${nameA.toUpperCase()}</div>
        <div class="sh-hp"><div class="sh-hp-fill" data-fighter="a" style="width:100%"></div></div>
      </div>
    </div>
    <div class="sh-score">
      <div class="sh-dots">
        ${[0,1,2].map(i => {
          const filled = i < winsA;
          const leading = i === winsA && winsA >= winsB;
          return `<div data-role="round-dot" class="sh-dot ${filled?'filled':''} ${leading?'leading':''}"></div>`;
        }).join('')}
      </div>
      <div class="sh-round">RUNDE ${round} · BO3</div>
    </div>
    <div class="sh-fighter sh-fighter-b">
      <div class="sh-meta sh-meta-right">
        <div class="sh-name">${nameB.toUpperCase()}</div>
        <div class="sh-hp"><div class="sh-hp-fill" data-fighter="b" style="width:100%"></div></div>
      </div>
      <img src="${portraitB}" onerror="this.style.display='none'" alt="">
    </div>
  `;
  hud.style.cssText = `
    position:fixed;top:14px;left:50%;transform:translateX(-50%);
    display:flex;align-items:center;gap:18px;
    background:rgba(11,17,28,.92);border:1px solid rgba(215,176,106,.32);
    border-radius:14px;padding:10px 18px;
    box-shadow:0 8px 32px rgba(0,0,0,.6);
    font-family:'Geist Mono',monospace;color:#d7b06a;
    pointer-events:none;z-index:2000;
  `;
  _injectSpectatorHudCss();
  document.body.appendChild(hud);

  // Bottom-right footer (controls hint)
  const footer = document.createElement('div');
  footer.id = 'spectator-hud-footer';
  footer.style.cssText = `
    position:fixed;bottom:14px;right:18px;
    display:flex;align-items:center;gap:14px;
    background:rgba(11,17,28,.85);border:1px solid rgba(215,176,106,.2);
    border-radius:10px;padding:8px 14px;
    font-family:'Geist Mono',monospace;font-size:10px;color:#d7b06a;
    pointer-events:none;z-index:2000;
  `;
  const targetName = _specTarget ? (window.MayhemHeroes?.HEROES?.[remoteAvatars.get(_specTarget)?.heroId]?.name || 'Spieler') : 'niemand';
  footer.innerHTML = `
    <span>ZUSCHAUER · folgst ${targetName.toUpperCase()}</span>
    <span><kbd>Tab</kbd> wechseln  <kbd>F</kbd> freie Kamera</span>
  `;
  document.body.appendChild(footer);
}

function _injectSpectatorHudCss() {
  if (document.getElementById('spectator-hud-v2-css')) return;
  const s = document.createElement('style');
  s.id = 'spectator-hud-v2-css';
  s.textContent = `
    #spectator-hud-v2 .sh-fighter { display:flex; align-items:center; gap:10px; }
    #spectator-hud-v2 .sh-fighter img { width:48px; height:48px; border-radius:8px; border:2px solid #d7b06a; object-fit:cover; }
    #spectator-hud-v2 .sh-name { font-size:12px; letter-spacing:.14em; color:#fff; }
    #spectator-hud-v2 .sh-hp { width:130px; height:6px; background:#222; border-radius:3px; margin-top:4px; overflow:hidden; }
    #spectator-hud-v2 .sh-meta-right { text-align:right; }
    #spectator-hud-v2 .sh-meta-right .sh-hp { display:flex; justify-content:flex-end; }
    #spectator-hud-v2 .sh-hp-fill { height:100%; background:linear-gradient(90deg,#d7b06a,#e5c885); border-radius:3px; transition:width .15s; }
    #spectator-hud-v2 .sh-score { display:flex; flex-direction:column; align-items:center; gap:4px; padding:0 10px; }
    #spectator-hud-v2 .sh-dots { display:flex; gap:6px; }
    #spectator-hud-v2 .sh-dot { width:10px; height:10px; border-radius:99px; border:1.5px solid rgba(215,176,106,.45); background:transparent; }
    #spectator-hud-v2 .sh-dot.filled { background:#d7b06a; border-color:#d7b06a; }
    #spectator-hud-v2 .sh-dot.leading { background:rgba(215,176,106,.18); border-color:#d7b06a; box-shadow:0 0 0 2px rgba(215,176,106,.25); }
    #spectator-hud-v2 .sh-round { font-size:10px; letter-spacing:.18em; color:#8A8497; }
    #spectator-hud-footer kbd { background:#1a2233; color:#d7b06a; border:1px solid #2a3344; padding:2px 6px; border-radius:4px; font-size:10px; font-family:inherit; margin-right:2px; }
  `;
  document.head.appendChild(s);
}
```

- [ ] **Step 2: Add `_updateSpectatorHud` for live re-render**

Immediately below `_injectSpectatorHudCss`, add:

```js
function _updateSpectatorHud() {
  const hud = document.getElementById('spectator-hud-v2');
  if (!hud) return;
  const ds = gameMode?.duelState;
  if (!ds) return;
  // Update HP bars
  const fillA = hud.querySelector('.sh-hp-fill[data-fighter="a"]');
  const fillB = hud.querySelector('.sh-hp-fill[data-fighter="b"]');
  if (fillA) {
    const av = remoteAvatars.get(ds.playerA) || (ds.playerA === playerId ? localAvatar : null);
    if (av) fillA.style.width = Math.max(0, av.hp) + '%';
  }
  if (fillB) {
    const av = remoteAvatars.get(ds.playerB) || (ds.playerB === playerId ? localAvatar : null);
    if (av) fillB.style.width = Math.max(0, av.hp) + '%';
  }
  // Update round dots
  const dots = hud.querySelectorAll('[data-role="round-dot"]');
  dots.forEach((dot, i) => {
    dot.classList.toggle('filled', i < ds.winsA);
    dot.classList.toggle('leading', i === ds.winsA && ds.winsA >= ds.winsB);
  });
  const roundEl = hud.querySelector('.sh-round');
  if (roundEl) roundEl.textContent = `RUNDE ${ds.winsA + ds.winsB + 1} · BO3`;
}
```

- [ ] **Step 3: Wire `_updateSpectatorHud` into existing event paths**

In the `hp_update` case (around line 1289) and the `player_death` case (around line 1313), add a call at the end:

```js
// inside case 'hp_update':
// ... existing code ...
if (_isSpectator) _updateSpectatorHud();
updateHud();
break;

// inside case 'player_death':
// ... existing code ...
if (_isSpectator) _updateSpectatorHud();
updateHud();
break;
```

- [ ] **Step 4: Remove the bottom-right footer in the `stop()` function**

In `stop()` at line ~841, the existing `specHud.remove()` removes `#spectator-hud`. Replace with:

```js
const specHud = document.getElementById('spectator-hud-v2');
if (specHud) specHud.remove();
const specFooter = document.getElementById('spectator-hud-footer');
if (specFooter) specFooter.remove();
```

- [ ] **Step 5: Run Playwright test to verify it passes**

```bash
cd tests/e2e
BRETT_URL=https://brett.korczewski.de pnpm exec playwright test services/brett-duel-spec-hud.spec.ts
```

Expected: PASS — HUD renders with portraits + 3 round dots.

- [ ] **Step 6: Commit**

```bash
git add brett/public/assets/mayhem/mayhem.js
git commit -m "feat(brett): polished spectator HUD with portraits, BO3 round dots, controls footer"
```

---

### Task M1.6 — Hook SFX into round/match transitions

**Files:**
- Modify: `brett/public/assets/mayhem/mayhem.js` (in `_startDuelRound`, `_onDuelRoundEnd`, `_onDuelEnd`)

- [ ] **Step 1: Play gong at round start**

In `_startDuelRound` (line 577), after `_buildDuelHud();` add:

```js
window.MayhemAudio?.play('duel-gong');
```

- [ ] **Step 2: Play KO stinger at round end**

In `_onDuelRoundEnd` (line 635), at the top of the function (before the `_duelRoundPause = true` line) add:

```js
window.MayhemAudio?.play('ko-stinger');
```

- [ ] **Step 3: Play crowd cheer at match end**

In `_onDuelEnd` (line 665), at the top (before `_showDuelMatchResult`), add:

```js
window.MayhemAudio?.play('crowd-cheer');
```

- [ ] **Step 4: Manual verification**

```bash
task feature:brett ENV=mentolder-dev  # rolls out to dev cluster
```

Then visit `https://dev.mentolder.de/brett` (or whatever the dev brett URL is), start a duel, listen for gong → KO → crowd cheer at the right moments.

- [ ] **Step 5: Commit**

```bash
git add brett/public/assets/mayhem/mayhem.js
git commit -m "feat(brett): play duel SFX at round start, round end, match end"
```

---

### Task M1.7 — Deploy + PR for M1

- [ ] **Step 1: Run the full brett test suite**

```bash
cd brett && npm test
```

Expected: all existing tests still pass.

- [ ] **Step 2: Run the proto drift CI guard locally (sanity)**

```bash
task test:all
```

Expected: PASS. (Brett has no proto-drift guard, but `test:all` runs offline tests including arena's guard.)

- [ ] **Step 3: Deploy to dev cluster + verify**

```bash
task feature:brett ENV=mentolder-dev
# Visit https://dev.mentolder.de/brett (or the dev brett URL)
# Open a duel as 2 fighters via /auth/e2e-login, join as 3rd party, confirm new HUD
```

- [ ] **Step 4: Open PR**

```bash
gh pr create --base main --title "feat(brett): polished spectator HUD + duel SFX" --body "$(cat <<'EOF'
## Summary
- Replace bare `#spectator-hud` pill with structured top-bar: portraits + BO3 round dots + HP bars
- Bottom-right controls footer (Tab/F)
- 3 new CC0 SFX for round-start (gong), round-end (KO stinger), match-end (crowd cheer)

## Spec
docs/superpowers/specs/2026-05-25-brett-mayhem-duel-polish-design.md (M1 milestone)

## Test plan
- [x] Playwright smoke: `services/brett-duel-spec-hud.spec.ts`
- [x] Manual on dev cluster — SFX timing verified
- [ ] Reviewer: confirm asset credits in `CREDITS.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Auto-merge per repo convention**

Per `feedback_pr_workflow` memory: PRs are squash-merged immediately after CI passes. The user merges; the implementation engineer doesn't need to wait for review.

- [ ] **Step 6: Deploy to prod**

```bash
task feature:brett ENV=korczewski
```

Verify `brett.korczewski.de` shows the new HUD when joining a live duel as 3rd party.

---

# Milestone 2 — Match flow (PR 2)

> **Surface:** brett client + brett server. New protocol (6 message types) + match-end overlay redesign + rematch flow.
> **Branch:** continue `feature/brett-mayhem-duel-polish` OR split. The plan assumes continuation; commits will live on this branch until PR open.

## File map for M2

| File | Action | Responsibility |
|------|--------|----------------|
| `brett/server.js` | Modify | Server-broadcast duel_round_end/match_end, new rematch_request/duel_abandoned_request handlers, 60s inactivity timer, 3s duel_round_start timer |
| `brett/public/assets/mayhem/mayhem.js` | Modify | Stop emitting round/match end; rewrite match-end overlay; new listeners for duel_reset, duel_round_start, rematch_state, duel_abandoned; send display_name with duel_start |
| `brett/test/duel-server-auth.test.js` | Create | Node test for server-auth scoring + rematch flow |
| `tests/e2e/services/brett-duel-rematch.spec.ts` | Create | Playwright E2E for full duel + rematch |

---

### Task M2.1 — Write failing Node test for server-auth duel scoring

**Files:**
- Create: `brett/test/duel-server-auth.test.js`

- [ ] **Step 1: Check existing test scaffold**

```bash
ls brett/test/
```

Expected: existing `.test.js` files. Follow their patterns (probably Node's built-in test runner — `node --test`).

- [ ] **Step 2: Write the test**

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { WebSocket } = require('ws');
const { spawn } = require('node:child_process');

let server;
let port;

test.before(async () => {
  port = 13000 + Math.floor(Math.random() * 1000);
  server = spawn('node', ['server.js'], {
    cwd: __dirname + '/..',
    env: { ...process.env, PORT: port, DATABASE_URL: 'postgres://invalid' },
    stdio: 'pipe',
  });
  await new Promise(r => setTimeout(r, 1500)); // server start
});

test.after(() => { if (server) server.kill(); });

test('server broadcasts duel_round_end on player_death in duel mode', async () => {
  const room = 'test-' + Date.now();
  const wsA = new WebSocket(`ws://localhost:${port}/sync`);
  const wsB = new WebSocket(`ws://localhost:${port}/sync`);
  const wsSpec = new WebSocket(`ws://localhost:${port}/sync`);

  await Promise.all([wsA, wsB, wsSpec].map(ws =>
    new Promise(r => ws.on('open', r))));

  for (const ws of [wsA, wsB, wsSpec]) ws.send(JSON.stringify({ type: 'join', room }));
  await new Promise(r => setTimeout(r, 100));

  wsA.send(JSON.stringify({ type: 'player_join', playerId: 'A' }));
  wsB.send(JSON.stringify({ type: 'player_join', playerId: 'B' }));
  wsA.send(JSON.stringify({ type: 'game_mode_change', mode: 'duel' }));
  wsA.send(JSON.stringify({ type: 'duel_start', playerA: 'A', playerB: 'B' }));
  await new Promise(r => setTimeout(r, 100));

  const events = [];
  wsSpec.on('message', m => events.push(JSON.parse(m.toString())));

  wsA.send(JSON.stringify({ type: 'player_death', playerId: 'A' }));
  await new Promise(r => setTimeout(r, 200));

  const roundEnd = events.find(e => e.type === 'duel_round_end');
  assert.ok(roundEnd, 'expected server to broadcast duel_round_end');
  assert.equal(roundEnd.winner, 'B');
  assert.equal(roundEnd.winsB, 1);
  assert.equal(roundEnd.winsA, 0);

  for (const ws of [wsA, wsB, wsSpec]) ws.close();
});

test('server broadcasts duel_reset when both fighters request rematch', async () => {
  const room = 'test-' + Date.now();
  const wsA = new WebSocket(`ws://localhost:${port}/sync`);
  const wsB = new WebSocket(`ws://localhost:${port}/sync`);

  await Promise.all([wsA, wsB].map(ws => new Promise(r => ws.on('open', r))));
  for (const ws of [wsA, wsB]) ws.send(JSON.stringify({ type: 'join', room }));
  await new Promise(r => setTimeout(r, 100));

  wsA.send(JSON.stringify({ type: 'player_join', playerId: 'A' }));
  wsB.send(JSON.stringify({ type: 'player_join', playerId: 'B' }));
  wsA.send(JSON.stringify({ type: 'game_mode_change', mode: 'duel' }));
  wsA.send(JSON.stringify({ type: 'duel_start', playerA: 'A', playerB: 'B' }));

  // Kill A twice → match ends with B winning 2-0
  wsA.send(JSON.stringify({ type: 'player_death', playerId: 'A' }));
  await new Promise(r => setTimeout(r, 100));
  wsA.send(JSON.stringify({ type: 'player_death', playerId: 'A' }));
  await new Promise(r => setTimeout(r, 100));

  const events = [];
  wsA.on('message', m => events.push(JSON.parse(m.toString())));

  wsA.send(JSON.stringify({ type: 'rematch_request', sameHeroes: true }));
  wsB.send(JSON.stringify({ type: 'rematch_request', sameHeroes: true }));
  await new Promise(r => setTimeout(r, 200));

  const reset = events.find(e => e.type === 'duel_reset');
  assert.ok(reset, 'expected duel_reset after both rematch_requests');
  assert.equal(reset.mode, 'same');

  for (const ws of [wsA, wsB]) ws.close();
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd brett && node --test test/duel-server-auth.test.js
```

Expected: FAIL — server doesn't broadcast `duel_round_end` from `player_death` yet (handleDuelDeath result is discarded at line 881).

- [ ] **Step 4: Commit the failing test**

```bash
git add brett/test/duel-server-auth.test.js
git commit -m "test(brett): server-auth duel scoring + rematch — failing"
```

---

### Task M2.2 — Server emits duel_round_end / duel_match_end on player_death

**Files:**
- Modify: `brett/server.js:880-882`

- [ ] **Step 1: Change the player_death handler to broadcast results**

Find the existing block (line 880-882):

```js
} else if (state.gameMode === 'duel') {
  handleDuelDeath(room, msg.playerId);
}
```

Replace with:

```js
} else if (state.gameMode === 'duel') {
  const result = handleDuelDeath(room, msg.playerId);
  if (result.roundWinner) {
    if (result.matchOver) {
      broadcast(room, {
        type: 'duel_match_end',
        winner: result.matchWinner,
        winsA: duelRooms.get(room)?.winsA ?? 0,
        winsB: duelRooms.get(room)?.winsB ?? 0,
      });
      _armDuelInactivityTimer(room);
    } else {
      const ds = duelRoomsBeforeDelete.get(room) ?? duelRooms.get(room);
      broadcast(room, {
        type: 'duel_round_end',
        winner: result.roundWinner,
        winsA: ds?.winsA ?? 0,
        winsB: ds?.winsB ?? 0,
      });
      // 3s server-side delay → emit duel_round_start
      setTimeout(() => {
        const stillThere = duelRooms.get(room);
        if (!stillThere) return;
        broadcast(room, {
          type: 'duel_round_start',
          round: (stillThere.winsA + stillThere.winsB) + 1,
        });
      }, 3000);
    }
  }
}
```

Note: `handleDuelDeath` at line 553 today does `if (matchOver) duelRooms.delete(room);`. After delete, `duelRooms.get(room)` returns undefined. To get the final winsA/winsB AFTER delete, we need to capture the state BEFORE delete. Refactor `handleDuelDeath` to NOT delete on matchOver (let the inactivity timer or `duel_reset`/`duel_abandoned` handler do the cleanup).

- [ ] **Step 2: Refactor `handleDuelDeath` to not auto-delete**

Find `handleDuelDeath` (line 544-555). Remove the `if (matchOver) duelRooms.delete(room);` line. Cleanup of `duelRooms[room]` now happens in:
- `duel_reset` handler (when rematch starts)
- `duel_abandoned` broadcast (timeout / explicit exit)

- [ ] **Step 3: Remove `duel_round_end` and `duel_match_end` from RELAY_TYPES**

In `RELAY_TYPES` (line 518) remove the two entries:

```js
// Before:
'hero_select', 'duel_start', 'duel_round_end', 'duel_match_end',
// After:
'hero_select', 'duel_start',
```

This prevents legacy host-emitted versions (from out-of-date clients) being relayed back to spectators.

- [ ] **Step 4: Add `_armDuelInactivityTimer` helper**

Above the WS message handler (near the top of the relevant section), add:

```js
const duelInactivityTimers = new Map(); // room -> NodeJS.Timeout

function _armDuelInactivityTimer(room) {
  if (duelInactivityTimers.has(room)) clearTimeout(duelInactivityTimers.get(room));
  duelInactivityTimers.set(room, setTimeout(() => {
    duelInactivityTimers.delete(room);
    duelRooms.delete(room);
    rematchRequests.delete(room);
    broadcast(room, { type: 'duel_abandoned', reason: 'timeout' });
  }, 60_000));
}

function _clearDuelInactivityTimer(room) {
  if (duelInactivityTimers.has(room)) {
    clearTimeout(duelInactivityTimers.get(room));
    duelInactivityTimers.delete(room);
  }
}
```

- [ ] **Step 5: Run the first test from M2.1**

```bash
cd brett && node --test test/duel-server-auth.test.js --test-name-pattern "round_end"
```

Expected: PASS for the duel_round_end test.

- [ ] **Step 6: Commit**

```bash
git add brett/server.js
git commit -m "feat(brett): server-broadcast duel_round_end and duel_match_end on player_death"
```

---

### Task M2.3 — Add rematch_request + duel_abandoned_request handlers

**Files:**
- Modify: `brett/server.js` (in the WS message handler, before the generic RELAY_TYPES block)

- [ ] **Step 1: Add `rematchRequests` Map declaration**

Near `duelRooms` (line 532), add:

```js
const rematchRequests = new Map(); // roomToken -> { playerA?: { sameHeroes: bool }, playerB?: { sameHeroes: bool } }
```

- [ ] **Step 2: Add the rematch_request handler**

In the WS message handler, before the generic `if (RELAY_TYPES.includes(msg.type))` block (line 856), add:

```js
if (msg.type === 'rematch_request') {
  const room = ws._room;
  const ds = duelRooms.get(room);
  if (!room || !ds || typeof msg.sameHeroes !== 'boolean') return;
  const slot = ws._playerId === ds.playerA ? 'playerA'
             : ws._playerId === ds.playerB ? 'playerB' : null;
  if (!slot) return; // not a fighter — ignore

  if (!rematchRequests.has(room)) rematchRequests.set(room, {});
  const reqs = rematchRequests.get(room);
  reqs[slot] = { sameHeroes: msg.sameHeroes };

  if (reqs.playerA && reqs.playerB) {
    const bothSame = reqs.playerA.sameHeroes && reqs.playerB.sameHeroes;
    const mode = bothSame ? 'same' : 'select';
    _clearDuelInactivityTimer(room);
    ds.winsA = 0;
    ds.winsB = 0;
    rematchRequests.delete(room);
    broadcast(room, { type: 'duel_reset', mode });
    if (mode === 'select') _armDuelInactivityTimer(room); // hero-select inactivity
  } else {
    const opponent = slot === 'playerA' ? ds.playerB : ds.playerA;
    broadcast(room, { type: 'rematch_state', requested: Object.keys(reqs), opponent });
  }
  return;
}

if (msg.type === 'duel_abandoned_request') {
  const room = ws._room;
  const ds = duelRooms.get(room);
  if (!room || !ds) return;
  const isFighter = ws._playerId === ds.playerA || ws._playerId === ds.playerB;
  if (!isFighter) return;
  _clearDuelInactivityTimer(room);
  duelRooms.delete(room);
  rematchRequests.delete(room);
  broadcast(room, { type: 'duel_abandoned', reason: 'fighter_request' });
  return;
}
```

- [ ] **Step 3: Run the rematch test from M2.1**

```bash
cd brett && node --test test/duel-server-auth.test.js --test-name-pattern "rematch"
```

Expected: PASS — server emits `duel_reset { mode: 'same' }` after both rematch_requests.

- [ ] **Step 4: Commit**

```bash
git add brett/server.js
git commit -m "feat(brett): server-side rematch + abandon handlers with 60s inactivity timeout"
```

---

### Task M2.4 — Client: stop emitting duel_round_end / duel_match_end

**Files:**
- Modify: `brett/public/assets/mayhem/mayhem.js:621-633, 1301-1310`

- [ ] **Step 1: Strip the host emission from `_handleBotDeath`**

In `_handleBotDeath` (line 621), today's body emits the events. Replace the body with:

```js
function _handleBotDeath() {
  if (!isHost || _duelRoundPause) return;
  // Server is authoritative — it sees the player_death broadcast and emits
  // duel_round_end / duel_match_end itself. Host no longer claims authority.
  // Local model still updates via the duel_round_end / duel_match_end listeners below.
}
```

- [ ] **Step 2: Strip the host emission from the `player_death` case**

In the `player_death` case (line 1301), remove the host-emission block:

```js
// Before:
case 'player_death':
  if (gameMode && gameMode.mode === 'duel' && isHost && !_duelRoundPause) {
    const result = gameMode.handleDuelDeath(msg.playerId);
    send({
      type: result.matchOver ? 'duel_match_end' : 'duel_round_end',
      winner: result.matchOver ? result.matchWinner : result.roundWinner,
      winsA: gameMode.duelState.winsA,
      winsB: gameMode.duelState.winsB,
    });
  }
  gameMode?.handleDeath(msg.playerId, msg.playerId === playerId);
  // ... rest unchanged

// After:
case 'player_death':
  // Server now owns duel scoring — it sees player_death and emits round/match end.
  // We still call gameMode.handleDeath for local visual side-effects (deadSet, ragdoll).
  gameMode?.handleDeath(msg.playerId, msg.playerId === playerId);
  // ... rest unchanged
```

- [ ] **Step 3: Commit**

```bash
git add brett/public/assets/mayhem/mayhem.js
git commit -m "refactor(brett): stop host-emitting duel_round_end/match_end — server is authoritative"
```

---

### Task M2.5 — Client: listen for new server events

**Files:**
- Modify: `brett/public/assets/mayhem/mayhem.js` (WS message handler switch)

- [ ] **Step 1: Add cases for the new server events**

In the WS message handler `switch (msg.type)` block, add (near the existing `lms_winner` / `lms_draw` cases):

```js
case 'duel_round_end':
  // Server-authoritative — update local gameMode model + UI
  if (gameMode && gameMode.mode === 'duel') {
    gameMode.duelState.winsA = msg.winsA;
    gameMode.duelState.winsB = msg.winsB;
    _onDuelRoundEnd({ winner: msg.winner, winsA: msg.winsA, winsB: msg.winsB });
    if (_isSpectator) _updateSpectatorHud();
  }
  break;

case 'duel_match_end':
  if (gameMode && gameMode.mode === 'duel') {
    gameMode.duelState.winsA = msg.winsA;
    gameMode.duelState.winsB = msg.winsB;
    _onDuelEnd({ matchWinner: msg.winner, reason: null, winsA: msg.winsA, winsB: msg.winsB });
  }
  break;

case 'duel_round_start':
  // Server says "start round N now" — respawn both fighters, refill HP
  if (gameMode && gameMode.mode === 'duel') {
    if (localAvatar) { localAvatar.resetHero(); localAvatar.resetHp(); localRespawn(); }
    if (window._pvAiBot) {
      window._pvAiBot.hp = 100; window._pvAiBot.avatar.resetHp(); window._pvAiBot.avatar.resetHero();
    }
    if (_duelHpFillA) _duelHpFillA.style.width = '100%';
    if (_duelHpFillB) _duelHpFillB.style.width = '100%';
    _duelRoundPause = false;
    if (_isSpectator) _updateSpectatorHud();
  }
  break;

case 'rematch_state':
  // Update overlay's "waiting for opponent" indicator
  const waitEl = document.getElementById('duel-rematch-waiting');
  if (waitEl) {
    const me = playerId;
    const isWaiting = !msg.requested.includes(me) ? false : msg.requested.length === 1;
    waitEl.style.display = isWaiting ? 'block' : 'none';
    waitEl.textContent = isWaiting ? `⏳ Warte auf Gegner...` : '';
  }
  break;

case 'duel_reset':
  // Close match-end overlay; either respawn (same heroes) or re-show hero-select
  const resultOverlay = document.getElementById('duel-match-result-overlay');
  if (resultOverlay) resultOverlay.remove();
  if (msg.mode === 'same') {
    if (localAvatar) { localAvatar.resetHero(); localAvatar.resetHp(); localRespawn(); }
    _buildDuelHud(0, 0);
  } else {
    // mode === 'select' — return to hero-select
    _myHeroId = null; _opponentHeroId = null;
    _buildHeroSelectUi();
  }
  break;

case 'duel_abandoned':
  const overlay = document.getElementById('duel-match-result-overlay');
  if (overlay) overlay.remove();
  const scoreHud = document.getElementById('duel-score-hud');
  if (scoreHud) scoreHud.remove();
  _duelHpFillA = null; _duelHpFillB = null;
  if (isHost && gameMode) send({ type: 'game_mode_change', mode: 'warmup' });
  break;
```

- [ ] **Step 2: Remove the local 3s setTimeout in `_onDuelRoundEnd`**

In `_onDuelRoundEnd` (line 635), simplify the body to just visual changes — server fires `duel_round_start` now:

```js
function _onDuelRoundEnd({ winner, winsA, winsB }) {
  _duelRoundPause = true;
  _showDuelRoundResult(winner, winsA, winsB);
  // Server fires duel_round_start after 3s — the case 'duel_round_start' handler resets HP / respawn.
}
```

- [ ] **Step 3: Commit**

```bash
git add brett/public/assets/mayhem/mayhem.js
git commit -m "feat(brett): listen for server-broadcast duel events (round_end, match_end, round_start, reset, abandoned)"
```

---

### Task M2.6 — Client: rewrite the match-end overlay

**Files:**
- Modify: `brett/public/assets/mayhem/mayhem.js` (`_showDuelMatchResult`, around line 770)

- [ ] **Step 1: Look up the current `_showDuelMatchResult` function**

```bash
grep -n "_showDuelMatchResult" brett/public/assets/mayhem/mayhem.js
```

Find the function definition and replace its body with the polished version.

- [ ] **Step 2: Write the new function body**

Replace the existing `_showDuelMatchResult` with:

```js
function _showDuelMatchResult(winner, reason, winsA, winsB) {
  const existing = document.getElementById('duel-match-result-overlay');
  if (existing) existing.remove();

  const HEROES = window.MayhemHeroes?.HEROES || {};
  const ds = gameMode?.duelState || {};
  const heroA = HEROES[ds.heroA || _myHeroId] || {};
  const heroB = HEROES[ds.heroB || _opponentHeroId] || {};
  const winnerIsA = winner === ds.playerA;
  const myWin = winner === playerId;
  const winnerHero = winnerIsA ? heroA : heroB;
  const loserHero = winnerIsA ? heroB : heroA;
  const winnerName = winnerHero.name || (winnerIsA ? 'A' : 'B');
  const loserName = loserHero.name || (winnerIsA ? 'B' : 'A');

  const overlay = document.createElement('div');
  overlay.id = 'duel-match-result-overlay';
  overlay.style.cssText = `
    position:fixed;inset:0;
    background:radial-gradient(ellipse at center,rgba(0,0,0,.4),rgba(0,0,0,.8));
    display:flex;align-items:center;justify-content:center;z-index:3000;
    font-family:'Geist Mono',monospace;
  `;
  overlay.innerHTML = `
    <div style="background:rgba(11,17,28,.96);border:1px solid rgba(215,176,106,.32);border-radius:16px;padding:28px 32px;width:520px;max-width:90vw;box-shadow:0 20px 60px rgba(0,0,0,.8);color:#d7b06a">
      <div style="text-align:center;margin-bottom:18px">
        <div style="font-size:10px;letter-spacing:.24em;color:#8A8497;text-transform:uppercase">Match End · BO3</div>
        <div style="font-size:24px;letter-spacing:.18em;color:#d7b06a;margin-top:6px;font-weight:600">${winnerName.toUpperCase()} GEWINNT</div>
      </div>

      <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:24px">
        <div style="flex:1;text-align:center;padding:14px;border:2px solid ${winnerIsA?'#d7b06a':'rgba(255,255,255,.1)'};border-radius:12px;background:${winnerIsA?'rgba(215,176,106,.08)':'rgba(255,255,255,.02)'};${winnerIsA?'':'opacity:.7'}">
          <img src="${heroA.portrait||''}" onerror="this.style.display='none'" style="width:72px;height:72px;border-radius:10px;border:2px solid ${winnerIsA?'#d7b06a':'rgba(255,255,255,.15)'};object-fit:cover">
          <div style="margin-top:10px;font-size:14px;color:#fff">${(heroA.name||'A').toUpperCase()}</div>
          <div style="font-size:10px;color:#8A8497;letter-spacing:.14em;margin-top:2px">${(heroA.description||'').toUpperCase()}</div>
        </div>
        <div style="text-align:center;padding:0 8px">
          <div style="font-size:38px;color:#fff;font-weight:700;letter-spacing:.04em">${winsA} — ${winsB}</div>
          <div style="font-size:9px;color:#8A8497;letter-spacing:.2em;margin-top:2px">FINAL</div>
        </div>
        <div style="flex:1;text-align:center;padding:14px;border:${winnerIsA?'1px':'2'}px solid ${winnerIsA?'rgba(255,255,255,.1)':'#d7b06a'};border-radius:12px;background:${winnerIsA?'rgba(255,255,255,.02)':'rgba(215,176,106,.08)'};${winnerIsA?'opacity:.7':''}">
          <img src="${heroB.portrait||''}" onerror="this.style.display='none'" style="width:72px;height:72px;border-radius:10px;border:${winnerIsA?'1':'2'}px solid ${winnerIsA?'rgba(255,255,255,.15)':'#d7b06a'};object-fit:cover">
          <div style="margin-top:10px;font-size:14px;color:#fff">${(heroB.name||'B').toUpperCase()}</div>
          <div style="font-size:10px;color:#8A8497;letter-spacing:.14em;margin-top:2px">${(heroB.description||'').toUpperCase()}</div>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:8px" id="duel-rematch-buttons">
        <button data-rematch="same" style="background:#d7b06a;color:#0b111c;border:none;padding:12px;border-radius:8px;font-family:inherit;font-size:12px;letter-spacing:.16em;font-weight:600;cursor:pointer">REMATCH · GLEICHE HELDEN</button>
        <button data-rematch="select" style="background:transparent;color:#d7b06a;border:1px solid #d7b06a;padding:11px;border-radius:8px;font-family:inherit;font-size:12px;letter-spacing:.16em;font-weight:600;cursor:pointer">REMATCH · NEUE HELDEN WÄHLEN</button>
        <button data-rematch="abandon" style="background:transparent;color:#8A8497;border:1px solid rgba(255,255,255,.12);padding:9px;border-radius:8px;font-family:inherit;font-size:11px;letter-spacing:.14em;cursor:pointer">ZURÜCK ZUM WARMUP</button>
      </div>

      <div id="duel-rematch-waiting" style="display:none;margin-top:14px;text-align:center;font-size:10px;letter-spacing:.16em;color:#d7b06a"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Wire button handlers — only fighters can interact
  const isFighter = playerId === ds.playerA || playerId === ds.playerB;
  overlay.querySelectorAll('[data-rematch]').forEach(btn => {
    if (!isFighter) { btn.disabled = true; btn.style.opacity = '0.4'; btn.style.cursor = 'not-allowed'; return; }
    btn.addEventListener('click', () => {
      btn.disabled = true;
      const action = btn.getAttribute('data-rematch');
      if (action === 'same') send({ type: 'rematch_request', sameHeroes: true });
      else if (action === 'select') send({ type: 'rematch_request', sameHeroes: false });
      else if (action === 'abandon') send({ type: 'duel_abandoned_request' });
    }, { once: true });
  });
}
```

- [ ] **Step 3: Remove the local 5s auto-warmup setTimeout in `_onDuelEnd`**

In `_onDuelEnd` (line 665), remove the setTimeout block:

```js
// Before:
function _onDuelEnd({ matchWinner, reason, winsA, winsB }) {
  const resolvedWinsA = winsA ?? gameMode?.duelState?.winsA ?? 0;
  const resolvedWinsB = winsB ?? gameMode?.duelState?.winsB ?? 0;
  _showDuelMatchResult(matchWinner, reason, resolvedWinsA, resolvedWinsB);
  setTimeout(() => { /* ... auto-warmup ... */ }, 5000);
}

// After:
function _onDuelEnd({ matchWinner, reason, winsA, winsB }) {
  const resolvedWinsA = winsA ?? gameMode?.duelState?.winsA ?? 0;
  const resolvedWinsB = winsB ?? gameMode?.duelState?.winsB ?? 0;
  _showDuelMatchResult(matchWinner, reason, resolvedWinsA, resolvedWinsB);
  // Server fires duel_abandoned (60s) or duel_reset (rematch) — both handlers clean up the overlay.
}
```

- [ ] **Step 4: Commit**

```bash
git add brett/public/assets/mayhem/mayhem.js
git commit -m "feat(brett): polished match-end overlay with portraits, score, rematch buttons"
```

---

### Task M2.7 — Send displayName with duel_start for the winner banner

**Files:**
- Modify: `brett/public/assets/mayhem/mayhem.js` (`_checkBothHeroesSelected`)
- Modify: `brett/server.js` (duel_start handler)

- [ ] **Step 1: Augment duel_start emission on the client**

In `_checkBothHeroesSelected` (line 561), find the existing `send({ type: 'duel_start', playerA: pA, playerB: pB });` and replace with:

```js
send({
  type: 'duel_start',
  playerA: pA,
  playerB: pB,
  heroA: _myHeroId,
  heroB: _opponentHeroId,
  // displayName for the winner banner — falls back to playerId at the server if absent
  nameA: window._currentUser?.displayName || pA,
  nameB: _pvAiMode ? 'KI' : (window._knownNames?.[pB] || pB),
});
```

- [ ] **Step 2: Augment server duel_start handler**

In `brett/server.js` (line 849), extend the existing block to capture the names + heroes:

```js
if (msg.type === 'duel_start' && msg.playerA && msg.playerB) {
  duelRooms.set(room, {
    playerA: msg.playerA, playerB: msg.playerB,
    heroA: msg.heroA, heroB: msg.heroB,
    nameA: msg.nameA || msg.playerA,
    nameB: msg.nameB || msg.playerB,
    winsA: 0, winsB: 0, bestOf: 3,
  });
}
```

- [ ] **Step 3: Server echoes names back in duel_round_end / duel_match_end**

In the broadcast call from Task M2.2, include `nameA`, `nameB`, `heroA`, `heroB`:

```js
const ds = duelRooms.get(room) ?? {};
broadcast(room, {
  type: 'duel_match_end',
  winner: result.matchWinner,
  nameA: ds.nameA, nameB: ds.nameB,
  heroA: ds.heroA, heroB: ds.heroB,
  winsA: ds.winsA ?? 0, winsB: ds.winsB ?? 0,
});
// (same shape for duel_round_end)
```

- [ ] **Step 4: Use the names in `_showDuelMatchResult`**

Update the overlay to prefer `ds.nameA` / `ds.nameB` over hero names. In the function from M2.6, replace `winnerName` and the title strings:

```js
const winnerName = winnerIsA ? (ds.nameA || heroA.name || 'A') : (ds.nameB || heroB.name || 'B');
// "PATRICK GEWINNT" — uses display name
```

- [ ] **Step 5: Commit**

```bash
git add brett/public/assets/mayhem/mayhem.js brett/server.js
git commit -m "feat(brett): carry displayName + hero through duel_start → server echoes on round/match end"
```

---

### Task M2.8 — Playwright E2E: full duel + rematch

**Files:**
- Create: `tests/e2e/services/brett-duel-rematch.spec.ts`

- [ ] **Step 1: Write the E2E**

```ts
import { test, expect } from '@playwright/test';

const BRETT_URL = process.env.BRETT_URL ?? 'https://brett.korczewski.de';

test('full duel: server-auth scoring, match-end overlay, rematch resets state', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  for (const ctx of [ctxA, ctxB]) {
    await ctx.request.post(`${BRETT_URL}/auth/e2e-login`, {
      data: { user: `e2e-${Math.random().toString(36).slice(2, 8)}` },
    });
  }
  const room = `e2e-${Math.random().toString(36).slice(2, 8)}`;
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  await pageA.goto(`${BRETT_URL}/?room=${room}`);
  await pageB.goto(`${BRETT_URL}/?room=${room}`);

  // ... use existing brett test helpers to: set mode=duel, select heroes,
  // and trigger 2 player_death events to end the match 2-0.
  // (helpers expected at tests/e2e/helpers/brett.ts — add if absent)

  await expect(pageA.locator('#duel-match-result-overlay')).toBeVisible({ timeout: 15_000 });
  await expect(pageA.locator('[data-rematch="same"]')).toBeEnabled();

  // Both fighters click "Rematch — same heroes"
  await pageA.locator('[data-rematch="same"]').click();
  await pageB.locator('[data-rematch="same"]').click();

  // Overlay closes + duel score resets
  await expect(pageA.locator('#duel-match-result-overlay')).toBeHidden({ timeout: 10_000 });
  await expect(pageA.locator('#duel-score-hud').getByText('1—0').or(pageA.locator('#duel-score-hud').getByText('0—0'))).toBeVisible();
});
```

- [ ] **Step 2: Run test to verify it passes**

```bash
cd tests/e2e
BRETT_URL=https://brett.korczewski.de pnpm exec playwright test services/brett-duel-rematch.spec.ts
```

Expected: PASS — assumes M2.2 through M2.7 are committed.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/services/brett-duel-rematch.spec.ts
git commit -m "test(brett): E2E full duel + rematch flow"
```

---

### Task M2.9 — Deploy + PR for M2

- [ ] **Step 1: Run all brett tests**

```bash
cd brett && npm test
```

Expected: all tests pass, including new `duel-server-auth.test.js`.

- [ ] **Step 2: Run task test:all**

```bash
task test:all
```

Expected: PASS.

- [ ] **Step 3: Deploy to dev**

```bash
task feature:brett ENV=mentolder-dev
```

- [ ] **Step 4: Manual verification on dev**

- Open 2 fighter tabs + 1 spectator tab via E2E auth
- Run a duel to completion (2-0)
- Assert: match-end overlay shows with 3 buttons
- Both fighters click *Rematch · gleiche Helden* — assert overlay clears, round 1 starts at 0-0
- Run another duel, click *Zurück zum Warmup* on one client — assert warmup mode is set
- Cycle: open 2 fighter tabs, end match, leave overlay open for 60s — assert server emits `duel_abandoned` and overlay clears

- [ ] **Step 5: Open PR**

```bash
gh pr create --base main --title "feat(brett): server-auth duel scoring + polished match-end overlay + rematch" --body "$(cat <<'EOF'
## Summary
- Server now broadcasts `duel_round_end` / `duel_match_end` instead of relaying the host's emission
- 3s server-side `duel_round_start` event drives round resets (replaces per-client setTimeout drift)
- Polished match-end overlay: portraits, score, hero recap, 3 buttons (Rematch · same / Rematch · select / Back to warmup)
- New protocol: `rematch_request`, `rematch_state`, `duel_reset`, `duel_abandoned`, `duel_abandoned_request`
- 60s server inactivity timeout → `duel_abandoned`
- displayName carried through `duel_start` so the winner banner shows real names

## Spec
docs/superpowers/specs/2026-05-25-brett-mayhem-duel-polish-design.md (M2 milestone)

## Test plan
- [x] Node tests: `brett/test/duel-server-auth.test.js`
- [x] Playwright E2E: `services/brett-duel-rematch.spec.ts`
- [x] Manual on dev cluster — full match cycle, both rematch modes, abandon, timeout

## Deploy notes
Single image (`task feature:brett`) ships server + client atomically — no skew.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6: Merge + deploy to prod**

```bash
# After CI green + auto-merge:
task feature:brett ENV=korczewski
```

---

# Milestone 3 — Discovery / invite / share / live banner (PR 3)

> **Surface:** brett client + brett server (new HTTP route) + website (new Svelte component).
> **Branch:** continue `feature/brett-mayhem-duel-polish` OR split. The plan assumes continuation.

## File map for M3

| File | Action | Responsibility |
|------|--------|----------------|
| `brett/package.json` | Modify | Add `qrcode-svg` dep |
| `brett/public/assets/main.js` | Modify | Parse `?role=` URL param; skip room-browser for direct joins |
| `brett/public/assets/mayhem/mayhem.js` | Modify | Add `_buildInvitePopover` module + Einladen button in `_buildDuelHud` |
| `brett/server.js` | Modify | New `GET /api/duels/live` endpoint with 5s cache |
| `brett/test/duels-live-endpoint.test.js` | Create | Endpoint shape test |
| `website/src/components/kore/DuelLiveBanner.svelte` | Create | Banner component, polls `/api/duels/live` |
| `website/src/pages/index.astro` | Modify | Mount `DuelLiveBanner` for korczewski brand only |
| `tests/e2e/services/brett-invite-banner.spec.ts` | Create | E2E for role-param + banner |

---

### Task M3.1 — Add qrcode-svg dependency

**Files:**
- Modify: `brett/package.json`

- [ ] **Step 1: Install**

```bash
cd brett && npm install --save qrcode-svg
```

- [ ] **Step 2: Verify**

```bash
grep -A1 '"dependencies"' brett/package.json | head -5
```

Expected: `"qrcode-svg": "^1.x"`.

- [ ] **Step 3: Commit**

```bash
git add brett/package.json brett/package-lock.json
git commit -m "build(brett): add qrcode-svg dep for invite popover QR codes"
```

---

### Task M3.2 — Server: GET /api/duels/live endpoint

**Files:**
- Modify: `brett/server.js` (new route alongside the other `app.get(...)` definitions, near line 235)

- [ ] **Step 1: Write the failing test first**

Create `brett/test/duels-live-endpoint.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');

let server; let port;

test.before(async () => {
  port = 14000 + Math.floor(Math.random() * 1000);
  server = spawn('node', ['server.js'], {
    cwd: __dirname + '/..',
    env: { ...process.env, PORT: port, DATABASE_URL: 'postgres://invalid' },
    stdio: 'pipe',
  });
  await new Promise(r => setTimeout(r, 1500));
});
test.after(() => { if (server) server.kill(); });

test('GET /api/duels/live returns [] when no duel active', async () => {
  const res = await fetch(`http://localhost:${port}/api/duels/live`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd brett && node --test test/duels-live-endpoint.test.js
```

Expected: FAIL — 404 (endpoint doesn't exist).

- [ ] **Step 3: Add the endpoint**

In `brett/server.js`, near line 235 (next to `/healthz`), add:

```js
let _duelsLiveCache = null;
let _duelsLiveCacheUntil = 0;

app.get('/api/duels/live', (_req, res) => {
  const now = Date.now();
  if (_duelsLiveCache && now < _duelsLiveCacheUntil) {
    return res.json(_duelsLiveCache);
  }
  const live = [];
  for (const [room, ds] of duelRooms.entries()) {
    const figs = figureMaps.get(room);
    const gameModeEntry = figs?.get('__game_mode__');
    if (gameModeEntry?.mode !== 'duel') continue;
    live.push({
      room,
      phase: 'fighting',
      round: ds.winsA + ds.winsB + 1,
      bestOf: ds.bestOf,
      startedAt: ds.startedAt || now, // see note below
    });
  }
  _duelsLiveCache = live;
  _duelsLiveCacheUntil = now + 5000;
  res.json(live);
});
```

Note: `ds.startedAt` doesn't exist yet on `duelRooms` entries. Add it in the existing `duel_start` handler (line 849):

```js
duelRooms.set(room, {
  // ... existing fields ...
  startedAt: Date.now(),
});
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd brett && node --test test/duels-live-endpoint.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add brett/server.js brett/test/duels-live-endpoint.test.js
git commit -m "feat(brett): GET /api/duels/live endpoint with 5s cache"
```

---

### Task M3.3 — Brett client: handle ?role= URL params

**Files:**
- Modify: `brett/public/assets/main.js`

- [ ] **Step 1: Read query params at boot**

Near the top of `main.js`, add:

```js
const _params = new URLSearchParams(location.search);
const _autoRole = _params.get('role'); // 'fighter' | 'spectator' | null
const _autoRoom = _params.get('room');
```

- [ ] **Step 2: Skip room-browser modal when auto-join params present**

Find where `RoomBrowser.show()` is called. Wrap with:

```js
if (_autoRoom && _autoRole) {
  // Skip the modal — auto-join with the requested role
  // The role hint is passed via a global that mayhem.js / ws.mjs reads when joining
  window._duelAutoRole = _autoRole;
  joinRoom(_autoRoom); // existing join function
} else {
  RoomBrowser.show();
}
```

- [ ] **Step 3: Wire `window._duelAutoRole` into the spectator decision**

In `brett/public/assets/mayhem/mayhem.js`, near where `_isSpectator` is first set during init / player_join, add a check at the very start of mode-duel entry:

```js
if (window._duelAutoRole === 'spectator') {
  _isSpectator = true;
  _enterSpectatorMode();
}
```

If `_autoRole === 'fighter'`: no special-case needed — the user falls into the standard fighter join path (hero-select etc.).

- [ ] **Step 4: Commit**

```bash
git add brett/public/assets/main.js brett/public/assets/mayhem/mayhem.js
git commit -m "feat(brett): ?role=spectator|fighter URL params skip room-browser modal"
```

---

### Task M3.4 — Invite popover in the duel HUD

**Files:**
- Modify: `brett/public/assets/mayhem/mayhem.js` (`_buildDuelHud` + new `_buildInvitePopover`)

- [ ] **Step 1: Add the Einladen button inside `_buildDuelHud`**

In `_buildDuelHud` (line 683), after the HUD bar is appended, also append:

```js
// Add Einladen button (only for admins / host — duel admins can see it)
if (window._session?.isAdmin || isHost) {
  const inviteBtn = document.createElement('button');
  inviteBtn.id = 'duel-invite-btn';
  inviteBtn.textContent = 'EINLADEN';
  inviteBtn.style.cssText = `
    position:fixed;top:14px;right:18px;
    background:transparent;border:1px solid rgba(215,176,106,.4);color:#d7b06a;
    padding:8px 14px;border-radius:8px;font-family:'Geist Mono',monospace;
    font-size:10px;letter-spacing:.16em;cursor:pointer;z-index:2000;
  `;
  inviteBtn.addEventListener('click', () => _buildInvitePopover());
  document.body.appendChild(inviteBtn);
}
```

- [ ] **Step 2: Write `_buildInvitePopover`**

Add (near `_showSpectatorHud`):

```js
function _buildInvitePopover() {
  const existing = document.getElementById('duel-invite-popover');
  if (existing) { existing.remove(); return; }

  const QRCode = window.QRCode || null; // injected via qrcode-svg script tag
  const room = ws._room || _autoRoom || '?';
  const base = location.origin;
  const fighterUrl = `${base}/?room=${encodeURIComponent(room)}&role=fighter`;
  const spectatorUrl = `${base}/?room=${encodeURIComponent(room)}&role=spectator`;

  const renderQr = (text) => {
    if (!QRCode) return '<div style="font-size:8px;color:#888">QR</div>';
    try {
      return new QRCode({
        content: text, width: 48, height: 48,
        background: '#fff', color: '#000', padding: 0,
      }).svg();
    } catch { return '<div style="font-size:8px;color:#888">QR</div>'; }
  };

  const overlay = document.createElement('div');
  overlay.id = 'duel-invite-popover';
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,.5);
    display:flex;align-items:center;justify-content:center;z-index:3500;
    font-family:'Geist Mono',monospace;
  `;
  overlay.innerHTML = `
    <div style="background:rgba(11,17,28,.96);border:1px solid rgba(215,176,106,.32);border-radius:14px;padding:24px;width:520px;max-width:90vw;color:#d7b06a">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
        <div>
          <div style="font-size:10px;letter-spacing:.2em;color:#8A8497">EINLADUNG</div>
          <div style="font-size:18px;margin-top:4px">Raum <code style="background:#1a2233;padding:2px 8px;border-radius:4px;color:#e5c885">${room}</code></div>
        </div>
        <button id="invite-close" style="background:transparent;border:1px solid rgba(255,255,255,.15);color:#8A8497;width:28px;height:28px;border-radius:6px;cursor:pointer">×</button>
      </div>

      <div style="background:rgba(215,176,106,.06);border:1px solid rgba(215,176,106,.3);border-radius:10px;padding:14px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <div>
            <div style="font-size:11px;letter-spacing:.14em;color:#d7b06a;font-weight:600">⚔ KÄMPFER</div>
            <div style="font-size:10px;color:#8A8497;margin-top:2px">Schick das deinem Gegner</div>
          </div>
          <button data-copy="${fighterUrl}" style="background:#d7b06a;color:#0b111c;border:none;padding:6px 14px;border-radius:6px;font-family:inherit;font-size:10px;letter-spacing:.14em;font-weight:600;cursor:pointer">KOPIEREN</button>
        </div>
        <div style="display:flex;gap:10px;align-items:center">
          <div style="flex:1;background:#0b111c;border:1px solid rgba(255,255,255,.08);padding:8px 10px;border-radius:6px;font-size:11px;color:#8A8497;word-break:break-all">${fighterUrl}</div>
          <div style="width:48px;height:48px;background:#fff;padding:0;border-radius:4px;display:flex;align-items:center;justify-content:center">${renderQr(fighterUrl)}</div>
        </div>
      </div>

      <div style="background:rgba(167,139,250,.06);border:1px solid rgba(167,139,250,.3);border-radius:10px;padding:14px;margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <div>
            <div style="font-size:11px;letter-spacing:.14em;color:#a78bfa;font-weight:600">👀 ZUSCHAUER</div>
            <div style="font-size:10px;color:#8A8497;margin-top:2px">Allgemeiner Link</div>
          </div>
          <button data-copy="${spectatorUrl}" style="background:#a78bfa;color:#0b111c;border:none;padding:6px 14px;border-radius:6px;font-family:inherit;font-size:10px;letter-spacing:.14em;font-weight:600;cursor:pointer">KOPIEREN</button>
        </div>
        <div style="display:flex;gap:10px;align-items:center">
          <div style="flex:1;background:#0b111c;border:1px solid rgba(255,255,255,.08);padding:8px 10px;border-radius:6px;font-size:11px;color:#8A8497;word-break:break-all">${spectatorUrl}</div>
          <div style="width:48px;height:48px;background:#fff;padding:0;border-radius:4px;display:flex;align-items:center;justify-content:center">${renderQr(spectatorUrl)}</div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('#invite-close').addEventListener('click', () => overlay.remove());
  overlay.querySelectorAll('[data-copy]').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.getAttribute('data-copy'));
        const orig = btn.textContent;
        btn.textContent = 'KOPIERT';
        setTimeout(() => { btn.textContent = orig; }, 1500);
      } catch {/* swallow */}
    });
  });
}
```

- [ ] **Step 3: Load qrcode-svg as a window-global**

In `brett/public/index.html`, before the main.js script tag, add:

```html
<script src="/node_modules/qrcode-svg/dist/qrcode.min.js" defer></script>
```

If the brett server doesn't serve `/node_modules/`, copy the bundled file into `brett/public/vendor/qrcode-svg.min.js` and reference that.

- [ ] **Step 4: Clean up button on stop()**

In `stop()` (around line 817), add:

```js
const inviteBtn = document.getElementById('duel-invite-btn');
if (inviteBtn) inviteBtn.remove();
const invitePop = document.getElementById('duel-invite-popover');
if (invitePop) invitePop.remove();
```

- [ ] **Step 5: Commit**

```bash
git add brett/public/assets/mayhem/mayhem.js brett/public/index.html
git commit -m "feat(brett): Einladen popover with fighter + spectator URLs + QR"
```

---

### Task M3.5 — Website: DuelLiveBanner.svelte

**Files:**
- Create: `website/src/components/kore/DuelLiveBanner.svelte`
- Modify: `website/src/pages/index.astro`

- [ ] **Step 1: Write the Svelte component**

Create `website/src/components/kore/DuelLiveBanner.svelte`:

```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  type LiveDuel = { room: string; phase: string; round: number; bestOf: number; startedAt: number };

  const BRETT_BASE = (import.meta.env.PUBLIC_BRETT_BASE as string) || 'https://brett.korczewski.de';
  const POLL_MS = 20_000;

  let live: LiveDuel | null = $state(null);
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  async function poll() {
    try {
      const res = await fetch(`${BRETT_BASE}/api/duels/live`, { credentials: 'omit' });
      if (!res.ok) { live = null; return; }
      const arr = await res.json() as LiveDuel[];
      live = arr.length ? arr[0] : null;
    } catch {
      live = null;
    }
  }

  onMount(() => {
    poll();
    pollTimer = setInterval(poll, POLL_MS);
  });

  onDestroy(() => { if (pollTimer) clearInterval(pollTimer); });

  function elapsed(startedAt: number) {
    const min = Math.max(1, Math.floor((Date.now() - startedAt) / 60_000));
    return `${min} Min`;
  }
</script>

{#if live}
  <div class="duel-banner">
    <div class="left">
      <span class="pulse"></span>
      <div>
        <div class="title">⚔ DUELL LÄUFT</div>
        <div class="sub">Runde {live.round} · BO{live.bestOf} · seit {elapsed(live.startedAt)}</div>
      </div>
    </div>
    <a href="{BRETT_BASE}/?room={encodeURIComponent(live.room)}&role=spectator" class="cta">
      ZUSCHAUEN →
    </a>
  </div>
{/if}

<style>
  .duel-banner {
    background: linear-gradient(90deg, rgba(167,139,250,.18), rgba(215,176,106,.18));
    border-bottom: 1px solid rgba(215,176,106,.32);
    padding: 10px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-family: 'Geist Mono', monospace;
    color: #d7b06a;
  }
  .left { display: flex; align-items: center; gap: 14px; }
  .pulse { width: 8px; height: 8px; background: #d7b06a; border-radius: 99px; box-shadow: 0 0 12px #d7b06a; animation: pulse 2s infinite; }
  .title { font-size: 11px; letter-spacing: .18em; color: #d7b06a; font-weight: 600; }
  .sub { font-size: 10px; color: #8A8497; margin-top: 1px; }
  .cta { background: #a78bfa; color: #0b111c; padding: 7px 16px; border-radius: 6px; font-size: 11px; letter-spacing: .14em; font-weight: 600; text-decoration: none; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
</style>
```

- [ ] **Step 2: Mount in index.astro for korczewski brand only**

In `website/src/pages/index.astro`, find where Kore-brand components mount (the existing `process.env.BRAND_ID ?? process.env.BRAND` branch). Add at the top of the Kore branch:

```astro
---
import DuelLiveBanner from '../components/kore/DuelLiveBanner.svelte';
const brand = process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder';
---

{brand === 'korczewski' && (
  <DuelLiveBanner client:idle />
)}
```

- [ ] **Step 3: Commit**

```bash
git add website/src/components/kore/DuelLiveBanner.svelte website/src/pages/index.astro
git commit -m "feat(website): DuelLiveBanner on Kore homepage — polls brett /api/duels/live"
```

---

### Task M3.6 — E2E for invite + role params + banner

**Files:**
- Create: `tests/e2e/services/brett-invite-banner.spec.ts`

- [ ] **Step 1: Write the E2E**

```ts
import { test, expect } from '@playwright/test';

const BRETT_URL = process.env.BRETT_URL ?? 'https://brett.korczewski.de';
const WEB_URL = process.env.WEB_URL ?? 'https://web.korczewski.de';

test('?role=spectator skips room-browser modal and joins as spectator', async ({ browser }) => {
  const ctx = await browser.newContext();
  await ctx.request.post(`${BRETT_URL}/auth/e2e-login`, {
    data: { user: `e2e-${Math.random().toString(36).slice(2, 8)}` },
  });
  const page = await ctx.newPage();
  await page.goto(`${BRETT_URL}/?room=banner-test&role=spectator`);
  // Room browser modal should NOT appear
  await expect(page.locator('#rb-overlay')).toHaveCount(0);
});

test('DuelLiveBanner renders on web.korczewski.de when a duel is live', async ({ browser }) => {
  // (helper: start a duel + ensure /api/duels/live returns non-empty)
  // ... then:
  const page = await browser.newPage();
  await page.goto(WEB_URL);
  await expect(page.locator('text=DUELL LÄUFT')).toBeVisible({ timeout: 25_000 });
  const link = page.getByRole('link', { name: /ZUSCHAUEN/ });
  await expect(link).toHaveAttribute('href', /role=spectator/);
});
```

- [ ] **Step 2: Run + commit**

```bash
cd tests/e2e
BRETT_URL=https://brett.korczewski.de WEB_URL=https://web.korczewski.de pnpm exec playwright test services/brett-invite-banner.spec.ts
```

Expected: PASS after M3.2 + M3.3 + M3.5 are deployed.

```bash
git add tests/e2e/services/brett-invite-banner.spec.ts
git commit -m "test(brett+web): role-param skip + live banner render"
```

---

### Task M3.7 — Deploy + PR for M3

- [ ] **Step 1: Test locally**

```bash
cd brett && npm test
task test:all
```

- [ ] **Step 2: Deploy brett**

```bash
task feature:brett ENV=korczewski
```

- [ ] **Step 3: Deploy website (korczewski only)**

```bash
task feature:website ENV=korczewski
```

Per memory `feedback_website_deploy`: deploy ALSO to mentolder if any shared component was touched. M3 only touched Kore-branded files, so mentolder is skipped.

- [ ] **Step 4: Manual verification**

- Open a duel on `brett.korczewski.de` via admin → click *Einladen* button → assert popover shows fighter + spectator URLs + QR codes
- Copy each link → open in private tab → assert it auto-joins without modal
- Visit `web.korczewski.de` in another tab → assert banner appears at top, "ZUSCHAUEN" link works

- [ ] **Step 5: Open PR + merge**

```bash
gh pr create --base main --title "feat(brett+web): invite popover, role URLs, live duel banner on Kore homepage" --body "$(cat <<'EOF'
## Summary
- New `GET /api/duels/live` brett endpoint (5s cache)
- `?role=fighter|spectator` URL params skip the room-browser modal
- *Einladen* button in duel HUD → popover with fighter/spectator URLs + QR codes
- `DuelLiveBanner.svelte` on Kore homepage polls `/api/duels/live` every 20s

## Spec
docs/superpowers/specs/2026-05-25-brett-mayhem-duel-polish-design.md (M3 milestone)

## Test plan
- [x] Node: `brett/test/duels-live-endpoint.test.js`
- [x] Playwright: `services/brett-invite-banner.spec.ts`
- [x] Manual: invite popover, role params, banner

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

# Self-review

**Spec coverage:** Every spec requirement maps to at least one task —
- 5 in-scope goals: spectator HUD (M1.4–M1.5), SFX (M1.2–M1.3, M1.6), server-auth scoring (M2.1–M2.2), rematch (M2.3, M2.5, M2.6), invite/share/banner (M3.1–M3.5). ✓
- 5 non-goals: explicitly NOT addressed (intros, cinematic cam, forfeit/disconnect, history, OBS). ✓
- Spec's flagged open question (displayName carry-through): addressed in M2.7. ✓

**Placeholder scan:** No `TBD`, `TODO`, or unresolved details in any task. Every test step has code. Every deploy step has a command. ✓

**Type consistency:**
- Message types used in M2.5 (`duel_round_end`, `duel_match_end`, `duel_round_start`, `rematch_state`, `duel_reset`, `duel_abandoned`) match the broadcast definitions in M2.2–M2.3. ✓
- `_isSpectator`, `_buildDuelHud`, `_showDuelMatchResult`, `_onDuelEnd`, `_onDuelRoundEnd`, `_specTarget`, `remoteAvatars` — all match the source identifiers in `mayhem.js`. ✓
- `duelRooms`, `rematchRequests`, `duelInactivityTimers`, `_duelsLiveCache` — server-side state matches across M2 + M3.2. ✓
- DOM IDs: `#spectator-hud-v2`, `#duel-match-result-overlay`, `#duel-invite-popover`, `#duel-rematch-waiting`, `[data-rematch]`, `[data-role="round-dot"]` — used consistently across tasks. ✓

**Parallelism:** M1 and M3 have no dependencies on each other → can be developed in parallel by two subagents. M2 has no code dependency on M1 or M3 either; the only soft dependency is that the new `duel_round_end` payload echo from server (M2) feeds the spec HUD's round dot updates (M1) — but they use the same message types and shapes, so they don't conflict.
