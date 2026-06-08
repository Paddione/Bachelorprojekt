---
title: Session-Koordinationsschicht Implementation Plan
ticket_id: T000510
domains: [infra, test]
status: active
pr_number: null
---

# Session-Koordinationsschicht Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine cross-tool Session-Koordinationsschicht, die verhindert, dass parallele Agenten-Sessions (Claude+Gemini) sich auf dem geteilten `.git`/main-Checkout in die Quere kommen.

**Architecture:** Dateibasierte Claim-Registry unter `.git/agent-locks/` + tool-agnostisches `scripts/agent-lock.sh` (Identität via Unix-Session-ID); vier Guards an Lifecycle-Punkten verdrahtet in dev-flow-Skills/Factory/CLAUDE.md/GEMINI.md; harte Durchsetzung der main-Checkout-Mutation über den bestehenden `.githooks/pre-commit`. Kein DB.

**Tech Stack:** Bash, `flock`, `git worktree`, BATS (`tests/unit/lib/bats-core`), go-task.

**Ticket:** T000510 · **Branch:** feature/agent-session-coordination · **Worktree:** /tmp/wt-agent-session-coord

---

## File Structure

| Datei | Verantwortung |
|-------|---------------|
| `scripts/agent-lock.sh` | **neu** — die gesamte Lock-Library (claim/refresh/release/check/list/reap/mine/guard-*) |
| `.githooks/pre-commit` | erweitern — additiver main-checkout-Mutex-Guard (fail-open) |
| `.githooks/post-checkout` | **neu** — Branch-Switch-Warnung im main-Checkout |
| `.claude/settings.json` | `SessionStart`-Hook → `agent-lock reap` |
| `tests/local/AGENT-LOCK-01-core.bats` | **neu** — claim/refresh/release/check/list |
| `tests/local/AGENT-LOCK-02-reap.bats` | **neu** — reap + Staleness |
| `tests/local/AGENT-LOCK-03-precommit.bats` | **neu** — guard-precommit + Hook-Integration |
| `Taskfile.yml` | neues `test:agent-lock` + in `test:all` deps |
| `.claude/skills/dev-flow-plan/SKILL.md` | reap+claim+registry-Claims+Chore→Worktree |
| `.claude/skills/dev-flow-execute/SKILL.md` | reap+claim+registry-Overlap-Warnung+release |
| `scripts/factory/dispatcher.js` | claim ticket vor enqueue (Doppelarbeit-Guard) |
| `CLAUDE.md` / `GEMINI.md` | identische „Session-Koordination"-Sektion |

