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
    # T900728: these E2E specs stub website factory contracts (api/factory-floor,
    # factory-floor-refreshed) that only A3a may change. They move atomically
    # with the website in T900727 (added to web.txt there) — scrubbing the
    # stubs here would break them against the unchanged website.
    case "$f" in
      tests/e2e/specs/fa-48-factory-devflow.spec.ts|tests/e2e/specs/fa-scs-scout.spec.ts|tests/e2e/specs/dev-status-tabs.spec.ts|tests/e2e/specs/fa-qa-review.spec.ts) continue ;;
      scripts/sdlc-cockpit-smoke.mjs|docs/sdlc/cockpit-action-inventory.md|tests/spec/sdlc-cockpit/leitstand-livedaten.bats) continue ;;
    esac
    # T900728: agent-bench replay fixtures pin parent_commit 6ee02649, which
    # still contains scripts/factory/cleanup.sh — the brief/check/reference
    # paths are accurate for the pin and must not be rewritten.
    case "$f" in
      scripts/llm/agent-bench/cases/f4-worktree-remove-replay/variants/v1/brief.md|scripts/llm/agent-bench/cases/f4-worktree-remove-replay/variants/v1/checks/run.sh|scripts/llm/agent-bench/cases/f4-worktree-remove-replay/variants/v1/reference/p1.md|scripts/llm/agent-bench/cases/f4-worktree-remove-replay/variants/v1/reference/tasks.md) continue ;;
    esac
    # T900728: cockpit structure tests assert on website factory paths that
    # only A3a may change (added to web.txt there); ki-deck additionally
    # guards the dropped factory_model_slots table and must name it;
    # scs-search asserts on the SCS website panels.
    # T900728: frozen records and foreign meanings that must keep their
    # factory vocabulary — the mishap korpus (observation accurate for the
    # 2026-08-09 worktree name; the test reads only ID pairs), the
    # context-retrieve golden set (2026-08-14 calibration record T002658;
    # the expected title must match the measured index), the Blender API
    # call in rig_for_mixamo.py, and the backfill taxonomy (join key to
    # the 49-row mapping and DB idempotency key, covered by a live test).
    case "$f" in
      tests/fixtures/mishap-dedupe-korpus.json|tests/fixtures/context-retrieve/golden-queries.json|scripts/rig_for_mixamo.py|scripts/one-shot/2026-07-21-feature-product-backfill.mjs) continue ;;
    esac
    case "$f" in
      tests/spec/sdlc-cockpit/redesign-struktur.bats|tests/spec/sdlc-cockpit/deck-kompakt-layout.bats|tests/spec/sdlc-cockpit/proxy-unreachable-vs-stopped.bats|tests/spec/sdlc-cockpit/ki-deck-eine-tabelle.bats|tests/spec/pipeline-interface.bats|tests/unit/scs-search.bats) continue ;;
    esac
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
