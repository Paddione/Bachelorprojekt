# Dashboard Pipeline Skip-Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-step "active/inactive" checkboxes to the Full Deploy Pipeline sidebar in the local task dashboard. Inactive steps glow and are skipped automatically when the runner reaches them. State persists per-ENV in localStorage.

**Architecture:** Pure frontend change in a single file (`dashboard/public/index.html`). The runner already supports skipping (`pipeline.skipped` Set + `nextNonSkipped()` helper at index.html:1030–1034). We add (1) a persistence layer keyed by ENV, (2) a checkbox UI per row with glow CSS for inactive rows, (3) wiring that seeds `pipeline.skipped` from the unchecked set when the user presses Start.

**Tech Stack:** Vanilla HTML/CSS/JS, `localStorage`. No build step. Dashboard server is a thin Socket.IO wrapper around `task` (see `dashboard/server.js`); no server changes needed.

**Spec:** `docs/superpowers/specs/2026-04-28-dashboard-pipeline-skip-toggle-design.md`

**Testing model:** The dashboard has no automated test suite. Each task ends with manual verification steps run in a real browser against `task dashboard:start` (or whatever launches the local server). Engineer must visually confirm.

---

## File Structure

Only one file is touched. The CSS, HTML/DOM-builder code, and runtime state are all colocated in `dashboard/public/index.html`. Inserting helpers next to the existing pipeline code (rather than splitting into modules) matches the file's current structure — splitting would be unrelated refactoring.

- **Modify:** `dashboard/public/index.html`
  - CSS block around line 351 (`.pipeline-step` rules) — add inactive-state styles, checkbox styles, `@keyframes pipelineGlow`.
  - ENV-selector handler around line 681 — add re-hydrate call.
  - Pipeline section builder IIFE around line 692 — add checkbox per row, reset link in header, click-target guard.
  - `pipeline` state object at line 944 — add `skippedCmds: new Set()` snapshot field (separate from `pipeline.skipped` indices).
  - `startPipeline` / `startPipelineFrom` at line 1036/1047 — seed `pipeline.skipped` from unchecked set.
  - New helper block (insert near other pipeline helpers around line 1030): `getActiveEnv()`, `skipStorageKey(env)`, `loadSkipSet(env)`, `saveSkipSet(env, cmdSet)`, `applySkipUiForEnv(env)`, `updatePipelineStartBtnState()`.

---

## Task 1: Storage helpers + per-ENV in-memory state

Add the data layer first so later UI tasks have something to bind to.

**Files:**
- Modify: `dashboard/public/index.html` — insert a new helper block immediately before the existing `// ── Pipeline state & tracker panel ──` comment (currently line 943).

- [ ] **Step 1: Insert helper block above the `pipeline` state object**

Find the exact line:
```js
    // ── Pipeline state & tracker panel ────────────────────────────────────
    const pipeline = {
```

Insert this block ABOVE that comment:

```js
    // ── Per-ENV skip-set persistence ──────────────────────────────────────
    // Storage key: dashboard.pipeline.skipped.<env>
    // Stored value: JSON array of step `cmd` strings (robust to PIPELINE_STEPS reordering).
    // In-memory `skipState` mirrors localStorage for the *currently selected* ENV.
    const SKIP_KEY_PREFIX = 'dashboard.pipeline.skipped.';
    const skipState = { env: null, cmds: new Set() };

    function getActiveEnv() {
        // envSelect is defined earlier in the file (line ~681).
        return envSelect.value;
    }

    function skipStorageKey(env) {
        return SKIP_KEY_PREFIX + env;
    }

    function loadSkipSet(env) {
        try {
            const raw = localStorage.getItem(skipStorageKey(env));
            if (!raw) return new Set();
            const arr = JSON.parse(raw);
            if (!Array.isArray(arr)) return new Set();
            // Self-heal: drop any cmd no longer present in PIPELINE_STEPS.
            const valid = new Set(PIPELINE_STEPS.map(s => s.cmd));
            return new Set(arr.filter(c => typeof c === 'string' && valid.has(c)));
        } catch (e) {
            return new Set();
        }
    }

    function saveSkipSet(env, cmdSet) {
        try {
            localStorage.setItem(skipStorageKey(env), JSON.stringify([...cmdSet]));
        } catch (e) { /* quota / privacy mode — silently no-op */ }
    }

    function hydrateSkipStateForActiveEnv() {
        const env = getActiveEnv();
        skipState.env = env;
        skipState.cmds = loadSkipSet(env);
    }

    function toggleSkipForCmd(cmd) {
        if (skipState.cmds.has(cmd)) skipState.cmds.delete(cmd);
        else skipState.cmds.add(cmd);
        saveSkipSet(skipState.env, skipState.cmds);
    }

    function clearSkipsForActiveEnv() {
        skipState.cmds = new Set();
        saveSkipSet(skipState.env, skipState.cmds);
    }
```

