#!/usr/bin/env bash
# devflow-lifecycle-gate.sh — fail-closed Lifecycle-Gate für gestagte Pläne.
#
# Usage: devflow-lifecycle-gate.sh <slug>
#
# Prüft 11 Stufen in Reihenfolge und stoppt bei der ersten Lücke:
#   1 staged    tasks.md auf origin/<branch> gepusht (feature/<slug>|fix/<slug>)
#   2 worktree  Branch in einem Worktree ausgecheckt
#   3 branch    Branch lokal + auf origin vorhanden
#   4 sandbox   genau ein Running sandbox-cpu-Pod mit Claim auf <slug>
#   5 partials  alle Partials done, keine Reihenfolge-Verletzung (depends_on)
#   6 verify    devflow-phase.sh check (bzw. plan/implement/verify done auf main)
#   7 pr        PR zum Branch existiert (OPEN oder MERGED)
#   8 merged    PR ist MERGED
#   9 cleanup   Worktree + Branches (lokal/origin) + Branch-Lock weg
#  10 deploy    `deploy done` in phase-events.log (main)
#  11 e2e       e2e-report.md mit `E2E: PASS` committed (main)
#
# Ausgabe: je Stufe `STAGE i/11 <name>: PASS|FAIL — Detail`, am Ende
# `LIFECYCLE <slug>: COMPLETE` oder `LIFECYCLE <slug>: <stufe>`.
# Exit 0 = COMPLETE; 1 = erste Lücke (Name im stdout-Schluss); 2 = Umgebung
# (git/gh/kubectl/python3 fehlt oder Repo nicht erkennbar).
set -euo pipefail

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SLUG="${1:-}"
[[ "$SLUG" =~ ^[a-z0-9][a-z0-9-]*$ ]] || { echo "Usage: $0 <slug>" >&2; exit 1; }

need() { command -v "$1" >/dev/null 2>&1 || { echo "LIFECYCLE $SLUG: ENV ($1 fehlt)" >&2; exit 2; }; }
need git; need python3

COMMON="$(git rev-parse --git-common-dir 2>/dev/null || true)"
[[ -n "$COMMON" ]] || { echo "LIFECYCLE $SLUG: ENV (kein Git-Repo)" >&2; exit 2; }
# shellcheck disable=SC2164
MAIN_ROOT="$(cd "$COMMON/.." && pwd)"

BRANCH=""
for cand in "feature/$SLUG" "fix/$SLUG"; do
  if git rev-parse --verify --quiet "refs/heads/$cand" >/dev/null \
    || git cat-file -e "refs/remotes/origin/$cand" 2>/dev/null \
    || git worktree list --porcelain 2>/dev/null | grep -q "branch refs/heads/$cand\$"; then
    BRANCH="$cand"
    break
  fi
done

CANDIDATES="feature/$SLUG fix/$SLUG"
lockfile_for() { printf '%s/agent-locks/branch__%s.json' "$COMMON" "$(printf '%s' "$1" | tr '/ ' '--')"; }

# cleanup_done: kein Worktree, keine lokalen/origin Branches, keine Locks (beide Kandidaten).
cleanup_done() {
  local cand
  for cand in $CANDIDATES; do
    if git worktree list --porcelain 2>/dev/null | grep -q "branch refs/heads/$cand\$"; then return 1; fi
    if git rev-parse --verify --quiet "refs/heads/$cand" >/dev/null; then return 1; fi
    if [[ -n "$(git ls-remote --heads origin "$cand" 2>/dev/null || true)" ]]; then return 1; fi
    if [[ -f "$(lockfile_for "$cand")" ]]; then return 1; fi
  done
  return 0
}

# PR-Vorabfrage (funktioniert auch nach Branch-Loeschung, solange der PR existiert).
PR_BRANCH=""
PR_STATE=""
if command -v gh >/dev/null 2>&1; then
  for cand in $CANDIDATES; do
    PR_STATE="$(gh pr view "$cand" --json state --jq .state 2>/dev/null || true)"
    if [[ -n "$PR_STATE" ]]; then PR_BRANCH="$cand"; break; fi
  done
fi

STAGE=0
pass() { STAGE=$((STAGE + 1)); echo "STAGE $STAGE/11 $1: PASS — $2"; }
fail() { STAGE=$((STAGE + 1)); echo "STAGE $STAGE/11 $1: FAIL — $2"; echo "LIFECYCLE $SLUG: $1"; exit 1; }
# Kein frueher Abbruch bei leerem BRANCH: pass_staged prueft den Archiv-Fall
# (status: completed auf main) und faellt erst dann mit FAIL aus.

