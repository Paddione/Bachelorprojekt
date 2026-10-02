#!/usr/bin/env bats
# T900728: Factory-Reste entfernen (Nachlauf T900399).
# Pruefmodus: Ausgabe von git grep ueber die Dateiliste tests/fixtures/sf-retirement/rest.txt [T002448-M4].

setup() {
  REPO="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  LIST="$REPO/tests/fixtures/sf-retirement/rest.txt"
}

_offenders() {
  local f
  while IFS= read -r f; do
    [[ -n "$f" && -e "$REPO/$f" ]] || continue
    # T900728: applied migrations are immutable history (never edited). The
    # chk_brand_factory_control constraint names the still-live
    # tickets.factory_control table; the decommission DROP migration must keep
    # its table names. Both are unlisted/exempt by design.
    [[ "$f" == migrations/*.sql || "$f" == scripts/migrations/*.sql ]] && continue
    # T900728: the decommission guard asserts factory absence, so it must name
    # the retired subsystem (absence-guard self-exemption, same precedent as
    # the os-retirement guards exempting their own scope).
    [[ "$f" == tests/spec/decommission/decommission-guard.bats ]] && continue
    { [[ "$f" == *[Ff]actory* ]] && echo "$f"; } || { grep -vE 'FACTORY-PLAN-REF|tickets\.(v_)?factory_|factory_schema_migrations' "$REPO/$f" | grep -qiE 'software[ -]?factory|factory-runner|factory[-_ ](floor|queue|runs?|tick|control|budget|pipeline|slots?|worker|eval|post-merge|mcp|cockpit|dispatch|runner|daemon|state)|factoryfloor|/factory/|factory_[a-z]+|factory:' && echo "$f"; }
  done < "$LIST"
  return 0
}

@test "T900728: keine Datei der Liste enthaelt noch einen Verweis" {
  [ -s "$LIST" ]
  run _offenders
  [ "$status" -eq 0 ]
  [ -z "$output" ] || { echo "$output" | head -40; echo "gesamt: $(wc -l <<<"$output")"; return 1; }
}
