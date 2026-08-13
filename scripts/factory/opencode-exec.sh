#!/usr/bin/env bash
# scripts/factory/opencode-exec.sh — opencode orchestrator executor (opt-in, T002128).
# Called by dispatcher-bridge.sh when FACTORY_EXECUTOR=opencode. Builds an orchestrator
# prompt (ticket, branch, worktree, plan, ## Partials manifest, trial guardrails), runs
# `opencode run --agent orchestrator --format json` in the launch worktree, and records
# `implement` phase-events (entered/done/blocked) with structured detail JSON. Exit != 0
# => a blocked event and NO fallback to claude -p (observability over convenience).
#
# Usage: opencode-exec.sh <ticket_ext_id> <launch_dir> <branch> <plan_path>
#
# Exit-Codes (jede Ursache ihr eigener Code — gleiche Codes machen das Journal
# unlesbar, siehe T003275):
#   0  Lauf erfolgreich, Commit vorhanden
#   2  opencode-Binary nicht gefunden (T003275; bewusst nicht 127)
#   6  Orchestrator lief, hinterliess aber weder Commit noch Aenderung (T003335)
#   7  ohne Branch/Plan abgelehnt, Lauf gar nicht erst gestartet (T003773)
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"

EXT_ID="${1:-}"; LAUNCH_DIR="${2:-}"; BRANCH="${3:-}"; PLAN_PATH="${4:-}"
[[ -z "$EXT_ID" ]] && { echo "opencode-exec: missing ticket ext_id" >&2; exit 2; }
[[ -n "$LAUNCH_DIR" && -d "$LAUNCH_DIR" ]] || LAUNCH_DIR="$REPO"

# --- opencode-Binary selbst aufloesen (T003275) -------------------------------
# Der Factory-Lauf laeuft als systemd-User-Service, dessen PATH `~/.npm-global/bin`
# nicht enthaelt. Interaktiv funktioniert `command -v opencode`, im Dienst nicht —
# ein nicht auffindbares Binary legte jede Pipeline mit Exit 127 still. Deshalb
# wird das Binary explizit gesucht (Override > PATH > npm-global) und bei Fehlen
# mit einem von 127 unterscheidbaren Code und einer Ursachenmeldung abgebrochen.
OPENCODE_BIN="${OPENCODE_BIN:-$(command -v opencode 2>/dev/null || echo "$HOME/.npm-global/bin/opencode")}"
if [[ -z "${OPENCODE_BIN}" || ! -x "${OPENCODE_BIN}" ]]; then
  echo "opencode-exec: opencode-Binary nicht gefunden (gesucht: \$OPENCODE_BIN, command -v opencode, \$HOME/.npm-global/bin/opencode) — Abbruch mit Exit 2 statt 127" >&2
  exit 2
fi

# --- load plan body + extract the ## Partials manifest (best-effort) -----------------
plan_body=""
if [[ -n "$PLAN_PATH" && -f "$LAUNCH_DIR/$PLAN_PATH" ]]; then
  plan_body="$(cat "$LAUNCH_DIR/$PLAN_PATH")"
elif [[ -n "$BRANCH" && -n "$PLAN_PATH" ]]; then
  plan_body="$(git -C "$REPO" show "origin/${BRANCH}:${PLAN_PATH}" 2>/dev/null || true)"
fi
partials_manifest="$(printf '%s\n' "$plan_body" \
  | awk '/^##[[:space:]]+Partials/{f=1;print;next} f&&/^##[[:space:]]/{f=0} f{print}')"
[[ -z "${partials_manifest//[[:space:]]/}" ]] \
  && partials_manifest="(no ## Partials section — orchestrator partitions the plan itself)"
mapfile -t partial_ids < <(printf '%s\n' "$partials_manifest" \
  | grep -oiE '\bp[0-9]+\b' | tr 'P' 'p' | awk '!seen[$0]++')

