---
title: Inter-Agent-Messaging + Edit-Collision-Detection Implementation Plan
ticket_id: T000882
domains: [test, infra]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Inter-Agent-Messaging + Edit-Collision-Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two lightweight, additive coordination layers on top of the existing `agent-lock.sh` primitives — an active edit-collision warning in `pre-commit` and a small inter-agent message channel — so parallel agent sessions sharing one `.git` stop colliding silently.

**Architecture:** Two new pure-bash scripts (`scripts/agent-collision.sh`, `scripts/agent-msg.sh`) that reuse `agent-lock.sh`'s claim store for peer discovery without modifying it. Collision detection reads each live peer's in-flight files directly via `git -C <peer-worktree> diff` (no new state to sync); the message channel is an append-only JSONL under the shared git-common-dir with per-SID read cursors. The `pre-commit` hook gains a 4-line advisory call (fail-open, blocks only under `AGENT_COLLISION_STRICT=1`); all real logic lives in the helpers.

**Tech Stack:** Bash (POSIX-ish, `flock`, `O_APPEND`), `git diff`, `jq` (read-side filtering), BATS (offline unit tests with `git worktree` fixtures in `$BATS_TMPDIR`).

---

## Ticket & Branch

- **Ticket:** T000882
- **Branch:** `feature/inter-agent-messaging` (already pushed, holds the design spec commit)
- **Spec:** `docs/superpowers/specs/2026-06-16-inter-agent-messaging-design.md` — this plan implements it 1:1.

## ⚠️ Reaper trap — read before you build

`agent-lock.sh reap` (run at the start of every dev-flow skill) deletes branches merged into `main` whose upstream is gone, and prunes their worktrees. **A freshly-created worktree branch with 0 commits points at `main`'s HEAD → counts as "merged" → it (and the worktree) get deleted mid-session.** This already happened once on this branch.

**Mitigation — do this FIRST, before any other work:**

- [ ] **Step 0a: Confirm the worktree exists; recreate it if reaped**

```bash
# If /tmp/wt-inter-agent-messaging is gone (reaper hit), recreate it from the remote branch:
cd /home/patrick/Bachelorprojekt
git fetch origin feature/inter-agent-messaging
bash scripts/worktree-create.sh feature/inter-agent-messaging /tmp/wt-inter-agent-messaging origin/feature/inter-agent-messaging
cd /tmp/wt-inter-agent-messaging && git log --oneline -1
```
Expected: HEAD shows `docs(spec): inter-agent messaging + edit-collision design [T000882]`.

The branch already has 1 commit (the spec) and an upstream, so it is currently reaper-safe. **Commit + push after every task** (the plan does this) to keep it ahead of `main`.

> **Out of scope (evaluate separately, NOT part of this plan):** hardening `cmd_reap` in `agent-lock.sh` to skip branches whose worktree is still live (`git worktree list`). The spec explicitly flags this as a separate evaluation; touching `agent-lock.sh` also breaks Acceptance #6 (agent-lock stays functionally unchanged). Do not do it here.

## Design decision: how peer discovery actually works (read once)

The spec says "enumerate live peers via `agent-lock.sh list`". `list` prints a table (`SCOPE ID TOOL SID STATE LABEL`) that **does not include the `worktree` path**, and Acceptance #6 forbids changing `agent-lock.sh` (so we cannot add a `--json`/`worktree` column). Therefore `agent-collision.sh` reads the **same claim JSON files** `agent-lock.sh` writes — that IS agent-lock's discovery surface — applying the identical overrides (`AGENT_LOCK_DIR`, `AGENT_LOCK_SID`, `AGENT_LOCK_FAKE_ALIVE`) and the identical liveness rule (`pgrep -s` / fake-alive list). This reuses the claim store (no new presence system) while keeping `agent-lock.sh` byte-for-byte unchanged and keeping the tests driveable with the documented overrides. `agent-msg.sh peers` remains a thin passthrough to `agent-lock.sh list` for the human-facing "who is live" view.

---

## File Structure

| File | Responsibility |
|---|---|
| `scripts/agent-collision.sh` (create) | `check [--staged\|--all] [--quiet]` — own files ∩ each live peer's in-flight files; exit 0 none / 1 collision; fail-open. |
| `scripts/agent-msg.sh` (create) | `post`/`read`/`tail`/`peers` — append-only JSONL channel under git-common-dir, per-SID cursor. |
| `tests/unit/agent-collision.bats` (create) | Offline BATS: overlap→1, no-overlap→0, stale peer ignored, missing peer worktree fail-open, own SID excluded, `--quiet`. |
| `tests/unit/agent-msg.bats` (create) | Offline BATS: post→read roundtrip, `--unread` cursor, directed `--to`, broadcast, >4 KB truncation. |
| `.githooks/pre-commit` (modify) | +4-line advisory block after main-checkout guard, before git-crypt guard. Logic lives in the helper. |
| `Taskfile.yml` (modify) | Wire both bats into `test:unit` (coverage-guard requires it). |
| `CLAUDE.md` (modify) | Extend "Session-Koordination" contract with the new commands. |
| `.claude/skills/dev-flow-plan/SKILL.md`, `.claude/skills/dev-flow-execute/SKILL.md` (modify) | One additive `agent-msg.sh read --unread` line each. |