- [ ] **Step 2: Initialize on load**

Find the existing ENV-selector block (line ~680):
```js
    // ── ENV selector ───────────────────────────────────────────────────────
    const envSelect = document.getElementById('env-select');
    envSelect.addEventListener('change', () => {
        const isProd = envSelect.value !== 'dev';
        document.getElementById('prod-banner').classList.toggle('visible', isProd);
        envSelect.classList.toggle('prod', isProd);
    });
```

Replace it with:
```js
    // ── ENV selector ───────────────────────────────────────────────────────
    const envSelect = document.getElementById('env-select');
    envSelect.addEventListener('change', () => {
        const isProd = envSelect.value !== 'dev';
        document.getElementById('prod-banner').classList.toggle('visible', isProd);
        envSelect.classList.toggle('prod', isProd);
        // Re-hydrate skip state and re-render pipeline checkboxes for the new ENV.
        // applySkipUiForEnv is defined in the pipeline section (Task 3); guard for
        // initial load when it does not yet exist.
        hydrateSkipStateForActiveEnv();
        if (typeof applySkipUiForEnv === 'function') applySkipUiForEnv();
    });
```

- [ ] **Step 3: Verify (no functional change yet)**

Run the dashboard:
```bash
cd /home/patrick/Bachelorprojekt/dashboard && node server.js &
```

Open the dashboard in a browser. Open the JS console. Expected: no errors. Run:
```js
hydrateSkipStateForActiveEnv(); console.log([...skipState.cmds]);
```
Expected: `[]` (empty). Then:
```js
toggleSkipForCmd('workspace:talk-setup');
console.log(localStorage.getItem('dashboard.pipeline.skipped.dev'));
```
Expected: `'["workspace:talk-setup"]'`. Then:
```js
toggleSkipForCmd('workspace:talk-setup');
console.log(localStorage.getItem('dashboard.pipeline.skipped.dev'));
```
Expected: `'[]'`.

Clean up: `localStorage.removeItem('dashboard.pipeline.skipped.dev')`. Stop the dashboard server.

- [ ] **Step 4: Commit**

```bash
git add dashboard/public/index.html
git commit -m "feat(dashboard): add per-ENV skip-set storage helpers"
```

---

## Task 2: CSS for inactive (glow) state and checkbox

Add styles before any DOM changes, so Task 3 can apply them immediately.

**Files:**
- Modify: `dashboard/public/index.html` — append to the `.pipeline-step` CSS block (currently ends at line 378 with `#pipeline-start-btn:disabled`).

- [ ] **Step 1: Insert new CSS rules**

Find the existing rule:
```css
        #pipeline-start-btn:disabled { opacity: 0.4; cursor: not-allowed; }
```

Insert immediately AFTER it, BEFORE the next section comment (`/* ── From-scratch zone ─────...`):

```css
        /* ── Pipeline step active/inactive checkbox ───────────── */
        .ps-check {
            width: 14px; height: 14px; flex-shrink: 0;
            border: 1px solid var(--border); border-radius: 3px;
            background: var(--bg3); cursor: pointer; position: relative;
            display: flex; align-items: center; justify-content: center;
            transition: border-color .12s ease, background .12s ease;
        }
        .ps-check:hover { border-color: var(--primary); }
        .ps-check.checked {
            background: #3ec9a7; border-color: #3ec9a7;
        }
        .ps-check.checked::after {
            content: '✓'; color: #0a1a14; font-size: 10px; font-weight: 700;
            line-height: 1;
        }

        /* ── Inactive (skipped) step — pulsing glow ───────────── */
        @keyframes pipelineGlow {
            0%, 100% { box-shadow: 0 0 2px rgba(62, 201, 167, 0.35); }
            50%      { box-shadow: 0 0 10px rgba(62, 201, 167, 0.85),
                                   inset 0 0 0 1px rgba(62, 201, 167, 0.6); }
        }
        .pipeline-step.inactive {
            animation: pipelineGlow 2s ease-in-out infinite;
        }
        .pipeline-step.inactive .ps-name,
        .pipeline-step.inactive .ps-cmd { opacity: 0.55; }
        .pipeline-step.inactive .ps-dot.ps-pend {
            background: transparent; border: 1px solid #3ec9a7; color: #3ec9a7;
        }

        /* ── Pipeline section header reset link ───────────────── */
        .pipeline-reset {
            font-size: 10px; color: var(--text-dim); cursor: pointer;
            margin-left: 6px; padding: 1px 5px; border-radius: 3px;
            border: 1px solid transparent;
        }
        .pipeline-reset:hover {
            color: var(--text); border-color: var(--border);
        }
```

