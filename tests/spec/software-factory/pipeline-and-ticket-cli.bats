#!/usr/bin/env bats
# tests/spec/software-factory/pipeline-and-ticket-cli.bats
# SSOT: openspec/specs/software-factory.md
#
# [T002503] Aufgeteilt aus tests/spec/software-factory.bats. Jene Sammeldatei hielt
# 495 der ~2300 Spec-Tests in einer Datei und war mit --no-parallelize-within-files
# unteilbar: sie bildete mit 115s den Boden jedes CI-Shards, in dem sie lag.
#
# Der Split ist ein VERSCHIEBEN, kein Kopieren — die Quelldatei ist entfernt.
# T002427/T002421: eine frueher zurueckgelassene Kopie erzeugte doppelte Testnamen,
# ein gefilterter Lauf sah gruen aus, waehrend `task test:factory` ueber die
# veraltete Fassung rot lief.
#
# Gemeinsame Variablen, _skip_if_no_db und Setup/Teardown liegen in _sf_common.bash.

load '_sf_common'

setup()    { _sf_setup; }
teardown() { _sf_teardown; }

# ── FA-SF-20-pipeline-contract ──────────────────────────────────#
# FA-SF-20: structural contract for the runnable factory pipeline (offline, no cluster).
PIPELINE_SCRIPT="scripts/factory/pipeline.mjs"

@test "FA-SF-20: pipeline.js exists and is syntactically valid JS" {
  [ -f "$PIPELINE_SCRIPT" ]
  run node --check "$PIPELINE_SCRIPT"
  [ "$status" -eq 0 ]
}

@test "FA-SF-20: exports meta with the six expected phases" {
  for p in Scout Design Plan Implement Verify Deploy; do
    run grep -q "phase('$p')" "$PIPELINE_SCRIPT"; [ "$status" -eq 0 ]
  done
  run grep -Eq "export const meta|module\.exports\.meta" "$PIPELINE_SCRIPT"; [ "$status" -eq 0 ]
}

@test "FA-SF-20: wires the existing factory parts (conflict-check, review prompts, ticket.sh, scout.sh)" {
  run grep -q "conflict-check.sh" "$PIPELINE_SCRIPT"; [ "$status" -eq 0 ]
  run grep -q "review-bug-hunter.prompt.md" "$PIPELINE_SCRIPT"; [ "$status" -eq 0 ]
  run grep -q "review-security-auditor.prompt.md" "$PIPELINE_SCRIPT"; [ "$status" -eq 0 ]
  run grep -q "review-pattern-enforcer.prompt.md" "$PIPELINE_SCRIPT"; [ "$status" -eq 0 ]
  run grep -q "scripts/ticket.sh" "$PIPELINE_SCRIPT"; [ "$status" -eq 0 ]
  # find-similar-tickets.mjs is now an implementation detail of scout.sh (not pipeline.js).
  # Instead verify that pipeline.js invokes the deterministic scout.sh.
  run grep -q "scout.sh" "$PIPELINE_SCRIPT"; [ "$status" -eq 0 ]
}

@test "FA-SF-20: uses args.timestamp and not Date.now()/Math.random() (resume-safe)" {
  run grep -q "args.timestamp" "$PIPELINE_SCRIPT"; [ "$status" -eq 0 ]
  # Exclude comment lines (// ... and JSDoc * lines) — the pattern appears in
  # JSDoc to document what NOT to use; only actual code-line usage is disallowed.
  run bash -c "grep -Ev '^\s*(/[/*]|\*)' \"$PIPELINE_SCRIPT\" | grep -Eq 'Date\.now\(\)|Math\.random\(\)'"
  [ "$status" -ne 0 ]
}

@test "FA-SF-20: Deploy phase merges from MAIN repo and deploys BOTH brands with explicit ENV" {
  # deployStepCmd (both-brand deploy) stays in pipeline.js; ENV= is explicit.
  run grep -Eq "workspace:deploy|workspace:partial-deploy" "$PIPELINE_SCRIPT"; [ "$status" -eq 0 ]
  run grep -Eq "ENV=mentolder|ENV=korczewski|ENV=fleet-" "$PIPELINE_SCRIPT"; [ "$status" -eq 0 ]
}

