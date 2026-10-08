#!/usr/bin/env bash
# scripts/devflow-post-merge-finalize.sh — idempotente Post-Merge-Finalisierung [T006284]
#
# Usage:
#   bash scripts/devflow-post-merge-finalize.sh <ticket-id> [--pr <n>] [--branch <branch>]
#
# Deterministische Abschluss-Einheit nach einem gruenen Auto-Merge: PR-Link setzen,
# Ticket auf done (Resolution fixed/shipped), verify:done-Phase-Event, Plan nach
# tickets.ticket_plans archivieren,
# Branch-Lock freigeben, Worktree und Branch entfernen. Jeder Schritt ueberspringt
# bereits erledigte Arbeit — das Skript ist idempotent und damit aufrufbar vom
# Finalizer-Subagenten, von Recovery-Sessions und vom Factory-Poller.
#
# Hintergrund (Incident T006284/PR #4460): Der dev-flow-execute-Executor starb nach
# dem Merge an Kontext-Erschoepfung; Ticket-Closure, Archiv und Cleanup blieben
# liegen und mussten manuell nachgeholt werden. Diese Einheit entfernt die Gelegenheit
# (Muster T002365/T001571), statt die Direktive zu verschaerfen.
#
# Exit-Codes:
#   0 = alle Schritte erledigt oder uebersprungen
#   1 = Fehler (die meldende Zeile nennt den Schritt)
#   2 = Usage-/Env-Fehler (keine Ticket-ID, TICKET_OFFLINE)
#
# Environment:
#   BRAND, TICKET_CTX — an ticket.sh durchgereicht (Default: mentolder/fleet).
#   TICKET_OFFLINE   — gesetzt: Abbruch mit klarer Meldung (Cluster-/DB-Zugriff noetig).
#
# Reihenfolge-Garantie (T004612): Die Plan-Archivierung (Schritt 7) laeuft VOR der
# Branch-Loeschung (Schritt 10); der Fix-PR-Merge loescht den Branch bewusst nicht
# (delete_branch_on_merge=false). Closure erst nach bestaetigtem Merge (T001149-M1):
# ohne PR-Nummer laufen die Closure-Schritte nicht.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="${REPO_DIR:-$(cd "$HERE/.." && pwd)}"
TICKET_SH="$REPO_DIR/scripts/ticket.sh"
# [T013315/F1] Invocations-cwd VOR dem ersten cd merken — Schritt 10 braucht ihn,
# um zu erkennen, dass die aufrufende Session im zu entfernenden Worktree steht
# (beobachtet im T013043-Lauf: danach "fatal: cannot change to ...", getcwd-Fehler).
INVOCATION_DIR="$PWD"
cd "$REPO_DIR"

usage() {
  cat <<'EOF'
Usage: devflow-post-merge-finalize.sh <ticket-id> [--pr <n>] [--branch <branch>]

Idempotente Post-Merge-Finalisierung fuer ein Ticket:
  PR-Link setzen, Ticket auf done (fixed/shipped), verify:done-Phase-Event,
  Plan nach tickets.ticket_plans archivieren, Branch-Lock freigeben,
  Worktree und Branch entfernen.

  --pr <n>        PR-Nummer (sonst aus gh gegen den Branch aufgeloest)
  --branch <b>    Branch (sonst aus dem FACTORY-PLAN-REF-Kommentar des Tickets)

  --frontmatter-state <slug> [--repo <dir>]  [T015916]
                  Schreibt completed | stale nach stdout (Exit 0); fehlt
                  .agents/plans/<slug>/tasks.md → ungleich 0 ohne Ausgabe.
  --apply-completed-frontmatter <plan-file>  [T900226]
                  Setzt status in <plan-file> auf status: completed (DB-frei, Exit 0).

Exit: 0 = erledigt/uebersprungen, 1 = Fehler, 2 = Usage-/Env-Fehler.
EOF
}

TICKET_ID=""
PR_NUM=""
BRANCH=""
FRONTMATTER_STATE_SLUG=""
APPLY_COMPLETED_FRONTMATTER_FILE=""

