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

# ── Loop-Closure [T013305]: Eskalation, Watchlist, Rezurrenz ────────────────
# Mechanismus C: Ein Eintrag, der >= 2 abgeschlossene Zyklen ueberlebt hat oder
# dessen Watchlist-Ablaufdatum verstrichen ist, wird VOR dem Carry-over promoted
# (eigenes Ticket, attention_mode=needs_human) und aus allen Uebertraegen
# ausgeschieden — er verlaesst die Rollup-Loop, statt zum Zombie zu werden.
# Idempotent ueber den 'Eskaliert:'-Marker-Kommentar auf dem Container.
EXCLUDE_FILE=$(mktemp); ESCALATION_FILE=$(mktemp); HISTORY_FILE=$(mktemp); RECURRENCE_FILE=$(mktemp)
cleanup_loop_closure() {
  rm -f "$EXCLUDE_FILE" "$ESCALATION_FILE" "$HISTORY_FILE" "$RECURRENCE_FILE" 2>/dev/null || true
}

{
  bash "$REPO/scripts/factory/rollup-carryover.sh" --escalations "$REPO" --container "$CONTAINER_ID" 2>/dev/null || true
  bash "$REPO/scripts/factory/rollup-carryover.sh" --watchlist-expired "$REPO" --today "$(date -u '+%Y-%m-%d')" 2>/dev/null || true
} > "$ESCALATION_FILE"

while IFS=$'\t' read -r esc_title esc_meta esc_cycles; do
  [[ -n "${esc_title:-}" ]] || continue
  # [T013843] Belt-and-Suspenders zum Parser-Fix in rollup-carryover.sh
  # (T013316): ein Titel, der wie eine Plan-Checkbox aussieht, ist kein Befund.
  # Die strenge _line_title-Extraktion darf solche Zeilen gar nicht mehr
  # liefern; dieser Guard stellt das Unabhaengig davon sicher.
  if [[ "$esc_title" == '- ['* ]]; then
    echo "mishap-rollup: Eskalation '${esc_title}' sieht nach Plan-Boilerplate aus — skip [T013843]"
    continue
  fi
  already=$(cat <<SQL | factory_psql 2>/dev/null | head -1
SELECT COUNT(*)::int FROM tickets.ticket_comments c
JOIN tickets.tickets t ON t.id = c.ticket_id
WHERE t.external_id = '${CONTAINER_ID}'
  AND c.body LIKE '%Eskaliert: ${esc_title}%';
SQL
  )
  if [[ "${already:-0}" -ne 0 ]]; then
    echo "mishap-rollup: Eskalation '${esc_title}' bereits promoted — skip"
    continue
  fi
  # [T013843] Global-Dedupe ueber Container-Rotation: die 'Eskaliert:'-Marker
  # haengen am ephemeren Container — der naechste Zyklus bekommt einen frischen
  # und sah die alten Marker nie. Real: 4 Wellen identischer Tickets
  # (T013679…T013739) aus 5 Containern heraus am 2026-08-22. Gebundener
  # Parameter statt Interpolation (Quote-sicher), Fail-open bei DB-Ausfall
  # wie beim Container-Marker oben.
  open_elsewhere=$(factory_psql -v esc_title="[Rollup] ${esc_title}" <<'SQL' 2>/dev/null | head -1
SELECT COUNT(*)::int FROM tickets.tickets
WHERE title = :'esc_title'
  AND status NOT IN ('done', 'archived');
SQL
  )
  if [[ "${open_elsewhere:-0}" -ne 0 ]]; then
    echo "mishap-rollup: '[Rollup] ${esc_title}' existiert bereits als offenes Ticket — Marker nachgetragen, skip [T013843]"
    BRAND="$BRAND" bash "$REPO/scripts/ticket.sh" add-comment --id "$CONTAINER_ID" \
      --body "Eskaliert: ${esc_title} (Zyklen: ${esc_cycles}) → bereits als offenes Ticket vorhanden, keine Re-Promotion [T013843]" \
      --author mishap-rollup --visibility internal >/dev/null 2>&1 || true
    printf '%s\n' "$esc_title" >> "$EXCLUDE_FILE"
    continue
  fi
  new_id="$(BRAND="$BRAND" bash "$REPO/scripts/ticket.sh" create \
    --type fix \
    --title "[Rollup] ${esc_title}" \
    --description "$(printf 'Aus der Mishap-Rollup-Loop eskaliert [T013305]. Der Eintrag blieb in %s Zyklen offen bzw. seine Beobachtung lief ab.\n\nMeta: %s\nZyklen: %s\n\nUrspruengliche Beschreibung: Batch-Kommentare auf Container %s und die Zyklus-Plaene unter openspec/changes/*mishap-incident-rollup-*.' "${esc_cycles//,/ /}" "${esc_meta:-}" "$esc_cycles" "$CONTAINER_ID")" \
    --attention-mode needs_human \
    --severity minor \
    --brand "$BRAND" 2>/dev/null | cut -d'|' -f1 || true)"
  if [[ -n "$new_id" ]]; then
    BRAND="$BRAND" bash "$REPO/scripts/ticket.sh" add-comment --id "$CONTAINER_ID" \
      --body "Eskaliert: ${esc_title} (Zyklen: ${esc_cycles}) → ${new_id}" \
      --author mishap-rollup --visibility internal >/dev/null 2>&1 || true
    printf '%s\n' "$esc_title" >> "$EXCLUDE_FILE"
    echo "mishap-rollup: eskaliert '${esc_title}' → Ticket ${new_id}"
  else
    echo "mishap-rollup: WARNUNG — Promotion von '${esc_title}' fehlgeschlagen; bleibt in der Loop" >&2
  fi
