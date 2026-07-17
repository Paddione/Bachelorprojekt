import type { WsDeps } from './ws-handler';
import { resolvePlayerId, gateMutation } from './ws-handler';
// E9: figurenbezogene Broadcasts role-aware — Messages zu hidden-Figuren
// (Notizen, Possess/Release) dürfen Nicht-Leiter nie erreichen (Review-Major).
import { broadcastFigureAware } from './hidden-filter';

export function handleFigurePossess(ws: any, msg: any, room: string, deps: WsDeps): void {
  if (!gateMutation(ws, room, 'figure_possess', msg.figureId, deps)) {
    try { ws.send(JSON.stringify({ type: 'error', reason: 'forbidden' })); } catch {}
    return;
  }
  const figMap = deps.figureMaps.get(room);
  const existingFig = figMap?.get(msg.figureId);
  if (existingFig?.possessor) {
    try { ws.send(JSON.stringify({ type: 'error', reason: 'figure_already_possessed' })); } catch {}
    return;
  }
  const playerId = resolvePlayerId(ws);
  deps.applyMutation(room, { type: 'figure_possess', figureId: msg.figureId, playerId });
  broadcastFigureAware(deps as any, room, {
    type: 'figure_possessed',
    figureId: msg.figureId,
    playerId,
    playerName: ws._session?.name || 'Teilnehmer',
  });
  deps.schedulePersist(room);
}

export function handleFigureRelease(ws: any, msg: any, room: string, deps: WsDeps): void {
  const targetId = msg.figureId;
  if (!gateMutation(ws, room, 'figure_release', targetId, deps)) {
    try { ws.send(JSON.stringify({ type: 'error', reason: 'forbidden' })); } catch {}
    return;
  }
  const playerId = resolvePlayerId(ws);
  if (typeof targetId === 'string') {
    const figMap = deps.figureMaps.get(room);
    const fig = figMap?.get(targetId);
    const role = deps.resolveRole(ws, deps.buildStateFromMutations(room)?.roles || {});
    if (fig?.possessor !== playerId && role !== 'leiter') {
      try { ws.send(JSON.stringify({ type: 'error', reason: 'forbidden' })); } catch {}
      return;
    }
    deps.applyMutation(room, { type: 'figure_release', figureId: targetId, playerId });
    broadcastFigureAware(deps as any, room, { type: 'figure_released', figureId: targetId, playerId });
  } else {
    const figMap = deps.figureMaps.get(room);
    if (figMap) {
      for (const [fid, f] of figMap.entries()) {
        if (f.possessor === playerId) {
          deps.applyMutation(room, { type: 'figure_release', figureId: fid, playerId });
          broadcastFigureAware(deps as any, room, { type: 'figure_released', figureId: fid, playerId });
        }
      }
    }
  }
  deps.schedulePersist(room);
}

export function handleFigureNoteSet(ws: any, msg: any, room: string, deps: WsDeps): void {
  if (typeof msg.figureId !== 'string' || typeof msg.note !== 'string') return;
  if (!gateMutation(ws, room, 'figure_note_set', msg.figureId, deps)) {
    try { ws.send(JSON.stringify({ type: 'error', reason: 'forbidden' })); } catch {}
    return;
  }
  deps.applyMutation(room, {
    type: 'figure_note_set',
    figureId: msg.figureId,
    note: msg.note,
  });
  broadcastFigureAware(deps as any, room, {
    type: 'figure_note_changed',
    figureId: msg.figureId,
    note: msg.note.slice(0, 1000),
  });
  deps.schedulePersist(room);
}
