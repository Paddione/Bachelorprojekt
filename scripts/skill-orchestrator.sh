#!/usr/bin/env bash
# scripts/skill-orchestrator.sh
SKILL_FILE=$1
ACTION=$2 # pre | post

# Extract hooks from frontmatter
HOOKS=$(awk -v action="$ACTION" '
  /^hooks:/ { in_hooks=1; next }
  /^---/ && in_hooks { in_hooks=0; next }
  in_hooks && $0 ~ "^  " action ":" { in_action=1; next }
  in_hooks && in_action && $0 ~ "^  [a-z]+:" { in_action=0 }
  in_hooks && in_action && $0 ~ "^    -" { sub(/^    - /, ""); print }
' "$SKILL_FILE")

for hook in $HOOKS; do
  if [[ -f "scripts/hooks/$hook.sh" ]]; then
    bash "scripts/hooks/$hook.sh"
  fi
done
