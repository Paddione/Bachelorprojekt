---
title: Mayhem Duel-Hero Completion — 7 Bug Fixes
date: 2026-05-24
ticket_id: T000268
status: active
domains: [brett, game, frontend]
pr_number: null
spec: docs/superpowers/specs/2026-05-24-mayhem-duel-heroes-design.md
---

# Mayhem Duel-Hero Completion — 7 Bug Fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 7 identified gaps in the Duel-Hero implementation shipped in PR #1046. After these fixes, PvAI duels complete, round counters update, HP bars show for both fighters, the match winner is named, Oskar's vehicles sync to all clients, and Martina's minion shield/frenzy have visual feedback.

**Architecture:** All changes are confined to `brett/public/assets/mayhem/`. Server (`brett/server.js`) gets minimal additions for Oskar vehicle relay types. No new files required — only modifications to existing modules.

---

## Phase 1 — PvAI Bot Death & Round-End (Critical)

All files are under `brett/public/assets/`.

### 1.1 — Fix `AIBot` to accept and store `_onDeath` callback

**File:** `mayhem/ai-bot.js`

Find the `AIBot` class constructor. It currently takes `(heroId, difficulty, scene, getPos, getAvatars, getObstacles, sendHit)`. Add `onDeath` as the last parameter and store it:

- [ ] Add `onDeath` as final constructor param with default `() => {}`
- [ ] Store as `this._onDeath = onDeath`
- [ ] In `processHit(damage)` — already calls `this._onDeath()` — verify the call is there; if not, add it after `this._hp` drops to ≤ 0

### 1.2 — Fix `_spawnPvAiBot()` in `mayhem.js`

**File:** `mayhem/mayhem.js`

The current call creates `new window.MayhemAiBot.AIBot(...)` without `_onDeath` and adds the bot to `remoteAvatars` but NOT `aiBots`. Fix:

- [ ] Pass an `onDeath` callback as the last argument to `new window.MayhemAiBot.AIBot(...)`:
  ```js
  () => {
    // Treat as a player death — host handles round logic
    this._handleBotDeath();
  }
  ```
- [ ] Add `this.aiBots.set('bot-pvai', pvAiBot)` immediately after construction so `applyHitLocally` can find it

### 1.3 — Add `_handleBotDeath()` to `mayhem.js`

- [ ] Create method `_handleBotDeath()`:
  ```js
  _handleBotDeath() {
    if (!this._isHost) return;
    const result = this.gameMode.handleDuelDeath('bot-pvai');
    if (result.matchOver) {
      this._sendMsg({ type: 'duel_match_end', winner: this._myId, winsA: result.winsA, winsB: result.winsB });
      this._showDuelMatchResult(this._myId);
    } else {
      this._sendMsg({ type: 'duel_round_end', winner: this._myId, winsA: result.winsA, winsB: result.winsB });
      this._onDuelRoundEnd({ winner: this._myId, winsA: result.winsA, winsB: result.winsB });
    }
  }
  ```

### 1.4 — Fix `applyHitLocally()` bot routing

**File:** `mayhem/mayhem.js`, function `applyHitLocally(victimId, ...)`

Currently checks only `aiBots.get(victimId)`. After 1.2, `bot-pvai` IS in `aiBots`, so the existing path will work. Verify this — no extra change needed if 1.2 is done correctly.

- [ ] Confirm `aiBots.get('bot-pvai')` resolves correctly after the fix and damage is applied

---

## Phase 2 — Dual HP Bar HUD + Round Counter Refresh

### 2.1 — Extend `_buildDuelHud()` with HP bars for both fighters

**File:** `mayhem/mayhem.js`

Currently `_buildDuelHud()` creates only a round-number `<div>`. Replace with a full layout:

```
[HeroA Portrait] [████░░ 60HP]    RUNDE 2 · A 1—0 B    [████░░ 90HP] [HeroB Portrait]
```

- [ ] Wrap existing round-counter element inside a parent `#duel-hud-bar` flex container
- [ ] Add left HP block: `#duel-hp-a` containing hero name label + `<div class="duel-hp-fill">` (width as % of max HP)
- [ ] Add right HP block: `#duel-hp-b` — mirror of left
- [ ] Update round counter text to include both win counts: `RUNDE ${round} · ${heroNameA} ${winsA}—${winsB} ${heroNameB}`
- [ ] Store references as `this._duelHpFillA`, `this._duelHpFillB` for live updates
- [ ] CSS (inline style or existing `<style>` block in `index.html`):
  - `.duel-hp-fill { height: 6px; background: var(--brass-game); transition: width 0.15s; border-radius: 3px; }`
  - `#duel-hud-bar { position: fixed; top: 12px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 16px; background: rgba(0,0,0,.55); padding: 6px 14px; border-radius: 8px; font-family: 'Geist Mono', monospace; color: var(--parchment-2); font-size: 11px; }`

