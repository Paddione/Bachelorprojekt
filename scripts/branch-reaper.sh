#!/usr/bin/env bash
# scripts/branch-reaper.sh — Löscht verwaiste Remote-Branches nach Ticket-Abschluss. [T002520]
#
# Usage:
#   bash scripts/branch-reaper.sh --ticket T002520 [--dry-run] [--remote origin] [--repo .]
#   bash scripts/branch-reaper.sh --dry-run                            # ticketloser Sweep (lesend)
#   bash scripts/branch-reaper.sh --sweep [--dry-run] [--remote ...]   # loeschender Sweep
#
# Warum es dieses Skript gibt:
#   Seit T004612 löscht der Merge-Flow Branches bewusst NICHT mehr (delete_branch_on_merge=false,
#   kein --delete-branch im Fix-PR-Merge — das OpenSpec-Archiv braucht den Branch nach dem Merge).
#   Der Reaper ist damit nicht mehr nur Netz für Sammel-PR-Branches (Plan- und Factory-Branches
#   laufen über einen Sammel-PR nach main — auf ihrem eigenen Ref findet nie ein Merge-Event
#   statt), sondern der reguläre Aufräumer für ALLE gemergten Branches. Am 2026-08-01 lagen so
#   24 PR-lose Branches auf origin.
#
# Löschkriterium — ALLE vier Bedingungen müssen gelten:
#   1. Branch trägt die Ticket-ID im Namen (case-insensitiv)
#   2. kein offener PR auf dem Branch
#   3. Ticket-Status in (done, archived)
#   4. JEDE Blob-Abweichung zu <remote>/main matcht die ALLOWLIST unten
#
#   Beide Signale sind nötig. An den 20 real gereapten Branches gemessen: "Blob-Diff muss leer
#   sein" hätte 1 von 20 erfasst (wirkungslos), "Ticket done genügt" hätte auch die einzige
#   Kopie eines nie gemergten Deliverables gelöscht (T002431).
#
#   Positiv-Signale [T007032]: Ein gemergter PR (headRefOid == Remote-Tip des Branches) bzw.
#   ein Nachfolge-Branch mit MERGED-PR und identischen Blobs über die gesamte Divergenzmenge
#   ist ein Positiv-Signal: der Blob-Abweichungs-Check entfällt für den Branch, weil sein
#   Inhalt nachweislich in main angekommen ist. Unverifizierbar (gh-Ausfall, kein MERGED-PR)
#   heisst verschonen — der Blob-Check entscheidet dann wie bisher.
#
# Ausgabe (der Vertrag, auf den tests/spec/ci-cd/branch-reaper.bats zugreift):
#   REAP <branch>            — Kandidat, wird ohne --dry-run gelöscht
#   KEEP <branch> — <grund>  — verschont, mit Begründung
#   DELETED <branch> …       — Remote-Branch gelöscht; bei SHA-Gleichheit wird der lokale
#                              Ref mitentfernt und das in derselben Zeile vermerkt
#   KEEP local <branch> …    — lokaler Ref verschont (abweichende SHA oder nicht löschbar),
#                              der Remote-Teil wurde trotzdem gelöscht [T003182]
#
# Sicherheitsnetz:
#   Vor jedem Delete wird der Branch-SHA als refs/tags/reaped/<branch> gepusht. Schlägt der
#   Tag-Push fehl, wird NICHT gelöscht — das Netz ist Vorbedingung, nicht Beiwerk.
#
# Environment:
#   TICKET_SH — Pfad zum ticket.sh-Aufruf (Default: <repo>/scripts/ticket.sh). Existiert für
#               die Testbarkeit: der BATS-Test hängt hier einen Stub ein, statt einen Cluster
#               zu brauchen.
#   BRAND, TICKET_CTX — an ticket.sh durchgereicht.
#
# Exit: 0 im Normalfall (auch wenn nichts zu tun war), 2 bei Argumentfehlern.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$HERE/.." && pwd)"

# Pfade, deren Abweichung von main folgenlos ist: Plan-Artefakte, die nie einzeln nach main
# wandern, und generierte Dateien, die auf main ohnehin fortgeschrieben werden.
ALLOWLIST=(
  'openspec/changes/*'
  'docs/code-quality/*'
  'components/website/src/data/*'
  '.release-please-manifest.json'
  'components/website/CHANGELOG.md'
  'components/website/package.json'
)

