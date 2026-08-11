#!/usr/bin/env bash
# scripts/factory/watchdog.sh — escalate stale in-flight features for a brand.
#   BRAND=<brand> FACTORY_STALE_MIN=30 bash scripts/factory/watchdog.sh
# A feature/task in_progress whose updated_at is older than the threshold is
# treated as a hung/crashed pipeline: slot released, a comment recorded, and
# status reset. If a FACTORY-PLAN-REF already exists (dev-flow-plan staged a
# plan before the pipeline hung), the reset target is 'backlog' (feature) or
# 'plan_staged' (task) instead of 'triage' — pipeline.js auto-detects
# FACTORY-PLAN-REF and resumes at Implement, skipping Scout/Design/Plan, so a
# ticket with a staged plan must land back in a status queue.sh dispatches
# (triage is not dispatched, which forced a wasteful full re-plan) [T001850].
# updated_at is auto-bumped by fn_lifecycle_ts on every row write; pipeline.js
# writes a `ticket.sh touch` at each phase boundary, so a healthy long phase
# is not mistaken for stale. JSON array of escalated ext_ids.
set -euo pipefail
HERE="$(dirname "${BASH_SOURCE[0]}")"
source "$HERE/lib.sh"

# [T002674] Ausschlussliste statt Allowlist — dieselbe Lektion, die queue.sh
# unter T002329/T002333/T002407 bereits gelernt hat und dort ausformuliert
# kommentiert: eine positive Typenliste altert in die UNSICHERE Richtung, weil
# jeder neue Typ per Default durchfaellt. Der Watchdog wurde damals nicht
# nachgezogen und filterte weiter auf type IN ('feature','feat','task','chore').
# Gemessen am 2026-08-04: 'feature' und 'task' haben null Zeilen (bei der
# Typ-Konsolidierung abgeloest), waehrend 'fix' mit 670 Zeilen der
# zweithaeufigste Typ ist — und komplett unsichtbar war. Folge: drei haengende
# fix-Tickets belegten alle drei Slots 2h54m lang ohne ein einziges
# factory_phase_events; der Watchdog haette nach 30 Minuten zurueckgesetzt.
# Ausgeschlossen bleiben nur die Typen, die nie selbst einen Slot belegen:
# 'project' (Epic-Container) und 'incident' (needs_human) — identisch zu queue.sh.
STALE_EXCLUDED_TYPES="'project','incident'"
STALE_MIN="${FACTORY_STALE_MIN:-30}"

_stale_query() {
  printf "SELECT external_id, type FROM tickets.tickets WHERE type NOT IN (%s) AND status='in_progress' AND updated_at < now() - make_interval(mins => %s);" \
    "$STALE_EXCLUDED_TYPES" "$STALE_MIN"
}

# Diagnosemodus: gibt die Stale-Query aus, ohne Cluster oder DB anzufassen.
# Steht bewusst VOR factory_resolve — im Stoerfall ist der Cluster oft genau das,
# was nicht erreichbar ist, und dann muss die Frage "welche Tickets sieht der
# Watchdog ueberhaupt?" trotzdem beantwortbar bleiben.
# Guard: tests/spec/factory-watchdog/stale-type-coverage.bats
if [[ "${1:-}" == "--print-stale-query" ]]; then
  _stale_query
  exit 0
fi

BRAND="${BRAND:-}"
factory_resolve
[[ -n "${FACTORY_DRY_RESOLVE:-}" ]] && { echo "resolved: ctx=${FACTORY_CTX} ns=${FACTORY_NS}"; exit 0; }
# After this many consecutive stale rounds WITHOUT real phase progress a ticket is
# handed to `ticket.sh unfactory` instead of being reset into the queue again
# (T002361). At the 30-minute default that is ~90 minutes before a human is asked.
MAX_ATTEMPTS="${FACTORY_MAX_ATTEMPTS:-3}"
# Separate limit for infrastructure failures (no phase events ever written — DB
# down, cluster unreachable, etc.). These do NOT consume the MODEL attempt budget
# (T002389). Default 3 as well; a higher value means the watchdog will retry on
# the same level more often before escalating.
MAX_INFRA_ATTEMPTS="${FACTORY_INFRA_MAX_ATTEMPTS:-3}"

mapfile -t stale < <(_stale_query | factory_psql)

