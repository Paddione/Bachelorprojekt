// brett/src/client/ws-connection-client.ts
// WebSocket-Verbindungs-Management und Outbound-Send-Helfer (Client-Seite).
// Kein Three.js-Import hier — bleibt Three-free damit der Lazy-Chunk erhalten bleibt.

import { STATE, getWs, setWs, setWsReady, currentUser } from './state';
import type { ClientMessage } from '../types/messages';

let _onWsMessage: ((evt: MessageEvent) => void) = () => {};
export function setMessageHandler(fn: (evt: MessageEvent) => void): void {
  _onWsMessage = fn;
}

function send(msg: ClientMessage): void {
  if ((window as any).__brettIsZuschauer) return;
  const ws = getWs();
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

/** Public send for lobby/admin protocol messages. */
export function sendClient(msg: ClientMessage): void {
  send(msg);
}

/** True iff a socket exists and is OPEN (used to decide sync-send vs open-hook). */
export function isWsOpen(): boolean {
  const ws = getWs();
  return !!ws && ws.readyState === WebSocket.OPEN;
}

export function sendMove(id: string, x: number, z: number, facingY: number): void {
  send({ type: 'move', id, x, z, facingY });
}
export function sendJump(id: string): void {
  send({ type: 'jump', id });
}
export function sendUpdate(fig: any, changes: any): void {
  send({ type: 'update', id: fig.id, changes });
}
export function sendStiffness(value: number): void {
  send({ type: 'stiffness', value });
}
export function sendDelete(): void {
  if (STATE.selectedId) {
    send({ type: 'delete', id: STATE.selectedId });
  }
}
export function sendUndo(): void {
  send({ type: 'session_undo' });
}
export function sendRedo(): void {
  send({ type: 'session_redo' });
}
export function sendAddFigure(fig: any): void {
  send({
    type: 'add',
    figure: {
      id: fig.id,
      x: fig.root.position.x,
      z: fig.root.position.z,
      facingY: fig.facingY,
      label: fig.label,
      color: fig.color,
      appearance: fig.appearance
    }
  });
}

// One-shot callback after WS OPEN + `join` frame (FE-1/REG-4 bootstrap)
let onWsOpen: (() => void) | null = null;
export function setWsOpenHandler(fn: (() => void) | null): void {
  onWsOpen = fn;
}

/**
 * Baut die /sync-WebSocket-URL: room + share_token (T000608, view-only-Link)
 * + playerId (Late-Join-Guard) aus dem URL-Querystring.
 * Omit playerId when unknown/anon (server treats null as "not previously in
 * room" → admit).
 */
export function buildSyncUrl(search: string, host: string, protocol: string, userId: string): string {
  const src = new URLSearchParams(search);
  const params = new URLSearchParams({ room: src.get('room') || 'default' });
  const shareToken = src.get('share_token');
  if (shareToken) params.set('share_token', shareToken);
  const zuschauerToken = src.get('zuschauer_token');
  if (zuschauerToken) params.set('zuschauer_token', zuschauerToken);
  if (userId && userId !== 'anon') params.set('playerId', userId);
  const scheme = protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${host}/sync?${params.toString()}`;
}

export function connectWS(): void {
  // REG-2: idempotent — never open a second socket if one is already
  // CONNECTING/OPEN. The lobby bootstrap (main.ts) opens the socket as soon as the
  // room is known, and bootBoard() later also calls connectWS() when the board
  // mounts; without this guard that would create a duplicate connection.
  const existing = getWs();
  if (existing && (existing.readyState === WebSocket.CONNECTING || existing.readyState === WebSocket.OPEN)) {
    return;
  }
  const roomFromUrl = new URLSearchParams(location.search).get('room') || 'default';
  const ws = new WebSocket(buildSyncUrl(location.search, location.host, location.protocol, currentUser.userId));
  setWs(ws);
  (window as any).__brettWS = ws;
  ws.addEventListener('open', () => {
    setWsReady(true);
    send({ type: 'join', room: roomFromUrl });
    // FE-1/REG-4: fire the bootstrap's one-shot hook (e.g. admin_session_create)
    // only AFTER the socket is OPEN and `join` is sent, so it never races the
    // handshake.
    if (onWsOpen) onWsOpen();
  });
  ws.addEventListener('close', () => {
    setWsReady(false);
    setTimeout(connectWS, 2000);
  });
  ws.addEventListener('message', (evt) => _onWsMessage(evt));
}
