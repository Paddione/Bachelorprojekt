---
title: Code-Quality-Gates Slice B — Loop & Cron Implementation Plan
ticket_id: T000436
domains: [website, infra, db, ops, test, security]
status: active
pr_number: null
---

# Code-Quality-Gates Slice B — Loop & Cron Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Loop & Cron half of SP1 — baseline-refresh, violation grouper, throttled-dedup loop that enqueues Factory tickets, nightly GH Actions cron, and a CI guard that prevents the baseline from growing.

**Architecture:** Three new Node scripts (`baseline-refresh.mjs`, `group-violations.mjs`) and one Bash orchestrator (`loop.sh`) sit on top of the Slice-A gates. `loop.sh` calls `node group-violations.mjs`, queries the DB via `kubectl exec` (same pattern as `scripts/factory/lib.sh`) for open `CQ-GATE:` tickets, then calls `ticket.sh create + enqueue` for at most `MAX_NEW=2` new groups per run. A nightly GitHub Actions workflow (`.github/workflows/quality-loop.yml`) drives this against the fleet cluster. CI gains one new step that prevents the baseline key-count from ever growing on a PR.

**Tech Stack:** Node.js ESM (`node:test`, `node:fs`, `node:child_process`), Bash, BATS 1.x, `scripts/code-quality/glob.mjs` (existing — no new glob dep needed), `scripts/factory/lib.sh` sourced from `loop.sh`, `ticket.sh` (existing CLI), GitHub Actions, `jq`.

**Open-point decisions locked in this plan:**

1. **Glob library for `group-violations.mjs`:** Use the existing `scripts/code-quality/glob.mjs` (`matchGlob`). It already handles `**` and `*`-within-segment globs correctly. No new npm dep required; no risk of transitive-dep breakage.

2. **Conflict-check (same-subsystem, different gates):** `loop.sh` uses a per-group dedup query — `title LIKE 'CQ-GATE:<gate>:<subsystem>%'` — so `S1:website` and `S3:website` are independent tickets and do not block each other. Same-gate+same-subsystem is deduplicated. Factory self-planning may result in two agents touching overlapping files; we accept Rebase. No `touched_files` is set at create time.

3. **Dedup-match:** `SELECT title FROM tickets.tickets WHERE title LIKE 'CQ-GATE:<gate>:<subsystem>%' AND status NOT IN ('done','archived','wont-fix')` per group. Gate and subsystem are percent-escaped when substituted (they contain only `[A-Za-z0-9_-]`, so no escaping is needed in practice, but the plan notes it for safety).

4. **`is_test_data`:** `ticket.sh create` without `--test-data` produces `is_test_data=false` (production ticket, not subject to the 6-hour test-data purge). This is correct — CQ-GATE tickets are real work items.

5. **`--description` is mandatory:** `loop.sh` always passes `--description "<violation_key_list_truncated_to_2000_chars>"`. If the description is empty for any reason, the script aborts (exit 1) rather than silently creating a description-less ticket (which would exit 2 on `ticket.sh` side anyway, leaving a half-created ticket).

---

## File Map

| Path | Action | Responsibility |
|------|--------|----------------|
| `scripts/code-quality/baseline-refresh.mjs` | **Create** | Reads all gates; removes FIXED entries; lowers metrics; writes `baseline.json` |
| `scripts/code-quality/baseline-refresh.test.mjs` | **Create** | node:test unit tests for `baseline-refresh.mjs` |
| `scripts/code-quality/group-violations.mjs` | **Create** | Reads `baseline.json` + `subsystems.yaml`; maps violation keys to subsystems via `matchGlob`; emits JSON array |
| `scripts/code-quality/group-violations.test.mjs` | **Create** | node:test unit tests for `group-violations.mjs` |
| `scripts/code-quality/loop.sh` | **Create** | Bash orchestrator: call grouper → dedup via psql → throttle → ticket.sh create+enqueue |
| `tests/unit/quality-loop.bats` | **Create** | BATS unit tests for `loop.sh` (PATH stubs, DRY_RUN, throttle) |
| `Taskfile.yml` | **Modify** (after `quality:baseline:freeze`) | Add `quality:baseline:refresh` and `quality:loop` tasks |
| `.github/workflows/quality-loop.yml` | **Create** | Nightly cron workflow: checkout → node → kubeconfig → `task quality:loop` |
| `.github/workflows/ci.yml` | **Modify** (after `quality:check` step) | Add baseline-shrink guard step |
| `website/src/data/test-inventory.json` | **Modify** | Regenerate via `task test:inventory` after BATS file is added (BATS file is NOT in `tests/local/` and doesn't match FA/SA/NFA/AK → inventory script won't break, but must be rerun to keep the CI check green) |

---

### Task B-01: `baseline-refresh.mjs` — RED test

**Files:**
- Create: `scripts/code-quality/baseline-refresh.test.mjs`

- [ ] **Step 1: Write the failing tests**

