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

# ── [T002388] plan-meta must merge readiness, not replace it ─────────────────#
#
# `plan-meta set --readiness k=v` assigned the whole JSONB column instead of merging
# into it, so every call dropped the keys it did not name. Since _readiness_to_json
# builds an object containing only the named keys, that is the normal case, not an
# edge case. Four set_readiness_flag calls for T002369 each reported "updated"; only
# the last survived. The collateral damage reaches the control flags: lastenheft_locked
# is the factory dispatch gate (queue.sh), factory_excluded the unfactory terminal
# state from T002361, execution_released the dev-flow-plan hold.
#
# Same family as T002230 above — an UPDATE field list where "not passed" silently
# came to mean "set to empty". The SQL is asserted statically for the same reason:
# exercising it needs a cluster, and these tests must never reach one (T002224).

@test "T002388: plan-meta set merges the new readiness into the existing column" {
  run grep -Fq "readiness         = COALESCE(readiness,'{}'::jsonb) || COALESCE(" scripts/ticket.sh
  [ "$status" -eq 0 ]
}

@test "T002388: the replacing readiness assignment is gone, not merely shadowed" {
  # The old shape must be absent from the whole file, not just outranked by a new line.
  run grep -Fq 'readiness         = COALESCE($readiness_sql, readiness)' scripts/ticket.sh
  [ "$status" -ne 0 ]
}

@test "T002388: an omitted --readiness is a no-op rather than a column wipe" {
  # Without --readiness the generated fragment is the literal NULL, and `jsonb || NULL`
  # is NULL — the merge would blank the column it was meant to protect. The inner
  # COALESCE turns that into a merge with the empty object.
  run grep -Fq "COALESCE(\$readiness_sql, '{}'::jsonb)" scripts/ticket.sh
  [ "$status" -eq 0 ]
}

@test "T002388: every readiness writer in ticket.sh uses the merge form" {
  # The bug was one writer drifting away from a convention the other four already kept.
  # Any assignment of the form `readiness = COALESCE(<something>, readiness)` is a relapse.
  run grep -Eq "readiness +=? *COALESCE\(\\\$[a-z_]+, *readiness\)" scripts/ticket.sh
  [ "$status" -ne 0 ]
}

# ── [T002388] read-only audit for readiness truncated by the bug above ───────#
#
# The fix heals future writes; keys already lost are not reconstructable, so the audit
# only produces a candidate list for a human to work through. Deliberately not a repair:
# blanket-setting lastenheft_locked would open the factory dispatch gate on tickets that
# were never locked on purpose.

@test "T002388: the readiness-audit module exists" {
  [ -f scripts/vda/ticket/readiness-audit.sh ]
}

@test "T002388: the ticket dispatcher routes readiness-audit to the module" {
  run grep -Fq "readiness-audit" scripts/vda/ticket.sh
  [ "$status" -eq 0 ]
}

@test "T002388: the readiness audit never writes to the database" {
  # A report that can mutate is a repair tool by accident. Guard the read-only claim.
  # The existence gate is load-bearing: grep on a missing file exits 2, which would
  # satisfy the negative assertion below and leave this test vacuously green.
  [ -f scripts/vda/ticket/readiness-audit.sh ]
  run grep -Eq "^[^#]*\b(UPDATE|INSERT|DELETE)\b" scripts/vda/ticket/readiness-audit.sh
  [ "$status" -ne 0 ]
}

@test "T002388: the lock heuristic tests key absence, not a falsy value" {
  # `lastenheft_locked: false` records a deliberate unlock and is not damage; only a
  # key that vanished entirely is a suspect.
  run grep -Fq "'lastenheft_locked'" scripts/vda/ticket/readiness-audit.sh
  [ "$status" -eq 0 ]
  run grep -Eq "NOT +[a-z_]*\.?readiness *\? *'lastenheft_locked'" scripts/vda/ticket/readiness-audit.sh
  [ "$status" -eq 0 ]
}

# ── [T002329] tickets.type nutzt das Conventional-Commit-Vokabular ───────────#
#
# Teil B des Epics T002326. bug->fix, feature->feat, task->chore, plus sechs
# neue Werte (docs, refactor, perf, test, ci, build). Waehrend des Uebergangs
# akzeptiert der CHECK beide Vokabulare, damit ein Zeitversatz zwischen
# DB-Migration (reist im Website-Image) und Skript-Deploy (reist mit dem Merge)
# folgenlos bleibt. Die Altwerte fallen in Teil D (T002331).
#
# Statisch gegen die Quelle assertiert -- dieselbe Begruendung wie bei T002230:
# das SQL auszufuehren braucht einen Cluster, und diese Tests duerfen keinen
# erreichen (T002224).

MIGRATIONS_TS="website/src/lib/tickets/migrations.ts"
TABLES_TS="website/src/lib/tickets/tables/tickets.ts"
TYPE_VOCAB_TS="website/src/lib/tickets/migrate-type-vocabulary.ts"

@test "T002329: die Vokabular-Migration liegt in einem eigenen Modul" {
  # migrations.ts steht bei 576/600 Zeilen (S1-Budget 24). Der Constraint- und
  # Datenmigrationsblock wird deshalb ausgelagert statt hineingequetscht.
  [ -f "$TYPE_VOCAB_TS" ]
}

