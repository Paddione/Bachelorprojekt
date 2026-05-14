# Dashboard Pipeline — Per-Step Skip Toggle

**Status:** Draft
**Date:** 2026-04-28
**Scope:** `dashboard/public/index.html` only (no server changes)

## Problem

`task workspace:up` runs a fixed 7-step pipeline (`workspace:deploy` → `office:deploy` → `mcp:deploy` → `post-setup` → `talk-setup` → `recording-setup` → `transcriber-setup`). Several steps each wait on a Nextcloud rollout (`kubectl rollout status deployment/nextcloud --timeout=300s`) and run `occ` commands serially. When iterating on something unrelated (website, brett, a config tweak) the user still pays the full Nextcloud-wait cost on every run.

The pipeline runner in `dashboard/public/index.html` already supports skipping (`pipeline.skipped` Set, advance loop at line 1032), but there is no UI to populate that set *before* a run. The only existing escape hatch is the in-flight per-step countdown bar.

## Goal

Let the user mark individual pipeline steps as **inactive** in the sidebar before pressing Start. Inactive steps are visually distinct ("glow") and are skipped automatically when the runner reaches them. Toggle state persists across reloads and is **scoped per ENV** (dev / mentolder / korczewski each remember their own skip set).

## Non-Goals

- No changes to `Taskfile.yml` or `dashboard/server.js`. The `workspace:up` go-task target itself is untouched — this only affects the dashboard's pipeline orchestrator.
- No skip support for the non-pipeline `GROUPS` sections (those are single-task buttons, not a sequenced pipeline).
- No "skip-set presets" ("Iterating on website" / "Full bring-up" templates). Out of scope; revisit if the manual toggle proves tedious.
- No keyboard shortcut for toggling. Mouse only.

## Design

### UI — checkbox on each pipeline-step row

Each row inside the **Full Deploy Pipeline** sidebar section gets a 16×16 custom checkbox to the left of the existing numbered dot. Default state: checked (active).

- **Click on checkbox**: toggles active/inactive. Does NOT trigger `startPipelineFrom(i)`.
- **Click anywhere else on row**: existing behavior — `startPipelineFrom(i)`. Inactive rows still allow this; explicit click is treated as "run this one anyway" intent.
- **Hover affordance**: checkbox shows a subtle border highlight so it's discoverable.

The existing row-click handler (`row.addEventListener('click', ...)` at index.html:757) gets a guard: if the click target is the checkbox or its label, do nothing — the checkbox's own handler runs instead.

### "Glow" visual for inactive rows

An inactive (`.pipeline-step.inactive`) row gets:

1. **Pulsing box-shadow** in the section accent color (`--accent` for the pipeline section is `ACCENTS.workspace` = `#3ec9a7`, the cyan-green already used for the section header). Animation: `pulse 2s ease-in-out infinite`, `box-shadow: 0 0 8px var(--accent), inset 0 0 0 1px var(--accent)` peaking, fading to `0 0 2px var(--accent)`.
2. **Reduced opacity** on `.ps-name` and `.ps-cmd` (~0.55) so the glow is the dominant signal.
3. **Hollow numbered dot**: `.ps-dot` becomes border-only (transparent fill, accent border), distinguishing it from `pending` (filled grey) / `running` / `done` states.

The pulse + opacity combo reads as "parked, but alive" — a standby light, not a dead/disabled control.

### Persistence — per-ENV in localStorage

Storage key: `dashboard.pipeline.skipped.<ENV>` where `<ENV>` is the active env (`dev` / `mentolder` / `korczewski`), read from the existing ENV selector state.

Value: JSON array of step **`cmd` strings** (e.g. `["workspace:talk-setup","workspace:recording-setup"]`). Storing `cmd` rather than index makes the state robust to future reordering of `PIPELINE_STEPS`.

On page load:
1. Read active ENV from existing ENV state.
2. Hydrate skip set from `localStorage[dashboard.pipeline.skipped.<ENV>]`.
3. Render checkboxes accordingly.

