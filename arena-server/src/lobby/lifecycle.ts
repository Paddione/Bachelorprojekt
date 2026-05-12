import { makeCode, putLobby, getLobby, activeLobby, removeLobby, type Lobby } from './registry';
import { fillBots } from './botfill';
import {
  LOBBY_OPEN_DURATION_MS, LOBBY_STARTING_DURATION_MS, LOBBY_RESULTS_DURATION_MS,
} from '../game/constants';
import type { PlayerSlot } from '../proto/messages';
import type { Repo } from '../db/repo';

export interface LifecycleDeps {
  onBroadcast: (code: string) => void;
  persist: Pick<Repo, 'insertLobby' | 'updateLobbyPhase' | 'insertMatchWithPlayers'>;
}

export interface OpenRequest { hostKey: string; hostName: string; }
export interface OpenResult { code: string; expiresAt: number; }

export class Lifecycle {
  constructor(private deps: LifecycleDeps) {}

  open(req: OpenRequest): OpenResult {
    if (activeLobby()) {
      const err = new Error('409 Conflict: another lobby is already active');
      (err as any).code = 409;
      throw err;
    }
    const code = makeCode();
    const now = Date.now();
    const expiresAt = now + LOBBY_OPEN_DURATION_MS;
    const host: PlayerSlot = {
      key: req.hostKey, displayName: req.hostName, brand: req.hostKey.endsWith('@korczewski') ? 'korczewski' : 'mentolder',
      characterId: 'blonde-guy', isBot: false, ready: true, alive: true,
    };
    const lobby: Lobby = {
      code, phase: 'open', hostKey: req.hostKey,
      openedAt: now, expiresAt,
      players: new Map([[host.key, host]]),
      rematchYes: new Set(), timers: {},
    };
    putLobby(lobby);
    this.deps.persist.insertLobby({ code, phase: 'open', hostKey: req.hostKey, expiresAt: new Date(expiresAt) })
      .catch(() => {/* logged in caller */});
    lobby.timers.open = setTimeout(() => this.toStarting(code), LOBBY_OPEN_DURATION_MS);
    this.deps.onBroadcast(code);
    return { code, expiresAt };
  }

  join(code: string, slot: PlayerSlot): void {
    const lobby = getLobby(code);
    if (!lobby) throw new Error('404 lobby not found');
    if (lobby.phase !== 'open') throw new Error('409 lobby not joinable');
    lobby.players.set(slot.key, slot);
    const humans = [...lobby.players.values()].filter(p => !p.isBot).length;
    if (humans >= 4) this.toStarting(code);
    else this.deps.onBroadcast(code);
  }

  leave(code: string, playerKey: string): void {
    const lobby = getLobby(code);
    if (!lobby) return;
    lobby.players.delete(playerKey);
    this.deps.onBroadcast(code);
  }

  private toStarting(code: string) {
    const lobby = getLobby(code);
    if (!lobby || lobby.phase !== 'open') return;
    clearTimeout(lobby.timers.open);
    fillBots(lobby);
    lobby.phase = 'starting';
    this.deps.persist.updateLobbyPhase(code, 'starting').catch(() => {});
    this.deps.onBroadcast(code);
    lobby.timers.start = setTimeout(() => this.toInMatch(code), LOBBY_STARTING_DURATION_MS);
  }

  private toInMatch(code: string) {
    const lobby = getLobby(code);
    if (!lobby) return;
    lobby.phase = 'in-match';
    this.deps.persist.updateLobbyPhase(code, 'in-match').catch(() => {});
    this.deps.onBroadcast(code);
    // Plan 1: no tick loop. Plan 2 replaces this stub with the real tick.
    // To keep the lifecycle exercised end-to-end, hold in-match for 3s then
    // synthesise a results phase with the host as winner.
    lobby.timers.match = setTimeout(() => this.toResults(code, lobby.hostKey), 3_000);
  }

  toResults(code: string, winnerKey: string | null): void {
    const lobby = getLobby(code);
    if (!lobby) return;
    lobby.phase = 'results';
    this.deps.persist.updateLobbyPhase(code, 'results').catch(() => {});
    
    // Plan 1 stub: Insert mock results row to exercise DB write path
    const now = new Date();
    this.deps.persist.insertMatchWithPlayers({
      lobbyCode: code,
      openedAt: new Date(lobby.openedAt),
      startedAt: new Date(now.getTime() - 30_000),
      endedAt: now,
      winnerPlayer: winnerKey,
      botCount: [...lobby.players.values()].filter(p => p.isBot).length,
      humanCount: [...lobby.players.values()].filter(p => !p.isBot).length,
      forfeitCount: 0,
      resultsJsonb: { stub: true },
      players: [...lobby.players.values()].map((p, i) => ({
        playerKey: p.key, displayName: p.displayName, brand: p.brand,
        isBot: p.isBot, characterId: p.characterId, place: i + 1, kills: 0, deaths: 1, forfeit: false,
      })),
    }).catch(e => console.error('stub match insert failed:', e));

    this.deps.onBroadcast(code);
    lobby.timers.results = setTimeout(() => this.toClosed(code), LOBBY_RESULTS_DURATION_MS);
  }

  voteRematch(code: string, playerKey: string, yes: boolean): void {
    const lobby = getLobby(code);
    if (!lobby || lobby.phase !== 'results') return;
    if (yes) lobby.rematchYes.add(playerKey);
    else lobby.rematchYes.delete(playerKey);
    const humans = [...lobby.players.values()].filter(p => !p.isBot);
    const yesHumans = humans.filter(p => lobby.rematchYes.has(p.key));
    if (yesHumans.length >= 2) this.reopen(code);
    this.deps.onBroadcast(code);
  }

  private reopen(code: string) {
    const lobby = getLobby(code);
    if (!lobby) return;
    Object.values(lobby.timers).forEach(t => t && clearTimeout(t));
    const humans = [...lobby.players.values()].filter(p => !p.isBot);
    removeLobby(code);
    const next = this.open({ hostKey: lobby.hostKey, hostName: humans.find(p => p.key === lobby.hostKey)?.displayName ?? 'host' });
    const newLobby = getLobby(next.code)!;
    for (const h of humans) if (h.key !== lobby.hostKey) newLobby.players.set(h.key, h);
    this.deps.onBroadcast(next.code);
  }

  toClosed(code: string): void {
    const lobby = getLobby(code);
    if (!lobby) return;
    Object.values(lobby.timers).forEach(t => t && clearTimeout(t));
    lobby.phase = 'closed';
    this.deps.persist.updateLobbyPhase(code, 'closed').catch(() => {});
    this.deps.onBroadcast(code);
    setTimeout(() => removeLobby(code), 2_000);
  }
}