TICKET_ID=""
DRY_RUN=0
SWEEP=0
REMOTE="origin"
TARGET_REPO="$PWD"

# Positiv-Signal-Zustand [T007032]: MERGED_HEADS wird einmalig und lazy geladen (eine
# gh-Abfrage pro Lauf, nur wenn ein Kandidat das Nachfolge-Signal braucht); DIVERGENT ist
# die Divergenzmenge des aktuellen Kandidaten, von Positiv-Signal 2 und dem
# Allowlist-Check gemeinsam genutzt (keine Doppelberechnung).
MERGED_HEADS=()
MERGED_HEADS_LOADED=0
DIVERGENT=()

usage() {
  echo "Usage: branch-reaper.sh [--ticket T######] [--dry-run] [--sweep] [--remote <name>] [--repo <pfad>]" >&2
  echo "  --ticket T######   Einzel-Ticket-Lauf (Post-Merge-Pfad)" >&2
  echo "  --dry-run          Nur anzeigen, nichts loeschen. Ohne --ticket: ticketloser Inspektionsblick ueber ALLE Remote-Branches." >&2
  echo "  --sweep            Loeschender Sweep ueber ALLE Remote-Branches (braucht KEIN --ticket)" >&2
}

while [[ $# -gt 0 ]]; do case "$1" in
  --ticket)  TICKET_ID="${2:-}"; shift 2 ;;
  --dry-run) DRY_RUN=1; shift ;;
  --sweep)   SWEEP=1; shift ;;
  --remote)  REMOTE="${2:-}"; shift 2 ;;
  --repo)    TARGET_REPO="${2:-}"; shift 2 ;;
  -h|--help) usage; exit 0 ;;
  *) echo "FEHLER: unbekanntes Argument '$1'" >&2; usage; exit 2 ;;
esac; done

# --ticket + --sweep schliessen sich aus: der Einzel-Ticket-Lauf und der
# Batch-Sweep haben unterschiedliche Auswahl-Logiken und einen gegenlaeufigen
# Ticket-ID-Vertrag (einmal vom Aufrufer, einmal aus dem Branch-Namen).
if [ -n "$TICKET_ID" ] && [ "$SWEEP" -eq 1 ]; then
  echo "FEHLER: --ticket und --sweep schliessen sich gegenseitig aus." >&2
  exit 2
fi

# Format-Guard: Die ID landet weiter unten in Vergleichen und in einem Ref-Namen. Eine
# malformed ID würde dort als Zeichenklasse wirken und könnte nicht gemeinte Branches
# treffen — dasselbe Muster, das devflow-post-merge-deploy.sh absichert.
# Der ticketlose Fall ist nur lesend (--dry-run) oder explizit als Sweep erlaubt — beides
# schreibt keinen Archiv-Tag, es entsteht keine falsche Zuordnung.
case "$TICKET_ID" in
  T[0-9][0-9][0-9][0-9][0-9][0-9]) : ;;
  "") if [ "$DRY_RUN" -eq 1 ] || [ "$SWEEP" -eq 1 ]; then
        :  # ticketloser Inspektionsblick oder Sweep — erlaubt
      else
        echo "FEHLER: --ticket ist erforderlich (Format T######)" >&2; usage; exit 2
      fi ;;
  *)  echo "FEHLER: ungueltiges Ticket-ID-Format '$TICKET_ID' (erwartet T######)" >&2; exit 2 ;;
esac

TICKET_SH="${TICKET_SH:-$REPO_DIR/scripts/ticket.sh}"

cd "$TARGET_REPO" || { echo "FEHLER: --repo '$TARGET_REPO' nicht betretbar" >&2; exit 2; }

# Der aktuell ausgecheckte Branch ist ausgenommen: nach einem Merge ist das main, aber bei
# manuellem Aufruf aus einem Worktree wäre es der eigene Arbeitsbranch.
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")"

git fetch --quiet "$REMOTE" 2>/dev/null || true

# Trifft der Pfad eines der ALLOWLIST-Muster?
_allowed() {
  local f="$1" pattern
  for pattern in "${ALLOWLIST[@]}"; do
    # shellcheck disable=SC2053 — Glob-Vergleich ist hier beabsichtigt.
    [[ "$f" == $pattern ]] && return 0
  done
  return 1
}

