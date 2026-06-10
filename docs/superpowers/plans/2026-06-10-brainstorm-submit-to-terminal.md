---
title: Brainstorm „Auswahl ans Terminal" — Implementation Plan
ticket_id: null
domains: [website, infra, db, test, security]
status: active
pr_number: null
---

# Brainstorm „Auswahl ans Terminal" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein „✓ Auswahl ans Terminal"-Knopf in jedem Visual-Companion-Encounter, der die komplette Maskenauswahl über einen loopback-isolierten HTTP-Listener in die Windows-Zwischenablage (clip.exe) + `state/submission.json` schreibt — read-only übers Funnel garantiert.

**Architecture:** Der öffentliche Board-Server (`server.cjs`, 0.0.0.0:47600, funnel-gemappt) bleibt unangetastet read-only. Ein **separater HTTP-Listener bindet `127.0.0.1:47601`** (nicht funnel-gemappt) und nimmt `POST /submit` nur vom lokalen Desktop-Browser entgegen. `helper.js` injiziert einen schwebenden Knopf, der nur auf der http-localhost-Seite rendert. Auslieferung über ein eigenes idempotentes, marker-guarded Patch-Skript (Plugin-Cache-Dateien).

**Tech Stack:** Node (vanilla `http`/`child_process`, kein npm), Bash, bats-core, WSL `clip.exe`, Tailscale serve/funnel.

**Spec:** `docs/superpowers/specs/2026-06-10-brainstorm-submit-to-terminal-design.md`

---

## File Structure

| Pfad | Verantwortung | Aktion |
|---|---|---|
| `scripts/superpowers-submit/helper-submit.js` | Client-IIFE: schwebender Knopf, `gatherSelection()`, `fetch POST /submit`. Wird an `helper.js` angehängt. | Create |
| `scripts/superpowers-submit-patch.sh` | Idempotenter Patcher: hängt Client-Block an `helper.js` (Marker `brainstorm-submit v1`) + 4 String-Replaces in `server.cjs` (Marker `/* brainstorm-submit-server v1 */`). `--check`-Modus. | Create |
| `tests/unit/superpowers-submit-patch.bats` | Patch-Mechanik: idempotent, `--check`, Marker-Skip, Anker-Abbruch bei Drift. | Create |
| `scripts/tests/brainstorm-submit-smoke.sh` | Execute-Zeit-Smoke: patcht eine Fixture-Kopie, bootet den Server, `POST /submit` → 200 + `submission.json`(600) + events; Bad-Origin → 403; Dedupe. | Create |
| `scripts/brainstorm-bridge.sh` | Neues Subcommand `submission`; Submit-Patch in `cmd_start` + `service install` verdrahten (+ Restart). | Modify |
| `Taskfile.yml` | `superpowers-submit-patch.bats` in den Offline-bats-Batch aufnehmen. | Modify |
| `docs/superpowers/references/brainstorm-bridge-wsl.md` | Submit-Knopf + loopback-Listener + `submission`-Subcommand dokumentieren. | Modify |

Cache-Quellen (Anker verifiziert, count=1): `~/.claude/plugins/cache/claude-plugins-official/superpowers/5.1.0/skills/brainstorming/scripts/{server.cjs,helper.js}`.

---

## Task 1: Client-Block `helper-submit.js`

**Files:**
- Create: `scripts/superpowers-submit/helper-submit.js`

- [x] **Step 1: Verzeichnis + Datei anlegen**

```bash
mkdir -p scripts/superpowers-submit
```

Create `scripts/superpowers-submit/helper-submit.js` mit exakt diesem Inhalt (reines DOM, kein `innerHTML` mit Inhalt; Render-Gate = http-localhost):

