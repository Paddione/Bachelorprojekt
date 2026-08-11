#!/usr/bin/env bash
# scripts/repo-hygiene-cron.sh — Daily hygiene sweep (repo-hygiene-ops §7.3) [T003486]
#
# Usage:
#   bash scripts/repo-hygiene-cron.sh [standard|deep]
#
#   standard (default): §0–§3 metric collection — worktrees, [gone] branches, open PRs.
#     Outputs JSON metrics to stdout. If stale artifact count > STALE_THRESHOLD,
#     posts a warning comment to HYGIENE_TRACKING_TICKET.
#
#   deep: like standard, then also runs branch-reaper --dry-run and includes the
#     reaper output in the JSON.
#
# Cron entry (as user patrick):
#   0 8 * * * bash /home/patrick/Bachelorprojekt/scripts/repo-hygiene-cron.sh standard >> /tmp/repo-hygiene-cron.log 2>&1
#
# Environment:
#   HYGIENE_TRACKING_TICKET  Ticket-ID for warning comments (default: T003486)
#   STALE_THRESHOLD          Warn if stale_total > this (default: 10)
#   REPO_DIR                 Override repo root (default: two levels above this script)
#
# Dependencies: git, gh, jq, scripts/ticket.sh, scripts/agent-lock.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="${REPO_DIR:-$(cd "$HERE/.." && pwd)}"

MODE="${1:-standard}"
HYGIENE_TRACKING_TICKET="${HYGIENE_TRACKING_TICKET:-T003486}"
STALE_THRESHOLD="${STALE_THRESHOLD:-10}"

log() { echo "[repo-hygiene-cron] $(date -u +%Y-%m-%dT%H:%M:%SZ) $*" >&2; }

# ── Step 1: Fetch & prune remote ────────────────────────────────────────
log "fetch origin main --prune"
git -C "$REPO_DIR" fetch origin main --prune 2>/dev/null || true

# ── Step 2: Reap stale agent locks ──────────────────────────────────────
log "agent-lock reap"
# stdout auf stderr umleiten: agent-lock.sh reap meldet u.a. die
# openspec-half-archive-Check-Zeile auf stdout — die wuerde die JSON-Metrik-
# Ausgabe (stdout ist Vertrag) verunreinigen. Log-Zeilen gehoeren auf stderr.
bash "$HERE/agent-lock.sh" reap >&2 2>/dev/null || true

# ── Step 2.5: Factory-Tick-Vorcheck [T003227] ───────────────────────────
# Läuft gerade ein Factory-Tick, kann er Worktrees/Branches unter dem Lauf verändern
# (beobachtet: 5 von 7 Worktrees mutierten während der Messung). Die Worktree-Messung
# auf veraltetem Stand ist wertlos — die Sektion wird dann übersprungen und als
# "skipped" ausgewiesen, statt falsche Zahlen zu liefern. Dasselbe Lock-Test-Muster
# wie scripts/factory/mcp-server.mjs factory_status.
tick_running() {
  test -f /tmp/factory-tick.lock || return 1
  (flock -n 9 2>/dev/null && return 1 || return 0) 9>/tmp/factory-tick.lock
}
TICK_RUNNING=0
if tick_running; then
  log "factory-tick läuft — Worktree-Sektion wird übersprungen"
  TICK_RUNNING=1
fi

# ── Step 3: Collect metrics ─────────────────────────────────────────────
log "collecting metrics"

# 3a: Worktree inventory
mapfile -t wt_paths < <(git -C "$REPO_DIR" worktree list --porcelain 2>/dev/null | grep '^worktree ' | sed 's/^worktree //' || true)

wt_count=0
wt_gone=0           # worktrees on a branch whose upstream is [gone]
wt_no_upstream=0    # worktrees whose branch has no upstream configured
wt_skipped=0        # worktrees not measured because a factory tick is running

