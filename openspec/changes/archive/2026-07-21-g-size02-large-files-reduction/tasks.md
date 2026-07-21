---
title: "g-size02-large-files-reduction — Implementation Plan"
ticket_id: T001945
domains: [code-quality, videovault]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# g-size02-large-files-reduction — Implementation Plan

_Ticket: T001945_

Health-Goal G-SIZE02: Reduce files >600 lines from 17 to ≤8. Currently 14 VideoVault files + 3 .opencode/ files exceed the threshold. The .opencode/ files are already sanctioned (S1-Gate-Ignore). The 14 VideoVault files need real code-splitting.

## Current Large Files (>600 lines)

```
1762  VideoVault/client/src/hooks/use-video-manager.ts
1273  VideoVault/server/routes/processing.ts
 799  VideoVault/client/src/services/video-thumbnail.ts
 775  VideoVault/server/handlers/movie-handler.ts
 770  VideoVault/server/lib/startup-tasks.ts
 727  VideoVault/client/src/services/media-scanner.ts
 617  VideoVault/client/src/services/enhanced-thumbnail-service.ts
 598  VideoVault/shared/videovault/corrupt-performers-data.ts  (near threshold)
 596  VideoVault/shared/videovault/corrupt-performers-data-2.ts (near threshold)
 + 4 more VideoVault files between 550-617 lines
```

## File Structure

```
VideoVault/client/src/hooks/use-video-manager.ts       # MODIFY: extract sub-hooks
VideoVault/server/routes/processing.ts                  # MODIFY: extract route handlers
VideoVault/server/handlers/movie-handler.ts             # MODIFY: extract helper modules
VideoVault/server/lib/startup-tasks.ts                  # MODIFY: extract task modules
VideoVault/client/src/services/video-thumbnail.ts       # MODIFY: extract thumbnail logic
VideoVault/client/src/services/media-scanner.ts         # MODIFY: extract scanner modules
VideoVault/client/src/services/enhanced-thumbnail-service.ts # MODIFY: extract services
tests/spec/g-size02-large-files.bats                    # NEW: gate test
```

## Tasks

### Task 1: Extract sub-hooks from use-video-manager.ts (1762 → ~400)

Split `use-video-manager.ts` into:
- `use-video-manager.ts` — main orchestrator hook (~300 lines)
- `hooks/use-video-upload.ts` — upload logic (~200 lines)
- `hooks/use-video-processing.ts` — processing state (~200 lines)
- `hooks/use-video-playback.ts` — playback controls (~150 lines)

### Task 2: Extract route handlers from processing.ts (1273 → ~400)

Split `processing.ts` into:
- `routes/processing.ts` — router setup (~200 lines)
- `routes/processing-handlers.ts` — handler implementations (~400 lines)
- `routes/processing-helpers.ts` — shared utilities (~200 lines)

### Task 3: Extract from movie-handler.ts (775 → ~350)

Split into:
- `handlers/movie-handler.ts` — main handler (~300 lines)
- `handlers/movie-helpers.ts` — helper functions (~250 lines)
- `handlers/movie-types.ts` — type definitions (~50 lines)

### Task 4: Extract from startup-tasks.ts (770 → ~350)

Split into:
- `lib/startup-tasks.ts` — task orchestrator (~200 lines)
- `lib/startup/db-migration.ts` — DB tasks (~200 lines)
- `lib/startup/cache-warmup.ts` — cache tasks (~150 lines)

### Task 5: Extract from video-thumbnail.ts (799 → ~350)

Split into:
- `services/video-thumbnail.ts` — main service (~300 lines)
- `services/thumbnail-generators.ts` — generation logic (~250 lines)
- `services/thumbnail-cache.ts` — caching layer (~150 lines)

### Task 6: Extract from media-scanner.ts (727 → ~350)

Split into:
- `services/media-scanner.ts` — scanner orchestrator (~300 lines)
- `services/scanner-strategies.ts` — scan strategies (~250 lines)

### Task 7: Write gate test

Create `tests/spec/g-size02-large-files.bats`:
- Count files >600 lines excluding .opencode/ and node_modules/
- Assert count ≤ 8
- expected: FAIL on current branch (14 VideoVault files exceed threshold)

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Add the BATS test that reproduces the
      bug. The test must FAIL on the current branch. Use the phrase
      `expected: FAIL` in the step body so plan-lint STRUCT2 picks it up.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/g-size02-large-files.bats
# expected: FAIL (red — 14 files still >600 lines)
```

- [ ] **Fix-Step (GREEN).** Implement the fix. The BATS test from the
      previous step must now pass (≤8 files >600 lines).

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
