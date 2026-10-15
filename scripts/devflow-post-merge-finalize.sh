#!/usr/bin/env bash
# scripts/devflow-post-merge-finalize.sh — idempotente Post-Merge-Finalisierung [T006284]
#
# Usage:
#   bash scripts/devflow-post-merge-finalize.sh --branch <branch> --plan <plan-path> [--pr <n>]
#   bash scripts/devflow-post-merge-finalize.sh --branch <branch> --no-plan [--pr <n>]   # Chore ohne Plan
#
# Deterministische Abschluss-Einheit nach einem gruenen Auto-Merge: Merge verifizieren,
# Plan lokal als completed markieren + committen, Branch-Lock freigeben, Worktree und
# Branch entfernen. Jeder Schritt ueberspringt bereits erledigte Arbeit — das Skript
# ist idempotent und damit aufrufbar vom Finalizer-Subagenten und von Recovery-Sessions.
#
# Ticket-Pfad retiriert 2026-10-14: kein ticket.sh, keine DB-Archivierung, kein
# FACTORY-PLAN-REF. Plan-Pfad und Branch kommen als Flags; Abschluss heisst
# Frontmatter-`completed` im Plan-File statt Row in tickets.ticket_plans.
#
# Hintergrund (Incident T006284/PR #4460): Der dev-flow-execute-Executor starb nach
# dem Merge an Kontext-Erschoepfung; Closure, Archiv und Cleanup blieben
# liegen und mussten manuell nachgeholt werden. Diese Einheit entfernt die Gelegenheit
# (Muster T002365/T001571), statt die Direktive zu verschaerfen.
#
# Exit-Codes:
#   0 = alle Schritte erledigt oder uebersprungen
#   1 = Fehler (die meldende Zeile nennt den Schritt)
#   2 = Usage-/Env-Fehler (kein --branch, weder --plan noch --no-plan)
#
# Reihenfolge-Garantie (T004612): Die Plan-Archivierung (Schritt 7) laeuft VOR der
# Branch-Loeschung (Schritt 10); der Fix-PR-Merge loescht den Branch bewusst nicht
# (delete_branch_on_merge=false). Closure erst nach bestaetigtem Merge (T001149-M1):
# ohne PR-Nummer laufen die Merge-abhaengigen Schritte nicht.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="${REPO_DIR:-$(cd "$HERE/.." && pwd)}"
# [T013315/F1] Invocations-cwd VOR dem ersten cd merken — Schritt 10 braucht ihn,
# um zu erkennen, dass die aufrufende Session im zu entfernenden Worktree steht
# (beobachtet im T013043-Lauf: danach "fatal: cannot change to ...", getcwd-Fehler).
INVOCATION_DIR="$PWD"
cd "$REPO_DIR"

usage() {
  cat <<'EOF'
Usage: devflow-post-merge-finalize.sh --branch <branch> (--plan <plan-path> | --no-plan) [--pr <n>]

Idempotente Post-Merge-Finalisierung (ohne Ticket-Backend):
  Merge verifizieren, Plan als completed markieren + committen, Branch-Lock
  freigeben, Worktree und Branch entfernen.

  --branch <b>    Branch (Pflicht)
  --plan <p>      Plan-Pfad, relativ zum Repo oder absolut (Pflicht ausser mit --no-plan)
  --no-plan       Chore ohne Plan: Plan-Pruefung und -Markierung entfallen
  --pr <n>        PR-Nummer (sonst aus gh gegen den Branch aufgeloest)

  --frontmatter-state <slug> [--repo <dir>]  [T015916]
                  Schreibt completed | stale nach stdout (Exit 0); fehlt
                  .agents/plans/<slug>/tasks.md → ungleich 0 ohne Ausgabe.
  --apply-completed-frontmatter <plan-file>  [T900226]
                  Setzt status in <plan-file> auf status: completed (Exit 0).

Exit: 0 = erledigt/uebersprungen, 1 = Fehler, 2 = Usage-/Env-Fehler.
EOF
}