**Testbarkeit:** `agent-lock.sh` honoriert drei Test-Overrides: `AGENT_LOCK_DIR` (Registry-Pfad), `AGENT_LOCK_SID` (überschreibt die eigene Session-ID), `AGENT_LOCK_FAKE_ALIVE` (Leerzeichen-Liste „lebender" SIDs). Damit sind alle Tests offline & deterministisch.

---

## Task 1: Lock-Library Kern (claim/refresh/release/check/list/mine)

**Files:**
- Create: `scripts/agent-lock.sh`
- Test: `tests/local/AGENT-LOCK-01-core.bats`

- [ ] **Step 1: Write the failing test** — `tests/local/AGENT-LOCK-01-core.bats`

```bash
#!/usr/bin/env bats
# AGENT-LOCK-01: core claim/refresh/release/check [T000510]

setup() {
  AGENT_LOCK_DIR="$(mktemp -d)"; export AGENT_LOCK_DIR
  export AGENT_LOCK_TTL=1800
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  LOCK="$REPO_ROOT/scripts/agent-lock.sh"
}
teardown() { rm -rf "$AGENT_LOCK_DIR"; }

@test "AGENT-LOCK-01a: claim succeeds when free" {
  AGENT_LOCK_SID=100 AGENT_LOCK_FAKE_ALIVE="100" run bash "$LOCK" claim ticket T1 --label test
  [ "$status" -eq 0 ]
  [ -f "$AGENT_LOCK_DIR/ticket__T1.json" ]
}

@test "AGENT-LOCK-01b: foreign live claim is blocked" {
  AGENT_LOCK_SID=100 AGENT_LOCK_FAKE_ALIVE="100 200" bash "$LOCK" claim ticket T1
  AGENT_LOCK_SID=200 AGENT_LOCK_FAKE_ALIVE="100 200" run bash "$LOCK" claim ticket T1
  [ "$status" -eq 1 ]
  [[ "$output" == *"bereits gehalten"* ]]
}

@test "AGENT-LOCK-01c: same-sid re-claim is idempotent" {
  AGENT_LOCK_SID=100 AGENT_LOCK_FAKE_ALIVE="100" bash "$LOCK" claim ticket T1
  AGENT_LOCK_SID=100 AGENT_LOCK_FAKE_ALIVE="100" run bash "$LOCK" claim ticket T1
  [ "$status" -eq 0 ]
}

@test "AGENT-LOCK-01d: check exit codes free/mine/held" {
  AGENT_LOCK_SID=100 AGENT_LOCK_FAKE_ALIVE="100 200" run bash "$LOCK" check ticket T1
  [ "$status" -eq 0 ]; [ "$output" = "free" ]
  AGENT_LOCK_SID=100 AGENT_LOCK_FAKE_ALIVE="100 200" bash "$LOCK" claim ticket T1
  AGENT_LOCK_SID=100 AGENT_LOCK_FAKE_ALIVE="100 200" run bash "$LOCK" check ticket T1
  [ "$status" -eq 0 ]; [ "${lines[0]}" = "mine" ]
  AGENT_LOCK_SID=200 AGENT_LOCK_FAKE_ALIVE="100 200" run bash "$LOCK" check ticket T1
  [ "$status" -eq 3 ]; [ "${lines[0]}" = "held" ]
}

@test "AGENT-LOCK-01e: refresh bumps heartbeat for owner" {
  AGENT_LOCK_SID=100 AGENT_LOCK_FAKE_ALIVE="100" bash "$LOCK" claim ticket T1
  hb1=$(sed -n 's/.*"heartbeat_at": *"\([0-9]*\)".*/\1/p' "$AGENT_LOCK_DIR/ticket__T1.json")
  sleep 1
  AGENT_LOCK_SID=100 AGENT_LOCK_FAKE_ALIVE="100" run bash "$LOCK" refresh ticket T1
  [ "$status" -eq 0 ]
  hb2=$(sed -n 's/.*"heartbeat_at": *"\([0-9]*\)".*/\1/p' "$AGENT_LOCK_DIR/ticket__T1.json")
  [ "$hb2" -ge "$hb1" ]
}

@test "AGENT-LOCK-01f: release frees the lock" {
  AGENT_LOCK_SID=100 AGENT_LOCK_FAKE_ALIVE="100" bash "$LOCK" claim ticket T1
  AGENT_LOCK_SID=100 AGENT_LOCK_FAKE_ALIVE="100" run bash "$LOCK" release ticket T1
  [ "$status" -eq 0 ]
  [ ! -f "$AGENT_LOCK_DIR/ticket__T1.json" ]
}

@test "AGENT-LOCK-01g: mine prints the session id" {
  AGENT_LOCK_SID=777 run bash "$LOCK" mine
  [ "$status" -eq 0 ]; [ "$output" = "777" ]
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./tests/unit/lib/bats-core/bin/bats tests/local/AGENT-LOCK-01-core.bats`
Expected: FAIL — `scripts/agent-lock.sh` does not exist yet.

- [ ] **Step 3: Write minimal implementation** — `scripts/agent-lock.sh`

```bash
#!/usr/bin/env bash
# scripts/agent-lock.sh — cross-tool session-coordination lock registry. [T000510]
#
# Why: several agent sessions (Claude + Gemini, sometimes two Claude windows)
# share one checkout / one .git. This advisory file-lock registry lets each
# session claim a ticket / branch / the-main-checkout / a-registry-file, so the
# others see "who is doing what" and refuse to duplicate work or stomp the
# shared index.
#
# Identity: the Unix SESSION ID (ps -o sess=) is shared by every subprocess of
# one agent CLI but differs between Claude/Gemini/two windows.
#
# Storage: one JSON file per claim under $AGENT_LOCK_DIR (default the shared
# gitdir's agent-locks/, so all worktrees share it). Never committed.
#
# Test overrides: AGENT_LOCK_DIR, AGENT_LOCK_SID, AGENT_LOCK_FAKE_ALIVE.
set -uo pipefail

AGENT_LOCK_TTL="${AGENT_LOCK_TTL:-1800}"

_now() { date +%s; }

_my_sid() {
  if [ -n "${AGENT_LOCK_SID:-}" ]; then printf '%s\n' "$AGENT_LOCK_SID"; return; fi
  local s; s="$(ps -o sess= -p "$$" 2>/dev/null | tr -d ' ')"
  if [ -n "$s" ]; then printf '%s\n' "$s"; return; fi
  # fallback: 4th field after the ')' in /proc/self/stat is the session id
  local stat rest; stat="$(cat /proc/self/stat 2>/dev/null)"; rest="${stat##*) }"
  # shellcheck disable=SC2086
  set -- $rest; printf '%s\n' "${4:-0}"
}

_sid_alive() {
  [ -n "${1:-}" ] || return 1
  if [ -n "${AGENT_LOCK_FAKE_ALIVE+x}" ]; then
    case " $AGENT_LOCK_FAKE_ALIVE " in *" $1 "*) return 0;; *) return 1;; esac
  fi
  pgrep -s "$1" >/dev/null 2>&1
}

_detect_tool() {
  if [ -n "${CLAUDECODE:-}${CLAUDE_CODE:-}" ]; then echo claude
  elif [ -n "${GEMINI_CLI:-}${GEMINI_SANDBOX:-}${GEMINI_API_KEY:-}" ]; then echo gemini
  else echo unknown; fi
}

_lock_dir() {
  if [ -n "${AGENT_LOCK_DIR:-}" ]; then printf '%s\n' "$AGENT_LOCK_DIR"; return; fi
  local cd; cd="$(git rev-parse --git-common-dir 2>/dev/null)" || { printf '/tmp/agent-locks\n'; return; }
  case "$cd" in /*) : ;; *) cd="$(cd "$cd" && pwd)";; esac
  printf '%s/agent-locks\n' "$cd"
}

_sanitize() { printf '%s' "$1" | tr '/ ' '--'; }

_lock_file() { # <scope> [id]
  if [ "$1" = "main-checkout" ]; then printf '%s/main-checkout.json\n' "$(_lock_dir)";
  else printf '%s/%s__%s.json\n' "$(_lock_dir)" "$1" "$(_sanitize "${2:-}")"; fi
}

_lock_field() { sed -n "s/.*\"$2\": *\"\\([^\"]*\\)\".*/\\1/p" "$1" 2>/dev/null | head -1; }

# 0 = reapable (clearly dead). A confirmed-alive SID is NEVER reapable.
_reapable() {
  local f="$1" sid wt hb now
  [ -f "$f" ] || return 0
  sid="$(_lock_field "$f" owner_sid)"; wt="$(_lock_field "$f" worktree)"
  hb="$(_lock_field "$f" heartbeat_at)"; now="$(_now)"
  if [ -n "$wt" ] && [ "$wt" != "-" ] && [ ! -d "$wt" ]; then return 0; fi
  if [ -n "$sid" ]; then _sid_alive "$sid" && return 1 || return 0; fi
  if [ -n "$hb" ] && [ "$(( now - hb ))" -gt "$AGENT_LOCK_TTL" ]; then return 0; fi
  return 1
}

_with_lock() {
  local d lf; d="$(_lock_dir)"; mkdir -p "$d" 2>/dev/null || true
  lf="$d/.registry.lock"
  # Never put a persistent `2>` on the exec: with no command, exec applies the
  # redirection to the whole shell and silences ALL later stderr. Ensure the
  # anchor exists/writable first (a failed exec redirect would exit the shell).
  touch "$lf" 2>/dev/null || return 0
  exec 9>"$lf" || return 0
  flock 9 2>/dev/null || true
}

_write_lock() { # <file>  (reads SCOPE/ID/LABEL/WT/BRANCH/TICKET/CREATED)
  local f="$1" tmp="$1.tmp.$$"
  {
    printf '{\n'
    printf '  "scope": "%s",\n' "$SCOPE"
    printf '  "id": "%s",\n' "$ID"
    printf '  "owner_sid": "%s",\n' "$(_my_sid)"
    printf '  "owner_pid": "%s",\n' "$$"
    printf '  "tool": "%s",\n' "$(_detect_tool)"
    printf '  "label": "%s",\n' "${LABEL:-}"
    printf '  "worktree": "%s",\n' "${WT:-}"
    printf '  "branch": "%s",\n' "${BRANCH:-}"
    printf '  "ticket": "%s",\n' "${TICKET:-}"
    printf '  "host": "%s",\n' "$(hostname 2>/dev/null || echo unknown)"
    printf '  "created_at": "%s",\n' "${CREATED:-$(_now)}"
    printf '  "heartbeat_at": "%s"\n' "$(_now)"
    printf '}\n'
  } > "$tmp" && mv -f "$tmp" "$f"
}

_holder_msg() {
  printf 'gehalten von %s (sid %s, label %s, worktree %s, seit %s)' \
    "$(_lock_field "$1" tool)" "$(_lock_field "$1" owner_sid)" \
    "$(_lock_field "$1" label)" "$(_lock_field "$1" worktree)" "$(_lock_field "$1" created_at)"
}

cmd_claim() {
  SCOPE="$1"; ID="${2:-}"; shift 2 2>/dev/null || shift $#
  LABEL=""; WT=""; BRANCH=""; TICKET=""
  while [ $# -gt 0 ]; do case "$1" in
    --label) LABEL="$2"; shift 2;; --worktree) WT="$2"; shift 2;;
    --branch) BRANCH="$2"; shift 2;; --ticket) TICKET="$2"; shift 2;;
    *) shift;; esac; done
  local f; f="$(_lock_file "$SCOPE" "$ID")"
  _with_lock
  [ -f "$f" ] && _reapable "$f" && rm -f "$f"
  if [ -f "$f" ]; then
    if [ "$(_lock_field "$f" owner_sid)" = "$(_my_sid)" ]; then
      CREATED="$(_lock_field "$f" created_at)"; _write_lock "$f"; return 0
    fi
    echo "AGENT-LOCK: $SCOPE/$ID bereits $(_holder_msg "$f")" >&2
    return 1
  fi
  CREATED="$(_now)"; _write_lock "$f"; return 0
}

cmd_refresh() {
  SCOPE="$1"; ID="${2:-}"; local f; f="$(_lock_file "$SCOPE" "$ID")"
  [ -f "$f" ] || return 1
  [ "$(_lock_field "$f" owner_sid)" = "$(_my_sid)" ] || return 1
  LABEL="$(_lock_field "$f" label)"; WT="$(_lock_field "$f" worktree)"
  BRANCH="$(_lock_field "$f" branch)"; TICKET="$(_lock_field "$f" ticket)"
  CREATED="$(_lock_field "$f" created_at)"; _write_lock "$f"; return 0
}

cmd_release() {
  local scope="$1" id="${2:-}" force=""; [ "${3:-}" = "--force" ] && force=1
  local f; f="$(_lock_file "$scope" "$id")"
  [ -f "$f" ] || return 0
  if [ -n "$force" ] || [ "$(_lock_field "$f" owner_sid)" = "$(_my_sid)" ]; then rm -f "$f"; return 0; fi
  return 1
}

cmd_check() {
  local f; f="$(_lock_file "$1" "${2:-}")"
  if [ ! -f "$f" ] || _reapable "$f"; then echo "free"; return 0; fi
  if [ "$(_lock_field "$f" owner_sid)" = "$(_my_sid)" ]; then echo "mine"; cat "$f"; return 0; fi
  echo "held"; cat "$f"; return 3
}

cmd_list() {
  local d; d="$(_lock_dir)"; [ -d "$d" ] || { echo "(keine aktiven Claims)"; return 0; }
  printf '%-14s %-24s %-8s %-10s %-6s %s\n' SCOPE ID TOOL SID STATE LABEL
  local f state
  for f in "$d"/*.json; do
    [ -e "$f" ] || continue
    state=live; _reapable "$f" && state=stale
    printf '%-14s %-24s %-8s %-10s %-6s %s\n' \
      "$(_lock_field "$f" scope)" "$(_lock_field "$f" id)" "$(_lock_field "$f" tool)" \
      "$(_lock_field "$f" owner_sid)" "$state" "$(_lock_field "$f" label)"
  done
}

main() {
  local cmd="${1:-}"; shift 2>/dev/null || true
  case "$cmd" in
    claim)   cmd_claim "$@";;
    refresh) cmd_refresh "$@";;
    release) cmd_release "$@";;
    check)   cmd_check "$@";;
    list)    cmd_list "$@";;
    mine)    _my_sid;;
    *) echo "Usage: agent-lock.sh {claim|refresh|release|check|list|mine|reap|guard-precommit|guard-postcheckout}" >&2; return 2;;
  esac
}
main "$@"
```

- [ ] **Step 4: Make executable + run test to verify it passes**

Run:
```bash
chmod +x scripts/agent-lock.sh
./tests/unit/lib/bats-core/bin/bats tests/local/AGENT-LOCK-01-core.bats
```
Expected: PASS — 7/7 (01a–01g).

- [ ] **Step 5: Commit**

```bash
git add scripts/agent-lock.sh tests/local/AGENT-LOCK-01-core.bats
git commit -m "feat(agent-lock): core claim/refresh/release/check registry [T000510]"
```

---

## Task 2: Reaper (reap)

**Files:**
- Modify: `scripts/agent-lock.sh` (add `cmd_reap` + dispatch entry)
- Test: `tests/local/AGENT-LOCK-02-reap.bats`

- [ ] **Step 1: Write the failing test** — `tests/local/AGENT-LOCK-02-reap.bats`

```bash
#!/usr/bin/env bats
# AGENT-LOCK-02: reap / staleness [T000510]

setup() {
  AGENT_LOCK_DIR="$(mktemp -d)"; export AGENT_LOCK_DIR
  export AGENT_LOCK_TTL=1800
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  LOCK="$REPO_ROOT/scripts/agent-lock.sh"
}
teardown() { rm -rf "$AGENT_LOCK_DIR"; }

@test "AGENT-LOCK-02a: reap removes a dead-sid lock" {
  AGENT_LOCK_SID=100 AGENT_LOCK_FAKE_ALIVE="100" bash "$LOCK" claim ticket T1
  # sid 100 now considered dead (not in FAKE_ALIVE during reap)
  AGENT_LOCK_SID=999 AGENT_LOCK_FAKE_ALIVE="999" run bash "$LOCK" reap
  [ "$status" -eq 0 ]
  [ ! -f "$AGENT_LOCK_DIR/ticket__T1.json" ]
}

@test "AGENT-LOCK-02b: reap removes a missing-worktree lock" {
  WT="$(mktemp -d)"
  AGENT_LOCK_SID=100 AGENT_LOCK_FAKE_ALIVE="100" bash "$LOCK" claim branch b1 --worktree "$WT"
  rmdir "$WT"
  AGENT_LOCK_SID=100 AGENT_LOCK_FAKE_ALIVE="100" run bash "$LOCK" reap
  [ ! -f "$AGENT_LOCK_DIR/branch__b1.json" ]
}

@test "AGENT-LOCK-02c: reap keeps a live lock" {
  AGENT_LOCK_SID=100 AGENT_LOCK_FAKE_ALIVE="100" bash "$LOCK" claim ticket T1
  AGENT_LOCK_SID=999 AGENT_LOCK_FAKE_ALIVE="100 999" run bash "$LOCK" reap
  [ "$status" -eq 0 ]
  [ -f "$AGENT_LOCK_DIR/ticket__T1.json" ]
}

@test "AGENT-LOCK-02d: claim auto-reaps a dead foreign lock" {
  AGENT_LOCK_SID=100 AGENT_LOCK_FAKE_ALIVE="100" bash "$LOCK" claim ticket T1
  AGENT_LOCK_SID=200 AGENT_LOCK_FAKE_ALIVE="200" run bash "$LOCK" claim ticket T1
  [ "$status" -eq 0 ]
  [ "$(sed -n 's/.*"owner_sid": *"\([0-9]*\)".*/\1/p' "$AGENT_LOCK_DIR/ticket__T1.json")" = "200" ]
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./tests/unit/lib/bats-core/bin/bats tests/local/AGENT-LOCK-02-reap.bats`
Expected: FAIL — `reap` prints Usage / non-zero (unknown command) so 02a–02c fail; 02d already passes (claim reap-on-claim from Task 1).

- [ ] **Step 3: Add `cmd_reap` to `scripts/agent-lock.sh`** (insert before `main()`)

```bash
cmd_reap() {
  local d; d="$(_lock_dir)"
  # 1) kill orphan processes whose cwd is a DELETED worktree (matches /wt-…(deleted));
  #    cwd-based — never self-matches (our own cwd exists).
  local pid cwd
  for pid in $(ls /proc 2>/dev/null | grep -E '^[0-9]+$'); do
    cwd="$(readlink "/proc/$pid/cwd" 2>/dev/null)" || continue
    case "$cwd" in *wt-*"(deleted)") kill -9 "$pid" 2>/dev/null || true;; esac
  done
  # 2) prune git worktree admin entries for gone directories
  git worktree prune 2>/dev/null || true
  # 3) drop reapable (clearly dead) locks
  if [ -d "$d" ]; then
    local f
    for f in "$d"/*.json; do [ -e "$f" ] || continue; _reapable "$f" && rm -f "$f"; done
  fi
  return 0
}
```

- [ ] **Step 4: Add `reap` to the dispatch `case`** in `main()`

```bash
    list)    cmd_list "$@";;
    reap)    cmd_reap "$@";;
    mine)    _my_sid;;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `./tests/unit/lib/bats-core/bin/bats tests/local/AGENT-LOCK-02-reap.bats`
Expected: PASS — 4/4.

- [ ] **Step 6: Commit**

```bash
git add scripts/agent-lock.sh tests/local/AGENT-LOCK-02-reap.bats
git commit -m "feat(agent-lock): reaper for dead locks + orphan worktree processes [T000510]"
```

---

## Task 3: Guards (guard-precommit / guard-postcheckout)

**Files:**
- Modify: `scripts/agent-lock.sh` (add `cmd_guard_precommit`, `cmd_guard_postcheckout` + dispatch)
- Test: `tests/local/AGENT-LOCK-03-precommit.bats`

- [ ] **Step 1: Write the failing test** — `tests/local/AGENT-LOCK-03-precommit.bats`

```bash
#!/usr/bin/env bats
# AGENT-LOCK-03: main-checkout guard + pre-commit hook integration [T000510]

setup() {
  AGENT_LOCK_DIR="$(mktemp -d)"; export AGENT_LOCK_DIR
  export AGENT_LOCK_TTL=1800
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  LOCK="$REPO_ROOT/scripts/agent-lock.sh"
}
teardown() { rm -rf "$AGENT_LOCK_DIR"; }

@test "AGENT-LOCK-03a: guard-precommit blocks a foreign live main-checkout lock" {
  AGENT_LOCK_SID=100 AGENT_LOCK_FAKE_ALIVE="100 200" bash "$LOCK" claim main-checkout
  AGENT_LOCK_SID=200 AGENT_LOCK_FAKE_ALIVE="100 200" run bash "$LOCK" guard-precommit
  [ "$status" -eq 1 ]
  [[ "$output" == *"main-Checkout"* ]]
}

@test "AGENT-LOCK-03b: own main-checkout lock does not block" {
  AGENT_LOCK_SID=100 AGENT_LOCK_FAKE_ALIVE="100" bash "$LOCK" claim main-checkout
  AGENT_LOCK_SID=100 AGENT_LOCK_FAKE_ALIVE="100" run bash "$LOCK" guard-precommit
  [ "$status" -eq 0 ]
}

@test "AGENT-LOCK-03c: AGENT_LOCK_FORCE overrides the block" {
  AGENT_LOCK_SID=100 AGENT_LOCK_FAKE_ALIVE="100 200" bash "$LOCK" claim main-checkout
  AGENT_LOCK_SID=200 AGENT_LOCK_FAKE_ALIVE="100 200" AGENT_LOCK_FORCE=1 run bash "$LOCK" guard-precommit
  [ "$status" -eq 0 ]
}

@test "AGENT-LOCK-03d: no lock => allowed" {
  AGENT_LOCK_SID=200 run bash "$LOCK" guard-precommit
  [ "$status" -eq 0 ]
}

@test "AGENT-LOCK-03e: dead foreign lock => reaped => allowed" {
  AGENT_LOCK_SID=100 AGENT_LOCK_FAKE_ALIVE="100" bash "$LOCK" claim main-checkout
  AGENT_LOCK_SID=200 AGENT_LOCK_FAKE_ALIVE="200" run bash "$LOCK" guard-precommit
  [ "$status" -eq 0 ]
}

@test "AGENT-LOCK-03f: real pre-commit hook blocks in main but not in a worktree" {
  command -v git >/dev/null || skip "git not available"
  TMPREPO="$(mktemp -d)"
  git -C "$TMPREPO" init -q
  git -C "$TMPREPO" config user.email t@t; git -C "$TMPREPO" config user.name t
  mkdir -p "$TMPREPO/.githooks" "$TMPREPO/scripts"
  cp "$REPO_ROOT/scripts/agent-lock.sh" "$TMPREPO/scripts/"
  cp "$REPO_ROOT/.githooks/pre-commit" "$TMPREPO/.githooks/"
  # stub out the secret-guard so the hook only exercises the agent-lock gate
  printf '#!/usr/bin/env bash\nexit 0\n' > "$TMPREPO/scripts/git-crypt-guard.sh"
  chmod +x "$TMPREPO/scripts/git-crypt-guard.sh" "$TMPREPO/.githooks/pre-commit" "$TMPREPO/scripts/agent-lock.sh"
  git -C "$TMPREPO" config core.hooksPath .githooks
  export AGENT_LOCK_DIR="$TMPREPO/.git/agent-locks"
  # foreign live main-checkout lock
  AGENT_LOCK_SID=100 AGENT_LOCK_FAKE_ALIVE="100 200" bash "$TMPREPO/scripts/agent-lock.sh" claim main-checkout
  echo x > "$TMPREPO/f"; git -C "$TMPREPO" add f
  AGENT_LOCK_SID=200 AGENT_LOCK_FAKE_ALIVE="100 200" run git -C "$TMPREPO" commit -m "blocked"
  [ "$status" -ne 0 ]
  # a linked worktree (git-dir != common-dir) must NEVER be blocked
  git -C "$TMPREPO" branch wt-branch
  git -C "$TMPREPO" worktree add -q "$TMPREPO/../wtX" wt-branch
  echo y > "$TMPREPO/../wtX/g"; git -C "$TMPREPO/../wtX" add g
  AGENT_LOCK_SID=200 AGENT_LOCK_FAKE_ALIVE="100 200" run git -C "$TMPREPO/../wtX" commit -m "allowed-in-worktree"
  [ "$status" -eq 0 ]
  git -C "$TMPREPO" worktree remove --force "$TMPREPO/../wtX" 2>/dev/null || true
  rm -rf "$TMPREPO" "$TMPREPO/../wtX"
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./tests/unit/lib/bats-core/bin/bats tests/local/AGENT-LOCK-03-precommit.bats`
Expected: FAIL — `guard-precommit` is unknown (03a–03e), and the hook has no agent-lock gate yet (03f).

- [ ] **Step 3: Add the guard subcommands to `scripts/agent-lock.sh`** (before `main()`)

```bash
cmd_guard_precommit() {
  [ -n "${AGENT_LOCK_FORCE:-}" ] && return 0
  local f; f="$(_lock_file main-checkout)"
  [ -f "$f" ] || return 0
  _reapable "$f" && return 0
  [ "$(_lock_field "$f" owner_sid)" = "$(_my_sid)" ] && return 0
  echo "AGENT-LOCK: main-Checkout $(_holder_msg "$f")" >&2
  echo "  Eine andere Session arbeitet im main-Checkout. Nutze einen Worktree" >&2
  echo "  (scripts/worktree-create.sh) oder erzwinge: AGENT_LOCK_FORCE=1 git commit ..." >&2
  return 1
}

cmd_guard_postcheckout() {
  local f; f="$(_lock_file main-checkout)"
  [ -f "$f" ] || return 0
  _reapable "$f" && return 0
  [ "$(_lock_field "$f" owner_sid)" = "$(_my_sid)" ] && return 0
  echo "AGENT-LOCK (Warnung): main-Checkout $(_holder_msg "$f") — paralleler Branch-Switch riskant." >&2
  return 0
}
```

- [ ] **Step 4: Add the guards to the dispatch `case`** in `main()`

```bash
    mine)    _my_sid;;
    guard-precommit)  cmd_guard_precommit "$@";;
    guard-postcheckout) cmd_guard_postcheckout "$@";;
