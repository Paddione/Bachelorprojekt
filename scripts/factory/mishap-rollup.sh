#!/usr/bin/env bash
# scripts/factory/mishap-rollup.sh — generates + stages a mishap-incident-rollup
# plan from buffer batches on the persistent container ticket. [T002407]
#
# USAGE: BRAND=<brand> bash scripts/factory/mishap-rollup.sh
#
# Creates or updates openspec/changes/mishap-incident-rollup/ auf dem persistenten
# Branch chore/mishap-incident-rollup. Der Branch wird nie geloescht — das Ticket
# "Mishap Rollup — fortlaufende Sammlung" bleibt dauerhaft offen (type=chore,
# status=plan_staged) und sammelt nicht-kritische Mishaps aus den Buffer-Flushern.
#
# Basiert auf auto-chore-plan.sh [T002390] mit geaenderten Semantiken:
#   - Fester Slug/Branch (nicht pro Ticket)
#   - Update statt Abbruch wenn Change-Verzeichnis existiert
#   - Branch existiert auf Remote → auschecken + rebasen statt neu anlegen
#   - Kein trap-cleanup des Worktrees (Branch bleibt persistent)
#
# Exit:
#   0 = Plan gestaged oder nichts zu tun
#   1 = Fehler
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"

# ── Constants ───────────────────────────────────────────────────────────────
BRAND="${BRAND:-mentolder}"
SLUG="mishap-incident-rollup"
BRANCH="chore/${SLUG}"
CHANGE_DIR="openspec/changes/${SLUG}"
PLAN_PATH="${CHANGE_DIR}/tasks.md"
ROLLUP_TITLE="Mishap Rollup — fortlaufende Sammlung"
WT="$REPO/.worktrees/${SLUG}"

# ── Help ────────────────────────────────────────────────────────────────────
if [[ "${1:-}" == "--help" ]]; then
  echo "Usage: BRAND=<brand> bash $(basename "${BASH_SOURCE[0]}")"
  echo "  Generiert/staged einen Plan aus Mishap-Batches auf dem Container-Ticket."
  exit 0
fi

# ── Load factory lib ────────────────────────────────────────────────────────
source "$HERE/lib.sh"

# ── Find container ticket ───────────────────────────────────────────────────
# T002783: Gemeinsame Aufloesung ueber ticket.sh rollup-container statt eigener
# SQL. Die Shell-Implementierung sucht offene Chore-Tickets (nicht done/archived)
# und legt notfalls einen neuen an. Ein leerer Rueckgabewert ist ein harter Fehler
# (nicht exit 0), denn ein Container MUSS nach dieser Aufloesung existieren.
factory_resolve
CONTAINER_ID="$(bash "$REPO/scripts/ticket.sh" rollup-container --brand "$BRAND" 2>/dev/null)"
if [[ -z "${CONTAINER_ID}" ]]; then
  echo "mishap-rollup: FEHLER — rollup-container lieferte keine ID fuer ${BRAND}" >&2
  exit 1
fi
echo "mishap-rollup: Container-Ticket = ${CONTAINER_ID} (${BRAND})"

# ── Check for unprocessed comment batches ───────────────────────────────────
# Wir zaehlen Kommentare, die KEINE FACTORY-PLAN-REF sind (die sind vom letzten
# stage-plan). Nur Content-Kommentare (= Mishap-Batches) zaehlen als Batches.
BATCH_COUNT=$(cat <<SQL | factory_psql 2>/dev/null | head -1
SELECT COUNT(*)::int FROM tickets.ticket_comments c
JOIN tickets.tickets t ON t.id = c.ticket_id
WHERE t.external_id = '${CONTAINER_ID}'
  AND c.body NOT LIKE 'FACTORY-PLAN-REF%';
SQL
)
BATCH_COUNT="${BATCH_COUNT:-0}"

if [[ "${BATCH_COUNT}" -eq 0 ]]; then
  echo "mishap-rollup: keine Content-Kommentare auf ${CONTAINER_ID} — nichts zu tun, exit 0"
  exit 0
fi
echo "mishap-rollup: ${BATCH_COUNT} Batch-Kommentare gefunden"

# ── Worktree-Management ────────────────────────────────────────────────────
# Entferne einen ggf. stale Worktree von einem abgebrochenen vorherigen Lauf.
# Anders als auto-chore-plan.sh behalten wir den Worktree NICHT ueber exit/trap,
# weil der Branch persistent ist — der Worktree steht dem naechsten Lauf zur
# Verfuegung. Ein abgebrochener Lauf hinterlaesst trotzdem einen stale Worktree,
# den wir hier vor der Neuanlage entfernen.
if git -C "$REPO" worktree list 2>/dev/null | grep -qF "$WT"; then
  echo "mishap-rollup: entfernter Worktree schon registriert — benutze vorhandenen"
  # Der Worktree ist noch intakt — kein remove noetig.