```javascript
(function () {
  if (window.__brainstormSubmit) return;
  window.__brainstormSubmit = true;

  // Local-owner-only gate: render ONLY on the loopback http board. The public
  // funnel page is https://<magicdns> -> button never appears; a fetch from
  // https -> http://localhost would be mixed-content-blocked anyway.
  var isLocal = location.protocol === 'http:' &&
    (location.hostname === 'localhost' || location.hostname === '127.0.0.1');
  var submitPort = window.__BRAINSTORM_SUBMIT_PORT;
  if (!isLocal || !submitPort) return;

  function gatherSelection() {
    var selected = [];
    document.querySelectorAll('.options .selected, .cards .selected').forEach(function (el) {
      var h3 = el.querySelector('h3');
      var label = (h3 ? h3.textContent : el.textContent) || '';
      selected.push({ choice: el.dataset.choice || null, label: label.trim().slice(0, 200) });
    });
    var fields = {};
    document.querySelectorAll('input, textarea, select').forEach(function (f) {
      var key = f.name || f.id;
      if (!key) return;
      if (f.type === 'checkbox' || f.type === 'radio') { if (f.checked) fields[key] = f.value || true; }
      else if (f.value) fields[key] = f.value;
    });
    var q = document.querySelector('h2') || document.querySelector('h1');
    var question = (q ? q.textContent : document.title || '').trim();
    return { question: question, selected: selected, fields: fields };
  }

  function renderMarkdown(sel) {
    var lines = ['«BRAINSTORM-AUSWAHL»'];
    if (sel.question) lines.push('Frage: ' + sel.question);
    sel.selected.forEach(function (s) {
      lines.push('- Auswahl: ' + (s.choice ? s.choice + ' — ' : '') + '"' + s.label + '"');
    });
    Object.keys(sel.fields).forEach(function (k) {
      lines.push('- Feld[' + k + ']: ' + sel.fields[k]);
    });
    lines.push('«ENDE»');
    return lines.join('\n');
  }

  function makeButton() {
    if (document.getElementById('bs-submit') || !document.body) return;
    var note = document.createElement('div');
    note.id = 'bs-submit-note';
    note.style.cssText = 'position:fixed;left:12px;bottom:52px;z-index:99999;' +
      'font:12px system-ui,sans-serif;background:rgba(0,0,0,.7);padding:4px 8px;' +
      'border-radius:6px;display:none';
    function feedback(msg, ok) {
      note.textContent = msg;
      note.style.color = ok ? '#34c759' : '#ff9f0a';
      note.style.display = 'block';
    }
    var btn = document.createElement('button');
    btn.id = 'bs-submit';
    btn.type = 'button';
    btn.textContent = '✓ Auswahl ans Terminal';
    btn.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:99999;' +
      'background:#0a84ff;color:#fff;border:0;border-radius:10px;padding:10px 16px;' +
      'font:600 13px system-ui,sans-serif;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.4)';
    btn.addEventListener('click', function () {
      var sel = gatherSelection();
      if (!sel.selected.length && !Object.keys(sel.fields).length) {
        feedback('Nichts ausgewählt', false);
        return;
      }
      var markdown = renderMarkdown(sel);
      var nonce = String(Date.now()) + '-' + Math.floor(Math.random() * 1e6);
      btn.disabled = true;
      setTimeout(function () { btn.disabled = false; }, 1500);
      fetch('http://localhost:' + submitPort + '/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          question: sel.question, selected: sel.selected, fields: sel.fields,
          markdown: markdown, nonce: nonce, screen: location.pathname
        })
      }).then(function (r) {
        feedback(r.ok ? '✓ kopiert — jetzt Strg+V im Terminal' : 'Fehler beim Senden', r.ok);
      }).catch(function () {
        feedback('nur lokal verfügbar', false);
      });
    });
    document.body.appendChild(note);
    document.body.appendChild(btn);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', makeButton);
  } else {
    makeButton();
  }

  window.brainstorm = Object.assign(window.brainstorm || {}, {
    submit: function () { var b = document.getElementById('bs-submit'); if (b) b.click(); }
  });
})();
```

- [x] **Step 2: Syntax prüfen**

Run: `node --check scripts/superpowers-submit/helper-submit.js`
Expected: keine Ausgabe, Exit 0.

- [x] **Step 3: Commit**

```bash
git add scripts/superpowers-submit/helper-submit.js
git commit -m "feat(brainstorm): client submit block (floating button, gatherSelection, POST)"
```

---

## Task 2: Patch-Skript `superpowers-submit-patch.sh`

**Files:**
- Create: `scripts/superpowers-submit-patch.sh`

- [x] **Step 1: Skript anlegen**

