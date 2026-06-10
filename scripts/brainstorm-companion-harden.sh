#!/usr/bin/env bash
# scripts/brainstorm-companion-harden.sh — idempotently harden the superpowers
# brainstorming companion (server.cjs) for PUBLIC, unauthenticated exposure
# (Tailscale Funnel). Marker-guarded + re-appliable after a plugin update.
#
# Fixes (verified by the public-board-hardening review, 2026-06-10):
#   MUST-FIX  E) GET /files/.. (or /files/. , /files/) -> EISDIR uncaught crash:
#               add statSync().isFile() guard + try/catch + process.on('uncaughtException').
#   MUST-FIX  B/C) unbounded WS frame / accumulation buffer -> Buffer.alloc OOM:
#               cap payload at 64 KB, drop oversized accumulation.
#   HARDEN    D) MAX_CLIENTS=50 + (public) Origin allowlist on the WS upgrade.
#   HARDEN    F) BRAINSTORM_PUBLIC=1 -> read-only board: drop ALL client->server
#               side effects (no broadcast, no events append) — blocks anonymous
#               decision/prompt-injection into <state_dir>/events.
#   HARDEN    G) per-event (4 KB) + events-file (5 MB) caps for interactive mode.
#
# Usage: bash scripts/brainstorm-companion-harden.sh [--check]
set -euo pipefail
MODE="${1:-apply}"

python3 - "$MODE" <<'PY'
import sys, glob, os
mode = sys.argv[1] if len(sys.argv) > 1 else 'apply'
MARKER = "/* brainstorm-harden v1 */"

# (anchor, replacement) — exact, single-occurrence string replacements.
PATCHES = [
 # A) process-level safety net + tunables (also carries the MARKER)
 (r'''const path = require('path');''',
  r'''const path = require('path');

/* brainstorm-harden v1 */
process.on('uncaughtException', (e) => { try { console.error('uncaughtException', e && e.stack || e); } catch (_) {} });
process.on('unhandledRejection', (e) => { try { console.error('unhandledRejection', e); } catch (_) {} });
const HARDEN_PUBLIC = process.env.BRAINSTORM_PUBLIC === '1';
const HARDEN_MAX_FRAME = 64 * 1024;
const HARDEN_MAX_CLIENTS = 50;
const HARDEN_MAX_EVENT = 4 * 1024;
const HARDEN_MAX_EVENTS_FILE = 5 * 1024 * 1024;'''),

 # B) frame-size cap in decodeFrame (before allocation)
 (r'''  const maskOffset = offset;''',
  r'''  if (payloadLen > HARDEN_MAX_FRAME) throw new Error('frame too large');
  const maskOffset = offset;'''),

 # C) accumulation-buffer cap in the socket data handler
 (r'''  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);''',
  r'''  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    if (buffer.length > HARDEN_MAX_FRAME * 2) { try { socket.destroy(); } catch (_) {} clients.delete(socket); return; }'''),

 # D) client cap + (public) Origin allowlist on upgrade
 (r'''  let buffer = Buffer.alloc(0);
  clients.add(socket);''',
  r'''  if (clients.size >= HARDEN_MAX_CLIENTS) { try { socket.destroy(); } catch (_) {} return; }
  if (HARDEN_PUBLIC) { const o = req.headers['origin']; if (o && o !== ('https://' + URL_HOST)) { try { socket.destroy(); } catch (_) {} return; } }
  let buffer = Buffer.alloc(0);
  clients.add(socket);'''),

 # E) /files/ directory-read crash guard (MUST-FIX)
 (r'''    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(fs.readFileSync(filePath));''',
  r'''    let __st;
    try { __st = fs.statSync(filePath); } catch (e) { res.writeHead(404); res.end('Not found'); return; }
    if (!__st.isFile()) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    try {
      const __body = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(__body);
    } catch (e) { res.writeHead(500); res.end('Error'); }'''),

 # F) public read-only short-circuit in handleMessage
 (r'''  touchActivity();
  console.log(JSON.stringify({ source: 'user-event', ...event }));''',
  r'''  touchActivity();
  if (HARDEN_PUBLIC) return; /* brainstorm-harden: read-only public board */
  console.log(JSON.stringify({ source: 'user-event', ...event }));'''),

 # G) per-event + events-file caps on the append (interactive mode)
 (r'''    fs.appendFileSync(eventsFile, JSON.stringify(event) + "\n");''',
  r'''    { const __l = JSON.stringify(event) + "\n"; try { if (__l.length <= HARDEN_MAX_EVENT && !(fs.existsSync(eventsFile) && fs.statSync(eventsFile).size > HARDEN_MAX_EVENTS_FILE)) fs.appendFileSync(eventsFile, __l); } catch (_) {} }'''),
]

roots = [os.path.expanduser("~/.claude/plugins/cache"), os.path.expanduser("~/.config/claude/plugins/cache")]
servers = []
for root in roots:
    servers += glob.glob(os.path.join(root, "**/superpowers/**/skills/brainstorming/scripts/server.cjs"), recursive=True)

if not servers:
    print("brainstorm-harden: no companion server.cjs found", file=sys.stderr); sys.exit(0)

need = 0; done = 0
for srv in sorted(set(servers)):
    s = open(srv, encoding="utf-8").read()
    if MARKER in s:
        if mode != "--check": print(f"already hardened: {srv}")
        continue
    if mode == "--check":
        print(f"unpatched: {srv}", file=sys.stderr); need = 1; continue
    # verify every anchor present exactly once before touching anything
    missing = [i for i,(a,_) in enumerate(PATCHES) if s.count(a) != 1]
    if missing:
        print(f"ERROR: anchors not unique/found {missing} in {srv} — companion version changed; not patched", file=sys.stderr)
        sys.exit(2)
    for a, r in PATCHES:
        s = s.replace(a, r, 1)
    open(srv, "w", encoding="utf-8").write(s)
    print(f"hardened: {srv}"); done += 1

if mode == "--check":
    sys.exit(1 if need else 0)
print(f"brainstorm-harden: {done} file(s) hardened")
PY