## S1 line-budget table (mandatory pre-flight)

| File | wc -l now | Baseline (`baseline.json`) | Ext limit | Effective budget |
|---|---|---|---|---|
| `.githooks/pre-commit` | 61 | nicht-baselined | **no extension → not subject to an S1 extension-limit** | N/A for the ratchet, but **keep the addition ~4 lines**; all logic in the helper (spec mandate) |
| `scripts/agent-collision.sh` | 0 (new) | nicht-baselined | `.sh` = 500 | 500 → target **≤ ~150** (growth reserve) |
| `scripts/agent-msg.sh` | 0 (new) | nicht-baselined | `.sh` = 500 | 500 → target **≤ ~200** |
| `tests/unit/agent-collision.bats` | 0 (new) | nicht-baselined | `.bats` = 300 | 300 → target **≤ ~160** |
| `tests/unit/agent-msg.bats` | 0 (new) | nicht-baselined | `.bats` = 300 | 300 → target **≤ ~150** |

No file is baselined, so none is frozen; new files start at baseline 0 and only need to stay under the extension limit. **No baseline entries may be added** (the freshness key-count assertion fails on baseline growth) — these scripts must stay under their limits, never get an ignore/baseline exception.

---

## Task 1: `agent-collision.sh` — active edit-collision detection (TDD)

**Files:**
- Create: `scripts/agent-collision.sh`
- Test: `tests/unit/agent-collision.bats`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/agent-collision.bats`:

```bash
#!/usr/bin/env bats
# Tests for scripts/agent-collision.sh — active live edit-collision detection. [T000882]
#
# Reuses agent-lock.sh's claim store (read-only) for peer discovery. Fixtures use
# real `git worktree add` checkouts created OUTSIDE the repo tree (in $BATS_TMPDIR
# via mktemp -d), per CLAUDE.md Dev-Rule #8, with teardown cleanup. Peer liveness
# and identity are driven by the documented agent-lock overrides:
#   AGENT_LOCK_DIR (claim store), AGENT_LOCK_SID (my session id),
#   AGENT_LOCK_FAKE_ALIVE (space-separated list of "alive" SIDs).

setup() {
  HELPER="$BATS_TEST_DIRNAME/../../scripts/agent-collision.sh"
  TMP="$(mktemp -d "${BATS_TMPDIR:-/tmp}/agent-collision.XXXXXX")"
  export HOME="$TMP/home"; mkdir -p "$HOME"
  export GIT_CONFIG_GLOBAL="$HOME/.gitconfig"; : > "$GIT_CONFIG_GLOBAL"

  # One shared repo; two worktrees = two "sessions" sharing one .git.
  MAIN="$TMP/main"; mkdir -p "$MAIN"
  git init -q -b main "$MAIN"
  git -C "$MAIN" config user.email t@example.com
  git -C "$MAIN" config user.name Tester
  printf 'base\n' > "$MAIN/shared.txt"
  printf 'base\n' > "$MAIN/other.txt"
  git -C "$MAIN" add -A && git -C "$MAIN" commit -qm init

  WT_A="$TMP/wt-a"; WT_B="$TMP/wt-b"
  git -C "$MAIN" worktree add -q -b feat-a "$WT_A" HEAD
  git -C "$MAIN" worktree add -q -b feat-b "$WT_B" HEAD

  export AGENT_LOCK_DIR="$TMP/locks"; mkdir -p "$AGENT_LOCK_DIR"
  export AGENT_LOCK_SID="1111"            # "my" session = worktree A
  export AGENT_LOCK_FAKE_ALIVE="1111 2222" # both sessions alive by default
}

teardown() {
  git -C "$MAIN" worktree remove --force "$WT_A" 2>/dev/null || true
  git -C "$MAIN" worktree remove --force "$WT_B" 2>/dev/null || true
  rm -rf "$TMP"
}

# Write a peer claim JSON the way agent-lock.sh does (only fields we read).
_peer_claim() { # <file> <owner_sid> <worktree>
  cat > "$AGENT_LOCK_DIR/$1" <<EOF
{
  "scope": "branch",
  "id": "feat-b",
  "owner_sid": "$2",
  "tool": "gemini",
  "label": "dev-flow-execute",
  "worktree": "$3",
  "branch": "feat-b"
}
EOF
}

@test "overlapping in-flight file → exit 1 + COLLISION line naming the file" {
  _peer_claim peer.json 2222 "$WT_B"
  printf 'b-change\n' >> "$WT_B/shared.txt"          # peer in-flight (unstaged)
  printf 'a-change\n' >> "$WT_A/shared.txt"
  git -C "$WT_A" add shared.txt                       # my staged file
  run bash -c "cd '$WT_A' && bash '$HELPER' check --staged"
  [ "$status" -eq 1 ]
  echo "$output" | grep -q 'COLLISION'
  echo "$output" | grep -q 'shared.txt'
}