Create `scripts/superpowers-submit-patch.sh` mit exakt diesem Inhalt. Es folgt dem collab-Patch-Muster (helper.js append) + harden-Muster (server.cjs node-String-Replace mit Anker-Eindeutigkeitsprüfung). Eigene Marker, koexistiert mit harden + collab.

```bash
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
```

- [x] **Step 2: Ausführbar machen + Syntaxcheck**

Run:
```bash
chmod +x scripts/superpowers-submit-patch.sh
bash -n scripts/superpowers-submit-patch.sh
```
Expected: keine Ausgabe, Exit 0.

- [x] **Step 3: Commit**

```bash
git add scripts/superpowers-submit-patch.sh
git commit -m "feat(brainstorm): idempotent submit-channel patcher (helper.js append + server.cjs loopback listener)"
```

---

## Task 3: Patch-Mechanik-Test `superpowers-submit-patch.bats`

**Files:**
- Create: `tests/unit/superpowers-submit-patch.bats`

- [x] **Step 1: Failing test schreiben**

Create `tests/unit/superpowers-submit-patch.bats` (Stand-in-Fixtures tragen die exakten Anker; `$HOME` zeigt auf einen Fake-Cache — wie `superpowers-collab-patch.bats`):

```bash
#!/usr/bin/env bats
# superpowers-submit-patch.bats — submit patch is idempotent, marker-guarded, anchor-safe.

setup() {
  ROOT="${BATS_TEST_TMPDIR}/cache/x/superpowers/y/skills/brainstorming/scripts"
  mkdir -p "$ROOT"
  cat > "$ROOT/helper.js" <<'EOF'
(function(){ window.brainstorm = { send: 1 }; connect(); })();
EOF
  # server.cjs stand-in carrying all four anchors verbatim.
  cat > "$ROOT/server.cjs" <<'EOF'
const http = require('http');
const PORT = 47600;
let ownerPid = process.env.BRAINSTORM_OWNER_PID ? Number(process.env.BRAINSTORM_OWNER_PID) : null;
function handleRequest(req, res) {
    if (html.includes('</body>')) {
      html = html.replace('</body>', helperInjection + '\n</body>');
    } else {
      html += helperInjection;
    }
}
function startServer() {
  if (!fs.existsSync(CONTENT_DIR)) fs.mkdirSync(CONTENT_DIR, { recursive: true });
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
      if (!knownFiles.has(filename)) {
        knownFiles.add(filename);
        const eventsFile = path.join(STATE_DIR, 'events');
        if (fs.existsSync(eventsFile)) fs.unlinkSync(eventsFile);
        console.log('screen-added');
      }
}
EOF
  export HOME="${BATS_TEST_TMPDIR}"
  mkdir -p "${BATS_TEST_TMPDIR}/.claude/plugins"
  ln -s "${BATS_TEST_TMPDIR}/cache" "${BATS_TEST_TMPDIR}/.claude/plugins/cache"
  SCRIPT="${BATS_TEST_DIRNAME}/../../scripts/superpowers-submit-patch.sh"
}

@test "applies helper block + server submit listener" {
  run bash "$SCRIPT"
  [ "$status" -eq 0 ]
  grep -q "brainstorm-submit v1" "$ROOT/helper.js"
  grep -q "__brainstormSubmit" "$ROOT/helper.js"
  grep -qF "/* brainstorm-submit-server v1 */" "$ROOT/server.cjs"
  grep -q "startSubmitListener" "$ROOT/server.cjs"
  grep -q "127.0.0.1" "$ROOT/server.cjs"
  grep -q "__BRAINSTORM_SUBMIT_PORT" "$ROOT/server.cjs"
  grep -q "submission.json" "$ROOT/server.cjs"
}

@test "re-running is a no-op (idempotent)" {
  bash "$SCRIPT"
  cp "$ROOT/helper.js" "$ROOT/helper.js.1"; cp "$ROOT/server.cjs" "$ROOT/server.cjs.1"
  bash "$SCRIPT"
  diff "$ROOT/helper.js" "$ROOT/helper.js.1"
  diff "$ROOT/server.cjs" "$ROOT/server.cjs.1"
}

@test "--check exits non-zero before patch, zero after" {
  run bash "$SCRIPT" --check
  [ "$status" -eq 1 ]
  bash "$SCRIPT"
  run bash "$SCRIPT" --check
  [ "$status" -eq 0 ]
}

@test "aborts (exit 2) when a server anchor is missing/duplicated" {
  echo "// drifted: no anchors here" > "$ROOT/server.cjs"
  run bash "$SCRIPT"
  [ "$status" -eq 2 ]
}
```

