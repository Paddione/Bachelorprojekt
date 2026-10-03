# Embedding Eval Report (G2 pin — STAGED, pipeline not yet run)

Partial p3 (T900989). Pins the embedding run so the first full embedding
executes against a recorded corpus hash. Status: **STAGED** — the record and
the spec below are the deliverable; no vectors have been produced yet.

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