# --- helper: record one implement phase-event (positional ticket.sh phase form) ------
phase_event() { # <state> <subagent> <partial> <duration_s> <exit> [reason]
  local detail
  # [T003773] 6. Feld `reason` optional und mit Leer-Default, damit die
  # bestehenden 5-Argument-Aufrufer unveraendert weiterlaufen.
  detail="$(jq -cn --arg s "$2" --arg p "$3" --argjson d "${4:-0}" --argjson e "${5:-0}" --arg r "${6:-}" \
    '{executor:"opencode",subagent:$s,partial:$p,duration_s:$d,exit:$e,reason:$r}')"
  bash "$REPO/scripts/ticket.sh" phase "$EXT_ID" implement "$1" \
    --driver factory --detail "$detail" 2>/dev/null || true
}

# --- zweite Verteidigungslinie gegen planlose Laeufe [T003773] ----------------------
# Das Readiness-Gate in dispatcher-bridge.sh faengt diesen Fall bereits ab; dies
# hier greift, wenn opencode-exec.sh von woanders aufgerufen wird. Der Grund fuer
# eine zweite Linie: der LAUNCH_DIR-Fallback oben setzt bei fehlendem Worktree auf
# $REPO — den geteilten Haupt-Checkout. Ein Lauf dort rebaste und benannte am
# 2026-08-11 den Branch einer fremden Session um (T003773).
#
# "null" kommt als LITERALSTRING an: scripts/vda/factory-prep.sh setzt die
# Bash-Literale branch=null/plan_path=null und reicht sie per `jq --arg` weiter,
# was daraus einen JSON-String macht. Deshalb reicht `-z` allein nicht.
[[ "$BRANCH"    == "null" ]] && BRANCH=""
[[ "$PLAN_PATH" == "null" ]] && PLAN_PATH=""
if [[ -z "$BRANCH" || -z "$PLAN_PATH" ]]; then
  phase_event blocked orchestrator all 0 7 no_plan
  echo "opencode-exec: $EXT_ID ohne Branch/Plan — Abbruch (reason=no_plan) statt Lauf im Haupt-Checkout" >&2
  # Exit 7, nicht 2: 2 belegt bereits "opencode-Binary nicht gefunden" (T003275).
  # Gleiche Codes fuer verschiedene Ursachen machen das Journal unlesbar.
  exit 7
fi

phase_event entered orchestrator all 0 0

# --- build the orchestrator prompt (manifest as a data arg — NO shell expansion) -----
PROMPT="$(printf '%s\n' \
  "You are the Software Factory orchestrator. Implement ticket ${EXT_ID} from its staged plan." \
  "Feature branch (origin): ${BRANCH:-<none>}" \
  "Worktree (your cwd): ${LAUNCH_DIR}" \
  "Plan file: ${PLAN_PATH:-<none>}" \
  "" \
  "Dispatch up to 4 local family subagents (gptoss/devstral/gemma/qwen) onto the" \
  "DISJOINT partials below; each owns its partial end-to-end (edit, test) inside" \
  "this worktree." \
  "" \
  "## Partials" \
  "${partials_manifest}" \
  "" \
  "## Required end state (T003335)" \
  "The run counts as done ONLY if all of these hold when you finish:" \
  "1. The plan is implemented in this worktree." \
  "2. The plan's failing test is green." \
  "3. The work is COMMITTED on ${BRANCH:-the feature branch} with a conventional" \
  "   commit whose subject carries [${EXT_ID}]." \
  "4. The commit is PUSHED to origin." \
  "Do NOT stop after analysing the plan. A run that ends without a commit is a" \
  "failed run, not a finished one — the executor verifies this and will mark the" \
  "phase blocked." \
  "" \
  "Guardrails (opt-in trial, D3):" \
  "- Do NOT merge the PR and do NOT enable auto-merge — stop at the pr-ready gate." \
  "- Do NOT open a PR either; the caller does that after verifying the result." \
  "- Respect the existing pr-ready / CI gate; never bypass it." \
  "- Empty-return rule (M2/M3): if a dispatched subagent returns an empty/blank" \
  "  final message, switch model on the FIRST empty return — deepseek-flash-direct" \
  "  (M2), then deepseek-pro (M3). Never re-dispatch the same model after an empty" \
  "  return; resume the session instead (T002620) or escalate (T002482)." \
  "- After 2 failed attempts on a single partial, escalate THAT partial to the" \
  "  deepseek-helper subagent (do not loop the same local agent)." \
  "- Report only the final JSON result.")"

