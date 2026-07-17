import type { WsDeps } from './ws-handler';
import { resolvePlayerId } from './ws-handler';
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

export async function handleAdminMessage(ws: any, msg: any, adminRoom: string, deps: WsDeps): Promise<void> {
  switch (msg.type) {
    case 'admin_kick': {
      if (typeof msg.playerId !== 'string') return;
      for (const sock of deps.rooms.get(adminRoom) || []) {
        if (sock._playerId === msg.playerId) {
          try {
            sock.close();
          } catch {}
          break;
        }
      }
      break;
    }
    case 'admin_broadcast': {
      const websiteUrl = process.env.WEBSITE_INTERNAL_URL || 'http://website.website.svc.cluster.local:4321';
      fetch(`${websiteUrl}/api/admin/brett/broadcast`, {
        method: 'POST',
        headers: { 'x-internal-admin': process.env.BRETT_INTERNAL_ADMIN_SECRET || '' },
      }).catch((err: any) => console.error('[brett] admin_broadcast failed:', err.message));
      break;
    }
    case 'admin_session_create': {
      const playerId = resolvePlayerId(ws);
      if (!playerId) return;
      // CP-2: do NOT silently reset a LIVE session back to lobby. A raw
      // session_phase_set bypasses the per-edge transition allowlist
      // (active/paused→lobby is forbidden), so re-creating over an active
      // round would re-open it. Reject create from active/paused; allow it
      // from null/lobby/warmup/ended (a fresh session after a prior one
      // ended is a legitimate workflow that transitionPhase would block as
      // terminal).
      const curPhase = deps.buildStateFromMutations(adminRoom)?.sessionPhase;
      if (curPhase === 'active' || curPhase === 'paused') {
        try { ws.send(JSON.stringify({ type: 'error', reason: 'session-active' })); } catch {}
        return;
      }
      const result = deps.handleAdminSessionCreate(adminRoom, playerId);
      deps.broadcast(adminRoom, {
        type: 'session_phase_change',
        phase: 'lobby',
        transitionedAt: new Date().toISOString(),
        reason: 'admin-create',
      });
      deps.broadcast(adminRoom, {
        type: 'admin_token_changed',
        holderPlayerId: playerId,
        reason: 'handoff',
      });
      deps.clearParticipants(adminRoom);
      const creatorParticipant = deps.addParticipant(adminRoom, {
        userId: playerId,
        name: ws._session?.name || playerId,
      });
      if (creatorParticipant) {
        deps.broadcast(adminRoom, {
          type: 'presence_join',
          participant: { ...creatorParticipant, role: 'leiter', ready: false },
        });
      }
      deps.schedulePersist(adminRoom);
      try {
        ws.send(JSON.stringify({ type: 'session_created', code: result.code }));
      } catch {}
      break;
    }
    case 'admin_handoff_token': {
      if (typeof msg.targetPlayerId !== 'string') return;
      const fromPlayerId = resolvePlayerId(ws);
      if (!fromPlayerId || fromPlayerId === 'anon') return;
      deps.handleAdminHandoffMessage(adminRoom, fromPlayerId, msg.targetPlayerId, (out: any) => deps.broadcast(adminRoom, out));
      deps.schedulePersist(adminRoom);
      break;
    }
    case 'admin_round_stop': {
      deps.handleAdminRoundStop(adminRoom, (m: any) => deps.broadcast(adminRoom, m));
      deps.schedulePersist(adminRoom);
      // Flush event log on session end (Slice 5, T000472) — ensures no events lost.
      if (deps.flushEventLog) {
        deps.flushEventLog(adminRoom).catch((err: any) =>
          console.error('[brett/event-log] flush on end error:', err));
      }
      break;
    }
    case 'admin_round_pause': {
      deps.handleAdminRoundPause(adminRoom, (m: any) => deps.broadcast(adminRoom, m));
      deps.schedulePersist(adminRoom);
      break;
    }
    case 'admin_coaching_steps_set': {
      deps.applyMutation(adminRoom, { type: 'coaching_steps_set', steps: msg.steps, index: msg.index });
      deps.broadcast(adminRoom, { type: 'coaching_steps_change', steps: msg.steps, index: msg.index });
      deps.schedulePersist(adminRoom);
      break;
    }
    case 'admin_round_start': {
      const res = deps.handleAdminRoundStart(adminRoom, (m: any) => deps.broadcast(adminRoom, m));
      if (res && res.ok && !res.noop) deps.schedulePersist(adminRoom);
      break;
    }
    case 'admin_assign_role': {
      if (typeof msg.targetPlayerId !== 'string' || typeof msg.role !== 'string') return;
      const res = handleAssignRole(adminRoom, msg.targetPlayerId, msg.role, deps);
      if (!res.ok) {
        try { ws.send(JSON.stringify({ type: 'error', reason: res.reason })); } catch {}
      }
      // Demotion to beobachter releases that user's figures (owner-orphan, C6):
      // a demoted owner can no longer mutate their figures, so they are freed.
      if (res.ok && msg.role === 'beobachter') {
        const orphaned = deps.orphanFiguresForUser(adminRoom, msg.targetPlayerId);
        for (const fid of orphaned) {
          deps.broadcast(adminRoom, { type: 'figure_owner_changed', figureId: fid, ownerId: null });
        }
        if (orphaned.length) deps.schedulePersist(adminRoom);
      }
      break;
    }
    case 'admin_assign_figure': {
      // Server-authoritative ownership change — the ONLY way (besides a
      // stellvertreter's own add) ownerId changes. isAdmin-gated.
      if (typeof msg.figureId !== 'string') return;
      if (!deps.figureMaps.get(adminRoom)?.has(msg.figureId)) {
        try { ws.send(JSON.stringify({ type: 'error', reason: 'not-found' })); } catch {}
        return;
      }
      if (msg.toPlayerId !== null) {
        if (typeof msg.toPlayerId !== 'string' ||
            !deps.listParticipants(adminRoom).some((p: any) => p.userId === msg.toPlayerId)) {
          try { ws.send(JSON.stringify({ type: 'error', reason: 'not-in-room' })); } catch {}
          return;
        }
      }
      deps.applyMutation(adminRoom, { type: 'figure_owner_set', figureId: msg.figureId, ownerId: msg.toPlayerId });
      deps.broadcast(adminRoom, { type: 'figure_owner_changed', figureId: msg.figureId, ownerId: msg.toPlayerId });
      deps.schedulePersist(adminRoom);
      break;
    }
    case 'admin_set_optik': {
      // Board-Optik (D4). Persist + propagate to OTHER clients (sender
      // excluded, §13). Late-joiners get it via their snapshot.
      if (!msg.settings || typeof msg.settings !== 'object') return;
      deps.handleAdminSetOptik(adminRoom, msg.settings, (m: any) => deps.broadcast(adminRoom, m, ws));
      deps.schedulePersist(adminRoom);
      break;
    }
    case 'figure_type_set': {
      // Leader-only figure type assignment (D-spec). Validates figure exists.
      if (typeof msg.figureId !== 'string' || !msg.figureType) return;
      if (!deps.figureMaps.get(adminRoom)?.has(msg.figureId)) {
        try { ws.send(JSON.stringify({ type: 'error', reason: 'not-found' })); } catch {}
        return;
      }
      deps.applyMutation(adminRoom, { type: 'figure_type_set', figureId: msg.figureId, figureType: msg.figureType });
      deps.broadcast(adminRoom, { type: 'figure_type_changed', figureId: msg.figureId, figureType: msg.figureType });
      deps.schedulePersist(adminRoom);
      break;
    }
    case 'session_undo': {
      if (!deps.performUndo) break;
      const result = deps.performUndo(adminRoom);
      if (result.applied) {
        // Re-Snapshot an alle: buildStateFromMutations gibt aktuellen Zustand
        const freshState = deps.buildStateFromMutations(adminRoom);
        if (freshState) {
          const figures = Object.values(freshState.figures ?? {});
          deps.broadcast(adminRoom, {
            type: 'snapshot',
            figures,
            stiffness: freshState.stiffness,
            phase: freshState.sessionPhase,
            sessionCode: freshState.sessionCode,
            optik: freshState.optik,
          });
        }
        if (deps.getUndoStatus) {
          deps.broadcast(adminRoom, {
            type: 'undo_stack_changed',
            ...deps.getUndoStatus(adminRoom),
          });
        }
        deps.schedulePersist(adminRoom);
      } else {
        try {
          ws.send(JSON.stringify({ type: 'error', reason: 'undo-stack-empty' }));
        } catch {}
      }
      break;
    }

    case 'session_redo': {
      if (!deps.performRedo) break;
      const result = deps.performRedo(adminRoom);
      if (result.applied) {
        const freshState = deps.buildStateFromMutations(adminRoom);
        if (freshState) {
          const figures = Object.values(freshState.figures ?? {});
          deps.broadcast(adminRoom, {
            type: 'snapshot',
            figures,
            stiffness: freshState.stiffness,
            phase: freshState.sessionPhase,
            sessionCode: freshState.sessionCode,
            optik: freshState.optik,
          });
        }
        if (deps.getUndoStatus) {
          deps.broadcast(adminRoom, {
            type: 'undo_stack_changed',
            ...deps.getUndoStatus(adminRoom),
          });
        }
        deps.schedulePersist(adminRoom);
      } else {
        try {
          ws.send(JSON.stringify({ type: 'error', reason: 'redo-stack-empty' }));
        } catch {}
      }
      break;
    }

    case 'admin_set_template': {
      // Szenario-Vorlage (D5 choice-persist + D7 figure apply). Persist the
      // chosen templateId into lobbySettings and propagate to OTHER clients
      // (sender excluded). Then load the snapshot and seed it into server
      // state (server-authoritative), broadcasting to ALL so the leiter's
      // board reflects the seed too.
      if (typeof msg.templateId !== 'string') return;
      deps.handleAdminSetTemplate(adminRoom, msg.templateId, (m: any) => deps.broadcast(adminRoom, m, ws));
      if (deps.loadSnapshotState && deps.applyTemplateToRoom) {
        const snap = await deps.loadSnapshotState(msg.templateId);
        if (snap) deps.applyTemplateToRoom(adminRoom, snap, (m: any) => deps.broadcast(adminRoom, m));
      }
      deps.schedulePersist(adminRoom);
      break;
    }
    case 'admin_set_board_template': {
      if (typeof msg.boardTemplateId !== 'string') return;
      const { getBoardTemplate } = await import('./board-templates');
      const { getPool } = await import('./db');
      const tpl = await getBoardTemplate(getPool(), msg.boardTemplateId);
      if (tpl?.state && deps.applyTemplateToRoom) {
        deps.applyTemplateToRoom(adminRoom, tpl.state, (m: any) => deps.broadcast(adminRoom, m));
      }
      deps.schedulePersist(adminRoom);
      break;
    }
    case 'admin_spotlight_set': {
      // figureId: string|null — null deaktiviert den Spotlight
      const figureId = (typeof msg.figureId === 'string') ? msg.figureId : null;
      // Validate: wenn figureId gesetzt, muss die Figur existieren
      if (figureId !== null && (figureId.startsWith('__') || !deps.figureMaps.get(adminRoom)?.has(figureId))) {
        try { ws.send(JSON.stringify({ type: 'error', reason: 'not-found' })); } catch {}
        return;
      }
      deps.applyMutation(adminRoom, { type: 'moderation_spotlight_set', figureId });
      const spotlightState = getModerationState(deps, adminRoom);
      deps.broadcast(adminRoom, { type: 'moderation_state', ...spotlightState });
      deps.schedulePersist(adminRoom);
      break;
    }
    case 'admin_dim_set': {
      const figureId = (typeof msg.figureId === 'string') ? msg.figureId : null;
      if (figureId !== null && (figureId.startsWith('__') || !deps.figureMaps.get(adminRoom)?.has(figureId))) {
        try { ws.send(JSON.stringify({ type: 'error', reason: 'not-found' })); } catch {}
        return;
      }
      deps.applyMutation(adminRoom, { type: 'moderation_dim_set', figureId });
      const dimState = getModerationState(deps, adminRoom);
      deps.broadcast(adminRoom, { type: 'moderation_state', ...dimState });
      deps.schedulePersist(adminRoom);
      break;
    }
    case 'admin_freeze_set': {
      const frozen = !!msg.frozen;
      deps.applyMutation(adminRoom, { type: 'moderation_freeze_set', frozen });
      const freezeState = getModerationState(deps, adminRoom);
      deps.broadcast(adminRoom, { type: 'moderation_state', ...freezeState });
      deps.schedulePersist(adminRoom);
      break;
    }
    case 'anchor_create': {
      if (!msg.anchor || typeof msg.anchor !== 'object' ||
          typeof msg.anchor.x !== 'number' || typeof msg.anchor.z !== 'number') {
        try { ws.send(JSON.stringify({ type: 'error', reason: 'invalid_anchor' })); } catch {}
        return;
      }
      deps.applyMutation(adminRoom, { type: 'anchor_create', anchor: msg.anchor });
      const builtAnchors = deps.buildStateFromMutations(adminRoom)?.anchors ?? [];
      const added = builtAnchors[builtAnchors.length - 1];
      if (added) {
        deps.broadcast(adminRoom, { type: 'anchor_added', anchor: added });
      }
      deps.schedulePersist(adminRoom);
      return;
    }
    case 'anchor_delete': {
      if (typeof msg.anchorId !== 'string') {
        try { ws.send(JSON.stringify({ type: 'error', reason: 'invalid_anchor_id' })); } catch {}
        return;
      }
      deps.applyMutation(adminRoom, { type: 'anchor_delete', anchorId: msg.anchorId });
      deps.broadcast(adminRoom, { type: 'anchor_removed', anchorId: msg.anchorId });
      deps.schedulePersist(adminRoom);
      return;
    }
    case 'zone_create': {
      if (!msg.zone || typeof msg.zone !== 'object' ||
          typeof msg.zone.x !== 'number' || typeof msg.zone.z !== 'number' ||
          (msg.zone.shape !== 'rect' && msg.zone.shape !== 'circle')) {
        try { ws.send(JSON.stringify({ type: 'error', reason: 'invalid_zone' })); } catch {}
        return;
      }
      deps.applyMutation(adminRoom, { type: 'zone_create', zone: msg.zone });
      const builtZones = deps.buildStateFromMutations(adminRoom)?.zones ?? [];
      const addedZone = builtZones[builtZones.length - 1];
      if (addedZone) {
        deps.broadcast(adminRoom, { type: 'zone_added', zone: addedZone });
      }
      deps.schedulePersist(adminRoom);
      return;
    }
    case 'zone_update': {
      // E1: verschieben/skalieren/umstylen. Zone muss existieren.
      if (typeof msg.zoneId !== 'string') {
        try { ws.send(JSON.stringify({ type: 'error', reason: 'invalid_zone_id' })); } catch {}
        return;
      }
      const zonesBefore: any[] = deps.buildStateFromMutations(adminRoom)?.zones ?? [];
      if (!zonesBefore.some((z: any) => z.id === msg.zoneId)) {
        try { ws.send(JSON.stringify({ type: 'error', reason: 'not-found' })); } catch {}
        return;
      }
      deps.applyMutation(adminRoom, { type: 'zone_update', ...msg });
      const zonesAfter: any[] = deps.buildStateFromMutations(adminRoom)?.zones ?? [];
      const updatedZone = zonesAfter.find((z: any) => z.id === msg.zoneId);
      if (updatedZone) deps.broadcast(adminRoom, { type: 'zone_updated', zone: updatedZone });
      deps.schedulePersist(adminRoom);
      return;
    }
    case 'zone_delete': {
      if (typeof msg.zoneId !== 'string') {
        try { ws.send(JSON.stringify({ type: 'error', reason: 'invalid_zone_id' })); } catch {}
        return;
      }
      deps.applyMutation(adminRoom, { type: 'zone_delete', zoneId: msg.zoneId });
      deps.broadcast(adminRoom, { type: 'zone_removed', zoneId: msg.zoneId });
      deps.schedulePersist(adminRoom);
      return;
    }
    case 'figure_hide_set': {
      // E9: verdecktes Arbeiten. Setzt Figure.hidden und broadcastet die
      // Transition role-aware (Nicht-Leiter erhalten add/delete statt hidden-Daten).
      if (typeof msg.figureId !== 'string') {
        try { ws.send(JSON.stringify({ type: 'error', reason: 'invalid_figure_id' })); } catch {}
        return;
      }
      if (!deps.figureMaps.get(adminRoom)?.has(msg.figureId)) {
        try { ws.send(JSON.stringify({ type: 'error', reason: 'not-found' })); } catch {}
        return;
      }
      const hidden = !!msg.hidden;
      deps.applyMutation(adminRoom, { type: 'figure_hide_set', figureId: msg.figureId, hidden });
      broadcastFigureAware(deps, adminRoom, { type: 'figure_hidden_changed', figureId: msg.figureId, hidden });
      deps.schedulePersist(adminRoom);
      return;
    }
    case 'line_create': {
      // Leiter-only check (zusätzlich zur isAdmin-Gate in ws-handler.ts)
      const state = deps.buildStateFromMutations(adminRoom) || {};
      const role = deps.resolveRole(ws, state.roles || {});
      if (role !== 'leiter') {
        try { ws.send(JSON.stringify({ type: 'error', reason: 'forbidden' })); } catch {}
        return;
      }
      // Validierungen
      const figMap = deps.figureMaps.get(adminRoom);
      if (typeof msg.fromId !== 'string' || typeof msg.toId !== 'string' ||
          !figMap?.has(msg.fromId) || !figMap?.has(msg.toId)) {
        try { ws.send(JSON.stringify({ type: 'error', reason: 'invalid-figure' })); } catch {}
        return;
      }
      if (msg.fromId === msg.toId) {
        try { ws.send(JSON.stringify({ type: 'error', reason: 'self-line' })); } catch {}
        return;
      }
      const validLineTypes = new Set(['relationship', 'tension', 'resource']);
      if (!validLineTypes.has(msg.lineType)) {
        try { ws.send(JSON.stringify({ type: 'error', reason: 'invalid-line-type' })); } catch {}
        return;
      }
      // ID generieren (crypto.randomUUID slice statt nanoid — keine neue Dep)
      const lineId = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
      const createdBy = resolvePlayerId(ws);
      deps.applyMutation(adminRoom, {
        type: 'line_create',
        id: lineId,
        fromId: msg.fromId,
        toId: msg.toId,
        lineType: msg.lineType,
        createdBy,
      });
      const newLine = { id: lineId, fromId: msg.fromId, toId: msg.toId, lineType: msg.lineType, createdBy };
      deps.broadcast(adminRoom, { type: 'line_created', line: newLine });
      deps.schedulePersist(adminRoom);
      break;
    }
    case 'line_delete': {
      const state2 = deps.buildStateFromMutations(adminRoom) || {};
      const role2 = deps.resolveRole(ws, state2.roles || {});
      if (role2 !== 'leiter') {
        try { ws.send(JSON.stringify({ type: 'error', reason: 'forbidden' })); } catch {}
        return;
      }
      if (typeof msg.lineId !== 'string') {
        try { ws.send(JSON.stringify({ type: 'error', reason: 'invalid-line-id' })); } catch {}
        return;
      }
      deps.applyMutation(adminRoom, { type: 'line_delete', lineId: msg.lineId });
      deps.broadcast(adminRoom, { type: 'line_deleted', lineId: msg.lineId });
      deps.schedulePersist(adminRoom);
      break;
    }
    case 'line_type_set': {
      const state3 = deps.buildStateFromMutations(adminRoom) || {};
      const role3 = deps.resolveRole(ws, state3.roles || {});
      if (role3 !== 'leiter') {
        try { ws.send(JSON.stringify({ type: 'error', reason: 'forbidden' })); } catch {}
        return;
      }
      const validTypes = new Set(['relationship', 'tension', 'resource']);
      if (typeof msg.lineId !== 'string' || !validTypes.has(msg.lineType)) {
        try { ws.send(JSON.stringify({ type: 'error', reason: 'invalid-params' })); } catch {}
        return;
      }
      deps.applyMutation(adminRoom, { type: 'line_type_set', lineId: msg.lineId, lineType: msg.lineType });
      deps.broadcast(adminRoom, { type: 'line_type_changed', lineId: msg.lineId, lineType: msg.lineType });
      deps.schedulePersist(adminRoom);
      break;
    }
  }
}

export function startIdleSweep(deps: { checkAllSessions: () => any[]; broadcast: (room: string, msg: any) => void; schedulePersist: (room: string) => void }): NodeJS.Timeout {
  const timer = setInterval(() => {
    if (process.env.MOCK_DB === 'true') return;
    const results = deps.checkAllSessions();
    for (const r of results) {
      if (r.ended) {
        deps.broadcast(r.room, {
          type: 'session_phase_change',
          phase: 'ended',
          transitionedAt: new Date().toISOString(),
          reason: 'idle-timeout',
        });
        deps.broadcast(r.room, { type: 'session_ended', reason: 'idle-timeout' });
        deps.schedulePersist(r.room);
      }
    }
  }, 60_000);
  if (timer.unref) timer.unref();
  return timer;
}