```javascript
// scripts/code-quality/baseline-refresh.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRefresh } from './baseline-refresh.mjs';

// Fixture baseline: two violations
const baseline = {
  'S1:website/src/pages/big.astro': {
    gate: 'S1', path: 'website/src/pages/big.astro', metric: 612,
    detail: '612 lines > 400', frozen_at: 'abc123',
  },
  'S3:k3d/foo.yaml:files.mentolder.de': {
    gate: 'S3', path: 'k3d/foo.yaml', metric: 1,
    detail: 'hardcoded hostname', frozen_at: 'abc123',
  },
  'S1:scripts/deploy.sh': {
    gate: 'S1', path: 'scripts/deploy.sh', metric: 520,
    detail: '520 lines > 500 limit (.sh)', frozen_at: 'abc123',
  },
};

test('removes FIXED entries (key absent from current violations)', () => {
  // S3 violation has been fixed; S1 violations still present
  const current = [
    { key: 'S1:website/src/pages/big.astro', path: 'website/src/pages/big.astro', metric: 612, detail: '612 lines > 400' },
    { key: 'S1:scripts/deploy.sh', path: 'scripts/deploy.sh', metric: 520, detail: '520 lines > 500 limit (.sh)' },
  ];
  const { updated, removed, unchanged } = applyRefresh(baseline, current);
  assert.ok(!('S3:k3d/foo.yaml:files.mentolder.de' in updated), 'FIXED key should be removed');
  assert.equal(removed, 1);
  assert.equal(unchanged, 2);
});

test('updates lowered metric values (metric improved but violation still present)', () => {
  // big.astro was trimmed from 612 to 450 lines — still over limit but improved
  const current = [
    { key: 'S1:website/src/pages/big.astro', path: 'website/src/pages/big.astro', metric: 450, detail: '450 lines > 400' },
    { key: 'S3:k3d/foo.yaml:files.mentolder.de', path: 'k3d/foo.yaml', metric: 1, detail: 'hardcoded hostname' },
    { key: 'S1:scripts/deploy.sh', path: 'scripts/deploy.sh', metric: 520, detail: '520 lines > 500 limit (.sh)' },
  ];
  const { updated } = applyRefresh(baseline, current);
  assert.equal(updated['S1:website/src/pages/big.astro'].metric, 450);
  assert.equal(updated['S1:website/src/pages/big.astro'].detail, '450 lines > 400');
});

test('preserves unresolved violations at same metric', () => {
  const current = [
    { key: 'S1:website/src/pages/big.astro', path: 'website/src/pages/big.astro', metric: 612, detail: '612 lines > 400' },
    { key: 'S3:k3d/foo.yaml:files.mentolder.de', path: 'k3d/foo.yaml', metric: 1, detail: 'hardcoded hostname' },
    { key: 'S1:scripts/deploy.sh', path: 'scripts/deploy.sh', metric: 520, detail: '520 lines > 500 limit (.sh)' },
  ];
  const { updated, removed, unchanged } = applyRefresh(baseline, current);
  assert.equal(removed, 0);
  assert.equal(unchanged, 3);
  assert.equal(Object.keys(updated).length, 3);
});

test('returns summary counts: removed + updated + unchanged', () => {
  const current = [
    { key: 'S1:website/src/pages/big.astro', path: 'website/src/pages/big.astro', metric: 450, detail: '450 lines > 400' },
    // S3 fixed, S1:scripts unchanged
    { key: 'S1:scripts/deploy.sh', path: 'scripts/deploy.sh', metric: 520, detail: '520 lines > 500 limit (.sh)' },
  ];
  const result = applyRefresh(baseline, current);
  assert.equal(result.removed, 1);   // S3 gone
  assert.equal(result.updated, 1);   // big.astro metric lowered
  assert.equal(result.unchanged, 1); // deploy.sh unchanged
});

test('exits 0 and returns empty updated map when baseline is empty', () => {
  const result = applyRefresh({}, []);
  assert.deepEqual(result.updated, {});
  assert.equal(result.removed, 0);
  assert.equal(result.updated_count, 0);
});
```

- [ ] **Step 2: Run tests — verify all fail**

```bash
cd /tmp/wt-cqg-sliceB
node --test scripts/code-quality/baseline-refresh.test.mjs 2>&1 | tail -20
```

Expected: `Cannot find module` or `not a function` errors — the module doesn't exist yet.

---

### Task B-02: `baseline-refresh.mjs` — GREEN implementation

**Files:**
- Create: `scripts/code-quality/baseline-refresh.mjs`

- [ ] **Step 1: Implement `applyRefresh` and the CLI**

```javascript
// scripts/code-quality/baseline-refresh.mjs
// Remove FIXED entries and lower improved metrics in baseline.json.
// A "FIXED" entry is a baseline key absent from the current violation set.
// An "improved" entry is present in both but current.metric < baseline.metric.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGates } from './load.mjs';
import { aggregate } from './check.mjs';

/**
 * Apply a refresh pass to `baseline` given the flat `current` violation list.
 * Returns { updated: {key→entry}, removed: number, updated_count: number, unchanged: number }.
 * Does NOT write to disk — the CLI wrapper does that.
 */
export function applyRefresh(baseline, current) {
  const currentMap = new Map(current.map((v) => [v.key, v]));
  const updated = {};
  let removed = 0;
  let updated_count = 0;
  let unchanged = 0;

  for (const [key, entry] of Object.entries(baseline)) {
    const cv = currentMap.get(key);
    if (!cv) {
      // FIXED: violation no longer present
      removed++;
      continue;
    }
    if (typeof cv.metric === 'number' && typeof entry.metric === 'number'
        && cv.metric < entry.metric) {
      // Improved: metric lowered — update the entry
      updated[key] = { ...entry, metric: cv.metric, detail: cv.detail };
      updated_count++;
    } else {
      // Unchanged
      updated[key] = entry;
      unchanged++;
    }
  }

  // Sort keys for deterministic output
  const sorted = {};
  for (const k of Object.keys(updated).sort()) sorted[k] = updated[k];

  return { updated: sorted, removed, updated_count, unchanged };
}

// CLI: validate-first, run all gates, apply refresh, write baseline.json.
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  const repoRoot = join(dirname(__filename), '..', '..');
  const cfgDir = process.env.QUALITY_CFG_DIR
    ? join(repoRoot, process.env.QUALITY_CFG_DIR)
    : join(repoRoot, 'docs', 'code-quality');
  const { validateRegistry } = await import('./validate.mjs');
  const v = validateRegistry(cfgDir, repoRoot);
  if (!v.ok) { for (const e of v.errors) console.error('✗', e); process.exit(1); }
  let baseline = {};
  try { baseline = JSON.parse(readFileSync(join(cfgDir, 'baseline.json'), 'utf8')); }
  catch { baseline = {}; }
  const current = aggregate(repoRoot, loadGates(cfgDir));
  const { updated, removed, updated_count, unchanged } = applyRefresh(baseline, current);
  writeFileSync(join(cfgDir, 'baseline.json'), JSON.stringify(updated, null, 2) + '\n', 'utf8');
  console.log(`✓ baseline:refresh — ${removed} removed, ${updated_count} updated, ${unchanged} unchanged`);
  console.log(`  ${Object.keys(updated).length} violation(s) remaining in baseline.json`);
}
```

