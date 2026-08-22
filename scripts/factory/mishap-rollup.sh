#!/usr/bin/env bash
# scripts/factory/mishap-rollup.sh — generates a mishap-incident-rollup plan from
# buffer batches on the ephemeral rollup container ticket. [T002407]
#
# USAGE: BRAND=<brand> bash scripts/factory/mishap-rollup.sh
#
# Erzeugt openspec/changes/mishap-incident-rollup-<datum>-<container>/ auf einem
# pro Zyklus angelegten Branch chore/mishap-incident-rollup-<datum>-<container>.
# Der Container ist ephemer [T004898, geaendert in T007056]: er sammelt Batches,
# der Generator staged den daraus erzeugten Plan auf den Container
# (stage-plan --no-hold). Die Factory-Staged-Lane dispatcht ihn, der Executor
# implementiert die Fixes; der Post-Merge-Finalizer archiviert den Change und
# schliesst den Container per Merge=Closure (done · resolution=fixed). Branch
# und Worktree werden nach dem Executor-Merge aufgeraeumt.
#
# Basiert auf auto-chore-plan.sh [T002390] mit geaenderten Semantiken:
#   - Slug/Branch pro Zyklus (Datum + Container-ID) statt festem Slug
#   - Wegwerf-Worktree mit trap-cleanup (kein persistenter Worktree)
#   - Staged-Lane-Dispatch statt Container-Closure nach dem Push (T007056)
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

# ── Carry-over unerledigter Eintraege [T013108] ─────────────────────────────
# Ein Container schliesst per Merge=Closure, sobald irgendein PR auf seinem
# Zyklus-Branch merged. Ohne diesen Schritt verfallen dabei alle Eintraege, die
# keine Disposition bekommen haben (Zyklus 08-20/T012909: 3 von 10 erledigt,
# Container trotzdem done/fixed). Der Uebertrag laeuft VOR dem Lesen der
# Kommentare, damit die uebernommenen Eintraege im selben Lauf mitgezaehlt und
# geplant werden.
#
# Idempotent ueber den Quell-Slug im Kommentar-Header: ein Zyklus wird an
# denselben Container nie zweimal uebertragen. Ein Fehlschlag hier bricht den
# Rollup NICHT ab — der Zyklus laeuft dann ohne Uebertrag weiter, und der
# naechste Lauf holt ihn nach (der Quell-Plan bleibt ja liegen).
while IFS=$'\t' read -r src_slug src_plan; do
  [[ -n "${src_slug:-}" && -n "${src_plan:-}" ]] || continue
  already=$(cat <<SQL | factory_psql 2>/dev/null | head -1
SELECT COUNT(*)::int FROM tickets.ticket_comments c
JOIN tickets.tickets t ON t.id = c.ticket_id
WHERE t.external_id = '${CONTAINER_ID}'
  AND c.body LIKE '%Carry-over aus ${src_slug}%';
SQL
  )
  if [[ "${already:-0}" -ne 0 ]]; then
    echo "mishap-rollup: Carry-over aus ${src_slug} liegt bereits auf ${CONTAINER_ID} — skip"
    continue
  fi
  carry_body="$(bash "$REPO/scripts/factory/rollup-carryover.sh" --plan "$src_plan" --slug "$src_slug" 2>/dev/null)" || continue
  [[ -n "$carry_body" ]] || continue
  if BRAND="$BRAND" bash "$REPO/scripts/ticket.sh" add-comment --id "$CONTAINER_ID" \
       --body "$carry_body" --author mishap-rollup --visibility internal >/dev/null 2>&1; then
    echo "mishap-rollup: Carry-over aus ${src_slug} an ${CONTAINER_ID} angehaengt"
  else
    echo "mishap-rollup: WARNUNG — Carry-over aus ${src_slug} konnte nicht angehaengt werden" >&2
  fi
done < <(bash "$REPO/scripts/factory/rollup-carryover.sh" --scan "$REPO" --container "$CONTAINER_ID" 2>/dev/null || true)