for wt in "${wt_paths[@]}"; do
  [ -z "$wt" ] && continue
  # skip main checkout and tmp/scrap paths
  [ "$wt" = "$REPO_DIR" ] && continue
  [[ "$wt" == /tmp/* ]] && continue

  wt_count=$((wt_count + 1))

  if [ "$TICK_RUNNING" -eq 1 ]; then
    wt_skipped=$((wt_skipped + 1))
    continue
  fi

  branch="$(git -C "$wt" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")"
  [ -z "$branch" ] && { wt_no_upstream=$((wt_no_upstream + 1)); continue; }
  [ "$branch" = "HEAD" ] && { wt_no_upstream=$((wt_no_upstream + 1)); continue; }

  # Check upstream tracking status from within the worktree
  track="$(git -C "$wt" for-each-ref --format='%(upstream:track)' "refs/heads/$branch" 2>/dev/null || echo "")"
  if [ "$track" = "[gone]" ]; then
    wt_gone=$((wt_gone + 1))
  elif [ -z "$track" ]; then
    # no upstream configured — could be WIP or never pushed
    wt_no_upstream=$((wt_no_upstream + 1))
  fi
  # else: tracking is OK (e.g., "[behind 3]" or empty when up-to-date)
done

# 3b: [gone] local branches
gone_count=$(git -C "$REPO_DIR" for-each-ref --format='%(refname:short) %(upstream:track)' refs/heads 2>/dev/null \
  | awk '$2 == "[gone]"' | wc -l)
gone_count="${gone_count// /}"

# 3c: Remote branches (non-main)
# grep -v liefert Exit 1, wenn KEINE Zeile durchfaellt (nur main existiert) —
# unter set -o pipefail wuerde das die ganze Pipeline auf 1 setzen und der
# Assignment-Exit (set -e) den Cron abbrechen. || true schuetzt dagegen.
remote_branch_count=$(git -C "$REPO_DIR" ls-remote --heads origin 2>/dev/null \
  | grep -v 'refs/heads/main$' | wc -l || true)
remote_branch_count="${remote_branch_count// /}"

# 3d: Open PRs (use standard gh CLI — gh-axi doesn't support --json)
pr_output="$(gh pr list --state open --limit 200 --json number 2>&1 || echo '[]')"
pr_count=$(printf '%s' "$pr_output" | jq 'length' 2>/dev/null || echo 0)

# ── Step 4: Stale total ────────────────────────────────────────────────
# Stale = definitely stale: [gone] local branches + worktrees on [gone] branches.
# wt_no_upstream is ambiguous (WIP never pushed vs once-pushed-then-pruned);
# it's reported separately but NOT counted in the warning threshold.
stale_total=$((gone_count + wt_gone))

# ── Step 5: Optional deep mode: branch-reaper dry-run ────────────────────
reaper_candidates=0
reaper_output=""
if [ "$MODE" = "deep" ]; then
  log "branch-reaper --dry-run"
  reaper_output="$(bash "$HERE/branch-reaper.sh" --dry-run 2>&1 || true)"
  reaper_candidates=$(printf '%s' "$reaper_output" | grep -c '^REAP ' || echo 0)
  reaper_candidates="${reaper_candidates// /}"
fi

# ── Step 6: JSON output ──────────────────────────────────────────────────
now_iso="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

JSON="$(jq -n \
  --arg timestamp "$now_iso" \
  --arg mode "$MODE" \
  --argjson worktrees_total "$wt_count" \
  --argjson worktrees_gone "$wt_gone" \
  --argjson worktrees_no_upstream "$wt_no_upstream" \
  --argjson worktrees_skipped "$wt_skipped" \
  --argjson branches_gone "$gone_count" \
  --argjson remote_branches "$remote_branch_count" \
  --argjson open_prs "$pr_count" \
  --argjson stale_total "$stale_total" \
  --argjson reaper_candidates "$reaper_candidates" \
  '{
    timestamp: $timestamp,
    mode: $mode,
    metrics: {
      worktrees: { total: $worktrees_total, gone: $worktrees_gone, no_upstream: $worktrees_no_upstream, skipped: $worktrees_skipped },
      branches: { gone: $branches_gone, remote_non_main: $remote_branches },
      prs: { open: $open_prs },
      reaper: { candidates: $reaper_candidates }
    },
    stale_total: $stale_total,
    warning: ($stale_total > 10)
  }')"

echo "$JSON"

# ── Step 7: Warning comment if over threshold ────────────────────────────
if [ "$stale_total" -gt "$STALE_THRESHOLD" ]; then
  log "WARNING: $stale_total stale artifacts (threshold: $STALE_THRESHOLD)"

  body="## Daily Hygiene Sweep — $(date -u +%Y-%m-%d)

⚠️ **$stale_total stale artifacts detected** (threshold: $STALE_THRESHOLD)

| Metric | Count |
|--------|-------|
| Worktrees (total) | $wt_count |
| Worktrees on [gone] branches | $wt_gone |
| Worktrees without upstream | $wt_no_upstream |
| Worktrees skipped (factory tick) | $wt_skipped |
| [gone] local branches | $gone_count |
| Remote branches (non-main) | $remote_branch_count |
| Open PRs | $pr_count |

\`\`\`json
$JSON
\`\`\`
"

  bash "$HERE/ticket.sh" add-comment \
    --id "$HYGIENE_TRACKING_TICKET" \
    --body "$body" 2>/dev/null || log "ticket.sh add-comment failed (best-effort)"
else
  log "OK: $stale_total stale artifacts (threshold: $STALE_THRESHOLD)"
fi