@test "FA-SF-20: pipeline writes a per-phase liveness touch (>=6 references)" {
  # [T002418] Ueber pipeline.mjs UND pipeline-runner.js gezaehlt. Die Anforderung ist
  # unveraendert — jede Phase meldet Liveness, sonst haelt der Watchdog sie fuer tot.
  # Verlagert hat sich nur der Ort: die Liveness der Plan-Phase steckte im Prompt des
  # Conflict-Agenten und ist mit dessen Wegfall in den Runner gewandert, wo sie
  # deterministisch laeuft statt davon abzuhaengen, dass ein Modell die Zeile ausfuehrt.
  run bash -c "cat '$PIPELINE_SCRIPT' scripts/factory/pipeline-runner.js | grep -cE \"ticket[.]sh touch|'touch', '--id'\""
  [ "$status" -eq 0 ]
  [ "$output" -ge 6 ]
}

@test "FA-SF-20: Deploy phase enforces WORK_BRANCH regex feature/*|fix/* + diff-size guard" {
  # The branch-regex + diff-size guard live in buildDeployPrompt (pipeline-partials.cjs);
  # FACTORY_MAX_DIFF is still threaded through pipeline.js as the maxDiff payload.
  run grep -Eq "feature/.*\|fix/|guard_check_diff_size" "$PIPELINE_SCRIPT" "$PARTIALS_MOD"; [ "$status" -eq 0 ]
  run grep -q "FACTORY_MAX_DIFF" "$PIPELINE_SCRIPT"; [ "$status" -eq 0 ]
}

@test "FA-SF-20: Deploy asserts MAIN_REPO cwd + explicit ENV= (no bare context)" {
  run grep -q "ENV=mentolder" "$PIPELINE_SCRIPT"; [ "$status" -eq 0 ]
  run grep -q "ENV=korczewski" "$PIPELINE_SCRIPT"; [ "$status" -eq 0 ]
}

@test "FA-SF-20: both escalation sites route PushNotification via ToolSearch" {
  run grep -c "ToolSearch select:PushNotification" "$PIPELINE_SCRIPT"
  [ "$status" -eq 0 ]
  [ "$output" -ge 2 ]
}

@test "FA-SF-20: no scout.* reference escapes the if(!REUSE) Scout block (Deploy ReferenceError guard)" {
  # `const scout` is block-local to `if (!REUSE) { ... }`; any scout.* appearing after
  # the alternative `if (REUSE) {` runs outside that scope → ReferenceError at runtime
  # (the template literal is fully evaluated when the agent() call is built). Out-of-block
  # signals must be hoisted to a top-level var (featureComplexity / featureTouchedFiles).
  blockend=$(grep -n '^if (REUSE) {' "$PIPELINE_SCRIPT" | head -1 | cut -d: -f1)
  [ -n "$blockend" ]
  run awk -v end="$blockend" 'NR > end && /scout[.?]/ { print NR": "$0; f=1 } END { exit (f?1:0) }' "$PIPELINE_SCRIPT"
  [ "$status" -eq 0 ]
}

@test "FA-SF-20: defines consumeInjections and calls it after every phaseEvent(...,'entered')" {
  run grep -q "function consumeInjections" "$PIPELINE_SCRIPT"; [ "$status" -eq 0 ]
  # one consume per entered-boundary: scout, design, plan(x2 reuse+fresh), implement, verify, deploy
  run grep -c "consumeInjections(" "$PIPELINE_SCRIPT"
  [ "$status" -eq 0 ]
  [ "$output" -ge 7 ]
}

