# Proposal: agent-lock-agy-reap-T900306

## Why
Antigravity / `agy` exportiert `ANTIGRAVITY_CONVERSATION_ID` (und `ANTIGRAVITY_AGENT=1`), jedoch weder `CLAUDE_CODE_SESSION_ID`, `CLAUDE_SESSION_ID` noch `OPENCODE_SESSION_ID`.
Dadurch treten zwei kritische Fehler auf:
1. **SID-Drift und Blockierung in `agy`**: `scripts/agent-lock-identity.sh`, `scripts/agent-lock.sh` und `scripts/hooks/worktree-write-guard.sh` kennen `ANTIGRAVITY_CONVERSATION_ID` nicht. `_my_sid` fällt auf die per-Bash-Call Unix-SID zurück, wodurch die Session bei jedem Tool-Aufruf eine neue SID erhält. Ein geclaimter Worktree-Lock wird beim nächsten Schreibzugriff vom `worktree-write-guard` als fremd eingestuft und blockiert den Zugriff mit der Warnung `_my_sid — weder CLAUDE_CODE_SESSION_ID... noch AGENT_LOCK_SID gesetzt`.
2. **Unreapable Dead Locks durch Hintergrund-LSPs**: Wenn ein Agent oder Editor im Worktree arbeitet, starten Language Server (`typescript-language-server`, `tsserver`, `yaml-language-server`, etc.). Diese LSPs verbleiben nach Prozess-Ende im Hintergrund mit `cwd` im Worktree. `_worktree_has_active_process` in `scripts/agent-lock-activity.sh` scannte alle `/proc/*/cwd` ohne Ausschluss von Daemon/LSP-Prozessen. Dadurch hielten tote LSPs das Signal `_worktree_has_active_process=0` dauerhaft aufrecht: `agent-lock.sh reap` stufte den Lock als aktiv ein und räumte ihn weder bei toter `owner_pid` noch nach Ablauf der Heartbeat-TTL ab.

## What
1. **Harness-Stabile SID für Antigravity / `agy`**:
   - `ANTIGRAVITY_CONVERSATION_ID` in `_AGENT_LOCK_SID_ENVS` aufnehmen (`scripts/agent-lock-identity.sh`, `scripts/agent-lock.sh`, `scripts/hooks/worktree-write-guard.sh`).
   - `_detect_tool()` erkennt Antigravity / `agy` (über `ANTIGRAVITY_CONVERSATION_ID` / `ANTIGRAVITY_AGENT`) und liefert `agy`.
   - `scripts/lib/main-checkout-foreign-guard.sh` erkennt auch `agy` / `antigravity`.
2. **LSP- und Hintergrund-Daemon-Filterung in `_worktree_has_active_process`**:
   - `scripts/agent-lock-activity.sh`: `_worktree_has_active_process` ignoriert passive Language Server und Editor-Daemons (`*language-server*`, `*tsserver*`, `*typingsInstaller*`, `*gopls*`, `*rust-analyzer*`, `*pyright*`, `*vscode-*`, etc.), sodass verwaiste Locks mit toter `owner_pid` oder abgelaufener TTL korrekt geerntet werden (`pid-dead` / `heartbeat-ttl`).

_Ticket: T900306_