elif [[ -d "$WT" ]]; then
  echo "mishap-rollup: entfernter stale Worktree-Verzeichnis ${WT}"
  rm -rf "$WT"
fi

# Worktree ggf. anlegen. worktree-create.sh behandelt beide Faelle:
#   - Branch existiert noch nicht (lokal/remote) → neu von origin/main
#   - Branch existiert bereits → checkout
# Exit 3 = Branch in einem anderen Worktree ausgecheckt (sollte bei persistentem
# Branch nicht vorkommen, aber sicherheitshalber abfangen).
if ! git -C "$REPO" worktree list 2>/dev/null | grep -qF "$WT"; then
  echo "mishap-rollup: lege Worktree an (branch=${BRANCH}, path=${WT})"
  wt_out="$(bash "$REPO/scripts/worktree-create.sh" --unattended "$BRANCH" "$WT" 2>&1)" || {
    rc=$?
    if [[ "$rc" == "3" ]]; then
      echo "mishap-rollup: Branch ${BRANCH} ist in einem anderen Worktree ausgecheckt — skip" >&2
      exit 0
    fi
    echo "mishap-rollup: Worktree-Anlage fehlgeschlagen (rc=${rc}):" >&2
    printf '%s\n' "$wt_out" >&2
    exit 1
  }
fi

cd "$WT"

# ── Branch auf Remote → rebasen ─────────────────────────────────────────────
# Wenn der Branch auf origin existiert, rebasen wir auf origin/main, damit der
# Plan den aktuellen Stand des main-Branches reflektiert.
# [T002913] Der post-commit-embed-Hook feuert bei JEDEM rebasierten Commit und
# kann am Embedding-Backend haengen (readiness=true bei totem Endpoint). Genau so
# hing der Factory-Tick stundenlang im Rebase, hielt den Flock und blockierte
# jeden weiteren Tick. Ein Factory-interner Rollup-Rebase braucht den Hook nicht
# (der Embed laeuft ohnehin nach dem stage-plan) — also deaktivieren.
if git rev-parse --verify --quiet "origin/${BRANCH}" >/dev/null 2>&1; then
  echo "mishap-rollup: rebase ${BRANCH} auf origin/main (post-commit-embed deaktiviert)"
  git fetch origin main 2>/dev/null || true
  git -c core.hooksPath=/dev/null rebase origin/main 2>/dev/null || {
    echo "mishap-rollup: rebase fehlgeschlagen — breche ab" >&2
    exit 1
  }
fi

# ── Plan-Erzeugung / -Update ────────────────────────────────────────────────
# Sammle alle Content-Kommentare (non-FACTORY-PLAN-REF) als Plan-Beschreibung.
# Das Skript arbeitet idempotent: jeder Lauf erzeugt den Plan aus ALLEN aktuellen
# Kommentaren neu. Nach dem stage-plan wird ein neuer FACTORY-PLAN-REF gesetzt,
# sodass nur spaetere Kommentare als "neu" gelten.

mkdir -p "$WT/$CHANGE_DIR"

# proposal.md anlegen (nur beim ersten Mal, danach unveraendert)
if [[ ! -f "$WT/$CHANGE_DIR/proposal.md" ]]; then
  cat > "$WT/$CHANGE_DIR/proposal.md" <<PROPOSALEOF
# Proposal: ${SLUG}

## Why

Fortlaufende Sammlung nicht-kritischer Mishaps aus dem Buffer.
Dieser Plan wird automatisch von \`scripts/factory/mishap-rollup.sh\` [T002407]
generiert und geupdated, sobald der Rollup-Container neue Batch-Kommentare hat.

## What

Die Batch-Kommentare auf dem Container-Ticket werden in Tasks uebersetzt,
die der Factory-Dispatcher abarbeitet.
PROPOSALEOF
fi

# tasks.md aus den Batch-Kommentaren generieren
echo "mishap-rollup: generiere Plan aus ${BATCH_COUNT} Batch-Kommentaren"

# Kommentare einsammeln (nur Body, keine Metadaten)
COMMENTS_FILE=$(mktemp)
cat <<SQL | factory_psql 2>/dev/null > "$COMMENTS_FILE"
SELECT c.body FROM tickets.ticket_comments c
JOIN tickets.tickets t ON t.id = c.ticket_id
WHERE t.external_id = '${CONTAINER_ID}'
  AND c.body NOT LIKE 'FACTORY-PLAN-REF%'
ORDER BY c.created_at ASC;
SQL

{
  cat <<PLANEOF
---
title: "${SLUG} — Implementation Plan"
ticket_id: ${CONTAINER_ID}
domains: [factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# ${SLUG} — Implementation Plan

_Container-Ticket: ${CONTAINER_ID}_

Automatisch erzeugt von \`scripts/factory/mishap-rollup.sh\` [T002407] am
$(date -u '+%Y-%m-%d %H:%M UTC'). Die Eintraege stammen aus den
Batch-Kommentaren des Container-Tickets "${ROLLUP_TITLE}".

## File Structure

\`\`\`
<Der Implementer traegt hier die tatsaechlich geaenderten Dateien nach>
\`\`\`

## Mishap-Batches

PLANEOF
  cat "$COMMENTS_FILE"
  cat <<'PLANEOF'

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Fuer den ersten Eintrag oben einen Test schreiben,
      der das beschriebene Fehlverhalten reproduziert. Er gehoert nach
      `tests/spec/<spec-slug>.bats` — die Spec, die das Verhalten abdeckt.

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/software-factory/
# expected: FAIL (rot — der Fix ist noch nicht implementiert)
```