@test "T002329: migrations.ts ruft die ausgelagerte Vokabular-Migration auf" {
  # Ein Modul, das niemand aufruft, migriert nichts.
  run bash -c "grep -c 'applyTypeVocabularyMigration' '$MIGRATIONS_TS'"
  [ "$output" != "0" ]
}

@test "T002329: der type-CHECK wird als benannter Constraint gesetzt" {
  # Ohne Namen laesst er sich spaeter nicht droppen -- vgl. das bereits
  # etablierte Muster fuer tickets_status_check und tickets_effort_check.
  run grep -Fq "ADD CONSTRAINT tickets_type_check" "$TYPE_VOCAB_TS"
  [ "$status" -eq 0 ]
}

@test "T002329: die inline-CHECK-Klausel am type-ADD-COLUMN ist entfernt" {
  # ADD COLUMN IF NOT EXISTS ist gegen eine bestehende Spalte ein No-op. Bleibt
  # der CHECK dort stehen, wirkt jede Aenderung daran live NICHT -- der Test
  # haelt genau diese Falle offen.
  run bash -c "grep -c 'ADD COLUMN IF NOT EXISTS type TEXT CHECK' '$MIGRATIONS_TS'"
  [ "$output" = "0" ]
}

# 2>/dev/null ist in den folgenden Tests NICHT kosmetisch: `run` fängt stdout und
# stderr gemeinsam in $output. Fehlt die Zieldatei, landet grep's "No such file or
# directory" in $output, und eine Assertion auf != "0" ist dann erfüllt, ohne dass
# irgendetwas geprüft wurde -- der Test wäre in RED und in GREEN gleichermaßen grün.
# Beobachtet in der RED-Phase dieses Tickets; vgl. T002346.

@test "T002329: der type-CHECK kennt die sechs neu hinzugekommenen Werte" {
  run bash -c "grep -A5 'ADD CONSTRAINT tickets_type_check' '$TYPE_VOCAB_TS' 2>/dev/null \
                 | grep -c \"'refactor'\""
  [ "$output" != "0" ]
}

@test "T002329: der type-CHECK akzeptiert waehrend des Uebergangs die Altwerte" {
  # Dual-Vokabular: sonst schlaegt jeder Schreibzugriff eines noch nicht
  # aktualisierten Aufrufers fehl, solange das Image noch nicht ausgerollt ist.
  run bash -c "grep -A5 'ADD CONSTRAINT tickets_type_check' '$TYPE_VOCAB_TS' 2>/dev/null \
                 | grep -c \"'bug'\""
  [ "$output" != "0" ]
}

@test "T002329: Bestandsdaten werden per WHERE-gefiltertem UPDATE migriert" {
  # Der WHERE-Filter ist das, was die Migration idempotent macht: der zweite
  # Lauf trifft null Zeilen. Sie laeuft bei jedem Pod-Boot erneut.
  # Über cat statt direkt auf die Datei: `grep -c <fehlende-datei>` gibt gar nichts
  # aus (leerer $output erfüllt != "0"), `grep -c` am Ende einer Pipe dagegen "0".
  run bash -c "cat '$TYPE_VOCAB_TS' 2>/dev/null \
                 | grep -c \"WHERE type IN ('bug','feature','task')\""
  [ "$output" != "0" ]
}

@test "T002329: der Constraint wird vor der Datenumschrift erweitert" {
  # Umgekehrte Reihenfolge laesst das UPDATE am noch geltenden alten CHECK
  # scheitern. Zeilennummern-Vergleich statt blosser Anwesenheitspruefung.
  run bash -c "
    c=\$(grep -n 'ADD CONSTRAINT tickets_type_check' '$TYPE_VOCAB_TS' | head -1 | cut -d: -f1)
    u=\$(grep -n \"WHERE type IN ('bug','feature','task')\" '$TYPE_VOCAB_TS' | head -1 | cut -d: -f1)
    [ -n \"\$c\" ] && [ -n \"\$u\" ] && [ \"\$c\" -lt \"\$u\" ]"
  [ "$status" -eq 0 ]
}

@test "T002329: v_active_features liest beide Vokabulare" {
  # Sonst leert sich die Arbeitsmenge des Dispatchers in dem Moment, in dem die
  # Datenmigration feature -> feat umschreibt.
  run bash -c "grep -A16 'CREATE OR REPLACE VIEW tickets.v_active_features' '$TABLES_TS' \
                 | grep -c \"type IN ('feature','feat')\""
  [ "$output" != "0" ]
}

@test "T002329: v_factory_metrics zaehlt beide Vokabulare" {
  run bash -c "grep -A12 'CREATE OR REPLACE VIEW tickets.v_factory_metrics' '$TABLES_TS' \
                 | grep -c \"type IN ('feature','feat')\""
  [ "$output" != "0" ]
}

@test "T002329: der pg_notify-Trigger feuert auch fuer feat" {
  # trg_notify_feature_inserted haengt an WHEN (NEW.type = 'feature') und waere
  # nach der Migration dauerhaft stumm -- im Ticket nicht erfasst.
  run bash -c "grep -c \"NEW.type IN ('feature','feat')\" '$MIGRATIONS_TS'"
  [ "$output" != "0" ]
}

@test "T002329: ticket-mcp validiert gegen das neue Vokabular" {
  run bash -c "grep -c '\"chore\"' scripts/ticket-mcp/go/internal/tools/triage.go"
  [ "$output" != "0" ]
}
