import type { WsDeps } from './ws-handler';

export function handleAdminSetOptik(ws: any, msg: any, room: string, deps: WsDeps): void {
  // Board-Optik (D4). Persist + propagate to OTHER clients (sender
  // excluded, §13). Late-joiners get it via their snapshot.
  if (!msg.settings || typeof msg.settings !== 'object') return;
  deps.handleAdminSetOptik(room, msg.settings, (m: any) => deps.broadcast(room, m, ws));
  deps.schedulePersist(room);
}

export async function handleAdminSetTemplate(ws: any, msg: any, room: string, deps: WsDeps): Promise<void> {
  // Szenario-Vorlage (D5 choice-persist + D7 figure apply). Persist the
  // chosen templateId into lobbySettings and propagate to OTHER clients
  // (sender excluded). Then load the snapshot and seed it into server
  // state (server-authoritative), broadcasting to ALL so the leiter's
  // board reflects the seed too.
  if (typeof msg.templateId !== 'string') return;
  deps.handleAdminSetTemplate(room, msg.templateId, (m: any) => deps.broadcast(room, m, ws));
  if (deps.loadSnapshotState && deps.applyTemplateToRoom) {
    const snap = await deps.loadSnapshotState(msg.templateId);
    if (snap) deps.applyTemplateToRoom(room, snap, (m: any) => deps.broadcast(room, m));
  }
  deps.schedulePersist(room);
}

export async function handleAdminSetBoardTemplate(ws: any, msg: any, room: string, deps: WsDeps): Promise<void> {
  // T900361: feedback to the sender instead of a silent no-op when the id
  // is not a string or no template resolves for it.
  if (typeof msg.boardTemplateId !== 'string') {
    try { ws.send(JSON.stringify({ type: 'error', reason: 'unknown-board-template' })); } catch {}
    return;
  }
  const { getBoardTemplate } = await import('./board-templates');
  const { getPool } = await import('./db');
  const tpl = await getBoardTemplate(getPool(), msg.boardTemplateId);
  if (tpl?.state && deps.applyTemplateToRoom) {
    deps.applyTemplateToRoom(room, tpl.state, (m: any) => deps.broadcast(room, m));
    deps.schedulePersist(room);
  } else {
    try { ws.send(JSON.stringify({ type: 'error', reason: 'unknown-board-template' })); } catch {}
  }
}

export async function handleAdminResetBoardToDefault(ws: any, _msg: any, room: string, deps: WsDeps): Promise<void> {
  // P4 (D5, T900360): Reset on the brand default scenario. The default is
  // resolved server-side through the P1 `is_default` marker column via P3's
  // marker lookup — no template id ever crosses the wire. The single
  // applyTemplateToRoom pass IS the reset (clear + re-seed); no separate
  // clear mutation. If no default resolves: error to the sender, no change.
  const { getBrandDefaultTemplate } = await import('./db');
  const { resolveBrand } = await import('./auth');
  const brandDefault = await getBrandDefaultTemplate(resolveBrand(process.env));
  if (brandDefault && deps.applyTemplateToRoom) {
    deps.applyTemplateToRoom(room, brandDefault, (m: any) => deps.broadcast(room, m));
    deps.schedulePersist(room);
  } else {
    try { ws.send(JSON.stringify({ type: 'error', reason: 'no-default-template' })); } catch {}
  }
}
