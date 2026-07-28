#!/usr/bin/env bash
# scripts/pr-refresh.sh — heilt PRs, deren Merge-Konflikte auf generierte Artefakte
# beschraenkt sind. [T002413]
#
# Warum es das braucht: .gitattributes fuehrt die 16 Freshness-Artefakte als `merge=ours`,
# und der lokale Treiber ist konfiguriert (git config merge.ours.driver=true). Ein lokaler
# Rebase raeumt sie deshalb ohne Konfliktmarker weg. GitHub ignoriert
# .gitattributes-Merge-Treiber jedoch vollstaendig — weder die Mergeability-Berechnung noch
# Auto-Merge kennen sie. Der PR bleibt darum als CONFLICTING stehen, obwohl lokal nichts zu
# entscheiden ist. Dieses Skript fuehrt genau den Rebase aus, den GitHub nicht kann.
#
# Was es NICHT tut: das Freshness-Gate aufweichen. Die Artefakte bleiben committet — siehe
# docs/superpowers/specs/2026-07-28-pr-conflict-reduction-design.md, Abschnitt
# "Verworfene Ansaetze".
#
# Exit: 0 = geheilt / nichts zu tun / dry-run, 1 = Guard hat abgelehnt, 2 = Benutzungsfehler.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Indirektionspunkte fuer den Test — dieselbe Technik wie AGENT_LOCK_FAKE_ALIVE in
# agent-lock.sh: kein Netz, kein echter Push, aber der reale Kontrollfluss.
#
# Bewusst `gh` statt des sonst vorgeschriebenen `gh-axi` (CLAUDE.md): gh-axi gibt
# YAML-artigen Text aus, kein JSON, und kennt die hier noetigen Felder nicht —
# `gh-axi pr list --fields mergeable` antwortet mit
# "Unknown field(s) ... Available: body, createdAt, labels, mergedAt, milestone, url".
# Ohne `mergeable` und `headRefName` ist der zentrale Guard nicht formulierbar.
GH_CMD="${PR_REFRESH_GH_CMD:-gh}"
PUSH_LOG="${PR_REFRESH_PUSH_LOG:-}"
DRY_PUSH="${PR_REFRESH_DRY_PUSH:-}"

DRY_RUN=0

_die()  { printf 'pr-refresh: %s\n' "$*" >&2; exit 1; }
_info() { printf 'pr-refresh: %s\n' "$*"; }
_dry()  { printf '[dry-run] %s\n' "$*"; }

_gh() { "$GH_CMD" "$@"; }

_usage() {
  cat <<EOF
Usage: pr-refresh.sh [--dry-run] <pr-nummer> [<pr-nummer>...]

Rebased einen konfliktbehafteten Pull Request auf origin/main, regeneriert die
Freshness-Artefakte und pusht das Ergebnis. Gedacht fuer Konflikte, die sich auf
generierte Artefakte beschraenken.

Options:
  --dry-run   Zeigt die geplanten Schritte, ohne etwas zu veraendern.
  --help      Diese Hilfe.

Guards:
  - Nur Pull Requests mit mergeable=CONFLICTING werden angefasst.
  - Nur Pull Requests des eigenen Accounts — kein Push auf fremde Branches.
  - Kein Zugriff auf Branches, die agent-lock als live fuehrt (fremde Session).
  - Abbruch, sobald ein Konflikt eine nicht generierte Datei betrifft.
  - Push ausschliesslich mit --force-with-lease, niemals mit --force.
EOF
}

# Der eigene Login. Ueber PR_REFRESH_ME setzbar, damit der Test nicht ans Netz muss.
_me() {
  if [ -n "${PR_REFRESH_ME:-}" ]; then printf '%s\n' "$PR_REFRESH_ME"; return 0; fi
  gh api user --jq .login 2>/dev/null || _die "eigener Login nicht ermittelbar — PR_REFRESH_ME setzen"
}

