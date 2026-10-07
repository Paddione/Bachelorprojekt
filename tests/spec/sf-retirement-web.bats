#!/usr/bin/env bats
# T900727: Factory-Reste entfernen (Nachlauf T900399).
# Pruefmodus: Ausgabe von git grep ueber die Dateiliste tests/fixtures/sf-retirement/web.txt [T002448-M4].

setup() {
  REPO="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  LIST="$REPO/tests/fixtures/sf-retirement/web.txt"
}

_offenders() {
  local f
  while IFS= read -r f; do
    [[ -n "$f" && -e "$REPO/$f" ]] || continue
    # T900727: applied migrations are immutable history (never edited).
    # The cockpit notify trigger names tickets.factory_phase_events; the TS
    # migration runner defines the factory_feature_inserted notify channel
    # (renaming needs its own migration, not this chore).
    [[ "$f" == */migrations/*.sql || "$f" == */db/migrations/* ]] && continue
    [[ "$f" == components/website/src/lib/tickets/migrations.ts ]] && continue
    # T900727: tickets-db.test.ts pins the immutable notify channel name;
    # cockpit-observability.ts queries external Prometheus metric names
    # (renaming queries without the metrics breaks panels — needs an ops
    # ticket with dashboard access, not this chore).
    [[ "$f" == components/website/src/lib/tickets-db.test.ts ]] && continue
    [[ "$f" == components/website/src/lib/sdlc/cockpit-observability.ts ]] && continue
    # T900727: cockpit-control.ts is the decommission stub — the
    # factory_decommissioned marker is pinned by decommission-guard.
    [[ "$f" == components/website/src/pages/sdlc/api/cockpit-control.ts ]] && continue
    # T900727: /admin/factory-budget is a live compat redirect source —
    # renaming the source 404s existing bookmarks/backlinks.
    [[ "$f" == components/website/src/middleware/redirect-map.ts ]] && continue
    [[ "$f" == components/website/src/middleware/redirect-map.test.ts ]] && continue
    { [[ "$f" == *[Ff]actory* ]] && echo "$f"; } || { grep -vE 'FACTORY-PLAN-REF|tickets\.(v_)?factory_|factory_schema_migrations' "$REPO/$f" | grep -qiE 'software[ -]?factory|factory-runner|factory[-_ ](floor|queue|runs?|tick|control|budget|pipeline|slots?|worker|eval|post-merge|mcp|cockpit|dispatch|runner|daemon|state)|factoryfloor|/factory/|factory_[a-z]+|factory:' && echo "$f"; }
  done < "$LIST"
  return 0
}

@test "T900727: keine Datei der Liste enthaelt noch einen Verweis" {
  [ -s "$LIST" ]
  run _offenders
  [ "$status" -eq 0 ]
  [ -z "$output" ] || { echo "$output" | head -40; echo "gesamt: $(wc -l <<<"$output")"; return 1; }
}