- [ ] **Step 2: Verify CSS parses (visual no-op until Task 3)**

Reload the dashboard. Open DevTools → Elements → confirm no parse errors in the `<style>` block. The keyframe and `.ps-check` rules should be visible in the inspector even though no element uses them yet.

- [ ] **Step 3: Commit**

```bash
git add dashboard/public/index.html
git commit -m "feat(dashboard): styles for pipeline-step checkbox and inactive glow"
```

---

## Task 3: Checkbox per pipeline-step row + click guard

Wire the checkbox into each row in `buildPipelineSection`, add the row-click guard, and add `applySkipUiForEnv` so Task 1's ENV-change handler has something to call.

**Files:**
- Modify: `dashboard/public/index.html` — replace the `PIPELINE_STEPS.forEach((step, i) => { ... })` block inside `buildPipelineSection` (currently lines 732–762).

- [ ] **Step 1: Replace the per-step row builder**

Find the exact block:
```js
        PIPELINE_STEPS.forEach((step, i) => {
            const row = document.createElement('div');
            row.className = 'pipeline-step';
            row.id = 'ps-row-' + i;

            const dot = document.createElement('div');
            dot.className = 'ps-dot ps-pend';
            dot.id = 'ps-dot-' + i;
            dot.textContent = String(i + 1);

            const info = document.createElement('div');
            info.className = 'ps-info';

            const name = document.createElement('div');
            name.className = 'ps-name';
            name.textContent = step.title;

            const cmd = document.createElement('div');
            cmd.className = 'ps-cmd';
            cmd.textContent = 'task ' + step.cmd;

            info.appendChild(name);
            info.appendChild(cmd);
            row.appendChild(dot);
            row.appendChild(info);
            row.addEventListener('click', () => {
                if (running) return;
                startPipelineFrom(i);
            });
            body.appendChild(row);
        });
```

Replace with:
```js
        PIPELINE_STEPS.forEach((step, i) => {
            const row = document.createElement('div');
            row.className = 'pipeline-step';
            row.id = 'ps-row-' + i;

            const check = document.createElement('div');
            check.className = 'ps-check';
            check.id = 'ps-check-' + i;
            check.title = 'Toggle active/inactive for this step';
            check.dataset.cmd = step.cmd;
            check.addEventListener('click', (ev) => {
                ev.stopPropagation();           // do not trigger row-click run
                if (pipeline.active) return;    // freeze toggles mid-run
                toggleSkipForCmd(step.cmd);
                applySkipUiForEnv();
                updatePipelineStartBtnState();
            });

            const dot = document.createElement('div');
            dot.className = 'ps-dot ps-pend';
            dot.id = 'ps-dot-' + i;
            dot.textContent = String(i + 1);

            const info = document.createElement('div');
            info.className = 'ps-info';

            const name = document.createElement('div');
            name.className = 'ps-name';
            name.textContent = step.title;

            const cmd = document.createElement('div');
            cmd.className = 'ps-cmd';
            cmd.textContent = 'task ' + step.cmd;

            info.appendChild(name);
            info.appendChild(cmd);
            row.appendChild(check);
            row.appendChild(dot);
            row.appendChild(info);
            row.addEventListener('click', (ev) => {
                if (running) return;
                // Guard: clicks on the checkbox are handled by its own listener.
                if (ev.target.classList && ev.target.classList.contains('ps-check')) return;
                startPipelineFrom(i);   // explicit row-click runs that step even if marked inactive
            });
            body.appendChild(row);
        });
```

