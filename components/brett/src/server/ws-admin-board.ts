import type { WsDeps } from './ws-handler';
import { resolvePlayerId } from './ws-handler';

// Shared by line_create/line_delete/line_type_set: leiter-only gate
// (zusätzlich zur isAdmin-Gate in ws-handler.ts). Sends `forbidden` and
// returns false when the sender is not the leiter.
function requireLeiter(ws: any, room: string, deps: WsDeps): boolean {
  const state = deps.buildStateFromMutations(room) || {};
  const role = deps.resolveRole(ws, state.roles || {});
  if (role !== 'leiter') {
    try { ws.send(JSON.stringify({ type: 'error', reason: 'forbidden' })); } catch {}
    return false;
  }
  return true;
}

export function handleAnchorCreate(ws: any, msg: any, room: string, deps: WsDeps): void {
  if (!msg.anchor || typeof msg.anchor !== 'object' ||
      typeof msg.anchor.x !== 'number' || typeof msg.anchor.z !== 'number') {
    try { ws.send(JSON.stringify({ type: 'error', reason: 'invalid_anchor' })); } catch {}
    return;
  }
  deps.applyMutation(room, { type: 'anchor_create', anchor: msg.anchor });
  const builtAnchors = deps.buildStateFromMutations(room)?.anchors ?? [];
  const added = builtAnchors[builtAnchors.length - 1];
  if (added) {
    deps.broadcast(room, { type: 'anchor_added', anchor: added });
  }
  deps.schedulePersist(room);
}

export function handleAnchorDelete(ws: any, msg: any, room: string, deps: WsDeps): void {
  if (typeof msg.anchorId !== 'string') {
    try { ws.send(JSON.stringify({ type: 'error', reason: 'invalid_anchor_id' })); } catch {}
    return;
  }
  deps.applyMutation(room, { type: 'anchor_delete', anchorId: msg.anchorId });
  deps.broadcast(room, { type: 'anchor_removed', anchorId: msg.anchorId });
  deps.schedulePersist(room);
}

export function handleZoneCreate(ws: any, msg: any, room: string, deps: WsDeps): void {
  if (!msg.zone || typeof msg.zone !== 'object' ||
      typeof msg.zone.x !== 'number' || typeof msg.zone.z !== 'number' ||
      (msg.zone.shape !== 'rect' && msg.zone.shape !== 'circle')) {
    try { ws.send(JSON.stringify({ type: 'error', reason: 'invalid_zone' })); } catch {}
    return;
  }
  deps.applyMutation(room, { type: 'zone_create', zone: msg.zone });
  const builtZones = deps.buildStateFromMutations(room)?.zones ?? [];
  const addedZone = builtZones[builtZones.length - 1];
  if (addedZone) {
    deps.broadcast(room, { type: 'zone_added', zone: addedZone });
  }
  deps.schedulePersist(room);
}

export function handleZoneUpdate(ws: any, msg: any, room: string, deps: WsDeps): void {
  // E1: verschieben/skalieren/umstylen. Zone muss existieren.
  if (typeof msg.zoneId !== 'string') {
    try { ws.send(JSON.stringify({ type: 'error', reason: 'invalid_zone_id' })); } catch {}
    return;
  }
  const zonesBefore: any[] = deps.buildStateFromMutations(room)?.zones ?? [];
  if (!zonesBefore.some((z: any) => z.id === msg.zoneId)) {
    try { ws.send(JSON.stringify({ type: 'error', reason: 'not-found' })); } catch {}
    return;
  }
  deps.applyMutation(room, { type: 'zone_update', ...msg });
  const zonesAfter: any[] = deps.buildStateFromMutations(room)?.zones ?? [];
  const updatedZone = zonesAfter.find((z: any) => z.id === msg.zoneId);
  if (updatedZone) deps.broadcast(room, { type: 'zone_updated', zone: updatedZone });
  deps.schedulePersist(room);
}

export function handleZoneDelete(ws: any, msg: any, room: string, deps: WsDeps): void {
  if (typeof msg.zoneId !== 'string') {
    try { ws.send(JSON.stringify({ type: 'error', reason: 'invalid_zone_id' })); } catch {}
    return;
  }
  deps.applyMutation(room, { type: 'zone_delete', zoneId: msg.zoneId });
  deps.broadcast(room, { type: 'zone_removed', zoneId: msg.zoneId });
  deps.schedulePersist(room);
}

export function handleLineCreate(ws: any, msg: any, room: string, deps: WsDeps): void {
  // Leiter-only check (zusätzlich zur isAdmin-Gate in ws-handler.ts)
  if (!requireLeiter(ws, room, deps)) return;
  // Validierungen
  const figMap = deps.figureMaps.get(room);
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
  deps.applyMutation(room, {
    type: 'line_create',
    id: lineId,
    fromId: msg.fromId,
    toId: msg.toId,
    lineType: msg.lineType,
    createdBy,
  });
  const newLine = { id: lineId, fromId: msg.fromId, toId: msg.toId, lineType: msg.lineType, createdBy };
  deps.broadcast(room, { type: 'line_created', line: newLine });
  deps.schedulePersist(room);
}

export function handleLineDelete(ws: any, msg: any, room: string, deps: WsDeps): void {
  if (!requireLeiter(ws, room, deps)) return;
  if (typeof msg.lineId !== 'string') {
    try { ws.send(JSON.stringify({ type: 'error', reason: 'invalid-line-id' })); } catch {}
    return;
  }
  deps.applyMutation(room, { type: 'line_delete', lineId: msg.lineId });
  deps.broadcast(room, { type: 'line_deleted', lineId: msg.lineId });
  deps.schedulePersist(room);
}

export function handleLineTypeSet(ws: any, msg: any, room: string, deps: WsDeps): void {
  if (!requireLeiter(ws, room, deps)) return;
  const validTypes = new Set(['relationship', 'tension', 'resource']);
  if (typeof msg.lineId !== 'string' || !validTypes.has(msg.lineType)) {
    try { ws.send(JSON.stringify({ type: 'error', reason: 'invalid-params' })); } catch {}
    return;
  }
  deps.applyMutation(room, { type: 'line_type_set', lineId: msg.lineId, lineType: msg.lineType });
  deps.broadcast(room, { type: 'line_type_changed', lineId: msg.lineId, lineType: msg.lineType });
  deps.schedulePersist(room);
}
