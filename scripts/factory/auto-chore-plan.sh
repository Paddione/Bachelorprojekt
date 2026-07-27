#!/usr/bin/env bash
# scripts/factory/auto-chore-plan.sh — Mishap-Bundle: triage → plan_staged [T002390]
#
#   bash scripts/factory/auto-chore-plan.sh <ext-id> [--dry-run]
#   BRAND=<brand> bash scripts/factory/auto-chore-plan.sh --all [--dry-run]
#
# Fuehrt aus, was .claude/skills/mishap-tracker/SKILL.md Schritt 3.5 beschreibt.
# Der Schritt war dort nur Prosa — und wurde deshalb uebersprungen: am 2026-07-28
# lagen 8 Mishap-Bundles mit severity=minor in triage, obwohl fuer sie kein
# menschliches Urteil noetig ist. scripts/hooks/mishap-tracker.sh ist ein reiner
# Friction-Recorder und enthaelt nichts davon.
#
# Gate: nur severity=minor|trivial. major/critical tragen broken- oder
# security-Eintraege und gehoeren vor menschliche Augen — sie bleiben triage.
#
# Exit: 0 = gestaged oder nichts zu tun, 1 = Fehler, 2 = Bedienfehler,
#       3 = vom Gate abgelehnt (kein Fehler, nur nicht auto-planbar).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"

DRY_RUN=false
ALL=false
EXT_ID=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    --all)     ALL=true; shift ;;
    --help)
      echo "Usage: bash $(basename "${BASH_SOURCE[0]}") <ext-id> [--dry-run]"
      echo "       BRAND=<brand> bash $(basename "${BASH_SOURCE[0]}") --all [--dry-run]"
      echo "  auto-chore-plan: Mishap-Bundle (severity=minor) von triage nach plan_staged"
      exit 0 ;;
    -*)        echo "Unknown option: $1" >&2; exit 2 ;;
    *)         EXT_ID="$1"; shift ;;
  esac
done

if [[ "$ALL" == false && -z "$EXT_ID" ]]; then
  echo "ERROR: <ext-id> oder --all erforderlich." >&2
  exit 2
fi

# --all: alle triage-Bundles der Brand einsammeln und einzeln durchreichen.
# Bewusst ueber einen Rekursions-Aufruf statt einer Schleife im Hauptteil — so
# kann ein einzelnes fehlschlagendes Bundle die uebrigen nicht mitreissen.
if [[ "$ALL" == true ]]; then
  : "${BRAND:?BRAND muss fuer --all gesetzt sein (mentolder|korczewski)}"
  source "$HERE/lib.sh"
  factory_resolve
  ids=$(printf "%s" "SELECT external_id FROM tickets.tickets \
WHERE status='triage' AND title LIKE 'Mishap-Bundle%%' \
AND severity IN ('minor','trivial') ORDER BY external_id;" | factory_psql)
  [[ -z "${ids// /}" ]] && { echo "auto-chore-plan: keine auto-planbaren Bundles fuer ${BRAND}"; exit 0; }
  rc=0
  while IFS= read -r id; do
    [[ -z "$id" ]] && continue
    args=("$id"); [[ "$DRY_RUN" == true ]] && args+=(--dry-run)
    BRAND="$BRAND" bash "${BASH_SOURCE[0]}" "${args[@]}" || rc=$?
  done <<< "$ids"
  # rc=3 heisst "vom Gate abgelehnt" — das ist beim Sammellauf kein Fehler.
  [[ "$rc" == "3" ]] && rc=0
  exit "$rc"
fi

# ── Einzelticket ────────────────────────────────────────────────────────────
ticket_json="$(bash "$REPO/scripts/ticket.sh" get --id "$EXT_ID" 2>/dev/null)" || {
  echo "auto-chore-plan: Ticket $EXT_ID nicht lesbar" >&2; exit 1; }

_field() { printf '%s' "$ticket_json" | jq -r --arg k "$1" '.[$k] // ""'; }

status="$(_field status)"
severity="$(_field severity)"
title="$(_field title)"
description="$(_field description)"

if [[ "$status" != "triage" ]]; then
  echo "auto-chore-plan: $EXT_ID steht auf '$status', nicht 'triage' — uebersprungen"
  exit 3
fi