- [x] **Step 2: Test laufen lassen — muss fehlschlagen (Skript fehlt noch nicht? → es existiert; daher prüfen wir gegen das in Task 2 erstellte Skript)**

> TDD-Hinweis: Task 2 erzeugt das Skript zuerst. Falls strikt rot-grün gewünscht, dieser Test wird VOR Task 2 geschrieben — dann schlägt er mit „No such file" fehl. In der hier gewählten Reihenfolge (Skript zuerst) verifiziert dieser Test das Verhalten.

Run: `./tests/unit/lib/bats-core/bin/bats tests/unit/superpowers-submit-patch.bats`
Expected: 4 Tests grün (`4 tests, 0 failures`).

- [x] **Step 3: Commit**

```bash
git add tests/unit/superpowers-submit-patch.bats
git commit -m "test(brainstorm): submit-patch idempotency + anchor-safety bats"
```

---

## Task 4: `brainstorm-bridge.sh` — `submission`-Subcommand + Patch-Verdrahtung

**Files:**
- Modify: `scripts/brainstorm-bridge.sh`

- [x] **Step 1: `cmd_submission()` nach `cmd_choice()` einfügen**

Anker (Original, `scripts/brainstorm-bridge.sh:168-171`):
```bash
cmd_choice() {
  local s; s="$(target_session)"; [[ -n "$s" ]] || { echo "keine aktive Session" >&2; exit 1; }
  "$SELF_DIR/brainstorm-extract-choice.sh" "${s}state"
}
```
Ersetzen durch (Original + neue Funktion):
```bash
cmd_choice() {
  local s; s="$(target_session)"; [[ -n "$s" ]] || { echo "keine aktive Session" >&2; exit 1; }
  "$SELF_DIR/brainstorm-extract-choice.sh" "${s}state"
}

cmd_submission() {
  local s; s="$(target_session)"; [[ -n "$s" ]] || { echo "keine aktive Session" >&2; exit 1; }
  local f="${s}state/submission.json"
  [[ -f "$f" ]] && cat "$f" || { echo "keine submission (Knopf noch nicht gedrückt)" >&2; exit 1; }
}
```

- [x] **Step 2: Submit-Patch in `cmd_start` verdrahten (vor dem Launch)**

Anker (Original, Anfang von `cmd_start`, `scripts/brainstorm-bridge.sh:116-118`):
```bash
cmd_start() {
  local port session pid t
  # Dauer-Service aktiv? Dann nicht konkurrieren — auf dessen Board verweisen.
```
Ersetzen durch:
```bash
cmd_start() {
  local port session pid t
  "$SELF_DIR/superpowers-submit-patch.sh" >/dev/null 2>&1 || true   # Submit-Kanal idempotent in den Cache patchen
  # Dauer-Service aktiv? Dann nicht konkurrieren — auf dessen Board verweisen.
```

- [x] **Step 3: Submit-Patch in `service install` verdrahten + Restart**

Anker (Original, `scripts/brainstorm-bridge.sh:229-230`):
```bash
    install)
      "$SELF_DIR/brainstorm-companion-harden.sh" || true          # 1) härten (idempotent)
```
Ersetzen durch:
```bash
    install)
      "$SELF_DIR/brainstorm-companion-harden.sh" || true          # 1) härten (idempotent)
      "$SELF_DIR/superpowers-submit-patch.sh" || true             # 1b) Submit-Kanal (idempotent)
```

Anker (Original, `scripts/brainstorm-bridge.sh:240`):
```bash
      systemctl --user enable --now "$SERVICE_NAME"
```
Ersetzen durch (Restart lädt die frisch gepatchte Cache-Datei):
```bash
      systemctl --user enable "$SERVICE_NAME"
      systemctl --user restart "$SERVICE_NAME"
```

- [x] **Step 4: `submission` in das case-Statement + Usage aufnehmen**

