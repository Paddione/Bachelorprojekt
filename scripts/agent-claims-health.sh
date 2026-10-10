#!/usr/bin/env bash
# agent-claims-health.sh — subagent-übergreifende Issue-Kennzahl aus den
# agent-lock Claims (SDLC-Cockpit-E2E).
#
# Ein Claim ist "live", solange seine Session/Harness lebt, sonst "stale" —
# ein stale Claim heißt: ein Subagent ist gestorben oder hängt, ohne seinen
# Claim freizugeben. Genau das ist das früheste maschinenlesbare Signal für
# Probleme quer über Subagenten.
#
# stdout: JSON {"live":N,"stale":M,"claims":[{scope,id,tool,sid,state,label,file}]}
# Exit 0, wenn kein Claim stale ist, sonst 1 (AGENT_CLAIMS_HEALTH_ALLOW_STALE=n
# erlaubt bis zu n stale Claims).
#
# Test overrides: AGENT_LOCK_DIR, AGENT_LOCK_FAKE_ALIVE (siehe agent-lock.sh).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

bash "${REPO_ROOT}/scripts/agent-lock.sh" list | python3 -c '
import json, os, sys

claims = []
for line in sys.stdin:
    parts = line.split()
    if len(parts) < 7 or parts[0] in ("SCOPE", "(keine"):
        continue
    scope, cid, tool, sid, state = parts[0], parts[1], parts[2], parts[3], parts[4]
    file = parts[-1]
    label = " ".join(parts[5:-1])
    claims.append({"scope": scope, "id": cid, "tool": tool, "sid": sid,
                   "state": state, "label": label, "file": file})

live = sum(1 for c in claims if c["state"] == "live")
stale = sum(1 for c in claims if c["state"] == "stale")
print(json.dumps({"live": live, "stale": stale, "claims": claims}))
allow = int(os.environ.get("AGENT_CLAIMS_HEALTH_ALLOW_STALE", "0"))
if stale > allow:
    print(f"agent-claims-health: {stale} stale, {live} live", file=sys.stderr)
    sys.exit(1)
'
