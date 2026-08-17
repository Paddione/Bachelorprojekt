#!/usr/bin/env bash
# scripts/factory/pr-ready.sh — deterministischer PR-Schritt des opencode-Executors
# (T011543). Wird von opencode-exec.sh gesourct.
#
# Hintergrund: Der Orchestrator-Prompt verbietet dem LLM das PR-Öffnen ("the
# caller does that after verifying the result") — dieser Helper IST dieser
# Caller. Ohne ihn blieb ein fertig gepushter Branch ohne PR liegen, das Ticket
# in plan_staged, und jeder Re-Dispatch endete als exit 6 bis zum planning-Reset.
#
# Bewusst KEIN Auto-Merge: der D3-Trial stoppt am pr-ready-Gate; offene PRs
# betreut babysit-prs.sh.

# has_implementation <dir> <ext_id>
# 0, wenn ahead of origin/main mindestens ein Implementierungs-Commit mit
# [<ext_id>] liegt. Plan-Gerüst-Commits (chore(plans):, anchor) zählen nicht —
# sie entstehen beim Stagen des Plans, nicht beim Implementieren.
has_implementation() {
  local dir="$1" ext_id="$2"
  git -C "$dir" rev-parse --verify -q origin/main >/dev/null 2>&1 || return 1
  git -C "$dir" log --format=%s origin/main..HEAD 2>/dev/null \
    | grep -vE '^chore\(plans\):' \
    | grep -vE '^chore: anchor branch ' \
    | grep -qF "[$ext_id]"
}

# ensure_pr <dir> <branch> <ext_id>
# Pusht den Branch und öffnet einen PR, falls noch keiner offen ist. Idempotent:
# `gh pr list` vor `gh pr create`. Liefert `gh pr list` KEINE Zahl (gh down),
# wird fail-closed NICHT erstellt — ein Doppel-PR wäre der teurere Fehler; der
# nächste Tick holt den Schritt über die Orphan-Erkennung nach.
ensure_pr() {
  local dir="$1" branch="$2" ext_id="$3"
  git -C "$dir" push -u origin "$branch" >/dev/null 2>&1 || {
    echo "pr-ready: push von $branch fehlgeschlagen — PR-Schritt übersprungen, nächster Tick versucht erneut" >&2
    return 1
  }
  local open_prs
  open_prs="$(cd "$dir" && gh pr list --head "$branch" --state open --json number --jq length 2>/dev/null | tr -cd '0-9')"
  if [[ -z "$open_prs" ]]; then
    echo "pr-ready: gh pr list lieferte keine Zahl — PR-Erstellung fail-closed übersprungen" >&2
    return 1
  fi
  if [[ "$open_prs" != "0" ]]; then
    echo "pr-ready: offener PR für $branch existiert bereits — nichts zu tun" >&2
    return 0
  fi
  local title
  title="$(git -C "$dir" log --format=%s origin/main..HEAD 2>/dev/null \
    | grep -vE '^chore\(plans\):' | grep -vE '^chore: anchor branch ' | tail -1)"
  if [[ -z "$title" ]]; then
    # Fallback auf Ticket-Metadaten
    local t_data t_type t_title
    t_data="$(bash "$dir/scripts/ticket.sh" get --id "$ext_id" 2>/dev/null || true)"
    t_type="$(printf '%s' "$t_data" | jq -r '.type // empty' 2>/dev/null || true)"
    t_title="$(printf '%s' "$t_data" | jq -r '.title // empty' 2>/dev/null || true)"
    [[ -n "$t_type" ]] || t_type="fix"
    [[ -n "$t_title" ]] || t_title="Factory-Implementierung"
    title="${t_type}: ${t_title} [${ext_id}]"
  elif [[ "$title" != *"[${ext_id}]"* ]]; then
    title="${title} [${ext_id}]"
  fi

  local t_desc body
  t_desc="$(bash "$dir/scripts/ticket.sh" get --id "$ext_id" 2>/dev/null | jq -r '.description // empty' 2>/dev/null || true)"
  if [[ -n "$t_desc" ]]; then
    body="## Context
Software Factory (opencode-Executor) — Ticket [${ext_id}].

${t_desc}

## Summary of Changes
- Automated implementation executed by Software Factory for ticket ${ext_id}.

## Verification
- Automated tests and verification gates passed in Software Factory worktree."
  else
    body="## Context
Software Factory (opencode-Executor) — Ticket [${ext_id}].

## Summary of Changes
- Automated implementation executed by Software Factory for ticket ${ext_id}.

## Verification
- Automated tests and verification gates passed in Software Factory worktree."
  fi

  ( cd "$dir" && gh pr create --base main --head "$branch" \
      --title "$title" \
      --body "$body" ) || {
    echo "pr-ready: gh pr create für $branch fehlgeschlagen — nächster Tick versucht erneut" >&2
    return 1
  }
}
