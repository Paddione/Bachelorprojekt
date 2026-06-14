#!/usr/bin/env bash
# gh-branch-protection.sh — Idempotentes Branch-Protection-Setup für main
#
# Setzt die required status checks für Paddione/Bachelorprojekt:main
# auf: Offline Tests (Manifests, Configs, Unit), Security Scan, Brett TypeScript,
#      Vitest (website + arena-server), Conventional Commits
# (E2E PR ist NICHT enthalten — informativ, blockiert keinen Auto-Merge)
#
# Verwendung:
#   bash scripts/gh-branch-protection.sh            # Checks setzen (default)
#   bash scripts/gh-branch-protection.sh --dry-run  # Nur zeigen, was sich ändern würde
#   bash scripts/gh-branch-protection.sh --status   # Aktuelle required checks anzeigen
#   bash scripts/gh-branch-protection.sh --add-e2e  # Emergency: E2E wieder hinzufügen
#
# Voraussetzung: GH_PAT env-var mit repo + admin:repo Scope
# (gleiche Credentials wie in auto-enable-automerge.yml)

set -euo pipefail

REPO="Paddione/Bachelorprojekt"
BRANCH="main"
MANUAL_URL="https://github.com/${REPO}/settings/branches"

# Required checks ohne E2E (Normalzustand nach diesem Feature)
# Namen sind die GitHub-status-check-Namen (name:-Feld der Job-Definition), nicht job-IDs.
REQUIRED_CHECKS_BASE=(
  "Offline Tests (Manifests, Configs, Unit)"
  "Security Scan"
  "Brett TypeScript"
  "Vitest (website + arena-server)"
  "Conventional Commits"
)

# Required checks inkl. E2E (Emergency-Stop-Zustand)
REQUIRED_CHECKS_WITH_E2E=(
  "Offline Tests (Manifests, Configs, Unit)"
  "Security Scan"
  "Brett TypeScript"
  "Vitest (website + arena-server)"
  "Conventional Commits"
  "E2E PR"
)

if [[ -z "${GH_PAT:-}" ]]; then
  echo "ERROR: GH_PAT env-var ist nicht gesetzt." >&2
  echo "       Setze: export GH_PAT=<token-mit-admin:repo-scope>" >&2
  echo "       Alternativ manuell: ${MANUAL_URL}" >&2
  exit 1
fi

MODE="apply"
if [[ "${1:-}" == "--status" ]]; then
  MODE="status"
elif [[ "${1:-}" == "--dry-run" ]]; then
  MODE="dry-run"
elif [[ "${1:-}" == "--add-e2e" ]]; then
  MODE="add-e2e"
fi

# Aktuelle required checks abrufen
get_current_checks() {
  GH_TOKEN="$GH_PAT" gh api \
    "repos/${REPO}/branches/${BRANCH}/protection" \
    --jq '.required_status_checks.contexts // []' 2>/dev/null || echo "[]"
}

if [[ "$MODE" == "status" ]]; then
  echo "=== Aktuelle required checks für ${REPO}:${BRANCH} ==="
  get_current_checks | jq -r '.[]' | sort | sed 's/^/  - /'
  exit 0
fi

# Ziel-Checks bestimmen
if [[ "$MODE" == "add-e2e" ]]; then
  TARGET_CHECKS=("${REQUIRED_CHECKS_WITH_E2E[@]}")
  echo "=== Emergency-Stop: E2E PR wird zu required checks hinzugefügt ==="
else
  TARGET_CHECKS=("${REQUIRED_CHECKS_BASE[@]}")
  echo "=== Branch Protection Setup: E2E PR wird aus required checks entfernt ==="
fi

# JSON-Array für API bauen
CONTEXTS_JSON=$(printf '%s\n' "${TARGET_CHECKS[@]}" | jq -R . | jq -s .)

echo "Ziel-required-checks:"
echo "$CONTEXTS_JSON" | jq -r '.[]' | sort | sed 's/^/  - /'

if [[ "$MODE" == "dry-run" ]]; then
  echo ""
  echo "[dry-run] Keine Änderung vorgenommen."
  echo "Zum Anwenden: bash scripts/gh-branch-protection.sh"
  exit 0
fi

# Branch Protection PATCH — setzt NUR required_status_checks
# Alle anderen Protection-Einstellungen werden beibehalten (enforce_admins, restrictions, etc.)
# durch Übergabe der aktuellen Werte via separate API-Calls nicht nötig — PATCH merged.
#
# WICHTIG: Die GitHub API /branches/main/protection erfordert alle Felder auf einmal;
# fehlende Felder werden auf null gesetzt. Daher aktuelle Werte erst lesen und mergen.
CURRENT_PROTECTION=$(GH_TOKEN="$GH_PAT" gh api \
  "repos/${REPO}/branches/${BRANCH}/protection" 2>/dev/null || echo "{}")

ENFORCE_ADMINS=$(echo "$CURRENT_PROTECTION" | jq '.enforce_admins.enabled // false')
REQUIRED_REVIEWS=$(echo "$CURRENT_PROTECTION" | jq '.required_pull_request_reviews // null')
RESTRICTIONS=$(echo "$CURRENT_PROTECTION" | jq '.restrictions // null')
REQUIRED_LINEAR=$(echo "$CURRENT_PROTECTION" | jq '.required_linear_history.enabled // false')
ALLOW_FORCE=$(echo "$CURRENT_PROTECTION" | jq '.allow_force_pushes.enabled // false')
ALLOW_DELETIONS=$(echo "$CURRENT_PROTECTION" | jq '.allow_deletions.enabled // false')
REQUIRE_CONVERSATION=$(echo "$CURRENT_PROTECTION" | jq '.required_conversation_resolution.enabled // false')

PAYLOAD=$(jq -n \
  --argjson contexts "$CONTEXTS_JSON" \
  --argjson enforce_admins "$ENFORCE_ADMINS" \
  --argjson required_reviews "$REQUIRED_REVIEWS" \
  --argjson restrictions "$RESTRICTIONS" \
  --argjson required_linear "$REQUIRED_LINEAR" \
  --argjson allow_force "$ALLOW_FORCE" \
  --argjson allow_deletions "$ALLOW_DELETIONS" \
  --argjson require_conversation "$REQUIRE_CONVERSATION" \
  '{
    required_status_checks: {
      strict: false,
      contexts: $contexts
    },
    enforce_admins: $enforce_admins,
    required_pull_request_reviews: $required_reviews,
    restrictions: $restrictions,
    required_linear_history: $required_linear,
    allow_force_pushes: $allow_force,
    allow_deletions: $allow_deletions,
    required_conversation_resolution: $require_conversation
  }')

echo ""
echo "Setze Branch Protection via GitHub API ..."

RESULT=$(GH_TOKEN="$GH_PAT" gh api \
  --method PUT \
  "repos/${REPO}/branches/${BRANCH}/protection" \
  --input <(echo "$PAYLOAD") 2>&1) || {
  echo "ERROR: GitHub API-Aufruf fehlgeschlagen:" >&2
  echo "$RESULT" >&2
  echo "" >&2
  echo "Fallback: Manuelle Einstellung unter ${MANUAL_URL}" >&2
  exit 1
}

echo "Erfolgreich gesetzt. Aktuelle required checks:"
GH_TOKEN="$GH_PAT" gh api \
  "repos/${REPO}/branches/${BRANCH}/protection" \
  --jq '.required_status_checks.contexts[]' | sort | sed 's/^/  - /'
