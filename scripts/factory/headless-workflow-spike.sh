#!/usr/bin/env bash
# scripts/factory/headless-workflow-spike.sh — Phase 0 Go/No-Go spike. [T000413]
# Proves: (a) the Workflow tool is exposed to a headless `claude -p` session,
# and (b) workflow({scriptPath:'scripts/factory/pipeline.spike.js'}) nests
# WITHOUT triggering an interactive permission prompt. 0 agents, dry_run only.
#
# No-Go fallback: local `/loop` (weaker persistence) — the rest of the spec
# stays valid; only the dispatcher's trigger mechanism changes.
set -euo pipefail

# ⛔ SAFETY GUARD — this is a throwaway Phase 0 spike, NOT production code.
# It uses bypassPermissions + broad Bash allowlisting solely to prove the
# headless Workflow-nesting hypothesis.  It MUST NOT be scheduled or run
# unattended.  The production dispatcher uses wakeup.sh (acceptEdits +
# tight allowlist).
if [[ -z "${FACTORY_SPIKE_I_KNOW_THIS_IS_NOT_PRODUCTION:-}" ]]; then
  echo "headless-workflow-spike.sh: ABORTING — this is a throwaway spike." >&2
  echo "  Re-run with FACTORY_SPIKE_I_KNOW_THIS_IS_NOT_PRODUCTION=true if you" >&2
  echo "  really mean it, then clean up after yourself." >&2
  exit 1
fi

REPO="${REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "$REPO"

PROMPT='Call the Workflow tool exactly once with scriptPath "scripts/factory/pipeline.spike.js" and args {"dry_run": true}. Do not ask for confirmation. Report the JSON the workflow returned, then stop.'

echo "== headless workflow spike: invoking claude -p (allowlisted Workflow) ==" >&2
claude -p "$PROMPT" \
  --allowedTools 'Workflow Bash(node:*) Read' \
  --permission-mode bypassPermissions