while [[ $# -gt 0 ]]; do case "$1" in
  --help|-h) usage; exit 0 ;;
  --pr)      PR_NUM="$2"; shift 2 ;;
  --branch)  BRANCH="$2"; shift 2 ;;
  --frontmatter-state) FRONTMATTER_STATE_SLUG="$2"; shift 2 ;;
  --apply-completed-frontmatter) APPLY_COMPLETED_FRONTMATTER_FILE="$2"; shift 2 ;;
  --repo)    REPO_DIR="$(cd "$2" && pwd)"; TICKET_SH="$REPO_DIR/scripts/ticket.sh"; cd "$REPO_DIR"; shift 2 ;;
  -*)        echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  *)         if [[ -z "$TICKET_ID" ]]; then TICKET_ID="$1"; shift
             else echo "Unexpected argument: $1" >&2; usage >&2; exit 2; fi ;;
esac; done

if [[ -z "$TICKET_ID" && -z "$FRONTMATTER_STATE_SLUG" && -z "$APPLY_COMPLETED_FRONTMATTER_FILE" ]]; then
  echo "ERROR: Ticket-ID fehlt." >&2
  usage >&2
  exit 2
fi

# [T015783] --archive-state ist vom Offline-Guard ausgenommen: es liest nur
# Arbeitsbaum und Remote-Refs, nie die Ticket-DB. Der Guard schuetzt die
# Closure-Schritte, nicht die Zustandsabfrage. [T015916] --frontmatter-state
# und [T900226] --apply-completed-frontmatter ebenso: lesen/schreiben nur den Arbeitsbaum.
if [[ -n "${TICKET_OFFLINE:-}" && -z "$FRONTMATTER_STATE_SLUG" && -z "$APPLY_COMPLETED_FRONTMATTER_FILE" ]]; then
  echo "ERROR: Finalize-Skript benoetigt Cluster-/DB-Zugriff (ticket.sh); TICKET_OFFLINE ist gesetzt." >&2
  exit 2
fi

# [T015916] Frontmatter-Helfer im Fragment (S1-Budget); die Status-Alternation
# steht genau einmal HIER — der verstreute Schritt-7-Sed ist entfernt.
_PLAN_STATUS_ACTIVE_ALT='(active|plan_staged|in_progress|planning)'
_FINALIZE_HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/finalize-frontmatter.sh
source "$_FINALIZE_HERE/lib/finalize-frontmatter.sh"
# [T900096] Fail-closed Step-Guards: Dirty-Tree-Abbruch (Schritt 8) + Ungemergt-Behalt (Schritt 10).
# shellcheck source=scripts/lib/finalize-step-guards.sh
source "$_FINALIZE_HERE/lib/finalize-step-guards.sh"
# shellcheck source=scripts/lib/worktree-remove.sh
source "$_FINALIZE_HERE/lib/worktree-remove.sh"

DONE_COUNT=0
SKIP_COUNT=0
WARN_COUNT=0
SKIP_STEPS=()
mark_ok()   { echo "[ok]   $1"; DONE_COUNT=$((DONE_COUNT + 1)); }
# [T013315/F3] Jeder Skip wird fuer die Schlusszeile aufgehoben — "N erledigt,
# M uebersprungen" las sich wie Erfolg, ohne zu sagen, WAS uebersprungen wurde.
mark_skip() { echo "[skip] $1"; SKIP_COUNT=$((SKIP_COUNT + 1)); SKIP_STEPS+=("$1"); }
# [T012256/B2] mark_warn trennt "Eingabe nicht aufloesbar" von "bereits erledigt".
# Beide erschienen als [skip] und zaehlten als uebersprungen; das Skript endete
# mit Exit 0 und "abgeschlossen". Genau so blieb T012243 unsichtbar: Schritt 10
# meldete "Worktree bereits entfernt", waehrend Worktree und Branch standen.
# Ein [warn] aendert den Exit-Code NICHT (der Lauf soll weiterhin nachholbar
# bleiben), erscheint aber in der Schlusszeile — der Aufrufer kann Erfolg damit
# von stillem Nichtstun unterscheiden.
mark_warn() { echo "[warn] $1" >&2; WARN_COUNT=$((WARN_COUNT + 1)); }
# [T015783] mark_err trennt "Schritt ist fehlgeschlagen" von den drei bisherigen
# Ausgaengen. mark_warn war dafuer ungeeignet: es aendert den Exit-Code
# ausdruecklich NICHT. Ein nicht belegter Archiv-Abschluss ist aber ein Fehler
# des Laufs — genau die Verwechslung, die T015168 unsichtbar machte.
mark_err()  { echo "[err]  $1" >&2; }

