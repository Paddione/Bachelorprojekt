#!/usr/bin/env bash
# scripts/devflow-post-merge-finalize.sh — idempotente Post-Merge-Finalisierung [T006284]
#
# Usage:
#   bash scripts/devflow-post-merge-finalize.sh <ticket-id> [--pr <n>] [--branch <branch>]
#
# Deterministische Abschluss-Einheit nach einem gruenen Auto-Merge: PR-Link setzen,
# Ticket auf done (Resolution fixed/shipped), verify:done-Phase-Event, Plan nach
# tickets.ticket_plans archivieren, OpenSpec-Change archivieren (inkl. Archiv-PR),
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
# Reihenfolge-Garantie (T004612): Die Archivierung (Schritt 7/8) laeuft VOR der
# Branch-Loeschung (Schritt 10); der Fix-PR-Merge loescht den Branch bewusst nicht
# (delete_branch_on_merge=false). Closure erst nach bestaetigtem Merge (T001149-M1):
# ohne PR-Nummer laufen die Closure-Schritte nicht.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="${REPO_DIR:-$(cd "$HERE/.." && pwd)}"
TICKET_SH="$REPO_DIR/scripts/ticket.sh"

usage() {
  cat <<'EOF'
Usage: devflow-post-merge-finalize.sh <ticket-id> [--pr <n>] [--branch <branch>]

Idempotente Post-Merge-Finalisierung fuer ein Ticket:
  PR-Link setzen, Ticket auf done (fixed/shipped), verify:done-Phase-Event,
  Plan nach tickets.ticket_plans archivieren, OpenSpec-Change archivieren
  (inkl. Archiv-PR), Branch-Lock freigeben, Worktree und Branch entfernen.

  --pr <n>        PR-Nummer (sonst aus gh gegen den Branch aufgeloest)
  --branch <b>    Branch (sonst aus dem FACTORY-PLAN-REF-Kommentar des Tickets)

Exit: 0 = erledigt/uebersprungen, 1 = Fehler, 2 = Usage-/Env-Fehler.
EOF
}

TICKET_ID=""
PR_NUM=""
BRANCH=""

while [[ $# -gt 0 ]]; do case "$1" in
  --help|-h) usage; exit 0 ;;
  --pr)      PR_NUM="$2"; shift 2 ;;
  --branch)  BRANCH="$2"; shift 2 ;;
  -*)        echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  *)         if [[ -z "$TICKET_ID" ]]; then TICKET_ID="$1"; shift
             else echo "Unexpected argument: $1" >&2; usage >&2; exit 2; fi ;;
esac; done

if [[ -z "$TICKET_ID" ]]; then
  echo "ERROR: Ticket-ID fehlt." >&2
  usage >&2
  exit 2
fi

if [[ -n "${TICKET_OFFLINE:-}" ]]; then
  echo "ERROR: Finalize-Skript benoetigt Cluster-/DB-Zugriff (ticket.sh); TICKET_OFFLINE ist gesetzt." >&2
  exit 2
fi

DONE_COUNT=0
SKIP_COUNT=0
mark_ok()   { echo "[ok]   $1"; DONE_COUNT=$((DONE_COUNT + 1)); }
mark_skip() { echo "[skip] $1"; SKIP_COUNT=$((SKIP_COUNT + 1)); }

echo "--- devflow-post-merge-finalize: Ticket $TICKET_ID ---"

# Schritt 1 — Ticket laden: unbekannte ID ist ein Fehler (Exit 1); Status
# done/archived bedeutet Idempotenz-Fall: abschliessen wird uebersprungen,
# die uebrigen Schritte laufen weiter (Archiv/Cleanup koennen offen sein).
TICKET_JSON="$(bash "$TICKET_SH" get --id "$TICKET_ID" 2>/dev/null || true)"
if [[ -z "$TICKET_JSON" ]] || ! grep -q '"external_id"' <<<"$TICKET_JSON"; then
  echo "ERROR: Schritt 1 — Ticket $TICKET_ID nicht gefunden (ticket.sh get lieferte keine Daten)." >&2
  exit 1