- [ ] **Step 2: Add `applySkipUiForEnv` and `updatePipelineStartBtnState` helpers**

Find the helper block inserted in Task 1 (the `// ── Per-ENV skip-set persistence ──` block). Append these two functions to the end of that block, BEFORE the `// ── Pipeline state & tracker panel ──` comment:

```js
    function applySkipUiForEnv() {
        PIPELINE_STEPS.forEach((step, i) => {
            const row   = document.getElementById('ps-row-' + i);
            const check = document.getElementById('ps-check-' + i);
            if (!row || !check) return;   // section may not be built yet on first hydrate
            const inactive = skipState.cmds.has(step.cmd);
            row.classList.toggle('inactive', inactive);
            check.classList.toggle('checked', !inactive);
        });
    }

    function updatePipelineStartBtnState() {
        const btn = document.getElementById('pipeline-start-btn');
        if (!btn) return;
        const allInactive = PIPELINE_STEPS.every(s => skipState.cmds.has(s.cmd));
        btn.disabled = allInactive;
        btn.title = allInactive ? 'All steps inactive — toggle at least one to enable' : '';
    }
```

- [ ] **Step 3: Apply state on page load**

Find the very end of the `buildPipelineSection` IIFE — the closing `}());` line (currently around line 766). Immediately AFTER that line, insert:

```js
    // Hydrate per-ENV skip set and render checkbox state on first load.
    hydrateSkipStateForActiveEnv();
    applySkipUiForEnv();
    updatePipelineStartBtnState();
```

- [ ] **Step 4: Manual verification — toggle, persist, ENV scoping**

Restart the dashboard, open the browser. Confirm:
1. Each pipeline step row shows a small checkbox to its left, all checked by default (cyan-green tick on `#3ec9a7`).
2. Click the checkbox on `Talk Setup` → checkbox unchecks, row gets pulsing cyan-green box-shadow, title/cmd dim to ~55% opacity, dot becomes a hollow ring.
3. Reload page → `Talk Setup` is still inactive (state restored from localStorage).
4. Switch ENV from `dev` to `mentolder` → all steps return to active (independent storage). Toggle `Recording Setup` inactive on mentolder.
5. Switch back to `dev` → `Talk Setup` is still inactive, `Recording Setup` is active. Per-ENV scoping works.
6. Uncheck all 7 → `▶ Start Full Pipeline` button becomes disabled with hover-tooltip.
7. Re-check one → button re-enables.

DO NOT press Start yet — runner wiring lands in Task 4.

- [ ] **Step 5: Commit**

```bash
git add dashboard/public/index.html
git commit -m "feat(dashboard): per-step skip checkbox + glow for inactive steps"
```

---

## Task 4: Runner wiring — seed `pipeline.skipped` from unchecked set

Make the Start button (and per-row run-this-step click) actually honor the inactive state.

**Files:**
- Modify: `dashboard/public/index.html` — replace `startPipeline()` and `startPipelineFrom()` (currently lines 1036–1056). Also update `abortPipeline` and `pipelineComplete` to refresh the Start-button state.

- [ ] **Step 1: Replace `startPipeline`**

Find:
```js
    function startPipeline() {
        pipeline.active  = true;
        pipeline.current = 0;
        pipeline.skipped = new Set();
        countdownBar.className = '';
        trackerPanel.classList.add('visible');
        buildTrackerSteps();
        updateSidebarDots();
        runTask(PIPELINE_STEPS[0].cmd, []);
    }
```

Replace with:
```js
    function startPipeline() {
        // Snapshot the current skip set into index-based form for the runner.
        const skippedIdx = new Set();
        PIPELINE_STEPS.forEach((s, i) => {
            if (skipState.cmds.has(s.cmd)) skippedIdx.add(i);
        });

        // Find first non-skipped step. If all are skipped, refuse to start.
        let start = 0;
        while (start < PIPELINE_STEPS.length && skippedIdx.has(start)) start++;
        if (start >= PIPELINE_STEPS.length) return;   // Start button is disabled in this state anyway

        pipeline.active  = true;
        pipeline.current = start;
        pipeline.skipped = skippedIdx;
        countdownBar.className = '';
        trackerPanel.classList.add('visible');
        buildTrackerSteps();
        updateSidebarDots();
        runTask(PIPELINE_STEPS[start].cmd, []);
    }
```