Anker (Original, `scripts/brainstorm-bridge.sh:266-270`):
```bash
  choice)  cmd_choice ;;
  funnel)  cmd_funnel ;;
  service) shift; cmd_service "$@" ;;
  stop)    cmd_stop ;;
  *) echo "usage: $0 {start|urls|show <file>|choice|funnel|service <install|remove|status>|stop}" >&2; exit 2 ;;
```
Ersetzen durch:
```bash
  choice)  cmd_choice ;;
  submission) cmd_submission ;;
  funnel)  cmd_funnel ;;
  service) shift; cmd_service "$@" ;;
  stop)    cmd_stop ;;
  *) echo "usage: $0 {start|urls|show <file>|choice|submission|funnel|service <install|remove|status>|stop}" >&2; exit 2 ;;
```

- [x] **Step 5: Syntaxcheck**

Run: `bash -n scripts/brainstorm-bridge.sh`
Expected: keine Ausgabe, Exit 0.

- [x] **Step 6: Commit**

```bash
git add scripts/brainstorm-bridge.sh
git commit -m "feat(brainstorm): bridge submission subcommand + wire submit-patch into start/service install"
```

---

## Task 5: Execute-Zeit-Smoke `brainstorm-submit-smoke.sh`

**Files:**
- Create: `scripts/tests/brainstorm-submit-smoke.sh`

- [x] **Step 1: Smoke-Skript anlegen**

Create `scripts/tests/brainstorm-submit-smoke.sh` (patcht eine Fixture-Kopie der echten Cache-Dateien, bootet den Server, testet `/submit`). Läuft NICHT im CI-Offline-Batch (bootet einen Node-Server); für die Execute-Verifikation gedacht.

```bash
#!/usr/bin/env bash
# brainstorm-submit-smoke.sh — boot a patched companion server in a temp dir and
# exercise the loopback /submit listener. Run during execution verification.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="$(ls -d "$HOME"/.claude/plugins/cache/claude-plugins-official/superpowers/*/skills/brainstorming/scripts | tail -1)"
TMP="$(mktemp -d)"
trap 'kill "${SRVPID:-0}" 2>/dev/null || true; rm -rf "$TMP"' EXIT

# Fake cache layout so the patch driver ($HOME-scan) finds it.
FAKE="$TMP/home"
DST="$FAKE/.claude/plugins/cache/x/superpowers/5/skills/brainstorming/scripts"
mkdir -p "$DST"
cp "$SRC"/server.cjs "$SRC"/helper.js "$SRC"/frame-template.html "$DST"/

HOME="$FAKE" bash "$REPO/scripts/superpowers-submit-patch.sh"
node --check "$DST/server.cjs"

PORT=47650; SUB=47651
BRAINSTORM_DIR="$TMP/session" BRAINSTORM_PORT="$PORT" BRAINSTORM_SUBMIT_PORT="$SUB" \
  BRAINSTORM_HOST=127.0.0.1 node "$DST/server.cjs" >"$TMP/srv.log" 2>&1 &
SRVPID=$!
for i in $(seq 1 30); do curl -sf -o /dev/null "http://127.0.0.1:$PORT/" && break; sleep 0.2; done

ok=0; fail=0
check() { if [[ "$1" == "$2" ]]; then echo "OK  $3"; ok=$((ok+1)); else echo "FAIL $3 (got '$1' want '$2')"; fail=$((fail+1)); fi; }

# 1) bad origin -> 403
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:$SUB/submit" \
  -H 'origin: https://evil.example' -H 'content-type: application/json' --data '{"markdown":"x"}')
check "$code" "403" "bad origin rejected"

# 2) good origin -> 200 + submission.json (mode 600) + events line
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:$SUB/submit" \
  -H "origin: http://localhost:$PORT" -H 'content-type: application/json' \
  --data '{"markdown":"«BRAINSTORM-AUSWAHL»\nFrage: T\n- Auswahl: B — \"x\"\n«ENDE»","selected":[{"choice":"B","label":"x"}],"nonce":"n1"}')
check "$code" "200" "good origin accepted"
[[ -f "$TMP/session/state/submission.json" ]] && { echo "OK  submission.json written"; ok=$((ok+1)); } || { echo "FAIL submission.json missing"; fail=$((fail+1)); }
perm=$(stat -c '%a' "$TMP/session/state/submission.json" 2>/dev/null || echo "?")
check "$perm" "600" "submission.json mode 600"
grep -q '"type":"submit"' "$TMP/session/state/events" && { echo "OK  events line"; ok=$((ok+1)); } || { echo "FAIL events line"; fail=$((fail+1)); }

# 3) dedupe: same nonce -> dup:true
dup=$(curl -s -X POST "http://127.0.0.1:$SUB/submit" -H "origin: http://localhost:$PORT" \
  -H 'content-type: application/json' --data '{"markdown":"y","nonce":"n1"}')
case "$dup" in *'"dup":true'*) echo "OK  nonce dedupe"; ok=$((ok+1));; *) echo "FAIL nonce dedupe (got $dup)"; fail=$((fail+1));; esac

echo "---- smoke: $ok ok, $fail fail ----"
[[ $fail -eq 0 ]]
```

