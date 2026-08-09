#!/usr/bin/env bash
# Create a git worktree that survives git-crypt-managed paths. [T000426]
#
# Why: `git worktree add` runs the git-crypt smudge filter while checking out
# the new worktree, but the new per-worktree gitdir (.git/worktrees/<name>) has
# no git-crypt key, so the checkout fails fatally (exit 128) and the worktree is
# rolled back — even when the MAIN checkout is unlocked. This wrapper creates the
# worktree WITHOUT checkout, then either (a) copies the git-crypt key into the
# worktree gitdir so checkout decrypts normally and ALL later git ops work
# (unlocked repo — key present but clean/required neutralized to prevent commit
# failures on git-crypt-managed files), or (b) neutralizes ALL git-crypt filters
# worktree-locally so checkout and later git ops pass encrypted blobs through
# verbatim, no key needed (locked repo). [T000925]
#
# Usage: scripts/worktree-create.sh <branch> <path> [<base>]
#   <branch>  branch name, e.g. fix/foo. If it already exists (locally or on
#             origin) the worktree CHECKS IT OUT; otherwise a new branch is
#             created from <base>. The existing-branch mode is what the Software
#             Factory plan-reuse / dev-flow handoff path needs (T000473).
#   <path>    worktree path, e.g. .worktrees/foo (repo-relative default location)
#   <base>    base ref for a NEW branch (default: origin/main); ignored when the
#             branch already exists.
#
# Exit codes:
#   0  worktree ready (stdout ends with a line containing "ready on" — pipeline.js
#      matches on exactly that string, do not reword it)
#   3  branch is already checked out in ANOTHER worktree [T002327]. Nothing was
#      created and no branch was touched. Callers treat this as "someone else owns
#      this branch" and defer, NOT as a failure to be escalated.
#   1  any other setup failure (the half-created worktree is rolled back)
set -euo pipefail

# ── --help (vor allen Guards, T002783) ─────────────────────────────────────
if [[ "${1:-}" == "--help" ]]; then
  cat <<'HELP'
Usage: scripts/worktree-create.sh [--unattended] <branch> <path> [<base>]
  --unattended  Skips main-checkout and ticket-ID guards for allowlisted
                branches. The allowlist lives in scripts/lib/branch-allowlist.sh
                (shared with the pre-commit and pre-push hooks).
                WT_SKIP_NAME_CHECK remains available as emergency bypass for any
                branch.
  <branch>      branch name, e.g. fix/foo
  <path>        worktree path, e.g. .worktrees/foo
  <base>        base ref for NEW branch (default: origin/main)
HELP
  exit 0
fi

# ── --unattended (T002783) ─────────────────────────────────────────────────
# Die Allowlist selbst steht in scripts/lib/branch-allowlist.sh — derselben Quelle,
# die .githooks/pre-commit und .githooks/pre-push lesen [T002817]. Bedingt sourcen:
# fehlt die Datei, bleibt branch_is_ticketless undefiniert und der Guard laesst nichts
# durch, was er vorher blockiert haette.
_unattended=false
[ -f "$(dirname "${BASH_SOURCE[0]}")/lib/branch-allowlist.sh" ] \
  && . "$(dirname "${BASH_SOURCE[0]}")/lib/branch-allowlist.sh"
if [[ "${1:-}" == "--unattended" ]]; then
  _unattended=true
  shift
fi

# T002448-M1: fail fast when the source checkout is not on main — but ONLY in
# real upstream repos (origin/main exists). Ephemeral BATS repos without a
# remote must keep the T002204 warn-path (exit 0), because there is no canonical
# main to protect. Mirrors the divergence-guard's origin/main precondition.
if git rev-parse --verify --quiet origin/main >/dev/null 2>&1; then
  CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "HEAD")"
  if [ "$CURRENT_BRANCH" != "main" ] && ! $_unattended; then
    echo "FATAL: worktree-create muss vom main-Branch des Haupt-Checkouts ausgefuehrt werden." >&2
    echo "       Aktueller Branch: $CURRENT_BRANCH. Bitte: git checkout main" >&2
    exit 1
  fi
fi

