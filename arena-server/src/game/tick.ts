import { randomUUID } from 'node:crypto';
import {
  TICK_HZ, TICK_MS, PLAYER_HP, PLAYER_ARMOR_CAP, PLAYER_MOVE_SPEED,
  SPAWN_INVULN_MS, DODGE_IFRAME_MS, DODGE_COOLDOWN_MS, DODGE_DISTANCE,
  BOT_KEYS,
} from './constants';
import type { MatchState, PlayerState, WeaponState } from './state';
import type { PlayerSlot, DiffOp, GameEvent, MatchResult } from '../proto/messages';
import { CONCRETE_ARENA } from './map';
import { moveWithCollision, angleTo } from './physics';
import { tickWeaponCooldowns, tryFireWeapon, tryMelee, applyDamage } from './weapons';
import { tickItemSpawn, tickPickups } from './items';
import { tickPowerupSpawn, tickPowerupPickups, tickActivePowerups, getDamageMultiplier as getDmg, getMoveMultiplier as getSpeed } from './powerups';
import { initZone, tickZone } from './zone';
import type { BotAI } from '../bots/ai';
import { buildGrid } from '../bots/nav';

export interface InputMsg {
  seq: number;
  wasd: number;
  aim: number;
  fire: boolean;
  melee: boolean;
  pickup: boolean;
  dodge: boolean;
  tick: number;
}

export interface TickDeps {
  broadcastSnapshot: (matchId: string, state: MatchState) => void;
  broadcastDiff: (matchId: string, tick: number, ops: DiffOp[]) => void;
  broadcastEvent: (matchId: string, events: GameEvent[]) => void;
  onEnd: (winnerKey: string | null, results: MatchResult[]) => void;
}

export interface TickInit {
  matchId: string;
  players: Map<string, PlayerSlot>;
  bots: Map<string, BotAI>;
}

const WASD_DX = [0, 0, 0.707, 1, 0.707, 0, -0.707, -1, -0.707];
const WASD_DY = [0, -1, -0.707, 0, 0.707, 1, 0.707, 0, -0.707];

export class Tick {
  private state: MatchState;
  private lastState: MatchState;
  private interval: ReturnType<typeof setInterval> | null = null;
  private inputBuffers: Map<string, InputMsg[]> = new Map();
  private bots: Map<string, BotAI>;
  private readonly matchId: string;
  private matchElapsedMs = 0;
  private stopped = false;

  constructor(init: TickInit, private deps: TickDeps) {
    this.matchId = init.matchId;
    this.bots = init.bots;

    const spawns = CONCRETE_ARENA.spawns;
    const players: Record<string, PlayerState> = {};
    let spawnIdx = 0;

    for (const slot of init.players.values()) {
      const spawn = spawns[spawnIdx++ % spawns.length];
      players[slot.key] = {
        key: slot.key, displayName: slot.displayName, brand: slot.brand,
        characterId: slot.characterId, isBot: slot.isBot,
        x: spawn.x, y: spawn.y, facing: 0,
        hp: PLAYER_HP, armor: 0, alive: true, forfeit: false,
        dodging: false, dodgeCooldownRemainingMs: 0,
        spawnInvulnRemainingMs: SPAWN_INVULN_MS, meleeCooldownRemainingMs: 0,
        weapon: { id: 'glock', ammo: 12, reloading: false, reloadRemainingMs: 0, fireCooldownRemainingMs: 0 },
        activePowerups: [], kills: 0, deaths: 0, respectCoins: 0, disconnectedMs: 0, place: null,
      };
    }

    this.state = {
      matchId: init.matchId,
      tick: 0, phase: 'in-match',
      startedAt: Date.now(),
      players,
      items: [], powerups: [],
      zone: initZone(),
      doors: CONCRETE_ARENA.doors.map(d => ({ id: d.id, locked: d.locked })),
      itemSpawnRemainingMs: 5_000, // first drop after 5s (fast-start)
      powerupSpawnRemainingMs: 30_000, // first powerup after 30s
      aliveCount: Object.keys(players).length,
      everAliveCount: Object.keys(players).length,
      nextItemId: 1,
      eliminationOrder: [],
    };
    this.lastState = deepClone(this.state);
  }

