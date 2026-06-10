#!/usr/bin/env bash
# scripts/superpowers-submit-patch.sh — add the "Auswahl ans Terminal" submit
# channel to the brainstorming companion. Idempotent + marker-guarded; safe to
# re-run after a plugin update and as a SessionStart hook.
#
#   helper.js : append scripts/superpowers-submit/helper-submit.js (marker "brainstorm-submit v1")
#   server.cjs: add a loopback-only (127.0.0.1) HTTP /submit listener that writes
#               state/submission.json + an events line + pushes markdown to clip.exe,
#               inject window.__BRAINSTORM_SUBMIT_PORT into served HTML, and clear
#               submission.json on new screen + at startup (marker "/* brainstorm-submit-server v1 */").
#
# The public board server / WS path / HARDEN_PUBLIC short-circuit are NOT touched.
# Usage: bash scripts/superpowers-submit-patch.sh [--check]
set -euo pipefail
MODE="${1:-apply}"
REPO_ROOT="$(cd "$(dirname "$0")" && pwd)/.."
SUBMIT_BLOCK="${REPO_ROOT}/scripts/superpowers-submit/helper-submit.js"
MARKER_H="brainstorm-submit v1"
MARKER_S="/* brainstorm-submit-server v1 */"
shopt -s nullglob globstar
need=0; done_n=0

for root in "$HOME/.claude/plugins/cache" "$HOME/.config/claude/plugins/cache"; do
  [[ -d "$root" ]] || continue
  for helper in "$root"/**/superpowers/**/skills/brainstorming/scripts/helper.js; do
    [[ -f "$helper" ]] || continue
    server="$(dirname "$helper")/server.cjs"
    hp=1; sp=1
    grep -qF "$MARKER_H" "$helper" && hp=0
    grep -qF "$MARKER_S" "$server" 2>/dev/null && sp=0

    if [[ "$MODE" == "--check" ]]; then
      [[ $hp -eq 1 || $sp -eq 1 ]] && { echo "unpatched: $helper" >&2; need=1; }
      continue
    fi

    if [[ $hp -eq 1 ]]; then
      # helper.js is injected inside <script> by the server, so append RAW JS.
      { printf '\n/* %s */\n' "$MARKER_H"; cat "$SUBMIT_BLOCK"; } >> "$helper"
      echo "patched helper: $helper"; done_n=$((done_n+1))
    fi

    if [[ $sp -eq 1 ]]; then
      MARKER_S="$MARKER_S" node - "$server" <<'NODE'
const fs = require('fs');
const f = process.argv[2];
const MARKER = process.env.MARKER_S;
let s = fs.readFileSync(f, 'utf8');

// (anchor, replacement) — each anchor MUST occur exactly once.
const P = [];