# Kopf-SHA eines gemergten PRs des Branches (Positiv-Signal 1, [T007032]). Exit-Code
# auswerten, nicht die leere Ausgabe: ein gh-Ausfall muss als KEEP-Begruendung sichtbar
# werden (T003074: unverifizierbar = verschonen). Exit 0 + leere Ausgabe heisst "kein
# MERGED-PR" — kein Signal. Exit 0 + OID: erster MERGED-PR des Branches.
_merged_pr_head_oid() {
  local branch="$1" out
  if ! out="$(gh pr list --head "$branch" --state merged --json headRefOid 2>&1)"; then
    printf '%s' "$out" | head -1
    return 1
  fi
  printf '%s' "$out" | grep -o '"headRefOid"[[:space:]]*:[[:space:]]*"[^"]*"' \
    | head -1 | sed 's/.*:[[:space:]]*"//; s/"$//' || true
  return 0
}

# Nachfolge-Branch mit MERGED-PR und identischen Blobs (Positiv-Signal 2, [T007032]): Ein
# anderer Remote-Branch, der selbst einen MERGED-PR hat, traegt fuer JEDE Datei der
# Divergenzmenge des Kandidaten denselben Blob — der Kandidat ist ein Teilinhalt eines
# gemergten Nachfolgers, sicher reapbar. MERGED_HEADS und DIVERGENT befuellt der Aufrufer;
# die Selbstreferenz ist kein Nachfolger. Ohne Treffer Exit 1 (kein Signal).
_merged_successor() {
  local branch="$1" s f a b ok
  while IFS= read -r s; do
    [ -z "$s" ] && continue
    [ "$s" = "$branch" ] && continue
    ok=1
    while IFS= read -r f; do
      [ -z "$f" ] && continue
      a="$(git rev-parse "$REMOTE/$s:$f" 2>/dev/null || echo MISSING)"
      b="$(git rev-parse "$REMOTE/$branch:$f" 2>/dev/null || echo MISSING)"
      [ "$a" = "$b" ] || { ok=0; break; }
    done < <(printf '%s\n' "${DIVERGENT[@]:-}")
    [ "$ok" -eq 1 ] && { echo "$s"; return 0; }
  done < <(printf '%s\n' "${MERGED_HEADS[@]:-}")
  return 1
}

# Alle Dateien, die sich per Blob-Hash von <remote>/main unterscheiden.
#
# Bewusst hash-basiert: `git diff <commit> -- <pfad>` vergleicht gegen den Arbeitsbaum und
# verwechselt einen git-Fehler mit einer Inhaltsänderung (T002519). Ein Three-Dot-Diff wäre
# ebenso falsch, weil er gegen den Abzweigpunkt misst, der sich beim Squash-Merge nicht
# verschiebt.
_diverging_files() {
  local ref="$1" mb f a b
  mb="$(git merge-base "$REMOTE/main" "$ref" 2>/dev/null)" || return 0
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    a="$(git rev-parse "$ref:$f" 2>/dev/null || echo MISSING)"
    b="$(git rev-parse "$REMOTE/main:$f" 2>/dev/null || echo ABSENT)"
    [ "$a" = "$b" ] || printf '%s\n' "$f"
  done < <(git diff --name-only "$mb" "$ref" 2>/dev/null)
}

# Branches, die gerade in einem Worktree ausgecheckt sind. Ein solcher Branch traegt
# laufende Arbeit: sein Remote-Gegenstueck zu loeschen nimmt der Sitzung das Ziel des
# naechsten Push, waehrend sie laeuft. Der Ausgangszustand ist hier bewusst der
# Arbeitsbaum und nicht das Ticket — ein Worktree kann offen sein, obwohl das Ticket
# schon done ist, und genau dann greift keine der anderen Schranken.
#
# --porcelain ist Pflicht: die Klartextform von 'git worktree list' kuerzt lange Pfade
# und nennt den Branch in eckigen Klammern, also nicht als stabiles Feld.
mapfile -t WORKTREE_BRANCHES < <(git worktree list --porcelain | sed -n 's|^branch refs/heads/||p')

