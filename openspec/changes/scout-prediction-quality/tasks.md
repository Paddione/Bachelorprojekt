## 1. N-Gramm-Keyword-Extraktion in scout.sh

- [ ] 1.1 scout.sh Phase 1: Add bigram generation from consecutive title word pairs (max 20 patterns)
- [ ] 1.2 scout.sh Phase 1: Add trigram generation from consecutive title word triples (max 10 patterns, only if ≥3 words)
- [ ] 1.3 scout.sh Phase 1: Add camelCase splitting (e.g. `OIDCClientConfig` → `OIDC`, `Client`, `Config`)
- [ ] 1.4 scout.sh Phase 1: Add filename-stem matching (match against file basenames without extensions)
- [ ] 1.5 scout.sh: Validate that n-gram search doesn't increase false-positive rate beyond 30-file output cap

## 2. LLM-Fallback-Schwellenwert + Prompt-Verbesserung

- [ ] 2.1 scout.sh Phase 2b: Lower SCOUT_LLM_MIN_FILES default from 4 to 2
- [ ] 2.2 scout-llm-fallback.sh: Extend prompt to include already-discovered file paths from deterministic phase
- [ ] 2.3 scout-llm-fallback.sh: Extend prompt to include intermediate grep match statistics (how many hits per keyword)

## 3. Spec-Qualitäts-Pre-Gate

- [ ] 3.1 scout-quality-check.cjs: Add `evaluateSpecPreGate(specContent)` function that checks length ≥300 chars
- [ ] 3.2 pipeline-runner.js: Add pre-gate check before scout.sh invocation — if spec <300 chars, return SCOUT_WEAK `spec_too_short` immediately
- [ ] 3.3 pipeline-runner.js: Allow bypass for descriptive title+slug when SCOUT_LLM_ENABLED=true (fallback can still salvage)

## 4. Drift-Feedback-Loop

- [ ] 4.1 scout-drift.sh: Write drift-cache JSON to `/tmp/scout-drift-cache.json` (keyed by brand) after each drift calculation
- [ ] 4.2 scout-drift.cjs: Add `runningAverage(values, windowSize=3)` helper for smoothing drift signal
- [ ] 4.3 scout.sh Phase 6 — new: Read drift-cache before file discovery; if drift > 0.5, switch grep to regex `-E` mode
- [ ] 4.4 scout.sh Phase 3: Apply 1.5× file-count multiplier before complexity classification when drift > 0.7
- [ ] 4.5 scout.sh: Fall back to drift=0 when no cache file exists (first run or cache evicted)

## 5. BATS-Tests (scout-prediction-quality.bats)

- [ ] 5.1 Test: N-gram extractions produce correct bigrams/trigrams from title
- [ ] 5.2 Test: CamelCase splitting produces correct word fragments
- [ ] 5.3 Test: LLM fallback triggers at threshold 2 (not 4)
- [ ] 5.4 Test: LLM prompt contains deterministic paths
- [ ] 5.5 Test: Pre-gate returns spec_too_short without invoking scout.sh
- [ ] 5.6 Test: Pre-gate passes through when spec ≥300 chars
- [ ] 5.7 Test: Drift feedback loop expands search at 0.6 drift
- [ ] 5.8 Test: Drift feedback loop applies multiplier at 0.8 drift
- [ ] 5.9 Test: No drift data → default behavior
- [ ] 5.10 Test: Running average smoothing over 3 values

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Run the BATS test suite BEFORE implementing changes. At minimum test 5.5 (pre-gate) and 5.3 (LLM threshold) MUST fail because the changes are not yet implemented. Use the phrase `expected: FAIL` in the step body.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/scout-prediction-quality.bats
# expected: FAIL (red — the logic is not yet implemented)
```

- [ ] **Fix-Step (GREEN).** Implement all 5 sections. The BATS tests from the previous step must now pass.

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
