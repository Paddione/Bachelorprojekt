---
name: factory-autopilot
description: Software Factory Autopilot lifecycle — install, status, uninstall the headless dispatcher (systemd timer-driven pipeline.js orchestrator) that autonomously processes backlog tickets.
agent: bachelorprojekt-test
---

> **Mishap Tracking:** As you execute this skill, maintain a running `MISHAP_LOG`.
> For every anomaly, unexpected state, broken component, security concern, or
> configuration drift you notice — even if unrelated to the current task — add
> an entry with: `type` (broken/degraded/suspicious/security/drift), `title`,
> `description`, and `component`. Invoke `mishap-tracker` at the very end.

# factory-autopilot

The Autopilot is a **headless timer-driven dispatcher** that polls the backlog, schedules tickets, and runs the full Software Factory pipeline (scout → design → plan → implement → verify → deploy) without human interaction.

---

## Architecture

```
systemd --user timer
    │
    │  OnUnitInactiveSec=5min / Persistent=true
    ▼
factory.service (Type=oneshot, RuntimeMaxSec=3600)
    │
    ▼
wakeup.sh
  ├── flock -n (single-flight via /tmp/factory-tick.lock)
  ├── git-crypt unlock
  ├── auto-enqueue.sh (both brands)
  ├── claude --workflow dispatcher.js
  └── idle-retick loop (FACTORY_IDLE_RETICK_ENABLED=true)
        │
        ▼
dispatcher.js (Claude Code Workflow)
  ├── Phase PREP: kill-switch → daily-cap → watchdog → schedule
  ├── Phase LAUNCH: parallel() pipeline.js per ticket
  └── Phase METRICS: throughput summary → PushNotification
```

### Key properties

- **Push-based, no GitOps**: The autopilot runs from the local checkout, pushes branches, opens PRs, merges. No Flux/Argo.
- **Idempotent**: Every tick re-evaluates the backlog — processed tickets are skipped (status != `backlog`).
- **Fail-closed**: Kill-switch, daily-cap, conflict-gate all abort before any launch.
- **Single-flight**: `flock -n` prevents overlapping ticks.

---

## Phase 1 — Install (`task factory:autopilot:install`)

```bash
task factory:autopilot:install
```

**What it does:**
1. Symlinks `scripts/factory/factory.service` → `~/.config/systemd/user/factory.service`
2. Symlinks `scripts/factory/factory.timer` → `~/.config/systemd/user/factory.timer`
3. Runs `systemctl --user daemon-reload`
4. Enables and starts: `systemctl --user enable --now factory.timer`

**Prerequisites:**
- `systemd --user` manager must be running (default on most Linux desktops; check with `systemctl --user status`)
- `claude` CLI must be in `$PATH` (the binary executed by `wakeup.sh`)
- git-crypt must be unlocked or `~/.config/factory/autopilot.env` must provide the key

**Optional environment config** (`~/.config/factory/autopilot.env`):
```bash
FACTORY_REPO=/home/patrick/Bachelorprojekt
FACTORY_DRY_RUN=false            # set true to prevent any real side effects
FACTORY_IDLE_RETICK_ENABLED=true  # loop immediately when queue non-empty
FACTORY_IDLE_RETICK_DELAY=5       # seconds between idle reticks
FACTORY_DAILY_DEPLOY_CAP=5        # max deploys per day per brand
FACTORY_TICK_LOCK=/tmp/factory-tick.lock
GIT_CRYPT_KEY_PATH=/path/to/key  # optional, for auto-unlock
CLAUDE_CODE_EFFORT_LEVEL=         # intentionally empty (neutralized by wakeup.sh)
```

---

## Phase 2 — Status (`task factory:autopilot:status`)

```bash
task factory:autopilot:status
```

**Output:**

```
NEXT                          LEFT     LAST                          PASSED    UNIT
Mon 2026-06-15 12:05:00 CEST  4min     Mon 2026-06-15 11:55:00 CEST  5min ago  factory.timer
--- last factory.service tick ---
  ● factory.service - Software Factory dispatcher tick (headless wakeup)
     Loaded: loaded
     Active: inactive (dead) since Mon 2026-06-15 11:55:02 CEST
   Duration: 1min 23.456s
   ...
```

**Interpretation:**