- [ ] **Step 2: Replace `startPipelineFrom`**

Find:
```js
    function startPipelineFrom(index) {
        pipeline.active  = true;
        pipeline.current = index;
        pipeline.skipped = new Set();
        countdownBar.className = '';
        trackerPanel.classList.add('visible');
        buildTrackerSteps();
        updateSidebarDots();
        runTask(PIPELINE_STEPS[index].cmd, []);
    }
```

Replace with:
```js
    function startPipelineFrom(index) {
        // Snapshot skip set, but NEVER mark `index` itself as skipped — explicit
        // row-click is treated as "run this one anyway" intent (per spec).
        const skippedIdx = new Set();
        PIPELINE_STEPS.forEach((s, i) => {
            if (i !== index && skipState.cmds.has(s.cmd)) skippedIdx.add(i);
        });

        pipeline.active  = true;
        pipeline.current = index;
        pipeline.skipped = skippedIdx;
        countdownBar.className = '';
        trackerPanel.classList.add('visible');
        buildTrackerSteps();
        updateSidebarDots();
        runTask(PIPELINE_STEPS[index].cmd, []);
    }
```

- [ ] **Step 3: Refresh start-button state after pipeline ends**

Find `pipelineComplete()` (currently around line 1070):
```js
    function pipelineComplete() {
        pipeline.active = false;
        countdownBar.className = '';
        trackerSub.textContent = 'Complete ✓';
        updateSidebarDots();
    }
```

Replace with:
```js
    function pipelineComplete() {
        pipeline.active = false;
        countdownBar.className = '';
        trackerSub.textContent = 'Complete ✓';
        updateSidebarDots();
        updatePipelineStartBtnState();
    }
```

Find `abortPipeline()` (currently around line 1077):
```js
    function abortPipeline() {
        clearCountdown();
        pipeline.active = false;
        countdownBar.className = '';
        trackerPanel.classList.remove('visible');
        PIPELINE_STEPS.forEach((_, i) => {
            const dot = document.getElementById('ps-dot-' + i);
            if (dot) {
                dot.className = 'ps-dot ps-pend';
                dot.textContent = String(i + 1);
            }
        });
    }
```

Add `updatePipelineStartBtnState()` as the last line of the function body, right after the `forEach`:
```js
    function abortPipeline() {
        clearCountdown();
        pipeline.active = false;
        countdownBar.className = '';
        trackerPanel.classList.remove('visible');
        PIPELINE_STEPS.forEach((_, i) => {
            const dot = document.getElementById('ps-dot-' + i);
            if (dot) {
                dot.className = 'ps-dot ps-pend';
                dot.textContent = String(i + 1);
            }
        });
        updatePipelineStartBtnState();
    }
```

- [ ] **Step 4: Manual verification — runner honors skip set**

Restart the dashboard. ENV = `dev`. Set up: uncheck `Talk Setup` and `Recording Setup`. Make sure `Deploy Workspace` etc. are still checked.

Test 1 (Start button path): Click `▶ Start Full Pipeline`. Watch the tracker panel.
- Expected: steps 1–4 run normally. Steps 5 and 6 (`talk-setup`, `recording-setup`) appear with `⊘` and `(skipped)` styling and the runner advances over them without spawning the task. Step 7 (`transcriber-setup`) runs normally.
- Confirm in the dashboard log pane: NO `[Dashboard] Starting: task workspace:talk-setup` line appears.

Test 2 (override path): Wait for completion. Now click directly on the `Talk Setup` row (the body, not the checkbox).
- Expected: `Talk Setup` runs (override). The unchecked state is preserved (checkbox stays unchecked, row keeps glowing).
- After completion, the tracker shows `Talk Setup` done, `Recording Setup` still skipped, `Transcriber Setup` runs.

Test 3 (all-inactive guard): Uncheck every step. Confirm `▶ Start Full Pipeline` is disabled. Hover for tooltip.

Test 4 (mid-run toggle freeze): Start the pipeline. While step 1 is running, click a checkbox.
- Expected: nothing happens (handler returns early when `pipeline.active`). Visual state does not change.

- [ ] **Step 5: Commit**

```bash
git add dashboard/public/index.html
git commit -m "feat(dashboard): runner skips inactive pipeline steps"
```

---

## Task 5: Reset link in pipeline section header