done < "$ESCALATION_FILE"

# Carry-over unerledigter Eintraege [T013108] — eskalierte Titel sind
# ausgeschieden (--exclude-file).
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
earlier_plans=()
while IFS=$'\t' read -r src_slug src_plan; do
  [[ -n "${src_slug:-}" && -n "${src_plan:-}" ]] || continue
  exclude_args=()
  for earlier_plan in "${earlier_plans[@]}"; do
    exclude_args+=(--exclude-plan "$earlier_plan")
  done
  earlier_plans+=("$src_plan")
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
  carry_body="$(bash "$REPO/scripts/factory/rollup-carryover.sh" --plan "$src_plan" --slug "$src_slug" "${exclude_args[@]}" --exclude-file "$EXCLUDE_FILE" 2>/dev/null)" || continue
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

# ── Watchlist-Re-Inclusion [T013305 Mechanismus B] ──────────────────────────
# Lebende 'beobachten (bis Zyklus <Datum>)'-Eintraege vergangener Plaene werden
# als synthetischer Batch in den Kommentar-Strom INJEKTIERT (nicht auf den
# Container geschrieben) — der Lauf rechnet sie frisch aus den Plan-Dateien,
# damit gibt es kein Idempotenzproblem; abgelaufene sind oben schon eskaliert.
wl_body="$(bash "$REPO/scripts/factory/rollup-carryover.sh" --watchlist-live "$REPO" \
  --today "$(date -u '+%Y-%m-%d')" --exclude-file "$EXCLUDE_FILE" 2>/dev/null || true)"
if [[ -n "$wl_body" ]]; then
  printf '%s\n' "$wl_body" >> "$COMMENTS_FILE"
  echo "mishap-rollup: Watchlist-Eintraege re-injiziert"
fi

# ── Verlauf + Rezurrenz [T013305 Mechanismus A] ─────────────────────────────
# Alle Batch-Kommentare ueber ALLE Container hinweg (auch geschlossene) — die
# Basis fuer das ×N-Rendering im Plan. Fail-open: ohne Verlauf rendert der Plan
# eben ohne Rezurrenz-Marker.
cat <<SQL | factory_psql 2>/dev/null > "$HISTORY_FILE" || true
SELECT E'<<<ROLLUP-CYCLE>>>' || chr(9) || t.external_id || E'\n<<<ROLLUP-COMMENT>>>\n' || c.body
FROM tickets.ticket_comments c
JOIN tickets.tickets t ON t.id = c.ticket_id
WHERE c.body LIKE '### Mishap-Rollup%'
ORDER BY c.created_at ASC;
SQL
bash "$REPO/scripts/factory/rollup-recurrence.sh" --all < "$HISTORY_FILE" > "$RECURRENCE_FILE" 2>/dev/null || true

# ── Coalescing-Gate [T013915] ────────────────────────────────────────────────
# Env-Defaults (per Umgebung uebersteuerbar): Container unter der Schwelle
# (ROLLUP_MIN_ENTRIES Eintraege / ROLLUP_MAX_AGE_H h) bleiben im Collect Mode —
# der Generator beendet den Lauf vor der Worktree-Anlage mit exit 0, Flusher
# und Carry-over verwenden denselben Container weiter. Hintergrund: Am
# 2026-08-22 entstanden 18 Rollup-Container in 40 Minuten, weil der Generator
# jeden Container ab 1 Eintrag sofort stagte (inkl. Carry-over).
ROLLUP_MIN_ENTRIES="${ROLLUP_MIN_ENTRIES:-3}"
ROLLUP_MAX_AGE_H="${ROLLUP_MAX_AGE_H:-24}"

