#!/usr/bin/env bats
# SSOT-Spec: openspec/specs/brain-k4-brain-wiki.md
# Ticket: T900448

setup() {
  command -v node >/dev/null 2>&1 || skip "node nicht verfügbar"
  ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  NODE_INDEX="$ROOT/scripts/brain-mcp-node/index.mjs"
  NODE_SERVER="$ROOT/scripts/brain-mcp-node/server.mjs"
  PY_INDEX="$ROOT/scripts/brain-index.py"
  WIKI="$BATS_TEST_TMPDIR/wiki"
  mkdir -p "$WIKI"
  cat > "$WIKI/alpha.md" <<'EOF'
---
type: decision
tags: [eval, alpha]
status: active
source_kind: openspec
observed_at: 2025-01-01
valid_from: 2025-01-01
valid_until: 2030-01-01
---
Alpha banana architecture decision banana.
EOF
  cat > "$WIKI/beta.md" <<'EOF'
---
type: note
tags: [eval, beta]
status: active
source_kind: runbook
observed_at: 2020-01-01
valid_from: 2020-01-01
valid_until: 2024-01-01
---
Beta banana operations handbook.
EOF
  cat > "$WIKI/gamma.md" <<'EOF'
---
type: note
tags: [eval]
status: active
---
Gamma legacy kiwi notes.
EOF
  cat > "$WIKI/dated.md" <<'EOF'
---
type: note
tags: [Alpha]
status: active
source_kind: runbook
valid_from: 2025-01-01
---
Dated banana content here.
EOF
}

@test "python and node indexes return identical slugs in identical order" {
  local queries="$BATS_TEST_TMPDIR/queries.json"
  cat > "$queries" <<'EOF'
[
  {"id":"unfiltered","query":"banana","filters":{}},
  {"id":"tags-lower","query":"banana","filters":{"tags":["eval"]}},
  {"id":"tags-upper","query":"banana","filters":{"tags":["EVAL"]}},
  {"id":"type-note","query":"banana","filters":{"type":"note"}},
  {"id":"asof-inside","query":"banana","filters":{"as_of":"2026-01-01"}},
  {"id":"asof-outside","query":"banana","filters":{"as_of":"2031-01-01"}}
]
EOF
  local sweep_mjs="$BATS_TEST_TMPDIR/sweep.mjs"
  cat > "$sweep_mjs" <<'EOF'
import { readFileSync, writeFileSync } from "node:fs";
const indexPath = process.argv[2];
const wikiDir = process.argv[3];
const queriesPath = process.argv[4];
const outPath = process.argv[5];
const { BrainIndex } = await import(indexPath);
const index = new BrainIndex(wikiDir);
const cases = JSON.parse(readFileSync(queriesPath, "utf8"));
const out = {};
for (const c of cases) {
  const f = c.filters || {};
  const filters = {};
  if (f.tags !== undefined) filters.tags = f.tags;
  if (f.type !== undefined) filters.pageType = f.type;
  if (f.as_of !== undefined) filters.asOf = f.as_of;
  const hits = index.search(c.query, 5, filters);
  out[c.id] = hits.map((h) => ({ slug: h.slug, score: h.score }));
}
writeFileSync(outPath, JSON.stringify(out));
EOF
  local sweep_py="$BATS_TEST_TMPDIR/sweep.py"
  cat > "$sweep_py" <<'EOF'
import importlib.util
import json
import sys
from pathlib import Path
index_path, wiki_dir, queries_path, out_path = sys.argv[1:5]
spec = importlib.util.spec_from_file_location("brain_index", index_path)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
index = mod.BrainIndex(Path(wiki_dir))
cases = json.loads(Path(queries_path).read_text(encoding="utf-8"))
out = {}
for c in cases:
    f = c.get("filters", {})
    kwargs = {}
    if "tags" in f:
        kwargs["tags"] = f["tags"]
    if "type" in f:
        kwargs["page_type"] = f["type"]
    if "as_of" in f:
        kwargs["as_of"] = f["as_of"]
    hits = index.search(c["query"], 5, **kwargs)
    out[c["id"]] = [{"slug": h["slug"], "score": h["score"]} for h in hits]
Path(out_path).write_text(json.dumps(out), encoding="utf-8")
EOF
  local compare="$BATS_TEST_TMPDIR/compare.mjs"
  cat > "$compare" <<'EOF'
import { readFileSync } from "node:fs";
const fail = (msg) => { console.error("parity mismatch: " + msg); process.exit(1); };
const py = JSON.parse(readFileSync(process.argv[2], "utf8"));
const node = JSON.parse(readFileSync(process.argv[3], "utf8"));
const pyIds = Object.keys(py).sort();
const nodeIds = Object.keys(node).sort();
if (JSON.stringify(pyIds) !== JSON.stringify(nodeIds)) fail("query id sets differ");
for (const id of pyIds) {
  const a = py[id];
  const b = node[id];
  if (a.length !== b.length) fail(`${id}: hit count ${a.length} vs ${b.length}`);
  for (let i = 0; i < a.length; i++) {
    if (a[i].slug !== b[i].slug) fail(`${id}[${i}]: slug ${a[i].slug} vs ${b[i].slug}`);
    if (a[i].slug.includes("/")) fail(`${id}[${i}]: slug contains slash: ${a[i].slug}`);
    if (Math.abs(a[i].score - b[i].score) > 0.0001) fail(`${id}[${i}]: score ${a[i].score} vs ${b[i].score}`);
  }
}
if (!py.unfiltered.some((h) => h.slug === "dated")) fail("unfiltered misses dated (python)");
if (!node.unfiltered.some((h) => h.slug === "dated")) fail("unfiltered misses dated (node)");
if (py["tags-upper"].length !== 0) fail("tags-upper not empty (python)");
if (node["tags-upper"].length !== 0) fail("tags-upper not empty (node)");
console.log(`parity ok: ${pyIds.length} queries identical`);
EOF
  local py_out="$BATS_TEST_TMPDIR/py-hits.json" node_out="$BATS_TEST_TMPDIR/node-hits.json"
  run node "$sweep_mjs" "$NODE_INDEX" "$WIKI" "$queries" "$node_out"
  [ "$status" -eq 0 ]
  run python3 "$sweep_py" "$PY_INDEX" "$WIKI" "$queries" "$py_out"
  [ "$status" -eq 0 ]
  run node "$compare" "$py_out" "$node_out"
  [ "$status" -eq 0 ]
}

