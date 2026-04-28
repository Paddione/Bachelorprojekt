# Dashboard Redesign — Design Spec
**Date:** 2026-04-28  
**Status:** Approved

## Overview

Overhaul the local task-execution dashboard (`dashboard/public/index.html` + `dashboard/server.js`) with four improvements:

1. **Ordered deploy pipeline** with autorun and skip
2. **Step tracker panel** in the main area (Option B design)
3. **From Scratch group** for one-time bootstrap tasks
4. **Danger Zone** with explicit when-to-use guidance
5. **Dry-run toggle** in the topbar (global, per-session)

---

## 1. Deploy Pipeline (sidebar + main panel)

### Sidebar — "🚀 Full Deploy Pipeline" group

A new section at the top of `#sidebar-scroll` (before all other groups) listing the **7 steps in deployment order**, each with a status dot:

| # | Task | Command |
|---|------|---------|
| 1 | Deploy Workspace | `workspace:deploy` |
| 2 | Deploy Office Stack | `workspace:office:deploy` |
| 3 | Deploy MCP | `mcp:deploy` |
| 4 | Post-Setup | `workspace:post-setup` |
| 5 | Talk Setup | `workspace:talk-setup` |
| 6 | Recording Setup | `workspace:recording-setup` |
| 7 | Transcriber Setup | `workspace:transcriber-setup` |

Clicking "▶ Start Pipeline" at the top of the section launches step 1 and activates pipeline mode. Individual steps can still be clicked to run in isolation (resets pipeline from that step).

Status dots: `●` green = done, `▶` amber animated = running, `○` grey = pending, `⊘` dashed = skipped.

### Main area — Step Tracker Panel (`#tracker-panel`)

Appears between the topbar and terminal when pipeline mode is active (hidden otherwise). Contains:

**Dot row** — horizontal scrollable row of 7 step dots with labels (same states as sidebar). A connecting line between dots turns green once the step is done.

**Countdown bar** — shown after a step finishes successfully:
```
✓ mcp:deploy succeeded — autoruns next: workspace:post-setup in 5 s   [Skip →]  [✗ Abort]
```
- Countdown ticks down from 5 s. When it hits 0, the next step runs automatically with the same ENV.
- **[Skip →]** — cancels countdown, marks the upcoming step as ⊘ skipped (does not run it), and starts a new 5 s countdown for the step after that. If the user wants to run the upcoming step immediately without waiting, they can click it directly in the sidebar pipeline list.
- **[✗ Abort]** — cancels the sequence entirely; pipeline mode exits; tracker panel hides.

If a step **fails** (non-zero exit code), autorun stops. The countdown bar shows an error state instead:
```
✗ mcp:deploy failed (code 1) — pipeline paused.   [Retry]  [Skip →]  [✗ Abort]
```

### Pipeline state (frontend JS)

```js
const pipeline = {
  active: false,
  steps: ['workspace:deploy', 'workspace:office:deploy', 'mcp:deploy',
          'workspace:post-setup', 'workspace:talk-setup',
          'workspace:recording-setup', 'workspace:transcriber-setup'],
  current: 0,          // index of running/next step
  skipped: new Set(),  // indices of skipped steps
  countdownTimer: null,
};
```

When `task-finished` fires: if `pipeline.active && code === 0`, start countdown for `pipeline.current + 1` (skipping any indices in `pipeline.skipped`). If `pipeline.current` was the last step, show "Pipeline complete ✓" and exit pipeline mode.

---

## 2. Dry-Run Toggle

**Location:** Topbar, left of the Stop button.

**Button states:**
- Off: `📋 DRY RUN` (dim, bg `#1e3050`)
- On: `📋 DRY RUN [ON]` (blue highlight, bg `#1a3860`)

