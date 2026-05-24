'use strict';
// Game mode state machine.
// Warmup   — no elimination, manual respawn (R key), death is ragdoll only
// Deathmatch — auto respawn after 3 s, kill counter HUD
// LMS (Last Man Standing) — no respawn; last survivor wins; spectator cam on death
// Coop — co-operative wave survival; bots attack humans only; 10-wave escalation

const MODES = Object.freeze({ WARMUP: 'warmup', DEATHMATCH: 'deathmatch', LMS: 'lms', COOP: 'coop', DUEL: 'duel' });
const DEATHMATCH_RESPAWN_MS = 3000;

const WAVE_DEFS = [
  { wave: 1,  boss: false, count: 2 },
  { wave: 2,  boss: false, count: 3 },
  { wave: 3,  boss: false, count: 3 },
  { wave: 4,  boss: false, count: 4 },
  { wave: 5,  boss: true,  count: 1, multiplier: { hp: 3, shootRate: 1.5, speed: 1.2, scale: 1.0 } },
  { wave: 6,  boss: false, count: 3 },
  { wave: 7,  boss: false, count: 4 },
  { wave: 8,  boss: false, count: 4 },
  { wave: 9,  boss: false, count: 5 },
  { wave: 10, boss: true,  count: 1, multiplier: { hp: 6, shootRate: 2.0, speed: 1.3, scale: 1.5 } },
];

class GameModeManager {
  // onRespawn(playerId)    — called when a player should be respawned
  // onModeChange(mode)     — called when local mode display should update
  // onLmsEnd(result)       — called with { winner: id|null, draw: bool }
  constructor({ onRespawn, onModeChange, onLmsEnd, onDuelEnd } = {}) {
    this.mode          = MODES.WARMUP;
    this._onRespawn    = onRespawn    || (() => {});
    this._onModeChange = onModeChange || (() => {});
    this._onLmsEnd     = onLmsEnd     || (() => {});
    // Duel state
    this.phase     = 'hero-select';
    this.duelState = { winsA: 0, winsB: 0, bestOf: 3, playerA: null, playerB: null };
    this._onDuelEnd = onDuelEnd || (() => {});
    this._killCounts   = new Map();   // playerId → kills
    this._deathTimers  = new Map();   // playerId → timeoutId
    this._deadSet      = new Set();
    this._spectating   = false;
    this._canRespawn   = false;       // Warmup: toggled by R key
    // Co-op wave state
    this._wave          = 0;
    this._enemiesAlive  = new Set();
    this._deadPlayers   = new Set();
    this._coopPhase     = 'idle';
    this._onWaveStart   = null;
    this._onWaveComplete = null;
    this._onCoopWin     = null;
    this._onCoopLose    = null;
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
    // Clear co-op state on any mode change
    this._wave = 0;
    this._enemiesAlive.clear();
    this._deadPlayers.clear();
    this._coopPhase = 'idle';
    if (mode === MODES.DUEL) {
      this.phase = 'hero-select';
      this.duelState = { winsA: 0, winsB: 0, bestOf: 3, playerA: null, playerB: null };
    }
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

  // ── Co-op ──────────────────────────────────────────────────────────────────

  setCoopCallbacks({ onWaveStart, onWaveComplete, onCoopWin, onCoopLose }) {
    this._onWaveStart    = onWaveStart    || (() => {});
    this._onWaveComplete = onWaveComplete || (() => {});
    this._onCoopWin      = onCoopWin      || (() => {});
    this._onCoopLose     = onCoopLose     || (() => {});
  }

  startCoop() {
    if (this.mode !== MODES.COOP || this._coopPhase !== 'idle') return;
    this._startWave(1);
  }

  _startWave(n) {
    if (n > WAVE_DEFS.length) {
      this._coopPhase = 'won';
      this._onCoopWin && this._onCoopWin();
      return;
    }
    this._wave = n;
    this._enemiesAlive.clear();
    this._deadPlayers.clear();
    this._coopPhase = 'in-wave';
    const def = WAVE_DEFS[n - 1];
    this._onWaveStart && this._onWaveStart({ wave: n, def });
  }

  handleEnemyDeath(botId) {
    this._enemiesAlive.delete(botId);
    if (this._coopPhase !== 'in-wave') return;
    if (this._enemiesAlive.size === 0) {
      this._coopPhase = 'between';
      this._onWaveComplete && this._onWaveComplete({ wave: this._wave });
      setTimeout(() => this._startWave(this._wave + 1), 3000);
    }
  }

  handlePlayerDeathCoop(playerId, allHumanIds) {
    this._deadPlayers.add(playerId);
    if (this._coopPhase !== 'in-wave') return;
    const allDead = allHumanIds.every(id => this._deadPlayers.has(id));
    if (allDead) {
      this._coopPhase = 'lost';
      this._onCoopLose && this._onCoopLose();
    }
  }

  registerEnemy(botId) {
    this._enemiesAlive.add(botId);
  }

  getCoopWaveDef() {
    return WAVE_DEFS[this._wave - 1] ?? null;
  }

  getCoopPhase() { return this._coopPhase; }
  getCoopWave()  { return this._wave; }

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

  // Call after both players have selected their hero.
  startDuelFighting(playerA, playerB) {
    this.duelState.playerA = playerA;
    this.duelState.playerB = playerB;
    this.phase = 'fighting';
  }

  // Call when a player dies during duel phase. Returns { roundWinner, matchOver, matchWinner }.
  handleDuelDeath(deadPlayerId) {
    const ds = this.duelState;
    const isA = deadPlayerId === ds.playerA;
    const roundWinner = isA ? ds.playerB : ds.playerA;
    if (isA) ds.winsB++; else ds.winsA++;
    const winsNeeded = Math.ceil(ds.bestOf / 2);
    const matchOver  = ds.winsA >= winsNeeded || ds.winsB >= winsNeeded;
    const matchWinner = matchOver ? (ds.winsA >= winsNeeded ? ds.playerA : ds.playerB) : null;
    if (matchOver) {
      this._onDuelEnd({ matchWinner, winsA: ds.winsA, winsB: ds.winsB });
    }
    return { roundWinner, matchOver, matchWinner };
  }
}

if (typeof window !== 'undefined') {
  window.MayhemGameMode = { GameModeManager, MODES, WAVE_DEFS };
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GameModeManager, MODES, WAVE_DEFS };
}