- [ ] **Step 2: Run tests — verify all pass**

```bash
cd /tmp/wt-cqg-sliceB
node --test scripts/code-quality/baseline-refresh.test.mjs 2>&1 | tail -20
```

Expected:
```
✔ removes FIXED entries (key absent from current violations)
✔ updates lowered metric values (metric improved but violation still present)
✔ preserves unresolved violations at same metric
✔ returns summary counts: removed + updated + unchanged
✔ exits 0 and returns empty updated map when baseline is empty
ℹ tests 5
ℹ pass 5
```

- [ ] **Step 3: Smoke-test the CLI over real HEAD (must not crash)**

```bash
cd /tmp/wt-cqg-sliceB
node scripts/code-quality/baseline-refresh.mjs 2>&1
```

Expected: `✓ baseline:refresh — 0 removed, 0 updated, 86 unchanged` (baseline was frozen from HEAD; running refresh again is a no-op).

- [ ] **Step 4: Commit**

```bash
cd /tmp/wt-cqg-sliceB
git add scripts/code-quality/baseline-refresh.mjs scripts/code-quality/baseline-refresh.test.mjs
git commit -m "feat(cqg): baseline-refresh — remove FIXED entries, lower improved metrics"
```

---

### Task B-03: `group-violations.mjs` — RED test

**Files:**
- Create: `scripts/code-quality/group-violations.test.mjs`

Depends on: T-B02 (uses `matchGlob` pattern, no code dep — but logically part of the same pipeline).

- [ ] **Step 1: Write the failing tests**

```javascript
// scripts/code-quality/group-violations.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { groupViolations } from './group-violations.mjs';

const here = join(fileURLToPath(import.meta.url), '..');
const repoRoot = join(here, '..', '..');

// Minimal inline subsystems for unit tests (mirrors subsystems.yaml structure)
const subsystems = [
  { id: 'tests', paths: ['tests/**', 'website/test/**', 'website/tests/**'] },
  { id: 'website', paths: ['website/**'] },
  { id: 'scripts-infra', paths: ['scripts/**'] },
  { id: 'infra-manifests', paths: ['k3d/**', 'prod/**', 'prod-fleet/**', 'prod-mentolder/**', 'prod-korczewski/**'] },
  { id: 'brett', paths: ['brett/**'] },
  { id: 'arena-server', paths: ['arena-server/**'] },
];

const sampleBaseline = {
  'S1:website/src/pages/big.astro': { gate: 'S1', path: 'website/src/pages/big.astro', metric: 612, detail: 'x', frozen_at: 'abc' },
  'S1:website/src/components/Hero.svelte': { gate: 'S1', path: 'website/src/components/Hero.svelte', metric: 550, detail: 'y', frozen_at: 'abc' },
  'S1:scripts/build.sh': { gate: 'S1', path: 'scripts/build.sh', metric: 520, detail: 'z', frozen_at: 'abc' },
  'S3:k3d/configmap.yaml:foo.mentolder.de': { gate: 'S3', path: 'k3d/configmap.yaml', metric: 1, detail: 'w', frozen_at: 'abc' },
  'S1:brett/public/scene.js': { gate: 'S1', path: 'brett/public/scene.js', metric: 700, detail: 'v', frozen_at: 'abc' },
};

test('groups violations by (gate × subsystem)', () => {
  const groups = groupViolations(sampleBaseline, subsystems);
  const titles = groups.map((g) => g.title).sort();
  assert.ok(titles.some((t) => t.startsWith('CQ-GATE:S1:website')), 'S1:website group expected');
  assert.ok(titles.some((t) => t.startsWith('CQ-GATE:S1:scripts-infra')), 'S1:scripts-infra group expected');
  assert.ok(titles.some((t) => t.startsWith('CQ-GATE:S3:infra-manifests')), 'S3:infra-manifests group expected');
  assert.ok(titles.some((t) => t.startsWith('CQ-GATE:S1:brett')), 'S1:brett group expected');
});

test('title format is CQ-GATE:<gate>:<subsystem> — N Dateien kürzen (S1) or N Fundstellen beheben', () => {
  const groups = groupViolations(sampleBaseline, subsystems);
  const s1Website = groups.find((g) => g.gate === 'S1' && g.subsystem === 'website');
  assert.ok(s1Website, 'S1:website group must exist');
  assert.equal(s1Website.count, 2);
  assert.match(s1Website.title, /^CQ-GATE:S1:website — 2 /);
});

test('violation_keys array contains the matching keys', () => {
  const groups = groupViolations(sampleBaseline, subsystems);
  const s1Website = groups.find((g) => g.gate === 'S1' && g.subsystem === 'website');
  assert.deepEqual(
    s1Website.violation_keys.sort(),
    ['S1:website/src/components/Hero.svelte', 'S1:website/src/pages/big.astro'],
  );
});

test('paths with no matching subsystem go into "unknown"', () => {
  const baselineWithOrphan = {
    ...sampleBaseline,
    'S4:some-unknown-dir/foo.yaml': { gate: 'S4', path: 'some-unknown-dir/foo.yaml', metric: 1, detail: 'x', frozen_at: 'abc' },
  };
  const groups = groupViolations(baselineWithOrphan, subsystems);
  const unknownGroup = groups.find((g) => g.subsystem === 'unknown');
  assert.ok(unknownGroup, '"unknown" group should be created for unmatched paths');
  assert.ok(unknownGroup.violation_keys.includes('S4:some-unknown-dir/foo.yaml'));
});

test('returns empty array for empty baseline', () => {
  const groups = groupViolations({}, subsystems);
  assert.deepEqual(groups, []);
});

test('group over real repo HEAD does not throw (smoke test)', async () => {
  const { readFileSync } = await import('node:fs');
  const { loadSubsystems, loadGates: _lg } = await import('./load.mjs');
  const cfgDir = join(repoRoot, 'docs', 'code-quality');
  const realBaseline = JSON.parse(readFileSync(join(cfgDir, 'baseline.json'), 'utf8'));
  const realSubs = loadSubsystems(cfgDir);
  // Must not throw
  const groups = groupViolations(realBaseline, realSubs);
  assert.ok(Array.isArray(groups));
  assert.ok(groups.length > 0, 'real baseline should produce at least one group');
});
```