BATCH_COUNT="$(bash "$REPO/scripts/factory/rollup-plan-tasks.sh" --count < "$COMMENTS_FILE")"
BATCH_COUNT="${BATCH_COUNT:-0}"

# Altersmessung: aeltester Batch-Kommentar auf dem Container (min(created_at),
# analog zum COMMENTS_FILE-Read, Filter body NOT LIKE 'FACTORY-PLAN-REF%').
# Fail-open: eine leere Antwort (Abfragefehler) zaehlt als "Alter nicht
# ermittelbar" und blockt das Gate nicht — der bestehende Staging-Pfad laeuft
# dann unveraendert (keine Container-Leiche). Das Gate blockt NUR, wenn BEIDE
# Bedingungen nachweislich zutreffen: unter der Eintrags-Schwelle UND juenger
# als das Max-Alter.
if [[ "${BATCH_COUNT}" -lt "${ROLLUP_MIN_ENTRIES}" ]]; then
  oldest_ts="$(cat <<SQL | factory_psql 2>/dev/null | head -1
SELECT min(c.created_at) FROM tickets.ticket_comments c
JOIN tickets.tickets t ON t.id = c.ticket_id
WHERE t.external_id = '${CONTAINER_ID}'
  AND c.body NOT LIKE 'FACTORY-PLAN-REF%';
SQL
)" || true
  if [[ -n "${oldest_ts:-}" ]]; then
    oldest_epoch="$(date -u -d "${oldest_ts}" +%s 2>/dev/null || true)"
    if [[ -n "${oldest_epoch:-}" ]]; then
      age_h=$(( ($(date -u +%s) - oldest_epoch) / 3600 ))
      if [[ "${age_h}" -lt "${ROLLUP_MAX_AGE_H}" ]]; then
        echo "mishap-rollup: Coalescing-Gate — ${BATCH_COUNT} Eintrag(e), aeltester ${age_h} h alt (< ${ROLLUP_MIN_ENTRIES} Eintraege, < ${ROLLUP_MAX_AGE_H} h) — Container sammelt weiter, kein stage-plan [T013915]" >&2
        # [T013915] Der cleanup_wt-Trap ist hier noch nicht registriert
        # (Worktree-Management laeuft erst hinter dem Gate) — Temps manuell
        # raeumen, sonst bleiben COMMENTS_FILE und die Loop-Closure-Dateien
        # pro Collect-Lauf in /tmp liegen.
        rm -f "${COMMENTS_FILE:-}" 2>/dev/null || true
        cleanup_loop_closure 2>/dev/null || true
        exit 0
      fi
    fi
  fi
fi

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
  cleanup_loop_closure 2>/dev/null || true
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

# ── Archive-Janitor [T013305 Mechanismus D] ─────────────────────────────────
# Maschine-owned Archivierung abgeschlossener Zyklen: Ticket done/archived +
# Change-Dir noch unarchiviert → move nach archive/<datum>-<slug>. Der Move
# landet mit dem Plan in EINEM Commit auf dem Zyklus-Branch und kommt per PR
# auf main. Fail-open: ein Janitor-Fehler haelt den Zyklus nicht an.
echo "mishap-rollup: Archive-Janitor ..."
jan_out="$(bash "$REPO/scripts/factory/rollup-archive-janitor.sh" --apply "$WT" 2>&1)" || {
  jan_rc=$?
  case "$jan_rc" in
    3) echo "mishap-rollup: Archive-Janitor — nichts zu archivieren" ;;
    *) echo "mishap-rollup: WARNUNG — Archive-Janitor fehlgeschlagen (rc=${jan_rc}):" >&2
       printf '%s\n' "$jan_out" >&2 ;;
  esac
}
if [[ -n "${jan_out:-}" && "$jan_rc" != "3" ]]; then
  printf '%s\n' "$jan_out"
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
  # [T013305] ROLLUP_RECURRENCE_FILE gibt dem Renderer die ×N-Marker vor.
  ROLLUP_RECURRENCE_FILE="$RECURRENCE_FILE" \
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