# Klassifiziert Pfade ueber .gitattributes (linguist-generated=true). Bewusst NUR ueber
# filter-generated.sh: eine zweite Pfadliste in diesem Skript wuerde auseinanderlaufen,
# sobald ein Artefakt hinzukommt. filter-generated.sh entfernt die generierten Pfade und
# gibt zurueck, was uebrig bleibt — genau die Dateien, die Handarbeit brauchen.
_non_generated() {
  printf '%s\n' "$1" | bash "${REPO_ROOT}/scripts/filter-generated.sh"
}

# Prueft, ob agent-lock den Branch als live fuehrt. Gibt die besitzende Session aus.
_lock_owner() {
  local branch="$1"
  bash "${REPO_ROOT}/scripts/agent-lock.sh" list 2>/dev/null \
    | awk -v b="$branch" '$1=="branch" && $2==b && $5=="live" { print $3"/"$6" (sid "$4")" }' \
    | head -1
}

# Prueft, ob der Branch lokal irgendwo ausgecheckt ist. Das ist eine ANDERE Frage als der
# agent-lock oben: ein Lock ist die freiwillige Absichtserklaerung einer mitspielenden
# Session, `git worktree list` ist die harte Tatsache. Ein Force-Push auf einen
# ausgecheckten Branch laesst genau diesen Checkout divergieren — real beobachtet an PR
# #3447 (chore/mishap-T002382), den der Hauptcheckout hielt, ohne dass ein Branch-Lock
# dafuer existierte. Fuer eine unumkehrbare Operation zaehlt die Tatsache, nicht die Absicht.
_checkout_path() {
  local branch="$1"
  git -C "$REPO_ROOT" worktree list --porcelain 2>/dev/null \
    | awk -v b="refs/heads/$branch" '
        /^worktree /{ wt = substr($0, 10) }
        /^branch /  { if ($2 == b) { print wt; exit } }'
}

_push() {
  local wt="$1" branch="$2"
  if [ -n "$DRY_PUSH" ]; then
    [ -n "$PUSH_LOG" ] && printf '%s\n' "$branch" >> "$PUSH_LOG"
    _info "Push unterdrueckt (PR_REFRESH_DRY_PUSH gesetzt): $branch"
    return 0
  fi
  git -C "$wt" push --force-with-lease origin "$branch"
}

# --- Kern: ein einzelner PR -------------------------------------------------------------

process_pr() {
  local num="$1" meta mergeable branch author me owner
  meta="$(_gh pr view "$num" --json number,mergeable,headRefName,author 2>/dev/null)" \
    || _die "PR $num nicht abrufbar"

  mergeable="$(printf '%s' "$meta" | jq -r '.mergeable // "UNKNOWN"')"
  branch="$(printf '%s'   "$meta" | jq -r '.headRefName // empty')"
  author="$(printf '%s'   "$meta" | jq -r '.author.login // empty')"
  [ -n "$branch" ] || _die "PR $num: headRefName fehlt in der Antwort"

  # Guard 1 — nur CONFLICTING ist unser Fall. Alles andere ist kein Fehler.
  if [ "$mergeable" != "CONFLICTING" ]; then
    _info "PR $num ist $mergeable — nichts zu tun."
    return 0
  fi

  # Guard 2 — fremde PRs nie anfassen. Ein Force-Push auf einen fremden Branch ist
  # nicht reparierbar.
  me="$(_me)"
  if [ "$author" != "$me" ]; then
    _die "PR $num gehoert $author, nicht $me — kein Force-Push auf fremde Branches."
  fi

  # Guard 3 — arbeitet gerade jemand auf dem Branch, wuerde ein Force-Push seine
  # unversionierte Arbeit zerreissen.
  owner="$(_lock_owner "$branch")"
  if [ -n "$owner" ]; then
    _die "PR $num: Branch $branch wird von $owner gehalten — abgebrochen."
  fi

  # Guard 4 — harte Tatsache statt freiwilliger Absicht: ist der Branch lokal
  # ausgecheckt, wuerde ein Force-Push diesen Checkout divergieren lassen.
  local checkout
  checkout="$(_checkout_path "$branch")"
  if [ -n "$checkout" ]; then
    _die "PR $num: Branch $branch ist ausgecheckt in $checkout — abgebrochen."
  fi

  if [ "$DRY_RUN" -eq 1 ]; then
    _dry "PR $num ($branch): rebase auf origin/main, freshness regenerieren, force-with-lease push"
    return 0
  fi

  _refresh_branch "$num" "$branch"
}

