# Embedding Eval Report (G2 pin — RUN recorded 2026-10-03)

Partial p3 (T900989). Pins the embedding run so the first full embedding
executes against a recorded corpus hash. Status: **RUN** — the first full
embedding executed on 2026-10-03 (T900990, PR #6224); the run record lives in
`docs/brain/embed-index.json`, results in "First full run" below. The pin
tables are unchanged from the staged state.

## Pin

| Field | Value |
|---|---|
| Model | `bge-m3` (`bge-m3-Q8_0.gguf`, Q8_0, 1024 dims) |
| Model source | `k3d/llm-gpu.yaml` (`bge-embed` Service, llama.cpp CPU-only) + `scripts/index-repo.ts` (`EMBED_MODEL='bge-m3'`, aligned with `components/website/src/lib/embeddings.ts`) |
| Corpus | `docs/brain/corpus-freeze.json` — 349 routes, frozen @ `8fed539b996fdcb89181fa8e8084fec8d299c8ab`, id-scheme `repo@commit:path:symbol` |
| Corpus sha256 | `d8b03c5981a7f4dd43675001e9b49f19856de309cc41d076792e4f81fdeccffd` |
| Handled-by map | `docs/brain/handled-by-map.json` (349 rows, all `handled_by` non-empty, max hops 2) |
| Handled-by sha256 | `17bc9a1485256f2d8ff308620d5c913067ba3aa3e76c8d06a13c6b966e0b1fe2` |
| K3 snapshot | frozen corpus commit `8fed539b996fdcb89181fa8e8084fec8d299c8ab` (Route 462 vs HANDLES 69 origin of the P0-min plan) |
| G1 evidence | `docs/brain/route-handledby-sample.md` (50/50 PASS, precision 100%) |

## Held-out retrieval set (top-k, k=5)

Deterministic, outside the G1 sample (every-7th rows 0..343), one per slice:

| Route | Slice | Expected handler top-5 |
|---|---|---|
| `auth/callback.ts:GET` (map idx 268) | auth | `components/website/src/lib/auth.ts` |
| `billing/create-invoice.ts:POST` (map idx 278) | billing | `components/website/src/lib/stripe-billing.ts` |
| `brett/bot.ts:POST` (map idx 284) | brett | `components/website/src/lib/brett-bot.ts` |

Pass rule: expected handler ranks in top-5 of the embedded index
(`docs/brain/embed-index.json`, key `held_out`) after rerank.

## FSD zero-FP checks

FSD = freeze-slice drift: (a) denylisted generated artefacts
(`docs/code-quality/repo-index.json`,
`components/website/src/data/openspec-status.json`) appear in **zero**
corpus routes; (b) every frozen route path resolves on disk.

## Red-first evidence

Spec `tests/spec/p0min-freeze-embed.bats`, run before the pipeline exists:

- Pin + FSD tests: PASS (record binds to the frozen files).
- 3 retrieval tests: SKIP (`embed pipeline not implemented yet`); forced red
  via `P0MIN_FORCE_RETRIEVAL=1` → FAIL with `embed pipeline not implemented
  yet (no docs/brain/embed-index.json)`, proving the spec binds.
- After the pipeline lands `docs/brain/embed-index.json`, re-run: skips
  activate, 8/8 green = gate G2.

```bash
bash tests/unit/lib/bats-core/bin/bats tests/spec/p0min-freeze-embed.bats
P0MIN_FORCE_RETRIEVAL=1 bash tests/unit/lib/bats-core/bin/bats tests/spec/p0min-freeze-embed.bats  # red-first
```

## First full run (T900990, 2026-10-03)

Status: **DONE** — pipeline `scripts/p0min-embed-run.py` green, gate G2
retrieval 3/3 top-5.

| Field | Value |
|---|---|
| Model | `bge-m3` (llm-gateway-embed, Q8_0 GGUF, 1024 dims, `n_ctx_slot=4096`) |
| Endpoint | `http://localhost:8081` (port-forward svc/llm-gateway-embed) |
| Corpus sha256 | `d8b03c5981a7f4dd43675001e9b49f19856de309cc41d076792e4f81fdeccffd` |
| Handled-by sha256 | `17bc9a1485256f2d8ff308620d5c913067ba3aa3e76c8d06a13c6b966e0b1fe2` |
| K3 snapshot | frozen corpus commit `8fed539b996fdcb89181fa8e8084fec8d299c8ab` |
| Index artifact | `docs/brain/embed-index.json`, sha256 `d204a12c4cc34fba8b7a03b7e724382e1c7f7c72c8ccc2bfb503a147022adbe4` |
| Candidates | 116 distinct `handled_by` handlers (349 rows flattened) |
| Candidate text | handler repo path + file content head (2500 chars) |
| Query text | route id + route file source head (2500 chars) |
| K3 full index | `task codebase:index` exit 0, receipt `beb451dbaa9238ad` (mode full, tool 0.10.8, 56131 nodes / 135693 edges) |

Held-out top-5 (k=5, spec `tests/spec/p0min-freeze-embed.bats` 8/8 green):

| Route | Expected | Rank |
|---|---|---|
| `auth/callback.ts:GET` | `components/website/src/lib/auth.ts` | 4 |
| `billing/create-invoice.ts:POST` | `components/website/src/lib/stripe-billing.ts` | 2 |
| `brett/bot.ts:POST` | `components/website/src/lib/brett-bot.ts` | 1 |

Run history: runs 2–3 failed on oversized embed batches (4×6000-char
texts overflow the bge-embed 4096-token slot → `RemoteDisconnected`;
run 3 also hit a `bge-embed` pod restart mid-run). Fixed to 2×2500-char
batches + retry. Run 4 (bare route-id queries) scored 1/3 — id strings
only match path-similar files; run 5 (id + route source queries) 3/3.

Freshness caveat: `python3 scripts/mcp/cbm-freshness.py status` reports
`unknown` (`probe-malformed` + `root-mismatch`), NOT `fresh`, for reasons
outside this ticket's file boundary: (a) tool 0.10.8 `detect_changes`
defaults to human-readable text, the helper parses JSON (needs
`--format json`); (b) the tool canonicalizes the worktree `repo_path` to
the main-checkout git root, so the graph identity can never equal a
worktree checkout. Fix belongs to the freshness helper / tool, filed for
follow-up — the K3 receipt above is the run evidence.
