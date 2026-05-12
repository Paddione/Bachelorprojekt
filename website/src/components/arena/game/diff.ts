import type { MatchState, DiffOp } from '../shared/lobbyTypes';

export function applyDiff(state: MatchState, ops: DiffOp[]): void {
  for (const { p, v } of ops) {
    if (p === 'tick')  { state.tick = v as number; continue; }
    if (p === 'alive') { state.aliveCount = v as number; continue; }
    if (p === 'z.r')   { state.zone.radius = v as number; continue; }
    if (p === 'z.s')   { state.zone.shrinking = v as boolean; continue; }

    if (p.startsWith('item+.')) {
      state.items.push(v as any); continue;
    }
    if (p.startsWith('item-.')) {
      const id = p.slice(6);
      state.items = state.items.filter(i => i.id !== id); continue;
    }
    if (p.startsWith('pu+.')) {
      state.powerups.push(v as any); continue;
    }
    if (p.startsWith('pu-.')) {
      const id = p.slice(4);
      state.powerups = state.powerups.filter(i => i.id !== id); continue;
    }
    if (p.startsWith('door.')) {
      // door.${doorId}.locked
      const parts = p.split('.');
      const doorId = parts[1];
      const field = parts[2];
      const door = state.doors.find(d => d.id === doorId);
      if (door && field === 'locked') door.locked = v as boolean;
      continue;
    }
    if (p.startsWith('p.')) {
      // p.${playerKey} or p.${playerKey}.${field}
      // Player key may contain '@' but not end in a known field code.
      // Strategy: try to split off the last segment if it matches a known field code.
      const FIELD_CODES = new Set(['x','y','f','hp','ar','alive','dodge','wammo','wrl','wid','pw']);
      const rest = p.slice(2); // e.g. "alice@mentolder.x" or "alice@mentolder"

      let playerKey: string;
      let field: string | null = null;

      const lastDot = rest.lastIndexOf('.');
      if (lastDot >= 0 && FIELD_CODES.has(rest.slice(lastDot + 1))) {
        playerKey = rest.slice(0, lastDot);
        field = rest.slice(lastDot + 1);
      } else {
        playerKey = rest;
      }

      if (!field) {
        // Full player state replacement
        state.players[playerKey] = v as any;
        continue;
      }

      const pl = state.players[playerKey];
      if (!pl) continue;
      switch (field) {
        case 'x':     pl.x = v as number; break;
        case 'y':     pl.y = v as number; break;
        case 'f':     pl.facing = v as number; break;
        case 'hp':    pl.hp = v as number; break;
        case 'ar':    pl.armor = v as number; break;
        case 'alive': pl.alive = v as boolean; break;
        case 'dodge': pl.dodging = v as boolean; break;
        case 'wammo': pl.weapon.ammo = v as number; break;
        case 'wrl':   pl.weapon.reloading = v as boolean; break;
        case 'wid':   pl.weapon.id = v as any; break;
        case 'pw':    pl.activePowerups = v as any; break;
      }
      continue;
    }
    // Unknown op — silently ignored (forward-compatible)
  }
}
