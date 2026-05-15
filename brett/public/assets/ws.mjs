// brett/public/assets/ws.js — WebSocket client with reconnect + heartbeat.
const HEARTBEAT_TIMEOUT_MS = 60_000;
const MAX_BACKOFF = 30_000;
const SESSION_CAP_MS = 5 * 60_000;

export function backoffSequence(attempt) {
  return Math.min(1000 * 2 ** attempt, MAX_BACKOFF);
}

export function connect({ url } = {}) {
  const wsUrl = url ?? (typeof location !== 'undefined'
    ? location.origin.replace(/^http/, 'ws')
    : '');
  const listeners = new Map();
  let socket;
  let attempt = 0;
  const sessionStart = Date.now();
  let heartbeatTimer = null;
  let closedByUser = false;

  function emit(type, payload) {
    (listeners.get(type) || []).forEach((fn) => {
      try { fn(payload); } catch (err) { console.error('[ws] listener error', err); }
    });
  }

  function resetHeartbeat() {
    clearTimeout(heartbeatTimer);
    heartbeatTimer = setTimeout(() => {
      try { socket.close(); } catch {}
    }, HEARTBEAT_TIMEOUT_MS);
  }

  function open() {
    socket = new WebSocket(wsUrl);
    socket.addEventListener('open', () => {
      attempt = 0;
      resetHeartbeat();
      emit('open');
      try {
        socket.send(JSON.stringify({ type: 'request_state_snapshot' }));
      } catch {}
    });
    socket.addEventListener('message', (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.type === 'ping') {
        try { socket.send(JSON.stringify({ type: 'pong', t: msg.t })); } catch {}
        resetHeartbeat();
        return;
      }
      emit(msg.type, msg);
      emit('message', msg);
    });
    socket.addEventListener('close', () => {
      clearTimeout(heartbeatTimer);
      emit('close');
      if (closedByUser) return;
      if (Date.now() - sessionStart > SESSION_CAP_MS) {
        emit('reconnect-give-up');
        return;
      }
      const delay = backoffSequence(attempt++);
      emit('reconnect-pending', { delay });
      setTimeout(open, delay);
    });
    socket.addEventListener('error', () => emit('error'));
  }

  open();

  return {
    on(type, fn) {
      const arr = listeners.get(type) || [];
      arr.push(fn);
      listeners.set(type, arr);
    },
    send(msg) {
      if (socket?.readyState === 1) socket.send(JSON.stringify(msg));
    },
    close() {
      closedByUser = true;
      try { socket?.close(); } catch {}
    },
  };
}
