import { makeCode, putLobby, getLobby, activeLobby, removeLobby, type Lobby } from './registry';
import { fillBots } from './botfill';
import {
  LOBBY_OPEN_DURATION_MS, LOBBY_STARTING_DURATION_MS, LOBBY_RESULTS_DURATION_MS, SLOW_MO_DURATION_MS,
} from '../game/constants';
import type { PlayerSlot } from '../proto/messages';
import type { Repo } from '../db/repo';
import { randomUUID } from 'node:crypto';
import { Tick } from '../game/tick';
import { BotAI } from '../bots/ai';
import { buildGrid } from '../bots/nav';
import { CONCRETE_ARENA } from '../game/map';
import type { Broadcasters } from '../ws/broadcasters';
import type { MatchResult } from '../proto/messages';

export interface LifecycleDeps {
  onBroadcast: (code: string) => void;
  persist: Pick<Repo, 'insertLobby' | 'updateLobbyPhase' | 'insertMatchWithPlayers'>;
  bc: Broadcasters;
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

  /**
   * Solo mode: open a lobby with just the host and a `solo` flag.
   * The 5s starting countdown is held until the host's WS connects
   * (see `startSolo`), so the client has time to render the lobby
   * scene and the match snapshot.
   */
  openSolo(req: OpenRequest): OpenResult {
    const out = this.open(req);
    const lobby = getLobby(out.code);
    if (lobby) lobby.solo = true;
    return out;
  }

  /**
   * Manual start by host.
   */
  start(code: string, hostKey: string): void {
    const lobby = getLobby(code);
    if (!lobby || lobby.hostKey !== hostKey || lobby.phase !== 'open') return;
    this.toStarting(code);
  }

  /**
   * Trigger the starting countdown for a solo lobby once the host
   * has actually connected. Idempotent: only fires when phase is 'open'.
   */
  startSolo(code: string): void {
    const lobby = getLobby(code);
    if (!lobby || !lobby.solo || lobby.phase !== 'open') return;
    this.toStarting(code);
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

  setCharacter(code: string, playerKey: string, characterId: string): void {
    const VALID = new Set(['blonde-guy', 'brown-guy', 'long-red-girl', 'blonde-long-girl']);
    if (!VALID.has(characterId)) return;
    const lobby = getLobby(code);
    if (!lobby || lobby.phase !== 'open') return;
    const slot = lobby.players.get(playerKey);
    if (!slot || slot.isBot) return;
    slot.characterId = characterId;
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

    const matchId = randomUUID();
    const grid = buildGrid(CONCRETE_ARENA.walls);
    const bots = new Map<string, BotAI>();
    for (const player of lobby.players.values()) {
      if (player.isBot) bots.set(player.key, new BotAI(player.key, grid));
    }

    const tick = new Tick(
      { matchId, players: lobby.players, bots },
      {
        broadcastSnapshot: (mid, state) => this.deps.bc.emitMatchSnapshot(code, mid, state),
        broadcastDiff: (mid, t, ops) => this.deps.bc.emitMatchDiff(code, mid, t, ops),
        broadcastEvent: (mid, events) => this.deps.bc.emitMatchEvent(code, mid, events),
        onEnd: (winner, results) => {
          this.deps.bc.emitMatchEnd(code, matchId, results);
          this.toSlowMo(code, winner, results, matchId, lobby.openedAt);
        },
      },
    );
    lobby.tick = tick;
    tick.start();
    this.deps.onBroadcast(code);
  }

  private toSlowMo(
    code: string, winnerKey: string | null, results: MatchResult[],
    matchId: string, openedAt: number,
  ): void {
    const lobby = getLobby(code);
    if (!lobby) return;
    lobby.phase = 'slow-mo';
    this.deps.onBroadcast(code);
    lobby.timers.slowmo = setTimeout(
      () => this.toResultsReal(code, winnerKey, results, matchId, openedAt),
      SLOW_MO_DURATION_MS,
    );
  }

  private toResultsReal(
    code: string, winnerKey: string | null, results: MatchResult[],
    matchId: string, openedAt: number,
  ): void {
    const lobby = getLobby(code);
    if (!lobby) return;
    lobby.phase = 'results';
    this.deps.persist.updateLobbyPhase(code, 'results').catch(() => {});

    const now = new Date();
    const botCount = [...lobby.players.values()].filter(p => p.isBot).length;
    const humanCount = [...lobby.players.values()].filter(p => !p.isBot).length;
    const forfeitCount = results.filter(r => r.forfeit).length;

    this.deps.persist.insertMatchWithPlayers({
      lobbyCode: code,
      openedAt: new Date(openedAt),
      startedAt: now,
      endedAt: now,
      winnerPlayer: winnerKey,
      botCount, humanCount, forfeitCount,
      resultsJsonb: results,
      players: results.map((r, i) => ({
        playerKey: r.playerKey, displayName: r.displayName,
        brand: lobby.players.get(r.playerKey)?.brand ?? null,
        isBot: r.isBot, characterId: lobby.players.get(r.playerKey)?.characterId ?? 'blonde-guy',
        place: r.place, kills: r.kills, deaths: r.deaths, forfeit: r.forfeit,
      })),
    }).catch(e => console.error('match insert failed:', e));

    this.deps.onBroadcast(code);
    lobby.timers.results = setTimeout(() => this.toClosed(code), LOBBY_RESULTS_DURATION_MS);
  }

  // Keep public toResults for lifecycle test compatibility — redirects to the real one with stub data
  toResults(code: string, winnerKey: string | null): void {
    this.toResultsReal(code, winnerKey, [], 'stub', getLobby(code)?.openedAt ?? Date.now());
  }

  forfeit(code: string, playerKey: string): void {
    const lobby = getLobby(code);
    if (!lobby || lobby.phase !== 'in-match') return;
    lobby.tick?.forfeit(playerKey);
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
    lobby.tick?.stop();
    lobby.phase = 'closed';
    this.deps.persist.updateLobbyPhase(code, 'closed').catch(() => {});
    this.deps.onBroadcast(code);
    setTimeout(() => removeLobby(code), 2_000);
  }
}