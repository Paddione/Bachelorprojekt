#!/usr/bin/env bats

# PRUEFMODUS: Output-Verifikation (T1, T3) + Doku-Grep (T2, T4)
# Spec: agent-skills.md
# Fix: T006365 — delegierte Subagenten (Implementer/Planer) verlieren die
#       Datei-Tools, weil Task-Tool-Subagenten eine eigene Session-ID haben und
#       der Parent-Claim (owner_sid = Orchestrator-SID) als fremd gilt (Regel 3).
#       Fix: die delegierenden Skills propagieren die Parent-SID per
#       AGENT_LOCK_SID (aus `agent-lock.sh mine`); der Guard nennt den
#       Propagations-Hinweis in der Regel-3-Meldung.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  BATS_TMPDIR=$(mktemp -d)
  REPO="$BATS_TMPDIR/repo"
  mkdir -p "$REPO/wt-other"
  touch "$REPO/wt-other/README.md"

  cd "$REPO"
  git init -b main >/dev/null 2>&1
  git config user.email "test@example.com"
  git config user.name "Test User"
  touch README.md
  git add README.md
  git commit -m "chore: init" >/dev/null 2>&1

  export AGENT_LOCK_DIR="$BATS_TMPDIR/locks"
  mkdir -p "$AGENT_LOCK_DIR"

  # Fremder lebender Claim (Orchestrator-SID) auf wt-other
  echo "{\"owner_sid\":\"orchestrator-sid\",\"owner_pid\":\"1234\",\"worktree\":\"$REPO/wt-other\",\"branch\":\"fix/demo-T001111\",\"label\":\"live\"}" > "$AGENT_LOCK_DIR/branch__fix-demo-T001111.json"

  GUARD="$REPO_ROOT/scripts/hooks/worktree-write-guard.sh"
}

teardown() {
  rm -rf "$BATS_TMPDIR"
}

@test "T1: Regel-3-Ablehnung nennt den AGENT_LOCK_SID-Propagations-Hinweis (delegierter Subagent)" {
  export AGENT_LOCK_SID="implementer-sid"
  local TARGET="$REPO/wt-other/README.md"

  run bash "$GUARD" <<< "$(printf '{"tool_input":{"file_path":"%s"}}' "$TARGET")"

  [ "$status" -eq 2 ]
  run grep -qi 'AGENT_LOCK_SID' <<< "$output"
  [ "$status" -eq 0 ]
}

@test "T2: dev-flow-execute SKILL.md propagiert die Parent-SID an den Implementer" {
  local skill="$REPO_ROOT/.claude/skills/dev-flow-execute/SKILL.md"
  [ -f "$skill" ]
  run grep -qi 'agent-lock.sh mine' "$skill"
  [ "$status" -eq 0 ]
  run grep -qi 'AGENT_LOCK_SID' "$skill"
  [ "$status" -eq 0 ]
}

@test "T3: Worktree-Write mit AGENT_LOCK_SID = owner_sid des Claims wird erlaubt (Propagations-Mechanismus)" {
  export AGENT_LOCK_SID="orchestrator-sid"
  local TARGET="$REPO/wt-other/README.md"

  run bash "$GUARD" <<< "$(printf '{"tool_input":{"file_path":"%s"}}' "$TARGET")"

  [ "$status" -eq 0 ]
}

@test "T4: dev-flow-plan SKILL.md propagiert die Parent-SID an Plan-Subagenten" {
  local skill="$REPO_ROOT/.claude/skills/dev-flow-plan/SKILL.md"
  [ -f "$skill" ]
  run grep -qi 'agent-lock.sh mine' "$skill"
  [ "$status" -eq 0 ]
  run grep -qi 'AGENT_LOCK_SID' "$skill"
  [ "$status" -eq 0 ]
}