pass_staged() {
  if [[ -n "$BRANCH" ]] && git cat-file -e "origin/$BRANCH:.agents/plans/$SLUG/tasks.md" 2>/dev/null; then
    pass staged "tasks.md auf origin/$BRANCH"
    return
  fi
  local main_tasks="$MAIN_ROOT/.agents/plans/$SLUG/tasks.md"
  if [[ -f "$main_tasks" ]] && grep -q "^status: completed" "$main_tasks"; then
    pass staged "archiviert (status: completed auf main)"
    return
  fi
  fail staged "weder origin-Branch noch Archiv-Eintrag"
}

WT_PATH=""
find_worktree() {
  local path="" branch=""
  while IFS= read -r line; do
    case "$line" in
      worktree\ *) path="${line#worktree }" ;;
      branch\ *) branch="${line#branch refs/heads/}" ;;
      "") branch=""; path="" ;;
    esac
    if [[ -n "$path" && -n "$branch" ]]; then
      # Nur echte Plan-Worktrees — der Main-Checkout zaehlt nie, auch wenn er
      # zufaellig auf dem Feature-Branch steht.
      if [[ "$branch" == "$BRANCH" && "$path" != "$MAIN_ROOT" ]]; then WT_PATH="$path"; return 0; fi
      path=""; branch=""
    fi
  done < <(git worktree list --porcelain 2>/dev/null; echo)
  return 1
}

pass_worktree() {
  if find_worktree; then
    pass worktree "$WT_PATH"
    return
  fi
  if cleanup_done; then
    pass worktree "entfernt (cleanup bestaetigt)"
    return
  fi
  fail worktree "kein Worktree mit ${BRANCH:-feature|fix/$SLUG}"
}

pass_branch() {
  if [[ -z "$BRANCH" ]]; then
    if cleanup_done; then pass branch "geloescht (cleanup bestaetigt)"; else fail branch "kein Branch auffindbar"; fi
    return
  fi
  local local_ok=0 origin_ok=0
  git rev-parse --verify --quiet "refs/heads/$BRANCH" >/dev/null && local_ok=1
  git cat-file -e "refs/remotes/origin/$BRANCH" 2>/dev/null && origin_ok=1
  if [[ $local_ok -eq 1 && $origin_ok -eq 1 ]]; then
    pass branch "lokal + origin/$BRANCH"
  elif cleanup_done; then
    pass branch "geloescht (cleanup bestaetigt)"
  else
    fail branch "lokal=$local_ok origin=$origin_ok"
  fi
}

pass_sandbox() {
  local holder
  holder="$(bash "$SELF_DIR/devflow-sandbox.sh" status 2>/dev/null \
    | awk -v slug="$SLUG" '$2 == "Running" && $3 == slug {print $1}' || true)"
  local n
  n="$(printf '%s' "$holder" | grep -c . || true)"
  if [[ "$n" -eq 1 ]]; then
    pass sandbox "$holder"
    return
  fi
  if [[ "$n" -gt 1 ]]; then
    fail sandbox "mehrfach geclaimt: $holder"
  fi
  if cleanup_done; then
    # Claim wurde beim Cleanup freigegeben — pruefe, dass kein stale Claim uebrig ist.
    local stale
    stale="$(bash "$SELF_DIR/devflow-sandbox.sh" status 2>/dev/null | awk -v slug="$SLUG" '$3 == slug {print $1}' || true)"
    if [[ -z "$stale" ]]; then
      pass sandbox "freigegeben (cleanup bestaetigt)"
    else
      fail sandbox "stale Claim: $stale (devflow-sandbox.sh release $SLUG)"
    fi
    return
  fi
  fail sandbox "kein Sandbox-Slot auf $SLUG geclaimt (devflow-sandbox.sh claim $SLUG)"
}

pass_partials() {
  local plan_dir="$1" out rc=0
  if [[ ! -f "$plan_dir/tasks.md" ]]; then fail partials "tasks.md fehlt in $plan_dir"; fi
  if [[ ! -f "$plan_dir/.plan-runner/state.json" ]]; then
    if cleanup_done && [[ "$plan_dir" == "$MAIN_ROOT"* ]]; then
      local open n
      open="$(grep -c -- "- \[ \]" "$plan_dir/tasks.md" || true)"
      n="$(grep -c -- "- \[x\]" "$plan_dir/tasks.md" || true)"
      if [[ "$open" -eq 0 && "$n" -gt 0 ]]; then
        pass partials "alle $n Tasks abgehakt (Archiv)"
        return
      fi
      fail partials "$open offene Tasks im Archiv"
      return
    fi
    fail partials "state.json fehlt — plan-runner noch nicht gestartet"
  fi
  out="$(python3 - "$plan_dir/tasks.md" "$plan_dir/.plan-runner/state.json" <<'EOF' || echo "PYERR"
import json, re, sys
tasks = open(sys.argv[1]).read()
state = json.load(open(sys.argv[2]))
rows = re.findall(r'^\|\s*(p\d+)\s*\|[^|]*\|[^|]*\|[^|]*\|\s*([^|]*?)\s*\|', tasks, re.M)
if not rows:
    print('FAIL notabelle'); sys.exit(0)
deps = {pid: ([d.strip() for d in cell.split(',') if d.strip()] if cell.strip() != '-' else [])
        for pid, cell in rows}
status = {pid: state.get(pid, {}).get('status', 'pending') for pid in deps}
viol = [pid for pid, ds in deps.items()
        if status[pid] == 'done' for d in ds if status.get(d) != 'done']
if viol:
    print('FAIL reihenfolge ' + ','.join(sorted(set(viol)))); sys.exit(0)
pending = sorted([pid for pid in deps if status[pid] != 'done'])
if pending:
    print('FAIL offen ' + ','.join(pending)); sys.exit(0)
nores = sorted([pid for pid in deps if not state.get(pid, {}).get('result')])
if nores:
    print('FAIL noresultat ' + ','.join(nores)); sys.exit(0)
print('OK alle-done')
EOF
)"
  if [[ "$out" == "OK alle-done" ]]; then
    pass partials "alle done, depends_on geschlossen"
  elif [[ "$out" == PYERR* ]]; then
    fail partials "Parse-Fehler ($out)"
  else
    fail partials "$out"
  fi
}

