## Why

Epic T900447 (ADR-009) kills the curated wiki mirror (~83 % spec copies) in
favor of raw K1 recall — but nobody has measured what curated retrieval is
worth today. Without a baseline, dropping curation is an unhedged bet. At the
same time the wired MCP read path (`brain-mcp-node`) diverges from the Python
reference and calls the index with the wrong signature.

## What Changes

- Extend `tests/fixtures/brain/retrieval-eval.jsonl` (~2 → ~12 cases across
  wiki groups plus `as_of`/stale and filter cases) and wire it as the
  versioned eval set (CI runs it via BATS on a deterministic fixture).
- Record a one-off baseline run against the real wiki as committed JSON
  (informational, no threshold gate).
- Bring `scripts/brain-mcp-node/` to full parity with the Python index
  (signature fix, slug-key and tags-case alignment) with parity tests.
- Land ADR-009 final (`docs/adr/ADR-009-brain-3layer-architektur.md`).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `openspec/specs/brain-k4-brain-wiki.md`: retrieval evaluation gets a wired
  versioned set plus committed baseline; the MCP read path gains a Node/Python
  parity contract.

## Impact

- `tests/fixtures/brain/`, `tests/spec/brain-k4-brain-wiki/`,
  `scripts/brain-mcp-node/`, `docs/adr/ADR-009-*`.
- No runtime behavior change for brands; no new CI workflow (BATS is the gate);
  no threshold enforcement anywhere.
