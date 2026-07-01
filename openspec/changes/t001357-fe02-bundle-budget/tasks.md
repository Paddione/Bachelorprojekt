---
title: "G-FE02: Client-JS-Bundle-Budget messen + CI-Gate — Tasks"
ticket_id: T001357
domains: [quality, performance]
status: plan_staged
---

# G-FE02: Client-JS-Bundle-Budget messen + CI-Gate — Tasks

_Ticket: T001357_

## File Structure

```
scripts/check-bundle-size.mjs           # Node ESM — gzip client JS, compare vs baseline
website/bundle-baseline.json            # committed baseline (gzip bytes + file count)
Taskfile.yml                            # website:bundle:check + website:bundle:baseline
.github/workflows/ci.yml                # bundle-budget CI job (after vitest-website)
```

## Tasks

### Task 1: Set up bundle budget measurement script and baseline

Implement `scripts/check-bundle-size.mjs` with:
- Parse CLI args: `--check`, `--update-baseline`, `--fail`, `--threshold=<pct>`, `--dir=`, `--baseline=`
- `collectJsFiles(dir)` — recursively walk `website/dist/client/` for `.js` files
- `measure(dir)` — gzip each file via `node:zlib.gzipSync`, sum total bytes
- `--update-baseline` mode: write `{ totalGzipBytes, fileCount, generatedAt }` to `website/bundle-baseline.json`
- `--check` mode (default): compare current measurement to baseline; fail (exit 1) if delta > threshold (default 5%)
- Runner must build the website first (`pnpm --dir website build`)

Add `website/bundle-baseline.json` with the initial baseline.

**Validate:**
```bash
cd /tmp/wt-T001357-fe02
pnpm --dir website build
node scripts/check-bundle-size.mjs --update-baseline
node scripts/check-bundle-size.mjs --check --fail
```

### Task 2: Add Taskfile commands and CI gate

Add two tasks to `Taskfile.yml`:
- `website:bundle:check` — runs `node scripts/check-bundle-size.mjs --check --fail`
- `website:bundle:baseline` — runs `node scripts/check-bundle-size.mjs --update-baseline`

Add CI job `bundle-budget` in `.github/workflows/ci.yml` after `vitest-website`:
- `needs: [vitest-website]`
- Downloads the `website-dist` artifact from the build step
- Runs `node scripts/check-bundle-size.mjs --check --fail --threshold=5`

**Validate:**
```bash
task website:bundle:check
# expected: OK (within 5% threshold)
```

### Task 3: Commit baseline and document budget policy

- Ensure `website/bundle-baseline.json` is committed to git
- Run `task freshness:regenerate` to update any generated indexes
- The budget threshold is 5% per PR (configurable via `BUNDLE_BUDGET_PCT` env var or `--threshold` flag)
- Baseline updates happen manually via `task website:bundle:baseline` after intentional bundle changes

### Task 4: Final verification

Run the mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
