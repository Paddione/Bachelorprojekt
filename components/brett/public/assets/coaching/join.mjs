// brett/public/assets/coaching/join.mjs
export function normalizeCode(raw) {
  const s = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  return s.length === 6 ? `${s.slice(0, 3)}-${s.slice(3)}` : s;
}
export function joinUrl(code) {
  return `/api/join?code=${encodeURIComponent(code)}`;
}
export function mountJoinOverlay({ root = document.body, navigate = (u) => { window.location.href = u; } } = {}) {
  const wrap = document.createElement('div');
  wrap.id = 'coaching-join';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;' +
    'background:#0e1116ee;color:#e6edf3;font:15px system-ui;';
  wrap.innerHTML = '<div style="background:#161b22;border:1px solid #2a3340;border-radius:12px;padding:24px;min-width:280px">' +
    '<h2 style="margin:0 0 12px">Session beitreten</h2>' +
    '<input id="cj-code" placeholder="ABC-DEF" maxlength="7" ' +
    'style="width:100%;padding:10px;background:#0b0f14;border:1px solid #2a3340;border-radius:8px;color:#e6edf3;font:16px monospace">' +
    '<button id="cj-go" style="margin-top:12px;width:100%;padding:10px;border:0;border-radius:8px;background:#4ea1ff;color:#04111f;font-weight:600">Beitreten</button>' +
    '<p id="cj-err" style="color:#f0a35e;min-height:18px;margin:8px 0 0;font-size:13px"></p></div>';
  root.appendChild(wrap);
  const input = wrap.querySelector('#cj-code');
  input.addEventListener('input', () => { input.value = normalizeCode(input.value); });
  wrap.querySelector('#cj-go').addEventListener('click', () => {
    const code = normalizeCode(input.value);
    if (code.length !== 7) { wrap.querySelector('#cj-err').textContent = 'Bitte 6 Zeichen eingeben.'; return; }
    navigate(joinUrl(code));
  });
  return { remove: () => wrap.remove() };
}
