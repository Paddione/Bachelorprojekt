// Thin adapter over the single coaching WebSocket exposed by index.html as window.__brettWS.
export function createWire(getSocket) {
  const handlers = new Map();
  function dispatch(msg) { (handlers.get(msg.type) || []).forEach((fn) => fn(msg)); }
  return {
    attach() {
      const ws = getSocket();
      if (!ws) return false;
      ws.addEventListener('message', (ev) => {
        let msg; try { msg = JSON.parse(ev.data); } catch { return; }
        dispatch(msg);
      });
      return true;
    },
    on(type, fn) { const a = handlers.get(type) || []; a.push(fn); handlers.set(type, a); },
    send(type, payload = {}) {
      const ws = getSocket();
      if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type, ...payload }));
    },
  };
}
