#!/usr/bin/env bats
# tests/spec/ticket-system.bats
# SSOT: openspec/specs/ticket-system.md
#
# Initial placeholder coverage for the Ticket System spec. [T002010]

@test "ticket-system spec covered" {
  run true
  [ "$status" -eq 0 ]
}

# ── [T002230] resolution must survive an update-status call that omits it ────#
#
# update-status.sh wrote `resolution = NULLIF(:'res','')` unconditionally, so every
# caller that omitted --resolution wiped an existing one. The post-merge automation
# never passes it, so freshly closed tickets landed on `done/null`: correct-looking
# in any list, but dropped from every report grouping by resolution — `vda.sh cfr`
# and /admin/dora among them. Observed on T002179, T002183, T002186, T002188,
# T002213 and, live during the ticket-ops run, T002224 (74 s after its merge).
#
# The SQL is asserted statically: exercising it needs a cluster, and these tests
# must never reach one (see T002224).

@test "T002230: update-status.sh preserves an existing resolution when none is passed" {
  run grep -Fq "COALESCE(NULLIF(:'res', ''), resolution)" scripts/vda/ticket/update-status.sh
  [ "$status" -eq 0 ]
}

@test "T002230: update-status.sh no longer nulls resolution unconditionally" {
  # The old shape must be gone, not merely shadowed by the new one.
  run grep -Eq "^ *resolution = NULLIF\(:'res', *''\), *$" scripts/vda/ticket/update-status.sh
  [ "$status" -ne 0 ]
}

@test "T002230: update-status.sh still clears resolution on a non-terminal status" {
  # Mirrors website/src/lib/tickets/transition.ts:79 — a resolution only means
  # anything for done/archived. openspec.sh (→ planning) and factory/pipeline.mjs
  # (→ backlog) depend on the clearing, so a blanket COALESCE would strand a stale
  # `fixed` on a reopened ticket.
  run grep -Fq "WHEN :'status' IN ('done','archived') THEN COALESCE(NULLIF(:'res', ''), resolution)" \
    scripts/vda/ticket/update-status.sh
  [ "$status" -eq 0 ]
  run grep -A1 -F "WHEN :'status' IN ('done','archived') THEN COALESCE" scripts/vda/ticket/update-status.sh
  [[ "$output" == *"ELSE NULL"* ]]
}

# ── [T002284] get.sh must project resolution, severity, description in JSON ────

@test "T002284: get.sh projects resolution in its JSON output" {
  run grep -Fq "'resolution', t.resolution" scripts/vda/ticket/get.sh
  [ "$status" -eq 0 ]
}

@test "T002284: get.sh projects severity and description in its JSON output" {
  run grep -Fq "'severity', t.severity" scripts/vda/ticket/get.sh
  [ "$status" -eq 0 ]
  run grep -Fq "'description', t.description" scripts/vda/ticket/get.sh
  [ "$status" -eq 0 ]
}

@test "T002230: the two write paths agree that resolution is terminal-only" {
  # transition.ts is the other path. If it ever drops the CASE, the shell path and
  # the API path would disagree about what a non-terminal status means.
  run grep -Fq "resolution = CASE WHEN \$1 IN ('done','archived') THEN \$2 ELSE NULL END" \
    website/src/lib/tickets/transition.ts
  [ "$status" -eq 0 ]
}

# ── [T002280] BRAND/NS resolution is never inferred from free-text args ────#

@test "T002280: Freitext im --title beeinflusst NS-Aufloesung nicht" {
  run bash scripts/ticket.sh --resolve-ns-only create --type bug \
    --title "korczewski-home E2E test regression" --description "irrelevant"
  [ "$status" -eq 0 ]
  [[ "$output" == *"NS=workspace"* ]]
  [[ "$output" != *"workspace-korczewski"* ]]
}

@test "T002280: explizites --brand gewinnt gegen widerspruechlichen Freitext" {
  run bash scripts/ticket.sh --resolve-ns-only create --type bug --brand korczewski \
    --title "mentolder rollout notes" --description "irrelevant"
  [ "$status" -eq 0 ]
  [[ "$output" == *"NS=workspace-korczewski"* ]]
}

@test "T002280: ungueltiger --brand-Wert wird abgelehnt" {
  run bash scripts/ticket.sh --resolve-ns-only create --type bug --brand acme --title "x"
  [ "$status" -eq 2 ]
}

@test "T002280: kein Signal -> Default mentolder bleibt unveraendert" {
  run bash scripts/ticket.sh --resolve-ns-only update-status --id T000001 --status done
  [ "$status" -eq 0 ]
  [[ "$output" == *"NS=workspace"* ]]
}