fi
json_field() { # $1 = Feldname, $2 = JSON-Text — grep/sed statt jq (Stil: devflow-post-merge-ticket-closure.sh)
  echo "$2" | grep -o "\"$1\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -1 \
    | sed "s/\"$1\"//;s/[:\"[:space:]]//g" || true
}
TICKET_STATUS="$(json_field status "$TICKET_JSON")"
TICKET_TYPE="$(json_field type "$TICKET_JSON")"
PLAN_REF="$(json_field plan_ref "$TICKET_JSON")"
mark_ok "Schritt 1: Ticket geladen (status=$TICKET_STATUS, type=$TICKET_TYPE)"

# Schritt 2 — Branch bestimmen: --branch-Flag, sonst FACTORY-PLAN-REF aus der
# Ticket-DB (Format: "FACTORY-PLAN-REF branch=<b> plan=<pfad>"). Branch ist
# Pflicht fuer PR-Aufloesung und Cleanup — ohne ihn Abbruch.
PLAN_FILE=""
if [[ -n "$PLAN_REF" ]]; then
  [[ -z "$BRANCH" ]] && BRANCH="$(echo "$PLAN_REF" | grep -oE 'branch=[^ ]+' | head -1 | sed 's/^branch=//' || true)"
  PLAN_FILE="$(echo "$PLAN_REF" | grep -oE 'plan=[^ ]+' | head -1 | sed 's/^plan=//' || true)"
fi
if [[ -z "$BRANCH" ]]; then
  echo "ERROR: Schritt 2 — Kein Branch bestimmbar (--branch fehlt, FACTORY-PLAN-REF ohne branch=). Branch ist Pflicht fuer PR-Aufloesung und Cleanup." >&2
  exit 1
fi
mark_ok "Schritt 2: Branch=$BRANCH"

# Slug: aus dem Plan-Pfad (openspec/changes/<slug>/tasks.md), sonst aus dem
# Branch-Namen (Standardkonvention fix|feature|chore/<slug>-T\d{6}).
SLUG=""
[[ -n "$PLAN_FILE" ]] && SLUG="$(basename "$(dirname "$PLAN_FILE")" 2>/dev/null || true)"
[[ -z "$SLUG" ]] && SLUG="$(echo "$BRANCH" | sed -E 's/^(feature|fix|chore)\///; s/-T[0-9]{6,}$//')"
WORKTREE="$REPO_DIR/.worktrees/$SLUG"

# Schritt 3 — PR-Nummer: --pr-Flag, sonst gh gegen den Branch (state=merged —
# Closure erst nach bestaetigtem Merge, T001149-M1). Ohne PR laufen die
# Closure-Schritte (4–6) nicht; Archiv/Cleanup weiter.
if [[ -z "$PR_NUM" ]]; then
  PR_NUM="$(gh pr list --head "$BRANCH" --state merged --json number -q '.[0].number' 2>/dev/null || true)"
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

# Schritt 7 — Plan nach tickets.ticket_plans archivieren. Ohne plan_ref oder
# nicht mehr aufloesbaren Plan-Pfad: [skip] (Archiv aus DB-Daten persistiert).
if [[ -z "$PLAN_FILE" || -z "$SLUG" ]]; then
  mark_skip "Schritt 7: kein FACTORY-PLAN-REF mit Plan-Pfad — Plan-Archiv uebersprungen"
