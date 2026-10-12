import type { WsDeps } from './ws-handler';
import { broadcastFigureAware } from './hidden-filter';

function getModerationState(deps: Pick<WsDeps, 'figureMaps'>, room: string): { spotlight: string | null; dim: string | null; freeze: boolean } {
  const entry = deps.figureMaps.get(room)?.get('__moderation__');
  return {
    spotlight: entry?.spotlight ?? null,
    dim: entry?.dim ?? null,
    freeze: entry?.freeze ?? false,
  };
}

/**
 * Assign a role to a current participant. Validates membership (rejects
 * non-members and `'anon'`, which is never a real participant key). Merges into
 * the existing `__roles__` map so other users' roles are never clobbered, then
 * broadcasts `role_changed` and persists.
 */
export function handleAssignRole(
  room: string,
  targetPlayerId: string,
  role: string,
  deps: Pick<WsDeps, 'listParticipants' | 'applyMutation' | 'buildStateFromMutations' | 'broadcast' | 'schedulePersist'>
): { ok: boolean; reason?: string } {
  if (targetPlayerId === 'anon' ||
      !deps.listParticipants(room).some((p: any) => p.userId === targetPlayerId)) {
    return { ok: false, reason: 'not-in-room' };
  }
  const roles = { ...(deps.buildStateFromMutations(room)?.roles ?? {}) };
  roles[targetPlayerId] = role;
  deps.applyMutation(room, { type: 'roles_set', roles });
  deps.broadcast(room, { type: 'role_changed', userId: targetPlayerId, role });
  deps.schedulePersist(room);
  return { ok: true };
}

export function handleAdminAssignRole(ws: any, msg: any, room: string, deps: WsDeps): void {
  if (typeof msg.targetPlayerId !== 'string' || typeof msg.role !== 'string') return;
  const res = handleAssignRole(room, msg.targetPlayerId, msg.role, deps);
  if (!res.ok) {
    try { ws.send(JSON.stringify({ type: 'error', reason: res.reason })); } catch {}
  }
  // Demotion to beobachter releases that user's figures (owner-orphan, C6):
  // a demoted owner can no longer mutate their figures, so they are freed.
  if (res.ok && msg.role === 'beobachter') {
    const orphaned = deps.orphanFiguresForUser(room, msg.targetPlayerId);
    for (const fid of orphaned) {
      deps.broadcast(room, { type: 'figure_owner_changed', figureId: fid, ownerId: null });
    }
    if (orphaned.length) deps.schedulePersist(room);
  }
}

export function handleAdminAssignFigure(ws: any, msg: any, room: string, deps: WsDeps): void {
  // Server-authoritative ownership change — the ONLY way (besides a
  // stellvertreter's own add) ownerId changes. isAdmin-gated.
  if (typeof msg.figureId !== 'string') return;
  if (!deps.figureMaps.get(room)?.has(msg.figureId)) {
    try { ws.send(JSON.stringify({ type: 'error', reason: 'not-found' })); } catch {}
    return;
  }
  if (msg.toPlayerId !== null) {
    if (typeof msg.toPlayerId !== 'string' ||
        !deps.listParticipants(room).some((p: any) => p.userId === msg.toPlayerId)) {
      try { ws.send(JSON.stringify({ type: 'error', reason: 'not-in-room' })); } catch {}
      return;
    }
  }
  deps.applyMutation(room, { type: 'figure_owner_set', figureId: msg.figureId, ownerId: msg.toPlayerId });
  deps.broadcast(room, { type: 'figure_owner_changed', figureId: msg.figureId, ownerId: msg.toPlayerId });
  deps.schedulePersist(room);
}

export function handleFigureTypeSet(ws: any, msg: any, room: string, deps: WsDeps): void {
  // Leader-only figure type assignment (D-spec). Validates figure exists.
  if (typeof msg.figureId !== 'string' || !msg.figureType) return;
  if (!deps.figureMaps.get(room)?.has(msg.figureId)) {
    try { ws.send(JSON.stringify({ type: 'error', reason: 'not-found' })); } catch {}
    return;
  }
  deps.applyMutation(room, { type: 'figure_type_set', figureId: msg.figureId, figureType: msg.figureType });
  deps.broadcast(room, { type: 'figure_type_changed', figureId: msg.figureId, figureType: msg.figureType });
  deps.schedulePersist(room);
}

export function handleFigureHideSet(ws: any, msg: any, room: string, deps: WsDeps): void {
  // E9: verdecktes Arbeiten. Setzt Figure.hidden und broadcastet die
  // Transition role-aware (Nicht-Leiter erhalten add/delete statt hidden-Daten).
  if (typeof msg.figureId !== 'string') {
    try { ws.send(JSON.stringify({ type: 'error', reason: 'invalid_figure_id' })); } catch {}
    return;
  }
  if (!deps.figureMaps.get(room)?.has(msg.figureId)) {
    try { ws.send(JSON.stringify({ type: 'error', reason: 'not-found' })); } catch {}
    return;
  }
  const hidden = !!msg.hidden;
  deps.applyMutation(room, { type: 'figure_hide_set', figureId: msg.figureId, hidden });
  broadcastFigureAware(deps, room, { type: 'figure_hidden_changed', figureId: msg.figureId, hidden });
  deps.schedulePersist(room);
}

// Shared by admin_spotlight_set/admin_dim_set: figureId validation,
// mutation, moderation-state broadcast. Was duplicated in both cases.
function handleModerationFigureSet(
  ws: any,
  msg: any,
  room: string,
  deps: WsDeps,
  mutationType: 'moderation_spotlight_set' | 'moderation_dim_set'
): void {
  // figureId: string|null — null deaktiviert den Modus
  const figureId = (typeof msg.figureId === 'string') ? msg.figureId : null;
  // Validate: wenn figureId gesetzt, muss die Figur existieren
  if (figureId !== null && (figureId.startsWith('__') || !deps.figureMaps.get(room)?.has(figureId))) {
    try { ws.send(JSON.stringify({ type: 'error', reason: 'not-found' })); } catch {}
    return;
  }
  deps.applyMutation(room, { type: mutationType, figureId });
  const state = getModerationState(deps, room);
  deps.broadcast(room, { type: 'moderation_state', ...state });
  deps.schedulePersist(room);
}

export function handleAdminSpotlightSet(ws: any, msg: any, room: string, deps: WsDeps): void {
  handleModerationFigureSet(ws, msg, room, deps, 'moderation_spotlight_set');
}

export function handleAdminDimSet(ws: any, msg: any, room: string, deps: WsDeps): void {
  handleModerationFigureSet(ws, msg, room, deps, 'moderation_dim_set');
}

export function handleAdminFreezeSet(_ws: any, msg: any, room: string, deps: WsDeps): void {
  const frozen = !!msg.frozen;
  deps.applyMutation(room, { type: 'moderation_freeze_set', frozen });
  const freezeState = getModerationState(deps, room);
  deps.broadcast(room, { type: 'moderation_state', ...freezeState });
  deps.schedulePersist(room);
}