@test "FA-SF-20: consumeInjections is best-effort (try/catch, never throws) and uses get-injections --consume" {
  run grep -q "get-injections" "$PIPELINE_SCRIPT"; [ "$status" -eq 0 ]
  run grep -q "'--consume'" "$PIPELINE_SCRIPT"; [ "$status" -eq 0 ]
  # the helper body wraps in try/catch (mirrors phaseEvent)
  run bash -c "awk '/function consumeInjections/,/^}/' \"$PIPELINE_SCRIPT\" | grep -q 'try {'"
  [ "$status" -eq 0 ]
}

@test "FA-SF-20: consumeInjections materializes assets into assets-inbox" {
  run grep -q "assets-inbox" "$PIPELINE_SCRIPT"; [ "$status" -eq 0 ]
}

# ── FA-SF-22-merge-equals-done (T001092) ──────────────────────────#
# Kern-Invariante: grüner Auto-Merge → Ticket direkt done/shipped.
# awaiting_deploy/qa_review verlassen den Happy-Path (Enum bleibt gültig).
DEPLOY_TRANSITION="scripts/factory/deploy-transition.cjs"

@test "FA-SF-22: decideDeployTransition returns done (never awaiting_deploy) on a clean merge" {
  run node -e "const {decideDeployTransition}=require('./scripts/factory/deploy-transition.cjs'); const r=decideDeployTransition({isWebsite:false, deployOutput:'PR #123 merged'}); process.stdout.write(r.status)"
  [ "$status" -eq 0 ]
  [ "$output" = "done" ]
}

@test "T002230: decideDeployTransition has exactly one implementation" {
  # T000909 created deploy-transition.cjs AND deploy-transition.mjs together, both
  # returning awaiting_deploy for non-website tickets. T001092 fixed only the .cjs.
  # The .mjs sat dead for four weeks with the stale pre-T001092 semantics plus a
  # test asserting them — and that is what T002230's first diagnosis read, naming
  # deploy-transition.mjs:15 as the cause of live awaiting_deploy flips that the
  # live .cjs path cannot produce. A second copy of this decision is a trap, not
  # redundancy: keep one.
  local n
  n=$(ls scripts/factory/deploy-transition.* 2>/dev/null | grep -vc '\.test\.' || true)
  [ "$n" -eq 1 ] || {
    echo "expected exactly 1 deploy-transition implementation, found $n:"
    ls scripts/factory/deploy-transition.*
    return 1
  }
  [ -f scripts/factory/deploy-transition.cjs ]
}

@test "T002230: decideDeployTransition ignores isWebsite — both close as done" {
  # Merge = Abschluss (T001092) applies regardless of what changed. scripts/, infra
  # and manifest changes are not "less merged" than website changes; splitting on
  # that axis is what put T002204 and T002193 on awaiting_deploy, where the factory
  # floor hides the lane and openspec.sh archive is fail-closed on status=done.
  run node -e "const {decideDeployTransition}=require('./scripts/factory/deploy-transition.cjs');
const a=decideDeployTransition({isWebsite:true,  deployOutput:'PR #1 merged'}).status;
const b=decideDeployTransition({isWebsite:false, deployOutput:'PR #1 merged'}).status;
process.stdout.write(a+'/'+b)"
  [ "$status" -eq 0 ]
  [ "$output" = "done/done" ]
}

@test "FA-SF-22: decideDeployTransition still blocks on a deploy-guard signal" {
  run node -e "const {decideDeployTransition}=require('./scripts/factory/deploy-transition.cjs'); const r=decideDeployTransition({isWebsite:false, deployOutput:'BLOCK: WORK_BRANCH'}); process.stdout.write(r.status)"
  [ "$status" -eq 0 ]
  [ "$output" = "blocked" ]
}

@test "FA-SF-22: pipeline.js Deploy phase no longer writes an awaiting_deploy status transition" {
  # The happy-path must not call update-status --status awaiting_deploy.
  run grep -Eq "update-status[^\n]*--status[[:space:]]+awaiting_deploy" "$PIPELINE_SCRIPT"
  [ "$status" -ne 0 ]
}