else
  # Frontmatter auf completed setzen, BEVOR der Inhalt archiviert wird (plan-archive-steps).
  # Best-effort: die Datei liegt im Worktree oder nur im Branch-Commit (T004269).
  [[ -s "$PLAN_FILE" ]] && sed -E -i 's/^status: (active|plan_staged|in_progress|planning)$/status: completed/' "$PLAN_FILE" 2>/dev/null || true
  ARCHIVE_PLAN_ARGS=(--id "$TICKET_ID" --slug "$SLUG" --branch "$BRANCH" --plan-file "$PLAN_FILE")
  [[ -n "$PR_NUM" ]] && ARCHIVE_PLAN_ARGS+=(--pr "$PR_NUM")
  if bash "$TICKET_SH" archive-plan "${ARCHIVE_PLAN_ARGS[@]}" >/dev/null 2>&1; then
    mark_ok "Schritt 7: Plan nach tickets.ticket_plans archiviert"
  elif [[ ! -s "$PLAN_FILE" ]] && ! git cat-file -e "$BRANCH:$PLAN_FILE" 2>/dev/null; then
    mark_skip "Schritt 7: Plan-Pfad nicht (mehr) aufloesbar — Archiv vermutlich bereits persistiert"
  else
    echo "ERROR: Schritt 7 — archive-plan fehlgeschlagen (Ticket $TICKET_ID, $PLAN_FILE)." >&2
    exit 1
  fi
fi

# Schritt 8 — OpenSpec-Change archivieren (delta-merge + Verschiebung ins Archiv)
# inklusive Archiv-PR (Mechanik: plan-archive-steps.md). Der Change-Ordner lebt
# im Worktree (Branch-Zustand) oder im Haupt-Checkout; die git-Operationen laufen
# dort, wo er liegt (Worktrees teilen sich .git). Bereits archiviert → [skip].
if [[ -z "$SLUG" ]]; then
  mark_skip "Schritt 8: kein Slug bestimmbar — OpenSpec-Archiv uebersprungen"
elif [[ -d "$WORKTREE/openspec/changes/$SLUG" ]]; then
  ARCHIVE_DIR="$WORKTREE"
elif [[ -d "$REPO_DIR/openspec/changes/$SLUG" ]]; then
  ARCHIVE_DIR="$REPO_DIR"
else
  mark_skip "Schritt 8: Change-Ordner openspec/changes/$SLUG existiert nicht mehr (bereits archiviert?)"
fi

if [[ -n "${ARCHIVE_DIR:-}" ]]; then
  (
    cd "$ARCHIVE_DIR"
    bash scripts/openspec.sh archive "$SLUG"
    # Freshness: openspec.sh regeneriert openspec-status.json nach dem Move —
    # Regeneration und explizites Staging nach plan-archive-steps (T002252).
    task freshness:regenerate >/dev/null 2>&1 || true
    git add openspec/changes/ openspec/changes/archive/ openspec/specs/ website/src/data/openspec-status.json
    git add -u -- website/src/data website/src/lib website/public/learning-assets docs
    git commit -m "chore(plans): archive $SLUG → postgres + openspec/archive [$TICKET_ID]"
    ARCHIVE_COMMIT="$(git rev-parse HEAD)"
    # Der Archiv-Branch MUSS von origin/main abzweigen, nicht vom Fix-Branch
    # (T002256) — squash-and-merge hinterlaesst den Fix-Branch am Pre-Squash-Stand.
    ARCHIVE_BRANCH="chore/plan-archive-${SLUG//\//-}-${TICKET_ID}"
    git fetch origin main
    git checkout -B "$ARCHIVE_BRANCH" origin/main
    git cherry-pick "$ARCHIVE_COMMIT"
    git push -u origin "$ARCHIVE_BRANCH"
    # PR-Erstellung mit Assert (verhindert ungebuendelte Archiv-Branches, T001331)
    ARCHIVE_PR_URL="$(gh pr create \
      --title "chore(plans): archive $SLUG → postgres + openspec/archive [$TICKET_ID]" \
      --body "Automatischer Archiv-PR für $SLUG (Ticket $TICKET_ID). Plan wurde nach postgres archiviert." \
      --head "$ARCHIVE_BRANCH" \
      --base main)"
    [[ -n "$ARCHIVE_PR_URL" ]] || { echo "FATAL: gh pr create returned empty URL for $ARCHIVE_BRANCH" >&2; exit 1; }
    # Push-Verification vor Auto-Merge (T001268)
    REMOTE_SHA="$(git ls-remote origin "refs/heads/$ARCHIVE_BRANCH" | cut -f1)"
    LOCAL_SHA="$(git rev-parse HEAD)"
    [[ "$REMOTE_SHA" = "$LOCAL_SHA" ]] || { echo "FATAL: remote SHA ($REMOTE_SHA) != local SHA ($LOCAL_SHA)" >&2; exit 1; }
    gh pr merge --auto --squash --delete-branch "$ARCHIVE_PR_URL"
  )
  mark_ok "Schritt 8: OpenSpec-Change archiviert (Archiv-PR erstellt)"
