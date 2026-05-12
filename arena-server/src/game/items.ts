import { ITEM_SPAWN_CYCLE_MS, ITEMS_PER_DROP, PLAYER_HP, PLAYER_ARMOR_CAP } from './constants';
import type { GroundItem, PlayerState, MatchState, ItemKind } from './state';
import type { GameEvent } from '../proto/messages';
import type { ItemSpot } from './map';
import { dist2 } from './physics';

const PICKUP_RADIUS_PX = 24;
const ITEM_WEIGHTS: ItemKind[] = [
  'health-pack', 'health-pack',
  'med-syringe',
  'armor-plate',
  'ammo-box', 'ammo-box',
  'keycard',
  'respect-coin', 'respect-coin', 'respect-coin',
];

export function tickItemSpawn(state: MatchState, itemSpots: ItemSpot[], dtMs: number, events: GameEvent[]): void {
  state.itemSpawnRemainingMs -= dtMs;
  if (state.itemSpawnRemainingMs <= 0) {
    state.itemSpawnRemainingMs = ITEM_SPAWN_CYCLE_MS;
    spawnItems(state, itemSpots, events);
  }
}

function spawnItems(state: MatchState, spots: ItemSpot[], events: GameEvent[]): void {
  // Pick ITEMS_PER_DROP random unoccupied spots
  const occupied = new Set(state.items.map(i => `${i.x},${i.y}`));
  const free = spots.filter(s => !occupied.has(`${s.x},${s.y}`));
  const chosen = shuffleSample(free, ITEMS_PER_DROP);
  for (const spot of chosen) {
    const kind = ITEM_WEIGHTS[Math.floor(Math.random() * ITEM_WEIGHTS.length)];
    state.items.push({ id: `item_${state.nextItemId++}`, kind, x: spot.x, y: spot.y });
  }
}

// Check if any player is close enough to pick up items. Mutates state.
export function tickPickups(state: MatchState, events: GameEvent[]): void {
  const toRemove: string[] = [];
  for (const item of state.items) {
    for (const [pKey, player] of Object.entries(state.players)) {
      if (!player.alive) continue;
      if (dist2(player.x, player.y, item.x, item.y) <= PICKUP_RADIUS_PX ** 2) {
        if (applyItemEffect(player, item.kind, state)) {
          events.push({ e: 'pickup-item', player: pKey, kind: item.kind });
          toRemove.push(item.id);
          break;
        }
      }
    }
  }
  state.items = state.items.filter(i => !toRemove.includes(i.id));
}

// Returns true if item was consumed (effect applied)
function applyItemEffect(p: PlayerState, kind: ItemKind, state: MatchState): boolean {
  switch (kind) {
    case 'health-pack':
      if (p.hp >= PLAYER_HP) return false;
      p.hp = Math.min(PLAYER_HP, p.hp + 1);
      return true;
    case 'med-syringe':
      // Instant HP (no cast vulnerability in Plan 2a; Plan 2b adds the cast animation)
      if (p.hp >= PLAYER_HP) return false;
      p.hp = Math.min(PLAYER_HP, p.hp + 1);
      return true;
    case 'armor-plate':
      if (p.armor >= PLAYER_ARMOR_CAP) return false;
      p.armor = Math.min(PLAYER_ARMOR_CAP, p.armor + 1);
      return true;
    case 'ammo-box':
      p.weapon.ammo = getMaxAmmo(p.weapon.id);
      p.weapon.reloading = false;
      p.weapon.reloadRemainingMs = 0;
      return true;
    case 'keycard':
      // Unlock the north door
      const door = state.doors.find(d => d.id === 'north');
      if (door && door.locked) {
        door.locked = false;
        // Spawn M4A1 at cache location (handled by tick.ts as a special event)
        state.items.push({ id: `item_${state.nextItemId++}`, kind: 'ammo-box', x: 420, y: 36 });
        // Actually spawn an M4A1 — represented as a pickup that calls pickupWeapon; Plan 2b renders it
        // For Plan 2a, add a marker in events from outside; item effect just unlocks
        return true;
      }
      return false;
    case 'respect-coin':
      p.respectCoins++;
      return true;
  }
}

function getMaxAmmo(id: string): number {
  if (id === 'glock') return 12;
  if (id === 'deagle') return 7;
  if (id === 'm4a1') return 30;
  return 12;
}

function shuffleSample<T>(arr: T[], n: number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, Math.min(n, a.length));
}