@test "FA-SF-22: pipeline.js Deploy phase no longer writes a qa_review status transition" {
  run grep -Eq "update-status[^\n]*--status[[:space:]]+qa_review" "$PIPELINE_SCRIPT"
  [ "$status" -ne 0 ]
}

@test "FA-SF-22: pipeline.js closes the ticket with --status done --resolution shipped" {
  # Merge = Abschluss: the close now happens in pr-babysit-ticket.sh on confirmed merge.
  run bash -c "grep -Eq -- '--status[[:space:]]+done' \"$PRBABYSIT\" && grep -Eq -- '--resolution[[:space:]]+shipped' \"$PRBABYSIT\""
  [ "$status" -eq 0 ]
}

@test "FA-SF-22: dev-flow-execute SKILL closes with done/shipped, not qa_review" {
  SKILL=".claude/skills/dev-flow-execute/SKILL.md"
  run grep -Eq -- "--status[[:space:]]+done[^\n]*--resolution[[:space:]]+|--resolution[^\n]*--status[[:space:]]+done" "$SKILL"
  [ "$status" -eq 0 ]
  run grep -Eq -- "update-status[^\n]*--status[[:space:]]+qa_review" "$SKILL"
  [ "$status" -ne 0 ]
}

@test "FA-SF-22: transition.ts retains awaiting_deploy + qa_review in VALID_STATUSES (non-destructive)" {
  TS="website/src/lib/tickets/transition.ts"
  run grep -q "awaiting_deploy" "$TS"; [ "$status" -eq 0 ]
  run grep -q "qa_review" "$TS"; [ "$status" -eq 0 ]
}

# ── FA-SF-53-decompose ──────────────────────────────────────────#
# FA-SF-53: pipeline-decompose — offline unit tests for the decomposition helper.

@test "FA-SF-53: pipeline-decompose.cjs exists and is syntactically valid" {
  [ -f "$DECOMPOSE_MOD" ]
  run node --check "$DECOMPOSE_MOD"
  [ "$status" -eq 0 ]
}

@test "FA-SF-53: node --test suite passes" {
  run node --test "$DECOMPOSE_SUITE"
  [ "$status" -eq 0 ]
  [[ "$output" == *"fail 0"* ]]
}

@test "FA-SF-53: exports the six contract functions" {
  for fn in "chooseModel" "chooseEffort" "buildContextHints" "provision" "assignFiles" "validateDisjoint"; do
    run grep -Fq "$fn" "$DECOMPOSE_MOD"; [ "$status" -eq 0 ]
  done
}

@test "FA-SF-53: exports via module.exports (CommonJS)" {
  run grep -q "module.exports" "$DECOMPOSE_MOD"
  [ "$status" -eq 0 ]
}

@test "FA-SF-53: defines SHARED_FILE_LIST with the three shared files" {
  run grep -Fq "configmap-domains.yaml" "$DECOMPOSE_MOD"
  [ "$status" -eq 0 ]
  run grep -Fq "environments/schema.yaml" "$DECOMPOSE_MOD"
  [ "$status" -eq 0 ]
  run grep -Fq "k3d/kustomization.yaml" "$DECOMPOSE_MOD"
  [ "$status" -eq 0 ]
}

# ── FA-SF-21-ticket-cli ─────────────────────────────────────────#
# FA-SF-21: offline arg-validation contract for the new ticket.sh subcommands.

@test "FA-SF-21: get requires --id" {
  run bash scripts/ticket.sh get
  [ "$status" -eq 2 ]
  [[ "$output" =~ "--id" ]]
}

@test "FA-SF-21: set-touched-files requires --id and --files" {
  run bash scripts/ticket.sh set-touched-files --id T000001
  [ "$status" -eq 2 ]
  [[ "$output" =~ "--files" ]]
}

@test "FA-SF-21: set-pipeline-slot requires --id and --slot" {
  run bash scripts/ticket.sh set-pipeline-slot --id T000001
  [ "$status" -eq 2 ]
}