_refresh_branch() {
  local num="$1" branch="$2" wt rc unresolved
  wt="${REPO_ROOT}/.worktrees/pr-refresh-${num}"

  # Nie im Hauptcheckout arbeiten (CLAUDE.local.md): mutierende Operationen gehoeren in
  # einen eigenen Worktree.
  [ -d "$wt" ] && git -C "$REPO_ROOT" worktree remove "$wt" --force >/dev/null 2>&1
  bash "${REPO_ROOT}/scripts/worktree-create.sh" "$branch" "$wt" >/dev/null \
    || _die "PR $num: Worktree fuer $branch nicht anlegbar"

  git -C "$wt" fetch origin main --quiet

  rc=0
  git -C "$wt" rebase origin/main >/dev/null 2>&1 || rc=$?
  if [ "$rc" -ne 0 ]; then
    unresolved="$(git -C "$wt" diff --name-only --diff-filter=U 2>/dev/null || true)"
    local handwork
    handwork="$(_non_generated "$unresolved")"
    if [ -n "$handwork" ]; then
      git -C "$wt" rebase --abort >/dev/null 2>&1 || true
      git -C "$REPO_ROOT" worktree remove "$wt" --force >/dev/null 2>&1 || true
      _die "PR $num: Konflikt in nicht generierter Datei — $(printf '%s' "$handwork" | head -1). Handarbeit noetig."
    fi
    # Nur generierte Dateien offen: die Arbeitsbaum-Fassung uebernehmen und weiterlaufen.
    # Der merge=ours-Treiber hat sie bereits entschieden; hier bleibt nur das Staging.
    printf '%s\n' "$unresolved" | while IFS= read -r f; do
      [ -n "$f" ] && git -C "$wt" checkout --ours -- "$f" 2>/dev/null && git -C "$wt" add -- "$f"
    done
    GIT_EDITOR=true git -C "$wt" rebase --continue >/dev/null 2>&1 \
      || _die "PR $num: rebase --continue fehlgeschlagen"
  fi

  # Nach dem Rebase koennen die Artefakte inhaltlich veraltet sein — regenerieren und
  # nur dann committen, wenn sich wirklich etwas geaendert hat.
  (cd "$wt" && task freshness:regenerate >/dev/null 2>&1) || true
  if [ -n "$(git -C "$wt" status --porcelain)" ]; then
    git -C "$wt" add -A
    git -C "$wt" commit -q -m "chore: regen freshness artifacts after rebase [T002413]"
  fi

  _push "$wt" "$branch"
  git -C "$REPO_ROOT" worktree remove "$wt" --force >/dev/null 2>&1 || true
  _info "PR $num ($branch) aufgefrischt."
}

main() {
  local -a prs=()
  while [ $# -gt 0 ]; do
    case "$1" in
      --dry-run) DRY_RUN=1 ;;
      --help|-h) _usage; return 0 ;;
      -*)        _usage >&2; return 2 ;;
      *)         prs+=("$1") ;;
    esac
    shift
  done

  if [ "${#prs[@]}" -eq 0 ]; then _usage >&2; return 2; fi
  local n
  for n in "${prs[@]}"; do process_pr "$n"; done
}

main "$@"
