#!/usr/bin/env bash
# scripts/factory/mishap-rollup.sh — generates a mishap-incident-rollup plan from
# buffer batches on the ephemeral rollup container ticket. [T002407]
#
# USAGE: BRAND=<brand> bash scripts/factory/mishap-rollup.sh
#
# Erzeugt openspec/changes/mishap-incident-rollup-<datum>-<container>/ auf einem
# pro Zyklus angelegten Branch chore/mishap-incident-rollup-<datum>-<container>.
# Der Container ist ephemer [T004898]: er sammelt Batches bis zur Verarbeitung,
# der Generator schliesst ihn (done · resolution=obsolete, Konvention
# T004613/T004752), sobald sein Batch in den Plan uebergegangen ist. Der Change
# wird per PR auf main gemergt und dort archiviert; Branch und Worktree werden
# danach aufgeraeumt.
#
# Basiert auf auto-chore-plan.sh [T002390] mit geaenderten Semantiken:
#   - Slug/Branch pro Zyklus (Datum + Container-ID) statt festem Slug
#   - Wegwerf-Worktree mit trap-cleanup (kein persistenter Worktree)
#   - Closure des Containers nach erfolgreichem Push (done/obsolete)
#
# Exit:
#   0 = Plan gepusht oder nichts zu tun
#   1 = Fehler
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"

# ── Constants ───────────────────────────────────────────────────────────────
BRAND="${BRAND:-mentolder}"
ROLLUP_TITLE="Mishap Rollup — fortlaufende Sammlung"
# SLUG/BRANCH/CHANGE_DIR/WT werden nach der Container-Aufloesung gebaut
# (Datum + Container-ID) — siehe unten.

# ── Help ────────────────────────────────────────────────────────────────────
if [[ "${1:-}" == "--help" ]]; then
  echo "Usage: BRAND=<brand> bash $(basename "${BASH_SOURCE[0]}")"
  echo "  Generiert einen Plan aus Mishap-Batches und pusht ihn auf den Zyklus-Branch."
  exit 0
fi

# ── Load factory lib ────────────────────────────────────────────────────────
source "$HERE/lib.sh"

# ── Find container ticket ───────────────────────────────────────────────────
# T002783: Gemeinsame Aufloesung ueber ticket.sh rollup-container statt eigener
# SQL. Die Shell-Implementierung sucht offene Chore-Tickets (nicht done/archived,
# T004898: auch blocked-Container bleiben sichtbar) und legt notfalls einen
# neuen an. Ein leerer Rueckgabewert ist ein harter Fehler (nicht exit 0), denn
# ein Container MUSS nach dieser Aufloesung existieren.
factory_resolve
CONTAINER_ID="$(bash "$REPO/scripts/ticket.sh" rollup-container --brand "$BRAND" 2>/dev/null)"
if [[ -z "${CONTAINER_ID}" ]]; then
  echo "mishap-rollup: FEHLER — rollup-container lieferte keine ID fuer ${BRAND}" >&2
  exit 1
fi
echo "mishap-rollup: Container-Ticket = ${CONTAINER_ID} (${BRAND})"

# ── Slug/Branch pro Zyklus ──────────────────────────────────────────────────
# [T004898] Jeder Zyklus bekommt einen eigenen Slug: Datum + Container-ID. Die
# Container-ID macht den Slug auch bei mehreren Zyklen am selben Tag eindeutig
# (verschiedene Zyklen haben verschiedene Container — eine Kollision kann per
# Konstruktion nicht auftreten) und haelt den Branch branch-naming-konform:
# worktree-create.sh und der pre-commit-Guard verlangen T[0-9]{6,}, und die
# Allowlist in scripts/lib/branch-allowlist.sh ist bewusst EXAKT statt Glob
# (T002817, durch branch-allowlist-ssot.bats gepinnt) — ein ticketloser
# Datums-Branch waere weder anlegbar noch committebar.
SLUG="mishap-incident-rollup-$(date -u '+%Y-%m-%d')-${CONTAINER_ID}"
BRANCH="chore/${SLUG}"
CHANGE_DIR="openspec/changes/${SLUG}"
PLAN_PATH="${CHANGE_DIR}/tasks.md"
WT="$REPO/.worktrees/${SLUG}"

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