# --- run opencode in the launch worktree, measure duration ---------------------------
start=$(date +%s)
run_log="$(mktemp)"

# Stand VOR dem Lauf festhalten — er ist der Bezugspunkt des Ergebnis-Checks unten.
# `git rev-parse HEAD` schlaegt in einem Verzeichnis ohne Repo fehl; dann bleibt
# head_before leer und der Check faellt auf den Arbeitsbaum-Vergleich zurueck.
head_before="$(git -C "$LAUNCH_DIR" rev-parse HEAD 2>/dev/null || true)"

( cd "$LAUNCH_DIR" && "$OPENCODE_BIN" run --agent orchestrator --format json "$PROMPT" ) \
  >"$run_log" 2>&1
ex=$?
dur=$(( $(date +%s) - start ))

# --- Ergebnis-Check (T003335) --------------------------------------------------------
# Bis T003335 stammte `state` ALLEIN aus dem Exit-Code. Ein Orchestrator, der lief und
# nichts tat, endete mit 0 und wurde als `implement/done` verbucht — beobachtet an
# T002843 (duration_s=157, exit=0, kein Diff). Der Exit-Code sagt "der Prozess ist
# sauber zurueckgekehrt", nicht "es ist Arbeit entstanden". Das sind zwei Aussagen.
#
# Geprueft wird deshalb das Ergebnis: ein neuer Commit gegenueber head_before, oder
# — falls der Orchestrator absichtlich uncommittet uebergibt — ein nicht leerer
# Arbeitsbaum. Beides fehlt => der Lauf hat nichts geleistet.
#
# Fail-closed ist hier richtig: ein faelschlich als `done` verbuchtes Ticket verlaesst
# die Queue und kehrt nie zurueck, waehrend ein faelschlich `blocked` gemeldetes im
# naechsten Tick erneut dispatcht wird. Der teurere Fehler ist das stille `done`.
produced_work=false
if [[ $ex -eq 0 ]]; then
  head_after="$(git -C "$LAUNCH_DIR" rev-parse HEAD 2>/dev/null || true)"
  if [[ -n "$head_after" && "$head_after" != "$head_before" ]]; then
    produced_work=true
  elif [[ -n "$(git -C "$LAUNCH_DIR" status --porcelain 2>/dev/null)" ]]; then
    produced_work=true
  fi
  if [[ "$produced_work" != true ]]; then
    ex=6   # kollisionsfrei: 2 Bedienfehler, 127 Kommando fehlt
    echo "opencode-exec: orchestrator run for $EXT_ID exited 0 but produced NO commit and NO working-tree change — treating as blocked [T003335]" >&2
  fi
fi

state=done; [[ $ex -ne 0 ]] && state=blocked