# Kandidaten: Remote-Branches. Im Einzel-Ticket-Modus nur die, deren Name die Ticket-ID
# trägt (case-insensitiv). Im Sweep-Modus alle — die Ticket-ID wird je Branch aus dem
# Branch-Namen extrahiert.
#
# T012967: Exit-Code von git ls-remote getrennt auswerten — ein Netzfehler ist kein
# "leeres Repo". stderr sichtbar lassen, damit der Aufrufer die Fehlerursache sieht.
LS_REMOTE_RAW=$(git ls-remote --heads "$REMOTE" 2>&1) || LS_REMOTE_RC=$?
if [ "${LS_REMOTE_RC:-0}" -ne 0 ]; then
  echo "Fehler: git ls-remote gegen $REMOTE schlug fehl (rc=$LS_REMOTE_RC)." >&2
  echo "$LS_REMOTE_RAW" >&2
  exit 1
fi

mapfile -t CANDIDATES < <(
  [ -z "$LS_REMOTE_RAW" ] && exit 0
  if [ -n "$TICKET_ID" ]; then
    printf '%s\n' "$LS_REMOTE_RAW" \
      | awk '{print $2}' \
      | sed 's|^refs/heads/||' \
      | grep -i -- "$TICKET_ID" \
      || true
  else
    printf '%s\n' "$LS_REMOTE_RAW" \
      | awk '{print $2}' \
      | sed 's|^refs/heads/||' \
      || true
  fi
)

if [ "${#CANDIDATES[@]}" -eq 0 ]; then
  if [ -n "$TICKET_ID" ]; then
    echo "Keine Remote-Branches mit Ticket-ID $TICKET_ID gefunden."
  else
    echo "Keine Remote-Branches gefunden."
  fi
  exit 0
fi

REAP_LIST=()

