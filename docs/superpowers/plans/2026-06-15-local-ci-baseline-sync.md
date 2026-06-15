---
title: Local CI Mirror + Baseline Auto-Tighten — Implementation Plan
ticket_id: T000741
domains: [website, infra, test]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Local CI Mirror + Baseline Auto-Tighten — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drei Verbesserungen am lokalen Entwickler-Feedback-Loop: (1) `task ci:local` als exaktes CI-Spiegelbild, (2) `task quality:tighten` zum automatischen Senken verbesserter Baseline-Werte, (3) blockierender `quality:check` im pre-push Hook mit `SKIP_CI_CHECK=1` Bypass.

**Architecture:** `tighten.mjs` delegiert an das bestehende `applyRefresh()` aus `baseline-refresh.mjs` — keine Logik-Duplizierung. `ci:local` ist ein Taskfile-Task der die CI-Steps als Shell-Befehle sequenziell ausführt. Der pre-push Hook erhält einen blockierenden Aufruf von `task quality:check` vor dem bisherigen Advisory-Block.

**Tech Stack:** Node.js ESM (.mjs), go-task (Taskfile.yml), Bash hooks

---

## S1-Budget (alle angefassten Dateien)

| Datei | Ist (wc -l) | Extension | Statisches S1-Limit | Baseline-Wert | Wirksames Budget |
|-------|-------------|-----------|--------------------|-|----------------|
| `.githooks/pre-push` | 32 | `.sh` (Bash) | 500 | nicht-baselined | **+468 Zeilen** |
| `Taskfile.yml` | 4532 | `.yml` | kein S1-Gate | nicht-baselined | unbegrenzt |
| `scripts/code-quality/tighten.mjs` | neu | `.mjs` | 500 | nicht-baselined | max 500 |

`scripts/code-quality/baseline-refresh.mjs` wird nur importiert, nicht modifiziert (46 Zeilen, weit unter Limit).

---

## Task 1: `scripts/code-quality/tighten.mjs` erstellen

**Files:**
- Create: `scripts/code-quality/tighten.mjs`
- Reference: `scripts/code-quality/baseline-refresh.mjs` (bestehend, nicht modifizieren)

- [ ] **Step 1: Datei anlegen**

```javascript
// scripts/code-quality/tighten.mjs
// CLI: tighten baseline.json by lowering entries where current metric < baseline metric.
// Delegates entirely to applyRefresh() from baseline-refresh.mjs.
// Exits 0 if nothing changed, exits 0 after updating + printing a summary.
// Usage: node scripts/code-quality/tighten.mjs [--commit]
//   --commit: if baseline changed, run "git add docs/code-quality/baseline.json && git commit"
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { loadGates } from './load.mjs';
import { aggregate } from './check.mjs';
import { applyRefresh } from './baseline-refresh.mjs';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = join(dirname(__filename), '..', '..');
const cfgDir = process.env.QUALITY_CFG_DIR
  ? join(repoRoot, process.env.QUALITY_CFG_DIR)
  : join(repoRoot, 'docs', 'code-quality');

const doCommit = process.argv.includes('--commit');

// validate-first (same pattern as check.mjs / freeze.mjs)
const { validateRegistry } = await import('./validate.mjs');
const v = validateRegistry(cfgDir, repoRoot);
if (!v.ok) { for (const e of v.errors) console.error('✗', e); process.exit(1); }

let baseline = {};
try { baseline = JSON.parse(readFileSync(join(cfgDir, 'baseline.json'), 'utf8')); }
catch { console.warn('⚠ baseline.json missing — nothing to tighten'); process.exit(0); }

const current = aggregate(repoRoot, loadGates(cfgDir));
const { updated, removed, updated_count, unchanged } = applyRefresh(baseline, current);

const baselinePath = join(cfgDir, 'baseline.json');
const before = JSON.stringify(baseline, null, 2);
const after  = JSON.stringify(updated,  null, 2);

if (before === after) {
  console.log('✓ quality:tighten — baseline already tight, nothing to do');
  process.exit(0);
}

writeFileSync(baselinePath, after + '\n', 'utf8');
console.log(`✓ quality:tighten — ${removed} removed, ${updated_count} tightened, ${unchanged} unchanged`);
console.log(`  ${Object.keys(updated).length} violation(s) remaining in baseline.json`);

if (doCommit) {
  const relPath = join('docs', 'code-quality', 'baseline.json');
  execFileSync('git', ['add', relPath], { cwd: repoRoot, stdio: 'inherit' });
  execFileSync('git', ['commit', '-m', 'chore(quality): tighten baseline.json after improvement'],
    { cwd: repoRoot, stdio: 'inherit' });
  console.log('✓ committed tightened baseline.json');
}
```

- [ ] **Step 2: Script testen (manuell)**

