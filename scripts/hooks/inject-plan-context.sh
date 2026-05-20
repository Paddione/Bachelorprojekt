#!/usr/bin/env bash
# scripts/hooks/inject-plan-context.sh
ROLE=$1
context=$(bash scripts/plan-context.sh "$ROLE")
if [[ -n "$context" ]]; then
  echo -e "<active-plans>\n${context}\n</active-plans>"
fi