for branch in "${CANDIDATES[@]}"; do
  [ -z "$branch" ] && continue
  if [ "$branch" = "main" ] || [ "$branch" = "$CURRENT_BRANCH" ]; then
    echo "KEEP $branch — aktueller Branch oder main"
    continue
  fi

  # Vor jeder Ticket- oder Diff-Pruefung: ein Branch mit offenem Worktree wird verschont,
  # unabhaengig vom Ticketstatus. Die Pruefung steht hier oben, weil sie den Lauf nichts
  # kostet und die teureren Abfragen (ticket.sh, gh) dahinter gar nicht erst noetig sind.
  in_worktree=0
  for wb in "${WORKTREE_BRANCHES[@]}"; do
    if [ "$branch" = "$wb" ]; then in_worktree=1; break; fi
  done
  if [ "$in_worktree" -eq 1 ]; then
    echo "KEEP $branch — in einem Worktree ausgecheckt"
    continue
  fi

  # Im Sweep-Modus die Ticket-ID je Branch aus dem Branch-Namen ziehen. Trägt der
  # Branch keine T######-ID im Namen: KEEP — nicht prüfbar, also verschonen.
  branch_ticket_id="$TICKET_ID"
  freshness_decided=0
  if [ -z "$branch_ticket_id" ]; then
    branch_ticket_id="$(printf '%s' "$branch" | grep -o 'T[0-9]\{6\}' | head -1 || true)"
    if [ -z "$branch_ticket_id" ]; then
      # [T005958] chore/freshness-regen-* traegt nie eine Ticket-ID. Fuer diese Klasse
      # entscheidet der PR-Status (MERGED/CLOSED) statt des Ticket-Status. Exit-Code
      # auswerten, nicht die leere Ausgabe (dasselbe Muster wie beim offenen-PR-Check).
      if [[ "$branch" == chore/freshness-regen-* ]]; then
        if ! pr_all="$(gh pr list --head "$branch" --state all --json state 2>&1)"; then
          echo "KEEP $branch — gh-Abfrage fehlgeschlagen: $(printf '%s' "$pr_all" | head -1)"
          continue
        fi
        if printf '%s' "$pr_all" | grep -q '"state"[[:space:]]*:[[:space:]]*"OPEN"'; then
          echo "KEEP $branch — offener Freshness-PR (Auto-Merge ausstehend)"
          continue
        fi
        if ! printf '%s' "$pr_all" | grep -qE '"state"[[:space:]]*:[[:space:]]*"(MERGED|CLOSED)"'; then
          echo "KEEP $branch — kein Freshness-PR auffindbar"
          continue
        fi
        freshness_decided=1
      else
        echo "KEEP $branch — keine Ticket-ID im Branch-Namen erkennbar"
        continue
      fi
    fi
  fi

  # (2) offener PR? Exit-Code auswerten, nicht die leere Ausgabe: ein API-Ausfall sieht
  # sonst aus wie "kein PR" und würde einen Branch faelschlich freigeben.
  if ! pr_json="$(gh pr list --head "$branch" --state open --json number 2>&1)"; then
    echo "KEEP $branch — gh-Abfrage fehlgeschlagen: $(printf '%s' "$pr_json" | head -1)"
    continue
  fi
  if printf '%s' "$pr_json" | grep -q '"number"'; then
    echo "KEEP $branch — offener pull request"
    continue
  fi

  # (3) Ticket-Status — fuer freshness_decided=1 bereits durch den PR-Status entschieden
  #
  # [T012412] Eine LEERE Antwort ist eine fehlende Messung, keine negative Aussage. Sie bricht
  # deshalb nicht mehr sofort ab, sondern setzt ticket_unknown=1 und laesst die Positiv-Signale
  # unten entscheiden — die existieren seit T007032, waren hinter dem frueheren `continue` aber
  # unerreichbar. Ein GELESENER, nicht-terminaler Status (z.B. in_progress) bleibt dagegen ein
  # hartes KEEP: er ist eine Aussage, kein fehlender Messwert.
  ticket_unknown=0
  if [ "$freshness_decided" -eq 0 ]; then
    ticket_json="$(bash "$TICKET_SH" get --id "$branch_ticket_id" 2>/dev/null || echo '{}')"
    status="$(printf '%s' "$ticket_json" \
      | grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' \
      | head -1 | sed 's/.*:[[:space:]]*"//; s/"$//' || true)"
    case "$status" in
      done|archived) : ;;
      "") ticket_unknown=1 ;;
      *)  echo "KEEP $branch — Ticket-Status ist $status"; continue ;;
    esac
  fi

  # Divergenzmenge GENAU EINMAL pro Branch berechnen — Positiv-Signal 2 und der
  # Allowlist-Check darunter nutzen sie gemeinsam (keine Doppelberechnung).
  mapfile -t DIVERGENT < <(_diverging_files "$REMOTE/$branch")

  # Positiv-Signale [T007032]: Nur im Ticket-Pfad (freshness_decided=0); die
  # freshness-Klasse laeuft ihren bestehenden Weg. Unverifizierbar heisst verschonen —
  # kein Signal, dann entscheidet der Blob-Check wie bisher.
  if [ "$freshness_decided" -eq 0 ]; then
    # Positiv-Signal 1: eigener MERGED-PR mit headRefOid == Remote-Tip des Branches
    tip_sha="$(git rev-parse "$REMOTE/$branch" 2>/dev/null || echo "")"
    if ! merged_oid="$(_merged_pr_head_oid "$branch")"; then
      echo "KEEP $branch — gh-Abfrage fehlgeschlagen: $merged_oid"
      continue
    fi
    if [ -n "$merged_oid" ] && [ -n "$tip_sha" ] && [ "$merged_oid" = "$tip_sha" ]; then
      echo "REAP $branch"
      REAP_LIST+=("$branch")
      continue
    fi

    # Positiv-Signal 2: Nachfolge-Branch mit MERGED-PR und identischen Blobs. Die
    # MERGED-Koepfe-Liste wird einmalig und lazy geladen (eine gh-Abfrage pro Lauf);
    # schlaegt die Abfrage fehl, bleibt die Liste leer — kein Signal.
    if [ "${MERGED_HEADS_LOADED:-0}" -eq 0 ]; then
      MERGED_HEADS_LOADED=1
      if merged_all="$(gh pr list --state merged --json headRefName 2>&1)"; then
        mapfile -t MERGED_HEADS < <(printf '%s' "$merged_all" \
          | grep -o '"headRefName"[[:space:]]*:[[:space:]]*"[^"]*"' \
          | sed 's/.*:[[:space:]]*"//; s/"$//' || true)
      fi
    fi
    if [ "${#MERGED_HEADS[@]}" -gt 0 ] && _merged_successor "$branch"; then
      echo "REAP $branch"
      REAP_LIST+=("$branch")
      continue
    fi
  fi

  # [T012412] Riegel: Ein unbekannter Ticket-Status gibt einen Branch NUR ueber ein
  # Positiv-Signal frei. Faellt er bis hierher durch, hat keines gegriffen — dann gilt die
  # bisherige Begruendung. Der Blob-Allowlist-Check unten darf ihn nicht ersatzweise
  # freigeben: "Ticket done" und "Blob-Diff in der Allowlist" sind zwei getrennt noetige
  # Signale. Die Allowlist allein haette die einzige Kopie eines nie gemergten Deliverables
  # geloescht (T002431).
  #
  # Die Position ist bedeutungstragend: HINTER den Positiv-Signalen, sonst ist der Zustand vor
  # dem Fix wiederhergestellt — und VOR dem Allowlist-Check, sonst gibt dieser den Branch frei.
  if [ "$ticket_unknown" -eq 1 ]; then
    echo "KEEP $branch — Ticket-Status nicht ermittelbar"
    continue
  fi

  # (4) Blob-Abweichungen gegen die Allowlist
  blocked=""
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    _allowed "$f" || { blocked="$f"; break; }
  done < <(printf '%s\n' "${DIVERGENT[@]:-}")

  if [ -n "$blocked" ]; then
    echo "KEEP $branch — abweichende Datei ausserhalb der Allowlist: $blocked"
    continue
  fi

  echo "REAP $branch"
  REAP_LIST+=("$branch")
