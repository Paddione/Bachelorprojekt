#!/usr/bin/env bats
# tests/spec/software-factory/babysit-prs-live-lock-guard-T003137.bats
# SSOT: openspec/specs/software-factory.md
# Ticket: T003137 — babysit-prs.sh entfernt Worktrees ohne den live-Lock-Guard aus T002896.
#
# PRUEFMODUS: Output-/Zustands-Verifikation. Ein echtes Bare-Origin + Klon-Repo wird gebaut, ein
# PR-Branch darin angelegt und gepusht, `gh`/`task` werden per PATH-Stub ersetzt, und
# `scripts/factory/babysit-prs.sh` wird als echter Kommandoaufruf (nicht per grep) durchlaufen,
# bis es den Fix-Worktree wieder entfernen will. Geprueft wird danach die tatsaechliche Existenz
# des Worktree-Verzeichnisses — kein Source-Grep auf "check-branch-live".
#
# Der `task`-Stub simuliert den Race aus dem Ticket: waehrend babysit-prs.sh im Fix-Worktree
# `task freshness:regenerate` ausfuehrt, schreibt der Stub — statt echte Freshness-Arbeit zu
# leisten — bei Bedarf einen branch-scoped Agent-Lock fuer den PR-Branch, so als haette eine
# andere Session ihn waehrend des Fix-Versuchs geclaimt. So laesst sich der Guard unmittelbar
# vor dem Removal (Zeile 222) isoliert triggern, ohne den fruehen `is_branch_locked`-Check bei
# der Kandidatenauswahl (Zeile 109) zu umgehen — der Lock existiert zu diesem Zeitpunkt noch
# nicht.
#
# Positiv-Anker zuerst (T002356-M1): "T003137: babysit-prs.sh entfernt den Fix-Worktree
# weiterhin, wenn der Branch KEINEN Agent-Lock traegt" laeuft vor dem Negativtest und beweist,
# dass der Removal-Pfad ueberhaupt erreicht wird.
#
# RED-Erwartung: `babysit-prs.sh` prueft vor dem Removal (Zeile 222) keinen
# `check-branch-live`-Guard — der Negativtest schlaegt fehl (der Worktree wird trotz live
# Agent-Lock entfernt), bis der Fix-Plan implementiert ist.

load '_sf_common'

setup()    { _sf_setup; _t003137_setup; }
teardown() { _sf_teardown; }

_t003137_setup() {
  ORIGIN="${BATS_TEST_TMPDIR}/t003137-origin.git"
  MAIN="${BATS_TEST_TMPDIR}/t003137-main"

  git init -q --bare -b main "$ORIGIN"
  git clone -q "$ORIGIN" "$MAIN"
  ( cd "$MAIN" \
    && git config user.email "test@example.invalid" \
    && git config user.name "Test" \
    && git config commit.gpgsign false \
    && echo "base" > README.md \
    && git add README.md \
    && git commit -qm "base" \
    && git push -q origin main )

  BIN_DIR="${BATS_TEST_TMPDIR}/t003137-bin"
  rm -rf "$BIN_DIR"; mkdir -p "$BIN_DIR"
  export PATH="$BIN_DIR:$PATH"

  GUARDS_REPO_DIR="${BATS_TEST_TMPDIR}/t003137-guards-repo"
  rm -rf "$GUARDS_REPO_DIR"; mkdir -p "$GUARDS_REPO_DIR/scripts"
  cat > "$GUARDS_REPO_DIR/scripts/ticket.sh" <<'TSTUB'
#!/usr/bin/env bash
echo "off"
exit 0
TSTUB
  chmod +x "$GUARDS_REPO_DIR/scripts/ticket.sh"
  export GUARDS_REPO="$GUARDS_REPO_DIR"

  export AGENT_LOCK_DIR="${BATS_TEST_TMPDIR}/t003137-agent-locks"
  rm -rf "$AGENT_LOCK_DIR"; mkdir -p "$AGENT_LOCK_DIR"

  export TMPDIR="$BATS_TEST_TMPDIR"
  export CLAUDE_BIN="/bin/false"   # freshness-Klasse ruft keinen Agenten auf; Sicherheitsnetz
}

# _mk_pr_branch <branch> — legt den PR-Branch in $MAIN an, pusht ihn und kehrt zu main zurueck.
_mk_pr_branch() {
  local br="$1"
  ( cd "$MAIN" \
    && git checkout -qb "$br" \
    && echo "change on $br" >> README.md \
    && git commit -qam "branch commit" \
    && git push -q origin "$br" \
    && git checkout -q main \
    && git branch -qD "$br" 2>/dev/null || true )
}