On ENV change:
- Re-hydrate from the new ENV's storage key. Each env has independent toggles.

On checkbox toggle:
- Update in-memory set and immediately write back to localStorage for the active ENV.

### Reset control

Tiny "↺ reset" link beside the section count in the header. Clears the skip set for the active ENV only (not all envs). No confirmation prompt — toggling back is one click anyway.

### Runner wiring

Two entry points need to seed `pipeline.skipped` from the unchecked set:

1. **`startPipeline()`** (index.html:1036) — at the start, before `runTask(...)`, do:
   ```js
   pipeline.skipped = new Set(
       PIPELINE_STEPS
           .map((s, i) => [s, i])
           .filter(([s]) => skippedCmds.has(s.cmd))
           .map(([, i]) => i)
   );
   // If the first step is skipped, advance.
   let start = 0;
   while (start < PIPELINE_STEPS.length && pipeline.skipped.has(start)) start++;
   if (start >= PIPELINE_STEPS.length) { /* show "All steps inactive" toast, abort */ return; }
   pipeline.current = start;
   runTask(PIPELINE_STEPS[start].cmd, []);
   ```
2. **`startPipelineFrom(i)`** (index.html:1047) — same seeding, but the user-clicked `i` is **never** added to `pipeline.skipped` even if it's marked inactive (explicit click overrides). Advance from `i` if subsequent steps are skipped.

The existing advance loop in the `task-finished` handler (index.html:1032) already handles mid-run skipping; no change needed there.

### Tracker panel

The right-hand tracker panel (`#tracker-steps`) currently renders every step with `pending` / `running` / `done` states. Add a fourth state: **`skipped`**.

- Rendering: muted grey dot (no fill, dashed border), label suffix `" (skipped)"`, no progress connector animation.
- The reset between runs (index.html:1081-1082) clears the `skipped` class along with the others so the next run re-evaluates from the current checkbox state.

### Edge cases

| Case | Behavior |
|------|----------|
| All 7 steps unchecked, user clicks **Start Full Pipeline** | Button is disabled with `title="All steps inactive"`. Tooltip on hover explains. |
| User clicks an inactive row directly (`startPipelineFrom`) | That step runs (override), subsequent inactive steps are still skipped. |
| Pipeline running, user toggles a checkbox | Toggle updates localStorage and visual state. Does NOT affect the in-flight run (snapshot was taken at start). Effect kicks in on next run. |
| ENV changes mid-pipeline | Disallowed by existing dashboard behavior; no new handling needed. |
| Step `cmd` removed from `PIPELINE_STEPS` in a future change | Stale `cmd` in localStorage is silently ignored on hydrate (filter against current `PIPELINE_STEPS`). Self-healing. |
| First-time user (no localStorage) | All steps active by default. |

## Files Touched

- `dashboard/public/index.html` — only file changed. Touches:
  - CSS block (~line 351 `.pipeline-step` rules): add `.inactive` styles, `@keyframes pulse`, checkbox styles.
  - `buildPipelineSection` IIFE (~line 692): add checkbox element per row, reset link in header, click-target guard.
  - `startPipeline` / `startPipelineFrom` (~line 1036/1047): seed `pipeline.skipped` from unchecked set, disable Start when all unchecked.
  - Tracker rendering (~line 977): handle `skipped` state.
  - New small helpers: `loadSkipSet(env)`, `saveSkipSet(env, set)`, `getActiveEnv()` (or reuse existing accessor if present).
  - Hook into existing ENV-change handler to re-hydrate.

## Testing

- Manual smoke test in dashboard: toggle steps, reload page (state persists), switch ENV (state is independent), start pipeline (skipped steps advance without running), click an inactive row directly (it runs).
- No automated tests added — dashboard has no test suite today, and adding one is out of scope for this slice.

## Open Questions

None — all clarifications resolved during brainstorming.
