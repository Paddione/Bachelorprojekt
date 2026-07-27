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

# ── [T002282] update-status muss den agent-lock.sh-Claim respektieren ────────
#
# `agent-lock.sh` ist heute rein advisory: Dispatch-Gates (dispatcher-prep.sh,
# factory-prep-bridge.sh, babysit-prs.sh) fragen `check ticket <id>` vor dem
# Dispatch ab, aber der Schreib-Pfad `scripts/vda/ticket/update-status.sh` hat
# NULL Bezug dazu — `grep -rn agent-lock scripts/vda/ticket/ scripts/ticket.sh`
# liefert 0 Treffer. Jede zweite Session kann den Status eines fremd gelockten
# Tickets überschreiben; genau dieser Rückschritt wurde bei T002270 beobachtet.

@test "T002282-M3: update-status verweigert den Write bei fremdem agent-lock-Claim" {
  local repo ald
  repo="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  ald="$(mktemp -d)"

  # Session A hält den Ticket-Lock.
  run env AGENT_LOCK_DIR="$ald" CLAUDE_SESSION_ID="t002282-session-a" \
    bash "$repo/scripts/agent-lock.sh" claim ticket T002282 --label foreign-session
  [ "$status" -eq 0 ]

  # Vorbedingung: aus Session B meldet check 'held' (Exit 3).
  run env AGENT_LOCK_DIR="$ald" CLAUDE_SESSION_ID="t002282-session-b" \
    bash "$repo/scripts/agent-lock.sh" check ticket T002282
  [ "$status" -eq 3 ]

  # Session B versucht den Status-Write — muss abgelehnt werden.
  run env AGENT_LOCK_DIR="$ald" CLAUDE_SESSION_ID="t002282-session-b" \
    bash "$repo/scripts/ticket.sh" update-status --id T002282 --status done
  rm -rf "$ald"

  [ "$status" -ne 0 ]
  [[ "${output,,}" == *"agent-lock"* ]] || { echo "keine agent-lock-Ablehnung: $output"; return 1; }
  # Der Guard muss VOR dem Cluster-Zugriff greifen — _pgpod darf nie laufen.
  [[ "$output" != *"no shared-db pod found"* ]] || {
    echo "Guard griff nicht: der Write lief bis _pgpod durch: $output"; return 1; }
}

# ── [T002307] _pgpod must select a Running shared-db pod ──────────────────────
#
# _pgpod took `kubectl get pod -l 'app in (shared-db, shared-db-dev)' -o name |
# head -1` — an unfiltered list. kubectl orders by name, so a leftover
# `shared-db-<old>` in phase Succeeded/Failed (left behind by a rollout, a node
# drain or an evicted pod) can sort ahead of the live one. Every ticket.sh verb
# then failed at the *next* step with kubectl's "cannot exec into a container in
# a completed pod", and the only known workaround was deleting the dead pod by
# hand. All ~25 call sites route through this one helper, so the phase filter
# belongs here and nowhere else.
#
# Stubbed kubectl: it answers the field-selector query the way the API server
# would (Running pods only) and the unfiltered query with the completed pod
# first — so the test fails for the real reason if the filter is missing.

_pgpod_mockdir() {
  local mockdir; mockdir="$(mktemp -d)"
  cat > "$mockdir/kubectl" <<'MOCKEOF'
#!/usr/bin/env bash
if [[ "$*" == *"get pod"* ]]; then
  if [[ "$*" == *"--field-selector"*"status.phase=Running"* ]]; then
    echo "pod/shared-db-live"
  else
    echo "pod/shared-db-completed"
    echo "pod/shared-db-live"
  fi
  exit 0
fi
exit 0
MOCKEOF
  chmod +x "$mockdir/kubectl"
  echo "$mockdir"
}

@test "T002307: _pgpod skips a completed shared-db pod and returns the Running one" {
  local mockdir; mockdir="$(_pgpod_mockdir)"
  run env PATH="$mockdir:$PATH" bash -c \
    'source "'"$BATS_TEST_DIRNAME"'/../../scripts/vda/ticket/_ticket-core.sh"; _pgpod'
  rm -rf "$mockdir"
  [ "$status" -eq 0 ]
  [ "$output" = "pod/shared-db-live" ]
}

@test "T002307: _pgpod asks the API server for Running pods only" {
  # Guards the mechanism, not just the outcome: filtering client-side would still
  # pass the test above but would keep paging the full pod list.
  run grep -Fq -- "--field-selector status.phase=Running" scripts/vda/ticket/_ticket-core.sh
  [ "$status" -eq 0 ]
}
