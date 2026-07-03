#!/usr/bin/env bats
# tests/spec/commit-signing.bats
# SSOT: openspec/changes/sec05-bot-commit-signing/proposal.md
# G-SEC05: adjusted metric — Bot-Commits (github-actions[bot]) von unsigned-Zaehlung ausschliessen

load 'test_helper'

# Match both noreply email variants used by github-actions[bot] across workflows:
# the canonical "<id>+github-actions[bot]@..." form and the bare form some
# workflows configure via `git config user.email`. grep -F substring-matches,
# so the bare suffix below matches both.
BOT_EMAIL="github-actions[bot]@users.noreply.github.com"

@test "G-SEC05: adjusted unsigned-Anteil auf main (ohne Bot) ist <= 5%" {
  unsigned=$(git -C "$PROJECT_DIR" log -50 --pretty="%G? %ae" origin/main 2>/dev/null \
    | grep -vF "$BOT_EMAIL" \
    | awk '{print $1}' \
    | grep -c N || true)
  total=$(git -C "$PROJECT_DIR" log -50 --pretty="%G? %ae" origin/main 2>/dev/null \
    | grep -vF "$BOT_EMAIL" \
    | wc -l | tr -d ' ')
  if [ "$total" -eq 0 ]; then
    skip "keine non-bot Commits in den letzten 50 gefunden"
  fi
  threshold=$(( total * 5 / 100 ))
  [ "$unsigned" -le "$threshold" ]
}

@test "G-SEC05: health-goals-check.sh verwendet adjusted metric (kein raw grep -c N)" {
  run grep "G-SEC05" "$PROJECT_DIR/scripts/health-goals-check.sh"
  [ "$status" -eq 0 ]
  [[ "$output" == *"github-actions"* ]] || [[ "$output" == *"%ae"* ]]
}
