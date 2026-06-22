#!/usr/bin/env bats

@test "all behavior fragment files exist" {
  for f in \
    ".claude/lib/behaviors/never-push-main.md" \
    ".claude/lib/behaviors/inject-plan-context.md" \
    ".claude/lib/behaviors/tool-use-safety.md" \
    ".claude/lib/behaviors/commit-conventions.md"; do
    [ -f "$f" ] || { echo "MISSING: $f"; return 1; }
  done
}

@test "all prompt snippet files exist" {
  for f in \
    ".claude/lib/prompts/review-lens-format.md" \
    ".claude/lib/prompts/diff-analysis-context.md" \
    ".claude/lib/prompts/review-coordinator.md"; do
    [ -f "$f" ] || { echo "MISSING: $f"; return 1; }
  done
}

@test "README.md index exists and lists all fragments" {
  [ -f ".claude/lib/README.md" ]
  for entry in \
    "behaviors/never-push-main.md" \
    "behaviors/inject-plan-context.md" \
    "behaviors/tool-use-safety.md" \
    "behaviors/commit-conventions.md" \
    "prompts/review-lens-format.md" \
    "prompts/diff-analysis-context.md" \
    "prompts/review-coordinator.md"; do
    grep -q "$entry" ".claude/lib/README.md" || { echo "README missing entry: $entry"; return 1; }
  done
}

@test "all agents have a Library section" {
  for agent in .agents/agents/bachelorprojekt-*.md; do
    grep -q "^## Library" "$agent" || { echo "MISSING Library section in: $agent"; return 1; }
  done
}

@test "all library paths referenced in agents actually exist" {
  for agent in .agents/agents/bachelorprojekt-*.md; do
    while IFS= read -r line; do
      if [[ "$line" =~ ^-\ \.claude/lib/ ]]; then
        path="${line#- }"
        [ -f "$path" ] || { echo "DEAD LINK in $agent: $path"; return 1; }
      fi
    done < "$agent"
  done
}