pass_verify() {
  local plan_dir="$1" rc=0
  if [[ -n "${WT_PATH:-}" ]]; then
    local wt_root
    wt_root="$(cd "$plan_dir/../.." && pwd)"
    (cd "$wt_root" && bash "$SELF_DIR/devflow-phase.sh" check --slug "$SLUG") >/dev/null 2>&1 || rc=$?
  else
    for marker in "plan done" "implement entered" "verify done"; do
      grep -q "^$marker" "$plan_dir/phase-events.log" 2>/dev/null || rc=1
    done
  fi
  if [[ $rc -eq 0 ]]; then
    pass verify "plan/implement/verify geschlossen"
  else
    fail verify "phase-events unvollständig"
  fi
}

pass_pr() {
  command -v gh >/dev/null 2>&1 || { echo "LIFECYCLE $SLUG: ENV (gh fehlt)" >&2; exit 2; }
  if [[ -z "$PR_BRANCH" ]]; then
    fail pr "kein PR zu ${BRANCH:-feature|fix/$SLUG}"
  fi
  pass pr "PR $PR_STATE ($PR_BRANCH)"
}

pass_merged() {
  local state="$1"
  if [[ "$state" == "MERGED" ]]; then
    pass merged "PR gemergt"
  else
    fail merged "PR-Status $state (wartet auf Merge)"
  fi
}

pass_cleanup() {
  local problems=()
  if git worktree list --porcelain 2>/dev/null | grep -q "branch refs/heads/$BRANCH\$"; then
    problems+=("worktree")
  fi
  if git rev-parse --verify --quiet "refs/heads/$BRANCH" >/dev/null; then
    problems+=("lokaler-branch")
  fi
  if [[ -n "$(git ls-remote --heads origin "$BRANCH" 2>/dev/null || true)" ]]; then
    problems+=("origin-branch")
  fi
  local lockfile="$COMMON/agent-locks/branch__$(printf '%s' "$BRANCH" | tr '/ ' '--').json"
  if [[ -f "$lockfile" ]]; then problems+=("lock"); fi
  if [[ ${#problems[@]} -eq 0 ]]; then
    pass cleanup "Worktree/Branches/Lock weg"
  else
    fail cleanup "offen: ${problems[*]}"
  fi
}

PI_EVENTS=""
pass_deploy() {
  if grep -q "^deploy done" "$PI_EVENTS" 2>/dev/null; then
    pass deploy "deploy done protokolliert"
  else
    fail deploy "kein 'deploy done' in phase-events.log"
  fi
}

pass_e2e() {
  local plan_dir="$1"
  if [[ -f "$plan_dir/e2e-report.md" ]] && grep -q "E2E: PASS" "$plan_dir/e2e-report.md"; then
    pass e2e "e2e-report.md mit PASS"
  else
    fail e2e "e2e-report.md mit 'E2E: PASS' fehlt in $plan_dir"
  fi
}

# --- Ablauf: Plan-Verzeichnis je nach Cleanup-Stand ---
PLAN_DIR=""
if find_worktree >/dev/null 2>&1 && [[ -n "$WT_PATH" ]]; then
  PLAN_DIR="$WT_PATH/.agents/plans/$SLUG"
else
  PLAN_DIR="$MAIN_ROOT/.agents/plans/$SLUG"
fi

pass_staged
pass_worktree
pass_branch
pass_sandbox
pass_partials "$PLAN_DIR"
pass_verify "$PLAN_DIR"
pass_pr
pass_merged "$PR_STATE"
pass_cleanup
PI_EVENTS="$MAIN_ROOT/.agents/plans/$SLUG/phase-events.log"
pass_deploy "$PI_EVENTS"
pass_e2e "$MAIN_ROOT/.agents/plans/$SLUG"
echo "LIFECYCLE $SLUG: COMPLETE"