# [T015916] Frueher Ausstieg --frontmatter-state, gleiches Muster wie oben.
[[ -n "$FRONTMATTER_STATE_SLUG" ]] && { _plan_frontmatter_state "$FRONTMATTER_STATE_SLUG" "$REPO_DIR"; exit $?; }

# [T900226] Frueher Ausstieg --apply-completed-frontmatter (DB-frei).
[[ -n "$APPLY_COMPLETED_FRONTMATTER_FILE" ]] && { _apply_completed_frontmatter_cli "$APPLY_COMPLETED_FRONTMATTER_FILE"; }

echo "--- devflow-post-merge-finalize: Ticket $TICKET_ID ---"

# Schritt 1 — Ticket laden: unbekannte ID ist ein Fehler (Exit 1); Status
# done/archived bedeutet Idempotenz-Fall: abschliessen wird uebersprungen,
# die uebrigen Schritte laufen weiter (Archiv/Cleanup koennen offen sein).
TICKET_JSON="$(bash "$TICKET_SH" get --id "$TICKET_ID" 2>/dev/null || true)"
if [[ -z "$TICKET_JSON" ]] || ! grep -q '"external_id"' <<<"$TICKET_JSON"; then
  echo "ERROR: Schritt 1 — Ticket $TICKET_ID nicht gefunden (ticket.sh get lieferte keine Daten)." >&2
  exit 1
fi
# json_field: fuer Werte OHNE bedeutungstragende Leerzeichen (status, type, ...).
# Die sed-Klasse [:space:] entfernt jedes Leerzeichen aus dem Wert — fuer diese
# Felder folgenlos, fuer zusammengesetzte Werte NICHT. Wer ein Feld ergaenzt,
# dessen Wert Leerzeichen tragen kann, nimmt json_field_raw.
json_field() { # $1 = Feldname, $2 = JSON-Text — grep/sed statt jq (Stil: devflow-post-merge-ticket-closure.sh)
  echo "$2" | grep -o "\"$1\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -1 \
    | sed "s/\"$1\"//;s/[:\"[:space:]]//g" || true
}
# [T012243] json_field_raw: erhaelt Leerzeichen IM Wert. Nur die JSON-Syntax um
# den Wert herum wird abgetragen (Feldname, Doppelpunkt, umschliessende Quotes),
# der Inhalt bleibt unangetastet.
#
# Pflicht fuer plan_ref: der Wert hat die Form
#   "FACTORY-PLAN-REF branch=<b> plan=<p>"
# Mit json_field verschmolzen beide Felder zu einem Token, und die Extraktion
# `grep -oE 'branch=[^ ]+'` unten lieferte "<b>plan=<p>" statt "<b>". Der
# korrupte Branchname liess die branch-exakte Worktree-Aufloesung (Schritt 10)
# ins Leere laufen: sie meldete "bereits entfernt", waehrend Worktree und Branch
# liegen blieben — und zwar mit Exit 0, weil der Fehlschlag als [skip] auftrat.
# Betraf jeden Aufruf ohne explizites --branch, also den Regelpfad aus
# dev-flow-execute.
json_field_raw() { # $1 = Feldname, $2 = JSON-Text
  echo "$2" | grep -o "\"$1\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -1 \
    | sed "s/^\"$1\"[[:space:]]*:[[:space:]]*\"//; s/\"$//" || true
}
TICKET_STATUS="$(json_field status "$TICKET_JSON")"
TICKET_TYPE="$(json_field type "$TICKET_JSON")"
PLAN_REF="$(json_field_raw plan_ref "$TICKET_JSON")"
mark_ok "Schritt 1: Ticket geladen (status=$TICKET_STATUS, type=$TICKET_TYPE)"

