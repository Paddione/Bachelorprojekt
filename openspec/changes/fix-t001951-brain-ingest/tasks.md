# Plan: Fix T001951 — Brain Ingest Backlog 17→0

## Context
17 of 86 worklist pages are missing from the local ingest state. Full curated ingest via `scripts/brain-ingest.sh`, GPU-host-bound. Previous T001912 was done without measurement fix.

## Tasks

1. **Check current backlog**
   - Run `bash scripts/brain-ingest-worklist.sh 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'backlog: {d[\"missing_count\"]}')" `
   - Verify the 17 items are still pending

2. **Ensure GPU host is available**
   - Verify llama-server ingest-pool is running on the GPU host
   - Check `LM_STUDIO_URL` (default `http://localhost:8095`) is reachable

3. **Run full ingest**
   - `bash scripts/brain-ingest.sh --brain-repo /path/to/brain`
   - Monitor for errors (transform failures, LLM timeouts)
   - This processes all missing pages including the 17 backlog items

4. **Verify ingest state**
   - Re-run worklist script: missing_count should be 0
   - Check `~/.brain-ingest-state.json` for updated hashes

5. **Update goals.md baseline**
   - Set G-BRAIN14 to 0
   - Add Baseline-Update entry

## Verify
- `bash scripts/brain-ingest-worklist.sh 2>/dev/null` shows 0 missing
- `bash scripts/health-goals-check.sh --only=G-BRAIN14` shows target reached