- [ ] **Fix-Step (GREEN).** Die Eintraege oben abarbeiten.

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
PLANEOF
} > "$WT/$PLAN_PATH"

rm -f "$COMMENTS_FILE"

echo "mishap-rollup: Plan geschrieben nach ${PLAN_PATH}"

# ── plan-lint Hard Gate ─────────────────────────────────────────────────────
echo "mishap-rollup: plan-lint ..."
lint_out="$(bash "$WT/scripts/plan-lint.sh" "$WT/$PLAN_PATH" 2>&1)" || {
  echo "mishap-rollup: plan-lint FAIL — kein stage-plan:" >&2
  printf '%s\n' "$lint_out" >&2
  exit 1
}
echo "mishap-rollup: plan-lint OK"

# ── Commit + Push (verketten) ──────────────────────────────────────────────
echo "mishap-rollup: commit + push ..."
git add "$CHANGE_DIR"
# Nur committen, wenn es Aenderungen gibt
if git diff --cached --quiet; then
  echo "mishap-rollup: keine Aenderungen seit letztem Commit — skip commit"
else
  # [T002817] Den Commit-Fehlschlag ausdruecklich benennen. Unter `set -e` brach das
  # Skript hier zwar ab, aber stumm: die Meldung kam vom git-Hook, nicht vom Treiber,
  # und der erzeugte Plan blieb als staged-but-uncommitted im Worktree liegen. Genau so
  # entstanden zwei Fossil-Dateien, die den frueheren Fehlschlag ueberdauerten — ein
  # `git add` ohne folgenden `commit` sieht im Index aus wie fertige Arbeit, ist aber
  # nirgends dauerhaft.
  if ! git commit -q -m "chore(plans): update ${SLUG} from container batches [${CONTAINER_ID}]"; then
    echo "mishap-rollup: FEHLER — git commit auf '${BRANCH}' abgelehnt." >&2
    echo "  Der erzeugte Plan liegt STAGED, aber uncommitted in: ${CHANGE_DIR}" >&2
    echo "  Die Meldung oben stammt von einem git-Hook. Haeufigste Ursache: der Branch" >&2
    echo "  fehlt in scripts/lib/branch-allowlist.sh (SSOT der ticketlosen Branches)." >&2
    exit 1
  fi
  # Push scheitert, wenn der Branch remote bereits weiter ist (z.B. durch
  # einen parallelen merge). Dann holen wir neu und rebasen.
  git push -q -u origin "$BRANCH" 2>/dev/null || {
    echo "mishap-rollup: push fehlgeschlagen — rebase + retry"
    git fetch origin main 2>/dev/null || true
    git -c core.hooksPath=/dev/null rebase origin/main 2>/dev/null || true
    git push -q -u origin "$BRANCH" || {
      echo "mishap-rollup: FEHLER — push auf '${BRANCH}' auch nach rebase fehlgeschlagen." >&2
      echo "  Der Plan ist lokal committet, aber nicht auf origin: ${CHANGE_DIR}" >&2
      exit 1
    }
  }
fi

# ── stage-plan (ohne --hold, damit das Ticket released ist) ─────────────────
echo "mishap-rollup: stage-plan ..."
bash "$WT/scripts/ticket.sh" stage-plan \
  --id "$CONTAINER_ID" \
  --branch "$BRANCH" \
  --plan "$PLAN_PATH" \
  --partials 1 >/dev/null

# ── execution_released=true explizit setzen (idempotent) ────────────────────
# Der Container startet als triage und bekommt hier plan_staged + FACTORY-PLAN-REF.
# Der stage-plan-Schritt setzt Status und Plan-Ref in einem Schritt.
# Mit release-hold stellen wir sicher, dass execution_released=true gesetzt
# UND die Factory aufgeweckt wird.
echo "mishap-rollup: release-hold (execution_released=true) ..."
bash "$WT/scripts/ticket.sh" release-hold --id "$CONTAINER_ID" >/dev/null

echo "mishap-rollup: fertig — ${BRAND} Container ${CONTAINER_ID} released"