```bash
cd /home/patrick/Bachelorprojekt/tmp/wt-local-ci-baseline-sync
node scripts/code-quality/tighten.mjs
```

Erwartetes Ergebnis (wenn keine baselineten Dateien verbessert wurden):
```
✓ quality:tighten — baseline already tight, nothing to do
```

oder (wenn Einträge verbessert wurden):
```
✓ quality:tighten — 0 removed, N tightened, M unchanged
  X violation(s) remaining in baseline.json
```

Exit code immer 0.

- [ ] **Step 3: Commit**

```bash
cd /home/patrick/Bachelorprojekt/tmp/wt-local-ci-baseline-sync
git add scripts/code-quality/tighten.mjs
git commit -m "feat(quality): add tighten.mjs CLI for baseline auto-tighten"
```

---

## Task 2: Taskfile-Tasks `quality:tighten` und `ci:local` hinzufügen

**Files:**
- Modify: `Taskfile.yml` (nach Zeile 2763 — nach `quality:check`, `quality:baseline:freeze`, `quality:baseline:refresh`)

- [ ] **Step 1: `quality:tighten` Task nach `quality:baseline:refresh` einfügen**

Suche den Block:
```yaml
  quality:baseline:refresh:
    desc: "Remove FIXED entries and lower improved metrics in docs/code-quality/baseline.json"
    cmds:
      - node scripts/code-quality/baseline-refresh.mjs
```

Ersetze ihn durch (füge `quality:tighten` direkt danach ein):
```yaml
  quality:baseline:refresh:
    desc: "Remove FIXED entries and lower improved metrics in docs/code-quality/baseline.json"
    cmds:
      - node scripts/code-quality/baseline-refresh.mjs

  quality:tighten:
    desc: "Lower baseline.json entries where current metric improved; commit if --commit passed (COMMIT=1)"
    cmds:
      - |
        if [[ "{{.COMMIT}}" == "1" ]]; then
          node scripts/code-quality/tighten.mjs --commit
        else
          node scripts/code-quality/tighten.mjs
        fi
    vars:
      COMMIT: '{{.COMMIT | default "0"}}'
```

- [ ] **Step 2: `ci:local` Task am Ende der Qualitäts-Gruppe einfügen**

Suche den Block:
```yaml
  quality:loop:
    desc: "Enqueue ≤MAX_NEW new CQ-GATE Factory tickets (throttled + deduped). DRY_RUN=1 to preview."
    cmds:
      - bash scripts/code-quality/loop.sh
```

Füge **vor** `quality:loop` ein:
```yaml
  ci:local:
    desc: |
      Run all CI steps locally (mirrors .github/workflows/ci.yml offline-tests job).
      Flags: FAST=1 (only test:all + quality:check, ~3s), SKIP_NETWORK=1 (skip api-auth + freshness:check).
    vars:
      FAST:         '{{.FAST         | default "0"}}'
      SKIP_NETWORK: '{{.SKIP_NETWORK | default "0"}}'
    cmds:
      - |
        set -euo pipefail
        PASS=0; FAIL=0
        _step() { echo; echo "=== CI:LOCAL: $* ==="; }
        _ok()   { echo "  PASS: $*"; PASS=$((PASS+1)); }
        _fail() { echo "  FAIL: $*"; FAIL=$((FAIL+1)); }
        _run()  {
          local label="$1"; shift
          if "$@"; then _ok "$label"; else _fail "$label"; fi
        }

        if [[ "{{.FAST}}" == "1" ]]; then
          _step "FAST mode: test:all + quality:check"
          _run "task test:all"           task test:all
          _run "task quality:check"      task quality:check
          echo
          echo "ci:local FAST: ${PASS} passed, ${FAIL} failed"
          [[ $FAIL -eq 0 ]]
          exit $?
        fi

        _step "1/5: Offline tests (task test:all)"
        _run "task test:all" task test:all

        if [[ "{{.SKIP_NETWORK}}" != "1" ]]; then
          _step "2/5: API auth regression gate"
          git fetch origin main --depth=1 2>/dev/null || true
          git show origin/main:docs/generated/api-map.json > /tmp/api-map-main.json 2>/dev/null \
            || echo '{"generatedAt":"","endpoints":[]}' > /tmp/api-map-main.json
          _run "api-auth-check" node scripts/api-auth-check.mjs --regression --main-map /tmp/api-map-main.json

          _step "3/5: Freshness + quality ratchet (task freshness:check)"
          _run "task freshness:check" task freshness:check
        else
          echo "  SKIP: api-auth regression (SKIP_NETWORK=1)"
          echo "  SKIP: freshness:check (SKIP_NETWORK=1)"
        fi

        _step "4/5: Learning-assets build test"
        _run "build-learning-assets.test" node --test scripts/build-learning-assets.test.mjs

        _step "5/5: Systembrett template validation"
        _run "systembrett-template.test.sh" ./scripts/tests/systembrett-template.test.sh

        echo
        echo "========================================"
        echo "ci:local summary: ${PASS} passed, ${FAIL} failed"
        echo "========================================"
        [[ $FAIL -eq 0 ]]

```

