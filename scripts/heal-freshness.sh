#!/usr/bin/env bash
# scripts/heal-freshness.sh — Freshness-Gate mit Heal-on-PR (T-PENDING)
#
# Ersetzt den `task freshness:check`-Step in ci.yml: bei Drift committet der
# Bot die regenerierten Artefakte auf den PR-Branch statt zu failen. Der durch
# den Bot-Commit ausgeloeste neue CI-Lauf entscheidet (D4).
#
# Fail-loud (D2): Race (Branch-Head bewegt) oder fehlender PAT -> exit 1.
# Kein stilles Gruen: ein Gate, das still heilt, wenn es nicht heilen kann,
# ist keins.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# FILES-Liste identisch zu freshness:check Phase 1 (Taskfile.yml) — ohne den
# repo-index (T002687). KEINE Kommentare in den String (Wortsplitting, T002686).
FILES="
  components/website/src/data/test-inventory.json
  components/website/src/data/api-inventory.json
  design/leitstand-ds/_tokens.css
  components/website/src/data/route-manifest.json
  components/website/src/lib/learning-assets.generated.json
  components/website/public/learning-assets/THIRD-PARTY-ASSETS.md
  components/website/src/data/openspec-status.json
  docs/spec-atlas.md
  docs/diagrams/architecture.md
  components/website/src/lib/sdlc/goals-data.generated.json
  docs/agent-guide/10-ziele.md
  docs/agent-guide/20-werkzeuge.md
  docs/agent-guide/30-bausteine.md
  docs/agent-guide/maps/goals-map.md
  docs/agent-guide/maps/tools-map.md
  docs/agent-guide/maps/danger-map.md
  docs/agent-guide/maps/agents-map.md
  docs/agent-guide/maps/networks-map.md
  components/website/src/lib/agent-guide.generated.json
  components/website/src/lib/platform-descriptions.generated.json
"

# Phase 0: komplettes Gate zuerst (regen + diff + graph + quality). Pass -> fertig.
set +e
task freshness:check
CHECK_RC=$?
set -e

if [ "$CHECK_RC" -eq 0 ]; then
  echo "✅ Freshness and quality gates passed"
  exit 0
fi

# Gate fehlgeschlagen — heilbar nur, wenn regenerierte Artefakte uncommitted
# sind. freshness:check hat freshness:regenerate bereits ausgefuehrt.
DRIFT=""
ERRORS=0
for f in $FILES; do
  if ! git diff --quiet HEAD -- "$f" 2>/dev/null; then
    echo "  ✗ $f regenerated but not committed"
    DRIFT="$DRIFT $f"
    ERRORS=$((ERRORS + 1))
  fi
done

if [ "$ERRORS" -eq 0 ]; then
  echo "❌ Freshness gate failed without artifact drift — quality/graph violation, not healable."
  echo "   New code-quality violation →  task quality:check  (then fix or 'task quality:baseline:freeze')"
  exit 1
fi

# Race-Guard (D2): Branch-Head muss seit Checkout unveraendert sein. CI checked
# refs/pull/N/merge aus — HEAD^2 ist der PR-Head. Weicht der Remote-Branch ab,
# hat der Author mid-run gepusht: Author-Push gewinnt, kein Heal.
if [ -n "${GITHUB_HEAD_REF:-}" ]; then
  LOCAL_HEAD="$(git rev-parse HEAD^2 2>/dev/null || echo "")"
  if [ -n "$LOCAL_HEAD" ]; then
    REMOTE_HEAD="$(git ls-remote origin "refs/heads/${GITHUB_HEAD_REF}" 2>/dev/null | cut -f1 || echo "")"
    if [ -n "$REMOTE_HEAD" ] && [ "$REMOTE_HEAD" != "$LOCAL_HEAD" ]; then
      echo "❌ Race: Branch ${GITHUB_HEAD_REF} hat sich seit Checkout bewegt (remote ${REMOTE_HEAD}, lokal ${LOCAL_HEAD})."
      echo "   Author-Push gewinnt — kein Heal, Fail-loud."
      exit 1
    fi
  fi
fi

# PAT-Pruefung (D2): ohne GH_PAT kein Push (GITHUB_TOKEN ist bei PR-Events
# read-only) — Fail-loud statt stillem Gruen.
if [ -z "${GH_TOKEN:-}" ]; then
  echo "❌ GH_TOKEN (secrets.GH_PAT) fehlt — Heal-Push unmoeglich, Fail-loud."
  exit 1
fi

# Heal: committen + pushen + kommentieren.
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add $DRIFT
# Kein Skip-CI-Marker — der Re-Run ist der Zweck (T002158).
git commit -m "chore: auto-regenerate freshness artifacts"

BRANCH="${GITHUB_HEAD_REF:-$(git branch --show-current 2>/dev/null || echo "")}"
if [ -z "$BRANCH" ]; then
  echo "❌ Branch-Name nicht bestimmbar (GITHUB_HEAD_REF leer, detached HEAD) — Fail-loud."
  exit 1
fi

if ! git push origin "HEAD:${BRANCH}"; then
  echo "❌ Push fehlgeschlagen (Race oder Berechtigung) — Fail-loud."
  exit 1
fi

SHA="$(git rev-parse --short HEAD)"
echo "✅ Healed: ${SHA} auf ${BRANCH} gepusht, Re-Run ausgeloest."

if [ -n "${PR_NUMBER:-}" ] && command -v gh >/dev/null 2>&1; then
  gh pr comment "$PR_NUMBER" --body "Freshness-Artefakte regeneriert und committet (${SHA}):${DRIFT}" || true
fi

exit 0