# --- branch-name guard: fail fast before divergence guard [T002470] ---
#
# Background: T002240 (same bug, fixed only in scripts/factory/auto-chore-plan.sh),
# T002409 Mishap 2 (repeat with feat/), and measured 2026-07-29:
# 4 of 13 active worktrees had non-conforming branches.
#
# Die Ausnahmeliste fuer ticketlose Branches kommt aus scripts/lib/branch-allowlist.sh
# [T002817]. Bis dahin fuehrte dieses Skript sie selbst — und lief gegen .githooks/pre-commit
# auseinander: chore/mishap-incident-rollup war anlegbar, aber nicht committebar. Die frueher
# hier genannten drift-tests verglichen die statischen Muster, nicht diese Allowlist, und
# konnten den Drift deshalb nicht sehen.
#
# Die uebrigen Muster (Typ-Praefixe, Exemptions) sind weiterhin literale Kopien aus
# .githooks/pre-commit.
if [ "${WT_SKIP_NAME_CHECK:-0}" != "1" ]; then
  _bn="${1:-}"
  if [ -n "$_bn" ]; then
    # T002783: --unattended schaltet die Allowlist frei. Nur exakt gelistete Branches,
    # kein Wildcard-Muster. Der Emergency-Bypass WT_SKIP_NAME_CHECK bleibt bestehen.
    if $_unattended && command -v branch_is_ticketless >/dev/null 2>&1; then
      branch_is_ticketless "$_bn" && _bn=""
    fi
    case "$_bn" in
      main|develop|master|release-please--*|dependabot/*|renovate/*|"") ;;
      *)
        _has_ticket=0
        _has_type=0
        [[ "$_bn" =~ ^feature/|^fix/|^chore/|^docs/ ]] && _has_type=1
        [[ "$_bn" =~ T[0-9]{6,} ]] && _has_ticket=1
        if [ "$_has_type" -eq 0 ] || [ "$_has_ticket" -eq 0 ]; then
          echo "✗  worktree-create: branch '$_bn' does not follow naming convention." >&2
          echo "" >&2
          [ "$_has_type" -eq 0 ] && \
            echo "  ✗ kein gueltiges Typ-Praefix. Erlaubt: feature/ fix/ chore/ docs/" >&2
          if [ "$_has_ticket" -eq 0 ]; then
            _found_lower=""
            [[ "$_bn" =~ t([0-9]{6,}) ]] && _found_lower="${BASH_REMATCH[1]}"
            echo "  ✗ keine Ticket-ID (T[0-9]{6,}) gefunden. Muss GROSS sein${_found_lower:+ — t$_found_lower → T$_found_lower}." >&2
          fi
          echo "" >&2
          echo "  Required: type/<slug>-T000XXX" >&2
          echo "  Examples:" >&2
          echo "    feature/flux-gaps-brainless-T002093" >&2
          echo "    fix/pocket-id-retry-T001234" >&2
          echo "    chore/deps-bump-T001500" >&2
          # Build suggested correction (lowercase ticket ID + feat/ → feature/)
          _suggested="$_bn"
          _suggested_changed=0
          if [[ "$_suggested" =~ ^feat/ ]]; then
            _suggested="feature/${_suggested#feat/}"
            _suggested_changed=1
          fi
          if [[ "$_suggested" =~ (.*)t([0-9]{6,})(.*) ]]; then
            _suggested="${BASH_REMATCH[1]}T${BASH_REMATCH[2]}${BASH_REMATCH[3]}"
            _suggested_changed=1
          fi
          if [ "$_suggested_changed" -eq 1 ]; then
            echo "" >&2
            echo "  Suggested: $_suggested" >&2
          fi
          echo "" >&2
          echo "  Why: ticket ID links WIP to its ticket and subsequent PR." >&2
          echo "  To bypass (emergency only): WT_SKIP_NAME_CHECK=1 bash $0 ..." >&2
          exit 1
        fi
        ;;
    esac
  fi
fi

# [T002673] Spielt den Auto-Stash zurueck. Scheitert der Pop, wird das LAUT
# gemeldet statt verschluckt — die uncommitteten Aenderungen des Aufrufers liegen
# dann noch im Stash, und ohne Hinweis haelt er sie fuer wiederhergestellt.
# Rueckgabe immer 0: der Worktree ist trotzdem nutzbar, und ein Abbruch waere
# hier schaedlicher als die Warnung (der Stash bliebe genauso liegen).
_wc_stash_pop_or_warn() {
  if git stash pop >/dev/null 2>&1; then
    return 0
  fi
  echo "" >&2
  echo "⚠  worktree-create: DEINE UNCOMMITTETEN AENDERUNGEN LIEGEN NOCH IM STASH." >&2
  echo "   Der automatische 'git stash pop' ist fehlgeschlagen — meist ein Konflikt" >&2
  echo "   mit inzwischen gemergten main-Aenderungen. Der neue Worktree ist nutzbar," >&2
  echo "   aber der Haupt-Checkout hat deine Aenderungen NICHT zurueck." >&2
  echo "" >&2
  echo "   Zurueckholen:  git stash apply stash@{0}    # 'worktree-create-auto-stash'" >&2
  echo "   Auflisten:     git stash list" >&2
  echo "" >&2
  return 0
}

# T001302/T001332: Divergence guard — auto-sync if local main is behind origin/main,
# reject if truly diverged.
# Only fires when origin/main exists (e.g. real upstream repos), so BATS tests with
# ephemeral test repos (no remote) are not affected.
if git rev-parse --verify --quiet origin/main >/dev/null 2>&1; then
  if ! git merge-base --is-ancestor origin/main main 2>/dev/null; then
    if git merge-base --is-ancestor main origin/main 2>/dev/null; then
      echo "worktree-create: local main is behind origin/main — fast-forwarding..." >&2
      CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "HEAD")
      if [ "$CURRENT_BRANCH" != "main" ] && ! $_unattended; then
        echo "FATAL: worktree-create muss vom main-Branch des Haupt-Checkouts ausgeführt werden." >&2
        echo "       Aktueller Branch: $CURRENT_BRANCH. Bitte: git checkout main" >&2
        exit 1
      fi
      # [T002673] Der Auto-Stash darf nicht stillschweigend liegenbleiben.
      # Vorher stand hier `git stash push … 2>/dev/null || true` und spiegelbildlich
      # `git stash pop 2>/dev/null || true`. Beides verschluckte Meldung UND
      # Exit-Code. Scheiterte der Pop — typisch, wenn der Stash mit inzwischen
      # gemergten main-Aenderungen kollidiert — meldete das Skript trotzdem
      # "ready", und die uncommitteten Aenderungen des Aufrufers lagen unbemerkt
      # im Stash. Real passiert am 2026-08-04.
      # Guard: tests/spec/worktree-divergence-guard/stash-restore-visible.bats
      _needs_pop=false
      if ! git diff --quiet HEAD 2>/dev/null; then
        if git stash push -m "worktree-create-auto-stash" >/dev/null; then
          _needs_pop=true
        else
          # Kein `|| true`: laeuft das Skript hier weiter, poppt der Schritt
          # unten einen FREMDEN Stash-Eintrag in den Haupt-Checkout.
          echo "FATAL: worktree-create: konnte den dirty Haupt-Checkout nicht stashen." >&2
          echo "       Abbruch, damit kein fremder Stash-Eintrag angewendet wird." >&2
          exit 1
        fi
      fi
      if [ "$CURRENT_BRANCH" = "main" ]; then
        git pull --rebase origin main 2>/dev/null || {
          echo "FATAL: auto-sync failed — could not pull origin/main into main." >&2
          if $_needs_pop; then _wc_stash_pop_or_warn; fi
          exit 1
        }
      else
        git fetch origin +refs/heads/main:refs/remotes/origin/main 2>/dev/null || {
          echo "FATAL: auto-sync failed — could not fast-forward main." >&2
          if $_needs_pop; then _wc_stash_pop_or_warn; fi
          exit 1
        }
      fi
      if $_needs_pop; then _wc_stash_pop_or_warn; fi
      echo "worktree-create: local main synced to origin/main" >&2
    else
      echo "FATAL: local 'main' has diverged from 'origin/main'." >&2
      echo "       This means local main has diverged (likely from a past rebase)." >&2
      echo "       Fix with: git reset --hard origin/main" >&2
      exit 1
    fi
  fi
fi

BRANCH="${1:?Usage: worktree-create.sh <branch> <path> [<base>]}"
WT_PATH="${2:?Usage: worktree-create.sh <branch> <path> [<base>]}"
BASE="${3:-origin/main}"

# T001936: Enforce .worktrees/ path for feature/fix branches.
# CLAUDE.local.md / Memory previously recommended tmp/ paths which conflict with
# preflight-pr-scope.sh (lines 63-68). Auto-redirect non-conformant paths instead
# of letting the PR flow fail with FATAL.
# Skip in test mode (WT_PATH under /tmp or $TMP) — BATS tests create ephemeral
# worktrees in temp dirs which are expected to be outside .worktrees/.
if [[ "$BRANCH" =~ ^(feature|fix)/ ]] && [[ "$WT_PATH" != /tmp/* ]] && [[ "$WT_PATH" != "${TMP:-/nonexistent}"/* ]]; then
  ABS_WT="$(cd "$(dirname "$WT_PATH")" 2>/dev/null && pwd)/$(basename "$WT_PATH")" 2>/dev/null || ABS_WT="$WT_PATH"
  if [[ "$ABS_WT" != *"/worktrees/"* ]] && [[ "$ABS_WT" != *"/.worktrees/"* ]]; then
    _wt_name="$(basename "$WT_PATH")"
    WT_PATH=".worktrees/$_wt_name"
    echo "worktree-create: T001936 — auto-redirected path to $WT_PATH (feature/fix branches require .worktrees/)" >&2
  fi
fi

# Absolute path to the SHARED gitdir (.../.git), valid from main or a worktree.
COMMON_DIR="$(cd "$(git rev-parse --git-common-dir)" && pwd)"
KEY_SRC="$COMMON_DIR/git-crypt/keys/default"

# Does the branch already exist locally or on origin? Decides create-vs-checkout
# and whether rollback may delete the branch (never delete a pre-existing one).
BRANCH_EXISTS=0
if git show-ref --verify --quiet "refs/heads/$BRANCH" \
   || git ls-remote --exit-code --heads origin "$BRANCH" >/dev/null 2>&1; then
    BRANCH_EXISTS=1
fi

# Idempotency: drop a stale worktree at this path left by a prior aborted run
# (removing a worktree never deletes its branch). Lets the factory retry cleanly.
#
# [T002896] Vor dem Entfernen pruefen, ob der aktuell am Zielpfad ausgecheckte
# Branch einen live Agent-Lock traegt — ist das der Fall, darf der Worktree NICHT
# entfernt werden (fremde Session arbeitet aktiv). Dieser Guard verhindert, dass
# der Factory-Autopilot aktiv geclaimte Fremd-Worktrees ueberschreibt.
# Symmetrie zum "branch in use"-Check weiter unten (Zeile 283-286): jener prueft,
# ob der ANGEFORDERTE Branch bereits in EINEM ANDEREN Worktree liegt; dieser Guard
# prueft, ob der ZIELPFAD bereits von einem live geclaimten Branch belegt ist.
_existing_branch=""
if [ -d "$WT_PATH" ]; then
  _existing_branch="$(git -C "$WT_PATH" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
  if [ -n "$_existing_branch" ] && [ "$_existing_branch" != "HEAD" ]; then
    if bash "$(dirname "$0")/agent-lock.sh" check-branch-live "$_existing_branch" >/dev/null 2>&1; then
      echo "worktree-create: Zielpfad $WT_PATH ist belegt von Branch $_existing_branch mit live Agent-Lock — breche ab (T002896)." >&2
      exit 4
    fi
  fi
fi
git worktree remove --force "$WT_PATH" 2>/dev/null || true
git worktree prune 2>/dev/null || true

# [T002327] Is the branch already checked out in ANOTHER worktree? Ask git instead
# of parsing the failure message of `git worktree add`: its wording differs between
# git versions ("is already checked out at …" / "already used by worktree at …"), so
# a regex on it in pipeline.js would silently rot and drop the case back into the
# generic error path — which sets the ticket to `blocked`. That is exactly the
# behaviour this change removes: a branch held by a living session is not a failure,
# it is someone else's turn.
#
# This runs AFTER the idempotency prune above, so a stale worktree at OUR OWN path is
# already gone and cannot be mistaken for a foreign owner. It runs BEFORE the skeleton
# step and before the rollback trap is installed — the early exit therefore creates
# nothing and, crucially, can never delete a foreign session's branch.
#
# Matched on the fully-qualified refname: the short name would let `feature/x` match
# `feature/x-y`.
_occupied_by=""
while IFS= read -r _line; do
    case "$_line" in
        worktree\ *) _wt_candidate="${_line#worktree }" ;;
        branch\ refs/heads/"$BRANCH") _occupied_by="$_wt_candidate"; break ;;
    esac
done < <(git worktree list --porcelain)

if [ -n "$_occupied_by" ]; then
    echo "worktree-create: branch in use — $BRANCH ist bereits ausgecheckt in $_occupied_by" >&2
    exit 3
fi

# 1) Skeleton without checkout — never runs the smudge filter, so it cannot fail
#    on git-crypt paths.
# === T002471-M4: Branch-Name-Guard ===
# Prüft, ob die Ticket-ID im Branch-Namen gross geschrieben ist.
# WT_SKIP_NAME_CHECK MUSS hier genauso greifen wie beim Guard weiter oben
# (Zeile ~45): dieser zweite Guard wurde später ergänzt und kannte die
# dokumentierte Notfall-Umgehung nicht — sie war damit wirkungslos, weil der
# erste Guard sie zwar respektierte, dieser dann aber trotzdem abbrach.
# [T002512]
if [ "${WT_SKIP_NAME_CHECK:-0}" != "1" ]; then
  _ticket_id=$(echo "$BRANCH" | grep -oE '[tT][0-9]{6,}' | head -1 || true)
  if [[ -n "$_ticket_id" && "$_ticket_id" != "${_ticket_id^^}" ]]; then
    echo "ERROR: Ticket-ID im Branch-Namen '$BRANCH' ist kleingeschrieben." >&2
    echo "  Verwende ${_ticket_id^^} statt $_ticket_id." >&2
    echo "  Umgehung (nur im Notfall): WT_SKIP_NAME_CHECK=1 bash $0 ..." >&2
    exit 1
  fi
fi
# === Ende T002471-M4 ===
if [ "$BRANCH_EXISTS" -eq 1 ]; then
    # Existing branch: fetch it so the local ref is current, then check it out.
    git fetch --quiet origin "$BRANCH" 2>/dev/null || true
    git worktree add --no-checkout "$WT_PATH" "$BRANCH"
else
    git worktree add --no-checkout -b "$BRANCH" "$WT_PATH" "$BASE"
fi

# Roll back the half-created worktree (+ the branch ONLY if we created it) if any
# later step fails (cp, checkout). Otherwise a retry hits a misleading
# "branch already exists" / "<path> already exists" that hides the original error.
_ok=0
_rollback() {
    [ "$_ok" -eq 1 ] && return
    echo "worktree-create: setup failed — rolling back $WT_PATH${BRANCH_EXISTS:+ (keeping existing branch $BRANCH)}" >&2
    git worktree remove --force "$WT_PATH" 2>/dev/null || true
    [ "$BRANCH_EXISTS" -eq 0 ] && git branch -D "$BRANCH" 2>/dev/null || true
}
trap _rollback EXIT

WT_GITDIR="$(git -C "$WT_PATH" rev-parse --absolute-git-dir)"

if [ -f "$KEY_SRC" ]; then
    # Unlocked: give the worktree its own copy of the key → real decryption AND
    # real encryption. clean MUST be the real git-crypt filter: the former
    # clean=cat neutralization [T000925] silently committed PLAINTEXT secrets
    # whenever a merge/add touched a git-crypt-managed file (T001977 — happened
    # 2026-07-19 in the t001946 worktree). With the key copied into the worktree
    # gitdir, git-crypt clean works fine.
    mkdir -p "$WT_GITDIR/git-crypt/keys"
    cp "$KEY_SRC" "$WT_GITDIR/git-crypt/keys/default"
    git -C "$WT_PATH" checkout
    git -C "$WT_PATH" config extensions.worktreeConfig true
    git -C "$WT_PATH" config --worktree filter.git-crypt.required true
else
    # Locked (no key): neutralize git-crypt filters worktree-locally so checkout
    # and all later git ops use cat (passthrough). extensions.worktreeConfig must
    # be enabled before --worktree config entries are honored.
    git -C "$WT_PATH" config extensions.worktreeConfig true
    git -C "$WT_PATH" config --worktree filter.git-crypt.smudge   cat
    git -C "$WT_PATH" config --worktree filter.git-crypt.clean    cat
    git -C "$WT_PATH" config --worktree filter.git-crypt.required false
    git -C "$WT_PATH" checkout
    echo "worktree-create: repo is git-crypt LOCKED — secrets left encrypted-at-rest in $WT_PATH" >&2
fi

# T001331/T001332/T002114: Post-checkout stale-smudge detection.
# If the checkout above ran with a broken or stale smudge filter, secrets are
# encrypted-at-rest in the worktree. Detect and fix.
# Also checks .claude/settings.json as fallback canary when .secrets dir is
# empty — that file is git-crypt-managed and surfaces the same stale smudge. [T001332]
#
# Runs for EVERY unlocked worktree, not just BRANCH_EXISTS=1 [T002114]. Die
# alte Einschraenkung ging davon aus, dass nur wiederverwendete Worktrees einen
# veralteten Filter erben koennen. Am 2026-07-23 kam der Defekt aber aus der
# GETEILTEN .git/config des Hauptcheckouts (filter.git-crypt.clean/.smudge
# standen dort auf LEEREN Strings) — damit trifft es auch frisch angelegte
# Branches, und zwar lautlos: git ueberspringt den Filter dank stat-Cache, bis
# irgendetwas einen git-crypt-Pfad anfasst. Danach stirbt jeder `git status`
# mit "clean filter 'git-crypt' failed".
if [ -f "$KEY_SRC" ]; then
  # `|| canary=""` ist Pflicht: fehlt das Verzeichnis, gibt find 1 zurueck, und
  # unter `set -o pipefail` reicht das die 1 durch head hindurch — die Zuweisung
  # schluege fehl und `set -e` wuerde die Worktree-Erstellung abbrechen. Solange
  # dieser Block auf BRANCH_EXISTS=1 beschraenkt war, fiel das nie auf. [T002114]
  canary="$(find "$WT_PATH/environments/.secrets" -type f 2>/dev/null | head -1)" || canary=""
  if [ -z "$canary" ] && [ -f "$WT_PATH/.claude/settings.json" ]; then
    canary="$WT_PATH/.claude/settings.json"
  fi
  if [ -n "$canary" ] && bash "$(dirname "$0")/git-crypt-guard.sh" is-encrypted "$canary" 2>/dev/null; then
    echo "worktree-create: stale smudge filter detected (secrets encrypted despite unlocked repo) — re-initializing" >&2
    mkdir -p "$WT_GITDIR/git-crypt/keys"
    cp "$KEY_SRC" "$WT_GITDIR/git-crypt/keys/default"
    git -C "$WT_PATH" config extensions.worktreeConfig true
    # Drop the stale worktree-local smudge=cat too — without this the forced
    # checkout below still runs with the cat passthrough and the
    # "re-initialized" worktree stays encrypted-at-rest. [T001977]
    git -C "$WT_PATH" config --worktree --unset filter.git-crypt.smudge 2>/dev/null || true
    git -C "$WT_PATH" config --worktree --unset filter.git-crypt.clean  2>/dev/null || true
    git -C "$WT_PATH" config --worktree filter.git-crypt.required true
    # Non-fatal: schlaegt der Checkout am kaputten Filter fehl, soll die
    # Diagnose unten laufen statt dass `set -e` mit einer nichtssagenden
    # Rollback-Meldung abbricht. [T002114]
    checkout_rc=0
    git -C "$WT_PATH" checkout --force || checkout_rc=$?

    # Nachpruefen statt hoffen [T002114]. Die Reparatur oben fasst nur
    # worktree-lokale Config an — sitzt die Ursache in der geteilten
    # .git/config, bleibt sie wirkungslos. Dann lieber laut abbrechen als
    # einen Worktree zurueckgeben, der beim ersten `git status` explodiert
    # (oder schlimmer: Klartext-Secrets stageable macht).
    if [ "$checkout_rc" -ne 0 ] \
       || bash "$(dirname "$0")/git-crypt-guard.sh" is-encrypted "$canary" 2>/dev/null; then
      echo "worktree-create: FEHLER — Secrets sind nach der Reparatur immer noch verschluesselt." >&2
      echo "  Canary: $canary" >&2
      echo "  Wahrscheinliche Ursache: kaputte git-crypt-Filter in der GETEILTEN Config" >&2
      echo "  ($COMMON_DIR/config). Pruefen mit:" >&2
      echo "    git config --show-origin --get-regexp 'filter\\.git-crypt'" >&2
      echo "  Erwartet: smudge='git-crypt smudge', clean='git-crypt clean', required=true." >&2
      echo "  Leere Werte reparieren mit:" >&2
      echo "    git config filter.git-crypt.smudge 'git-crypt smudge'" >&2
      echo "    git config filter.git-crypt.clean  'git-crypt clean'" >&2
      echo "    git config filter.git-crypt.required true" >&2
      exit 1
    fi
  fi
fi

# Pre-compute MAIN_ROOT (needed by the node_modules symlink).
MAIN_ROOT="$(dirname "$COMMON_DIR")"

# 2) node_modules: git worktrees don't share the gitignored root node_modules,
#    and several `task test:all` subtasks (test:docs-gen, test:agent-guide) import
#    third-party packages from it. Symlink the base checkout's node_modules so the
#    worktree resolves deps instantly — no 536M reinstall, and the Taskfile's
#    `[ -d node_modules ] || npm ci` guards short-circuit (avoiding their race
#    under concurrent test:all). Skipped cleanly if the base has none. [T000526]
if [ -d "$MAIN_ROOT/node_modules" ] && [ ! -e "$WT_PATH/node_modules" ]; then
    ln -s "$MAIN_ROOT/node_modules" "$WT_PATH/node_modules"
    echo "worktree-create: linked node_modules → $MAIN_ROOT/node_modules" >&2
fi
# Workspace packages (pnpm): each such package (website/, brett/, mentolder-web/,
# ...) has its own pnpm-workspace.yaml AND its own node_modules, neither of which
# is covered by the root symlink above. T002204: the old hardcoded website-only
# symlink left every OTHER pnpm-managed package without deps in the worktree,
# breaking `task test:changed` (vitest "module not found") whenever the touched
# package wasn't website/. Discover every such package by its pnpm-workspace.yaml
# marker and link its node_modules too.
while IFS= read -r -d '' _ws_file; do
    _pkg_dir="$(dirname "$_ws_file")"
    _pkg_rel="${_pkg_dir#"$MAIN_ROOT"/}"
    [ "$_pkg_rel" = "$_pkg_dir" ] && continue  # not under MAIN_ROOT — skip defensively
    if [ -d "$MAIN_ROOT/$_pkg_rel/node_modules" ] && [ ! -e "$WT_PATH/$_pkg_rel/node_modules" ]; then
        mkdir -p "$WT_PATH/$_pkg_rel"
        ln -s "$MAIN_ROOT/$_pkg_rel/node_modules" "$WT_PATH/$_pkg_rel/node_modules"
        echo "worktree-create: linked $_pkg_rel/node_modules → $MAIN_ROOT/$_pkg_rel/node_modules" >&2
    fi
done < <(find "$MAIN_ROOT" -maxdepth 2 -name pnpm-workspace.yaml -not -path '*/node_modules/*' -print0 2>/dev/null)

# Branch-warning: the node_modules symlinked above reflect whatever the SOURCE
# checkout (MAIN_ROOT) currently has installed for ITS checked-out branch. If
# that differs from the branch this worktree now sits on, the linked deps may
# be stale/incompatible for this branch's package.json / lockfile — surface it
# instead of failing silently on a dependency mismatch later. [T002204]
#
# [T002495-M3] FACTORY RISK: The Software Factory dispatches from MAIN_ROOT.
# When the main checkout is NOT on `main`, queue/backlog reads are measured
# against the wrong branch. This warning fires on every worktree creation, but
# is only shown at that moment — not on subsequent use. Prefer always keeping
# the main checkout on `main` (reset with: git -C "$MAIN_ROOT" checkout main).
_source_branch="$(git -C "$MAIN_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")"
if [ -n "$_source_branch" ] && [ "$_source_branch" != "HEAD" ] && [ "$_source_branch" != "$BRANCH" ]; then
    echo "worktree-create: WARNUNG — Quell-Checkout ($MAIN_ROOT) steht auf Branch '$_source_branch', dieser Worktree auf '$BRANCH'. Verlinkte node_modules koennen von diesem Branch abweichen." >&2
    if [ "$_source_branch" != "main" ]; then
        echo "worktree-create: WARNUNG — Quell-Checkout steht NICHT auf main. Die Software Factory dispatched aus diesem Verzeichnis und misst Queue-Abfragen gegen den falschen Branch. [T002495-M3]" >&2
    fi
fi

# T002239-M3: Guard reminder — warn that pnpm install inside a worktree
# with symlinked node_modules breaks the main checkout's pnpm config.
if [ -n "$(find "$WT_PATH" -maxdepth 3 -name pnpm-workspace.yaml -not -path '*/node_modules/*' -print -quit 2>/dev/null)" ]; then
    echo "worktree-create: HINWEIS — 'pnpm install' in diesem Worktree wuerde die" >&2
    echo "  Haupt-Checkout-Konfiguration von pnpm zerstoeren (symlink-bug T002239-M3)." >&2
    echo "  Nutze 'scripts/guard-pnpm-install.sh' als Pre-Check vor pnpm install." >&2
fi

_ok=1   # reached a clean finish — disarm the rollback trap

# Anker-Commit auf einem FRISCH angelegten Branch. [T002412]
#
# Ein neuer Branch hat null Commits ueber seiner Basis. Fuer jede Aufraeumlogik, die
# Loeschbarkeit an Commit-Ancestry festmacht ("ist vollstaendig in main enthalten?"),
# ist er damit nicht von einem fertig gemergten Branch zu unterscheiden — und
# `git branch -D` plus `git worktree remove --force` raeumen ihn ab, waehrend noch
# jemand darin arbeitet.
#
# Belegt am 2026-07-28: zwei Worktrees wurden im Abstand von Sekunden angelegt. Der
# zu T002407 trug bereits einen Commit und ueberlebte; der zu T002408 hatte keinen und
# wurde mitten im Lauf samt Branch entfernt (verifiziert: nicht in `git worktree list`,
# `git branch --list` leer, nie auf origin). Welcher Aufrufer es war, liess sich nicht
# rekonstruieren — `cleanup.sh` und `auto-chore-plan.sh` scheiden aus, beide loeschen
# nur explizit uebergebene bzw. eigene Pfade. Der Anker wirkt unabhaengig davon:
# er macht den Branch fuer JEDE Ancestry-Pruefung sichtbar als "nicht enthalten".
#
# Best-effort und bewusst nicht fatal: schlaegt der Commit fehl, ist der Worktree
# trotzdem brauchbar. `--no-verify`, weil der Commit keine Dateien traegt — es gibt
# nichts zu linten oder auf Secrets zu scannen, und ein Hook-Fehlschlag darf die
# Worktree-Erstellung nicht scheitern lassen.
#
# KEIN `[skip ci]` in diesem Subject [T002522]. Der Squash-Merge faltet die Subjects
# aller Branch-Commits in den BODY des main-Commits, und GitHub wertet seine
# Skip-Marker gegen die gesamte Message des Head-Commits aus — ein Marker hier legt
# also nach dem Merge SAEMTLICHE push-getriggerten Workflows auf main still, ohne
# einen fehlgeschlagenen Lauf zu hinterlassen. Gemessen ueber 25 aufeinanderfolgende
# main-Commits: 17 mit Marker erzeugten 0 push-Runs, 8 ohne erzeugten je einen.
# Fuer den Anker selbst waere der Marker ohnehin wirkungslos: ci.yml triggert per
# Push nur auf main und release-please--branches--main, und einen PR gibt es zu
# diesem Zeitpunkt noch nicht. Guard: scripts/check-skip-ci-marker.sh (in ci.yml).
if [ "$BRANCH_EXISTS" -eq 1 ]; then
    echo "worktree-create: $WT_PATH ready on existing branch $BRANCH"
else
    if git -C "$WT_PATH" commit --allow-empty --no-verify -q \
         -m "chore: anchor branch $BRANCH" 2>/dev/null; then
        echo "worktree-create: Anker-Commit gesetzt (schuetzt vor Ancestry-basiertem Cleanup)" >&2
    else
        echo "worktree-create: WARNUNG — Anker-Commit fehlgeschlagen; der Branch hat null" >&2
        echo "  Commits ueber $BASE und kann von Aufraeumlogik als 'gemergt' geloescht werden." >&2
    fi
    echo "worktree-create: $WT_PATH ready on branch $BRANCH (base $BASE)"
fi