fi

# Schritt 9 — Branch-Lock freigeben: nur wenn der Claim dieser Session gehoert
# (agent-lock.sh check == mine); fremde/fehlende Claims bleiben liegen (T003102).
LOCK_STATE="$(bash "$REPO_DIR/scripts/agent-lock.sh" check branch "$BRANCH" 2>/dev/null | head -1 || true)"
case "$LOCK_STATE" in
  mine*)
    if bash "$REPO_DIR/scripts/agent-lock.sh" release branch "$BRANCH" >/dev/null 2>&1; then
      mark_ok "Schritt 9: Branch-Lock freigegeben"
    else
      mark_skip "Schritt 9: Lock-Release fehlgeschlagen — Lock bleibt liegen (manuell pruefen)"
    fi
    ;;
  free*)
    mark_skip "Schritt 9: kein Branch-Lock vorhanden"
    ;;
  "")
    mark_skip "Schritt 9: Lock-Zustand nicht ermittelbar (agent-lock.sh offline?)"
    ;;
  *)
    mark_skip "Schritt 9: Lock gehoert nicht dieser Session — bleibt liegen (T003102)"
    ;;
esac

# Schritt 10 — Worktree und Branch bereinigen (Reihenfolge: erst Worktree, dann
# lokaler Branch, dann Remote-Delete — der Merge loescht nicht mehr, T004612).
if [[ -d "$WORKTREE" ]]; then
  if git -C "$REPO_DIR" worktree remove "$WORKTREE" --force; then
    mark_ok "Schritt 10: Worktree $WORKTREE entfernt"
  else
    echo "ERROR: Schritt 10 — git worktree remove fehlgeschlagen: $WORKTREE" >&2
    exit 1
  fi
else
  mark_skip "Schritt 10: Worktree bereits entfernt"
fi

if git -C "$REPO_DIR" show-ref --verify --quiet "refs/heads/$BRANCH"; then
  if git -C "$REPO_DIR" branch -D "$BRANCH"; then
    mark_ok "Schritt 10: lokaler Branch $BRANCH entfernt"
  else
    echo "ERROR: Schritt 10 — lokaler Branch $BRANCH nicht loeschbar." >&2
    exit 1
  fi
else
  mark_skip "Schritt 10: lokaler Branch bereits entfernt"
fi

# Remote-Delete via branch-reaper.sh (Kriterien: Ticket done, keine offenen PRs,
# Blob-Gleichheit zu main — inkl. Sicherheitsnetz-Ref-Tag). Best-effort: der
# Reaper entscheidet selbst, was geloescht wird; ein Fehlschlag ist kein Abbruch.
if bash "$REPO_DIR/scripts/branch-reaper.sh" --ticket "$TICKET_ID" >/dev/null 2>&1; then
  mark_ok "Schritt 10: branch-reaper Lauf abgeschlossen"
else
  mark_skip "Schritt 10: branch-reaper meldete Fehler (Best-effort — Remote-Branch manuell pruefen)"
fi

echo ""
echo "--- Finalize $TICKET_ID abgeschlossen: $DONE_COUNT erledigt, $SKIP_COUNT uebersprungen ---"
exit 0
