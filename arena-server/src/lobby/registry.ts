import type { PlayerSlot } from '../proto/messages';

export interface Lobby {
  code: string;
  phase: 'open' | 'starting' | 'in-match' | 'slow-mo' | 'results' | 'closed';
  hostKey: string;
  openedAt: number;
  expiresAt: number;
  players: Map<string, PlayerSlot>;     // key = sub@brand or bot_<n>
  rematchYes: Set<string>;
  timers: { [k: string]: NodeJS.Timeout | undefined };
}

const lobbies = new Map<string, Lobby>();

export function getLobby(code: string): Lobby | undefined { return lobbies.get(code); }
export function listLobbies(): Lobby[] { return [...lobbies.values()]; }
export function activeLobby(): Lobby | undefined {
  return listLobbies().find(l => l.phase !== 'closed');
}
export function putLobby(l: Lobby) { lobbies.set(l.code, l); }
export function removeLobby(code: string) { lobbies.delete(code); }

export function makeCode(): string {
  // 6 chars, [A-Z2-9] minus ambiguous I/O/1/0
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = ''; for (let i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}