```

- [ ] **Step 5: Wire the gate into `.githooks/pre-commit`** (so 03f passes) — insert after the `set -euo pipefail` line, before the git-crypt block:

```bash
# --- agent-lock: main-checkout mutex (only in the MAIN checkout; fail-open) ---
if [ "$(git rev-parse --git-dir 2>/dev/null)" = "$(git rev-parse --git-common-dir 2>/dev/null)" ]; then
  if ! bash "$repo_root/scripts/agent-lock.sh" guard-precommit; then
    exit 1
  fi
fi
```

Note: `repo_root` is already defined above this point in the existing hook. `git rev-parse --git-dir` equals `--git-common-dir` only in the main checkout; in a linked worktree `--git-dir` is `.git/worktrees/<name>`, so the gate is skipped there.

- [ ] **Step 6: Run test to verify it passes**

Run: `./tests/unit/lib/bats-core/bin/bats tests/local/AGENT-LOCK-03-precommit.bats`
Expected: PASS — 6/6 (03a–03f).

- [ ] **Step 7: Commit**

```bash
git add scripts/agent-lock.sh .githooks/pre-commit tests/local/AGENT-LOCK-03-precommit.bats
git commit -m "feat(agent-lock): main-checkout guard + pre-commit gate [T000510]"
```

---

## Task 4: post-checkout hook

**Files:**
- Create: `.githooks/post-checkout`

- [ ] **Step 1: Create `.githooks/post-checkout`**

```bash
#!/usr/bin/env bash
# Warn (never block) on a branch-switch in the MAIN checkout while another
# session holds the main-checkout lock. [T000510]
set -uo pipefail
repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
# $3 == 1 means a branch checkout (not a file checkout)
[ "${3:-0}" = "1" ] || exit 0
if [ "$(git rev-parse --git-dir 2>/dev/null)" = "$(git rev-parse --git-common-dir 2>/dev/null)" ]; then
  bash "$repo_root/scripts/agent-lock.sh" guard-postcheckout || true