@test "FA-SF-21: unknown BRAND is rejected with exit 2" {
  run env BRAND=bogus bash scripts/ticket.sh get --id T000001
  [ "$status" -eq 2 ]
  [[ "$output" =~ "unknown BRAND" ]]
}

@test "FA-SF-21: dispatch lists the new commands in usage" {
  run bash scripts/ticket.sh
  [ "$status" -eq 1 ]
  [[ "$output" =~ "set-touched-files" ]]
}

@test "FA-SF-21: enqueue requires --id" {
  run bash scripts/ticket.sh enqueue --branch feature/x --plan docs/p.md
  [ "$status" -eq 2 ]
}
@test "FA-SF-21: enqueue rejects unknown option" {
  run bash scripts/ticket.sh enqueue --id T000001 --bogus z
  [ "$status" -eq 2 ]
}
@test "FA-SF-21: unknown command still errors" {
  run bash scripts/ticket.sh frobnicate
  [ "$status" -ne 0 ]
}

# ── FA-SF-22-fixtures ───────────────────────────────────────────#
# FA-SF-22: factory shared lib + test fixtures contract (offline assertions only).

@test "FA-SF-22: lib.sh dry-resolve is brand-independent [T002689]" {
  # Frueher: "maps korczewski to workspace-korczewski". Die Abbildung
  # brand->Namespace ist auf dem SDLC-Datenpfad entfallen — beide Brands liegen
  # in derselben Datenbank, der Namespace haengt am Kontext. Positiv-Anker
  # zuerst: mentolder liefert ueberhaupt eine Aufloesung.
  run env BRAND=mentolder FACTORY_DRY_RESOLVE=1 bash -c 'source scripts/factory/lib.sh; factory_resolve; echo "ns=$FACTORY_NS ctx=$FACTORY_CTX"'
  [ "$status" -eq 0 ]
  [[ "$output" == *"ns=workspace "* ]]

  run env BRAND=korczewski FACTORY_DRY_RESOLVE=1 bash -c 'source scripts/factory/lib.sh; factory_resolve; echo "ns=$FACTORY_NS ctx=$FACTORY_CTX"'
  [ "$status" -eq 0 ]
  [[ "$output" == *"ns=workspace "* ]]
  [[ "$output" != *"workspace-korczewski"* ]]
}

@test "FA-SF-22: lib.sh rejects unknown BRAND" {
  run env BRAND=bogus bash -c 'source scripts/factory/lib.sh; factory_resolve'
  [ "$status" -eq 2 ]
}

@test "FA-SF-22: fixtures refuse to seed into prod fleet without override" {
  run env FACTORY_CTX=fleet bash -c 'source tests/lib/factory-test-fixtures.sh; seed_test_feature mentolder "tests/fixtures/x.txt"'
  [ "$status" -ne 0 ]
  [[ "$output" =~ "refusing" ]]
}

# ── FA-SF-48-ticket-phase-cli ───────────────────────────────────#
# FA-SF-48: offline arg-validation for the `ticket.sh phase` subcommand. [T-FACTORY-FLOOR]
# (Renamed from the plan's FA-SF-40 — that number is taken by FA-SF-40-provision.bats.)
# All cases validate BEFORE _pgpod, so they are deterministic without a cluster (CI-safe).

@test "FA-SF-48: phase requires ext_id, phase and state" {
  run bash scripts/ticket.sh phase
  [ "$status" -eq 2 ]
  [[ "$output" =~ "Usage" ]]
}
@test "FA-SF-48: phase rejects an invalid phase name" {
  run bash scripts/ticket.sh phase T000001 frobnicate entered
  [ "$status" -eq 2 ]
  [[ "$output" =~ "phase must be one of" ]]
}
@test "FA-SF-48: phase rejects an invalid state" {
  run bash scripts/ticket.sh phase T000001 scout sideways
  [ "$status" -eq 2 ]
  [[ "$output" =~ "state must be one of" ]]
}
@test "FA-SF-48: phase rejects an invalid driver" {
  run bash scripts/ticket.sh phase T000001 scout entered --driver gemini
  [ "$status" -eq 2 ]
  [[ "$output" =~ "driver must be one of" ]]
}
@test "FA-SF-48: dispatch usage lists phase" {
  run bash scripts/ticket.sh
  [ "$status" -eq 1 ]
  [[ "$output" =~ "phase" ]]
}

