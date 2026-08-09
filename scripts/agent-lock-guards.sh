#!/usr/bin/env bash
# scripts/agent-lock-guards.sh — die beiden Git-Hook-Guards von agent-lock.sh.
#
# Herausgelöst aus scripts/agent-lock.sh [T002375-p1], weil diese bei 464 Zeilen nur
# noch 36 Zeilen unter dem S1-Limit (.sh = 500) hatte und der Change dort mehr braucht.
# Eine echte Extraktion, keine kosmetische Zusammenziehung.
#
# WIRD NICHT DIREKT AUFGERUFEN. Die Datei wird von agent-lock.sh gesourct; die
# Aufrufschnittstelle bleibt `bash scripts/agent-lock.sh guard-precommit|guard-postcheckout`.
# Die beiden externen Aufrufer .githooks/pre-commit und .githooks/post-checkout bleiben
# deshalb unverändert — sie gehören einem anderen Partial dieses Changes.
#
# Alle hier benutzten Helfer (_lock_file, _with_lock, _reapable, _lock_field, _my_sid,
# _holder_msg, _git_op_in_progress, _self_claim_main_checkout, $_SELF_CLAIM_LABEL)
# stammen aus agent-lock.sh und sind zum Sourcing-Zeitpunkt definiert.

cmd_guard_precommit() {
  [ -n "${AGENT_LOCK_FORCE:-}" ] && return 0
  local f; f="$(_lock_file main-checkout)"
  _with_lock
  # Only a DELIBERATE foreign claim (any label other than the auto self-claim one) still
  # hard-blocks — an auto-claimed lock is bookkeeping, not a real exclusive hold, so it must
  # never block a different session's ordinary commit. [T001383]
  if [ -f "$f" ] && _unparsable_lock "$f"; then
    echo "AGENT-LOCK: Lockdatei $f ist beschaedigt (kein auswertbarer Inhalt)." >&2
    echo "  Sie benennt keinen Halter — kein Commit wird dadurch blockiert." >&2
    echo "  Beheben: 'bash scripts/agent-lock.sh reap' oder die Datei entfernen." >&2
  elif [ -f "$f" ] && ! _reapable "$f" \
     && [ "$(_lock_field "$f" owner_sid)" != "$(_my_sid)" ] \
     && [ "$(_lock_field "$f" label)" != "$_SELF_CLAIM_LABEL" ]; then
    echo "AGENT-LOCK: main-Checkout $(_holder_msg "$f")" >&2
    echo "  Eine andere Session arbeitet im main-Checkout. Nutze einen Worktree" >&2
    echo "  (scripts/worktree-create.sh) oder erzwinge: AGENT_LOCK_FORCE=1 git commit ..." >&2
    return 1
  fi
  # No live foreign deliberate lock blocks the commit → self-claim so the `branch` field
  # stays populated for guard-postcheckout. Best-effort; must never block the commit. [T001383]
  _self_claim_main_checkout || true
  return 0
}

cmd_guard_postcheckout() {
  local f; f="$(_lock_file main-checkout)"
  [ -f "$f" ] || return 0
  _reapable "$f" && return 0
  [ "$(_lock_field "$f" owner_sid)" = "$(_my_sid)" ] && return 0
  # Exemption first: never warn or revert mid rebase/merge/cherry-pick.
  _git_op_in_progress && return 0
  echo "AGENT-LOCK (Warnung): main-Checkout $(_holder_msg "$f") — paralleler Branch-Switch riskant." >&2
  # Opt-out escape hatch.
  [ "${AGENT_LOCK_POSTCHECKOUT_REVERT:-1}" = "0" ] && return 0
  # Best-effort revert onto the lock's recorded branch — never a raw SHA.
  local br; br="$(_lock_field "$f" branch)"
  [ -n "$br" ] || return 0
  git show-ref --verify --quiet "refs/heads/$br" || return 0
  [ "$(git rev-parse --abbrev-ref HEAD 2>/dev/null)" = "$br" ] && return 0
  if git checkout "$br" >/dev/null 2>&1; then
    echo "AGENT-LOCK: main-Checkout auf '$br' zurückgesetzt (Lock-Halter aktiv)." >&2
    echo "  Eigener Wechsel gewuenscht? 'bash scripts/agent-lock.sh reclaim-main-checkout'" >&2
    echo "  VOR dem naechsten checkout, falls der Lock nur Bookkeeping ist." >&2
  else
    echo "AGENT-LOCK: Revert auf '$br' fehlgeschlagen — bitte manuell prüfen." >&2
  fi
  return 0
}