# Severity-Gate. Die Severity kommt aus tickets.severity; `ticket.sh get` liefert
# sie inzwischen mit (die SKILL.md behauptete das Gegenteil und liess deshalb das
# in-session MISHAP_LOG als einzige Quelle gelten — nicht mehr noetig).
case "$severity" in
  minor|trivial) ;;
  *)
    echo "auto-chore-plan: $EXT_ID hat severity='$severity' — braucht menschliche Triage, bleibt triage"
    exit 3 ;;
esac

# Slug lowercase (openspec/changes/<slug>-Konvention), Branch mit UNVERAENDERTER
# Ticket-ID. .githooks/pre-commit erzwingt T[0-9]{6,} case-sensitive — ein aus dem
# Slug abgeleiteter Branch (chore/mishap-t002382) wird abgelehnt und der ganze
# Schritt stirbt still. Genau dieser Bug war T002240.
slug="mishap-$(printf '%s' "$EXT_ID" | tr '[:upper:]' '[:lower:]')"
branch="chore/mishap-${EXT_ID}"
plan_path="openspec/changes/${slug}/tasks.md"

if [[ "$DRY_RUN" == true ]]; then
  echo "auto-chore-plan [DRY-RUN]: $EXT_ID (severity=$severity) -> slug=$slug branch=$branch"
  exit 0
fi

cd "$REPO"

if [[ -e "openspec/changes/${slug}" ]]; then
  echo "auto-chore-plan: openspec/changes/${slug} existiert bereits — uebersprungen" >&2
  exit 3
fi

bash "$REPO/scripts/openspec.sh" propose "$slug" --ticket "$EXT_ID" >/dev/null

# Plan aus der Ticket-Beschreibung bauen. Die Bundle-Beschreibung ist strukturiert
# ("### Mishap N: <titel>" je Eintrag), daraus wird je ein Fix-Task.
{
  cat <<PLANEOF
---
title: "${slug} — Implementation Plan"
ticket_id: ${EXT_ID}
domains: [factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# ${slug} — Implementation Plan

_Ticket: ${EXT_ID}_

${title}

Automatisch erzeugt von \`scripts/factory/auto-chore-plan.sh\` [T002390]. Die Eintraege
stammen unveraendert aus der Ticket-Beschreibung; die Diagnose dort ist die Vorgabe.

## File Structure

\`\`\`
<der Implementer traegt hier die tatsaechlich geaenderten Dateien nach>
\`\`\`

## Mishap-Eintraege

PLANEOF
  printf '%s\n' "$description"
  cat <<'PLANEOF'

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Fuer den ersten Eintrag oben einen Test schreiben,
      der das beschriebene Fehlverhalten reproduziert. Er gehoert nach
      `tests/spec/<spec-slug>.bats` — die Spec, die das Verhalten abdeckt.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats
# expected: FAIL (rot — der Fix ist noch nicht implementiert)
```

- [ ] **Fix-Step (GREEN).** Die Eintraege oben abarbeiten. Jeder nennt Komponente und
      vorgeschlagene Behebung. Eintraege, die sich bei der Recon als nicht zutreffend
      erweisen, werden im PR-Text begruendet verworfen statt stillschweigend uebergangen.

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
PLANEOF
} > "$plan_path"

# Hard Gate: ein roter Linter darf niemals gestaged werden.
if ! lint_out="$(bash "$REPO/scripts/plan-lint.sh" "$plan_path" 2>&1)"; then
  echo "auto-chore-plan: plan-lint FAIL fuer $EXT_ID — kein stage-plan, Ticket bleibt triage" >&2
  printf '%s\n' "$lint_out" >&2
  rm -rf "openspec/changes/${slug}"
  exit 1
fi

bash "$REPO/scripts/ticket.sh" stage-plan --id "$EXT_ID" --branch "$branch" --plan "$plan_path" >/dev/null

# Commit und Push MUESSEN verkettet sein: ein vom pre-commit-Hook abgelehnter
# Commit verhindert einen Push auf eigener Zeile NICHT — der Branch waere dann
# ohne Plan gepusht und das Ticket zeigte auf Leeres.
git checkout -q -b "$branch" 2>/dev/null || git checkout -q "$branch"
git add "openspec/changes/${slug}" \
  && git commit -q -m "chore(plans): stage ${slug} for factory [${EXT_ID}]" \
  && git push -q -u origin "$branch"

echo "auto-chore-plan: $EXT_ID gestaged (branch=$branch plan=$plan_path)"