  start(): void {
    // Emit initial full snapshot to all players
    this.deps.broadcastSnapshot(this.matchId, this.state);
    this.interval = setInterval(() => this.processTick(), TICK_MS);
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.interval) { clearInterval(this.interval); this.interval = null; }
  }

  pushInput(playerKey: string, msg: InputMsg): void {
    const buf = this.inputBuffers.get(playerKey) ?? [];
    buf.push(msg);
    if (buf.length > 5) buf.shift(); // cap buffer
    this.inputBuffers.set(playerKey, buf);
  }

  forfeit(playerKey: string): void {
    const p = this.state.players[playerKey];
    if (!p || !p.alive) return;
    p.alive = false;
    p.forfeit = true;
    p.deaths++;
    p.place = this.state.aliveCount;
    this.state.eliminationOrder.push(playerKey);
    this.state.aliveCount--;
  }

  playerDisconnected(playerKey: string): void {
    const p = this.state.players[playerKey];
    if (p) p.disconnectedMs = 1;
  }

  getState(): MatchState {
    return this.state;
  }

  private processTick(): void {
    if (this.stopped) return;
    this.state.tick++;
    this.matchElapsedMs += TICK_MS;
    const events: GameEvent[] = [];

    // --- Phase 1: Drain inputs + bot decisions ---
    for (const [key, player] of Object.entries(this.state.players)) {
      if (!player.alive) continue;

      let input: InputMsg | null = null;
      if (player.isBot) {
        const bot = this.bots.get(key);
        if (bot) {
          const bi = bot.decide(this.state, TICK_MS);
          input = { seq: 0, wasd: bi.wasd, aim: bi.aim, fire: bi.fire, melee: bi.melee, pickup: bi.pickup, dodge: bi.dodge, tick: this.state.tick };
        }
      } else {
        const buf = this.inputBuffers.get(key);
        if (buf && buf.length > 0) input = buf.shift()!;
      }

      if (!input) continue;

      // Update facing
      player.facing = input.aim;

      // --- Movement ---
      if (!player.dodging) {
        const spd = PLAYER_MOVE_SPEED * getSpeed(player);
        const dx = WASD_DX[input.wasd] * spd * (TICK_MS / 1000);
        const dy = WASD_DY[input.wasd] * spd * (TICK_MS / 1000);
        if (dx !== 0 || dy !== 0) {
          const newPos = moveWithCollision(player.x, player.y, dx, dy, CONCRETE_ARENA.walls);
          player.x = newPos.x;
          player.y = newPos.y;
        }
      }

      // --- Dodge ---
      if (input.dodge && player.dodgeCooldownRemainingMs <= 0 && !player.dodging) {
        const dirX = WASD_DX[input.wasd] || Math.cos(player.facing);
        const dirY = WASD_DY[input.wasd] || Math.sin(player.facing);
        const newPos = moveWithCollision(
          player.x, player.y,
          dirX * DODGE_DISTANCE, dirY * DODGE_DISTANCE,
          CONCRETE_ARENA.walls,
        );
        player.x = newPos.x;
        player.y = newPos.y;
        player.dodging = true;
        player.dodgeCooldownRemainingMs = DODGE_COOLDOWN_MS;
        events.push({ e: 'dodge', player: key });
      }

      // --- Fire ---
      if (input.fire) {
        const result = tryFireWeapon(player, this.state.players, CONCRETE_ARENA.walls);
        if (result?.hit && result.victim) {
          const target = this.state.players[result.victim];
          const dmg = getDmg(player);
          applyDamage(target, dmg);
          if (target.hp <= 0) {
            this.eliminatePlayer(target, key, result.weaponId, events);
          } else {
            // Not dead, no event needed unless we want hit markers (Plan 2b)
          }
        }
      }

      // --- Melee ---
      if (input.melee) {
        const hits = tryMelee(player, this.state.players);
        for (const victimKey of hits) {
          const target = this.state.players[victimKey];
          // Melee is OHKO (instant kill regardless of hp/armor, unless shielded)
          if (target.activePowerups.some(p => p.kind === 'shield')) continue;
          target.hp = 0;
          this.eliminatePlayer(target, key, 'melee', events);
        }
      }
    }

    // --- Phase 2: Tick timers ---
    for (const player of Object.values(this.state.players)) {
      if (!player.alive) continue;
      tickWeaponCooldowns(player, TICK_MS);
      if (player.spawnInvulnRemainingMs > 0)
        player.spawnInvulnRemainingMs = Math.max(0, player.spawnInvulnRemainingMs - TICK_MS);
      if (player.dodging) {
        player.dodgeCooldownRemainingMs = Math.max(0, player.dodgeCooldownRemainingMs - TICK_MS);
        // Dodge i-frame ends after DODGE_IFRAME_MS
        const elapsed = DODGE_COOLDOWN_MS - player.dodgeCooldownRemainingMs;
        if (elapsed >= DODGE_IFRAME_MS) player.dodging = false;
      } else if (player.dodgeCooldownRemainingMs > 0) {
        player.dodgeCooldownRemainingMs = Math.max(0, player.dodgeCooldownRemainingMs - TICK_MS);
      }
      // Disconnection AFK timeout
      if (player.disconnectedMs > 0) {
        player.disconnectedMs += TICK_MS;
        if (player.disconnectedMs >= 10_000) {
          this.eliminatePlayer(player, null, 'disconnect', events);
          events.push({ e: 'disconnect', player: player.key });
        }
      }
    }

    // --- Phase 3: Zone ---
    tickZone(this.state.zone, this.matchElapsedMs, TICK_MS, this.state.players, events);

    // Check for zone-killed players
    for (const [key, p] of Object.entries(this.state.players)) {
      if (p.alive && p.hp <= 0) {
        this.eliminatePlayer(p, null, 'zone', events);
      }
    }

    // --- Phase 4: Items + Powerups ---
    tickItemSpawn(this.state, CONCRETE_ARENA.itemSpots, TICK_MS, events);
    tickPickups(this.state, events);
    tickPowerupSpawn(this.state, CONCRETE_ARENA.powerupSpots, TICK_MS);
    tickPowerupPickups(this.state, events);
    tickActivePowerups(this.state, events);

    // --- Phase 5: Win condition ---
    const alivePlayers = Object.values(this.state.players).filter(p => p.alive);
    if (alivePlayers.length <= 1 && this.state.everAliveCount >= 2) {
      const winner = alivePlayers[0]?.key ?? null;
      events.push({ e: 'slow-mo' });
      if (events.length > 0) this.deps.broadcastEvent(this.matchId, events);
      const results = this.buildResults(winner);
      this.stop();
      this.deps.onEnd(winner, results);
      return;
    }

    // --- Phase 6: Broadcast ---
    if (events.length > 0) this.deps.broadcastEvent(this.matchId, events);
    const ops = buildDiff(this.lastState, this.state);
    this.deps.broadcastDiff(this.matchId, this.state.tick, ops);
    this.lastState = deepClone(this.state);
  }

  private eliminatePlayer(player: PlayerState, killerKey: string | null, weapon: string, events: GameEvent[]): void {
    if (!player.alive) return;
    player.alive = false;
    player.hp = 0;
    player.place = this.state.aliveCount;
    this.state.eliminationOrder.push(player.key);
    this.state.aliveCount--;

    player.deaths++;
    if (killerKey && this.state.players[killerKey]) {
      this.state.players[killerKey].kills++;
    }

    if (weapon === 'zone' || weapon === 'disconnect') {
      events.push({ e: 'kill-zone', victim: player.key });
    } else {
      events.push({ e: 'kill', killer: killerKey ?? 'zone', victim: player.key, weapon });
    }
  }

  private buildResults(winnerKey: string | null): MatchResult[] {
    const players = Object.values(this.state.players);
    // Sort: winner first (place=1), then by elimination order reversed
    return players
      .sort((a, b) => {
        if (a.key === winnerKey) return -1;
        if (b.key === winnerKey) return 1;
        return (b.place ?? 0) - (a.place ?? 0); // higher place number = earlier elimination = lower rank
      })
      .map((p, i) => ({
        playerKey: p.key, displayName: p.displayName, isBot: p.isBot,
        place: p.key === winnerKey ? 1 : (i + 2),
        kills: p.kills, deaths: p.deaths, forfeit: p.forfeit,
      }));
  }
}

