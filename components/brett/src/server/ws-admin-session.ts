import type { WsDeps } from './ws-handler';
import { resolvePlayerId } from './ws-handler';
import { broadcastSnapshotFigureAware } from './hidden-filter';

export function handleAdminSessionCreate(ws: any, _msg: any, room: string, deps: WsDeps): void {
  const playerId = resolvePlayerId(ws);
  if (!playerId) return;
  // CP-2: do NOT silently reset a LIVE session back to lobby. A raw
  // session_phase_set bypasses the per-edge transition allowlist
  // (active/paused→lobby is forbidden), so re-creating over an active
  // round would re-open it. Reject create from active/paused; allow it
  // from null/lobby/warmup/ended (a fresh session after a prior one
  // ended is a legitimate workflow that transitionPhase would block as
  // terminal).
  const curPhase = deps.buildStateFromMutations(room)?.sessionPhase;
  if (curPhase === 'active' || curPhase === 'paused') {
    try { ws.send(JSON.stringify({ type: 'error', reason: 'session-active' })); } catch {}
    return;
  }
  const result = deps.handleAdminSessionCreate(room, playerId);
  deps.broadcast(room, {
    type: 'session_phase_change',
    phase: 'lobby',
    transitionedAt: new Date().toISOString(),
    reason: 'admin-create',
  });
  deps.broadcast(room, {
    type: 'admin_token_changed',
    holderPlayerId: playerId,
    reason: 'handoff',
  });
  deps.clearParticipants(room);
  const creatorParticipant = deps.addParticipant(room, {
    userId: playerId,
    name: ws._session?.name || playerId,
  });
  if (creatorParticipant) {
    deps.broadcast(room, {
      type: 'presence_join',
      participant: { ...creatorParticipant, role: 'leiter', ready: false },
    });
  }
  deps.schedulePersist(room);
  try {
    ws.send(JSON.stringify({ type: 'session_created', code: result.code }));
  } catch {}
}

export function handleAdminHandoffToken(ws: any, msg: any, room: string, deps: WsDeps): void {
  if (typeof msg.targetPlayerId !== 'string') return;
  const fromPlayerId = resolvePlayerId(ws);
  if (!fromPlayerId || fromPlayerId === 'anon') return;
  deps.handleAdminHandoffMessage(room, fromPlayerId, msg.targetPlayerId, (out: any) => deps.broadcast(room, out));
  deps.schedulePersist(room);
}

export function handleAdminRoundStop(_ws: any, _msg: any, room: string, deps: WsDeps): void {
  deps.handleAdminRoundStop(room, (m: any) => deps.broadcast(room, m));
  deps.schedulePersist(room);
  // Flush event log on session end (Slice 5, T000472) — ensures no events lost.
  if (deps.flushEventLog) {
    deps.flushEventLog(room).catch((err: any) =>
      console.error('[brett/event-log] flush on end error:', err));
  }
}

export function handleAdminRoundPause(_ws: any, _msg: any, room: string, deps: WsDeps): void {
  deps.handleAdminRoundPause(room, (m: any) => deps.broadcast(room, m));
  deps.schedulePersist(room);
}

export function handleAdminCoachingStepsSet(_ws: any, msg: any, room: string, deps: WsDeps): void {
  deps.applyMutation(room, { type: 'coaching_steps_set', steps: msg.steps, index: msg.index });
  deps.broadcast(room, { type: 'coaching_steps_change', steps: msg.steps, index: msg.index });
  deps.schedulePersist(room);
}

export function handleAdminRoundStart(_ws: any, _msg: any, room: string, deps: WsDeps): void {
  const res = deps.handleAdminRoundStart(room, (m: any) => deps.broadcast(room, m));
  if (res && res.ok && !res.noop) deps.schedulePersist(room);
}

// Shared by session_undo/session_redo: re-snapshot the room after the stack
// moved. Was duplicated verbatim in both cases.
function resnapshotRoom(deps: WsDeps, room: string): void {
  // Re-Snapshot an alle: buildStateFromMutations gibt aktuellen Zustand
  const freshState = deps.buildStateFromMutations(room);
  if (freshState) {
    const figures = Object.values(freshState.figures ?? {});
    // E9-Review-Blocker: Re-Snapshot MUSS role-aware gefiltert werden
    // (Plain-Broadcast leakte hidden-Figuren an Nicht-Leiter). Zones/
    // Anchors/Lines/Moderation mitsenden, sonst wischt der Client sie.
    broadcastSnapshotFigureAware(deps as any, room, {
      type: 'snapshot',
      figures,
      stiffness: freshState.stiffness,
      phase: freshState.sessionPhase,
      sessionCode: freshState.sessionCode,
      optik: freshState.optik,
      moderation: freshState.moderation ?? null,
      anchors: freshState.anchors ?? [],
      zones: freshState.zones ?? [],
      lines: freshState.lines ?? [],
    });
  }
  if (deps.getUndoStatus) {
    deps.broadcast(room, {
      type: 'undo_stack_changed',
      ...deps.getUndoStatus(room),
    });
  }
}

export function handleSessionUndo(ws: any, _msg: any, room: string, deps: WsDeps): void {
  if (!deps.performUndo) return;
  const result = deps.performUndo(room);
  if (result.applied) {
    resnapshotRoom(deps, room);
    deps.schedulePersist(room);
  } else {
    try {
      ws.send(JSON.stringify({ type: 'error', reason: 'undo-stack-empty' }));
    } catch {}
  }
}

export function handleSessionRedo(ws: any, _msg: any, room: string, deps: WsDeps): void {
  if (!deps.performRedo) return;
  const result = deps.performRedo(room);
  if (result.applied) {
    resnapshotRoom(deps, room);
    deps.schedulePersist(room);
  } else {
    try {
      ws.send(JSON.stringify({ type: 'error', reason: 'redo-stack-empty' }));
    } catch {}
  }
}