- [x] **Step 2: Ausführbar machen + Syntaxcheck**

Run:
```bash
chmod +x scripts/tests/brainstorm-submit-smoke.sh
bash -n scripts/tests/brainstorm-submit-smoke.sh
```
Expected: keine Ausgabe, Exit 0.

- [x] **Step 3: Smoke ausführen**

Run: `bash scripts/tests/brainstorm-submit-smoke.sh`
Expected: `---- smoke: 6 ok, 0 fail ----`, Exit 0. (clip.exe-Push wird auf Linux/CI still verworfen; submission.json/events bleiben.)

- [x] **Step 4: Commit**

```bash
git add scripts/tests/brainstorm-submit-smoke.sh
git commit -m "test(brainstorm): execute-time /submit listener smoke (origin, write, dedupe)"
```

---

## Task 6: Doku + Test-Verdrahtung

**Files:**
- Modify: `Taskfile.yml`
- Modify: `docs/superpowers/references/brainstorm-bridge-wsl.md`

- [x] **Step 1: bats in den Offline-Batch aufnehmen**

Anker (Original, `Taskfile.yml`, im `test:unit:offline-batch`):
```
        tests/unit/superpowers-collab-patch.bats
        tests/unit/helper-collab-headless.bats
```
Ersetzen durch:
```
        tests/unit/superpowers-collab-patch.bats
        tests/unit/superpowers-submit-patch.bats
        tests/unit/helper-collab-headless.bats
```

- [x] **Step 2: coverage-guard prüfen (neue bats ist gewired)**

Run: `bash scripts/tests/unit-coverage-guard.sh`
Expected: Exit 0 (keine ungewireten bats).

- [x] **Step 3: Referenz-Doc ergänzen**

In `docs/superpowers/references/brainstorm-bridge-wsl.md` nach dem `## Ad-hoc interaktive Session`-Block diesen Abschnitt einfügen:

```markdown
## Auswahl ans Terminal (Submit-Knopf)

In **jedem** Encounter rendert `helper.js` auf der **localhost**-Seite einen schwebenden
Knopf „✓ Auswahl ans Terminal". Klick → die komplette Maskenauswahl (markierte Optionen +
Formularfelder + Frage) geht per `POST /submit` an einen **separaten, nur an `127.0.0.1`
gebundenen** HTTP-Listener (Default-Port `BRAINSTORM_PORT+1`, **nicht** funnel-gemappt).
Der Listener (a) schreibt `state/submission.json` (mode 600) + eine `events`-Zeile, (b) pusht
den gerenderten Sentinel-Block (`«BRAINSTORM-AUSWAHL» … «ENDE»`) via `clip.exe` in die
Windows-Zwischenablage. Der Nutzer fügt mit **Strg+V** ein und drückt **Enter**.

- **Read-only übers Funnel bleibt garantiert:** der Submit-Port ist nicht gemappt, der Knopf
  rendert nur auf `http://localhost`/`127.0.0.1` (die Funnel-Seite ist `https://<magicdns>` →
  kein Knopf; `https→http`-fetch wäre mixed-content-blockiert). Remote-gekko kann NICHT absenden.
- Auslieferung: `scripts/superpowers-submit-patch.sh` (idempotent, Marker `brainstorm-submit v1`),
  von `service install` und `start` automatisch angewandt.
- Agent zieht die Auswahl bei Bedarf: `scripts/brainstorm-bridge.sh submission` (gibt
  `state/submission.json` aus); `choice` bleibt funktionsfähig.
