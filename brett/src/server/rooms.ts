import { WebSocket } from 'ws';

export const rooms = new Map<string, Set<any>>();
export const roomParticipants = new Map<string, Map<string, { userId: string; name: string; color: string }>>();

export const PARTICIPANT_PALETTE = ['#4ea1ff', '#3fb950', '#f0a35e', '#c06be0', '#e06b8b', '#6be0d0'];

export function joinRoom(ws: any, room: string): void {
  ws._room = room;
  if (!rooms.has(room)) rooms.set(room, new Set());
  rooms.get(room)!.add(ws);
}

export function leaveRoom(ws: any): string | undefined {
  const room = ws._room;
  if (!room || !rooms.has(room)) return;
  rooms.get(room)!.delete(ws);
  if (rooms.get(room)!.size === 0) rooms.delete(room);
  return room;
}

export function broadcast(room: string, msg: any, exclude?: any): void {
  const json = JSON.stringify(msg);
  const peers = rooms.get(room);
  if (!peers) return;
  for (const peer of peers) {
    if (peer !== exclude && peer.readyState === WebSocket.OPEN) {
      peer.send(json);
    }
  }
}

export function broadcastInfo(room: string): void {
  const count = rooms.get(room)?.size ?? 0;
  broadcast(room, { type: 'info', count });
}

export function addParticipant(room: string, p: { userId: string; name: string }): { userId: string; name: string; color: string } | null {
  if (!p.userId) return null;
  if (!roomParticipants.has(room)) roomParticipants.set(room, new Map());
  const m = roomParticipants.get(room)!;
  const existing = m.get(p.userId);
  if (existing) {
    existing.name = p.name || existing.name;
    return existing;
  }
  const color = PARTICIPANT_PALETTE[m.size % PARTICIPANT_PALETTE.length];
  const participant = { userId: p.userId, name: p.name || p.userId, color };
  m.set(p.userId, participant);
  return participant;
}

export function removeParticipant(room: string, userId: string): void {
  const m = roomParticipants.get(room);
  if (m) m.delete(userId);
}

export function listParticipants(room: string): Array<{ userId: string; name: string; color: string }> {
  const m = roomParticipants.get(room);
  return m ? [...m.values()] : [];
}