fi
exit 0
```

- [ ] **Step 2: Make executable + smoke-test**

Run:
```bash
chmod +x .githooks/post-checkout
bash -n .githooks/post-checkout && echo "syntax-ok"
```
Expected: `syntax-ok`.

- [ ] **Step 3: Commit**

```bash
git add .githooks/post-checkout
git commit -m "feat(agent-lock): post-checkout warning hook [T000510]"
```

---

## Task 5: Taskfile wiring (`test:agent-lock` → `test:all`)

**Files:**
- Modify: `Taskfile.yml` (add `test:agent-lock:` task; add it to `test:all` deps)

- [ ] **Step 1: Add the `test:agent-lock` task** next to `test:factory` (around Taskfile.yml:460)

```yaml
  test:agent-lock:
    desc: "Run the offline agent-lock session-coordination bats (tests/local/AGENT-LOCK-*)."
    cmds:
      - '[ -f ./tests/unit/lib/bats-core/bin/bats ] || git submodule update --init --recursive'
      - ./tests/unit/lib/bats-core/bin/bats tests/local/AGENT-LOCK-*.bats
```

- [ ] **Step 2: Add `test:agent-lock` to `test:all` deps** (Taskfile.yml `test:all:` block)

```yaml
    deps:
      - test:unit
      - test:factory
      - test:agent-lock
      - test:manifests
      - test:art-library
      - test:menu-gate
      - test:dry-run
      - test:docs-gen
      - test:agent-guide
      - test:code-quality