BRANCH=""
PLAN_REL=""
NO_PLAN=0
PR_NUM=""
FRONTMATTER_STATE_SLUG=""
APPLY_COMPLETED_FRONTMATTER_FILE=""

while [[ $# -gt 0 ]]; do case "$1" in
  --help|-h) usage; exit 0 ;;
  --pr)      PR_NUM="$2"; shift 2 ;;
  --branch)  BRANCH="$2"; shift 2 ;;
  --plan)    PLAN_REL="$2"; shift 2 ;;
  --no-plan) NO_PLAN=1; shift ;;
  --frontmatter-state) FRONTMATTER_STATE_SLUG="$2"; shift 2 ;;
  --apply-completed-frontmatter) APPLY_COMPLETED_FRONTMATTER_FILE="$2"; shift 2 ;;
  --repo)    REPO_DIR="$(cd "$2" && pwd)"; cd "$REPO_DIR"; shift 2 ;;
  --ticket)  echo "ERROR: Ticket-System retiriert (2026-10-14) — nutze --branch/--plan statt --ticket." >&2; exit 2 ;;
  -*)        echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  *)         echo "Unexpected argument: $1 (Branch/Plan nur per Flag)" >&2; usage >&2; exit 2 ;;
esac; done

if [[ -z "$BRANCH" && -z "$FRONTMATTER_STATE_SLUG" && -z "$APPLY_COMPLETED_FRONTMATTER_FILE" ]]; then
  echo "ERROR: --branch fehlt." >&2
  usage >&2
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
mark_warn() { echo "[warn] $1" >&2; WARN_COUNT=$((WARN_COUNT + 1)); }
# [T015783] mark_err trennt "Schritt ist fehlgeschlagen" von den drei bisherigen
# Ausgaengen.
mark_err()  { echo "[err]  $1" >&2; }

# [T015916] Frueher Ausstieg --frontmatter-state, gleiches Muster wie oben.
[[ -n "$FRONTMATTER_STATE_SLUG" ]] && { _plan_frontmatter_state "$FRONTMATTER_STATE_SLUG" "$REPO_DIR"; exit $?; }

# [T900226] Frueher Ausstieg --apply-completed-frontmatter.
[[ -n "$APPLY_COMPLETED_FRONTMATTER_FILE" ]] && { _apply_completed_frontmatter_cli "$APPLY_COMPLETED_FRONTMATTER_FILE"; }

echo "--- devflow-post-merge-finalize: Branch $BRANCH ---"

