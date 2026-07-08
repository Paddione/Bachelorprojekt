#!/usr/bin/env bash
# scripts/brain-bootstrap.sh — seeds (and optionally creates + pushes) the
# Karpathy-pattern LLM-wiki foundation for the private Paddione/brain repo.
#
# Local mode (default): idempotent copy of templates/brain/** into a target
# directory. No network, no gh/gh-axi calls.
#
#   scripts/brain-bootstrap.sh <target-dir>
#
# Remote mode: additionally creates the private GitHub repo, seeds a temp
# checkout, commits + pushes it, and adds a collaborator.
#
#   scripts/brain-bootstrap.sh --create-remote --collaborator <handle>
#
# See openspec/changes/brain-foundation/tasks.md (Task 5/6) and
# docs/superpowers/specs/2026-07-03-brain-foundation-design.md (D4).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE_DIR="$SCRIPT_DIR/../templates/brain"

CREATE_REMOTE=0
COLLABORATOR=""
TARGET=""

usage() {
  cat <<'EOF'
Usage:
  brain-bootstrap.sh <target-dir>
  brain-bootstrap.sh --create-remote --collaborator <handle>

  <target-dir>              local mode: seed the Karpathy layout here (idempotent)
  --create-remote            remote mode: create Paddione/brain and push the seed
  --collaborator <handle>    required with --create-remote; GitHub handle to add
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --create-remote) CREATE_REMOTE=1 ;;
    --collaborator)  COLLABORATOR="${2:-}"; shift ;;
    -h|--help)       usage; exit 0 ;;
    *)               TARGET="$1" ;;
  esac
  shift
done

if [[ -z "$TARGET" && "$CREATE_REMOTE" -eq 0 ]]; then
  usage
  exit 2
fi

seed() {  # seed <dest> — idempotent copy of the template tree
  local dest="$1"
  mkdir -p "$dest"
  cp -R "$TEMPLATE_DIR/." "$dest/"
  chmod +x "$dest"/scripts/*.sh 2>/dev/null || true
}

if [[ -n "$TARGET" ]]; then
  seed "$TARGET"
fi

if [[ "$CREATE_REMOTE" -eq 1 ]]; then
  : "${COLLABORATOR:?--collaborator <handle> required for --create-remote}"
  work="$(mktemp -d)"
  seed "$work"
  gh_bin() { command -v gh-axi >/dev/null 2>&1 && echo gh-axi || echo gh; }
  "$(gh_bin)" repo create Paddione/brain --private --disable-wiki || true
  (
    cd "$work"
    git init -q
    git add -A
    git commit -qm "chore(brain): seed Karpathy LLM-wiki foundation [T001568]"
    git branch -M main
    git remote add origin "https://github.com/Paddione/brain.git"
    git push -u origin main
  )
  gh api -X PUT "repos/Paddione/brain/collaborators/${COLLABORATOR}" -f permission=push
fi

exit 0
