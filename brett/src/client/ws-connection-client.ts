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

export function connectWS(): void {
  // REG-2: idempotent — never open a second socket if one is already
  // CONNECTING/OPEN. The lobby bootstrap (main.ts) opens the socket as soon as the
  // room is known, and bootBoard() later also calls connectWS() when the board
  // mounts; without this guard that would create a duplicate connection.
  const existing = getWs();
  if (existing && (existing.readyState === WebSocket.CONNECTING || existing.readyState === WebSocket.OPEN)) {
    return;
  }
  // Thread room + (when known) the canonical identity into the /sync handshake so
  // the late-join guard (shouldRejectReconnect) can distinguish a true reconnect
  // of an already-active player from a genuine late-joiner. Omit playerId when
  // unknown/anon (server treats null as "not previously in room" → admit).
  const roomFromUrl = new URLSearchParams(location.search).get('room') || 'default';
  const params = new URLSearchParams({ room: roomFromUrl });
  if (currentUser.userId && currentUser.userId !== 'anon') {
    params.set('playerId', currentUser.userId);
  }
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/sync?${params.toString()}`);
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