# ── Kommentare lesen und echte Mishap-Eintraege zaehlen ─────────────────────
# [T013043] Der Kommentar-Strom wird EINMAL gelesen — hier, vor der Worktree-
# Anlage, damit der No-op-Pfad ohne Worktree erhalten bleibt. Gezaehlt werden
# nicht mehr die Kommentare, sondern die Mishap-EINTRAEGE darin: die alte
# Bedingung 'NOT LIKE FACTORY-PLAN-REF%' liess Watchdog-Meldungen, Unfactored-
# Notizen und Executor-Kommentare als Batch durchgehen (Container T012445:
# 16 gezaehlte "Batches", real EIN Mishap-Kommentar mit 10 Eintraegen). Die
# Filterlogik lebt in rollup-plan-tasks.sh und ist dort ueber stdout pruefbar.
# Aufgeraeumt wird in cleanup_wt() weiter unten — der EXIT-Trap ist einer pro
# Shell, ein eigener trap hier wuerde vom Worktree-Trap ueberschrieben.
COMMENTS_FILE=$(mktemp)

# Die Sentinel-Zeile markiert die Grenze zwischen zwei Kommentar-Bodies —
# psql reiht sie sonst ohne Trenner aneinander und ein Folgekommentar (etwa
# eine Watchdog-Notiz) waere nicht vom Ende des Batches zu unterscheiden.
# Der Wert ist mit COMMENT_SENTINEL in rollup-plan-tasks.sh abgestimmt.
cat <<SQL | factory_psql 2>/dev/null > "$COMMENTS_FILE"
SELECT E'<<<ROLLUP-COMMENT>>>\n' || c.body FROM tickets.ticket_comments c
JOIN tickets.tickets t ON t.id = c.ticket_id
WHERE t.external_id = '${CONTAINER_ID}'
  AND c.body NOT LIKE 'FACTORY-PLAN-REF%'
ORDER BY c.created_at ASC;
SQL

BATCH_COUNT="$(bash "$REPO/scripts/factory/rollup-plan-tasks.sh" --count < "$COMMENTS_FILE")"
BATCH_COUNT="${BATCH_COUNT:-0}"

if [[ "${BATCH_COUNT}" -eq 0 ]]; then
  echo "mishap-rollup: keine Mishap-Eintraege auf ${CONTAINER_ID} — nichts zu tun, exit 0"
  exit 0
fi
echo "mishap-rollup: ${BATCH_COUNT} Mishap-Eintraege gefunden"

# ── Worktree-Management (Wegwerf) ──────────────────────────────────────────
# [T004898] Wie auto-chore-plan.sh [T002390]: der Worktree wird pro Lauf frisch
# angelegt und per trap nach dem Lauf wieder entfernt. Der Branch bleibt auf
# origin liegen, bis der PR gemergt und der Change archiviert ist; der naechste
# Zyklus bekommt einen eigenen Worktree unter eigenem Slug. Ein stale Worktree
# von einem abgebrochenen Lauf wird vom trap des naechsten Laufs entfernt.
cleanup_wt() {
  # [T005115] Claim zuerst freigeben (best-effort), dann den Worktree entfernen —
  # der Claim-Guard von worktree-clean-check.sh blockiert Fremd-Removes nur, wenn
  # der Lock noch lebt; das eigene Cleanup darf den Lock nie stehen lassen.
  # [T007000] Vor dem Release aus dem Worktree-cwd heraus: der T006290-cwd-Guard
  # in agent-lock.sh verweigert Branch-Releases, solange die Shell-cwd im
  # Worktree des Locks liegt — der Lock blieb live, der naechste Driver-Lauf im
  # selben Tick hing am claim (beobachtet 2026-08-15, Rollup-Pipeline ~1h blockiert).
  cd "$REPO" >/dev/null 2>&1 || true
  bash "$REPO/scripts/agent-lock.sh" release branch "$BRANCH" >/dev/null 2>&1 || true
  git -C "$REPO" worktree remove --force "$WT" >/dev/null 2>&1 || true
  # [T013043] Der oben gelesene Kommentar-Strom liegt in einer Temp-Datei.
  rm -f "${COMMENTS_FILE:-}" 2>/dev/null || true
}
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