- [ ] **Step 2: Run tests — verify all fail**

```bash
cd /tmp/wt-cqg-sliceB
node --test scripts/code-quality/group-violations.test.mjs 2>&1 | tail -10
```

Expected: `Cannot find module './group-violations.mjs'`

---

### Task B-04: `group-violations.mjs` — GREEN implementation

**Files:**
- Create: `scripts/code-quality/group-violations.mjs`

- [ ] **Step 1: Implement `groupViolations` and the CLI**

```javascript
// scripts/code-quality/group-violations.mjs
// Read baseline.json + subsystems.yaml; map each violation key to a subsystem
// via first-match glob; group by (gate × subsystem); emit JSON array on stdout.
//
// Output shape: [{ gate, subsystem, count, title, violation_keys }]
//
// Subsystem matching uses the existing glob.mjs matchGlob (no new dep).
// Unknown paths → subsystem "unknown" (never throws).
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { matchGlob } from './glob.mjs';

/** Derive the subsystem id for a violation path via first-match glob. */
function subsystemOf(path, subsystems) {
  for (const sub of subsystems) {
    if ((sub.paths ?? []).some((g) => matchGlob(path, g))) return sub.id;
  }
  return 'unknown';
}

/** Human-readable action suffix per gate. */
function actionSuffix(gate, count) {
  if (gate === 'S1') return `${count} Datei${count === 1 ? '' : 'en'} kürzen`;
  if (gate === 'S2') return `${count} Zyklus${count === 1 ? '' : 'en'} auflösen`;
  if (gate === 'S3') return `${count} Hostname${count === 1 ? '' : 's'} extrahieren`;
  if (gate === 'S4') return `${count} Waise${count === 1 ? '' : 'n'} verknüpfen`;
  return `${count} Verletzung${count === 1 ? '' : 'en'} beheben`;
}

/**
 * Group flat baseline map by (gate × subsystem).
 * @param {Object} baseline  Map of key → { gate, path, metric, detail, frozen_at }
 * @param {Array}  subsystems Array of subsystem objects from subsystems.yaml
 * @returns {Array} sorted array of { gate, subsystem, count, title, violation_keys }
 */
export function groupViolations(baseline, subsystems) {
  if (!baseline || Object.keys(baseline).length === 0) return [];

  // bucket[gate:subsystem] → { gate, subsystem, violation_keys[] }
  const buckets = new Map();

  for (const [key, entry] of Object.entries(baseline)) {
    const gate = entry.gate ?? key.split(':')[0];
    const sub = subsystemOf(entry.path ?? '', subsystems);
    const bucketKey = `${gate}:${sub}`;
    if (!buckets.has(bucketKey)) {
      buckets.set(bucketKey, { gate, subsystem: sub, violation_keys: [] });
    }
    buckets.get(bucketKey).violation_keys.push(key);
  }

  return Array.from(buckets.values())
    .map((b) => ({
      gate: b.gate,
      subsystem: b.subsystem,
      count: b.violation_keys.length,
      title: `CQ-GATE:${b.gate}:${b.subsystem} — ${actionSuffix(b.gate, b.violation_keys.length)}`,
      violation_keys: b.violation_keys.sort(),
    }))
    .sort((a, b) => `${a.gate}:${a.subsystem}`.localeCompare(`${b.gate}:${b.subsystem}`));
}

// CLI: read real baseline + subsystems, emit JSON array to stdout.
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  const repoRoot = join(dirname(__filename), '..', '..');
  const cfgDir = process.env.QUALITY_CFG_DIR
    ? join(repoRoot, process.env.QUALITY_CFG_DIR)
    : join(repoRoot, 'docs', 'code-quality');
  const { loadSubsystems } = await import('./load.mjs');
  let baseline = {};
  try { baseline = JSON.parse(readFileSync(join(cfgDir, 'baseline.json'), 'utf8')); }
  catch { /* empty baseline is fine */ }
  const subsystems = loadSubsystems(cfgDir);
  const groups = groupViolations(baseline, subsystems);
  process.stdout.write(JSON.stringify(groups, null, 2) + '\n');
}
```

- [ ] **Step 2: Run tests — verify all pass**

```bash
cd /tmp/wt-cqg-sliceB
node --test scripts/code-quality/group-violations.test.mjs 2>&1 | tail -15
```

Expected:
```
✔ groups violations by (gate × subsystem)
✔ title format is CQ-GATE:<gate>:<subsystem> — N Dateien kürzen (S1) or N Fundstellen beheben
✔ violation_keys array contains the matching keys
✔ paths with no matching subsystem go into "unknown"
✔ returns empty array for empty baseline
✔ group over real repo HEAD does not throw (smoke test)
ℹ pass 6
```

- [ ] **Step 3: Smoke-test CLI over real HEAD**

```bash
cd /tmp/wt-cqg-sliceB
node scripts/code-quality/group-violations.mjs | jq 'length, .[0]'
```

Expected: a number > 0 and a JSON object with `gate`, `subsystem`, `count`, `title`, `violation_keys`.

- [ ] **Step 4: Commit**

```bash
cd /tmp/wt-cqg-sliceB
git add scripts/code-quality/group-violations.mjs scripts/code-quality/group-violations.test.mjs
git commit -m "feat(cqg): group-violations — map baseline keys to subsystems for loop dispatch"
```

---

### Task B-05: `loop.sh` — RED BATS tests

**Files:**
- Create: `tests/unit/quality-loop.bats`

Depends on: T-B04 (tests reference `group-violations.mjs` fixture output shape).

- [ ] **Step 1: Write the failing BATS tests**

