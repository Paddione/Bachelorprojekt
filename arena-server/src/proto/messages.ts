export const PROTOCOL_VERSION = 1;

export type LobbyPhase =
  | 'open' | 'starting' | 'in-match' | 'slow-mo' | 'results' | 'closed';

export interface PlayerSlot {
  key: string;            // sub@brand for humans, bot_<n> for bots
  displayName: string;
  brand: 'mentolder' | 'korczewski' | null;
  characterId: string;
  isBot: boolean;
  ready: boolean;
  alive: boolean;
}

export interface MatchResult {
  playerKey: string;
  displayName: string;
  isBot: boolean;
  place: number;
  kills: number;
  deaths: number;
  forfeit: boolean;
}

import type { MatchState, Vec2, WeaponId, WeaponState,
              ItemKind, PowerupKind, PlayerState,
              GroundItem, GroundPowerup, ZoneState, DoorState } from '../game/state';

export type { MatchState, Vec2, WeaponId, WeaponState,
         ItemKind, PowerupKind, PlayerState,
         GroundItem, GroundPowerup, ZoneState,
         DoorState };

export type DiffOp = { p: string; v: unknown };
export type GameEvent =
  | { e: 'kill';           killer: string; victim: string; weapon: string }
  | { e: 'kill-zone';      victim: string }
  | { e: 'pickup-item';    player: string; kind: string }
  | { e: 'pickup-powerup'; player: string; kind: string }
  | { e: 'door-open';      doorId: string; by: string }
  | { e: 'dodge';          player: string }
  | { e: 'forfeit';        player: string }
  | { e: 'disconnect';     player: string }
  | { e: 'slow-mo' }
  | { e: 'zone-shrink-start' }
  | { e: 'powerup-expire'; player: string; kind: string };

export type ClientMsg =
  | { t: 'lobby:open' }
  | { t: 'lobby:join'; code: string }
  | { t: 'lobby:ready'; ready: boolean }
  | { t: 'lobby:leave' }
  | { t: 'lobby:character'; characterId: string }
  | { t: 'input'; seq: number; wasd: number; aim: number;
        fire: boolean; melee: boolean; pickup: boolean; dodge: boolean; tick: number }
  | { t: 'spectator:follow'; target: string | null }
  | { t: 'spectator:join'; code: string }
  | { t: 'rematch:vote'; yes: boolean }
  | { t: 'forfeit' }
  | { t: 'auth:refresh'; token: string };

export type ServerMsg =
  | { t: 'lobby:state'; code: string; phase: LobbyPhase;
        players: PlayerSlot[]; expiresAt?: number; countdownMs?: number }
  | { t: 'match:full-snapshot'; tick: number; state: MatchState }
  | { t: 'match:diff'; tick: number; ops: DiffOp[] }
  | { t: 'match:event'; events: GameEvent[] }
  | { t: 'match:end'; results: MatchResult[]; matchId: string }
  | { t: 'error'; code: string; message: string };

const CLIENT_TYPES = new Set([
  'lobby:open','lobby:join','lobby:ready','lobby:leave','lobby:character','input',
  'spectator:follow','spectator:join','rematch:vote','forfeit','auth:refresh',
]);

export function isClientMsg(x: unknown): x is ClientMsg {
  return !!x && typeof x === 'object' && 't' in (x as any) &&
    CLIENT_TYPES.has((x as any).t);
}