**Behavior:**
- When ON, `DRY_RUN=true` is added to the `envVars` object sent via `run-task`.
- The terminal header shows `[ENV=dev, DRY_RUN=true]` to make it visible.
- Server adds `DRY_RUN=true` to `safeEnv` when present (new validation rule in `isArgSafe`-equivalent for envVars).
- Tasks that support dry-run (kubectl-heavy ones) will pass `--dry-run=client`; others will log a `⚠ DRY_RUN not supported for this task` warning but still run normally.
- DRY_RUN state persists across tasks in the session (it's a mode, not per-task).

**Server changes (`server.js`):**
```js
if (envVars?.DRY_RUN === 'true') safeEnv.DRY_RUN = 'true';
```

---

## 3. From Scratch Group (`🧱 From Scratch`)

**Purpose:** One-time bootstrap tasks for a brand-new cluster. Collapsed by default. Styled purple (`#7c6af5`).

**Header note** (visible when expanded, inside a framed box):
> ⚠ Run these only once on a brand-new cluster.  
> Prerequisites: Docker, k3d, kubectl, kubeseal, and `task` must be installed locally.  
> **Do not run on an existing cluster** — re-generating or re-sealing secrets on a live cluster will break running services until redeployed.

**Tasks (in order):**

| # | Title | Command | Note |
|---|-------|---------|------|
| 1 | Create Dev Cluster | `cluster:create` | Dev only — use `ha:setup` for prod |
| 2 | Install Sealed Secrets | `sealed-secrets:install` | Required before env:seal works |
| 3 | Fetch Sealing Cert | `env:fetch-cert` | Downloads cluster public key |
| 4 | Generate Secrets | `env:generate` | Creates `.secrets/<ENV>.yaml` |
| 5 | Seal Secrets | `env:seal` | Encrypts + commits to git |

Each task has the standard dry-run icon (📋) next to the run button.

`env:generate` and `env:seal` keep their `dangerous: true` flag (confirmation modal) because re-running them on an existing live cluster is destructive.

---

## 4. Danger Zone — Improved Guidance

The existing `⚠️ Danger Zone` group gets expanded guidance text inside the red-bordered box.

**Use-when / never-use text (rendered above the task cards):**

```
These tasks permanently destroy data or infrastructure. They cannot be undone.
Always run workspace:backup first and verify the backup timestamp.

✅ Use when:
  • Deliberate teardown of a dev cluster
  • Migrating to a new cluster (after verifying backup)
  • Full reset after an unrecoverable failed deploy

❌ Never use when:
  • ENV is set to mentolder or korczewski (production)
  • You haven't taken a backup in the last 24 h
  • Any doubt — ask first
```

The production ENV banner already warns when `ENV != dev`; the Danger Zone text reinforces this.

All three tasks (`workspace:teardown`, `cluster:delete`, `down`) keep their confirmation modal.

---

## 5. Group Reorganisation

The GROUPS array in `index.html` is reordered:

1. 🚀 Full Deploy Pipeline *(new — top)*
2. ⚙️ Cluster *(existing — cluster:create stays here AND appears in From Scratch; duplication is intentional)*
3. 🌐 Website *(existing)*
4. 🔧 Post-Deploy *(existing — individual tasks remain for re-running single steps)*
5. ♾️ ArgoCD *(existing)*
6. 📊 Daily Operations *(existing)*
7. 🤖 MCP / Claude Code *(existing)*
8. 👥 User & Data *(existing)*
9. 💾 Backup & Restore *(existing)*
10. 🧪 Testing *(existing)*
11. 🔑 Environment & Secrets *(existing — env:generate and env:seal also remain here for re-sealing use case)*
12. 🧱 From Scratch *(new — collapsed)*
13. ⚠️ Danger Zone *(existing — collapsed, improved text)*

---

## 6. Files Changed

| File | Changes |
|------|---------|
| `dashboard/public/index.html` | Pipeline group, tracker panel, dry-run toggle, from-scratch group, danger zone text, GROUPS reorder |
| `dashboard/server.js` | Allow `DRY_RUN=true` in envVars passthrough |

No new files. No backend task changes in this iteration (DRY_RUN support in Taskfile is a follow-up).

---

## Out of Scope

- Mobile / responsive layout
- Persisting pipeline state across page reload
- User-configurable pipeline step order
- DRY_RUN implementation inside Taskfile tasks (tracked separately)