```bash
#!/usr/bin/env bats
# quality-loop.bats — Unit tests for scripts/code-quality/loop.sh
# Stubs: ticket.sh, psql seam (QUALITY_LOOP_PSQL_CMD), groups seam.
# All tests run offline — no live cluster or DB required.

load test_helper

SCRIPT="${PROJECT_DIR}/scripts/code-quality/loop.sh"

setup() {
  FAKE_BIN="$(mktemp -d)"

  # Stub ticket.sh: records all invocations; returns fake external_id|id on create
  cat > "${FAKE_BIN}/ticket.sh" <<'EOF'
#!/usr/bin/env bash
echo "$@" >> "${TICKET_CALLS_LOG}"
case "${1:-}" in
  create) echo "T000999|42" ;;
  *) exit 0 ;;
esac
EOF
  chmod +x "${FAKE_BIN}/ticket.sh"

  # Stub kubectl: should never be called when psql seam is active
  cat > "${FAKE_BIN}/kubectl" <<'EOF'
#!/usr/bin/env bash
echo "UNEXPECTED kubectl: $*" >&2; exit 1
EOF
  chmod +x "${FAKE_BIN}/kubectl"

  export PATH="${FAKE_BIN}:${PATH}"
  export FAKE_BIN
  export TICKET_CALLS_LOG="${BATS_TEST_TMPDIR}/ticket_calls.log"

  # Fixture: two-group JSON (S1:website + S3:infra-manifests)
  export QUALITY_GROUPS_FIXTURE="${BATS_TEST_TMPDIR}/groups.json"
  cat > "${QUALITY_GROUPS_FIXTURE}" <<'EOJSON'
[
  {
    "gate": "S1",
    "subsystem": "website",
    "count": 15,
    "title": "CQ-GATE:S1:website — 15 Dateien kürzen",
    "violation_keys": ["S1:website/src/pages/foo.astro", "S1:website/src/pages/bar.astro"]
  },
  {
    "gate": "S3",
    "subsystem": "infra-manifests",
    "count": 3,
    "title": "CQ-GATE:S3:infra-manifests — 3 Hostnames extrahieren",
    "violation_keys": ["S3:k3d/foo.yaml:x.mentolder.de"]
  }
]
EOJSON

  # Default psql stub script: no open tickets for any group
  PSQL_STUB="${FAKE_BIN}/psql-stub.sh"
  cat > "${PSQL_STUB}" <<'EOF'
#!/usr/bin/env bash
# Reads SQL from stdin, returns empty (no open tickets)
cat > /dev/null
echo ""
EOF
  chmod +x "${PSQL_STUB}"
  export QUALITY_LOOP_PSQL_CMD="${PSQL_STUB}"
}

teardown() {
  rm -rf "${FAKE_BIN}"
}

# ── DRY_RUN tests ─────────────────────────────────────────────────────────────

@test "DRY_RUN=1 with empty baseline exits 0 and creates zero tickets" {
  export QUALITY_LOOP_GROUPS_CMD="printf '[]'"
  run env DRY_RUN=1 bash "$SCRIPT"
  assert_success
  assert [ ! -f "${TICKET_CALLS_LOG}" ]
}

@test "DRY_RUN=1 with two groups prints both groups and no side effects" {
  export QUALITY_LOOP_GROUPS_CMD="cat ${QUALITY_GROUPS_FIXTURE}"
  run env DRY_RUN=1 bash "$SCRIPT"
  assert_success
  assert_output --partial "CQ-GATE:S1:website"
  assert_output --partial "CQ-GATE:S3:infra-manifests"
  assert_output --partial "[DRY_RUN]"
  assert [ ! -f "${TICKET_CALLS_LOG}" ]
}

# ── Throttle test ─────────────────────────────────────────────────────────────

@test "MAX_NEW=1 with 2 eligible groups creates exactly one ticket" {
  export QUALITY_LOOP_GROUPS_CMD="cat ${QUALITY_GROUPS_FIXTURE}"
  # psql stub already returns empty (no existing tickets)
  run env MAX_NEW=1 bash "$SCRIPT"
  assert_success
  local calls
  calls="$(grep -c "^create" "${TICKET_CALLS_LOG}" 2>/dev/null || echo 0)"
  assert_equal "$calls" "1"
}

# ── Dedup test ────────────────────────────────────────────────────────────────

@test "open CQ-GATE:S1:website ticket causes that group to be skipped" {
  export QUALITY_LOOP_GROUPS_CMD="cat ${QUALITY_GROUPS_FIXTURE}"

  # psql stub: echo the open-ticket title when SQL contains S1:website, else empty
  DEDUP_PSQL_STUB="${FAKE_BIN}/dedup-psql-stub.sh"
  cat > "${DEDUP_PSQL_STUB}" <<'EOF'
#!/usr/bin/env bash
sql="$(cat)"
if echo "$sql" | grep -q "S1:website"; then
  echo "CQ-GATE:S1:website — 15 Dateien kürzen"
else
  echo ""
fi
EOF
  chmod +x "${DEDUP_PSQL_STUB}"
  export QUALITY_LOOP_PSQL_CMD="${DEDUP_PSQL_STUB}"

  run env MAX_NEW=2 bash "$SCRIPT"
  assert_success
  # Only S3:infra-manifests should have been created
  local calls
  calls="$(grep -c "^create" "${TICKET_CALLS_LOG}" 2>/dev/null || echo 0)"
  assert_equal "$calls" "1"
  run grep "S3:infra-manifests" "${TICKET_CALLS_LOG}"
  assert_success
}
```

- [ ] **Step 2: Run tests — verify they fail (script not found)**

```bash
cd /tmp/wt-cqg-sliceB
tests/unit/lib/bats-core/bin/bats tests/unit/quality-loop.bats 2>&1 | head -20
```

Expected: all tests fail with "No such file or directory" for the script.

---

### Task B-06: `loop.sh` — GREEN implementation

**Files:**
- Create: `scripts/code-quality/loop.sh`

Depends on: T-B04.

- [ ] **Step 1: Implement `loop.sh`**

