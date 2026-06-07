import type { Phase } from '../types/state';

export const sessionCodeIndex = new Map<string, string>();
export const tokenGraceTimers = new Map<string, NodeJS.Timeout>();
export const roomAdminPresence = new Map<string, Set<string>>();
export const roomPreviousPlayers = new Map<string, Set<string>>();

export const IDLE_TIMEOUT_MS = 2 * 60 * 1000;

type FigureMaps = Map<string, Map<string, any>>;
let figureMaps: FigureMaps;
let applyMutation: (room: string, msg: any) => void;
let transitionPhase: (room: string, phase: Phase) => { ok: boolean; from?: Phase | null; to?: Phase; reason?: string };

export function initSessions(deps: {
  figureMaps: FigureMaps;
  applyMutation: (room: string, msg: any) => void;
  transitionPhase: (room: string, phase: Phase) => { ok: boolean; from?: Phase | null; to?: Phase; reason?: string };
}): void {
  figureMaps = deps.figureMaps;
  applyMutation = deps.applyMutation;
  transitionPhase = deps.transitionPhase;
}

const CROCKFORD = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateSessionCode(): string {
  let attempt = 0;
  while (attempt < 16) {
    let chars = '';
    for (let i = 0; i < 6; i++) {
      chars += CROCKFORD[Math.floor(Math.random() * CROCKFORD.length)];
    }
    const code = chars.slice(0, 3) + '-' + chars.slice(3);
    if (!sessionCodeIndex.has(code)) return code;
    attempt++;
  }
  throw new Error('session-code: 16 collisions in a row — population too dense');
}

export function registerSessionCode(code: string, roomToken: string): void {
  sessionCodeIndex.set(code, roomToken);
}

export function resolveSessionCode(code: string): string | null {
  return sessionCodeIndex.get(code) || null;
}

export function rebuildSessionCodeIndexFromStates(rows: any[]): void {
  for (const row of rows) {
    const code = row.state?.sessionCode;
    if (code) sessionCodeIndex.set(code, row.room_token);
  }
}

export function getAdminTokenHolder(room: string): string | null {
  return figureMaps.get(room)?.get('__admin_token_holder__')?.playerId || null;
}

export function assignAdminToken(room: string, playerId: string): { ok: boolean; reason?: string; holder?: string } {
  if (getAdminTokenHolder(room)) return { ok: false, reason: 'already-held' };
  applyMutation(room, { type: 'session_admin_token_set', playerId });
  return { ok: true, holder: playerId };
}

export function handoffAdminToken(room: string, fromPlayerId: string, toPlayerId: string): { ok: boolean; reason?: string; from?: string; to?: string } {
  const current = getAdminTokenHolder(room);
  if (current !== fromPlayerId) return { ok: false, reason: 'not-current-holder' };
  applyMutation(room, { type: 'session_admin_token_set', playerId: toPlayerId });
  return { ok: true, from: fromPlayerId, to: toPlayerId };
}

export function releaseAdminToken(room: string): void {
  const figs = figureMaps.get(room);
  if (figs) figs.delete('__admin_token_holder__');
}

export function setRoomAdminPresence(room: string, adminIds: string[]): void {
  roomAdminPresence.set(room, new Set(adminIds));
}

const GRACE_TIMEOUT_DEFAULT_MS = 30_000;

export function beginTokenGrace(room: string, departingPlayerId: string, opts: { timeoutMs?: number } = {}): void {
  const ms = opts.timeoutMs ?? GRACE_TIMEOUT_DEFAULT_MS;
  if (tokenGraceTimers.has(room)) clearTimeout(tokenGraceTimers.get(room)!);
  const timer = setTimeout(() => {
    tokenGraceTimers.delete(room);
    if (getAdminTokenHolder(room) === departingPlayerId) {
      const presentAdmins = [...(roomAdminPresence.get(room) || [])]
        .filter(id => id !== departingPlayerId);
      if (presentAdmins.length > 0) {
        applyMutation(room, { type: 'session_admin_token_set', playerId: presentAdmins[0] });
      } else {
        releaseAdminToken(room);
      }
    }
  }, ms);
  tokenGraceTimers.set(room, timer);
}

export function reclaimAdminToken(room: string, playerId: string): { ok: boolean; reason?: string } {
  if (getAdminTokenHolder(room) !== playerId) return { ok: false, reason: 'not-holder' };
  if (tokenGraceTimers.has(room)) {
    clearTimeout(tokenGraceTimers.get(room)!);
    tokenGraceTimers.delete(room);
  }
  return { ok: true };
}

export function handleAdminSessionCreate(room: string, adminPlayerId: string): { ok: boolean; code?: string } {
  const code = generateSessionCode();
  registerSessionCode(code, room);
  applyMutation(room, { type: 'session_code_set', code });
  applyMutation(room, { type: 'session_phase_set', phase: 'lobby' });
  applyMutation(room, { type: 'session_admin_token_set', playerId: adminPlayerId });
  applyMutation(room, { type: 'session_created_at_set', ts: new Date().toISOString() });
  applyMutation(room, { type: 'session_last_activity_set', ts: new Date().toISOString() });
  return { ok: true, code };
}

export function handleAdminHandoffMessage(room: string, fromPlayerId: string, toPlayerId: string, broadcastFn: (m: any) => void): { ok: boolean; reason?: string } {
  const result = handoffAdminToken(room, fromPlayerId, toPlayerId);
  if (!result.ok) return result;
  broadcastFn({ type: 'admin_token_changed', holderPlayerId: toPlayerId, reason: 'handoff' });
  return result;
}