done

if [ "${#REAP_LIST[@]}" -eq 0 ]; then
  if [ "$SWEEP" -eq 1 ]; then
    # [T003074] Leerer Sweep-Bestand ist ein gültiger Messwert, kein Fehlschlag —
    # aber explizit als solcher benannt (kein vakuoses Exit 0 ohne Aussage).
    echo "keine verwaisten Branches gefunden"
  else
    echo "Nichts zu loeschen."
  fi
  exit 0
fi

if [ "$DRY_RUN" -eq 1 ]; then
  echo "Dry-Run — ${#REAP_LIST[@]} Branch(es) waeren geloescht worden."
  exit 0
fi

# [T003182] Lokalen Branch-Ref nach erfolgreichem Remote-Delete mitentfernen — aber nur,
# wenn er auf denselben SHA zeigt wie der geloeschte Remote-Branch. Abweichende SHA heisst:
# der lokale Branch traegt Arbeit, die nie auf dem Remote war — die darf NIEMALS weg. Ebenso
# verschont: ein Ref, der nicht loeschbar ist (z.B. in einem Worktree ausgecheckt, dann
# schlaegt `git branch -D` fehl). Das Scheitern des Delete ist kein Fehler des Laufs, sondern
# ein dokumentierter KEEP-Fall.
_reap_local_ref() {
  local branch="$1" sha="$2" local_sha
  local_sha="$(git rev-parse --verify --quiet "$branch" 2>/dev/null || echo "")"
  if [ -z "$local_sha" ]; then
    # Kein lokaler Ref — bestehende Meldung unveraendert, nichts weiter zu tun.
    echo "DELETED $branch (archiviert als refs/tags/reaped/$branch)"
    return 0
  fi
  if [ "$local_sha" != "$sha" ]; then
    echo "DELETED $branch (archiviert als refs/tags/reaped/$branch)"
    echo "KEEP local $branch — lokaler Ref weicht vom Archiv-SHA ab, nicht geloescht"
    return 0
  fi
  if git branch -D "$branch" >/dev/null 2>&1; then
    echo "DELETED $branch (archiviert als refs/tags/reaped/$branch, lokaler Ref entfernt)"
  else
    echo "DELETED $branch (archiviert als refs/tags/reaped/$branch)"
    echo "KEEP local $branch — lokaler Ref nicht entfernbar (z.B. in einem Worktree ausgecheckt)"
  fi
}

for branch in "${REAP_LIST[@]}"; do
  sha="$(git rev-parse "$REMOTE/$branch" 2>/dev/null || echo "")"
  if [ -z "$sha" ]; then
    echo "KEEP $branch — SHA nicht aufloesbar, kein Delete ohne Archiv-Tag"
    continue
  fi
  if ! git push "$REMOTE" "$sha:refs/tags/reaped/$branch" 2>/dev/null; then
    echo "KEEP $branch — Archiv-Tag konnte nicht gepusht werden, kein Delete"
    continue
  fi
  if git push "$REMOTE" --delete "$branch" 2>/dev/null; then
    _reap_local_ref "$branch" "$sha"
  else
    echo "KEEP $branch — Delete fehlgeschlagen (Archiv-Tag liegt bereits vor)"
  fi
done