function buildDiff(prev: MatchState, curr: MatchState): DiffOp[] {
  const ops: DiffOp[] = [];
  if (prev.tick !== curr.tick) ops.push({ p: 'tick', v: curr.tick });
  if (prev.aliveCount !== curr.aliveCount) ops.push({ p: 'alive', v: curr.aliveCount });
  if (prev.zone.radius !== curr.zone.radius) ops.push({ p: 'z.r', v: curr.zone.radius });
  if (prev.zone.shrinking !== curr.zone.shrinking) ops.push({ p: 'z.s', v: curr.zone.shrinking });

  for (const [k, p] of Object.entries(curr.players)) {
    const pp = prev.players[k];
    if (!pp) { ops.push({ p: `p.${k}`, v: p }); continue; }
    if (pp.x !== p.x) ops.push({ p: `p.${k}.x`, v: p.x });
    if (pp.y !== p.y) ops.push({ p: `p.${k}.y`, v: p.y });
    if (pp.facing !== p.facing) ops.push({ p: `p.${k}.f`, v: p.facing });
    if (pp.hp !== p.hp) ops.push({ p: `p.${k}.hp`, v: p.hp });
    if (pp.armor !== p.armor) ops.push({ p: `p.${k}.ar`, v: p.armor });
    if (pp.alive !== p.alive) ops.push({ p: `p.${k}.alive`, v: p.alive });
    if (pp.dodging !== p.dodging) ops.push({ p: `p.${k}.dodge`, v: p.dodging });
    if (pp.weapon.ammo !== p.weapon.ammo) ops.push({ p: `p.${k}.wammo`, v: p.weapon.ammo });
    if (pp.weapon.reloading !== p.weapon.reloading) ops.push({ p: `p.${k}.wrl`, v: p.weapon.reloading });
    if (pp.weapon.id !== p.weapon.id) ops.push({ p: `p.${k}.wid`, v: p.weapon.id });
    if (pp.activePowerups.length !== p.activePowerups.length) ops.push({ p: `p.${k}.pw`, v: p.activePowerups });
  }

  const prevItemIds = new Set(prev.items.map(i => i.id));
  const currItemIds = new Set(curr.items.map(i => i.id));
  for (const item of curr.items) if (!prevItemIds.has(item.id)) ops.push({ p: `item+.${item.id}`, v: item });
  for (const item of prev.items) if (!currItemIds.has(item.id)) ops.push({ p: `item-.${item.id}`, v: null });

  const prevPuIds = new Set(prev.powerups.map(p => p.id));
  const currPuIds = new Set(curr.powerups.map(p => p.id));
  for (const pu of curr.powerups) if (!prevPuIds.has(pu.id)) ops.push({ p: `pu+.${pu.id}`, v: pu });
  for (const pu of prev.powerups) if (!currPuIds.has(pu.id)) ops.push({ p: `pu-.${pu.id}`, v: null });

  for (const d of curr.doors) {
    const pd = prev.doors.find(x => x.id === d.id);
    if (!pd || pd.locked !== d.locked) ops.push({ p: `door.${d.id}.locked`, v: d.locked });
  }
  return ops;
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}