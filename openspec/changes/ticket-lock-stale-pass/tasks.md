---
title: ticket-lock-stale-pass — Implementation Plan
ticket_id: T005560
domains: [infra, test, docs]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# ticket-lock-stale-pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `agent-lock.sh check ticket` meldet tote Halter als `held-stale` (rc=4); der ticket.sh-Write-Guard lässt rc=4 mit Warnung durch. Lebende Halter bleiben blockiert (rc=3).

**Architecture:** Advisory-Erweiterung des Check-Contracts — der Lock bleibt bestehen, nur die Antwort differenziert. Die Reapable-Entscheidung bleibt unangetastet.

**Tech Stack:** Bash, BATS (vendored).

**Spec:** `openspec/changes/ticket-lock-stale-pass/design.md`

## Global Constraints

- `_reapable` NICHT ändern — der Lock wird bei rc=4 nicht entfernt.
- Halter-Felder (tool/label/sid) in der Guard-Warnung ausgeben wie im bestehenden rc=3-Pfad.
- SID-Drift-Residualfall (T002498-M10) bleibt über `TICKET_LOCK_OVERRIDE=1` abgedeckt — nicht Teil dieses Fixes.

## File Structure

```
scripts/agent-lock.sh                                  # MODIFY: cmd_check held-stale (rc=4)
scripts/vda/ticket/_ticket-core.sh                      # MODIFY: Guard rc==4 → warn + pass
tests/spec/scripts/agent-lock-stale-holder.bats         # EXISTS: failing Test (rot verifiziert)
openspec/changes/ticket-lock-stale-pass/specs/scripts.md  # EXISTS: Delta
```

---

### Task 1: held-stale im Check-Contract

**Files:**
- Modify: `scripts/agent-lock.sh`, `scripts/vda/ticket/_ticket-core.sh`
- Test: `tests/spec/scripts/agent-lock-stale-holder.bats` (existiert, rot)

**Interfaces:**
- Produces: `check ticket <id>` rc=4 + `held-stale` bei totem owner_pid (nicht reapable, nicht mine); Konsument: `_ticket_lock_guard` in scripts/vda/ticket/_ticket-core.sh.

- [ ] **Step 1: Rot bestätigen**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/scripts/agent-lock-stale-holder.bats`
expected: FAIL — `[ "$status" -eq 4 ]` schlägt fehl (heute rc=3/`held`).

- [ ] **Step 2: cmd_check erweitern**

In `scripts/agent-lock.sh` `cmd_check()` den held-Pfad ersetzen:

```bash
  if _lock_is_mine "$f"; then echo "mine"; cat "$f"; return 0; fi
  # [T005560] Toter Halter = kein Schutz gegen Doppelarbeit: advisory rc=4,
  # Lock bleibt bestehen (Reap-Entscheidung bleibt bei _reapable).
  local _hp; _hp="$(_lock_field "$f" owner_pid)"
  if [ -n "$_hp" ] && ! _pid_alive "$_hp"; then echo "held-stale"; cat "$f"; return 4; fi
  echo "held"; cat "$f"; return 3
```

- [ ] **Step 3: Guard rc=4 durchlassen**

In `scripts/vda/ticket/_ticket-core.sh` `_ticket_lock_guard()` nach dem rc==3-Block (vor dem `return 0` am Ende) einfügen:

```bash
  if [[ $rc -eq 4 ]]; then
    # [T005560] Halter ist nachweislich tot — warnen und durchlassen.
    local holder_label holder_tool
    holder_label="$(printf '%s' "$out" | sed -n 's/.*"label": *"\([^"]*\)".*/\1/p' | head -1)"
    holder_tool="$(printf '%s' "$out" | sed -n 's/.*"tool": *"\([^"]*\)".*/\1/p' | head -1)"
    echo "WARNUNG: Ticket $id hat einen Stale-Lock (Halter-PID tot, tool=${holder_tool:-?}, label=${holder_label:-?}) — Schreibvorgang durchgelassen." >&2
    return 0
  fi
```

- [ ] **Step 4: Test grün**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/scripts/agent-lock-stale-holder.bats`
Expected: PASS — rc=4 + `held-stale`.

- [ ] **Step 5: Bestehende Lock-Suite**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/agent-lock-*.bats`
Expected: PASS — kein Regressionseffekt auf claim/check/reap-Pfade (der rc=3-Pfad bleibt für lebende Halter).

- [ ] **Step 6: Commit**

```bash
git add scripts/agent-lock.sh scripts/vda/ticket/_ticket-core.sh tests/spec/scripts/agent-lock-stale-holder.bats
git commit -m "fix(scripts): pass through stale ticket-lock holders [T005560]"
```

---

### Task 2: Verifikation und Artefakte

**Files:**
- Verify: `openspec/changes/ticket-lock-stale-pass/`, `tests/spec/scripts/*`

- [ ] **Step 1: OpenSpec-Validierung**

Run: `task openspec:validate`
Expected: Exit 0. Fehlt `.ticket`: `echo T005560 > openspec/changes/ticket-lock-stale-pass/.ticket`.

- [ ] **Step 2: CI-äquivalente Spec-Suite**

Run: `timeout 900 task test:spec:changed`
Expected: Exit 0.

- [ ] **Step 3: Geänderte Domains**

Run: `timeout 900 task test:changed`
Expected: Exit 0.

- [ ] **Step 4: Freshness**

Run:
```bash
task freshness:regenerate
git add docs/code-quality/repo-index.json website/src/data/openspec-status.json website/src/data/test-inventory.json 2>/dev/null || true
git commit -m "chore: regenerate freshness artifacts [T005560]"
task freshness:check
```
Expected: `freshness:check` Exit 0; Artefakte im Commit.

- [ ] **Step 5: Abschluss-Commit**

```bash
git add openspec/changes/ticket-lock-stale-pass/
git commit -m "chore(plans): finalize ticket-lock-stale-pass change [T005560]"
```