- [ ] **Step 3: Syntax prüfen**

```bash
cd /home/patrick/Bachelorprojekt/tmp/wt-local-ci-baseline-sync
task --list 2>&1 | grep -E "ci:local|quality:tighten"
```

Erwartetes Ergebnis:
```
* ci:local:        Run all CI steps locally ...
* quality:tighten: Lower baseline.json entries ...
```

- [ ] **Step 4: Smoke-Test `ci:local --fast`**

```bash
cd /home/patrick/Bachelorprojekt/tmp/wt-local-ci-baseline-sync
task ci:local FAST=1
```

Erwartetes Ergebnis: Beide Steps Pass, Exit 0.

- [ ] **Step 5: Smoke-Test `quality:tighten`**

```bash
cd /home/patrick/Bachelorprojekt/tmp/wt-local-ci-baseline-sync
task quality:tighten
```

Erwartetes Ergebnis: Exit 0, kein Fehler.

- [ ] **Step 6: Commit**

```bash
cd /home/patrick/Bachelorprojekt/tmp/wt-local-ci-baseline-sync
git add Taskfile.yml
git commit -m "feat(ci): add ci:local mirror task and quality:tighten baseline task"
```

---

## Task 3: Pre-push Hook stärken

**Files:**
- Modify: `.githooks/pre-push`

- [ ] **Step 1: Hook-Datei ersetzen**

Aktuelle Datei (32 Zeilen, advisory-only). Neue Version mit blockierendem `quality:check` vor dem Advisory-Block:

```bash
#!/usr/bin/env bash
# pre-push: fast quality gate (blockierend) + BATS-Konsistenz-Advisory (warn-only).
#
# Blockierend (exit 1):
#   task quality:check (S1–S4 Ratchet, ~3s)
#   Bypass: SKIP_CI_CHECK=1 git push
#
# Advisory (exit 0, nur Warnung):
#   BATS-Dateien geändert aber repo-index.json/test-inventory.json fehlen im Push
set -uo pipefail

warn() { printf '⚠  pre-push: %s\n' "$*" >&2; }
err()  { printf '✗  pre-push: %s\n' "$*" >&2; }

# ── 1. Blocking quality gate ──────────────────────────────────────────────────
if [[ "${SKIP_CI_CHECK:-0}" == "1" ]]; then
  warn "SKIP_CI_CHECK=1 — quality:check bypassed"
else
  if ! task quality:check; then
    err "quality:check failed — push blocked"
    err "Fix the violations above, then push again."
    err "To bypass (emergency only): SKIP_CI_CHECK=1 git push"
    exit 1
  fi
fi

# ── 2. Advisory: BATS changed without repo-index/test-inventory update ───────
REMOTE="$1"
URL="$2"
while IFS=' ' read -r LOCAL_REF LOCAL_SHA REMOTE_REF REMOTE_SHA; do
  [[ "$LOCAL_SHA" == "0000000000000000000000000000000000000000" ]] && continue
  BASE="${REMOTE_SHA:-}"
  if [[ -z "$BASE" || "$BASE" == "0000000000000000000000000000000000000000" ]]; then
    BASE=$(git rev-parse --verify "origin/main" 2>/dev/null || git rev-parse --verify "HEAD~1" 2>/dev/null || true)
  fi
  [[ -z "$BASE" ]] && continue

  CHANGED_BATS=$(git diff --name-only "$BASE..$LOCAL_SHA" 2>/dev/null | grep '\.bats$' || true)
  [[ -z "$CHANGED_BATS" ]] && continue

  CHANGED_INDEX=$(git diff --name-only "$BASE..$LOCAL_SHA" 2>/dev/null | grep 'repo-index\.json\|test-inventory\.json' || true)
  if [[ -z "$CHANGED_INDEX" ]]; then
    warn "BATS-Dateien geändert, aber repo-index.json/test-inventory.json fehlen im Push."
    warn "CI schlägt möglicherweise fehl. Fix:"
    warn "  task freshness:regenerate"
    warn "  git add docs/code-quality/repo-index.json website/src/data/test-inventory.json"
    warn "  git commit --amend --no-edit && git push --force-with-lease"
  fi
done

exit 0
```

Neue Datei hat 50 Zeilen (war 32). S1-Budget: 500 - 50 = **450 verbleibend**. Kein Problem.

- [ ] **Step 2: Datei schreiben und ausführbar machen**

```bash
cd /home/patrick/Bachelorprojekt/tmp/wt-local-ci-baseline-sync
# Datei wurde per Edit-Tool ersetzt (oben)
chmod +x .githooks/pre-push
```