@test "no overlap → exit 0" {
  _peer_claim peer.json 2222 "$WT_B"
  printf 'b-change\n' >> "$WT_B/other.txt"            # peer touches other.txt
  printf 'a-change\n' >> "$WT_A/shared.txt"
  git -C "$WT_A" add shared.txt                       # I touch shared.txt
  run bash -c "cd '$WT_A' && bash '$HELPER' check --staged"
  [ "$status" -eq 0 ]
}

@test "stale (dead) peer is ignored → exit 0" {
  export AGENT_LOCK_FAKE_ALIVE="1111"                 # 2222 no longer alive
  _peer_claim peer.json 2222 "$WT_B"
  printf 'b-change\n' >> "$WT_B/shared.txt"
  printf 'a-change\n' >> "$WT_A/shared.txt"
  git -C "$WT_A" add shared.txt
  run bash -c "cd '$WT_A' && bash '$HELPER' check --staged"
  [ "$status" -eq 0 ]
}

@test "missing peer worktree → fail-open exit 0" {
  _peer_claim peer.json 2222 "$TMP/gone"             # worktree dir does not exist
  printf 'a-change\n' >> "$WT_A/shared.txt"
  git -C "$WT_A" add shared.txt
  run bash -c "cd '$WT_A' && bash '$HELPER' check --staged"
  [ "$status" -eq 0 ]
}

@test "own SID is excluded (not a self-collision) → exit 0" {
  _peer_claim mine.json 1111 "$WT_B"                  # claim owned by me
  printf 'b-change\n' >> "$WT_B/shared.txt"
  printf 'a-change\n' >> "$WT_A/shared.txt"
  git -C "$WT_A" add shared.txt
  run bash -c "cd '$WT_A' && bash '$HELPER' check --staged"
  [ "$status" -eq 0 ]
}

@test "--all includes unstaged own files" {
  _peer_claim peer.json 2222 "$WT_B"
  printf 'b-change\n' >> "$WT_B/shared.txt"
  printf 'a-change\n' >> "$WT_A/shared.txt"           # unstaged in A
  run bash -c "cd '$WT_A' && bash '$HELPER' check --all"
  [ "$status" -eq 1 ]
  echo "$output" | grep -q 'shared.txt'
}

@test "--quiet suppresses the warning lines but keeps the exit code" {
  _peer_claim peer.json 2222 "$WT_B"
  printf 'b-change\n' >> "$WT_B/shared.txt"
  printf 'a-change\n' >> "$WT_A/shared.txt"
  git -C "$WT_A" add shared.txt
  run bash -c "cd '$WT_A' && bash '$HELPER' check --staged --quiet"
  [ "$status" -eq 1 ]
  [ -z "$output" ]
}