# [T005115] Zyklus-Branch claimen: der Claim-Guard von worktree-clean-check.sh
# blockiert Fremd-Removes, solange dieser Lauf lebt. Best-effort — ein
# fehlgeschlagener Claim (z.B. bereits fremd gehalten) bricht den Rollup nicht ab.
bash "$REPO/scripts/agent-lock.sh" claim branch "$BRANCH" --worktree "$WT" --label mishap-rollup >/dev/null 2>&1 || true

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
# [T013043] COMMENTS_FILE wurde oben (vor der Worktree-Anlage) einmal gefuellt —
# die frueher hier stehende zweite, identische Abfrage ist entfallen.
echo "mishap-rollup: generiere Plan aus ${BATCH_COUNT} Mishap-Eintraegen"

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
  # [T007000] Batch-Inhalt als Blockquote einbetten: plan-lint P2 scannt die
  # gesamte tasks.md auf Commit-Scope-Vorschreibungen (type(scope):) — Batch-
  # Kommentare duerfen solche Muster als BEISPIELE enthalten (z.B. feat(llm):
  # aus einem plan-quality-gates-Mishap). Zeilen mit '>' sind bei P2 explizit
  # exempt; das Praefix '> ' pro Zeile neutralisiert Beispiele, ohne den Inhalt
  # zu veraendern (beobachtet: Hard-Fail auf dem 10er-Batch vom 2026-08-15).
  # [T013043] Nur die Batch-Kommentare, ohne Watchdog-/Unfactored-/Executor-
  # Notizen — die lasen sich im Plan wie Arbeitsanweisungen (im 08-21-Plan
  # standen sechs 'Watchdog: pipeline stale'-Zeilen zwischen den Mishaps).
  bash "$REPO/scripts/factory/rollup-plan-tasks.sh" --batches < "$COMMENTS_FILE" \
    | sed 's/^[[:space:]]*/&> /'
  echo

  # [T013043] Aufgaben-Sektion: eine abhakbare Task pro Mishap-Eintrag mit
  # Pflicht-Disposition statt drei generischer Sammel-Checkboxen.
  bash "$REPO/scripts/factory/rollup-plan-tasks.sh" < "$COMMENTS_FILE"
} > "$WT/$PLAN_PATH"

# [T005031] openspec-Validierbarkeit des Change: openspec.sh validate ist
# fail-closed (missing specs/ delta dir, no .ticket link). Das Artefakt-Skript
# schreibt .ticket (Container-ID) und specs/<slug>.md (ADDED Requirements aus
# den Batch-Eintraegen). Leere Eingabe bricht den Generator ab (Exit 1) — ein
# leerer Change darf nie entstehen.
echo "mishap-rollup: erzeuge .ticket + specs-Delta ..."
bash "$REPO/scripts/factory/mishap-rollup-artifacts.sh" \
  --slug "$SLUG" \
  --change-dir "$WT/$CHANGE_DIR" \
  --container "$CONTAINER_ID" < "$COMMENTS_FILE"

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

# ── Staged-Lane-Dispatch statt Container-Closure (T007056) ─────────────────
# Der Plan geht nicht mehr per PR auf main (T004898), sondern wird direkt auf
# den Container gestaged: die Factory-Staged-Lane dispatcht ihn (queue.sh
# akzeptiert type=chore, status=plan_staged + execution_released). Der Executor
# implementiert die Mishap-Fixes als normalen Lauf; der Post-Merge-Finalizer
# archiviert den Change (inkl. openspec-status.json-Regeneration) und schliesst
# den Container per Merge=Closure (done · resolution=fixed).
# --allow-empty-touched: der Rollup-Plan kennt die tatsaechlich geaenderten
# Dateien erst zur Ausfuehrungszeit — die File-Structure-Sektion enthaelt den
# Standard-Platzhalter, aus dem T002673 keine Pfade ableiten kann.
echo "mishap-rollup: stage-plan auf Container ${CONTAINER_ID} (--no-hold) ..."
BRAND="$BRAND" bash "$WT/scripts/ticket.sh" stage-plan \
  --id "$CONTAINER_ID" \
  --branch "$BRANCH" \
  --plan "${CHANGE_DIR}/tasks.md" \
  --no-hold \
  --allow-empty-touched

echo "mishap-rollup: fertig — ${BRAND} Container ${CONTAINER_ID} gestaged, Branch ${BRANCH} gepusht"
