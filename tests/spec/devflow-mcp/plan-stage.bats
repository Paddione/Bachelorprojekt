#!/usr/bin/env bats
# tests/spec/devflow-mcp/plan-stage.bats — plan_stage und plan_lint [T900985]
#
# Pruefmodus: command output verification (T002448-M4). Die Repo-Skripte (worktree-create,
# agent-lock, plan-lint, plan-preflight, ticket) sind im Fixture-Repo durch Stubs ersetzt, die
# ihre Aufrufe protokollieren; Git (Worktree, Commit, Push auf einen Bare-Remote) laeuft echt.
# Geprueft werden Ergebnis-JSON, Aufrufreihenfolge und der Remote-Stand.

setup() {
  load helpers
  devflow_setup
  ORIGIN="$T/origin.git"
  git init -q --bare "$ORIGIN"
  git -C "$FREPO" remote add origin "$ORIGIN"
  git -C "$FREPO" push -q origin HEAD:main
  git -C "$FREPO" fetch -q origin
  mkdir -p "$FREPO/scripts"
  CALLS="$T/calls.log"
  export CALLS
  stub() { printf '#!/usr/bin/env bash\necho "%s $*" >> "$CALLS"\n%s\n' "$1" "$2" > "$FREPO/scripts/$1"; chmod +x "$FREPO/scripts/$1"; }
  # worktree-create: Flags ignorieren, echten Worktree von origin/main anlegen.
  stub worktree-create.sh 'args=(); for a in "$@"; do case "$a" in --*) ;; *) args+=("$a");; esac; done; git -C "$(dirname "$0")/.." worktree add -q -b "${args[0]}" "${args[1]}" "${args[2]:-origin/main}"'
  stub agent-lock.sh 'exit 0'
  stub plan-preflight.sh 'exit 0'
  stub ticket.sh 'echo "Ticket staged"'
  # plan-lint: FAIL, sobald der Plan BROKEN enthaelt.
  stub plan-lint.sh 'f="${@: -1}"; if grep -q BROKEN "$f"; then echo "{\"verdict\":\"FAIL\",\"hard\":[\"STRUCT1: missing header\"],\"warn\":[]}"; exit 1; fi; echo "{\"verdict\":\"PASS\",\"hard\":[],\"warn\":[]}"'
}

stage() {
  devflow_call plan_stage "{\"ticket\":\"T999001\",\"slug\":\"demo\",\"branch_type\":\"feature\",\"plan_markdown\":\"$1\",\"design_markdown\":\"# design\"}"
}

@test "plan-stage: legt Worktree an, committet den Plan, pusht und stagt" {
  stage '# demo — Implementation Plan'
  [ "$status" -eq 0 ]
  run json '[d.ok, d.branch, d.lint.verdict, d.steps.map(s => s.name + ":" + s.status).join(",")].join(" ")'
  [[ "$output" == "true feature/demo-T999001 PASS "* ]]
  [[ "$output" != *":failed"* ]]
  run git -C "$FREPO" ls-remote origin "refs/heads/feature/demo-T999001"
  [ -n "$output" ]
  run git --git-dir="$ORIGIN" show "feature/demo-T999001:.agents/plans/demo/tasks.md"
  [[ "$output" == *"demo — Implementation Plan"* ]]
  run git --git-dir="$ORIGIN" show "feature/demo-T999001:.agents/plans/demo/design.md"
  [[ "$output" == *"# design"* ]]
}

@test "plan-stage: Aufrufreihenfolge endet mit stage-plan --hold" {
  stage '# demo — Implementation Plan'
  [ "$status" -eq 0 ]
  run cut -d' ' -f1 "$CALLS"
  [ "$(echo "$output" | tr '\n' ' ')" = "worktree-create.sh agent-lock.sh plan-lint.sh plan-preflight.sh ticket.sh " ]
  run grep '^ticket.sh' "$CALLS"
  [[ "$output" == *"stage-plan"*"--id T999001"*"--hold"* ]]
}

@test "plan-stage: roter Lint bricht vor Commit und Push ab, Worktree bleibt" {
  stage '# BROKEN plan'
  [ "$status" -eq 0 ]
  run json '[d.ok, d.lint.verdict, d.lint.hard[0]].join(" ")'
  [[ "$output" == "false FAIL STRUCT1"* ]]
  run git -C "$FREPO" ls-remote origin "refs/heads/feature/demo-T999001"
  [ -z "$output" ]
  run grep -c '^ticket.sh' "$CALLS"
  [ "$output" = "0" ]
  [ -f "$FREPO/.worktrees/demo-T999001/.agents/plans/demo/tasks.md" ]
}

@test "plan-lint: liefert das Urteil strukturiert" {
  printf '# BROKEN\n' > "$T/p.md"
  devflow_call plan_lint "{\"plan_path\":\"$T/p.md\"}"
  [ "$status" -eq 0 ]
  run json 'd.verdict + " " + d.hard.length'
  [ "$output" = "FAIL 1" ]
}
