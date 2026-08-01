# Design: agent-lock-reap-rule0b-ttl

## Problem

`_reapable()` in `scripts/agent-lock.sh` hat drei Schutzschichten für einen Claim:

1. **Regel 0** — lebender SID (mit Heartbeat-TTL-Kopplung, T002392-M3)
2. **Regel 0b** — Worktree+Branch-Match (T002204, Session-Resume) — **ohne TTL**
3. **Regel 0c** — lebender PID

Regel 0b prüft ausschließlich `[ -d "$wt" ]` + `git -C "$wt" rev-parse --abbrev-ref HEAD`
gegen das Lock-Feld `branch`. Ein toter Halter, dessen Worktree nicht gelöscht wurde,
wird dadurch dauerhaft als lebendig gewertet — unabhängig von `owner_sid`, `owner_pid`
und `heartbeat_at`.

## Kernentscheidung

**Regel 0b wird an die Heartbeat-TTL gekoppelt.** Der Worktree-Branch-Match ist nur noch
ein Liveness-Hinweis, wenn der Heartbeat jünger als `AGENT_LOCK_TTL` ist. Begründung
(T002448-M8): der Heartbeat ist das einzige belastbare Lebenssignal — eine Session hat
pro Bash-Aufruf eine neue PID, und die SID ist erst seit T002375-p1 harness-stabil.

### Warum ein Resume den Heartbeat erneuert

`cmd_claim` (Z. 294-295) schreibt bei SID-Match den bestehenden Lock mit frischem
`heartbeat_at` neu. Eine fortgesetzte Session ruft beim Weiterarbeiten erneut `claim` auf
(oder `refresh`); der Heartbeat ist also immer frisch, solange der Halter aktiv ist. Ein
toter Halter ruft nichts mehr auf — der Heartbeat läuft ab und der Lock wird reapbar.

### Warum das nicht über-reapt

- **Lebende Session:** frischer Heartbeat → Regel 0b greift unverändert (Schutz bleibt).
- **Tote Session mit gelöschtem Worktree:** bereits heute `worktree-missing`-Reap.
- **Tote Session mit intaktem Worktree:** Heartbeat läuft ab → `heartbeat-ttl`-Reap.
  Genau der bislang unbedeckte Fall.
- **Altformat ohne `heartbeat_at`:** Regel 0b bleibt voll schützend (`[ -z "$hb" ]`).

## Umsetzung (minimal)

In `_reapable()`, Regel-0b-Block (Z. 130-138):

```bash
if [ -n "$wt" ] && [ "$wt" != "-" ] && [ -d "$wt" ] && [ -n "$br" ]; then
  local wt_branch
  wt_branch="$(git -C "$wt" rev-parse --abbrev-ref HEAD 2>/dev/null)"
  if [ -n "$wt_branch" ] && [ "$wt_branch" = "$br" ]; then
    # [T002513] Regel 0b respektiert die Heartbeat-TTL: ein Resume erneuert den
    # Heartbeat (claim/refresh), ein toter Halter nicht.
    if [ -n "$hb" ] && [ "$(( now - hb ))" -gt "$AGENT_LOCK_TTL" ]; then
      _reap_log "$f" heartbeat-ttl; return 0
    fi
    return 1
  fi
fi
```

Der Reap-Grund ist explizit `heartbeat-ttl` (auditierbar in `.reap.log`), nicht der
Zufallsfall über die `pid-dead`-Kaskade. `now` und `hb` sind bereits im Funktion-Scope.

## Nicht-Ziele

- Kein Refactor von `_reapable` (S1: 800 für `.sh`, genug Budget — aber unnötiger Umbau).
- Kein Heartbeat-Refresher als neue Infrastruktur.
- Kein Aufräumen historischer Zombie-Locks (gehört in repo-hygiene).
