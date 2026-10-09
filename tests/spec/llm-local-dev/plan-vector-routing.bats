#!/usr/bin/env bats
# plan-vector-routing.bats — Tests fuer T901542 (staged plans als K1-Doctype
# plan_partial + Dispatch-Recall mit Size-Tier im plan-runner).
# Offline-safe: K1-Backend (DB/Embed) und Recall-Binary werden gemockt, kein Netzwerk.

setup() {
  ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  FIXTURES="$BATS_TEST_DIRNAME/fixtures"
  PLAN_DIR="$BATS_TEST_TMPDIR/fixture-plan"
  mkdir -p "$PLAN_DIR/tasks.d"
  cat > "$PLAN_DIR/tasks.md" <<'EOF'
---
title: "fixture plan"
ticket_id: T9FIXTURE
---

# Fixture plan

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1.md | impl | scripts/foo.mjs | |
| p2 | tasks.d/p2.md | tests | tests/foo.bats | p1 |
EOF
  printf '# p1 body\n' > "$PLAN_DIR/tasks.d/p1.md"
  printf '# p2 body\n' > "$PLAN_DIR/tasks.d/p2.md"
  export PLAN_STAGE_INDEX_MOCK=1
  export PLAN_RUNNER_RECALL_BIN="$FIXTURES/plan-vector-routing-fake-retrieve.sh"
  export FAKE_RECALL_MODE=ok
  export WORKERS_URL="file://$ROOT/scripts/llm/plan-runner/workers.mjs"
  export PLAN_URL="file://$ROOT/scripts/llm/plan-runner/plan.mjs"
}

@test "stage-index emits receipt JSON with partials, collection and receipt (mocked backend)" {
  run node "$ROOT/scripts/llm/plan-stage-index.mjs" --plan-dir "$PLAN_DIR"
  [ "$status" -eq 0 ]
  [ "$(printf '%s' "$output" | jq -r '.partials | join(",")')" = "p1,p2" ]
  [ "$(printf '%s' "$output" | jq -r '.collection')" = "specs_plans" ]
  [ "$(printf '%s' "$output" | jq -r '.receipt.mocked')" = "true" ]
}

@test "stage-index backend failure warns on stderr and exits 0 (staging never blocked)" {
  export PLAN_STAGE_INDEX_MOCK=fail
  run node "$ROOT/scripts/llm/plan-stage-index.mjs" --plan-dir "$PLAN_DIR"
  [ "$status" -eq 0 ]
  # Hinweis: dieses bats mergt stderr in $output (kein --separate-stderr).
  [[ "$output" == *"WARN"* ]]
  [[ "$output" == *'"receipt": null'* ]]
}

@test "decideTrack stays backward compatible (worker/self/idle)" {
  run node --input-type=module -e '
const m = await import(process.env.WORKERS_URL);
const cases = [
  [m.decideTrack({ ready: ["a"], freeSlots: 1 }), "worker"],
  [m.decideTrack({ ready: ["a"], freeSlots: 0 }), "self"],
  [m.decideTrack({ ready: [], freeSlots: 1 }), "idle"],
];
for (const [got, want] of cases) {
  if (got !== want || typeof got !== "string") { console.error(`got ${String(got)} want ${want}`); process.exit(1); }
}'
  [ "$status" -eq 0 ]
}

@test "decideTrack with sizes l returns l hint but keeps routing on existing tracks" {
  run node --input-type=module -e '
const m = await import(process.env.WORKERS_URL);
const r = m.decideTrackWithHint({ ready: ["a"], freeSlots: 1, sizes: { a: "l" } });
if (r.track !== "worker" || r.sizeHint !== "l") { console.error(JSON.stringify(r)); process.exit(1); }
if (r.track === "heavy") { console.error("no heavy track without a deployed model"); process.exit(1); }
const d = m.decideTrackWithHint({ ready: ["a"], freeSlots: 1 });
if (d.sizeHint !== "m") { console.error("default size must be m: " + JSON.stringify(d)); process.exit(1); }'
  [ "$status" -eq 0 ]
}

@test "manifest accepts optional size column defaulting to m" {
  run node --input-type=module -e '
const m = await import(process.env.PLAN_URL);
const rows = m.parseManifest([
  "## Partials", "",
  "| id | file | role | target_files | depends_on | size |",
  "|----|------|------|--------------|------------|------|",
  "| p1 | tasks.d/p1.md | impl | a.mjs | | s |",
  "| p2 | tasks.d/p2.md | tests | b.bats | p1 |",
].join("\n"));
if (rows[0].size !== "s") { console.error("p1 size: " + rows[0].size); process.exit(1); }
if (rows[1].size !== "m") { console.error("p2 default size: " + rows[1].size); process.exit(1); }'
  [ "$status" -eq 0 ]
}

@test "worker prompt omits similar-partials section when retrieve fails" {
  export FAKE_RECALL_MODE=fail
  run node --input-type=module -e '
const m = await import(process.env.PLAN_URL);
const prompt = m.buildWorkerPrompt({ partial: { id: "p1", role: "impl", targetFiles: ["a"], dependsOn: [] }, partialText: "do things", worktree: "/tmp/wt" });
if (prompt.includes("Ähnliche Partials")) { console.error(prompt); process.exit(1); }
if (!prompt.startsWith("Partial-ID: p1")) { console.error("first line must stay Partial-ID"); process.exit(1); }'
  [ "$status" -eq 0 ]
}

@test "worker prompt carries similar-partials section when retrieve succeeds" {
  export FAKE_RECALL_MODE=ok
  run node --input-type=module -e '
const m = await import(process.env.PLAN_URL);
const prompt = m.buildWorkerPrompt({ partial: { id: "p1", role: "impl", targetFiles: ["a"], dependsOn: [] }, partialText: "do things", worktree: "/tmp/wt" });
if (!prompt.includes("Ähnliche Partials")) { console.error(prompt); process.exit(1); }
if (!prompt.includes("Fake Partial-Snippet")) { console.error(prompt); process.exit(1); }'
  [ "$status" -eq 0 ]
}

@test "stage-plan.sh hooks plan-stage-index fail-soft after staging" {
  grep -q "plan-stage-index.mjs" "$ROOT/scripts/vda/ticket/stage-plan.sh"
  grep -q "WARN: stage-plan: plan-stage-index" "$ROOT/scripts/vda/ticket/stage-plan.sh"
}
