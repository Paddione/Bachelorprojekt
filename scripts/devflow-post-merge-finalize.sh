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
cd "$REPO_DIR"

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
WARN_COUNT=0
mark_ok()   { echo "[ok]   $1"; DONE_COUNT=$((DONE_COUNT + 1)); }
mark_skip() { echo "[skip] $1"; SKIP_COUNT=$((SKIP_COUNT + 1)); }
# [T012256/B2] mark_warn trennt "Eingabe nicht aufloesbar" von "bereits erledigt".
# Beide erschienen als [skip] und zaehlten als uebersprungen; das Skript endete
# mit Exit 0 und "abgeschlossen". Genau so blieb T012243 unsichtbar: Schritt 10
# meldete "Worktree bereits entfernt", waehrend Worktree und Branch standen.
# Ein [warn] aendert den Exit-Code NICHT (der Lauf soll weiterhin nachholbar
# bleiben), erscheint aber in der Schlusszeile — der Aufrufer kann Erfolg damit
# von stillem Nichtstun unterscheiden.
mark_warn() { echo "[warn] $1" >&2; WARN_COUNT=$((WARN_COUNT + 1)); }

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
if [[ -n "$PLAN_REF" ]]; then
  [[ -z "$BRANCH" ]] && BRANCH="$(echo "$PLAN_REF" | grep -oE 'branch=[^ ]+' | head -1 | sed 's/^branch=//' || true)"
  PLAN_FILE="$(echo "$PLAN_REF" | grep -oE 'plan=[^ ]+' | head -1 | sed 's/^plan=//' || true)"
  [[ -n "$PLAN_FILE" && "$PLAN_FILE" != /* ]] && PLAN_FILE="$REPO_DIR/$PLAN_FILE"
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
  elif [[ ! -s "$PLAN_FILE" ]] && ! git cat-file -e "$BRANCH:${PLAN_FILE#"$REPO_DIR"/}" 2>/dev/null; then
    mark_skip "Schritt 7: Plan-Pfad nicht (mehr) aufloesbar — Archiv vermutlich bereits persistiert"
  else
    echo "ERROR: Schritt 7 — archive-plan fehlgeschlagen (Ticket $TICKET_ID, $PLAN_FILE)." >&2
    exit 1
  fi
fi

# [T012256/B1] _archive_lock serialisiert die Archiv-Sektion.
# Schritt 8 wechselt per `git checkout -B "$ARCHIVE_BRANCH" origin/main` den
# Branch des GETEILTEN Arbeitsbaums. Am 2026-08-18 liefen zwei Finalizer
# gleichzeitig (T012240 --pr 4738 und T012239 --pr 4737, per pgrep belegt) im
# selben Haupt-Checkout: die gestagte Archivierung des fremden Changes lag im
# Index auf dem eigenen Archiv-Branch, und der Push scheiterte an
# "cannot lock ref ... reference already exists".
# Der Lock liegt im gemeinsamen Git-Verzeichnis, gilt also ueber alle Worktrees
# desselben Repos hinweg — genau die Reichweite des geteilten Index.
# flock haelt die Sperre am offenen Dateideskriptor; sie faellt beim Prozessende
# von selbst, auch bei Abbruch. Fehlt flock, laeuft der Schritt unserialisiert
# weiter (fail-open) und sagt es — die Archivierung ist wichtiger als der Schutz
# vor einem seltenen Timing.
#
# [Code-Review PR #4744, F4] Der Lock wartet mit Timeout, nicht unbegrenzt. Der
# Absturz-Fall ist durch die FD-Semantik abgedeckt, der HAENGER-Fall nicht: ein
# Lauf, der lebt aber nicht weiterkommt, blockierte sonst jeden nachfolgenden
# Lauf dauerhaft. Laeuft der Timeout ab, wird Schritt 8 UEBERSPRUNGEN statt
# unserialisiert ausgefuehrt — der Race ist der teurere Fehler, und das Skript
# ist idempotent: der naechste Lauf holt die Archivierung nach.
# Wartezeit per DEVFLOW_ARCHIVE_LOCK_WAIT ueberschreibbar (Sekunden).
_archive_lock() {
  local common lockfile wait
  wait="${DEVFLOW_ARCHIVE_LOCK_WAIT:-300}"
  common="${GIT_COMMON_DIR:-$(git -C "$REPO_DIR" rev-parse --git-common-dir 2>/dev/null || echo "")}"
  [[ -n "$common" ]] || { mark_warn "Schritt 8: Git-Common-Dir nicht bestimmbar — Archiv-Sektion laeuft unserialisiert"; return 0; }
  lockfile="$common/devflow-finalize-archive.lock"
  if ! command -v flock >/dev/null 2>&1; then
    mark_warn "Schritt 8: flock nicht verfuegbar — Archiv-Sektion laeuft unserialisiert"
    return 0
  fi
  exec {_ARCHIVE_LOCK_FD}>"$lockfile" || {
    mark_warn "Schritt 8: Lock-Datei $lockfile nicht oeffenbar — Archiv-Sektion laeuft unserialisiert"
    return 0
  }
  if ! flock -w "$wait" "$_ARCHIVE_LOCK_FD"; then
    mark_warn "Schritt 8: Archiv-Lock nach ${wait}s nicht erhalten (anderer Finalize-Lauf haelt ihn oder haengt) — Archivierung uebersprungen, beim naechsten Lauf nachholbar"
    return 1
  fi
  return 0
}

# [T012256/B3] _archive_already_done prueft den ZIELZUSTAND, nicht die Existenz
# des Archiv-Branches.
# Der bisherige Check war `git ls-remote --heads origin "$ARCHIVE_BRANCH"`. Er
# erkennt "Archiv-PR noch offen", nicht "Archiv-PR gemergt und Remote-Branch
# geloescht" — einen Zustand, den Schritt 8 unten per
# `gh pr merge --auto --squash --delete-branch` regelmaessig SELBST herstellt.
# Belegt am 2026-08-18: PR #4740 (chore/plan-archive-finalizer-resolve-worktree-
# by-branch-T012240) ist MERGED, `git ls-remote --exit-code --heads origin
# <branch>` liefert 2. Ein Wiederholungslauf mit noch vorhandenem lokalem
# Change-Ordner hielt den Schritt deshalb fuer unerledigt und archivierte erneut.
# Der Finalizer ist laut openspec/specs/agent-skills.md als idempotente Einheit
# spezifiziert; der Wiederholungslauf nach Abbruch ist sein Zweck.
#
# Drei Signale, jedes fuer sich hinreichend:
#   1. Archiv-Branch liegt noch remote  -> Archivierung laeuft, PR offen
#   2. Archiv-Verzeichnis liegt auf origin/main -> Zielzustand erreicht; bleibt
#      auch nach dem Loeschen des Archiv-Branches wahr
#   3. Ein Archiv-PR auf diesen Branch ist gemergt -> zweites Signal fuer (2)
_archive_already_done() {
  git ls-remote --exit-code --heads origin "$ARCHIVE_BRANCH" >/dev/null 2>&1 && return 0
  # Exakter Vergleich auf <datum>-<slug>, KEIN Suffix-Match. `grep -- "-${SLUG}$"`
  # traf am 2026-08-18 fuer SLUG=hardening sechs fremde Eintraege (u.a.
  # 2026-08-14-blocker-gate-hardening) — ein nie archivierter Change haette als
  # erledigt gegolten und waere nie archiviert worden. Ein kurzer oder generischer
  # Slug ist der Normalfall, nicht die Ausnahme (Code-Review PR #4744, F1).
  # Der Vergleich laeuft in bash statt per Regex: der Slug muesste sonst
  # maskiert werden, und ein vergessenes Escape brächte die Fehlerklasse zurueck.
  local _entry _base
  while IFS= read -r _entry; do
    [[ -n "$_entry" ]] || continue
    _base="${_entry##*/}"
    # Datumspraefix YYYY-MM-DD- abtrennen; der Rest muss der Slug SELBST sein.
    if [[ "$_base" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}-(.+)$ ]]; then
      [[ "${BASH_REMATCH[1]}" == "$SLUG" ]] && return 0
    # 9 der Archiv-Verzeichnisse stammen aus der Zeit vor der Datumskonvention
    # (mishap-t002407, k1-vektorspeicher, t001537, ...). Ohne diesen Zweig fielen
    # sie durchs Raster: Signal 2 meldete "nicht archiviert", und griffen auch
    # Signal 1 und 3 nicht, archivierte Schritt 8 erneut — der Fehler, den B3
    # gerade beheben soll (Code-Review PR #4744, Re-Review).
    elif [[ "$_base" == "$SLUG" ]]; then
      return 0
    fi
  done < <(git ls-tree -d --name-only "origin/main" "openspec/changes/archive/" 2>/dev/null || true)
  [[ -n "$(gh pr list --head "$ARCHIVE_BRANCH" --state merged --json number -q '.[0].number' 2>/dev/null || true)" ]] && return 0
  return 1
}

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
  ARCHIVE_BRANCH="chore/plan-archive-${SLUG//\//-}-${TICKET_ID}"
  if _archive_already_done; then
    mark_skip "Schritt 8: OpenSpec-Archiv fuer $SLUG bereits erledigt (Archiv-Branch remote, Archiv auf origin/main oder Archiv-PR gemergt) — uebersprungen (idempotent)"
  elif ! _archive_lock; then
    : # _archive_lock hat bereits gewarnt; Archivierung dieses Laufs entfaellt
  else
    # T006791: Vor der Archiv-Sektion den aktuellen Branch merken — die Sektion
    # wechselt per checkout -B den Branch des geteilten Arbeitsbaums (Worktree
    # oder Haupt-Checkout); der Restore in der Subshell-Trap stellt ihn nach der
    # Sektion wieder her (auch auf Fehlerpfaden, T002357-Fallenklasse). Zusaetzlich
    # die SHA merken: auf detached HEAD liefert rev-parse --abbrev-ref HEAD nur
    # "HEAD" und waere als Restore-Ziel unbrauchbar (Code-Review PR #4586).
    ARCHIVE_PREV_BRANCH="$(git -C "$ARCHIVE_DIR" rev-parse --abbrev-ref HEAD)"
    ARCHIVE_PREV_SHA="$(git -C "$ARCHIVE_DIR" rev-parse HEAD 2>/dev/null || true)"
    (
      cd "$ARCHIVE_DIR"
      # [T006371] Fail-closed in der Subshell: set -e macht eine fehlgeschlagene
      # Regeneration oder Verifikation zum Abbruch statt stillem Weitermarsch —
      # die Subshell erbt zwar bereits set -euo pipefail vom Skript, das
      # explizite set -e dokumentiert die Härtung fuer die Archiv-Sektion
      # (PR #4529/#4533).
      set -e
      # T006791: Restore bei jedem Sektions-Ende — Happy-Path (nach Push/PR) und
      # Fehlerpfade (Subshell exit 1) hinterlassen den Arbeitsbaum auf dem
      # gemerkten Branch. Ownership-Guard (Code-Review PR #4586): Restore nur,
      # wenn der Arbeitsbaum tatsaechlich auf dem Archiv-Branch steht — hat eine
      # parallele Session zwischenzeitlich gewechselt (T002357), bleibt deren
      # Wechsel unangetastet (WARN statt Restore). Detached HEAD wird ueber die
      # gemerkte SHA zurueckgeholt (--detach). Restore-Fehler enden mit Exit 1
      # statt still Erfolg zu melden.
      _restore_prev_branch() {
        local _prev_rc=$?
        local _cur_branch
        _cur_branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
        if [[ "$_cur_branch" == "$ARCHIVE_BRANCH" ]]; then
          if [[ "$ARCHIVE_PREV_BRANCH" == "HEAD" && -n "$ARCHIVE_PREV_SHA" ]]; then
            if git checkout --detach "$ARCHIVE_PREV_SHA" >/dev/null 2>&1; then
              echo "Schritt 8: Branch-Restore auf detached $ARCHIVE_PREV_SHA ausgefuehrt (T006791)"
            else
              # Code-Review PR #4586 (Finding 12): nicht behaupten, wo der Baum
              # steht — der Restore kann aus unverwandtem Grund scheitern; der
              # Zustand ist zu pruefen. Lock-Hinweis (Finding 6): bei Restore-
              # Fehler bricht das Skript hier ab und der Lock bleibt zurueck.
              echo "FATAL: Branch-Restore (detached) fehlgeschlagen — Arbeitsbaum-Zustand manuell pruefen, Lock ggf. raeumen (T006791)" >&2
              _restore_failed=1
            fi
          elif [[ "$ARCHIVE_PREV_BRANCH" != "HEAD" ]]; then
            if git checkout "$ARCHIVE_PREV_BRANCH" >/dev/null 2>&1; then
              echo "Schritt 8: Branch-Restore auf $ARCHIVE_PREV_BRANCH ausgefuehrt (T006791)"
            else
              echo "FATAL: Branch-Restore auf $ARCHIVE_PREV_BRANCH fehlgeschlagen — Arbeitsbaum-Zustand manuell pruefen, Lock ggf. raeumen (T006791)" >&2
              _restore_failed=1
            fi
          fi
          # Code-Review PR #4586 (Finding 5): Restore-Fehler aufklären — status
          # zeigt, welche Änderungen den Wechsel blockieren (z. B. staged Move
          # zwischen openspec.sh archive und git commit bei pre-commit-Fehler).
          if [[ "${_restore_failed:-0}" == 1 ]]; then
            git status --short >&2
          fi
        elif [[ "$_cur_branch" != "$ARCHIVE_PREV_BRANCH" ]]; then
          echo "WARN: Arbeitsbaum steht auf $_cur_branch statt $ARCHIVE_BRANCH — paralleler Wechsel, Restore uebersprungen (T006791)" >&2
        fi
        exit "$_prev_rc"
      }
      trap _restore_prev_branch EXIT
      # Order-Swap (Code-Review PR #4586): ERST auf den Archiv-Branch wechseln
      # (von origin/main abzweigen, T002256), DANN archivieren und direkt auf
      # dem Archiv-Branch committen — kein Streu-Commit auf dem Pre-Switch-
      # Branch, kein cherry-pick (der auf einem dirty Baum oder einem bereits
      # gemergten Commit verweigern kann).
      git fetch origin main
      git checkout -B "$ARCHIVE_BRANCH" origin/main
      bash scripts/openspec.sh archive "$SLUG"
      # Freshness: openspec.sh regeneriert openspec-status.json nach dem Move —
      # Regeneration und explizites Staging nach plan-archive-steps (T002252).
      # [T006371] Ohne `|| true`: eine fehlgeschlagene Regeneration bricht die
      # Subshell ab (set -e), statt den Archiv-Branch ohne frische Status-Map
      # zu pushen (PR #4529/#4533).
      # Pfade seit T006999 (p4): website/ -> components/website/.
      task freshness:regenerate
      git add openspec/changes/ openspec/changes/archive/ openspec/specs/ components/website/src/data/openspec-status.json
      git add -u -- components/website/src/data components/website/src/lib components/website/public/learning-assets docs
      git commit -m "chore(plans): archive $SLUG → postgres + openspec/archive [$TICKET_ID]"
      # Pre-Push-Freshness-Verifikation (T006371): freshness:check diffet die
      # regenerierten Artefakte gegen HEAD. Meldet er Drift, werden die
      # regenerierten Artefakte gestaged und der Archiv-Commit geamendet —
      # BEVOR der Push den Archiv-Branch nach aussen traegt (T002252-Muster
      # "regenerated but not staged", PR #4529/#4533).
      if ! task freshness:check; then
        echo "freshness:check meldet Drift — regenerierte Artefakte stagen und Archiv-Commit amenden" >&2
        git add openspec/changes/ openspec/changes/archive/ openspec/specs/ components/website/src/data/openspec-status.json
        git add -u -- components/website/src/data components/website/src/lib components/website/public/learning-assets docs
        git commit --amend --no-edit
        task freshness:check
      fi
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
  # [T012256/B2] "Pfad existiert nicht" heisst nicht "aufgeraeumt". Haelt noch
  # ein Worktree $BRANCH, waehrend der aufgeloeste Pfad fehlt, widerspricht sich
  # der Zustand: die Aufloesung hat den falschen Pfad geliefert, und der echte
  # Worktree bleibt liegen. Genau so trat T012243 auf — Schritt 10 meldete
  # "bereits entfernt", waehrend Worktree UND Branch standen, und der Lauf endete
  # mit Exit 0. Der Widerspruch wird jetzt benannt statt verschwiegen.
  _wt_holding_branch="$(git -C "$REPO_DIR" worktree list --porcelain 2>/dev/null | awk -v b="refs/heads/$BRANCH" '
    /^worktree / { wt=$2 }
    /^branch / && $0 == "branch " b { print wt; found=1; exit }
    END { if (!found) exit 1 }
  ' || true)"
  if [[ -n "$_wt_holding_branch" ]]; then
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
  elif git -C "$REPO_DIR" branch -D "$BRANCH"; then
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
if [[ "$WARN_COUNT" -gt 0 ]]; then
  echo "--- Finalize $TICKET_ID abgeschlossen: $DONE_COUNT erledigt, $SKIP_COUNT uebersprungen, $WARN_COUNT Warnung(en) ---"
  echo "    $WARN_COUNT Schritt(e) konnten ihre Eingabe nicht aufloesen — siehe [warn] oben. Erneut aufrufbar (idempotent)." >&2
else
  echo "--- Finalize $TICKET_ID abgeschlossen: $DONE_COUNT erledigt, $SKIP_COUNT uebersprungen, $WARN_COUNT Warnung(en) ---"
fi
exit 0