| Signal | Meaning |
|--------|---------|
| `NEXT` shows a future time | Timer is active and will fire |
| `Active: inactive (dead)` | Normal — oneshot, last tick completed |
| `Active: running` | A tick is currently executing |
| `Active: failed` | Last tick crashed — check `journalctl -u factory.service --since "5 min ago"` |
| Timer not listed | Autopilot not installed |

### Manual queue inspection

```bash
# Staged plans waiting to be picked up
kubectl exec -n workspace --context fleet deploy/shared-db -c postgres -- \
  psql -U postgres -d website -c \
  "SELECT external_id, title, status, priority FROM tickets.tickets WHERE status='plan_staged' ORDER BY priority;"

# Backlog (ready for scheduling)
kubectl exec -n workspace --context fleet deploy/shared-db -c postgres -- \
  psql -U postgres -d website -c \
  "SELECT external_id, title, status, priority FROM tickets.tickets WHERE status='backlog' ORDER BY planning_rank NULLS LAST;"

# In-flight (currently being processed)
kubectl exec -n workspace --context fleet deploy/shared-db -c postgres -- \
  psql -U postgres -d website -c \
  "SELECT external_id, title, status, effort, areas FROM tickets.tickets WHERE status='in_progress';"

# Blocked
kubectl exec -n workspace --context fleet deploy/shared-db -c postgres -- \
  psql -U postgres -d website -c \
  "SELECT external_id, title, retry_count FROM tickets.tickets WHERE status='blocked';"
```

---

## Phase 3 — Uninstall (`task factory:autopilot:uninstall`)

```bash
task factory:autopilot:uninstall
```

**What it does:**
1. Stops and disables the timer: `systemctl --user disable --now factory.timer`
2. Removes the symlinked unit files
3. Runs `systemctl --user daemon-reload`

**Note:** Does NOT clean `~/.config/factory/autopilot.env` or remove worktrees created by the autopilot. Clean those manually if needed.

---

## Phase 4 — Configuration Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `FACTORY_IDLE_RETICK_ENABLED` | `true` | When `true`, wakeup.sh loops immediately (instead of waiting for the timer) if the queue is non-empty. Set to `false` for fixed 5-min intervals. |
| `FACTORY_IDLE_RETICK_DELAY` | `5` | Seconds between reticks when queue non-empty. Higher = less CPU/API load. |
| `FACTORY_DAILY_DEPLOY_CAP` | `5` | Maximum deploys per brand per day. Once reached, no new pipeline:deploy phases run until the next calendar day. |
| `FACTORY_TICK_LOCK` | `/tmp/factory-tick.lock` | Lockfile path for single-flight. Change if multiple repos need separate locks. |
| `FACTORY_DRY_RUN` | `true` | When `true`, all pipeline phases run in dry mode (no git push, no deploy, no PR merge). Set to `false` in production. |
| `FACTORY_REPO` | `/home/patrick/Bachelorprojekt` | Repository path the autopilot operates on. |

---

## Phase 5 — Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Timer doesn't fire | `systemd --user` not running or units not installed | `systemctl --user status`; re-run `task factory:autopilot:install` |
| `Active: failed` | Pipeline crashed or timeout | `journalctl -u factory.service --since "5 min ago" --no-pager` |
| Autopilot runs but no tickets processed | Kill-switch is ON, daily cap reached, or queue empty | Check `factory_control` in DB: `SELECT * FROM tickets.factory_control;` |
| `flock: Resource temporarily unavailable` | Another tick is already running | `ls -la /tmp/factory-tick.lock` — if stale, `rm -f /tmp/factory-tick.lock` |
| git-crypt locked | Key not available | Set `GIT_CRYPT_KEY_PATH` in `~/.config/factory/autopilot.env` or unlock manually |
| `claude: command not found` | Claude Code CLI not in PATH | `which claude`; add to PATH in `autopilot.env` |
| `RuntimeMaxSec` hit | Pipeline took > 1 hour | Check `journalctl` — may need to split the feature or increase `RuntimeMaxSec` in `factory.service` |
| Pipeline creates broken PR | CI fails after merge | Check `pipeline.js` Deploy phase — it runs `task test:all` + `freshness:check` before merge |

---

## Related Skills

| Skill | Beziehung |
|-------|-----------|
| `operations-management` | Querschnitt — Incident-Triage, PR-Überwachung |
| `dev-flow-execute` | Folge — Factory nutzt denselben Pipeline-Code |
| `cluster-deployment` | Voraussetzung — Cluster muss für Deploy-Phase erreichbar sein |
| `mishap-tracker` | Abschluss — protokolliert Frictions |