```

- [ ] **Step 3: Verify**

Run: `task test:agent-lock`
Expected: all AGENT-LOCK-01/02/03 tests PASS (17 tests total).

- [ ] **Step 4: Commit**

```bash
git add Taskfile.yml
git commit -m "test(agent-lock): wire test:agent-lock into task test:all [T000510]"
```

---

## Task 6: SessionStart reaper hook (Claude)

**Files:**
- Modify: `.claude/settings.json` (add a `SessionStart` hook → `agent-lock reap`)

- [ ] **Step 1: Read the current settings.json**

Run: `cat .claude/settings.json`
Confirm there is no existing `hooks` key (a fresh `hooks` object must be added without clobbering other keys).

- [ ] **Step 2: Add the `SessionStart` hook** — merge this `hooks` block into `.claude/settings.json` (preserve all existing keys):

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          { "type": "command", "command": "bash scripts/agent-lock.sh reap 2>/dev/null || true" }
        ]
      }
    ]
  }
}
```

- [ ] **Step 3: Validate JSON**

Run: `python3 -c "import json; json.load(open('.claude/settings.json')); print('valid')"`
Expected: `valid`.

- [ ] **Step 4: Commit**

```bash
git add .claude/settings.json
git commit -m "feat(agent-lock): SessionStart reaper hook [T000510]"
```