```

In der `## Verwandt`-Liste am Dateiende ergänzen:
```markdown
- `scripts/superpowers-submit-patch.sh` — idempotenter Submit-Kanal-Patch (loopback /submit)
```

- [x] **Step 4: Commit**

```bash
git add Taskfile.yml docs/superpowers/references/brainstorm-bridge-wsl.md
git commit -m "docs(brainstorm): document submit channel + wire submit-patch bats into test:all"
```

---

## Task 7: Verifikation (full)

**Files:** keine

- [x] **Step 1: Offline-Tests grün**

Run: `task test:all`
Expected: alle grün, inkl. `superpowers-submit-patch.bats` (4 Tests) + coverage-guard.

- [x] **Step 2: Freshness**

Run: `task freshness:check`
Expected: grün. Falls ein generiertes Artefakt (repo-index/quality:index) die neuen Skripte erwartet → regenerieren (z.B. `task quality:index` o.ä. gemäß Fehlermeldung), Diff committen:
```bash
git add -A && git commit -m "chore(freshness): regenerate index after submit-channel scripts"
```

- [x] **Step 3: Listener-Smoke**

Run: `bash scripts/tests/brainstorm-submit-smoke.sh`
Expected: `6 ok, 0 fail`.

- [ ] **Step 4: Live-Patch + Service-Neustart**

Run:
```bash
bash scripts/superpowers-submit-patch.sh
grep -c "brainstorm-submit-server v1" "$(ls -d "$HOME"/.claude/plugins/cache/claude-plugins-official/superpowers/*/skills/brainstorming/scripts | tail -1)/server.cjs"
bash scripts/brainstorm-bridge.sh service install
bash scripts/brainstorm-bridge.sh service status
```
Expected: server.cjs trägt den Marker (count ≥ 1); Service `active`; `localhost:47600 -> HTTP 200`.

- [ ] **Step 5: Manuelle Browser-Verifikation**

1. `bash scripts/brainstorm-bridge.sh show <eine-test-maske>.html` (oder eine echte Brainstorm-Maske).
2. Im auto-geöffneten `http://localhost:47600`: eine Option markieren / ein Feld füllen → Knopf „✓ Auswahl ans Terminal" sichtbar (unten links) → klicken → Feedback „✓ kopiert — jetzt Strg+V im Terminal".
3. Im Terminal **Strg+V** → der `«BRAINSTORM-AUSWAHL» … «ENDE»`-Block erscheint vorausgefüllt.
4. `bash scripts/brainstorm-bridge.sh submission` → druckt das `submission.json`.
5. Die öffentliche Funnel-URL (`https://<magicdns>/`) öffnen → der Knopf erscheint **NICHT** (read-only bestätigt).

- [ ] **Step 6: requesting-code-review + PR**

Nach grüner Verifikation: `superpowers:requesting-code-review`, dann PR öffnen und **sofort** Auto-Merge setzen:
```bash
gh pr create --fill --base main
gh pr merge <n> --squash --auto
```

---

## Self-Review (vom Plan-Autor durchgeführt)

- **Spec-Abdeckung:** §4.1 server.cjs → Task 2 (Blöcke A–D) + Task 5 Smoke; §4.2 helper.js → Task 1 + Task 2-Append; §4.3 bridge → Task 4; §4.4 Format → Task 1 `renderMarkdown` + Task 5 Assertion; §5 Security (Origin/Dedupe/600/loopback/clip-fallback) → Task 2-Code + Task 5-Assertions; §8 Tests → Task 3 (bats) + Task 5 (smoke) + Task 7 (manuell). Out-of-Scope (remote-submit, Token, frame-template) bewusst nicht beplant. **Keine Lücke.**
- **Platzhalter-Scan:** keine TBD/„handle errors"/„similar to" — vollständiger Code in jedem Code-Step.
- **Typ-Konsistenz:** `submitPort`, `__submitLastNonce`, `SUBMIT_PORT_PREF`, `SUBMIT_ORIGINS`, `handleSubmit`, `startSubmitListener`, Marker `brainstorm-submit v1` / `/* brainstorm-submit-server v1 */`, `window.__BRAINSTORM_SUBMIT_PORT`, `window.__brainstormSubmit` — durchgängig identisch in Task 1/2/3/5.