# _stub_gh <pr-json> — gh-Stub liefert genau einen roten, nicht-draft PR ohne vorherige Attempts.
_stub_gh() {
  cat > "$BIN_DIR/gh" <<GHSTUB
#!/usr/bin/env bash
case "\$*" in
  "pr list"*) echo '$1' ;;
  *"pr view"*"--json comments"*) echo '{"comments":[]}' ;;
  *"run view"*) printf '%s\n' "generated artifact(s) are stale" "run 'task freshness:regenerate'" ;;
  *) exit 0 ;;
esac
GHSTUB
  chmod +x "$BIN_DIR/gh"
}

# _stub_task [--write-lock <branch>] — der Fix-Pfad fuer class=freshness ruft
# `task freshness:regenerate` im frisch angelegten Fix-Worktree auf. Der Stub schreibt seinen
# eigenen Aufrufort (== der Fix-Worktree-Pfad) in wt_path.txt und optional — VOR dem Fehlschlag —
# einen branch-scoped Agent-Lock, um den Race aus dem Ticket zu simulieren.
_stub_task() {
  local write_lock_branch="${1:-}"
  cat > "$BIN_DIR/task" <<TASKSTUB
#!/usr/bin/env bash
pwd > "$BIN_DIR/wt_path.txt"
TASKSTUB
  if [[ -n "$write_lock_branch" ]]; then
    local safe ts
    safe="$(printf '%s' "$write_lock_branch" | tr '/ ' '--')"
    ts=$(date +%s)
    cat >> "$BIN_DIR/task" <<TASKSTUB
mkdir -p "$AGENT_LOCK_DIR"
cat > "$AGENT_LOCK_DIR/branch__${safe}.json" <<LOCKEOF
{
  "scope": "branch",
  "id": "$write_lock_branch",
  "owner_sid": "foreign-session-uuid",
  "owner_pid": "\$\$",
  "tool": "claude",
  "label": "other-session",
  "worktree": "\$(pwd)",
  "branch": "$write_lock_branch",
  "ticket": "",
  "host": "testhost",
  "created_at": "$ts",
  "heartbeat_at": "$ts"
}
LOCKEOF
TASKSTUB
  fi
  echo 'exit 1' >> "$BIN_DIR/task"
  chmod +x "$BIN_DIR/task"
}

@test "T003137: babysit-prs.sh entfernt den Fix-Worktree weiterhin, wenn der Branch KEINEN Agent-Lock traegt (Positiv-Anker)" {
  local br="fix/t003137-nolock"
  _mk_pr_branch "$br"
  _stub_gh "[{\"number\":91,\"isDraft\":false,\"mergeStateStatus\":\"BLOCKED\",\"headRefName\":\"$br\",\"author\":{\"login\":\"paddione\"},\"labels\":[],\"statusCheckRollup\":[{\"conclusion\":\"FAILURE\"}]}]"
  _stub_task   # kein Lock-Write

  cd "$MAIN"
  run bash "$BABYSIT"
  [ "$status" -eq 0 ]

  [ -f "$BIN_DIR/wt_path.txt" ]
  local wt
  wt="$(cat "$BIN_DIR/wt_path.txt")"
  [ -n "$wt" ]
  [ ! -d "$wt" ]
}

@test "T003137: babysit-prs.sh entfernt den Fix-Worktree NICHT, wenn der Branch waehrend des Fix-Versuchs einen live Agent-Lock erhaelt" {
  local br="fix/t003137-livelock"
  _mk_pr_branch "$br"
  _stub_gh "[{\"number\":92,\"isDraft\":false,\"mergeStateStatus\":\"BLOCKED\",\"headRefName\":\"$br\",\"author\":{\"login\":\"paddione\"},\"labels\":[],\"statusCheckRollup\":[{\"conclusion\":\"FAILURE\"}]}]"
  _stub_task "$br"   # schreibt den Lock kurz vor dem Removal

  cd "$MAIN"
  run bash "$BABYSIT"
  [ "$status" -eq 0 ]

  [ -f "$BIN_DIR/wt_path.txt" ]
  local wt
  wt="$(cat "$BIN_DIR/wt_path.txt")"
  [ -n "$wt" ]
  [ -d "$wt" ]
  [[ "$output" == *"live"*"Agent-Lock"* || "$output" == *"live Agent-Lock"* ]]
}