### 2.2 — Wire `hp_update` message to HP bar

**File:** `mayhem/mayhem.js`, `onMessage()` handler for `hp_update`

- [ ] After updating `avatar.hp`, also update the duel HUD bars:
  ```js
  if (this._duelHpFillA && victimId === this.gameMode.duelState.playerA) {
    this._duelHpFillA.style.width = Math.max(0, (hp / maxHp) * 100) + '%';
  } else if (this._duelHpFillB && victimId === this.gameMode.duelState.playerB) {
    this._duelHpFillB.style.width = Math.max(0, (hp / maxHp) * 100) + '%';
  }
  ```
- [ ] Also update local player's own HP bar when local HP changes (hits received locally)

### 2.3 — Refresh HUD on round end

**File:** `mayhem/mayhem.js`, `_onDuelRoundEnd()`

Currently this resets positions but never refreshes the HUD. After the 3-second pause:

- [ ] Call `_buildDuelHud()` again with updated `winsA`/`winsB` from the round-end message
- [ ] Reset HP bar fills to full width (100%) since new round starts at full HP

---

## Phase 3 — Named Match Winner

### 3.1 — Pass winner name to `_showDuelMatchResult()`

**File:** `mayhem/mayhem.js`

- [ ] Change signature to `_showDuelMatchResult(winnerId, winsA, winsB)` if not already
- [ ] Look up the winner's hero: `const heroId = remoteAvatars.get(winnerId)?.heroId ?? _myHeroId`; then `const heroName = HEROES[heroId]?.name ?? 'Unbekannt'`
- [ ] For display: if `winnerId === this._myId` → "DU GEWINNST!" (or "SIEG — [HeroName]!"); else → "[HeroName] GEWINNT!"
- [ ] Show full score: `${winsA} : ${winsB}`
- [ ] In PvAI mode (`_pvAiMode`), `winnerId === 'bot-pvai'` → show "KI GEWINNT!" or "NIEDERLAGE"

---

## Phase 4 — Ability Cooldown Display (Patrick Specials)

### 4.1 — Add cooldown indicator elements for Digit4 / Digit5

**File:** `mayhem/mayhem.js` — wherever the existing weapon-slot HUD is built

- [ ] Add two small cooldown bars (or key-badge overlays) for stealth (4) and teleport (5) — only visible when `_myHeroId === 'patrick'`
- [ ] Track cooldown timestamps: `_stealthLastUsedAt = 0`, `_teleportLastUsedAt = 0` (already tracked implicitly via WeaponSystem but exposed via `weaponSystem.canFire(key)`)
- [ ] In the render loop `tick()`, update the cooldown bar width:
  ```js
  if (this._stealthCooldownEl) {
    const elapsed = performance.now() - this._stealthLastUsedAt;
    const frac = Math.min(1, elapsed / 8000);
    this._stealthCooldownEl.style.width = (frac * 100) + '%';
  }
  // same for teleport / 6000ms
  ```
- [ ] CSS: small bar underneath the "4" / "5" key badge, brass-game colour, same style as HP fill

---

## Phase 5 — Oskar Vehicle Sync

### 5.1 — Add vehicle relay types to `brett/server.js`

**File:** `brett/server.js`