---

## Task 7: Guard wiring in dev-flow skills + Factory dispatcher

**Files:**
- Modify: `.claude/skills/dev-flow-plan/SKILL.md` (Schritt −1 region)
- Modify: `.claude/skills/dev-flow-execute/SKILL.md` (pickup + teardown)
- Modify: `scripts/factory/dispatcher.js` (before enqueue/claim)

- [ ] **Step 1: dev-flow-plan — reap + claim at Schritt −1**

In `.claude/skills/dev-flow-plan/SKILL.md`, in the "Schritt −1: Stale-Worktree-Audit" section, replace the manual `git worktree list` guidance prefix with a reap call and add a ticket/branch claim right after the ticket+path are chosen:

```bash
# Schritt −1: Reaper zuerst (killt Zombie-Prozesse, prunet stale Worktrees, räumt tote Locks)
bash scripts/agent-lock.sh reap

# Nach Ticket-/Branch-Wahl, vor dem Worktree-Anlegen — Doppelarbeit verhindern:
bash scripts/agent-lock.sh claim ticket "$TICKET_EXT_ID" --branch "feature/<slug>" --label dev-flow-plan \
  || { echo "Ticket bereits in Arbeit — siehe oben. Koordiniere oder wähle ein anderes."; exit 1; }
```