@test "brain_search via node server returns hits instead of errors" {
  run bash -c 'printf "%s\n" "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{}}" "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"brain_search\",\"arguments\":{\"query\":\"banana\",\"top_k\":5}}}" "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"tools/call\",\"params\":{\"name\":\"brain_search\",\"arguments\":{\"query\":\"banana\",\"top_k\":1}}}" "{\"jsonrpc\":\"2.0\",\"id\":4,\"method\":\"tools/call\",\"params\":{\"name\":\"brain_search\",\"arguments\":{\"query\":\"x\",\"top_k\":\"bad\"}}}" | BRAIN_WIKI_DIR="$0" timeout 20 node "$1"' "$WIKI" "$NODE_SERVER"
  [ "$status" -eq 0 ]
  [[ "$output" != *'Internal error'* ]]
  local responses="$BATS_TEST_TMPDIR/responses.jsonl"
  printf '%s\n' "$output" > "$responses"
  local check="$BATS_TEST_TMPDIR/check-server.mjs"
  cat > "$check" <<'EOF'
import { readFileSync } from "node:fs";
const fail = (msg) => { console.error("server check: " + msg); process.exit(1); };
const lines = readFileSync(process.argv[2], "utf8").split("\n").filter((l) => l.trim());
if (lines.length !== 4) fail(`expected 4 responses, got ${lines.length}`);
const byId = {};
for (const line of lines) {
  const msg = JSON.parse(line);
  byId[msg.id] = msg;
}
const hits = (msg) => JSON.parse(msg.result.content[0].text).results;
const r2 = byId[2];
if (!r2 || r2.error) fail("id 2 has error: " + JSON.stringify(r2 && r2.error));
if (hits(r2).length < 1) fail("id 2 has no hits");
const r3 = byId[3];
if (!r3 || r3.error) fail("id 3 has error: " + JSON.stringify(r3 && r3.error));
if (hits(r3).length > 1) fail("id 3 exceeds top_k=1");
const r4 = byId[4];
if (!r4.error || r4.error.code !== -32602) fail("id 4 lacks -32602, got: " + JSON.stringify(r4));
console.log("server responses ok");
EOF
  run node "$check" "$responses"
  [ "$status" -eq 0 ]
}