# Schritt 2 — Branch bestimmen: --branch-Flag, sonst FACTORY-PLAN-REF aus der
# Ticket-DB (Format: "FACTORY-PLAN-REF branch=<b> plan=<pfad>"). Branch ist
# Pflicht fuer PR-Aufloesung und Cleanup — ohne ihn Abbruch.
PLAN_FILE=""
PLAN_REL=""
if [[ -n "$PLAN_REF" ]]; then
  [[ -z "$BRANCH" ]] && BRANCH="$(echo "$PLAN_REF" | grep -oE 'branch=[^ ]+' | head -1 | sed 's/^branch=//' || true)"
  PLAN_REL="$(echo "$PLAN_REF" | grep -oE 'plan=[^ ]+' | head -1 | sed 's/^plan=//' || true)"
  PLAN_FILE="$PLAN_REL"
  [[ -n "$PLAN_FILE" && "$PLAN_FILE" != /* ]] && PLAN_FILE="$REPO_DIR/$PLAN_FILE"
fi
if [[ -z "$BRANCH" ]]; then
  echo "ERROR: Schritt 2 — Kein Branch bestimmbar (--branch fehlt, FACTORY-PLAN-REF ohne branch=). Branch ist Pflicht fuer PR-Aufloesung und Cleanup." >&2
  exit 1
fi
mark_ok "Schritt 2: Branch=$BRANCH"

# Slug: aus dem Plan-Pfad (.agents/plans/<slug>/tasks.md), sonst aus dem
# Branch-Namen (Standardkonvention fix|feature|chore/<slug>-T\d{6}).
SLUG=""
[[ -n "$PLAN_FILE" ]] && SLUG="$(basename "$(dirname "$PLAN_FILE")" 2>/dev/null || true)"
[[ -z "$SLUG" ]] && SLUG="$(echo "$BRANCH" | sed -E 's/^(feature|fix|chore)\///; s/-T[0-9]{6,}$//')"
# Resolve worktree via git worktree list (branch-exact match) — der Branch
# (Schritt 2, Pflicht) identifiziert den Worktree eindeutig, unabhaengig von der
# Verzeichnis-Konvention: Dirs heiessen <branch-ohne-Typ-Praefix>-T<id>, <slug>-T<id>
# oder <slug>-reuse (Factory-Pre-Create, scripts/vda/factory-prep.sh) [T008014].
#
# [T012240] Die branch-exakte Aufloesung laeuft ZUERST. Der Slug-Kandidat deckt nur
# noch Worktrees ohne -T<id>-Suffix ab (z.B. nach `git worktree move`) und wird gegen
# den Ziel-Branch validiert: Schritt 10 fuehrt `git worktree remove --force` auf dem
# Ergebnis aus, und ein Worktree mit fremdem Branch traegt fremde, uncommittete Arbeit.
WORKTREE=""
# 1) Branch-exact: refs/heads/$BRANCH dem Worktree zuordnen
WORKTREE="$(git -C "$REPO_DIR" worktree list --porcelain | awk -v b="refs/heads/$BRANCH" '
  /^worktree / { wt=$2 }
  /^branch / && $0 == "branch " b { print wt; found=1; exit }
  END { if (!found) exit 1 }
' 2>/dev/null || true)"
# 2) Rueckfall Slug-Kandidat — nur wenn er den Ziel-Branch tatsaechlich ausgecheckt hat
if [[ -z "$WORKTREE" ]]; then
  _wt_candidate="$REPO_DIR/.worktrees/$SLUG"
  if [[ -d "$_wt_candidate" ]] \
     && [[ "$(git -C "$_wt_candidate" rev-parse --abbrev-ref HEAD 2>/dev/null || true)" == "$BRANCH" ]]; then
    WORKTREE="$_wt_candidate"
  fi
fi
# 3) Kein Worktree haelt den Branch: Slug-Pfad als Platzhalter, damit Schritt 10 seine
#    bestehende "bereits entfernt"-Meldung behaelt statt zu scheitern.
[[ -z "$WORKTREE" ]] && WORKTREE="$REPO_DIR/.worktrees/$SLUG"

# Schritt 3 — PR-Nummer: --pr-Flag, sonst gh gegen den Branch (state=merged —
# Closure erst nach bestaetigtem Merge, T001149-M1). Ohne PR laufen die
# Closure-Schritte (4–6) nicht; Archiv/Cleanup weiter.
if [[ -z "$PR_NUM" ]]; then
  PR_NUM="$(gh pr list --head "$BRANCH" --state merged --json number -q '.[0].number' 2>/dev/null || true)"
else
  PR_STATE="$(gh pr view "$PR_NUM" --json state -q .state 2>/dev/null || true)"
  if [[ "$PR_STATE" != "MERGED" ]]; then
    mark_skip "Schritt 3: PR #$PR_NUM ist nicht MERGED (state=$PR_STATE) — Closure-Schritte laufen nicht (T001149-M1)"
    PR_NUM=""
  fi
fi
if [[ -n "$PR_NUM" ]]; then
  mark_ok "Schritt 3: PR #$PR_NUM (merged)"
else
  mark_skip "Schritt 3: kein merged PR auf $BRANCH gefunden — Closure-Schritte laufen nicht (T001149-M1)"
fi

if [[ -n "$PR_NUM" ]]; then
  # Schritt 4 — PR-Link setzen: bestehender Link ist kein Fehler (idempotent).
  if bash "$TICKET_SH" add-pr-link --id "$TICKET_ID" --pr "$PR_NUM" >/dev/null 2>&1; then
    mark_ok "Schritt 4: PR-Link #$PR_NUM gesetzt"
  else
    mark_skip "Schritt 4: PR-Link bereits gesetzt oder nicht setzbar (idempotent)"
  fi

  # Schritt 5 — Ticket abschliessen: Resolution fixed bei type fix/bug, sonst
  # shipped (Dual-Vokabular wie auto-close-merged.sh); nur wenn noch offen.
  case "$TICKET_STATUS" in
    done|archived)
      mark_skip "Schritt 5: Ticket bereits $TICKET_STATUS"
      ;;
    *)
      RESOLUTION="shipped"
      [[ "$TICKET_TYPE" == "fix" || "$TICKET_TYPE" == "bug" ]] && RESOLUTION="fixed"
      if bash "$TICKET_SH" update-status --id "$TICKET_ID" --status done --resolution "$RESOLUTION" >/dev/null 2>&1; then
        mark_ok "Schritt 5: Ticket auf done ($RESOLUTION)"
      else
        echo "ERROR: Schritt 5 — update-status fehlgeschlagen (Ticket $TICKET_ID)." >&2
        exit 1
      fi
      ;;
  esac

  # Schritt 6 — verify:done-Phase-Event (Dedup ist harmlos, T001444).
  if bash "$TICKET_SH" phase "$TICKET_ID" verify done --driver devflow --detail "gate=ci result=pass" >/dev/null 2>&1; then
    mark_ok "Schritt 6: verify:done-Event gesetzt"
  else
    mark_skip "Schritt 6: verify:done nicht setzbar (Dedup harmlos)"
  fi
fi

# Schritt 7 — Plan in der Ticket-Datenbank archivieren.
# [T900999-P1] Lifecycle-Receipt: Schritt 7 schreibt das Receipt (Frontmatter +
# Check-Evidenz + Merge-SHA) nach tickets.ticket_plans. Der Receipt-Datensatz IST die
# verifizierte Archiv-Zeile (Schema: slug/branch/content/pr_number — keine separaten
# Receipt-Spalten, daher kein zweiter Write-Pfad): Frontmatter steckt im Content, der
# Merge-Bezug in pr_number, die Verifikation im Count-Check von archive-plan.
# Idempotent: ein bereits archivierter Slug wird uebersprungen (kein Duplikat).
# Fail-closed: archive-plan bricht bei DB-Schreibfehler mit Exit 1 ab (s. unten).
# KEIN Delete hier — das ist P2 (branch-reaper.sh --plan-cleanup).
if [[ -n "$PLAN_REL" && -n "$SLUG" ]]; then
  _receipt_done=0
  # Idempotenz-Vorabfrage: get-timeline meldet plan_archived-Events mit Slug.
  # Best-effort — scheitert die Abfrage, gilt "unbekannt" und es wird archiviert.
  if _receipt_tl="$(bash "$TICKET_SH" get-timeline --id "$TICKET_ID" 2>/dev/null)"; then
    if grep -q "$SLUG" <<<"$_receipt_tl" 2>/dev/null; then
      _receipt_done=1
    fi
  fi
  if [[ "$_receipt_done" -eq 1 ]]; then
    mark_skip "Schritt 7: Plan-Slug $SLUG bereits in tickets.ticket_plans archiviert (Receipt idempotent)"
  else
  _plan_source="$WORKTREE/$PLAN_REL"
  [[ -s "$_plan_source" ]] || _plan_source="$PLAN_FILE"
  if [[ -s "$_plan_source" ]]; then
    _plan_copy="$(mktemp)"
    cp "$_plan_source" "$_plan_copy"
    _apply_plan_frontmatter_completed_path "$_plan_copy"
    ARCHIVE_PLAN_ARGS=(--id "$TICKET_ID" --slug "$SLUG" --branch "$BRANCH" --plan-file "$_plan_copy")
    [[ -n "$PR_NUM" ]] && ARCHIVE_PLAN_ARGS+=(--pr "$PR_NUM")
    if bash "$TICKET_SH" archive-plan "${ARCHIVE_PLAN_ARGS[@]}" >/dev/null 2>&1; then
      # Receipt-Evidenz zusammenfuehren (alles best-effort ausser dem Archiv selbst):
      # Frontmatter-Felder aus der Plankopie, plan-lint-Verdikt, Merge-SHA aus dem
      # gemergten PR (Rueckfall: origin/main-Spitze — belegt, WORAUF gemergt wurde).
      _receipt_fm="$(grep -E '^(title|ticket_id|status):' "$_plan_copy" 2>/dev/null | tr '\n' ' ' || true)"
      _receipt_sha=""
      [[ -n "$PR_NUM" ]] && _receipt_sha="$(gh pr view "$PR_NUM" --json mergeCommit -q .mergeCommit.oid 2>/dev/null || true)"
      [[ -z "$_receipt_sha" ]] && _receipt_sha="$(git -C "$REPO_DIR" rev-parse origin/main 2>/dev/null || true)"
      _receipt_lint="$(bash "$REPO_DIR/scripts/plan-lint.sh" "$_plan_source" 2>/dev/null | tail -n 1 || true)"
      mark_ok "Schritt 7: Plan nach tickets.ticket_plans archiviert (Receipt slug=$SLUG merge=${_receipt_sha:-unbekannt} fm=[${_receipt_fm:-n/a}] lint=[${_receipt_lint:-n/a}])"
    else
      rm -f "$_plan_copy"
      echo "ERROR: Schritt 7 — archive-plan fehlgeschlagen (Ticket $TICKET_ID)." >&2
      exit 1
    fi
    rm -f "$_plan_copy"
  else
    mark_warn "Schritt 7: Plan-Pfad $PLAN_REL nicht aufloesbar"
  fi
  fi
else
  mark_skip "Schritt 7: kein FACTORY-PLAN-REF mit Plan-Pfad"
fi

# Cleanup authorization precedes lock release, removal and the remote reaper.
CLEANUP_SAFE=1
_CLEANUP_TIP="$(git -C "$REPO_DIR" rev-parse "refs/heads/$BRANCH" 2>/dev/null || true)"
if ! finalize_cleanup_safe "$REPO_DIR" "$BRANCH" "$WORKTREE" "$TICKET_ID" \
   || { git -C "$REPO_DIR" show-ref --verify --quiet "refs/heads/$BRANCH" \
        && ! finalize_branch_fully_merged "$REPO_DIR" "$BRANCH" "$PR_NUM"; } \
   || [[ "$(git -C "$REPO_DIR" rev-parse "refs/heads/$BRANCH" 2>/dev/null || true)" != "$_CLEANUP_TIP" ]]; then
  CLEANUP_SAFE=0
  mark_warn "Schritt 10: Cleanup nicht sicher belegbar — Worktree, Branch und Claims bleiben erhalten"
fi
if [[ "$CLEANUP_SAFE" == 1 ]]; then
# Schritt 9: own claims can now be released, before the generic live guard.
_CLEANUP_ANCHOR="$(dirname "$(git -C "$REPO_DIR" rev-parse --path-format=absolute --git-common-dir)")"
if ! finalize_release_owned_claims "$_CLEANUP_ANCHOR" "$BRANCH" "$TICKET_ID" \
   || { [[ -d "$WORKTREE" ]] && ! (cd "$_CLEANUP_ANCHOR" && bash "$_CLEANUP_ANCHOR/scripts/worktree-clean-check.sh" "$WORKTREE"); } \
   || ! finalize_cleanup_safe "$REPO_DIR" "$BRANCH" "$WORKTREE" "$TICKET_ID" \
   || [[ "$(git -C "$REPO_DIR" rev-parse "refs/heads/$BRANCH" 2>/dev/null || true)" != "$_CLEANUP_TIP" ]]; then
  mark_warn "Schritt 9: Session/Claim- oder Dirty-Recheck blockiert Cleanup"
  CLEANUP_SAFE=0
fi
if [[ "$CLEANUP_SAFE" == 1 ]]; then
# Schritt 10 — Worktree und Branch bereinigen (Reihenfolge: erst Worktree, dann
# lokaler Branch, dann Remote-Delete — der Merge loescht nicht mehr, T004612).
if [[ -d "$WORKTREE" ]]; then
  # [T013315/F1] Selbstloeschungs-Guard. Beobachtet im T013043-Lauf: Wurde das
  # Skript aus dem Worktree heraus aufgerufen, loeste REPO_DIR zum Worktree auf,
  # und Schritt 10 entfernte den eigenen Standbaum — Folgeausgaben "fatal:
  # cannot change to ...", getcwd-Fehler, der nachgelagerte Reaper-Lauf lief
  # ins Leere, das Skript meldete trotzdem Erfolg. Vor dem Remove daher:
  #   a) Prozess-cwd aus dem zu entfernenden Baum re-anchor auf das echte Haupt-Repo
  #      (git-common-dir gilt ueber alle Worktrees desselben Repos),
  #   b) REPO_DIR umziehen, wenn es selbst im Worktree liegt (alle Folgeschritte
  #      nutzen es als Git-Anker),
  #   c) steht die AUFRUFENDE Session im Worktree, klar warnen — ihr cwd wird
  #      durch den Remove ungueltig; der Cleanup selbst bleibt davon unberuehrt.
  MAIN_REPO_ABS="$(dirname "$(git -C "$REPO_DIR" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || echo "")")"
  if [[ -n "$MAIN_REPO_ABS" && "$MAIN_REPO_ABS" != "/" && -d "$MAIN_REPO_ABS" ]]; then
    _pwd_now="$(pwd -P)"
    if [[ "$_pwd_now" == "$WORKTREE" || "$_pwd_now" == "$WORKTREE"/* ]]; then
      echo "WARN: Prozess-cwd liegt im zu entfernenden Worktree — re-anchor auf $MAIN_REPO_ABS (T013315)" >&2
      cd "$MAIN_REPO_ABS"
    fi
    if [[ "$REPO_DIR" == "$WORKTREE" || "$REPO_DIR" == "$WORKTREE"/* ]]; then
      echo "WARN: REPO_DIR ($REPO_DIR) liegt im zu entfernenden Worktree — Folgeschritte laufen gegen $MAIN_REPO_ABS (T013315)" >&2
      REPO_DIR="$MAIN_REPO_ABS"
    fi
    if [[ "$INVOCATION_DIR" == "$WORKTREE" || "$INVOCATION_DIR" == "$WORKTREE"/* ]]; then
      mark_warn "Schritt 10: die aufrufende Session steht im entfernten Worktree ($WORKTREE) — ihr cwd wird dadurch ungueltig, ggf. neu einsteigen"
    fi
  else
    mark_warn "Schritt 10: Haupt-Repo-Pfad nicht bestimmbar — Selbstloeschungs-Guard uebersprungen (T013315)"
  fi
  if [[ "$(git -C "$REPO_DIR" rev-parse "refs/heads/$BRANCH" 2>/dev/null || true)" == "$_CLEANUP_TIP" ]] \
     && finalize_remove_clean_worktree "$REPO_DIR" "$WORKTREE"; then
    mark_ok "Schritt 10: Worktree $WORKTREE entfernt"
  else
    echo "ERROR: Schritt 10 — git worktree remove fehlgeschlagen: $WORKTREE" >&2
    exit 1
  fi
else
  # [T012256/B2] Widerspruch benennen statt verschweigen — Aufloesung in lib (T900096-P1.4).
  if _wt_holding_branch="$(finalize_holding_worktree "$REPO_DIR" "$BRANCH")"; then
    CLEANUP_SAFE=0
    mark_warn "Schritt 10: aufgeloester Pfad $WORKTREE existiert nicht, aber $_wt_holding_branch haelt $BRANCH — nicht aufgeraeumt (Aufloesung lieferte den falschen Pfad)"
  else
    mark_skip "Schritt 10: Worktree bereits entfernt"
  fi
fi

if git -C "$REPO_DIR" show-ref --verify --quiet "refs/heads/$BRANCH"; then
  if [[ "$(git -C "$REPO_DIR" rev-parse --abbrev-ref HEAD)" == "$BRANCH" ]]; then
    # T006791: Der Restore hat den geteilten Haupt-Checkout auf $BRANCH
    # zurueckgestellt — ein ausgecheckter Branch ist nicht loeschbar
    # ("cannot delete branch used by worktree"). Der lokale Branch bleibt als
    # Arbeitsbaum-Zustand erhalten; der Remote-Branch wird vom branch-reaper
    # unten entfernt (Code-Review PR #4586, Finding 2).
    mark_skip "Schritt 10: lokaler Branch $BRANCH ist im Haupt-Checkout ausgecheckt (Restore) — bleibt erhalten, Remote-Delete via branch-reaper"
  elif finalize_branch_fully_merged "$REPO_DIR" "$BRANCH" "$PR_NUM" \
       && [[ "$(git -C "$REPO_DIR" rev-parse "refs/heads/$BRANCH")" == "$_CLEANUP_TIP" ]]; then  # merge-base --is-ancestor vs origin/main (T900096)
    git -C "$REPO_DIR" branch -D "$BRANCH" && mark_ok "Schritt 10: lokaler Branch $BRANCH entfernt" || { echo "ERROR: Schritt 10 — lokaler Branch $BRANCH nicht loeschbar." >&2; exit 1; }
  else
    CLEANUP_SAFE=0
    mark_warn "Schritt 10: lokaler Branch $BRANCH traegt Commits ausserhalb origin/main — bleibt erhalten (Datenverlust-Risiko, T900096)"
    mark_skip "Schritt 10: lokaler Branch $BRANCH behalten (ungemergte Commits)"
  fi
else
  mark_skip "Schritt 10: lokaler Branch bereits entfernt"
fi

# Remote-Delete via branch-reaper.sh (Kriterien: Ticket done, keine offenen PRs,
# Blob-Gleichheit zu main — inkl. Sicherheitsnetz-Ref-Tag). Best-effort: der
# Reaper entscheidet selbst, was geloescht wird; ein Fehlschlag ist kein Abbruch.
if [[ "$CLEANUP_SAFE" != 1 ]]; then
  mark_skip "Schritt 10: branch-reaper wegen blockiertem Cleanup uebersprungen"
elif bash "$REPO_DIR/scripts/branch-reaper.sh" --ticket "$TICKET_ID" >/dev/null 2>&1; then
  mark_ok "Schritt 10: branch-reaper Lauf abgeschlossen"
else
  mark_skip "Schritt 10: branch-reaper meldete Fehler (Best-effort — Remote-Branch manuell pruefen)"
fi

fi # post-release recheck
fi # authorized cleanup
echo ""
if [[ "$WARN_COUNT" -gt 0 ]]; then
  echo "--- Finalize $TICKET_ID abgeschlossen: $DONE_COUNT erledigt, $SKIP_COUNT uebersprungen, $WARN_COUNT Warnung(en) ---"
  echo "    $WARN_COUNT Schritt(e) konnten ihre Eingabe nicht aufloesen — siehe [warn] oben. Erneut aufrufbar (idempotent)." >&2
else
  echo "--- Finalize $TICKET_ID abgeschlossen: $DONE_COUNT erledigt, $SKIP_COUNT uebersprungen, $WARN_COUNT Warnung(en) ---"
fi
# [T013315/F3] Uebersprungene Schritte explizit aufloesen — die Zahl allein las
# sich wie Erfolg lesen. Der Exit-Code bleibt 0 (Idempotenz: ein Wiederholungslauf
# nach abgeschlossenem Cleanup ist ein legitimer All-Skip-Noop, kein Fehler).
if [[ "${#SKIP_STEPS[@]}" -gt 0 ]]; then
  echo "    Uebersprungene Schritte (${#SKIP_STEPS[@]}):" >&2
  for _skipped in "${SKIP_STEPS[@]}"; do
    echo "      - $_skipped" >&2
  done
fi
[[ "$CLEANUP_SAFE" == 1 ]] || exit 1
exit 0