# Zombie-Worktree-Cleanup: a hung pipeline leaves .worktrees/sf-* behind. Remove the
# worktree whose branch matches this ticket (idempotent; never fails the loop).
# Extracted into a function with T002361 so the escalation path gets the same
# housekeeping as the reset path — an unfactored ticket must not leave a worktree
# behind just because it took the other branch.
_wd_cleanup_worktree() {
  local ext_id="$1" ext_lc stale_wt
  ext_lc="$(printf '%s' "$ext_id" | tr '[:upper:]' '[:lower:]')"
  stale_wt="$(git worktree list --porcelain 2>/dev/null \
    | awk -v p1="refs/heads/feature/sf-$ext_lc" -v p2="refs/heads/chore/sf-$ext_lc" '
        /^worktree /{w=$2} $0=="branch "p1 || $0=="branch "p2{print w}')"
  [[ -z "$stale_wt" ]] && return 0
  if git -C "$stale_wt" status --short 2>/dev/null | grep -q .; then
    bash "$HERE/../ticket.sh" add-comment --id "$ext_id" \
      --body "Watchdog: zombie worktree $stale_wt has uncommitted changes — skipped force-remove, needs manual review" >/dev/null 2>&1 || true
  else
    git worktree remove --force "$stale_wt" 2>/dev/null || rm -rf "$stale_wt" 2>/dev/null || true
    git worktree prune 2>/dev/null || true
  fi
}

escalated='[]'
for row in "${stale[@]}"; do
  [[ -z "$row" ]] && continue
  ext_id="${row%%|*}"
  ticket_type="${row##*|}"
  ticket_json="$(BRAND="$BRAND" TICKET_CTX="$FACTORY_CTX" bash "$HERE/../ticket.sh" get --id "$ext_id")"
  plan_ref="$(echo "$ticket_json" | jq -r '.plan_ref // empty')"

  # ── Attempt counter (T002361) ───────────────────────────────────────────────
  # Counts CONSECUTIVE stale rounds without progress. Without it, a dry-run that
  # aborts before `ticket.sh dryrun-mark` leaves guard_dryrun_ok permanently
  # unsatisfied: the reset below puts the ticket back in the queue, the next tick
  # forces another preview, and the pipeline dies again — an unbounded 30-minute
  # loop that burns one headless session per round (observed on T002282/T002307/
  # T002338 on 2026-07-27).
  #
  # brand MUST be non-NULL. tickets.factory_control carries UNIQUE (key, brand)
  # and Postgres treats NULLs in a unique constraint as distinct, so a NULL-brand
  # row makes ON CONFLICT a no-op and accumulates duplicates instead of updating
  # (T000474; cmd_dryrun_mark still has that bug, harmless there because
  # dryrun-check only needs LIMIT 1, fatal for a counter).
  #
  # Progress is measured against factory_phase_events.at, NOT tickets.updated_at:
  # fn_lifecycle_ts bumps updated_at on every row write, so a bare `ticket.sh
  # touch` would masquerade as progress and reset the counter forever.
  #
  # ── Failure classification (T002389) ──────────────────────────────────────
  # Distinguish INFRA (no phase events ever written — pipeline never started)
  # from MODEL (phase events exist but stalled mid-execution). INFRA failures
  # use a separate counter key so they do NOT consume the MODEL attempt budget.
  has_phase="$(factory_psql -v ext_id="$ext_id" 2>/dev/null <<'SQL' || echo ""
SELECT EXISTS(
  SELECT 1 FROM tickets.factory_phase_events pe
  JOIN tickets.tickets t ON t.id = pe.ticket_id
  WHERE t.external_id = :'ext_id'
)::text;
SQL
)"
  if [[ "$has_phase" == "t" ]]; then
    counter_key="factory_attempt:$ext_id"
    failure_class="MODEL"
    max_allowed=$MAX_ATTEMPTS
  else
    counter_key="factory_infra_attempt:$ext_id"
    failure_class="INFRA"
    max_allowed=$MAX_INFRA_ATTEMPTS
    echo "watchdog: INFRA failure for $ext_id (no phase events) — separate counter" >&2
  fi

  attempt="$(factory_psql -v ext_id="$ext_id" -v key="$counter_key" -v brand="$BRAND" 2>/dev/null <<'SQL' || true
WITH tgt AS (
  SELECT id FROM tickets.tickets WHERE external_id = :'ext_id'
), prog AS (
  SELECT max(pe.at) AS last_at
  FROM tickets.factory_phase_events pe JOIN tgt ON pe.ticket_id = tgt.id
  WHERE pe.state IN ('done', 'partial-done', 'blocked')
), cur AS (
  SELECT value, updated_at FROM tickets.factory_control
  WHERE key = :'key' AND brand = :'brand'
)
INSERT INTO tickets.factory_control (key, brand, value, set_by, updated_at)
SELECT :'key', :'brand',
       CASE
         WHEN (SELECT last_at FROM prog) IS NOT NULL
          AND (SELECT last_at FROM prog) > COALESCE((SELECT updated_at FROM cur), '-infinity'::timestamptz)
           THEN '1'
         ELSE ((CASE WHEN (SELECT value FROM cur) ~ '^[0-9]+$'
                     THEN (SELECT value FROM cur)::int ELSE 0 END) + 1)::text
       END,
       'watchdog', now()