Adds a per-ENV reset shortcut so the user can re-activate every step in one click.

**Files:**
- Modify: `dashboard/public/index.html` — augment the `buildPipelineSection` header (currently lines 696–721).

- [ ] **Step 1: Add reset link to the section header**

Find the existing chevron append in `buildPipelineSection`:
```js
        const chevron = document.createElement('span');
        chevron.className = 'section-chevron';
        chevron.textContent = '▶';

        header.appendChild(iconEl);
        header.appendChild(nameEl);
        header.appendChild(countEl);
        header.appendChild(chevron);
        header.addEventListener('click', () => section.classList.toggle('open'));
        section.appendChild(header);
```

Replace with:
```js
        const chevron = document.createElement('span');
        chevron.className = 'section-chevron';
        chevron.textContent = '▶';

        const resetLink = document.createElement('span');
        resetLink.className = 'pipeline-reset';
        resetLink.textContent = '↺ reset';
        resetLink.title = 'Re-activate every step for the current ENV';
        resetLink.addEventListener('click', (ev) => {
            ev.stopPropagation();          // do not toggle section open/close
            if (pipeline.active) return;   // freeze during a run
            clearSkipsForActiveEnv();
            applySkipUiForEnv();
            updatePipelineStartBtnState();
        });

        header.appendChild(iconEl);
        header.appendChild(nameEl);
        header.appendChild(countEl);
        header.appendChild(resetLink);
        header.appendChild(chevron);
        header.addEventListener('click', () => section.classList.toggle('open'));
        section.appendChild(header);
```

- [ ] **Step 2: Manual verification**

Restart the dashboard. Uncheck a few steps for `dev`. Confirm:
1. `↺ reset` link is visible in the section header next to the count.
2. Click it → all steps return to active immediately, glow stops, all checkboxes show the cyan tick. localStorage entry for `dashboard.pipeline.skipped.dev` becomes `[]`.
3. Switch to `mentolder`, uncheck two steps, click reset → only `mentolder` is reset. Switch back to `dev` → `dev` skip set is whatever you left it as (independent).
4. Click `↺ reset` does NOT toggle the section open/closed (event stopped propagating).

- [ ] **Step 3: Commit**

```bash
git add dashboard/public/index.html
git commit -m "feat(dashboard): per-ENV reset link in pipeline section header"
```

---

## Task 6: End-to-end smoke test against the live dev cluster

Final sanity pass with a real pipeline run. Confirms no regression in normal flow and that skip really saves time.

- [ ] **Step 1: Baseline timing — full pipeline, all active**

Restart the dashboard. ENV = `dev`. All checkboxes checked (use `↺ reset` if needed). Press `▶ Start Full Pipeline`. Note wall-clock duration in the tracker panel header.

- [ ] **Step 2: Skipped run — same starting state, skip post-Nextcloud steps**

Wait for the previous run to finish. Uncheck `Talk Setup`, `Recording Setup`, `Transcriber Setup`. Press Start.

Expected:
- `Deploy Workspace`, `Office Stack`, `MCP`, `Post-Setup` run normally.
- The 3 unchecked steps appear in the tracker as skipped (`⊘`) and the runner advances through them in milliseconds without spawning a task.
- Total wall-clock is meaningfully shorter than Step 1's baseline (no Nextcloud rollout-status waits from talk/recording/transcriber).
- The dashboard log pane shows NO `[Dashboard] Starting: task workspace:talk-setup` (or recording / transcriber) lines.

- [ ] **Step 3: Per-ENV isolation — final check**

Switch ENV to `mentolder`. Confirm: all steps active (independent state). Switch back to `dev`. Confirm the 3 unchecked steps are still unchecked.

- [ ] **Step 4: Commit any small fixes discovered, then close out**

If verification surfaced no issues, no further commit is needed. Otherwise, fix inline and commit:
```bash
git add dashboard/public/index.html
git commit -m "fix(dashboard): <specific issue found in smoke test>"
```

---

## Out of Scope (intentionally not in this plan)

- Skip-set presets ("Iterating on website" / "Full bring-up").
- Keyboard shortcut for toggling.
- Skip support for non-pipeline `GROUPS` sections.
- Any change to `Taskfile.yml` or `dashboard/server.js`.
- Automated tests for the dashboard (no test framework exists; out of scope per spec).