- [ ] **Step 3: Hook testen — normaler Fall (quality:check soll passen)**

```bash
cd /home/patrick/Bachelorprojekt/tmp/wt-local-ci-baseline-sync
# Simuliere pre-push-Aufruf (ohne echten git push)
echo "refs/heads/test abc123 refs/heads/test def456" | bash .githooks/pre-push origin git@github.com:test/test.git
```

Erwartetes Ergebnis: `task quality:check` läuft, Exit 0.

- [ ] **Step 4: Hook testen — SKIP_CI_CHECK Bypass**

```bash
cd /home/patrick/Bachelorprojekt/tmp/wt-local-ci-baseline-sync
echo "" | SKIP_CI_CHECK=1 bash .githooks/pre-push origin git@github.com:test/test.git
```

Erwartetes Ergebnis: Warnung `SKIP_CI_CHECK=1 — quality:check bypassed`, dann normaler Ablauf, Exit 0.

- [ ] **Step 5: Commit**

```bash
cd /home/patrick/Bachelorprojekt/tmp/wt-local-ci-baseline-sync
git add .githooks/pre-push
git commit -m "feat(hooks): strengthen pre-push with blocking quality:check gate"
```

---

## Task 4: S4-Orphan-Check sicherstellen

**Files:**
- Verify: `scripts/code-quality/tighten.mjs` ist via Taskfile erreichbar (bereits in Task 2 gewährleistet)

- [ ] **Step 1: S4 explizit prüfen**

```bash
cd /home/patrick/Bachelorprojekt/tmp/wt-local-ci-baseline-sync
node scripts/code-quality/check.mjs 2>&1 | grep -E "tighten|S4"
```

Erwartetes Ergebnis: Keine `S4`-Violation für `scripts/code-quality/tighten.mjs` — weil der Task `quality:tighten` in Taskfile.yml auf das Script verweist, was S4 als "erreichbar" wertet.

Hinweis: Falls S4 `tighten.mjs` trotzdem als Orphan flaggt (S4-Scanner greift auf andere Kriterien), muss ein Kommentar-Referenz in einem vorhandenen Skript (z.B. `scripts/code-quality/README` oder Erwähnung in einem BATS-Test) hinzugefügt werden. Prüfe die S4-Gates-Konfiguration:

```bash
cat /home/patrick/Bachelorprojekt/tmp/wt-local-ci-baseline-sync/docs/code-quality/gates.yaml | grep -A5 "s4"
```

- [ ] **Step 2: Commit wenn Anpassung nötig**

Nur wenn S4 eine Violation zeigt. Dann Anpassung gemäß Ausgabe, dann:
```bash
git add <angepasste_datei>
git commit -m "fix(quality): resolve S4 orphan for tighten.mjs"
```

---

## Task 5: Abschluss-Verifikation

**Files:** keine neuen Änderungen

- [ ] **Step 1: Full offline test suite**

```bash
cd /home/patrick/Bachelorprojekt/tmp/wt-local-ci-baseline-sync
task test:all
```

Erwartetes Ergebnis: Alle Tests grün, Exit 0.

- [ ] **Step 2: Regenerate generated artifacts**

```bash
cd /home/patrick/Bachelorprojekt/tmp/wt-local-ci-baseline-sync
task freshness:regenerate
```

Erwartetes Ergebnis: Alle Artefakte regeneriert, keine Fehler.

- [ ] **Step 3: CI-Äquivalent-Check**

```bash
cd /home/patrick/Bachelorprojekt/tmp/wt-local-ci-baseline-sync
task freshness:check
```

Erwartetes Ergebnis:
- `✓ All generated artifacts are fresh`
- `✓ no new or worsened violations`
- `✓ baseline key-count is stable or shrinking`

- [ ] **Step 4: Neuen `ci:local` Task als Smoke-Test**

```bash
cd /home/patrick/Bachelorprojekt/tmp/wt-local-ci-baseline-sync
task ci:local SKIP_NETWORK=1
```

Erwartetes Ergebnis: 3/5 Steps Pass (test:all + learning-assets + systembrett), 2 Skipped (network-Steps), Exit 0.

- [ ] **Step 5: Stale Artefakte committen falls nötig**

```bash
cd /home/patrick/Bachelorprojekt/tmp/wt-local-ci-baseline-sync
git diff --stat
# Falls repo-index.json oder test-inventory.json geändert:
git add docs/code-quality/repo-index.json website/src/data/test-inventory.json
git commit -m "chore: regenerate freshness artifacts after ci:local addition"
```

- [ ] **Step 6: Push**

```bash
cd /home/patrick/Bachelorprojekt/tmp/wt-local-ci-baseline-sync
git push -u origin feature/local-ci-baseline-sync
```