ON CONFLICT (key, brand) DO UPDATE SET value = EXCLUDED.value, set_by = 'watchdog', updated_at = now()
RETURNING value;
SQL
)"

  # Fail-open on purpose: an unreadable/unwritable counter must NOT push tickets
  # into the terminal state. A database hiccup that silences the queue would be a
  # worse failure mode than the livelock this guards against.
  escalate=0
  if [[ "$attempt" =~ ^[0-9]+$ ]]; then
    if (( attempt >= max_allowed )); then escalate=1; fi
  else
    echo "watchdog: ${failure_class:-?} attempt counter for $ext_id unreadable — falling back to plain reset" >&2
    attempt="?"
  fi

  if (( escalate == 1 )); then
    # unfactory sets status=blocked, attention_mode=needs_human and
    # readiness.factory_excluded=true in one transaction and writes its own
    # closing comment. Slot release and zombie cleanup below still run — the
    # escalation replaces the status target, not the housekeeping.
    # The failure class (MODEL/INFRA) is passed as attempts prefix so the
    # closing comment carries the distinction (T002389).
    BRAND="$BRAND" TICKET_CTX="$FACTORY_CTX" bash "$HERE/../ticket.sh" unfactory \
      --id "$ext_id" --attempts "${failure_class}-${attempt}" >/dev/null
    BRAND="$BRAND" TICKET_CTX="$FACTORY_CTX" bash "$HERE/../ticket.sh" release-slot --id "$ext_id" >/dev/null
    escalated=$(echo "$escalated" | jq -c --arg e "$ext_id" '. + [$e]')
    _wd_cleanup_worktree "$ext_id"
    continue
  fi

  # The attempt suffix makes consecutive rounds distinguishable. Seven byte-identical
  # comments on T002282 were themselves a signal nobody read (T002361).
  # T002389: include the failure class (MODEL/INFRA) so the distinction is visible.
  # T002369: derive escalation tier from attempt count (1→flash, 2→haiku, 3+→sonnet)
  # so the comment tells which model tier the next pipeline run would use.
  # [T002618] KEIN `local`: diese Schleife laeuft auf Top-Level, nicht in einer
  # Funktion. Unter `set -euo pipefail` brach `local` hier den gesamten Watchdog-
  # Lauf ab, sobald die Stale-Liste nicht leer war — Status-Reset, Slot-Freigabe,
  # Comment, Worktree-Cleanup und der awaiting_deploy-Sweep darunter wurden dann
  # nie erreicht. Bei leerer Liste lief das Skript durch, weshalb es im
  # Normalbetrieb nie auffiel.
  tier_name="flash"
  if [[ "$attempt" =~ ^[0-9]+$ ]]; then
    if (( attempt + 1 >= 3 )); then
      tier_name="sonnet"
    elif (( attempt + 1 == 2 )); then
      tier_name="haiku"
    fi
  fi
  attempt_note=" [${failure_class:-MODEL} ${attempt}/${max_allowed} | tier=${tier_name}]"
  # [T002674] Zweite Stelle mit veralteten Typnamen: 'feature' und 'task' haben
  # null Zeilen, also fiel JEDES Ticket mit Plan in den triage-Zweig und wurde
  # zum vollen Re-Plan gezwungen — genau das, was T001850 verhindern wollte.
  # 'feat' geht nach backlog (dort dispatcht queue.sh die Feature-Lane),
  # alle uebrigen Arbeits-Typen nach plan_staged (die "staged tickets of any
  # workable type"-Lane, ohne lastenheft-Gate).
  if [[ -n "$plan_ref" && ( "$ticket_type" == "feature" || "$ticket_type" == "feat" ) ]]; then
    reset_status="backlog"
    reset_msg="Watchdog: pipeline stale > ${STALE_MIN}min (no phase progress write, class=${failure_class:-MODEL}). Plan already staged (${plan_ref}) — resuming via backlog instead of restarting from Scout.${attempt_note}"
  elif [[ -n "$plan_ref" ]]; then
    reset_status="plan_staged"
    reset_msg="Watchdog: pipeline stale > ${STALE_MIN}min (no phase progress write, class=${failure_class:-MODEL}). Plan already staged (${plan_ref}) — resuming via plan_staged instead of restarting from Scout.${attempt_note}"
  else
    reset_status="triage"
    reset_msg="Watchdog: pipeline stale > ${STALE_MIN}min (no phase progress write, class=${failure_class:-MODEL}). Returned to queue (triage); slot released.${attempt_note}"
  fi
  BRAND="$BRAND" TICKET_CTX="$FACTORY_CTX" bash "$HERE/../ticket.sh" update-status --id "$ext_id" --status "$reset_status" >/dev/null
  BRAND="$BRAND" TICKET_CTX="$FACTORY_CTX" bash "$HERE/../ticket.sh" release-slot --id "$ext_id" >/dev/null
  BRAND="$BRAND" TICKET_CTX="$FACTORY_CTX" bash "$HERE/../ticket.sh" add-comment --id "$ext_id" \
    --body "$reset_msg" >/dev/null
  _wd_cleanup_worktree "$ext_id"
  escalated=$(echo "$escalated" | jq -c --arg e "$ext_id" '. + [$e]')
