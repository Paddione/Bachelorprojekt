---
title: "agent-lock-reap-rule0b-ttl — Implementation Plan"
ticket_id: T002513
domains: [agents, testing]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# agent-lock-reap-rule0b-ttl — Implementation Plan

_Ticket: T002513_

## File Structure

```
CHANGED:
  scripts/agent-lock.sh                                               — Regel 0b: Heartbeat-TTL
  tests/spec/active-sessions-hub.bats                                 — RED/GREEN-Tests für Regel 0b
  openspec/changes/agent-lock-reap-rule0b-ttl/specs/active-sessions-hub.md — Delta-Spec (bereits im Branch)
```

**S1-Budget** (nur `.sh` unterliegt S1; `.bats` steht nicht in `gates.yaml → s1.limits`):

| Datei | Ist | Effektiv-Budget | Delta |
|---|---|---|---|
| `scripts/agent-lock.sh` | 507 | 293 | +~6 → ~513 |

## Tasks

### 1. RED-Zustand: BATS-Test für Regel 0b ohne TTL

- [ ] **Failing-Test-Step (RED).** In `tests/spec/active-sessions-hub.bats` drei Tests
      ergänzen: (a) Lock mit totem SID+PID, passendem Worktree+Branch und abgelaufenem
      Heartbeat wird von `reap` entfernt (`.reap.log` enthält `heartbeat-ttl`);
      (b) derselbe Lock mit frischem Heartbeat überlebt `reap`; (c) Altformat ohne
      `heartbeat_at` überlebt `reap`. Der `.last-fetch`-Marker wird vorab getoucht,
      damit `cmd_reap` kein Netzwerk-Fetch auslöst (T002502).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/active-sessions-hub.bats
# expected: FAIL (a) — Regel 0b schützt den Lock trotz abgelaufenem Heartbeat
```

### 2. GREEN: Regel 0b an die Heartbeat-TTL koppeln

- [ ] In `scripts/agent-lock.sh` `_reapable()` (Z. 130-138) den Regel-0b-Block so
      erweitern, dass ein
      Worktree+Branch-Match nur bei frischem Heartbeat (`heartbeat_at` ≤
      `AGENT_LOCK_TTL` alt oder Feld leer) `return 1` liefert; bei abgelaufenem
      Heartbeat `_reap_log "$f" heartbeat-ttl` + `return 0`.
- [ ] **Fix-Step (GREEN).** Alle drei Tests aus Schritt 1 sind grün.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/active-sessions-hub.bats
# expected: PASS
```

### 3. Finale Verifikation

- [ ] **Final Verification.** Die drei Pflicht-Gates laufen lokal durch:

```bash
task test:changed
task freshness:regenerate
task freshness:check
task workspace:validate
```

- [ ] `bash scripts/openspec.sh validate` ist ohne Fehler.