```bash
#!/usr/bin/env bash
# scripts/code-quality/loop.sh — idempotent top-up: enqueue ≤MAX_NEW new Factory
# tickets, one per (Gate × Subsystem) group with open baseline violations.
#
# Environment variables:
#   MAX_NEW=2            max new tickets to create per run (default 2)
#   DRY_RUN=1            print actions without executing (no psql, no ticket.sh)
#   BRAND=mentolder      ticket brand (default mentolder)
#   FACTORY_CTX=fleet    kubectl context for psql (default fleet, via lib.sh)
#   FACTORY_NS=workspace kubectl namespace (default workspace, via lib.sh)
#
# Seams for unit testing (override with env vars):
#   QUALITY_LOOP_GROUPS_CMD   command to emit the groups JSON (default: node ...)
#   QUALITY_LOOP_PSQL_CMD     command to query open tickets per group title prefix
#                             receives the LIKE pattern as $1; empty output = no open ticket

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

MAX_NEW="${MAX_NEW:-2}"
BRAND="${BRAND:-mentolder}"
DRY_RUN="${DRY_RUN:-}"

# ── Resolve groups ────────────────────────────────────────────────────────────
GROUPS_CMD="${QUALITY_LOOP_GROUPS_CMD:-node ${SCRIPT_DIR}/group-violations.mjs}"

groups_json="$(eval "$GROUPS_CMD")"

if [[ "$groups_json" == "[]" || -z "$groups_json" ]]; then
  echo "quality:loop — baseline is empty, nothing to enqueue"
  exit 0
fi

group_count="$(echo "$groups_json" | jq 'length')"
echo "quality:loop — ${group_count} violation group(s) in baseline"

# ── Factory lib (psql access) ─────────────────────────────────────────────────
# Only sourced when not in DRY_RUN and no QUALITY_LOOP_PSQL_CMD override.
if [[ -z "$DRY_RUN" && -z "${QUALITY_LOOP_PSQL_CMD:-}" ]]; then
  # shellcheck source=scripts/factory/lib.sh
  source "${REPO_ROOT}/scripts/factory/lib.sh"
  factory_resolve
fi

# ── Per-group function ─────────────────────────────────────────────────────────
# Returns 0 if an open ticket already exists for this title prefix, 1 otherwise.
# The psql seam (QUALITY_LOOP_PSQL_CMD) receives the SQL on stdin — same contract
# as factory_psql — so test stubs can be real scripts that read stdin.
has_open_ticket() {
  local title_prefix="$1"
  # Safe: gate/subsystem contain only [A-Za-z0-9_-], no SQL injection risk;
  # the doubled-quote escape is kept for correctness nonetheless.
  local safe_prefix="${title_prefix//\'/\'\'}"
  local sql="SELECT title FROM tickets.tickets WHERE title LIKE '${safe_prefix}%' AND status NOT IN ('done','archived','wont-fix') LIMIT 1;"

  local result
  if [[ -n "${QUALITY_LOOP_PSQL_CMD:-}" ]]; then
    result="$(echo "$sql" | "${QUALITY_LOOP_PSQL_CMD}" 2>/dev/null || true)"
  else
    result="$(echo "$sql" | factory_psql 2>/dev/null || true)"
  fi
  [[ -n "$result" ]]
}

# ── Main loop ─────────────────────────────────────────────────────────────────
created=0

for i in $(seq 0 $((group_count - 1))); do
  if (( created >= MAX_NEW )); then
    echo "quality:loop — throttle reached (MAX_NEW=${MAX_NEW}), stopping"
    break
  fi

  group="$(echo "$groups_json" | jq -r ".[$i]")"
  gate="$(echo "$group" | jq -r '.gate')"
  subsystem="$(echo "$group" | jq -r '.subsystem')"
  title="$(echo "$group" | jq -r '.title')"
  violation_keys="$(echo "$group" | jq -r '.violation_keys[]')"

  # Truncate description to 2000 chars to stay within ticket.sh limits
  description="$(printf 'Open violations for %s:\n\n%s' "$title" "$violation_keys" | head -c 2000)"
  if [[ -z "$description" ]]; then
    echo "ERROR: empty description for group ${gate}:${subsystem} — aborting" >&2
    exit 1
  fi

  # Title prefix for dedup (matches exactly up to the count, which may change)
  title_prefix="CQ-GATE:${gate}:${subsystem}"

  if [[ -n "$DRY_RUN" ]]; then
    echo "[DRY_RUN] would create ticket: ${title}"
    echo "[DRY_RUN] would enqueue: ${title_prefix}"
    created=$(( created + 1 ))
    continue
  fi

  if has_open_ticket "$title_prefix"; then
    echo "  skip ${title_prefix} — open ticket already exists"
    continue
  fi

  echo "  creating: ${title}"
  ext_id="$(ticket.sh create \
    --type feature \
    --brand "$BRAND" \
    --title "$title" \
    --description "$description" \
    --priority mittel \
    | cut -d'|' -f1)"

  if [[ -z "$ext_id" ]]; then
    echo "ERROR: ticket.sh create returned empty ext_id for '${title}'" >&2
    exit 1
  fi

  echo "  enqueuing: ${ext_id}"
  ticket.sh enqueue --id "$ext_id"
  created=$(( created + 1 ))
done

echo "quality:loop — done. ${created} ticket(s) created this run."
```

- [ ] **Step 2: Make the script executable**

```bash
cd /tmp/wt-cqg-sliceB
chmod +x scripts/code-quality/loop.sh
```

- [ ] **Step 3: Run BATS tests — verify all pass**

```bash
cd /tmp/wt-cqg-sliceB
tests/unit/lib/bats-core/bin/bats tests/unit/quality-loop.bats 2>&1
```

Expected:
```
 ✓ DRY_RUN=1 with empty baseline exits 0 and creates zero tickets
 ✓ DRY_RUN=1 with two violation groups prints both groups, creates no tickets
 ✓ MAX_NEW=1 with 2 groups creates exactly one ticket
 ✓ existing open CQ-GATE ticket for a group is skipped (dedup)
4 tests, 0 failures
```

