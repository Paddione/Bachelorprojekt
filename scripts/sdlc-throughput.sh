#!/usr/bin/env bash
# scripts/sdlc-throughput.sh — agentic SDLC throughput snapshot (read-only).
# Usage: scripts/sdlc-throughput.sh [--window-days N]  (default 7)
# Sources: tickets.* lifecycle columns + tickets.factory_phase_events.
# Alerting: the SUMMARY block prints stable KEY=value lines (grep-able).
set -euo pipefail

WINDOW_DAYS=7
while [[ $# -gt 0 ]]; do case "$1" in
  --window-days) WINDOW_DAYS="$2"; shift 2 ;;
  -h|--help) sed -n '2,5p' "$0"; exit 0 ;;
  *) echo "Unknown option: $1" >&2; exit 2 ;;
esac; done
[[ "$WINDOW_DAYS" =~ ^[0-9]+$ ]] || { echo "ERROR: --window-days must be an integer." >&2; exit 2; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/vda/ticket/_ticket-core.sh
source "$SCRIPT_DIR/vda/ticket/_ticket-core.sh"

pod=$(_pgpod)
q() { _exec_sql "$pod" -v window_days="$WINDOW_DAYS" <<<"$1"; }

created=$(q "SELECT count(*) FROM tickets.tickets WHERE created_at > now() - (:'window_days' || ' days')::interval;")
done_n=$(q "SELECT count(*) FROM tickets.tickets WHERE status='done' AND created_at > now() - (:'window_days' || ' days')::interval;")
lead=$(q "SELECT COALESCE(round(percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (done_at-created_at))/3600)::numeric,1),-1) || '|' || COALESCE(round(percentile_cont(0.9) WITHIN GROUP (ORDER BY extract(epoch FROM (done_at-created_at))/3600)::numeric,1),-1) || '|' || COALESCE(round(max(extract(epoch FROM (done_at-created_at))/3600)::numeric,1),-1) FROM tickets.tickets WHERE status='done' AND done_at IS NOT NULL AND created_at > now() - (:'window_days' || ' days')::interval;")
triage_n=$(q "SELECT count(*) FROM tickets.tickets WHERE status='triage';")
triage_oldest=$(q "SELECT COALESCE(round(max(extract(epoch FROM (now()-created_at))/3600)::numeric,1),0) FROM tickets.tickets WHERE status='triage';")
triage_hoch=$(q "SELECT count(*) FROM tickets.tickets WHERE status='triage' AND priority='hoch';")
stale_wip=$(q "SELECT count(*) FROM tickets.tickets WHERE status IN ('in_progress','in_review','qa_review') AND updated_at < now() - interval '24 hours';")
stuck_impl=$(q "SELECT count(*) FROM tickets.tickets t WHERE EXISTS (SELECT 1 FROM tickets.factory_phase_events e WHERE e.ticket_id=t.id AND e.phase='implement' AND e.state='entered') AND NOT EXISTS (SELECT 1 FROM tickets.factory_phase_events e WHERE e.ticket_id=t.id AND e.phase='verify' AND e.state='done') AND t.status NOT IN ('done','archived');")
held=$(q "SELECT count(*) FROM tickets.tickets WHERE status='plan_staged' AND readiness->>'execution_released'='false';")
staged=$(q "SELECT count(*) FROM tickets.tickets WHERE status='plan_staged';")
dispatch=$(q "SELECT COALESCE(round(percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (a-r))/3600)::numeric,1),-1) || '|' || COALESCE(round(max(extract(epoch FROM (a-r))/3600)::numeric,1),-1) FROM (SELECT ticket_id, min(created_at) FILTER (WHERE body LIKE 'DISPATCH-REQUEST%') AS r, min(created_at) FILTER (WHERE body LIKE 'DISPATCH-APPROVED%') AS a FROM tickets.ticket_comments WHERE kind='system' AND created_at > now() - (:'window_days' || ' days')::interval GROUP BY 1) s WHERE r IS NOT NULL AND a IS NOT NULL;")
skip_n=$(q "SELECT count(*) FROM tickets.ticket_comments WHERE kind='system' AND body LIKE 'DISPATCH-STALE-SKIP%' AND created_at > now() - (:'window_days' || ' days')::interval;")

echo "SDLC throughput (last $WINDOW_DAYS days, $(date -u +%FT%TZ))"
echo "SUMMARY: created=$created done=$done_n triage_queue=$triage_n triage_oldest_h=$triage_oldest triage_hoch=$triage_hoch stale_wip_24h=$stale_wip stuck_implement=$stuck_impl held=$held staged=$staged dispatch_wait_p50_max_h=$dispatch stale_skip_n=$skip_n"
echo "--- lead time (done, hours): p50|p90|max = $lead"
echo "--- status mix (window):"
q "SELECT status || ': ' || n FROM (SELECT status, count(*) AS n FROM tickets.tickets WHERE created_at > now() - (:'window_days' || ' days')::interval GROUP BY 1) s ORDER BY n DESC;"
echo "--- triage backlog (oldest first):"
q "SELECT external_id || ' ' || type || ' ' || COALESCE(priority,'?') || ' wait_h=' || round((extract(epoch FROM (now()-created_at))/3600)::numeric,1) || ' ' || substr(title,1,60) FROM tickets.tickets WHERE status='triage' ORDER BY created_at LIMIT 10;"
echo "--- stale WIP (idle >24h):"
q "SELECT external_id || ' ' || status || ' idle_h=' || round((extract(epoch FROM (now()-updated_at))/3600)::numeric,1) || ' ' || substr(title,1,60) FROM tickets.tickets WHERE status IN ('in_progress','in_review','qa_review') AND updated_at < now() - interval '24 hours' ORDER BY updated_at LIMIT 10;"
echo "--- hold backlog (plan_staged, execution_released=false):"
q "SELECT external_id || ' held_h=' || COALESCE(round((extract(epoch FROM (now()-(readiness->>'execution_held_at')::timestamptz))/3600)::numeric,1),-1) || ' ' || substr(title,1,60) FROM tickets.tickets WHERE status='plan_staged' AND readiness->>'execution_released'='false' ORDER BY created_at LIMIT 10;"
echo "--- dispatch wait approved-request (hours): p50|max = $dispatch (-1 = no markers yet)"
echo "--- stale skips (window):"
q "SELECT t.external_id || ' ' || to_char(c.created_at,'YYYY-MM-DD HH24:MI') || ' ' || substr(c.body,1,80) FROM tickets.ticket_comments c JOIN tickets.tickets t ON t.id=c.ticket_id WHERE c.kind='system' AND c.body LIKE 'DISPATCH-STALE-SKIP%' AND c.created_at > now() - (:'window_days' || ' days')::interval ORDER BY c.created_at DESC LIMIT 10;"
echo "--- phase funnel (window):"
q "SELECT ev || ': ' || n FROM (SELECT phase || ':' || state AS ev, count(*) AS n FROM tickets.factory_phase_events WHERE at > now() - (:'window_days' || ' days')::interval GROUP BY 1) s ORDER BY n DESC LIMIT 12;"