Add a sentence in the Chore path: *"Wenn `agent-lock claim main-checkout` fehlschlägt (andere Session im main-Checkout), den Chore stattdessen in einem Worktree via `scripts/worktree-create.sh` ausführen statt inline."*

- [ ] **Step 2: dev-flow-execute — reap + claim at pickup, registry-overlap warning, release at end**

In `.claude/skills/dev-flow-execute/SKILL.md`, at the start of execution add:

```bash
bash scripts/agent-lock.sh reap
bash scripts/agent-lock.sh claim ticket "$TICKET_EXT_ID" --branch "$BRANCH" --worktree "$WT" --label dev-flow-execute \
  || { echo "Ticket bereits in Arbeit von einer anderen Session — Abbruch."; exit 1; }

# Registry-Overlap-Warnung (weich) für Hot-Files, die der Plan anfasst:
for hf in k3d/configmap-domains.yaml environments/schema.yaml Taskfile.yml k3d/kustomization.yaml; do
  git -C "$WT" diff --name-only origin/main | grep -qx "$hf" || continue
  out="$(bash scripts/agent-lock.sh check registry "$hf")"
  [ "${out%%$'\n'*}" = "held" ] && echo "⚠ $hf wird parallel bearbeitet → Keep-both-Rebase erwarten."
  bash scripts/agent-lock.sh claim registry "$hf" --ticket "$TICKET_EXT_ID" --label dev-flow-execute || true
done
```