# Schritt 1 — Eingaben verifizieren: Branch und Plan-Pfad sind Pflicht. Der Plan
# muss als Datei oder im Git-Tree aufloesbar sein — sonst Abbruch (kein stiller Skip).
PLAN_FILE="$PLAN_REL"
[[ -n "$PLAN_FILE" && "$PLAN_FILE" != /* ]] && PLAN_FILE="$REPO_DIR/$PLAN_FILE"
if [[ -z "$BRANCH" ]] || [[ -z "$PLAN_REL" && "$NO_PLAN" != 1 ]]; then
  echo "ERROR: Schritt 1 — --branch und --plan (oder --no-plan) sind Pflicht." >&2
  exit 2
fi
if [[ -n "$PLAN_REL" && "$NO_PLAN" == 1 ]]; then
  echo "ERROR: Schritt 1 — --plan und --no-plan schliessen sich aus." >&2
  exit 2
fi
if [[ "$NO_PLAN" == 1 ]]; then
  mark_ok "Schritt 1: Eingaben verifiziert (branch=$BRANCH, ohne Plan)"
elif [[ ! -s "$PLAN_FILE" ]] && ! git -C "$REPO_DIR" cat-file -e "HEAD:$PLAN_REL" 2>/dev/null; then
  echo "ERROR: Schritt 1 — Plan-Pfad $PLAN_REL weder als Datei noch im Git-Tree aufloesbar." >&2
  exit 1
else
  mark_ok "Schritt 1: Eingaben verifiziert (branch=$BRANCH, plan=$PLAN_REL)"
fi

# Schritt 2 — Slug + Worktree: Slug aus dem Plan-Pfad (.agents/plans/<slug>/tasks.md),
# sonst aus dem Branch-Namen (Konvention feature|fix|chore/<slug>). Worktree
# branch-exakt aufloesen (T008014), Rueckfall Slug-Pfad mit Branch-Validierung (T012240).
SLUG=""
[[ -n "$PLAN_FILE" ]] && SLUG="$(basename "$(dirname "$PLAN_FILE")" 2>/dev/null || true)"
[[ -z "$SLUG" || "$SLUG" == "." ]] && SLUG="$(echo "$BRANCH" | sed -E 's/^(feature|fix|chore)\///')"
WORKTREE=""
WORKTREE="$(git -C "$REPO_DIR" worktree list --porcelain | awk -v b="refs/heads/$BRANCH" '
  /^worktree / { wt=$2 }
  /^branch / && $0 == "branch " b { print wt; found=1; exit }
  END { if (!found) exit 1 }
' 2>/dev/null || true)"
if [[ -z "$WORKTREE" ]]; then
  _wt_candidate="$REPO_DIR/.worktrees/$SLUG"
  if [[ -d "$_wt_candidate" ]] \
     && [[ "$(git -C "$_wt_candidate" rev-parse --abbrev-ref HEAD 2>/dev/null || true)" == "$BRANCH" ]]; then
    WORKTREE="$_wt_candidate"
  fi
fi
[[ -z "$WORKTREE" ]] && WORKTREE="$REPO_DIR/.worktrees/$SLUG"
mark_ok "Schritt 2: Branch=$BRANCH, Slug=$SLUG"

# Schritt 3 — PR-Nummer: --pr-Flag, sonst gh gegen den Branch (state=merged —
# Closure erst nach bestaetigtem Merge, T001149-M1). Ohne PR laufen die
# Merge-abhaengigen Schritte nicht; Archiv/Cleanup weiter.
if [[ -z "$PR_NUM" ]]; then
  PR_NUM="$(gh pr list --head "$BRANCH" --state merged --json number -q '.[0].number' 2>/dev/null || true)"
else
  PR_STATE="$(gh pr view "$PR_NUM" --json state -q .state 2>/dev/null || true)"
  if [[ "$PR_STATE" != "MERGED" ]]; then
    mark_skip "Schritt 3: PR #$PR_NUM ist nicht MERGED (state=$PR_STATE) — Merge-abhaengige Schritte laufen nicht (T001149-M1)"
    PR_NUM=""
  fi
fi
if [[ -n "$PR_NUM" ]]; then
  mark_ok "Schritt 3: PR #$PR_NUM (merged)"
else
  mark_skip "Schritt 3: kein merged PR auf $BRANCH gefunden — Merge-abhaengige Schritte laufen nicht (T001149-M1)"
fi

# Schritte 4–6 (Ticket-Close/Phase-Events) entfielen mit dem Retirement.
# Abschluss-Vermerk: fehlt `verify done` in phase-events.log, warnen — NICHT erfinden.
if [[ -n "$SLUG" ]]; then
  _phase_log=""
  if [[ -d "$WORKTREE" ]]; then
    _wt_top="$(git -C "$WORKTREE" rev-parse --show-toplevel 2>/dev/null || true)"
    [[ -n "$_wt_top" && -f "$_wt_top/.agents/plans/$SLUG/phase-events.log" ]] && _phase_log="$_wt_top/.agents/plans/$SLUG/phase-events.log"
  fi
  [[ -z "$_phase_log" && -f "$REPO_DIR/.agents/plans/$SLUG/phase-events.log" ]] && _phase_log="$REPO_DIR/.agents/plans/$SLUG/phase-events.log"
  if [[ -n "$_phase_log" ]] && grep -q '^verify done' "$_phase_log" 2>/dev/null; then
    mark_ok "Schritt 4–6: verify done in phase-events.log belegt"
  else
    mark_warn "Schritt 4–6: kein verify done in phase-events.log belegbar (Log: ${_phase_log:-nicht gefunden})"
  fi
else
  mark_skip "Schritt 4–6: kein Slug bestimmbar"
fi

# Schritt 7 — Plan lokal als completed markieren + committen (statt DB-Archiv).
# Idempotent: bereits completed → Skip. Der Commit landet auf dem Feature-Branch;
# _CLEANUP_TIP wird DANACH gezogen, damit der Marker-Commit die Tip-Pruefung nicht bricht.
if [[ "$NO_PLAN" == 1 ]]; then
  mark_skip "Schritt 7: ohne Plan (--no-plan)"
elif [[ -n "$SLUG" && -d "$WORKTREE" ]]; then
  _plan_in_wt=""
  _wt_top7="$(git -C "$WORKTREE" rev-parse --show-toplevel 2>/dev/null || true)"
  if [[ -n "$_wt_top7" && -f "$_wt_top7/.agents/plans/$SLUG/tasks.md" ]]; then
    _plan_in_wt="$_wt_top7/.agents/plans/$SLUG/tasks.md"
  elif [[ -f "$WORKTREE/$PLAN_REL" ]]; then
    _plan_in_wt="$WORKTREE/$PLAN_REL"
  fi
  if [[ -n "$_plan_in_wt" ]]; then
    _fm_state="$(_plan_frontmatter_state "$SLUG" "$_wt_top7" 2>/dev/null || true)"
    if [[ "$_fm_state" == "completed" ]]; then
      mark_skip "Schritt 7: Plan bereits completed"
    else
      _plan_copy="$(mktemp)"
      cp "$_plan_in_wt" "$_plan_copy"
      _apply_completed_frontmatter_cli "$_plan_copy" >/dev/null 2>&1 || true
      cp "$_plan_copy" "$_plan_in_wt"
      rm -f "$_plan_copy"
      _rel_path="${_plan_in_wt#$_wt_top7/}"
      if git -C "$_wt_top7" add "$_rel_path" 2>/dev/null \
         && git -C "$_wt_top7" -c user.email=devflow@localhost -c user.name=devflow \
            commit -qm "chore(plans): mark $SLUG completed" 2>/dev/null; then
        mark_ok "Schritt 7: Plan als completed markiert + committet"
      else
        echo "ERROR: Schritt 7 — completed-Commit fehlgeschlagen." >&2
        exit 1
      fi
    fi
  else
    mark_warn "Schritt 7: Plan-Datei im Worktree nicht aufloesbar"
  fi
else
  mark_skip "Schritt 7: kein Worktree/Slug fuer Plan-Markierung"
fi

# Cleanup authorization precedes lock release, removal and the remote reaper.
CLEANUP_SAFE=1
_CLEANUP_TIP="$(git -C "$REPO_DIR" rev-parse "refs/heads/$BRANCH" 2>/dev/null || true)"
if ! finalize_cleanup_safe "$REPO_DIR" "$BRANCH" "$WORKTREE" \
   || { git -C "$REPO_DIR" show-ref --verify --quiet "refs/heads/$BRANCH" \
        && ! finalize_branch_fully_merged "$REPO_DIR" "$BRANCH" "$PR_NUM"; } \
   || [[ "$(git -C "$REPO_DIR" rev-parse "refs/heads/$BRANCH" 2>/dev/null || true)" != "$_CLEANUP_TIP" ]]; then
  CLEANUP_SAFE=0
  mark_warn "Schritt 10: Cleanup nicht sicher belegbar — Worktree, Branch und Claims bleiben erhalten"
fi
if [[ "$CLEANUP_SAFE" == 1 ]]; then
# Schritt 9: own claims can now be released, before the generic live guard.
_CLEANUP_ANCHOR="$(dirname "$(git -C "$REPO_DIR" rev-parse --path-format=absolute --git-common-dir)")"
if ! finalize_release_owned_claims "$_CLEANUP_ANCHOR" "$BRANCH" \
   || { [[ -d "$WORKTREE" ]] && ! (cd "$_CLEANUP_ANCHOR" && bash "$_CLEANUP_ANCHOR/scripts/worktree-clean-check.sh" "$WORKTREE"); } \
   || ! finalize_cleanup_safe "$REPO_DIR" "$BRANCH" "$WORKTREE" \
   || [[ "$(git -C "$REPO_DIR" rev-parse "refs/heads/$BRANCH" 2>/dev/null || true)" != "$_CLEANUP_TIP" ]]; then
  mark_warn "Schritt 9: Session/Claim- oder Dirty-Recheck blockiert Cleanup"
  CLEANUP_SAFE=0
fi
if [[ "$CLEANUP_SAFE" == 1 ]]; then
# Schritt 10 — Worktree und Branch bereinigen (Reihenfolge: erst Worktree, dann
# lokaler Branch, dann Remote-Delete — der Merge loescht nicht mehr, T004612).
if [[ -d "$WORKTREE" ]]; then
  # [T013315/F1] Selbstloeschungs-Guard (Kommentar wie gehabt — Logik unveraendert).
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
    # Arbeitsbaum-Zustand erhalten; der Remote-Branch wird unten direkt entfernt.
    mark_skip "Schritt 10: lokaler Branch $BRANCH ist im Haupt-Checkout ausgecheckt (Restore) — bleibt erhalten, Remote-Delete direkt"
  elif finalize_branch_fully_merged "$REPO_DIR" "$BRANCH" "$PR_NUM" \
       && [[ "$(git -C "$REPO_DIR" rev-parse --abbrev-ref HEAD)" != "$BRANCH" ]] \
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

# Remote-Delete direkt (statt branch-reaper --ticket, retiriert): nur wenn der
# lokale Branch oben entfernt wurde und der Remote-Ref noch zeigt.
if git -C "$REPO_DIR" ls-remote --heads origin "$BRANCH" 2>/dev/null | grep -q .; then
  if [[ "$CLEANUP_SAFE" == 1 ]] && ! git -C "$REPO_DIR" show-ref --verify --quiet "refs/heads/$BRANCH"; then
    if git -C "$REPO_DIR" push origin --delete "$BRANCH" >/dev/null 2>&1; then
      mark_ok "Schritt 10: Remote-Branch origin/$BRANCH entfernt"
    else
      mark_skip "Schritt 10: Remote-Delete fehlgeschlagen (Best-effort — Remote-Branch manuell pruefen)"
    fi
  else
    mark_skip "Schritt 10: Remote-Branch bleibt (Cleanup nicht sicher oder lokaler Branch erhalten)"
  fi
else
  mark_skip "Schritt 10: Remote-Branch bereits entfernt"
fi

fi # post-release recheck
fi # authorized cleanup
echo ""
echo "--- Finalize $BRANCH abgeschlossen: $DONE_COUNT erledigt, $SKIP_COUNT uebersprungen, $WARN_COUNT Warnung(en) ---"
if [[ "$WARN_COUNT" -gt 0 ]]; then
  echo "    $WARN_COUNT Schritt(e) konnten ihre Eingabe nicht aufloesen — siehe [warn] oben. Erneut aufrufbar (idempotent)." >&2
fi
# [T013315/F3] Uebersprungene Schritte explizit aufloesen (Exit-Code bleibt 0).
if [[ "${#SKIP_STEPS[@]}" -gt 0 ]]; then
  echo "    Uebersprungene Schritte (${#SKIP_STEPS[@]}):" >&2
  for _skipped in "${SKIP_STEPS[@]}"; do
    echo "      - $_skipped" >&2
  done
fi
[[ "$CLEANUP_SAFE" == 1 ]] || exit 1
exit 0
