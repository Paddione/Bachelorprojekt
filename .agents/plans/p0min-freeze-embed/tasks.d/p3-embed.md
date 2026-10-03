# Partial p3: Embedding Pin and Retrieval Checks (gate G2)

Depends on the p1 freeze and the p2 handled-by map. Pins the bge-m3 Q8_0 1024d
embedding against the frozen corpus and runs the held-out retrieval checks.

## Task 1: Pin embedding with corpus hash

**Files:** `docs/brain/embed-eval-report.md`

- Record the model plus the corpus hash plus the K3 snapshot in
  `embed-eval-report.md` so the embedding run is reproducible.

```bash
grep -n "bge-m3" k3d/llm-gpu.yaml scripts/index-repo.ts | head -10
sha256sum docs/brain/corpus-freeze.json
```

## Task 2: Held-out retrieval and FSD checks

**Files:** `tests/spec/p0min-freeze-embed.bats`

- Write `p0min-freeze-embed.bats` with 3 held-out tickets checked at top-k plus
  the FSD zero-FP check.
- Run the new spec to verify it fails before the embed pipeline exists.
  Expected: FAIL with "corpus-freeze.json not found" or missing-map errors.

```bash
bash tests/unit/lib/bats-core/bin/bats tests/spec/p0min-freeze-embed.bats
# Expected: FAIL (embed pipeline not implemented yet — red step proves the spec binds)
```

## Task 3: Final gate

**Files:** `tests/spec/p0min-freeze-embed.bats`

- Re-run the spec after the pipeline lands and confirm green.

```bash
bash tests/unit/lib/bats-core/bin/bats tests/spec/p0min-freeze-embed.bats
task test:changed
task freshness:regenerate
task freshness:check
```