@test "no peers at all → exit 0" {
  printf 'a-change\n' >> "$WT_A/shared.txt"
  git -C "$WT_A" add shared.txt
  run bash -c "cd '$WT_A' && bash '$HELPER' check --staged"
  [ "$status" -eq 0 ]
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /tmp/wt-inter-agent-messaging && ./tests/unit/lib/bats-core/bin/bats tests/unit/agent-collision.bats`
Expected: FAIL — every test errors because `scripts/agent-collision.sh` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/agent-collision.sh`:

```bash
#!/usr/bin/env bash
# scripts/agent-collision.sh — active live edit-collision warning. [T000882]
#
# Warns when the files you are about to commit are ALSO in-flight in another
# LIVE agent session's worktree. Pure local bash — no cluster, no DB → offline-
# and CI-safe. Complements scripts/factory/conflict-check.sh (DB-based, Factory
# scheduling) and agent-lock.sh (the passive mutex), without changing either.
#
# Discovery: reads agent-lock.sh's own claim store (the JSON files it writes),
# because `agent-lock.sh list` does not expose the worktree path and agent-lock.sh
# must stay unchanged. Honours the same overrides: AGENT_LOCK_DIR, AGENT_LOCK_SID,
# AGENT_LOCK_FAKE_ALIVE.
#
# Exit: 0 = no collision (or fail-open), 1 = collision(s) found.
set -uo pipefail

_my_sid() {
  if [ -n "${AGENT_LOCK_SID:-}" ]; then printf '%s\n' "$AGENT_LOCK_SID"; return; fi
  local s; s="$(ps -o sess= -p "$$" 2>/dev/null | tr -d ' ')"
  if [ -n "$s" ]; then printf '%s\n' "$s"; return; fi
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

_lock_dir() {
  if [ -n "${AGENT_LOCK_DIR:-}" ]; then printf '%s\n' "$AGENT_LOCK_DIR"; return; fi
  local cd; cd="$(git rev-parse --git-common-dir 2>/dev/null)" || { printf '/tmp/agent-locks\n'; return; }
  case "$cd" in /*) : ;; *) cd="$(cd "$cd" && pwd)";; esac
  printf '%s/agent-locks\n' "$cd"
}

_field() { sed -n "s/.*\"$2\": *\"\\([^\"]*\\)\".*/\\1/p" "$1" 2>/dev/null | head -1; }

cmd_check() {
  local mode=staged quiet=0
  while [ $# -gt 0 ]; do case "$1" in
    --staged) mode=staged;; --all) mode=all;; --quiet) quiet=1;; *) ;;
  esac; shift; done

  # 1) my candidate files (repo-relative; comparable across worktrees of one repo)
  local own; own="$(git diff --cached --name-only 2>/dev/null)"
  if [ "$mode" = "all" ]; then
    own="$(printf '%s\n%s\n' "$own" "$(git diff --name-only HEAD 2>/dev/null)")"
  fi
  own="$(printf '%s\n' "$own" | sed '/^$/d' | sort -u)"
  [ -n "$own" ] || return 0

  local mysid d; mysid="$(_my_sid)"; d="$(_lock_dir)"
  [ -d "$d" ] || return 0

  local found=0 f sid wt peer file
  for f in "$d"/*.json; do
    [ -e "$f" ] || continue
    sid="$(_field "$f" owner_sid)"
    [ "$sid" = "$mysid" ] && continue          # skip my own claims
    _sid_alive "$sid" || continue              # skip dead/stale peers
    wt="$(_field "$f" worktree)"
    [ -n "$wt" ] && [ "$wt" != "-" ] && [ -d "$wt" ] || continue   # fail-open
    git -C "$wt" rev-parse --git-dir >/dev/null 2>&1 || continue   # fail-open
    peer="$( { git -C "$wt" diff --name-only HEAD 2>/dev/null; \
               git -C "$wt" diff --cached --name-only 2>/dev/null; } | sed '/^$/d' | sort -u )"
    [ -n "$peer" ] || continue
    while IFS= read -r file; do
      [ -n "$file" ] || continue
      if printf '%s\n' "$peer" | grep -qxF "$file"; then
        found=1
        if [ "$quiet" -eq 0 ]; then
          printf '⚠ COLLISION: %s — auch in-flight bei %s/%s (sid %s, worktree %s)\n' \
            "$file" "$(_field "$f" tool)" "$(_field "$f" label)" "$sid" "$wt" >&2
        fi
      fi
    done <<EOF
$own
EOF
  done
  [ "$found" -eq 0 ]
}

main() {
  local cmd="${1:-}"; shift 2>/dev/null || true
  case "$cmd" in
    check) cmd_check "$@";;
    *) echo "Usage: agent-collision.sh check [--staged|--all] [--quiet]" >&2; return 2;;
  esac
}
main "$@"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /tmp/wt-inter-agent-messaging && chmod +x scripts/agent-collision.sh && ./tests/unit/lib/bats-core/bin/bats tests/unit/agent-collision.bats`
Expected: PASS — all 8 tests green.

- [ ] **Step 5: Commit**

```bash
cd /tmp/wt-inter-agent-messaging
git add scripts/agent-collision.sh tests/unit/agent-collision.bats
git commit -m "feat(coord): add agent-collision.sh live edit-collision detection [T000882]"
git push
```

---

## Task 2: `agent-msg.sh` — inter-agent message channel (TDD)

**Files:**
- Create: `scripts/agent-msg.sh`
- Test: `tests/unit/agent-msg.bats`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/agent-msg.bats`:

```bash
#!/usr/bin/env bats
# Tests for scripts/agent-msg.sh — lightweight inter-agent message channel. [T000882]
#
# Storage = append-only JSONL under the git-common-dir; per-SID read cursor.
# Tests override storage via AGENT_MSG_DIR and identity via AGENT_LOCK_SID, so no
# real .git is required. Fixtures live in $BATS_TMPDIR (CLAUDE.md Dev-Rule #8).

setup() {
  HELPER="$BATS_TEST_DIRNAME/../../scripts/agent-msg.sh"
  TMP="$(mktemp -d "${BATS_TMPDIR:-/tmp}/agent-msg.XXXXXX")"
  export AGENT_MSG_DIR="$TMP/msgs"
}

teardown() { rm -rf "$TMP"; }

_post() { # <sid> <args...>
  local sid="$1"; shift
  AGENT_LOCK_SID="$sid" bash "$HELPER" post "$@"
}
_read() { # <sid> <args...>
  local sid="$1"; shift
  AGENT_LOCK_SID="$sid" bash "$HELPER" read "$@"
}

@test "post → read roundtrip" {
  _post 1111 "hello world"
  run _read 2222
  [ "$status" -eq 0 ]
  echo "$output" | grep -q 'hello world'
}

@test "--unread delivers each message exactly once per SID" {
  _post 1111 "first"
  _post 1111 "second"
  run _read 2222 --unread
  [ "$status" -eq 0 ]
  echo "$output" | grep -q 'first'
  echo "$output" | grep -q 'second'
  run _read 2222 --unread          # cursor advanced → nothing new
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "--unread cursor is per-SID (independent readers)" {
  _post 1111 "broadcast-msg"
  run _read 2222 --unread; echo "$output" | grep -q 'broadcast-msg'
  run _read 3333 --unread          # different SID has its own cursor
  echo "$output" | grep -q 'broadcast-msg'
}

@test "directed --to is delivered only to the target via --mine" {
  _post 1111 "for two" --to 2222
  run _read 2222 --mine; [ "$status" -eq 0 ]; echo "$output" | grep -q 'for two'
  run _read 3333 --mine; [ "$status" -eq 0 ]; ! echo "$output" | grep -q 'for two'
}

@test "broadcast (no --to) reaches everyone via --mine" {
  _post 1111 "all hands"
  run _read 9999 --mine; [ "$status" -eq 0 ]; echo "$output" | grep -q 'all hands'
}

@test "text over 4 KB is truncated and warns on stderr" {
  big="$(printf 'x%.0s' $(seq 1 5000))"
  run _post 1111 "$big"
  [ "$status" -eq 0 ]
  echo "$output" | grep -qi 'truncat'                    # warning on stderr
  # stored text must be <= 4096 bytes
  len="$(jq -r '.text | length' "$AGENT_MSG_DIR/log.jsonl")"
  [ "$len" -le 4096 ]
}

@test "tail prints human-readable lines" {
  _post 1111 "line one"
  run bash "$HELPER" tail -n 1
  [ "$status" -eq 0 ]
  echo "$output" | grep -q 'line one'
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /tmp/wt-inter-agent-messaging && ./tests/unit/lib/bats-core/bin/bats tests/unit/agent-msg.bats`
Expected: FAIL — `scripts/agent-msg.sh` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/agent-msg.sh`:

```bash
#!/usr/bin/env bash
# scripts/agent-msg.sh — lightweight inter-agent message channel (hcom-style). [T000882]
#
# Append-only JSONL shared across all worktrees of one repo, under the git-common-
# dir (never committed — lives inside .git/). Per-SID read cursor. Peer discovery
# is delegated to agent-lock.sh (no separate presence system).
#
# Overrides: AGENT_MSG_DIR (storage), AGENT_LOCK_SID (identity), AGENT_MSG_LABEL.
set -uo pipefail

_my_sid() {
  if [ -n "${AGENT_LOCK_SID:-}" ]; then printf '%s\n' "$AGENT_LOCK_SID"; return; fi
  local s; s="$(ps -o sess= -p "$$" 2>/dev/null | tr -d ' ')"
  if [ -n "$s" ]; then printf '%s\n' "$s"; return; fi
  local stat rest; stat="$(cat /proc/self/stat 2>/dev/null)"; rest="${stat##*) }"
  # shellcheck disable=SC2086
  set -- $rest; printf '%s\n' "${4:-0}"
}

_detect_tool() {
  if [ -n "${CLAUDECODE:-}${CLAUDE_CODE:-}" ]; then echo claude
  elif [ -n "${GEMINI_CLI:-}${GEMINI_SANDBOX:-}${GEMINI_API_KEY:-}" ]; then echo gemini
  else echo unknown; fi
}

_msg_dir() {
  if [ -n "${AGENT_MSG_DIR:-}" ]; then printf '%s\n' "$AGENT_MSG_DIR"; return; fi
  local cd; cd="$(git rev-parse --git-common-dir 2>/dev/null)" || { printf '/tmp/agent-msgs\n'; return; }
  case "$cd" in /*) : ;; *) cd="$(cd "$cd" && pwd)";; esac
  printf '%s/agent-msgs\n' "$cd"
}

_log()    { printf '%s/log.jsonl\n' "$(_msg_dir)"; }
_cursor() { printf '%s/cursor-%s\n' "$(_msg_dir)" "$1"; }

# JSON-escape: backslash, doublequote, then newlines → \n.
_json_esc() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | sed ':a;N;$!ba;s/\n/\\n/g'
}

cmd_post() {
  local text="" to=""
  while [ $# -gt 0 ]; do case "$1" in
    --to) to="$2"; shift 2;; *) [ -z "$text" ] && text="$1"; shift;;
  esac; done
  local bytes; bytes="$(printf '%s' "$text" | wc -c | tr -d ' ')"
  if [ "$bytes" -gt 4096 ]; then
    text="$(printf '%s' "$text" | head -c 4096)"
    echo "agent-msg: text truncated to 4096 bytes" >&2
  fi
  local d; d="$(_msg_dir)"; mkdir -p "$d" 2>/dev/null || return 0
  local line
  line="$(printf '{"ts":"%s","from_sid":"%s","from_tool":"%s","from_label":"%s","to":"%s","text":"%s"}' \
    "$(date +%s)" "$(_my_sid)" "$(_detect_tool)" "${AGENT_MSG_LABEL:-}" "$to" "$(_json_esc "$text")")"
  # flock belt-and-braces on top of O_APPEND atomicity.
  local lf="$d/.log.lock"; touch "$lf" 2>/dev/null || true
  exec 9>"$lf" || true; flock 9 2>/dev/null || true
  printf '%s\n' "$line" >> "$(_log)"
}

cmd_read() {
  local unread=0 mine=0 since="" me; me="$(_my_sid)"
  while [ $# -gt 0 ]; do case "$1" in
    --unread) unread=1;; --mine) mine=1;; --since) since="$2"; shift;; *) ;;
  esac; shift; done
  local log; log="$(_log)"; [ -f "$log" ] || return 0

  local slice
  if [ "$unread" -eq 1 ]; then
    local cur; cur="$(cat "$(_cursor "$me")" 2>/dev/null || echo 0)"
    local total; total="$(wc -l < "$log" | tr -d ' ')"
    slice="$(tail -n +"$((cur + 1))" "$log")"
    printf '%s\n' "$total" > "$(_cursor "$me")"   # advance past everything seen
  else
    slice="$(cat "$log")"
  fi
  [ -n "$slice" ] || return 0

  printf '%s\n' "$slice" | while IFS= read -r ln; do
    [ -n "$ln" ] || continue
    if [ -n "$since" ]; then
      printf '%s' "$ln" | jq -e --argjson s "$since" 'select((.ts|tonumber) >= $s)' >/dev/null 2>&1 || continue
    fi
    if [ "$mine" -eq 1 ]; then
      printf '%s' "$ln" | jq -e --arg me "$me" --arg lbl "${AGENT_MSG_LABEL:-}" \
        'select(.to=="" or .to==$me or (($lbl|length)>0 and .to==$lbl))' >/dev/null 2>&1 || continue
    fi
    printf '%s\n' "$ln"
  done
}

cmd_tail() {
  local n=10
  while [ $# -gt 0 ]; do case "$1" in -n) n="$2"; shift 2;; *) shift;; esac; done
  local log; log="$(_log)"; [ -f "$log" ] || return 0
  tail -n "$n" "$log" | while IFS= read -r ln; do
    [ -n "$ln" ] || continue
    printf '%s' "$ln" | jq -r '"[\(.ts)] \(.from_tool)/\(.from_label) → \(if .to=="" then "all" else .to end): \(.text)"' 2>/dev/null \
      || printf '%s\n' "$ln"
  done
}

cmd_peers() { bash "$(dirname "$0")/agent-lock.sh" list; }

main() {
  local cmd="${1:-}"; shift 2>/dev/null || true
  case "$cmd" in
    post)  cmd_post "$@";;
    read)  cmd_read "$@";;
    tail)  cmd_tail "$@";;
    peers) cmd_peers "$@";;
    *) echo "Usage: agent-msg.sh {post <text> [--to <sid|label>] | read [--unread] [--mine] [--since <epoch>] | tail [-n N] | peers}" >&2; return 2;;
  esac
}
main "$@"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /tmp/wt-inter-agent-messaging && chmod +x scripts/agent-msg.sh && ./tests/unit/lib/bats-core/bin/bats tests/unit/agent-msg.bats`
Expected: PASS — all 7 tests green.

- [ ] **Step 5: Commit**

```bash
cd /tmp/wt-inter-agent-messaging
git add scripts/agent-msg.sh tests/unit/agent-msg.bats
git commit -m "feat(coord): add agent-msg.sh inter-agent message channel [T000882]"
git push
```

---

## Task 3: Wire both bats into `task test:unit` (coverage-guard)

**Files:**
- Modify: `Taskfile.yml` — add two internal subtasks + two list entries.

**Why:** `scripts/tests/unit-coverage-guard.sh` fails CI if any `tests/unit/*.bats` is neither referenced by a task (grep for `<name>.bats` in `Taskfile.yml`) nor in `tests/unit/.coverage-allowlist`. Wiring into `test:unit` also makes `task test:changed` run them (it calls `task test:unit` when `tests/unit/` files change).

- [ ] **Step 1: Add the two internal subtasks**

In `Taskfile.yml`, near the other `test:unit:*` internal task definitions (e.g. just after the `test:unit:mediaviewer-host-durability:` block — confirm the exact location, the anchor list around line 249 is the aggregate, the internal defs live separately), add:

```yaml
  test:unit:agent-collision:
    internal: true
    cmds:
      - ./tests/unit/lib/bats-core/bin/bats tests/unit/agent-collision.bats

  test:unit:agent-msg:
    internal: true
    cmds:
      - ./tests/unit/lib/bats-core/bin/bats tests/unit/agent-msg.bats
```

- [ ] **Step 2: Reference them from the `test:unit` aggregate**

In the `test:unit:` aggregate task's `cmds:` list (starts ~line 249), append after the last entry (`- task: test:unit:mediaviewer-host-durability`):

```yaml
      - task: test:unit:agent-collision
      - task: test:unit:agent-msg
```

- [ ] **Step 3: Verify both run and the coverage-guard is green**

Run:
```bash
cd /tmp/wt-inter-agent-messaging
task test:unit:agent-collision
task test:unit:agent-msg
bash scripts/tests/unit-coverage-guard.sh
```
Expected: both bats suites PASS; coverage-guard prints `unit-coverage: all N tests/unit/*.bats files are tracked` (the two new files no longer reported as missing).

- [ ] **Step 4: Commit**

```bash
cd /tmp/wt-inter-agent-messaging
git add Taskfile.yml
git commit -m "test(coord): wire agent-collision + agent-msg bats into task test:unit [T000882]"
git push
```

---

## Task 4: `pre-commit` advisory collision block (fail-open)

**Files:**
- Modify: `.githooks/pre-commit` — insert a 4-line advisory block **after** the main-checkout guard (current lines 7–16), **before** the git-crypt guard (current line 18).

**Constraint:** keep the hook addition ~4 lines; all logic stays in `agent-collision.sh` (S1 mandate + spec). Fail-open: a missing/broken helper must not block the commit (it exits non-zero → `if ! ...` is true → but with `AGENT_COLLISION_STRICT` unset, nothing happens and the commit proceeds).

- [ ] **Step 1: Insert the advisory block**

Insert between the `fi` that closes the main-checkout guard (current line 16) and the blank line before the git-crypt guard:

```bash
# --- agent-collision: advisory live edit-collision warning (fail-open) [T000882] ---
# Warns (stderr) if staged files are also in-flight in another LIVE session's
# worktree. Never blocks unless AGENT_COLLISION_STRICT=1. Fail-open: a missing or
# erroring helper leaves the commit untouched.
if ! bash "$repo_root/scripts/agent-collision.sh" check --staged; then
  if [ -n "${AGENT_COLLISION_STRICT:-}" ]; then
    echo "ERROR: refusing commit — staged files collide with a live session (AGENT_COLLISION_STRICT=1)." >&2
    exit 1
  fi
fi
```

- [ ] **Step 2: Manual fail-open + strict verification (two live worktrees)**

Run (simulates the Acceptance #1 scenario using the real hook path, fake-alive overrides):
```bash
cd /tmp/wt-inter-agent-messaging
# A throwaway sandbox so we don't touch the real lock store:
SBX="$(mktemp -d)"; export AGENT_LOCK_DIR="$SBX/locks"; mkdir -p "$AGENT_LOCK_DIR"
export AGENT_LOCK_SID=1111 AGENT_LOCK_FAKE_ALIVE="1111 2222"
# Point a fake peer claim at THIS worktree and dirty a file there:
cat > "$AGENT_LOCK_DIR/peer.json" <<EOF
{ "owner_sid": "2222", "tool": "gemini", "label": "test", "worktree": "$PWD" }
EOF
echo "x" >> README.md   # peer "in-flight" = unstaged change in $PWD
# Non-strict: warns but exits 0
bash scripts/agent-collision.sh check --all; echo "exit=$? (expect 1, warning on stderr)"
# Strict blocks:
AGENT_COLLISION_STRICT=1 bash -c 'bash scripts/agent-collision.sh check --all || { [ -n "$AGENT_COLLISION_STRICT" ] && echo "WOULD BLOCK"; }'
# Fail-open if helper missing:
mv scripts/agent-collision.sh /tmp/_ac.bak
bash -c 'if ! bash "$PWD/scripts/agent-collision.sh" check --staged; then [ -n "${AGENT_COLLISION_STRICT:-}" ] && exit 1; fi; echo "COMMIT PROCEEDS (fail-open)"'
mv /tmp/_ac.bak scripts/agent-collision.sh
git checkout -- README.md; rm -rf "$SBX"; unset AGENT_LOCK_DIR AGENT_LOCK_SID AGENT_LOCK_FAKE_ALIVE
```
Expected: warning line printed + `exit=1`; `WOULD BLOCK` under strict; `COMMIT PROCEEDS (fail-open)` when the helper is absent.

- [ ] **Step 3: Commit**

```bash
cd /tmp/wt-inter-agent-messaging
git add .githooks/pre-commit
git commit -m "feat(coord): advisory edit-collision check in pre-commit (fail-open) [T000882]"
git push
```

> Note: committing here runs the modified hook on itself. The freshness auto-stage block may add generated artifacts to this commit — that is expected; include them.

---

## Task 5: Documentation & workflow integration (additive)

**Files:**
- Modify: `CLAUDE.md` — extend the "Session-Koordination" bullet list.
- Modify: `.claude/skills/dev-flow-plan/SKILL.md` — one additive line.
- Modify: `.claude/skills/dev-flow-execute/SKILL.md` — one additive line.

**Why (S4):** the new scripts must be referenced from docs/skills (not orphaned). `agent-collision.sh` is already referenced by `pre-commit` (Task 4); `agent-msg.sh` is referenced here.

- [ ] **Step 1: Extend the CLAUDE.md "Session-Koordination" contract**

In `CLAUDE.md`, inside the `### Session-Koordination (parallele Agenten — Claude + Gemini)` bullet list (after the `release`/`list` bullets, before the `main-Checkout` bullet), add:

```markdown
- **Nachrichten an parallele Sessions:** `bash scripts/agent-msg.sh read --unread` zu Skill-Start (offene Nachrichten anderer lebender Sessions sichten); vor dem Anfassen geteilter Registry-Dateien (`k3d/configmap-domains.yaml`, `environments/schema.yaml`) optional `bash scripts/agent-msg.sh post "berühre <datei> auf <branch>"` (broadcast) oder `--to <sid|label>` gerichtet. Kanal = append-only JSONL unter `.git/agent-msgs/` (nie committet).
- **Aktive Edit-Kollisionswarnung:** der `.githooks/pre-commit`-Hook ruft `scripts/agent-collision.sh check --staged` auf und warnt, wenn eine **andere lebende** Session dieselbe Datei in-flight hat. Advisory/fail-open — blockt nur mit `AGENT_COLLISION_STRICT=1`. Manuell: `bash scripts/agent-collision.sh check --all`.
```

- [ ] **Step 2: Add the additive line to dev-flow-plan**

In `.claude/skills/dev-flow-plan/SKILL.md`, right after the existing `bash scripts/agent-lock.sh list` line (~line 62), add:

```markdown
bash scripts/agent-msg.sh read --unread   # offene Nachrichten paralleler Sessions sichten [T000882]
```

- [ ] **Step 3: Add the additive line to dev-flow-execute**

In `.claude/skills/dev-flow-execute/SKILL.md`, right after the existing `bash scripts/agent-lock.sh reap` line (~line 175), add:

```markdown
bash scripts/agent-msg.sh read --unread   # offene Nachrichten paralleler Sessions sichten [T000882]
```

- [ ] **Step 4: Verify references resolve (S4 sanity)**

Run:
```bash
cd /tmp/wt-inter-agent-messaging
grep -rl 'agent-msg.sh'  CLAUDE.md .claude/skills/dev-flow-plan/SKILL.md .claude/skills/dev-flow-execute/SKILL.md
grep -rl 'agent-collision.sh' .githooks/pre-commit CLAUDE.md
```
Expected: every script appears in at least one referencing file (no orphan).

- [ ] **Step 5: Commit**

```bash
cd /tmp/wt-inter-agent-messaging
git add CLAUDE.md .claude/skills/dev-flow-plan/SKILL.md .claude/skills/dev-flow-execute/SKILL.md
git commit -m "docs(coord): document agent-msg + collision contract in CLAUDE.md and dev-flow skills [T000882]"
git push
```

---

## Task 6: Final verification (CI-equivalent) — MANDATORY

**Files:** none (gate only). Run from the worktree root.

- [ ] **Step 1: Targeted tests for the changed surface**

Run: `cd /tmp/wt-inter-agent-messaging && task test:changed`
Expected: the new BATS suites run (via `task test:unit`) and pass; quality check green.

- [ ] **Step 2: Regenerate freshness artifacts (test-inventory etc.)**

Run: `cd /tmp/wt-inter-agent-messaging && task freshness:regenerate`
Expected: `website/src/data/test-inventory.json` updates to include the two new bats files; other generated artifacts may refresh.

- [ ] **Step 3: Regenerate the test inventory explicitly and stage it**

Run: `cd /tmp/wt-inter-agent-messaging && task test:inventory`
Expected: `website/src/data/test-inventory.json` reflects `agent-collision.bats` + `agent-msg.bats`. CI fails if this file differs from committed — it must be committed.

- [ ] **Step 4: Full freshness + quality gate (S1–S4 ratchet + baseline assertion)**

Run: `cd /tmp/wt-inter-agent-messaging && task freshness:check`
Expected: PASS. In particular:
- **S1**: no new/grown file over its limit (new `.sh` ≤ 500, new `.bats` ≤ 300; pre-commit extensionless).
- **S2**: no import cycles (pure bash, no module graph touched).
- **S3**: no `*.mentolder.de`/`*.korczewski.de` literals in the new code.
- **S4**: `agent-collision.sh` referenced by pre-commit + CLAUDE.md; `agent-msg.sh` referenced by CLAUDE.md + dev-flow skills.
- **Baseline key-count** unchanged vs `main` (no baseline entries added).

- [ ] **Step 5: Run the full offline suite once (CI parity)**

Run: `cd /tmp/wt-inter-agent-messaging && task test:all`
Expected: PASS (offline). Confirms the new bats are wired and nothing else regressed.

- [ ] **Step 6: Commit any regenerated artifacts and push**

```bash
cd /tmp/wt-inter-agent-messaging
git add website/src/data/test-inventory.json docs/code-quality/repo-index.json 2>/dev/null || true
git add -A
git commit -m "chore(coord): regenerate freshness artifacts for inter-agent messaging [T000882]" || echo "nothing to commit"
git push
```

- [ ] **Step 7: Open the PR with auto-merge**

```bash
cd /tmp/wt-inter-agent-messaging
gh pr create --fill --base main --head feature/inter-agent-messaging
gh pr merge --squash --auto
```

---

## Acceptance-criteria → task mapping (self-review)

| Spec acceptance | Covered by |
|---|---|
| 1. Second commit shows `⚠ COLLISION: X` (blocks under STRICT) | Task 1 (`overlapping → exit 1`), Task 4 (Step 2 manual verify) |
| 2. `post`/`read` roundtrip across worktree boundary (shared common-dir) | Task 2 (`post → read roundtrip`) |
| 3. `--unread` delivers each message once per SID | Task 2 (`--unread … exactly once`, `cursor per-SID`) |
| 4. Offline BATS green, wired into `task test:all` | Task 1+2 (bats), Task 3 (wiring), Task 6 Step 5 |
| 5. Fail-open when peer worktree/helper missing | Task 1 (`missing peer worktree → exit 0`), Task 4 (fail-open verify) |
| 6. `conflict-check.sh` + `agent-lock.sh` unchanged | No task modifies them — verified by their absence from every "Modify" list |

## Out of scope (do not implement here)
- `cmd_reap` hardening to skip live-worktree branches (spec: separate evaluation; would change `agent-lock.sh` → breaks Acceptance #6).
- Any Factory dispatcher / `conflict-check.sh` change (the pre-commit hook already covers Factory worktree agents).
- The discarded "Plans as SSoT coordination token" alternative (spec NICHT-Ziele).