done

# ── awaiting_deploy staleness (>24h) ──────────────────────────────────────
AD_STALE_H="${FACTORY_AD_STALE_H:-24}"
mapfile -t ad_stale < <(printf "SELECT external_id FROM tickets.tickets WHERE type IN ('feature','feat') AND status='awaiting_deploy' AND updated_at < now() - make_interval(hours => %s);" "$AD_STALE_H" | factory_psql)

for ext_id in "${ad_stale[@]}"; do
  [[ -z "$ext_id" ]] && continue
  BRAND="$BRAND" TICKET_CTX="$FACTORY_CTX" bash "$HERE/../ticket.sh" add-comment --id "$ext_id" \
    --body "Watchdog: awaiting_deploy stale > ${AD_STALE_H}h. Merged but not deployed — needs manual intervention." >/dev/null
  BRAND="$BRAND" TICKET_CTX="$FACTORY_CTX" bash "$HERE/../ticket.sh" patch --id "$ext_id" --attention-mode needs_human >/dev/null
  escalated=$(echo "$escalated" | jq -c --arg e "$ext_id" '. + [$e]')
done

# ── orphaned pipeline_slot (T002610) ──────────────────────────────────────
# Logische Umkehrung des Stale-Sweeps oben: dort haengt eine Pipeline, die laeuft;
# hier traegt ein Ticket einen Slot, obwohl es NICHT laeuft. Dieser Zustand
# blockiert jeden kuenftigen Claim (slots.sh claim-gang setzt
# `WHERE pipeline_slot IS NULL`) und belegt zugleich keine Kapazitaet
# (slots.sh count filtert auf status='in_progress') — rein blockierend und
# nirgends sichtbar. So fiel T002482 ueber Stunden aus der Factory, ohne dass
# irgendwo eine Meldung entstand.
#
# Eigener Schwellwert statt FACTORY_STALE_MIN: ein Waise ist ein anderer Zustand
# als eine haengende Pipeline und darf schneller geraeumt werden, ohne den
# Stale-Sweep umzuparametrieren. Die Karenzzeit schliesst zugleich jedes Rennen
# mit einem gerade laufenden Claim aus.
ORPHAN_MIN="${FACTORY_ORPHAN_SLOT_MIN:-10}"
mapfile -t orphan_slots < <(printf "SELECT external_id FROM tickets.tickets WHERE pipeline_slot IS NOT NULL AND status <> 'in_progress' AND updated_at < now() - make_interval(mins => %s);" "$ORPHAN_MIN" | factory_psql)

