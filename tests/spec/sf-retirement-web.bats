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
    # The cockpit notify trigger names tickets.factory_phase_events.
    [[ "$f" == */migrations/*.sql || "$f" == */db/migrations/* ]] && continue
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
