'use strict';
// Game mode state machine.
// Warmup   — no elimination, manual respawn (R key), death is ragdoll only
// Deathmatch — auto respawn after 3 s, kill counter HUD
// LMS (Last Man Standing) — no respawn; last survivor wins; spectator cam on death

const MODES = Object.freeze({ WARMUP: 'warmup', DEATHMATCH: 'deathmatch', LMS: 'lms' });
const DEATHMATCH_RESPAWN_MS = 3000;

class GameModeManager {
  // onRespawn(playerId)    — called when a player should be respawned
  // onModeChange(mode)     — called when local mode display should update
  // onLmsEnd(result)       — called with { winner: id|null, draw: bool }
  constructor({ onRespawn, onModeChange, onLmsEnd } = {}) {
    this.mode          = MODES.WARMUP;
    this._onRespawn    = onRespawn    || (() => {});
    this._onModeChange = onModeChange || (() => {});
    this._onLmsEnd     = onLmsEnd     || (() => {});
    this._killCounts   = new Map();   // playerId → kills
    this._deathTimers  = new Map();   // playerId → timeoutId
    this._deadSet      = new Set();
    this._spectating   = false;
    this._canRespawn   = false;       // Warmup: toggled by R key
  }

  setMode(mode) {
    if (!Object.values(MODES).includes(mode)) return;
    this.mode = mode;
    this._killCounts.clear();
    this._deathTimers.forEach(t => clearTimeout(t));
    this._deathTimers.clear();
    this._deadSet.clear();
    this._spectating = false;
    this._canRespawn = false;
    this._onModeChange(mode);
  }

  // Call when a player dies (local or remote).
  handleDeath(playerId, isLocal) {
    this._deadSet.add(playerId);
    if (this.mode === MODES.WARMUP) {
      if (isLocal) {
        this._canRespawn = false; // wait for R press
      }
      // No network event needed — just ragdoll
    } else if (this.mode === MODES.DEATHMATCH) {
      const t = setTimeout(() => {
        this._deathTimers.delete(playerId);
        this._deadSet.delete(playerId);
        this._onRespawn(playerId);
      }, DEATHMATCH_RESPAWN_MS);
      this._deathTimers.set(playerId, t);
    } else if (this.mode === MODES.LMS) {
      if (isLocal) this._spectating = true;
      // Server resolves winner — wait for lms_winner / lms_draw messages
    }
  }

  handleKill(shooterId) {
    if (this.mode !== MODES.DEATHMATCH) return;
    this._killCounts.set(shooterId, (this._killCounts.get(shooterId) || 0) + 1);
  }

  // LMS: server told us who won.
  handleLmsResult(result) {
    this._onLmsEnd(result);
  }

  // Warmup: player presses R to respawn.
  tryManualRespawn(localPlayerId) {
    if (this.mode !== MODES.WARMUP) return;
    if (!this._deadSet.has(localPlayerId)) return;
    this._deadSet.delete(localPlayerId);
    this._canRespawn = false;
    this._onRespawn(localPlayerId);
  }

  // Called by mayhem.js on keydown 'r' / 'R'.
  onRespawnKey(localPlayerId) {
    this.tryManualRespawn(localPlayerId);
  }

  isDead(playerId) { return this._deadSet.has(playerId); }
  isSpectating()   { return this._spectating; }
  getKills(id)     { return this._killCounts.get(id) || 0; }

  // Returns HUD data for rendering.
  getHudData(avatars) {
    const entries = [];
    for (const [id, av] of avatars) {
      entries.push({
        id,
        hp:    av.hp,
        kills: this._killCounts.get(id) || 0,
        dead:  this._deadSet.has(id),
      });
    }
    entries.sort((a, b) => b.kills - a.kills || b.hp - a.hp);
    return { mode: this.mode, players: entries, spectating: this._spectating };
  }
}

if (typeof window !== 'undefined') {
  window.MayhemGameMode = { GameModeManager, MODES };
}