And in the post-merge / teardown section add:

```bash
bash scripts/agent-lock.sh release ticket "$TICKET_EXT_ID"
bash scripts/agent-lock.sh release branch "$BRANCH"
```

- [ ] **Step 3: Factory dispatcher — claim ticket before enqueue**

In `scripts/factory/dispatcher.js`, locate where a ticket is selected for the pipeline (before `enqueue`/slot-claim). Add a shell-out guard (Node `child_process.execSync`) that refuses to enqueue a ticket already claimed by a live interactive session:

```javascript
const { execSync } = require('node:child_process');
function liveClaim(extId) {
  try {
    execSync(`bash scripts/agent-lock.sh check ticket ${extId}`, { stdio: 'pipe' });
    return false; // exit 0 => free or mine
  } catch (e) {
    return (e.status === 3); // exit 3 => held by another live session
  }
}
// before enqueue:
if (liveClaim(ticket.external_id)) {
  console.warn(`[dispatcher] skip ${ticket.external_id}: claimed by a live interactive session`);
  continue;
}
```

- [ ] **Step 4: Manual verification**

Run:
```bash
bash scripts/agent-lock.sh claim ticket T-DEMO --label manual && bash scripts/agent-lock.sh list
bash scripts/agent-lock.sh release ticket T-DEMO && echo released
```
Expected: `list` shows the `T-DEMO` claim as `live`; release removes it.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/dev-flow-plan/SKILL.md .claude/skills/dev-flow-execute/SKILL.md scripts/factory/dispatcher.js
git commit -m "feat(agent-lock): wire claim/reap into dev-flow skills + factory dispatcher [T000510]"
```

---

## Task 8: Cross-tool docs (CLAUDE.md + GEMINI.md)

**Files:**
- Modify: `CLAUDE.md` (new "Session-Koordination" subsection under Gotchas)
- Modify: `GEMINI.md` (identical subsection)

- [ ] **Step 1: Add the identical section to both `CLAUDE.md` and `GEMINI.md`**

```markdown
### Session-Koordination (parallele Agenten)

Mehrere Sessions (Claude + Gemini) teilen ein `.git`. Vor Arbeit an einem Ticket/Branch:

- **Start jeder Session/Skill:** `bash scripts/agent-lock.sh reap` (räumt Zombie-Prozesse, stale Worktrees, tote Locks).
- **Vor Ticket-Arbeit:** `bash scripts/agent-lock.sh claim ticket <ext-id> --branch <b> --worktree <wt> --label <skill>`. Schlägt der Claim fehl (Exit 1), arbeitet bereits eine **lebende** Session daran — koordinieren oder anderes Ticket wählen, NICHT duplizieren.
- **Während der Arbeit:** `claim`/`refresh` hält den Heartbeat frisch (TTL 30 min).
- **Am Ende:** `bash scripts/agent-lock.sh release ticket <ext-id>` (+ `branch`).
- **main-Checkout:** Commits im main-Checkout sind durch `.githooks/pre-commit` hart gesperrt, wenn eine andere lebende Session den `main-checkout`-Lock hält. Override: `AGENT_LOCK_FORCE=1 git commit …`. Lieber einen Worktree (`scripts/worktree-create.sh`) nutzen.
- **Wer macht was:** `bash scripts/agent-lock.sh list`.
```

- [ ] **Step 2: Verify both files contain the section identically**

Run: `diff <(sed -n '/### Session-Koordination/,/^### /p' CLAUDE.md) <(sed -n '/### Session-Koordination/,/^### /p' GEMINI.md)`
Expected: no differences (identical block).

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md GEMINI.md
git commit -m "docs(agent-lock): cross-tool session-coordination contract [T000510]"
```

---

## Task 9: Full-suite verification + freshness

- [ ] **Step 1: Run the full offline suite**

Run: `task test:all`
Expected: green, including the new `test:agent-lock` (17 tests).

- [ ] **Step 2: Regenerate generated artifacts if required**

Run: `task test:inventory` (then `git status` — commit `website/src/data/test-inventory.json` only if it changed).

- [ ] **Step 3: Final commit (only if artifacts changed)**

```bash
git add -A
git commit -m "chore(agent-lock): regenerate freshness artifacts [T000510]"
```

---

## Self-Review Notes (Plan-Autor)

- **Spec-Coverage:** §2 Registry→Task1; §3 Library→Task1-3; §4 G-A→Task7, G-B→Task3/4/8, G-C→Task7, G-D→Task2/6; §5 Cross-Tool→Task6/8; §6 Fehlerverhalten→fail-open in cmd_guard_precommit + hook gate; §7 Tests→Task1-3+5; §8 Dateien→alle abgedeckt.
- **Identitäts-Konsistenz:** `_my_sid`, `_sid_alive`, `_reapable`, `_lock_field`, `_lock_file`, `_write_lock`, `_holder_msg` durchgängig gleich benannt; Exit-Codes check=0/3, claim=0/1, guard-precommit=0/1 konsistent zwischen Tests und Implementierung.
- **Annahme:** Same-Terminal-Edge (zwei Agenten teilen eine Unix-Session) → SIDs kollidieren → als „mein" gewertet, fällt auf advisory zurück (dokumentiert in CLAUDE.md/GEMINI.md & Spec §6).
