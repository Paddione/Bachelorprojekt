# Design: Automatic Brainstorm Tunnel Launch in dev-flow Feature Path

**Date:** 2026-05-13  
**Scope:** `.claude/skills/dev-flow/SKILL.md` — Feature path brainstorming step  
**Goal:** When Claude enters the Feature path and invokes brainstorming, it automatically patches helper.js for wss://, starts the brainstorm server, publishes the tunnel to brainstorm.mentolder.de, and redirects the user there — all without manual terminal intervention.

---

## Problem

The dev-flow skill's Feature path says "invoke superpowers:brainstorming" and refers to a separate "Visual Companion via brainstorm.mentolder.de" section for tunnel setup. In practice this means:
- The brainstorming skill starts a localhost server
- Clicking options in the browser only works on that localhost URL
- Over HTTPS (brainstorm.mentolder.de) the upstream `ws://` WebSocket is blocked as mixed content
- Patrick has to manually run the tunnel in a separate terminal

## Solution

Add a mandatory pre-launch block to the Feature path, before `superpowers:brainstorming` is invoked.

### Pre-launch sequence (Schritt 1a)

```
1. bash scripts/superpowers-helper-patch.sh
   → ensures wss:// (not ws://) in helper.js before browser connects
   → idempotent, exits 0 if already patched

2. RESULT=$(bash $(find ~/.claude/plugins/cache/claude-plugins-official/superpowers \
     -name start-server.sh | sort -V | tail -1) \
     --project-dir /home/patrick/Bachelorprojekt)
   PORT=$(echo "$RESULT" | jq -r '.port')
   SCREEN_DIR=$(echo "$RESULT" | jq -r '.screen_dir')
   STATE_DIR=$(echo "$RESULT" | jq -r '.state_dir')

3. task brainstorm:publish -- $PORT   [run_in_background: true on the Bash call]
   → SSH reverse-tunnel; must stay alive for the session

4. Tell Patrick:
   "Brainstorming-Companion läuft unter https://brainstorm.mentolder.de — jetzt im Browser öffnen."
```

### Brainstorming skill invocation (Schritt 1b)

Invoke `superpowers:brainstorming` and immediately establish override context:

> "Visual-Companion-Server läuft bereits (Port `$PORT`). `screen_dir=$SCREEN_DIR`, `state_dir=$STATE_DIR`. Rufe `start-server.sh` nicht nochmals auf. Wenn du den User zur Browser-URL dirigierst, nenne immer `https://brainstorm.mentolder.de` — niemals `http://localhost:*`."

This prevents double-starting the server and ensures all "open the URL" prompts point to the public HTTPS endpoint.

### Error handling

| Failure | Action |
|---------|--------|
| `superpowers-helper-patch.sh` non-zero | Abort pre-launch. "wss:// patch failed — run `bash scripts/superpowers-helper-patch.sh` manually and retry." |
| `start-server.sh` fails / no JSON | Abort pre-launch. "brainstorm server konnte nicht gestartet werden — prüfe ob das superpowers Plugin installiert ist." |
| `task brainstorm:publish` exits immediately | Warn and continue. "Tunnel konnte nicht aufgebaut werden — `task brainstorm:status` ausführen." Brainstorming proceeds terminal-only (no visual companion). |

### Visual Companion section (existing)

Becomes a troubleshooting appendix — unchanged content, but the intro line updated to "Diagnose & manuelle Bedienung" so it's clearly not the primary path.

---

## What is NOT changing

- The wss:// patch script (`scripts/superpowers-helper-patch.sh`) — unchanged
- Taskfile brainstorm tasks — unchanged  
- k3d/brainstorm-sish.yaml — unchanged
- The "Visual Companion via brainstorm.mentolder.de" section content — kept as reference, only framing updated
- Fix and Chore paths — no brainstorming step, no change

---

## Success criteria

1. Claude runs patch + server start + publish without Patrick opening a terminal
2. Patrick gets a single URL to open: `https://brainstorm.mentolder.de`
3. Clicking an option in the browser records to `$STATE_DIR/events` (wss:// connection succeeds)
4. If tunnel fails, brainstorming still works (terminal-only fallback, not a hard abort)