- [ ] Find the `RELAY_TYPES` array / set and add: `'vehicle_switch'`, `'vehicle_repair'`, `'motorcycle_sprint'`
- [ ] Add these to `TRANSIENT_TYPES` (no DB persist needed): `'vehicle_switch'`, `'motorcycle_sprint'`
- [ ] `vehicle_repair` can also be transient (it's a one-shot heal, not state)

### 5.2 — Send WS messages from Oskar ability handlers in `mayhem.js`

**File:** `mayhem/mayhem.js`, inside `_showHeroSelectModal()` where onFire callbacks are wired for Oskar's weapons:

- [ ] `vehicle_switch` onFire → after local vehicle switch logic, send:
  ```js
  this._sendMsg({ type: 'vehicle_switch', playerId: this._myId, vehicleType: newVehicleType });
  ```
- [ ] `vehicle_repair` onFire → send:
  ```js
  this._sendMsg({ type: 'vehicle_repair', playerId: this._myId, amount: 40 });
  ```
- [ ] `motorcycle_sprint` onFire → send:
  ```js
  this._sendMsg({ type: 'motorcycle_sprint', playerId: this._myId, durationMs: 1500 });
  ```

### 5.3 — Handle vehicle messages in `onMessage()`

**File:** `mayhem/mayhem.js`

- [ ] `vehicle_switch`: find remote avatar by `msg.playerId`; call `vehicle.switch(msg.vehicleType)` on their avatar if `vehicle.js` exposes such an API; otherwise update `avatar.vehicleType` and visually swap the mesh
- [ ] `vehicle_repair`: find remote avatar; update their displayed HP or vehicle HP
- [ ] `motorcycle_sprint`: find remote avatar; apply `speedMultiplier = 2.5` for `durationMs` ms (visual only — damage-on-contact is host-authoritative)

---

## Phase 6 — Minion Shield & Frenzy Visuals

### 6.1 — Add `spawnShieldRing()` to `effects.js`

**File:** `mayhem/effects.js`

- [ ] Add function `spawnShieldRing(targetMesh, scene, THREE)`:
  - Creates `TorusGeometry(0.35, 0.04, 8, 24)` in brass-game colour
  - Parents it to `targetMesh` (add as child)
  - Stores ref on `targetMesh._shieldRing = torusMesh`
  - Slow rotation animation in the existing `tick()` loop (or just static)
- [ ] Add function `removeShieldRing(targetMesh)`:
  - `targetMesh._shieldRing && targetMesh.remove(targetMesh._shieldRing)`

### 6.2 — Add `spawnFrenzyParticles()` to `effects.js`

**File:** `mayhem/effects.js`

- [ ] Add function `spawnFrenzyParticles(targetMesh, scene, THREE)`:
  - Spawns 4–6 small `SphereGeometry(0.04)` in a warm-orange colour (`0xff6622`)
  - Animates them orbiting `targetMesh` position over 3000ms then auto-removes
  - Stores ref array on `targetMesh._frenzyParticles`
- [ ] Add function `clearFrenzyParticles(targetMesh, scene)` to clean up before 3000ms if frenzy ends early

### 6.3 — Call visual functions from `MinionManager` in `heroes.js`

**File:** `mayhem/heroes.js`, `MinionManager` class

- [ ] In `shieldOldest()`: after setting `minion.shielded = true`, call `window.MayhemEffects?.spawnShieldRing(minion.mesh, scene, THREE)`
- [ ] In `MinionManager.takeDamage(minionId)`: when `minion.shielded` absorbs a hit, call `window.MayhemEffects?.removeShieldRing(minion.mesh)`
- [ ] In `frenzyOldest()`: after boosting stats, call `window.MayhemEffects?.spawnFrenzyParticles(minion.mesh, scene, THREE)`; schedule `clearFrenzyParticles` via `setTimeout(3000)`
- [ ] `MinionManager` needs access to `scene` and `THREE` — pass them in constructor if not already present

---

## Verification Checklist

- [ ] PvAI duel: kill the bot → round-end fires → after 3s new round starts → after 2 wins match-end fires correctly
- [ ] Round counter in HUD updates from "RUNDE 1" to "RUNDE 2" after first round ends
- [ ] Both fighters' HP bars visible in HUD and decrease on hits in real-time
- [ ] Match-over screen names the winner by hero name (not just SIEG/NIEDERLAGE)
- [ ] Patrick stealth (4) and teleport (5) cooldown bars visible and drain/refill correctly
- [ ] Oskar vehicle switch: second player connected sees Oskar's vehicle change
- [ ] Shielded Martina minion shows brass ring; frenzied minion shows orange particles
- [ ] No console errors in any of the above scenarios

---

## Notes

- PvAI bot health (`_hp`) is tracked inside `AIBot.processHit()` — the bot's HP is NOT in the `remoteAvatars` HP system, so `hp_update` messages do NOT apply to it. The PvAI HP bar (Phase 2) should read from `pvAiBot._hp` directly each frame rather than from `hp_update`.
- Oskar vehicle sync (Phase 5) is intentionally shallow: remote clients get the visual change but collision-on-contact damage remains host-authoritative only.
- Minion visuals (Phase 6) are client-side only — the host still controls `shielded` / frenzy state; visual functions are called after the authoritative state change, not in response to WS messages.
