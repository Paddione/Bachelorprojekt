## Context

The Software Factory Scout phase (`scripts/factory/scout.sh`) uses deterministic grep-based file discovery to predict which files a feature ticket will touch. Since mid-July 2026, this has produced 20+ SCOUT_WEAK events and 5+ scout_drift=1 events — the scout systematically under-predicts or fails to find files.

The current architecture:
1. `scout.sh` — keyword extraction → grep/find → complexity classification → risk areas
2. `scout-llm-fallback.sh` — DeepSeek fallback when deterministic discovery finds <4 files
3. `pipeline-runner.js` — orchestrates scout, applies quality gate, persists touched_files, merges SCS suggestions
4. `scout-quality-check.cjs` — evaluates output quality (non-empty touched_files, spec ≥300 chars, plan_path set)
5. `scout-drift.sh`/`scout-drift.cjs` — post-merge drift calculation (Jaccard distance)

## Goals / Non-Goals

**Goals:**
- Increase touched_files discovery hit rate: reduce `touched_files_empty` from ~50% to <10%
- Improve prediction accuracy: reduce scout_drift from 0.67+ to <0.3 Jaccard distance
- Reduce SCOUT_WEAK rate: from 17+/week to <2/week
- Feed historical drift data back into scout.sh for self-correction

**Non-Goals:**
- No changes to the pipeline orchestration (pipeline.mjs/dispatcher.js) — that's T002003 territory
- No new external dependencies or database schema changes
- No changes to the complexity classification algorithm (simple/medium/complex)
- No changes to the post-merge drift ratchet cycle

## Decisions

### D1: N-gram keyword extraction in scout.sh

**Decision:** Replace single-word keyword extraction with bigram+trigram support, camelCase splitting, and filename-stem matching.

**Rationale:** Current extraction (`tr -cs '[:alnum:]' '\n' | awk 'length>3'`) drops short words and misses compound terms. A title like "Add OIDC Client Secret Rotation" produces keywords `["add", "oidc", "client", "secret", "rotation"]` but misses bigrams like `"oidc-client"`, `"secret-rotation"` which are more specific and match actual file/folder names.

**Implementation:** Add a second pass that generates bigrams from consecutive keyword pairs and trigrams from triples, then includes them in the grep search. Cap at 20 additional patterns to avoid combinatorial explosion.

### D2: LLM fallback threshold reduction + prompt improvement

**Decision:** Lower `SCOUT_LLM_MIN_FILES` from 4 to 2 and improve the LLM prompt to include deterministic intermediate results.

**Rationale:** The deterministic scout often finds 1-2 files from keyword grep but misses the rest. At threshold 4, the LLM fallback never fires in these cases. Lowering to 2 means it fires when only 1-2 files are found. The improved prompt passes the already-found files to DeepSeek so it can build on existing results rather than starting from scratch.

### D3: Spec-quality pre-gate

**Decision:** Add a `specLengthCheck` step in `pipeline-runner.js` that runs BEFORE `scout.sh`. If description length < 300 chars, return SCOUT_WEAK immediately without invoking scout.sh.

**Rationale:** `spec_too_short` is the #1 SCOUT_WEAK reason. Running the full deterministic scout (grep over 7 directories, taking ~3-5 seconds) is wasteful when the spec is too short to contain meaningful keyword fodder. The pre-gate saves resources and gives clearer feedback: "spec too short, please expand before scout can run."

### D4: Drift feedback loop

**Decision:** `scout.sh` reads the ticket's historical `scout_drift` score (via `scout-drift.sh` cache or `ticket.sh get-scout-drift`) and adjusts its file-count estimate and complexity classification.

**Rationale:** Tickets with high historical drift (>0.5) indicate the scout systematically under-predicts file counts. When drift is high, the scout should bias toward finding more files (broader grep, include borderline matches). This creates a self-correcting feedback loop without manual recalibration.

**Implementation:**
- `scout-drift.sh` writes a small drift-cache JSON file to `/tmp/scout-drift-cache.json` (brand-keyed, refreshed on each factory tick)
- `scout.sh` reads the cache; if drift > threshold, expands search scope (relaxes grep `-F` to `-E` regex, includes `--include="*"`)
- After Phase 2 (file discovery), if drift was high, apply a multiplier to file count before complexity classification

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| [R1] N-gram search produces too many false positives (noise) | Cap n-gram patterns at 20, prefer bigrams over trigrams, and keep the 30-file output limit |
| [R2] LLM fallback becomes too expensive (every ticket with <2 files calls DeepSeek) | The fallback uses `cheap` route (Haiku) and has a timeout; the cost increase is bounded by the ~5-10 tickets/day entering the factory |
| [R3] Drift feedback loop creates oscillation (overcorrecting on noisy data) | Smooth the drift signal: use a running average of last 3 drifts, not a single value. Reset to 0 if no drift data exists |
| [R4] Pre-gate rejects tickets that could be salvaged by the LLM fallback | If spec is short but title+slug are descriptive, allow scout.sh to run anyway when SCOUT_LLM_ENABLED=true. The pre-gate only blocks when neither spec nor title provide enough content |