for ext_id in "${orphan_slots[@]}"; do
  [[ -z "$ext_id" ]] && continue
  # Status NICHT anfassen: bei einem Waisen ist er bereits korrekt, allein der
  # Slot ist falsch. Genau das unterscheidet diesen Sweep vom Stale-Sweep.
  #
  # Freigabe ueber `ticket.sh release-slot` (ruft intern `slots.sh release`) —
  # NICHT ueber scripts/factory/release-slot.sh: das dekrementiert trotz des
  # gleichen Namens `active_agents` in tickets.provider_health, also
  # LLM-Provider-Kapazitaet, und hat mit pipeline_slot nichts zu tun.
  #
  # Fail-open heisst weitermachen, nicht schweigen: ein einzelnes nicht
  # raeumbares Ticket darf den Watchdog-Lauf nicht abbrechen, muss aber gemeldet
  # werden. Ein `>/dev/null 2>&1 || true` waere hier genau das Muster, gegen das
  # dieser Sweep gebaut ist — ein Waise, der sich nicht raeumen laesst, bliebe
  # sonst wieder unsichtbar.
  BRAND="$BRAND" TICKET_CTX="$FACTORY_CTX" bash "$HERE/../ticket.sh" add-comment --id "$ext_id" \
    --body "Watchdog: verwaister pipeline_slot (Status != in_progress, > ${ORPHAN_MIN}min unberuehrt) — Slot freigegeben, Status unveraendert. [T002610]" >/dev/null 2>&1 \
    || echo "watchdog: WARN audit comment for orphan $ext_id failed — releasing the slot anyway" >&2
  set +e
  rel_err=$(BRAND="$BRAND" TICKET_CTX="$FACTORY_CTX" bash "$HERE/../ticket.sh" release-slot --id "$ext_id" 2>&1 >/dev/null)
  rel_rc=$?
  set -e
  if [[ "$rel_rc" -eq 0 ]]; then
    # Nur ein tatsaechlich freigegebener Slot wird gemeldet — sonst wiese der
    # Watchdog Arbeit als erledigt aus, die er nicht geleistet hat.
    escalated=$(echo "$escalated" | jq -c --arg e "$ext_id" '. + [$e]')
  else
    echo "watchdog: WARN releasing orphaned slot for $ext_id failed — slot still blocks the queue: ${rel_err}" >&2
  fi
done

# ── orphaned in_progress tickets (T002770) ────────────────────────────────
# Tickets in in_progress ohne laufende Session (kein Agent-Lock, kein Remote-
# Branch) sind Waisen: der Status bildet keine reale Arbeit mehr ab. Der
# ticket-ops-Guard "laufende Arbeit nicht anfassen" vertraut auf den Statuswert
# und uebersieht sie. Dieser Sweep setzt sie nach einer Karenzzeit zurueck.
#
# Drei unabhaengige Signale werden geprueft, bevor der Status angetastet wird:
#   1. agent-lock check ticket → free (keine aktive Session)
#   2. git ls-remote --heads origin → kein Branch (kein offener PR-Arbeitszweig)
#   3. git worktree list → kein Worktree mit der Ticket-ID (kein lokaler Checkout)
#
# Karenzzeit ist separat parametrierbar (ORPHAN_TICKET_MIN), Default 60min.
ORPHAN_TICKET_MIN="${FACTORY_ORPHAN_TICKET_MIN:-60}"
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "$(dirname "${BASH_SOURCE[0]}")/../..")"
mapfile -t orphan_tickets < <(printf "SELECT external_id FROM tickets.tickets WHERE status='in_progress' AND updated_at < now() - make_interval(mins => %s) AND type NOT IN ('project','incident') ORDER BY updated_at;" "$ORPHAN_TICKET_MIN" | factory_psql)

for ext_id in "${orphan_tickets[@]}"; do
  [[ -z "$ext_id" ]] && continue

  # Signal 1: Agent-Lock
  if bash "$REPO_ROOT/scripts/agent-lock.sh" check ticket "$ext_id" >/dev/null 2>&1; then
    continue  # lock held — session is active
  fi

  # Signal 2: Remote-Branch (sucht Branches mit dem Ticket-Suffix)
  if git ls-remote --heads origin "*/${ext_id}" 2>/dev/null | grep -q .; then
    continue  # branch exists — work may still be in flight
  fi

  # Signal 3: Lokaler Worktree
  if git worktree list 2>/dev/null | grep -qi "$ext_id"; then
    continue  # local worktree — developer may be working offline
  fi

  # Alle drei Signale negativ → Waise. Zuruecksetzen auf triage.
  BRAND="$BRAND" TICKET_CTX="$FACTORY_CTX" bash "$HERE/../ticket.sh" update-status --id "$ext_id" --status triage >/dev/null 2>&1 \
    || { echo "watchdog: WARN status reset for orphan $ext_id failed" >&2; continue; }
  BRAND="$BRAND" TICKET_CTX="$FACTORY_CTX" bash "$HERE/../ticket.sh" add-comment --id "$ext_id" \
    --body "Watchdog: in_progress > ${ORPHAN_TICKET_MIN}min ohne Agent-Lock, Remote-Branch oder Worktree — Status auf triage zuruecksgesetzt. [T002770]" >/dev/null 2>&1 \
    || echo "watchdog: WARN audit comment for orphan ticket $ext_id failed" >&2
  escalated=$(echo "$escalated" | jq -c --arg e "$ext_id" '. + [$e]')
done

echo "$escalated"