- [ ] **Step 4: Smoke-test DRY_RUN=1 over real HEAD**

```bash
cd /tmp/wt-cqg-sliceB
DRY_RUN=1 bash scripts/code-quality/loop.sh 2>&1
```

Expected: prints `[DRY_RUN] would create ticket: CQ-GATE:...` lines for each group, then `quality:loop — done.` — no kubectl, no ticket.sh calls.

- [ ] **Step 5: Commit**

```bash
cd /tmp/wt-cqg-sliceB
git add scripts/code-quality/loop.sh tests/unit/quality-loop.bats
git commit -m "feat(cqg): loop.sh — throttled dedup enqueue of CQ-GATE Factory tickets"
```

---

### Task B-07: Taskfile targets + run full test suite

**Files:**
- Modify: `Taskfile.yml` (after `quality:baseline:freeze:` block, before `docs:deploy:`)

Depends on: T-B02, T-B06.

- [ ] **Step 1: Add `quality:baseline:refresh` and `quality:loop` tasks**

In `Taskfile.yml`, locate the block ending at line 2287 (the `quality:baseline:freeze:` task) and insert after it:

```yaml
  quality:baseline:refresh:
    desc: "Remove FIXED entries and lower improved metrics in docs/code-quality/baseline.json"
    cmds:
      - node scripts/code-quality/baseline-refresh.mjs

  quality:loop:
    desc: "Enqueue ≤MAX_NEW new CQ-GATE Factory tickets (throttled + deduped). DRY_RUN=1 to preview."
    cmds:
      - bash scripts/code-quality/loop.sh
```

The insertion point is between the closing line of `quality:baseline:freeze:` and the start of `docs:deploy:`.

- [ ] **Step 2: Verify tasks are recognised by go-task**

```bash
cd /tmp/wt-cqg-sliceB
task --list 2>&1 | grep quality
```

Expected output includes:
```
quality:baseline:freeze   One-time: freeze ...
quality:baseline:refresh  Remove FIXED entries ...
quality:check             Run all code-quality gates ...
quality:index             Validate ...
quality:loop              Enqueue ≤MAX_NEW new CQ-GATE Factory tickets ...
```

- [ ] **Step 3: Run `task quality:baseline:refresh` — must exit 0**

```bash
cd /tmp/wt-cqg-sliceB
task quality:baseline:refresh 2>&1
```

Expected: `✓ baseline:refresh — 0 removed, 0 updated, 86 unchanged`

- [ ] **Step 4: Run `task quality:loop DRY_RUN=1` — must exit 0**

```bash
cd /tmp/wt-cqg-sliceB
DRY_RUN=1 task quality:loop 2>&1
```

Expected: `[DRY_RUN] would create ticket: ...` lines, then `quality:loop — done.`

- [ ] **Step 5: Run full test suite**

```bash
cd /tmp/wt-cqg-sliceB
[ -d node_modules ] || npm ci
task test:all 2>&1 | tail -20
```

Expected: all tasks in `test:all` pass, `0` failures.

- [ ] **Step 6: Commit**

```bash
cd /tmp/wt-cqg-sliceB
git add Taskfile.yml
git commit -m "feat(cqg): add quality:baseline:refresh + quality:loop Taskfile targets"
```

---

### Task B-08: `.github/workflows/quality-loop.yml` — nightly cron

**Files:**
- Create: `.github/workflows/quality-loop.yml`

Depends on: T-B07.

- [ ] **Step 1: Create the workflow**

```yaml
# .github/workflows/quality-loop.yml
# Nightly quality loop: enqueue ≤MAX_NEW CQ-GATE Factory tickets per
# (Gate × Subsystem) group that has open baseline violations.
# Runs at 02:00 UTC (after dev-db-refresh at 03:30 UTC is not a conflict —
# we hit fleet, not dev). Fires on workflow_dispatch for manual re-runs.
name: quality-loop

on:
  schedule:
    - cron: "0 2 * * *"
  workflow_dispatch:
    inputs:
      dry_run:
        description: "DRY_RUN (1 = preview only, no tickets created)"
        required: false
        default: "0"
      max_new:
        description: "MAX_NEW tickets per run (default: 2)"
        required: false
        default: "2"

jobs:
  quality-loop:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v5

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version-file: ".nvmrc"

      - name: Install root npm deps
        run: npm ci

      - name: Set up kubectl + fleet kubeconfig
        env:
          KUBECONFIG_DATA: ${{ secrets.FLEET_KUBECONFIG }}
        run: |
          curl -sSL "https://dl.k8s.io/release/v1.31.0/bin/linux/amd64/kubectl" \
            -o /usr/local/bin/kubectl && chmod +x /usr/local/bin/kubectl
          mkdir -p ~/.kube
          echo "$KUBECONFIG_DATA" | base64 -d > ~/.kube/config
          chmod 600 ~/.kube/config

      - name: Guard: kubeconfig context must be fleet
        run: |
          ctx="$(kubectl config current-context)"
          if [[ "$ctx" != "fleet" ]]; then
            echo "ERROR: expected context 'fleet', got '${ctx}'"
            exit 1
          fi

      - name: Run quality loop
        env:
          DRY_RUN: ${{ github.event.inputs.dry_run || '0' }}
          MAX_NEW: ${{ github.event.inputs.max_new || '2' }}
        run: task quality:loop
```

- [ ] **Step 2: Validate YAML syntax**

```bash
cd /tmp/wt-cqg-sliceB
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/quality-loop.yml').read()); print('YAML OK')"
```

Expected: `YAML OK`

- [ ] **Step 3: Commit**

```bash
cd /tmp/wt-cqg-sliceB
git add .github/workflows/quality-loop.yml
git commit -m "feat(cqg): nightly quality-loop GH Actions workflow (02:00 UTC, fleet)"
```

---

### Task B-09: CI baseline-shrink guard

**Files:**
- Modify: `.github/workflows/ci.yml` (after the `Run code-quality gates (baseline ratchet)` step, before `Verify route manifest` step)

Depends on: T-B07.