# ── FA-SF-49-injection-cli ──────────────────────────────────────#
# FA-SF-49: offline arg-validation for `ticket.sh inject` + `get-injections`. [factory-injection]
# All cases validate BEFORE _pgpod, so they are deterministic without a cluster (CI-safe).

@test "FA-SF-49: inject requires --id and --kind" {
  run bash scripts/ticket.sh inject --content "hi"
  [ "$status" -eq 2 ]
  [[ "$output" =~ "required" ]]
}
@test "FA-SF-49: inject rejects an invalid kind" {
  run bash scripts/ticket.sh inject --id T000001 --kind frobnicate
  [ "$status" -eq 2 ]
  [[ "$output" =~ "kind must be one of" ]]
}
@test "FA-SF-49: inject rejects an invalid phase" {
  run bash scripts/ticket.sh inject --id T000001 --kind note --phase sideways --content x
  [ "$status" -eq 2 ]
  [[ "$output" =~ "phase must be one of" ]]
}
@test "FA-SF-49: inject asset requires --file or --nc-path" {
  run bash scripts/ticket.sh inject --id T000001 --kind asset
  [ "$status" -eq 2 ]
  [[ "$output" =~ "asset requires" ]]
}
@test "FA-SF-49: inject --file rejects a missing file" {
  run bash scripts/ticket.sh inject --id T000001 --kind asset --file /no/such/file.png
  [ "$status" -eq 2 ]
  [[ "$output" =~ "not a file" ]]
}
@test "FA-SF-49: get-injections requires --id" {
  run bash scripts/ticket.sh get-injections
  [ "$status" -eq 2 ]
  [[ "$output" =~ "required" ]]
}
@test "FA-SF-49: get-injections rejects an invalid --phase" {
  run bash scripts/ticket.sh get-injections --id T000001 --phase nope
  [ "$status" -eq 2 ]
  [[ "$output" =~ "phase must be one of" ]]
}
@test "FA-SF-49: dispatch usage lists inject and get-injections" {
  run bash scripts/ticket.sh
  [ "$status" -eq 1 ]
  [[ "$output" =~ "inject" ]]
  [[ "$output" =~ "get-injections" ]]
}

# ── FA-SF-50-stage-plan ─────────────────────────────────────────#
# FA-SF-50: offline arg-validation for `ticket.sh stage-plan` (Kommissionierung).
# Validierung passiert VOR _pgpod (FA-SF-35-Muster) -> kein Cluster nötig.

@test "FA-SF-50: stage-plan requires --id" {
  run bash scripts/ticket.sh stage-plan --branch feature/x --plan docs/p.md
  [ "$status" -eq 2 ]
  [[ "$output" =~ "--id" ]]
}
@test "FA-SF-50: stage-plan requires --branch" {
  run bash scripts/ticket.sh stage-plan --id T000001 --plan docs/p.md
  [ "$status" -eq 2 ]
  [[ "$output" =~ "--branch" ]]
}
@test "FA-SF-50: stage-plan requires --plan" {
  run bash scripts/ticket.sh stage-plan --id T000001 --branch feature/x
  [ "$status" -eq 2 ]
  [[ "$output" =~ "--plan" ]]
}
@test "FA-SF-50: stage-plan rejects unknown option" {
  run bash scripts/ticket.sh stage-plan --id T000001 --branch b --plan p --bogus x
  [ "$status" -eq 2 ]
  [[ "$output" =~ "Unknown" ]]
}
@test "FA-SF-50: dispatch usage lists stage-plan" {
  run bash scripts/ticket.sh
  [ "$status" -eq 1 ]
  [[ "$output" =~ "stage-plan" ]]
}
