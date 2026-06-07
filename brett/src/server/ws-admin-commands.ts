import type { WsDeps } from './ws-handler';

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
      const playerId = ws._playerId || ws._session?.name;
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
      deps.schedulePersist(adminRoom);
      try {
        ws.send(JSON.stringify({ type: 'session_created', code: result.code }));
      } catch {}
      break;
    }
    case 'admin_handoff_token': {
      if (typeof msg.targetPlayerId !== 'string') return;
      const fromPlayerId = ws._playerId || ws._session?.name;
      if (!fromPlayerId) return;
      deps.handleAdminHandoffMessage(adminRoom, fromPlayerId, msg.targetPlayerId, (out: any) => deps.broadcast(adminRoom, out));
      deps.schedulePersist(adminRoom);
      break;
    }
    case 'admin_round_stop': {
      deps.handleAdminRoundStop(adminRoom, (m: any) => deps.broadcast(adminRoom, m));
      deps.schedulePersist(adminRoom);
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
  }
}