# --- terminal telemetry: one event per partial (deterministic gang-slot mapping) -----
if [[ ${#partial_ids[@]} -eq 0 ]]; then
  phase_event "$state" orchestrator all "$dur" "$ex"
else
  i=0
  for pid in "${partial_ids[@]}"; do
    phase_event "$state" "bonsai-8b-$(( i % 4 + 1 ))" "$pid" "$dur" "$ex"
    i=$(( i + 1 ))
  done
fi

# --- Retry-Limit (T003810): drei No-Commit-Runden ohne Implementierung stoppen --------
# Der Ergebnis-Check oben hat ex=6 gesetzt, wenn der Orchestrator weder Commit
# noch Arbeitsbaum-Aenderung hinterliess. So ein Lauf bedeutet: mit dem aktuellen
# Setup ist der Plan nicht umsetzbar. Weil dieser Pfad nur ein blocked-Phase-
# Event schreibt (kein Statuswechsel), wuerde der naechste Tick dasselbe Ticket
# erneut dispatchen — beobachtet an T003625 (3x exit 6 ohne Implementierung).
#
# Der Zaehler ist tickets.retry_count (ticket.sh retry-count): Schreiber ist
# dieser Pfad (incr bei exit 6, reset bei Commit), Leser factory-floor.ts
# (Anzeige "retry erschoepft"). Nach 3 aufeinanderfolgenden No-Commit-Runden
# geht das Ticket nach `planning` zurueck (Plan ist nicht umsetzbar) und der
# Slot wird freigegeben — statt endlos zu wiederholen.
if [[ "$produced_work" == true ]]; then
  bash "$REPO/scripts/ticket.sh" retry-count reset --id "$EXT_ID" >/dev/null 2>&1 || true
elif [[ $ex -eq 6 ]]; then
  retries="$(bash "$REPO/scripts/ticket.sh" retry-count incr --id "$EXT_ID" 2>/dev/null | tail -1 || true)"
  retries="$(printf '%s' "$retries" | tr -cd '0-9')"
  if [[ -n "$retries" && "$retries" -ge 3 ]]; then
    echo "opencode-exec: $EXT_ID — 3 aufeinanderfolgende Laeufe ohne Implementierungs-Commit (exit 6) — Ticket auf planning zurueckgesetzt, Slot freigegeben" >&2
    bash "$REPO/scripts/ticket.sh" update-status --id "$EXT_ID" --status planning >/dev/null 2>&1 || true
    bash "$REPO/scripts/ticket.sh" release-slot --id "$EXT_ID" >/dev/null 2>&1 || true
    bash "$REPO/scripts/ticket.sh" add-comment --id "$EXT_ID" \
      --body "Factory: 3 aufeinanderfolgende Laeufe ohne Implementierungs-Commit (exit 6) — Plan ist mit dem aktuellen Setup nicht umsetzbar. Ticket auf planning zurueckgesetzt, Slot freigegeben." >/dev/null 2>&1 || true
    bash "$REPO/scripts/ticket.sh" retry-count reset --id "$EXT_ID" >/dev/null 2>&1 || true
    # Worktree freigeben (best-effort). exit 6 bedeutet per Definition: nichts
    # geaendert — der Force-Remove ist hier gefahrlos. Schlaegt er fehl (kein
    # registrierter Worktree), raeumt der Watchdog spaeter auf.
    if [[ "$LAUNCH_DIR" != "$REPO" ]]; then
      if git -C "$REPO" worktree remove --force "$LAUNCH_DIR" 2>/dev/null; then
        git -C "$REPO" worktree prune 2>/dev/null || true
      else
        echo "opencode-exec: worktree cleanup for $LAUNCH_DIR failed — watchdog will reap" >&2
      fi
    fi
  fi
fi

if [[ $ex -ne 0 ]]; then
  echo "opencode-exec: orchestrator run for $EXT_ID exited $ex (blocked; NO claude fallback)" >&2
  # Das Run-Log ist die einzige Spur, WARUM der Orchestrator nichts getan hat. Bis
  # T003335 wurde es bei Exit 0 ungelesen geloescht — und weil ein leerer Lauf damals
  # als Exit 0 galt, war genau der interessante Fall der einzige ohne Beweismittel.
  tail -n 40 "$run_log" | sed "s/^/[opencode-exec:${EXT_ID}] /" >&2
fi
rm -f "$run_log"
exit "$ex"