export function handleAdminRoundStart(room: string, broadcastFn: (m: any) => void): { ok: boolean; reason?: string; noop?: boolean } {
  const current = figureMaps.get(room)?.get('__session_phase__')?.phase;
  if (current === 'active') return { ok: true, noop: true };
  const result = transitionPhase(room, 'active');
  if (!result.ok) return result;
  broadcastFn({
    type: 'session_phase_change',
    phase: 'active',
    transitionedAt: new Date().toISOString(),
    reason: 'round-start',
  });
  return result;
}

export function handleAdminRoundStop(room: string, broadcastFn: (m: any) => void): { ok: boolean; reason?: string } {
  const result = transitionPhase(room, 'ended');
  if (!result.ok) return result;
  broadcastFn({ type: 'session_phase_change', phase: 'ended', transitionedAt: new Date().toISOString(), reason: 'admin-stop' });
  broadcastFn({ type: 'session_ended', reason: 'admin-stop' });
  return result;
}

export function handleAdminRoundPause(room: string, broadcastFn: (m: any) => void): { ok: boolean; reason?: string } {
  const figs = figureMaps.get(room);
  const current = figs?.get('__session_phase__')?.phase;
  const next = current === 'active' ? 'paused' : current === 'paused' ? 'active' : null;
  if (!next) return { ok: false, reason: 'invalid-source-phase' };
  const result = transitionPhase(room, next);
  if (!result.ok) return result;
  broadcastFn({
    type: 'session_phase_change',
    phase: next,
    transitionedAt: new Date().toISOString(),
    reason: next === 'paused' ? 'admin-pause' : 'admin-resume'
  });
  return result;
}

/**
 * D4 — Board-Optik. Persist the optik in server state (via optik_set, so
 * late-joiners receive it in their snapshot) and propagate it to OTHER clients
 * via lobby_settings_change{optik}. Privileged: invoked only from the
 * isAdmin-gated admin_set_optik switch case (§5b).
 */
export function handleAdminSetOptik(room: string, settings: any, broadcastFn: (m: any) => void): { ok: boolean } {
  applyMutation(room, { type: 'optik_set', settings });
  broadcastFn({ type: 'lobby_settings_change', optik: settings });
  return { ok: true };
}

/**
 * D5 — Szenario-Vorlage choice. Persist the chosen templateId into lobbySettings
 * (survives reload / late-join roster) and propagate it via
 * lobby_settings_change{templateId}. The figure apply is a separate orchestrator
 * (D7) wired in the switch case after this choice-persist. Privileged (§5b).
 */
export function handleAdminSetTemplate(room: string, templateId: string, broadcastFn: (m: any) => void): { ok: boolean } {
  applyMutation(room, { type: 'lobby_settings_set', settings: { templateId } });
  broadcastFn({ type: 'lobby_settings_change', templateId });
  return { ok: true };
}

export function trackPlayerInRoom(room: string, playerId: string): void {
  if (!playerId) return;
  let set = roomPreviousPlayers.get(room);
  if (!set) {
    set = new Set();
    roomPreviousPlayers.set(room, set);
  }
  set.add(playerId);
}

export function wasPreviouslyInRoom(room: string, playerId: string): boolean {
  return !!roomPreviousPlayers.get(room)?.has(playerId);
}

export function shouldRejectReconnect(room: string, playerId: string | null): { reject: boolean; code?: number; message?: string } {
  const phase = figureMaps.get(room)?.get('__session_phase__')?.phase;
  // lobby / warmup / no-session → admit (hybrid late-join).
  if (!phase || phase === 'lobby' || phase === 'warmup') return { reject: false };
  if (phase === 'ended') {
    return {
      reject: true,
      code: 410,
      message: 'Session ist beendet.',
    };
  }
  if (phase === 'active' || phase === 'paused') {
    // Real late-joiner (never tracked in this room) → admit. A null/unknown
    // playerId is never previously-in-room, so it admits too (matrix-safe).
    if (!playerId || !wasPreviouslyInRoom(room, playerId)) return { reject: false };
    // True reconnect of a player who was already active → reject.
    return {
      reject: true,
      code: 409,
      message: 'Reconnect nicht möglich während aktiver Runde — warte auf Pause oder Ende.',
    };
  }
  return { reject: false };
}

export function touchSessionActivity(room: string): void {
  applyMutation(room, { type: 'session_last_activity_set', ts: new Date().toISOString() });
}

export function checkSessionIdle(room: string): { ended: boolean; reason?: string; room?: string } {
  const figs = figureMaps.get(room);
  if (!figs) return { ended: false, reason: 'no-room' };
  const phase = figs.get('__session_phase__')?.phase;
  if (!phase || phase === 'ended' || phase === 'warmup' || phase === 'lobby') {
    return { ended: false, reason: 'not-applicable' };
  }
  const lastActivityIso = figs.get('__session_last_activity__')?.ts;
  if (!lastActivityIso) return { ended: false, reason: 'no-activity-marker' };
  const lastActivity = Date.parse(lastActivityIso);
  if (Date.now() - lastActivity > IDLE_TIMEOUT_MS) {
    transitionPhase(room, 'ended');
    return { ended: true, reason: 'idle-timeout', room };
  }
  return { ended: false, reason: 'within-timeout', room };
}

export function checkAllSessions(): Array<{ ended: boolean; reason?: string; room?: string }> {
  const results = [];
  for (const room of figureMaps.keys()) {
    const r = checkSessionIdle(room);
    r.room = r.room || room;
    results.push(r);
  }
  return results;
}