// A) define submit config + handleSubmit + startSubmitListener after ownerPid
P.push([
`let ownerPid = process.env.BRAINSTORM_OWNER_PID ? Number(process.env.BRAINSTORM_OWNER_PID) : null;`,
`let ownerPid = process.env.BRAINSTORM_OWNER_PID ? Number(process.env.BRAINSTORM_OWNER_PID) : null;

${MARKER}
let submitPort = null;
let __submitLastNonce = null;
const SUBMIT_PORT_PREF = Number(process.env.BRAINSTORM_SUBMIT_PORT) || (Number(PORT) + 1);
const SUBMIT_MAX_BODY = 32 * 1024;
const SUBMIT_ORIGINS = ['http://localhost:' + PORT, 'http://127.0.0.1:' + PORT];
function submitCors(req, res) {
  const o = req.headers['origin'];
  if (o && SUBMIT_ORIGINS.indexOf(o) !== -1) {
    res.setHeader('Access-Control-Allow-Origin', o);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
    return true;
  }
  return false;
}
function handleSubmit(req, res) {
  const okOrigin = submitCors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(okOrigin ? 204 : 403); res.end(); return; }
  if (req.method !== 'POST' || req.url !== '/submit') { res.writeHead(404); res.end('Not found'); return; }
  if (!okOrigin) { res.writeHead(403); res.end('forbidden'); return; }
  let body = ''; let aborted = false;
  req.on('data', (c) => { body += c; if (body.length > SUBMIT_MAX_BODY) { aborted = true; try { req.destroy(); } catch (e) {} } });
  req.on('end', () => {
    if (aborted) return;
    let ev; try { ev = JSON.parse(body); } catch (e) { res.writeHead(400); res.end('bad json'); return; }
    if (ev.nonce && ev.nonce === __submitLastNonce) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true,"dup":true}'); return; }
    __submitLastNonce = ev.nonce || null;
    const md = String(ev.markdown || '').slice(0, SUBMIT_MAX_BODY);
    try {
      const sub = { v: 1, ts: Date.now(), seq: ev.seq || 0, nonce: ev.nonce || null,
        screen: ev.screen || null, question: ev.question || '', selected: ev.selected || [],
        fields: ev.fields || {}, markdown: md };
      try { fs.chmodSync(STATE_DIR, 0o700); } catch (e) {}
      const subFile = path.join(STATE_DIR, 'submission.json');
      const tmp = subFile + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(sub), { mode: 0o600 });
      fs.renameSync(tmp, subFile);
      const primary = (sub.selected[0] && sub.selected[0].choice) || 'submit';
      const line = JSON.stringify({ type: 'submit', ts: sub.ts, nonce: sub.nonce, choice: primary }) + "\\n";
      if (line.length <= 4 * 1024) fs.appendFileSync(path.join(STATE_DIR, 'events'), line);
    } catch (e) { /* persist best-effort */ }
    try {
      const { spawn } = require('child_process');
      const abs = '/mnt/c/Windows/System32/clip.exe';
      const clipBin = fs.existsSync(abs) ? abs : 'clip.exe';
      const clip = spawn(clipBin, { stdio: ['pipe', 'ignore', 'ignore'] });
      clip.on('error', () => {});
      if (clip.stdin) { clip.stdin.on('error', () => {}); try { clip.stdin.end(md); } catch (e) {} }
    } catch (e) { /* clipboard optional (non-WSL) */ }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"ok":true}');
  });
  req.on('error', () => { try { res.writeHead(400); res.end(); } catch (e) {} });
}
function startSubmitListener() {
  const tryPort = (p, left) => {
    const srv = http.createServer(handleSubmit);
    srv.on('error', (e) => {
      if (e.code === 'EADDRINUSE' && left > 0) tryPort(p + 1, left - 1);
      else console.error('submit-listener failed:', e.message);
    });
    srv.listen(p, '127.0.0.1', () => { submitPort = p; console.log(JSON.stringify({ type: 'submit-listener', port: p })); });
  };
  tryPort(SUBMIT_PORT_PREF, 10);
}`
]);

// B) at startServer: ensure dirs 700, clear stale submission.json, start the listener
P.push([
`  if (!fs.existsSync(CONTENT_DIR)) fs.mkdirSync(CONTENT_DIR, { recursive: true });
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });`,
`  if (!fs.existsSync(CONTENT_DIR)) fs.mkdirSync(CONTENT_DIR, { recursive: true });
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
  try { fs.chmodSync(STATE_DIR, 0o700); } catch (e) {}
  try { fs.unlinkSync(path.join(STATE_DIR, 'submission.json')); } catch (e) {}
  startSubmitListener();`
]);

// C) inject the submit port into the served HTML (non-secret)
P.push([
`    if (html.includes('</body>')) {
      html = html.replace('</body>', helperInjection + '\\n</body>');
    } else {
      html += helperInjection;
    }`,
`    const __portScript = '<script>window.__BRAINSTORM_SUBMIT_PORT=' + (submitPort || 0) + ';</script>';
    const __inj = __portScript + '\\n' + helperInjection;
    if (html.includes('</body>')) {
      html = html.replace('</body>', __inj + '\\n</body>');
    } else {
      html += __inj;
    }`
]);

// D) clear submission.json together with events on a new screen
P.push([
`        const eventsFile = path.join(STATE_DIR, 'events');
        if (fs.existsSync(eventsFile)) fs.unlinkSync(eventsFile);`,
`        const eventsFile = path.join(STATE_DIR, 'events');
        if (fs.existsSync(eventsFile)) fs.unlinkSync(eventsFile);
        try { const __sf = path.join(STATE_DIR, 'submission.json'); if (fs.existsSync(__sf)) fs.unlinkSync(__sf); } catch (e) {}`
]);

const missing = P.map(([a], i) => [i, s.split(a).length - 1]).filter(([, n]) => n !== 1);
if (missing.length) {
  console.error('ERROR: anchors not unique/found ' + JSON.stringify(missing) + ' in ' + f + ' — companion changed; not patched');
  process.exit(2);
}
for (const [a, r] of P) s = s.replace(a, r);
fs.writeFileSync(f, s);
NODE
      echo "patched server: $server"; done_n=$((done_n+1))
    fi
  done
done

if [[ "$MODE" == "--check" ]]; then
  [[ $need -eq 1 ]] && { echo "submit patch needed" >&2; exit 1; }
  echo "submit patch present"; exit 0
fi
echo "submit patch: ${done_n} file edit(s) applied"
