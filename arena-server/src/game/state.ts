import type { LobbyPhase } from '../proto/messages';

export interface Vec2 { x: number; y: number; }

export type WeaponId = 'glock' | 'deagle' | 'm4a1';
export type ItemKind = 'health-pack' | 'med-syringe' | 'armor-plate' | 'ammo-box' | 'keycard' | 'respect-coin';
export type PowerupKind = 'shield' | 'speed' | 'damage' | 'emp' | 'cloak';

export interface WeaponState {
  id: WeaponId;
  ammo: number;
  reloading: boolean;
  reloadRemainingMs: number;
  fireCooldownRemainingMs: number;
}

export interface ActivePowerup {
  kind: PowerupKind;
  expiresAtTick: number;
}

export interface PlayerState {
  key: string;
  displayName: string;
  brand: 'mentolder' | 'korczewski' | null;
  characterId: string;
  isBot: boolean;
  x: number; y: number;
  facing: number;     // aim angle, radians
  hp: number;
  armor: number;
  alive: boolean;
  forfeit: boolean;
  dodging: boolean;
  dodgeCooldownRemainingMs: number;
  spawnInvulnRemainingMs: number;
  meleeCooldownRemainingMs: number;
  weapon: WeaponState;
  activePowerups: ActivePowerup[];
  kills: number;
  deaths: number;
  respectCoins: number;
  disconnectedMs: number;
  place: number | null;   // filled on elimination
}

export interface GroundItem {
  id: string;
  kind: ItemKind;
  x: number; y: number;
}

export interface GroundPowerup {
  id: string;
  kind: PowerupKind;
  x: number; y: number;
}

export interface ZoneState {
  cx: number; cy: number;
  radius: number;
  shrinking: boolean;
  nextDamageMs: number;
}

export interface DoorState {
  id: string;
  locked: boolean;
}

export interface MatchState {
  matchId: string;
  tick: number;
  phase: LobbyPhase;
  startedAt: number;
  players: Record<string, PlayerState>;
  items: GroundItem[];
  powerups: GroundPowerup[];
  zone: ZoneState;
  doors: DoorState[];
  itemSpawnRemainingMs: number;
  powerupSpawnRemainingMs: number;
  aliveCount: number;
  everAliveCount: number;
  nextItemId: number;
  eliminationOrder: string[];   // keys in order of elimination (first = 4th place)
}