- [ ] **Step 1: Read the exact insertion context**

```bash
cd /tmp/wt-cqg-sliceB
grep -n "baseline ratchet\|Verify route manifest" .github/workflows/ci.yml
```

Note the line numbers. The new step goes between them.

- [ ] **Step 2: Insert the baseline-shrink guard step**

Find the line containing `run: task quality:check` (currently line ~55) and add the new step after it, before `- name: Verify route manifest is up to date`:

```yaml
      - name: Assert baseline did not grow (no new violations allowed)
        run: |
          pr_count=$(jq 'keys | length' docs/code-quality/baseline.json)
          main_count=$(git show origin/main:docs/code-quality/baseline.json 2>/dev/null | jq 'keys | length' || echo "$pr_count")
          echo "PR baseline keys: ${pr_count}, main baseline keys: ${main_count}"
          if (( pr_count > main_count )); then
            echo "ERROR: baseline.json grew on this PR (${main_count} → ${pr_count} keys)."
            echo "  New violations were added. Fix them or run 'task quality:baseline:freeze' only"
            echo "  if you intentionally introduced a known-acceptable violation and it was reviewed."
            exit 1
          fi
          echo "✓ baseline key-count is stable or shrinking (${main_count} → ${pr_count})"
```

- [ ] **Step 3: Validate YAML syntax**

```bash
cd /tmp/wt-cqg-sliceB
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml').read()); print('YAML OK')"
```

Expected: `YAML OK`

- [ ] **Step 4: Verify the guard logic locally (simulate a growing baseline)**

```bash
cd /tmp/wt-cqg-sliceB
# Simulate: pr_count=87 > main_count=86
pr_count=87; main_count=86
(( pr_count > main_count )) && echo "FAIL: baseline grew" || echo "OK"
# Expected: FAIL: baseline grew

# Simulate: pr_count=85 < main_count=86 (shrinking — allowed)
pr_count=85; main_count=86
(( pr_count > main_count )) && echo "FAIL: baseline grew" || echo "OK"
# Expected: OK
```

- [ ] **Step 5: Commit**

```bash
cd /tmp/wt-cqg-sliceB
git add .github/workflows/ci.yml
git commit -m "feat(cqg): CI guard — fail PR if baseline.json key-count grows"
```

---

### Task B-10: Update `test-inventory.json` + final verification

**Files:**
- Modify: `website/src/data/test-inventory.json` (via `task test:inventory`)

Depends on: T-B05 (BATS file must exist before regenerating).

Note on inventory: `tests/unit/quality-loop.bats` does not match the `FA|SA|NFA|AK` naming pattern, so `scripts/build-test-inventory.sh` will silently skip it (no new entry added). Running `task test:inventory` is still required to ensure the file's `jq` dedup check passes cleanly and the committed JSON matches the freshly-generated output (CI checks `git diff`).

- [ ] **Step 1: Regenerate test inventory**

```bash
cd /tmp/wt-cqg-sliceB
task test:inventory 2>&1
```

Expected: `Wrote N inventory entries to website/src/data/test-inventory.json`

- [ ] **Step 2: Verify git diff is clean (or shows only expected changes)**

```bash
cd /tmp/wt-cqg-sliceB
git diff website/src/data/test-inventory.json
```

Expected: no diff (quality-loop.bats doesn't match the FA/SA/NFA/AK pattern, so no entry was added — the file is unchanged and already committed).

- [ ] **Step 3: Run the full test suite one final time**

```bash
cd /tmp/wt-cqg-sliceB
[ -d node_modules ] || npm ci
task test:all 2>&1 | tail -30
```

Expected: all pass, zero failures. Key checks:
- `test:code-quality` runs `baseline-refresh.test.mjs` + `group-violations.test.mjs` via `node --test scripts/code-quality/*.test.mjs`
- `test:unit` (via `tests/unit/lib/bats-core/bin/bats`) runs `quality-loop.bats`

- [ ] **Step 4: Run `task quality:check` — must still pass**

```bash
cd /tmp/wt-cqg-sliceB
task quality:check 2>&1
```

Expected: `✓ no new or worsened violations`

- [ ] **Step 5: Final commit (inventory + any unstaged)**

```bash
cd /tmp/wt-cqg-sliceB
git status
# Stage any remaining unstaged files
git add website/src/data/test-inventory.json
git commit -m "chore(cqg): regenerate test-inventory after quality-loop.bats addition" || echo "nothing to commit (expected if inventory unchanged)"
```

- [ ] **Step 6: Verify all commits on the branch**

```bash
cd /tmp/wt-cqg-sliceB
git log --oneline feature/codequality-gates-sliceB 2>/dev/null || git log --oneline HEAD~10..HEAD
```

Expected ~7 commits covering B-02, B-04, B-06, B-07, B-08, B-09, B-10.

---

## Acceptance Criteria

After all tasks are done:

1. `task test:all` exits 0 — all offline tests pass.
2. `task quality:check` exits 0 — no new violations introduced by this branch.
3. `DRY_RUN=1 task quality:loop` prints at least one `[DRY_RUN] would create ticket` line (real baseline has violations).
4. `task quality:baseline:refresh` exits 0 and reports `0 removed, 0 updated, 86 unchanged` (baseline was frozen from HEAD, re-running is a no-op).
5. `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/quality-loop.yml').read())"` exits 0.
6. `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml').read())"` exits 0.
7. `git diff website/src/data/test-inventory.json` is clean.

---

## Drain-Horizon Note (for PR description)

With `MAX_NEW=2` tickets per nightly run and 86 baseline violations mapping to roughly 15–20 (Gate × Subsystem) groups, the initial full enqueue will take ~10 nights. Each Factory ticket targets one gate on one subsystem; at 3 global Factory slots and one agent per ticket, parallel drain is possible. Realistic full-baseline clearance: several weeks of nightly runs. The `CQ-GATE:` prefix discriminates these from regular feature tickets in `/admin/tickets` and Factory metrics. They are real production tickets (`is_test_data=false`) and survive the 6-hour test-data purge.