# ── Worktree-Management (Wegwerf) ──────────────────────────────────────────
# [T004898] Wie auto-chore-plan.sh [T002390]: der Worktree wird pro Lauf frisch
# angelegt und per trap nach dem Lauf wieder entfernt. Der Branch bleibt auf
# origin liegen, bis der PR gemergt und der Change archiviert ist; der naechste
# Zyklus bekommt einen eigenen Worktree unter eigenem Slug. Ein stale Worktree
# von einem abgebrochenen Lauf wird vom trap des naechsten Laufs entfernt.
cleanup_wt() { git -C "$REPO" worktree remove --force "$WT" >/dev/null 2>&1 || true; }
trap cleanup_wt EXIT

# Worktree ggf. anlegen. worktree-create.sh behandelt beide Faelle:
#   - Branch existiert noch nicht (lokal/remote) → neu von origin/main
#   - Branch existiert bereits (Re-Run des gleichen Containers) → checkout
# Exit 3 = Branch in einem anderen Worktree ausgecheckt (sicherheitshalber).
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
pro Zyklus generiert, sobald der Rollup-Container neue Batch-Kommentare hat.

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

# ── Commit + Push (rollup-publish.sh) ───────────────────────────────────────
# [T004898] Der Generator committet den Plan und pusht ihn normal auf den
# Zyklus-Branch — kein Amend, kein --force-with-lease, kein Rebase (die
# Maschinerie aus T002914/T002931 ist ersatzlos entfallen: pro Zyklus existiert
# genau ein Generator-Commit). Der Commit+Push-Block lebt in rollup-publish.sh,
# damit der Test ihn gegen ein Wegwerf-Repo fahren kann.
echo "mishap-rollup: commit + push ..."
if ! bash "$REPO/scripts/factory/rollup-publish.sh" \
  --repo "$WT" \
  --branch "$BRANCH" \
  --change-dir "$CHANGE_DIR" \
  --message "chore(plans): update ${SLUG} from container batches [${CONTAINER_ID}]"; then
  # [T002817] Den Fehlschlag ausdruecklich benennen. Unter `set -e` brach das
  # Skript hier zwar ab, aber stumm: die Meldung kam vom git-Hook, nicht vom
  # Treiber, und der erzeugte Plan blieb als staged-but-uncommitted im Worktree
  # liegen. Genau so entstanden zwei Fossil-Dateien, die den frueheren Fehlschlag
  # ueberdauerten — ein `git add` ohne folgenden `commit` sieht im Index aus wie
  # fertige Arbeit, ist aber nirgends dauerhaft.
  echo "mishap-rollup: FEHLER — publish auf '${BRANCH}' fehlgeschlagen." >&2
  echo "  Der Plan liegt lokal committet oder staged, aber nicht auf origin: ${CHANGE_DIR}" >&2
  echo "  Details liefert rollup-publish.sh oben. Hauefigste Ursache: ein" >&2
  echo "  divergierter Remote-Stand (paralleler Lauf) oder fehlende Push-Rechte." >&2
  echo "  Der Container bleibt offen und wird vom naechsten Lauf verarbeitet." >&2
  exit 1
fi

# ── Container schliessen (ephemer) ─────────────────────────────────────────
# [T004898] Nach erfolgreichem Commit+Push ist der Batch des Containers in den
# Plan uebergegangen — der Generator schliesst ihn (done · resolution=obsolete,
# Konvention der Ephemer-Container T004613/T004752). stage-plan/release-hold
# entfallen: der Change wird nicht mehr ueber den Ticket-Status an den
# Dispatcher gereicht, sondern per PR auf main gemergt und dort archiviert.
# Der naechste Flush legt einen neuen Container an (Invariante: hoechstens ein
# offener Container).
echo "mishap-rollup: schliesse Container ${CONTAINER_ID} (done/obsolete) ..."
BRAND="$BRAND" bash "$WT/scripts/ticket.sh" update-status \
  --id "$CONTAINER_ID" \
  --status done \
  --resolution obsolete

echo "mishap-rollup: fertig — ${BRAND} Container ${CONTAINER_ID} geschlossen, Branch ${BRANCH} gepusht"
