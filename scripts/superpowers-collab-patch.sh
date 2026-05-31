#!/usr/bin/env bash
# scripts/superpowers-collab-patch.sh — patch the brainstorming companion for
# collaboration: append the client collab block + who-tag outgoing events
# (helper.js), and relay chat/presence/note + append note/chat to events
# (server.cjs). Idempotent and marker-guarded; safe as a SessionStart hook.
# Usage: bash scripts/superpowers-collab-patch.sh [--check]
set -euo pipefail
MODE="${1:-apply}"
REPO_ROOT=$(cd "$(dirname "$0")" && pwd)/..
COLLAB_BLOCK="${REPO_ROOT}/scripts/superpowers-collab/helper-collab.js"
MARKER="brainstorm-collab v1"
shopt -s nullglob globstar
need=0; done_n=0

for root in "$HOME/.claude/plugins/cache" "$HOME/.config/claude/plugins/cache"; do
  [[ -d "$root" ]] || continue
  for helper in "$root"/**/superpowers/**/skills/brainstorming/scripts/helper.js; do
    [[ -f "$helper" ]] || continue
    server="$(dirname "$helper")/server.cjs"
    hp=1; sp=1
    grep -qF "$MARKER" "$helper" && hp=0
    grep -qF "/* collab-relay */" "$server" 2>/dev/null && sp=0
    if [[ "$MODE" == "--check" ]]; then
      [[ $hp -eq 1 || $sp -eq 1 ]] && { echo "unpatched: $helper" >&2; need=1; }
      continue
    fi
    if [[ $hp -eq 1 ]]; then
      # who-tag: insert after the first 'event.timestamp = Date.now();'
      node -e '
        const fs=require("fs"); const f=process.argv[1];
        let s=fs.readFileSync(f,"utf8");
        if(!s.includes("event.who =")){
          s=s.replace("event.timestamp = Date.now();",
            "event.timestamp = Date.now(); try{event.who=localStorage.getItem(\"brainstorm_who\")||event.who||\"anon\";}catch(e){}");
        }
        fs.writeFileSync(f,s);
      ' "$helper"
      # Append the raw collab JS block (NOT wrapped in <script> — helper.js is
      # already injected inside <script> by the server's helperInjection).
      # The MARKER at the top of helper-collab.js and the double-injection guard
      # (window.__brainstormCollab) make this safe to re-append check-free, but
      # the grep above already skips if the marker is present.
      { printf '\n/* %s */\n' "$MARKER"; cat "$COLLAB_BLOCK"; } >> "$helper"
      echo "patched helper: $helper"; done_n=$((done_n+1))
    fi
    if [[ $sp -eq 1 ]]; then
      node -e '
        const fs=require("fs"); const f=process.argv[1];
        let s=fs.readFileSync(f,"utf8");
        if(!s.includes("/* collab-relay */")){
          s=s.replace(/if \(event\.choice\) \{[\s\S]*?\n  \}/,
            `/* collab-relay */
  if (event.type === "chat" || event.type === "presence" || event.type === "note") { broadcast(event); }
  if (event.choice || event.type === "note" || event.type === "chat") {
    const eventsFile = path.join(STATE_DIR, "events");
    fs.appendFileSync(eventsFile, JSON.stringify(event) + "\\n");
  }`);
        }
        fs.writeFileSync(f,s);
      ' "$server"
      echo "patched server: $server"; done_n=$((done_n+1))
    fi
  done
done

if [[ "$MODE" == "--check" ]]; then
  [[ $need -eq 1 ]] && { echo "collab patch needed" >&2; exit 1; }
  echo "collab patch present"; exit 0
fi
echo "collab patch: ${done_n} file edit(s) applied"
