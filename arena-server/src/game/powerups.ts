import { POWERUP_SPAWN_CYCLE_MS, POWERUPS, TICK_MS } from './constants';
import type { GroundPowerup, PlayerState, MatchState, PowerupKind } from './state';
import type { GameEvent } from '../proto/messages';
import type { PowerupSpot } from './map';
import { dist2 } from './physics';

const PICKUP_RADIUS_PX = 28;
const POWERUP_KINDS: PowerupKind[] = ['shield', 'speed', 'damage', 'emp', 'cloak'];

export function tickPowerupSpawn(state: MatchState, spots: PowerupSpot[], dtMs: number): void {
  state.powerupSpawnRemainingMs -= dtMs;
  if (state.powerupSpawnRemainingMs <= 0) {
    state.powerupSpawnRemainingMs = POWERUP_SPAWN_CYCLE_MS;
    // Spawn one random powerup kind that isn't already on the ground
    const present = new Set(state.powerups.map(p => p.kind));
    const available = POWERUP_KINDS.filter(k => !present.has(k));
    if (available.length === 0) return;
    const kind = available[Math.floor(Math.random() * available.length)];
    const idx = POWERUP_KINDS.indexOf(kind);
    const spot = spots[idx] ?? spots[0];
    state.powerups.push({
      id: `pu_${state.nextItemId++}`,
      kind,
      x: spot.x,
      y: spot.y,
    });
  }
}

export function tickPowerupPickups(state: MatchState, events: GameEvent[]): void {
  const toRemove: string[] = [];
  for (const pu of state.powerups) {
    for (const [pKey, player] of Object.entries(state.players)) {
      if (!player.alive) continue;
      if (dist2(player.x, player.y, pu.x, pu.y) <= PICKUP_RADIUS_PX ** 2) {
        applyPowerupEffect(player, pu.kind, state.tick, events, pKey);
        events.push({ e: 'pickup-powerup', player: pKey, kind: pu.kind });
        toRemove.push(pu.id);
        break;
      }
    }
  }
  state.powerups = state.powerups.filter(p => !toRemove.includes(p.id));
}

// Tick active powerup durations and expire them
export function tickActivePowerups(state: MatchState, events: GameEvent[]): void {
  for (const player of Object.values(state.players)) {
    const expired: PowerupKind[] = [];
    player.activePowerups = player.activePowerups.filter(ap => {
      if (state.tick >= ap.expiresAtTick) {
        expired.push(ap.kind);
        return false;
      }
      return true;
    });
    for (const kind of expired) {
      events.push({ e: 'powerup-expire', player: player.key, kind });
    }
  }
}

function applyPowerupEffect(
  p: PlayerState,
  kind: PowerupKind,
  currentTick: number,
  events: GameEvent[],
  pKey: string,
): void {
  const cfg = POWERUPS[kind];
  const durationTicks = Math.ceil(cfg.durationMs / TICK_MS);

  if (kind === 'emp') {
    // EMP: handled as a broadcast event; actual weapon-disable is client-side visual in v1
    // Server-side: the EMP burst disables active powerups within radius in the future
    // For Plan 2a we just grant the player the powerup as a marker
  }

  // Remove existing powerup of same kind first (re-pickup refreshes duration)
  p.activePowerups = p.activePowerups.filter(ap => ap.kind !== kind);
  p.activePowerups.push({ kind, expiresAtTick: currentTick + durationTicks });
}

// Helper used in tick.ts for damage multiplier
export function getDamageMultiplier(p: PlayerState): number {
  return p.activePowerups.some(ap => ap.kind === 'damage') ? 2 : 1;
}

// Helper used in tick.ts for move speed multiplier
export function getMoveMultiplier(p: PlayerState): number {
  return p.activePowerups.some(ap => ap.kind === 'speed') ? 1.6 : 1;
}