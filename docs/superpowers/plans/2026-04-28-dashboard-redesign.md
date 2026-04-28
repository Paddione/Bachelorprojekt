# Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overhaul the local task dashboard with an ordered deploy pipeline + autorun/skip, step tracker panel, dry-run toggle, from-scratch group, and improved danger zone guidance.

**Architecture:** All changes live in two files: `dashboard/public/index.html` (styles + HTML shell + JS logic) and `dashboard/server.js` (backend env var passthrough). The JS remains a single IIFE; new pipeline state is a plain object inside that IIFE. No build step, no dependencies added.

**Tech Stack:** Vanilla JS, Socket.IO, Node.js/Express, HTML/CSS — no framework, no bundler.

**Security note:** The JS in this file uses `innerHTML` only for hardcoded template strings (zero user-controlled content). All user inputs (service names, timestamps, restore targets) are handled through dedicated input elements whose values are always passed via `textContent` or sent directly as Socket.IO message data — never interpolated into HTML. This matches the pattern already in the existing codebase.

---

## File Map

| File | What changes |
|------|-------------|
| `dashboard/server.js` | Add `DRY_RUN` and new commands (`sealed-secrets:install`, `env:fetch-cert`) to allowlists |
| `dashboard/public/index.html` | CSS additions, HTML tracker panel + dry-run button, GROUPS/data restructure, pipeline JS logic |

The HTML file is edited in logical slices — CSS first, then HTML, then JS data, then JS behaviour. Each task is independently committable.

---

## Task 1: Server — allow new commands and DRY_RUN env var

**Files:**
- Modify: `dashboard/server.js:16-33` (ALLOWED_COMMANDS), `dashboard/server.js:79-82` (safeEnv block)

- [ ] **Step 1: Add missing commands to ALLOWED_COMMANDS**

In `server.js`, replace the existing `ALLOWED_COMMANDS` block (lines 16-33) with:

```js
const ALLOWED_COMMANDS = new Set([
  'hooks:install',
  'env:validate:all', 'env:init', 'env:validate', 'env:show', 'env:generate', 'env:seal',
  'env:fetch-cert',
  'cluster:create', 'cluster:start', 'cluster:stop', 'cluster:status', 'cluster:delete',
  'ha:status',
  'sealed-secrets:install', 'sealed-secrets:status',
  'up', 'down',
  'workspace:preflight', 'workspace:validate', 'workspace:up',
  'workspace:deploy', 'workspace:status', 'workspace:office:deploy',
  'workspace:post-setup', 'workspace:talk-setup', 'keycloak:sync',
  'workspace:recording-setup', 'workspace:transcriber-setup', 'workspace:whiteboard-setup',
  'workspace:logs', 'workspace:restart', 'workspace:check-connectivity',
  'workspace:backup', 'workspace:backup:list', 'workspace:restore',
  'workspace:teardown',
  'workspace:create-guest', 'workspace:import-users', 'workspace:migrate',
  'argocd:setup', 'argocd:status', 'argocd:apps:apply',
  'mcp:deploy', 'mcp:status', 'claude-code:setup',
  'website:deploy', 'website:build', 'website:status', 'website:dev',
  'test:all', 'test:unit', 'test:manifests',
]);
```

- [ ] **Step 2: Pass DRY_RUN through to the child process**

Find the safeEnv block (around line 79):

```js
    const safeEnv = { ...process.env };
    if (typeof envVars?.ENV === 'string' && VALID_ENV.test(envVars.ENV)) {
      safeEnv.ENV = envVars.ENV;
    }
```

Replace with:

```js
    const safeEnv = { ...process.env };
    if (typeof envVars?.ENV === 'string' && VALID_ENV.test(envVars.ENV)) {
      safeEnv.ENV = envVars.ENV;
    }
    if (envVars?.DRY_RUN === 'true') {
      safeEnv.DRY_RUN = 'true';
    }
```

- [ ] **Step 3: Verify server starts cleanly**

```bash
cd dashboard && node server.js &
# Expected output: "Dashboard running at http://localhost:3000"
kill %1
```

- [ ] **Step 4: Commit**

```bash
git add dashboard/server.js
git commit -m "feat(dashboard): allow sealed-secrets/env:fetch-cert commands and DRY_RUN env passthrough"
```

---

## Task 2: CSS — tracker panel, dry-run button, from-scratch zone, danger-zone text

**Files:**
- Modify: `dashboard/public/index.html` — inside the `<style>` block

- [ ] **Step 1: Append new CSS rules inside the `<style>` block**

After the closing brace of `#modal-confirm:hover { filter: brightness(1.15); }` and before `</style>`, insert:

```css
        /* ── Dry-run toggle ─────────────────────────────────── */
        #dryrun-btn {
            background: #1e3050; color: #6ab0e0; border: 1px solid #2a5080;
            padding: 4px 12px; border-radius: var(--radius); font-size: 12px;
            cursor: pointer; display: flex; align-items: center; gap: 5px;
            white-space: nowrap;
        }
        #dryrun-btn.active { background: #1a3860; color: #80d0ff; border-color: var(--primary); }
        #dryrun-badge {
            font-size: 9px; background: var(--primary); color: #000;
            padding: 1px 4px; border-radius: 3px; font-weight: 700; display: none;
        }
        #dryrun-btn.active #dryrun-badge { display: inline; }

        /* ── Step tracker panel ──────────────────────────────── */
        #tracker-panel {
            background: var(--bg2); border-bottom: 1px solid var(--border);
            flex-shrink: 0; display: none;
        }
        #tracker-panel.visible { display: block; }
        #tracker-header {
            display: flex; align-items: center; gap: 10px;
            padding: 7px 16px 4px; font-size: 11px;
        }
        .tracker-title { font-weight: 600; color: var(--text); }
        .tracker-sub   { color: var(--text-dim); font-size: 10px; }
        #tracker-steps {
            display: flex; padding: 0 12px 8px; overflow-x: auto; scrollbar-width: none;
        }
        #tracker-steps::-webkit-scrollbar { display: none; }
        .t-step {
            display: flex; flex-direction: column; align-items: center;
            min-width: 72px; padding: 4px; position: relative; cursor: pointer;
        }
        .t-step:not(:last-child)::after {
            content: ''; position: absolute; top: 11px;
            left: calc(50% + 12px); width: calc(100% - 24px); height: 1px;
            background: var(--border);
        }
        .t-step.done:not(:last-child)::after { background: var(--success); }
        .t-dot {
            width: 20px; height: 20px; border-radius: 50%; flex-shrink: 0;
            display: flex; align-items: center; justify-content: center;
            font-size: 9px; font-weight: 700; margin-bottom: 3px;
        }
        .t-dot-done { background: var(--success); color: #000; }
        .t-dot-run  { background: var(--warn); color: #000;
                      animation: tdpulse .8s ease-in-out infinite alternate; }
        .t-dot-pend { background: var(--bg4); color: var(--text-dim);
                      border: 1px solid var(--border); }
        .t-dot-skip { background: var(--bg3); color: var(--text-dim);
                      border: 1px dashed #555; }
        @keyframes tdpulse { from { opacity:.6; } to { opacity:1; } }
        .t-label {
            font-size: 9px; color: var(--text-mid); text-align: center;
            line-height: 1.3; white-space: nowrap;
        }
        .t-label.running { color: var(--warn); font-weight: 600; }
        .t-label.done    { color: var(--success); }
        .t-label.skipped { color: var(--text-dim); text-decoration: line-through; }
        #countdown-bar {
            display: none; margin: 0 16px 8px; padding: 6px 12px;
            border-radius: var(--radius); align-items: center; gap: 10px; font-size: 11px;
        }
        #countdown-bar.success {
            display: flex; background: #1a2a10; border: 1px solid #3a5020;
        }
        #countdown-bar.failure {
            display: flex; background: var(--danger-dim); border: 1px solid var(--danger-border);
        }
        #cd-text { flex: 1; }
        #countdown-bar.success #cd-text { color: #8dd06a; }
        #countdown-bar.failure #cd-text { color: #e07070; }
        .cd-next { font-weight: 600; color: #b0e080; }
        .cd-btn {
            padding: 3px 10px; border-radius: var(--radius);
            font-size: 10px; cursor: pointer; border: 1px solid; white-space: nowrap;
        }
        #cd-skip  { background: #2a3a1a; color: #8dd06a; border-color: #3a5020; }
        #cd-skip:hover  { background: #3a4a2a; }
        #cd-retry { background: var(--primary-dim); color: var(--primary); border-color: #2a5080; }
        #cd-retry:hover { background: #2a4a62; }
        #cd-abort { background: var(--danger-dim); color: #e07070; border-color: var(--danger-border); }
        #cd-abort:hover { background: #3a1515; }

        /* ── Sidebar pipeline steps ───────────────────────────── */
        .pipeline-step {
            display: flex; align-items: center; gap: 8px;
            padding: 5px 8px; border-radius: var(--radius);
            margin-bottom: 2px; font-size: 11px; cursor: pointer;
        }
        .pipeline-step:hover { background: var(--bg3); }
        .ps-dot {
            width: 14px; height: 14px; border-radius: 50%; flex-shrink: 0;
            display: flex; align-items: center; justify-content: center;
            font-size: 8px; font-weight: 700;
        }
        .ps-done { background: var(--success); color: #000; }
        .ps-run  { background: var(--warn); color: #000;
                   animation: tdpulse .8s ease-in-out infinite alternate; }
        .ps-pend { background: var(--bg4); color: var(--text-dim); border: 1px solid var(--border); }
        .ps-skip { background: var(--bg3); color: var(--text-dim); border: 1px dashed #555; }
        .ps-info { flex: 1; min-width: 0; }
        .ps-name { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ps-cmd  { font-family: monospace; font-size: 9px; color: var(--text-dim); }
        #pipeline-start-btn {
            width: calc(100% - 20px); margin: 4px 10px 6px;
            background: #1a3a26; color: var(--success); border: 1px solid #2a5a36;
            padding: 5px 10px; border-radius: var(--radius); font-size: 11px;
            font-weight: 600; cursor: pointer; text-align: center; display: block;
        }
        #pipeline-start-btn:hover    { background: #254a30; }
        #pipeline-start-btn:disabled { opacity: 0.4; cursor: not-allowed; }

        /* ── From-scratch zone ────────────────────────────────── */
        .section.scratch-section .section-header { color: #9a8af5; }
        .section.scratch-section.open .section-header { color: #b0a0ff; }
        .section.scratch-section .section-count { background: #1a1630; color: #5a4ab0; }
        .scratch-zone-wrap {
            border: 1px solid #3d3560; background: #1a1630;
            border-radius: var(--radius); padding: 6px; margin: 2px 0;
        }
        .scratch-note {
            font-size: 11px; color: #9a8af5; padding: 4px 6px 4px; line-height: 1.5;
        }
        .scratch-prereq {
            font-size: 10px; color: #a090e0; padding: 0 6px 8px; line-height: 1.5;
        }

        /* ── Danger zone guidance text ────────────────────────── */
        .danger-guidance {
            font-size: 11px; color: #e07070; padding: 4px 6px 2px; line-height: 1.5;
        }
        .danger-when-block {
            font-size: 10px; color: #c05050; padding: 2px 6px 8px; line-height: 1.7;
        }
```

- [ ] **Step 2: Open the dashboard and confirm no visual regressions**

```bash
cd dashboard && node server.js
# Open http://localhost:3000 — existing layout should look identical to before
# DevTools console should show zero errors
```

- [ ] **Step 3: Commit**

```bash
git add dashboard/public/index.html
git commit -m "feat(dashboard): CSS for tracker panel, dry-run toggle, pipeline sidebar, scratch/danger zones"
```

---

## Task 3: HTML — tracker panel and dry-run button

**Files:**
- Modify: `dashboard/public/index.html` — body section

- [ ] **Step 1: Add dry-run toggle button to the topbar**

Find the topbar div (around line 303):

```html
    <div id="topbar">
        <span id="conn-dot" title="Socket connection"></span>
        <span id="status">Connecting…</span>
        <button id="stop-btn" class="ctrl-btn">■ Stop</button>
        <button id="clear-btn" class="ctrl-btn">Clear</button>
    </div>
```

Replace with:

```html
    <div id="topbar">
        <span id="conn-dot" title="Socket connection"></span>
        <span id="status">Connecting…</span>
        <button id="dryrun-btn" title="Toggle dry-run mode — passes DRY_RUN=true to tasks">
            📋 DRY RUN <span id="dryrun-badge">ON</span>
        </button>
        <button id="stop-btn" class="ctrl-btn">■ Stop</button>
        <button id="clear-btn" class="ctrl-btn">Clear</button>
    </div>
```

- [ ] **Step 2: Add tracker panel between topbar and terminal-wrap**

Find `<div id="terminal-wrap">` and insert immediately before it:

```html
    <!-- ── Step tracker panel (visible only during pipeline run) ── -->
    <div id="tracker-panel">
        <div id="tracker-header">
            <span class="tracker-title">Deploy Pipeline</span>
            <span class="tracker-sub" id="tracker-sub">Step 0 of 7</span>
        </div>
        <div id="tracker-steps"></div>
        <div id="countdown-bar">
            <span id="cd-text"></span>
            <button class="cd-btn" id="cd-retry">&#8634; Retry</button>
            <button class="cd-btn" id="cd-skip">Skip &#8594;</button>
            <button class="cd-btn" id="cd-abort">&#10005; Abort</button>
        </div>
    </div>
```

- [ ] **Step 3: Verify HTML loads correctly**

```bash
# Reload http://localhost:3000
# Topbar shows the 📋 DRY RUN button (dim, no badge)
# Tracker panel is invisible (no .visible class)
# DevTools console: zero errors
```

- [ ] **Step 4: Commit**

```bash
git add dashboard/public/index.html
git commit -m "feat(dashboard): add tracker panel and dry-run button HTML"
```

---

## Task 4: JS data — PIPELINE_STEPS, new GROUPS, danger zone annotations

**Files:**
- Modify: `dashboard/public/index.html` — `<script>` block constants section

- [ ] **Step 1: Add PIPELINE_STEPS constant before QUICK_STEPS**

Inside the `<script>` block, immediately after `'use strict';`, insert:

```js
    const PIPELINE_STEPS = [
        { title: 'Deploy Workspace',    cmd: 'workspace:deploy' },
        { title: 'Deploy Office Stack', cmd: 'workspace:office:deploy' },
        { title: 'Deploy MCP',          cmd: 'mcp:deploy' },
        { title: 'Post-Setup',          cmd: 'workspace:post-setup' },
        { title: 'Talk Setup',          cmd: 'workspace:talk-setup' },
        { title: 'Recording Setup',     cmd: 'workspace:recording-setup' },
        { title: 'Transcriber Setup',   cmd: 'workspace:transcriber-setup' },
    ];
```

- [ ] **Step 2: Replace the entire GROUPS constant**

Find the `const GROUPS = [` array (lines ~351-442) and replace with:

```js
    const GROUPS = [
        // pipeline sentinel — rendered separately
        { cat: 'Full Deploy Pipeline', icon: '🚀', accent: ACCENTS.workspace,
          pipeline: true, items: [] },

        { cat: 'Cluster', icon: '⚙️', accent: ACCENTS.cluster, items: [
            { title: 'Create Cluster',  cmd: 'cluster:create', desc: 'Bootstrap a new k3d dev cluster' },
            { title: 'Start Cluster',   cmd: 'cluster:start',  desc: 'Resume a stopped k3d cluster' },
            { title: 'Stop Cluster',    cmd: 'cluster:stop',   desc: 'Pause the running cluster (preserves state)' },
            { title: 'Cluster Status',  cmd: 'cluster:status', desc: 'Show nodes, pods and resource usage' },
            { title: 'HA Status',       cmd: 'ha:status',      desc: 'Show status of the 3-node HA cluster' },
        ]},
        { cat: 'Workspace', icon: '🏗️', accent: ACCENTS.workspace, items: [
            { title: 'Preflight Check',     cmd: 'workspace:preflight',     desc: 'Verify prerequisites before deploying' },
            { title: 'Validate Manifests',  cmd: 'workspace:validate',      desc: 'Dry-run kustomize build + kubeconform' },
            { title: 'Deploy Workspace',    cmd: 'workspace:deploy',        desc: 'Apply all workspace manifests to the selected cluster' },
            { title: 'Deploy Office Stack', cmd: 'workspace:office:deploy', desc: 'Deploy Collabora (run after workspace:deploy)' },
            { title: 'Workspace Status',    cmd: 'workspace:status',        desc: 'Show pods, services, ingress and PVCs' },
        ]},
        { cat: 'Post-Deploy', icon: '🔧', accent: ACCENTS.post, items: [
            { title: 'Post-Setup',        cmd: 'workspace:post-setup',       desc: 'Enable Nextcloud apps (OIDC, Collabora, calendar, contacts)' },
            { title: 'Talk Setup',        cmd: 'workspace:talk-setup',       desc: 'Configure Nextcloud Talk HPB signaling + coturn' },
            { title: 'Recording Setup',   cmd: 'workspace:recording-setup',  desc: 'Configure Talk recording backend' },
            { title: 'Transcriber Setup', cmd: 'workspace:transcriber-setup',desc: 'Set up talk-transcriber bot + Whisper' },
            { title: 'Keycloak Sync',     cmd: 'keycloak:sync',              desc: 'Sync realm config and OIDC clients to Keycloak' },
        ]},
        { cat: 'Website', icon: '🌐', accent: ACCENTS.website, items: [
            { title: 'Build Website',  cmd: 'website:build',  desc: 'Run Astro build for the selected env' },
            { title: 'Deploy Website', cmd: 'website:deploy', desc: 'Build, import and roll out the website pod' },
            { title: 'Website Status', cmd: 'website:status', desc: 'Show website deployment status' },
            { title: 'Dev Server',     cmd: 'website:dev',    desc: 'Start Astro dev server with hot-reload (streams until stopped)' },
        ]},
        { cat: 'ArgoCD', icon: '♾️', accent: ACCENTS.argocd, items: [
            { title: 'ArgoCD Status',    cmd: 'argocd:status',     desc: 'Show sync/health of all apps across all clusters' },
            { title: 'Apply Apps',       cmd: 'argocd:apps:apply', desc: 'Apply AppProject and ApplicationSet manifests' },
            { title: 'Bootstrap ArgoCD', cmd: 'argocd:setup',      desc: 'Full ArgoCD install + cluster registration (run once)',
              dangerous: true, dangerMsg: 'Bootstraps ArgoCD from scratch. Only run on a fresh hub cluster.' },
        ]},
        { cat: 'Daily Operations', icon: '📊', accent: ACCENTS.ops, items: [
            { title: 'Workspace Status',   cmd: 'workspace:status',             desc: 'Quick overview of all pods and services' },
            { title: 'Check Connectivity', cmd: 'workspace:check-connectivity', desc: 'Ping all service endpoints and report health' },
            { title: 'Tail Logs',          cmd: 'workspace:logs',               desc: 'Stream live logs for a service (Stop to exit)',
              argInputs: [{ id: 'arg-logs-svc', placeholder: 'service name  e.g. nextcloud', required: true }] },
            { title: 'Restart Service',    cmd: 'workspace:restart',            desc: 'Rolling restart a deployment',
              argInputs: [{ id: 'arg-restart-svc', placeholder: 'service name  e.g. keycloak', required: true }] },
        ]},
        { cat: 'MCP / Claude Code', icon: '🤖', accent: ACCENTS.mcp, items: [
            { title: 'Deploy MCP',        cmd: 'mcp:deploy',        desc: 'Deploy the MCP monolith pod + auth proxy' },
            { title: 'MCP Status',        cmd: 'mcp:status',        desc: 'Show MCP pod and container status' },
            { title: 'Claude Code Setup', cmd: 'claude-code:setup', desc: 'Generate Claude Code settings.json',
              argInputs: [{ id: 'arg-cc-mode', placeholder: 'cluster  or  business', required: true }] },
        ]},
        { cat: 'User & Data', icon: '👥', accent: ACCENTS.users, items: [
            { title: 'Create Guest User', cmd: 'workspace:create-guest',  desc: 'Add a guest account to Keycloak + Nextcloud' },
            { title: 'Import Users',      cmd: 'workspace:import-users',  desc: 'Bulk-import users from a CSV file' },
            { title: 'Data Migration',    cmd: 'workspace:migrate',       desc: 'Interactive data migration assistant' },
        ]},
        { cat: 'Backup & Restore', icon: '💾', accent: ACCENTS.backup, items: [
            { title: 'Trigger Backup',      cmd: 'workspace:backup',      desc: 'Run an immediate backup of all databases' },
            { title: 'List Backups',        cmd: 'workspace:backup:list', desc: 'Show available backup timestamps' },
            { title: 'Restore from Backup', cmd: 'workspace:restore',     desc: 'Overwrite a database from a backup snapshot',
              dangerous: true, dangerMsg: 'Overwrites the selected database with backup data. This cannot be undone.',
              argInputs: [
                { id: 'arg-restore-db', placeholder: 'keycloak / nextcloud / all', required: true },
                { id: 'arg-restore-ts', placeholder: 'timestamp from List Backups', required: true },
              ] },
        ]},
        { cat: 'Testing', icon: '🧪', accent: ACCENTS.testing, items: [
            { title: 'Unit Tests',        cmd: 'test:unit',      desc: 'Run BATS unit tests (assertion lib, scripts, configs)' },
            { title: 'Manifest Tests',    cmd: 'test:manifests', desc: 'Validate kustomize output structure (no cluster needed)' },
            { title: 'All Offline Tests', cmd: 'test:all',       desc: 'Unit + manifests + dry-run' },
        ]},
        { cat: 'Environment & Secrets', icon: '🔑', accent: ACCENTS.env, items: [
            { title: 'Validate All Envs', cmd: 'env:validate:all', desc: 'Check all environment files against the schema' },
            { title: 'Init New Env',      cmd: 'env:init',         desc: 'Scaffold a new environments/<ENV>.yaml from the schema' },
            { title: 'Validate Env',      cmd: 'env:validate',     desc: 'Validate the selected environment file' },
            { title: 'Show Env Config',   cmd: 'env:show',         desc: 'Print the resolved config for the selected env' },
            { title: 'Generate Secrets',  cmd: 'env:generate',     desc: 'Generate fresh random secrets into .secrets/<ENV>.yaml',
              dangerous: true, dangerMsg: 'Generates new random secrets. Running services will break until redeployed with the new secrets.' },
            { title: 'Seal Secrets',      cmd: 'env:seal',         desc: 'Encrypt plaintext secrets into a SealedSecret and commit to git',
              dangerous: true, dangerMsg: 'Encrypts and commits secrets for the selected environment. Make sure the secrets file is correct first.' },
        ]},

        // First-time bootstrap — collapsed by default
        { cat: 'From Scratch (First-Time Only)', icon: '🧱', accent: '#7c6af5',
          scratchZone: true, collapsed: true, items: [
            { title: '1. Create Dev Cluster',
              cmd: 'cluster:create',
              desc: 'Bootstrap k3d dev cluster. Skip for prod — use ha:setup on Hetzner nodes instead.' },
            { title: '2. Install Sealed Secrets',
              cmd: 'sealed-secrets:install',
              desc: 'Install Bitnami Sealed Secrets controller via Helm. Required before env:seal will work.' },
            { title: '3. Fetch Sealing Cert',
              cmd: 'env:fetch-cert',
              desc: 'Download the cluster public key into environments/certs/. Run after Sealed Secrets is installed.' },
            { title: '4. Generate Secrets',
              cmd: 'env:generate',
              desc: 'Generate fresh random passwords into .secrets/<ENV>.yaml. Run once per new env, then seal immediately.',
              dangerous: true,
              dangerMsg: 'Generates new random secrets. Any running deployment using old secrets will break until redeployed.' },
            { title: '5. Seal Secrets',
              cmd: 'env:seal',
              desc: 'Encrypt .secrets/<ENV>.yaml into a SealedSecret committed to git. Must be done before workspace:deploy.',
              dangerous: true,
              dangerMsg: 'Encrypts and commits secrets for the selected environment. Make sure the secrets file is correct first.' },
        ]},

        // Destructive operations — collapsed, with when/never guidance
        { cat: '⚠️  Danger Zone', icon: '', accent: '#c0392b',
          dangerZone: true, collapsed: true,
          useWhen: [
              'Deliberate teardown of a dev cluster',
              'Migrating to a new cluster (only after verifying a recent backup)',
              'Full reset after an unrecoverable failed deploy on dev',
          ],
          neverWhen: [
              'ENV is set to mentolder or korczewski (production)',
              'No backup taken in the last 24 h',
              'Any doubt — ask first',
          ],
          items: [
            { title: 'Teardown Workspace', cmd: 'workspace:teardown', dangerous: true,
              desc: 'Delete workspace namespace + all data. Use to wipe dev or start fresh. Never on prod without a verified backup.',
              dangerMsg: 'Deletes the entire workspace namespace and ALL its data. Cannot be undone.' },
            { title: 'Delete Cluster',     cmd: 'cluster:delete',     dangerous: true,
              desc: 'Destroy the k3d cluster entirely. Dev only — never on prod Hetzner nodes. All PVCs and configs are lost.',
              dangerMsg: 'Destroys the k3d cluster and every resource inside it. Cannot be undone.' },
            { title: 'Nuke Everything',    cmd: 'down',                dangerous: true,
              desc: 'Teardown workspace + delete cluster in one go. Dev only. Total reset.',
              dangerMsg: 'Tears down the workspace AND deletes the cluster. Total reset. Cannot be undone.' },
        ]},
    ];
```

- [ ] **Step 3: Verify page loads without JS errors**

```bash
# Reload http://localhost:3000
# DevTools console: zero errors
# Sidebar renders all groups (pipeline section empty until Task 5)
```

- [ ] **Step 4: Commit**

```bash
git add dashboard/public/index.html
git commit -m "feat(dashboard): restructure GROUPS data with pipeline sentinel, from-scratch, danger zone annotations"
```

---

## Task 5: JS — render pipeline section and updated group rendering

**Files:**
- Modify: `dashboard/public/index.html` — the section-building JS block

- [ ] **Step 1: Add pipeline section renderer before GROUPS.forEach**

Find `const sectionsEl = document.getElementById('task-sections');` and insert this block immediately after it:

```js
    // ── Build pipeline sidebar section ─────────────────────────────────────
    (function buildPipelineSection() {
        const section = document.createElement('div');
        section.className = 'section open';
        section.id = 'pipeline-section';

        const header = document.createElement('div');
        header.className = 'section-header';

        const iconEl = document.createElement('span');
        iconEl.className = 'section-icon';
        iconEl.textContent = '🚀';

        const nameEl = document.createElement('span');
        nameEl.className = 'section-name';
        nameEl.textContent = 'Full Deploy Pipeline';

        const countEl = document.createElement('span');
        countEl.className = 'section-count';
        countEl.textContent = String(PIPELINE_STEPS.length);

        const chevron = document.createElement('span');
        chevron.className = 'section-chevron';
        chevron.textContent = '▶';

        header.appendChild(iconEl);
        header.appendChild(nameEl);
        header.appendChild(countEl);
        header.appendChild(chevron);
        header.addEventListener('click', () => section.classList.toggle('open'));
        section.appendChild(header);

        const body = document.createElement('div');
        body.className = 'section-body';

        const startBtn = document.createElement('button');
        startBtn.id = 'pipeline-start-btn';
        startBtn.textContent = '▶ Start Full Pipeline';
        startBtn.addEventListener('click', () => startPipeline());
        body.appendChild(startBtn);

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

        section.appendChild(body);
        sectionsEl.appendChild(section);
    }());
```

- [ ] **Step 2: Replace the entire GROUPS.forEach block**

Find `GROUPS.forEach((group) => {` and replace the entire block (through its closing `});`) with:

```js
    GROUPS.forEach((group) => {
        if (group.pipeline) return; // rendered by buildPipelineSection above

        const section = document.createElement('div');
        section.className = 'section'
            + (group.dangerZone  ? ' danger-section'  : '')
            + (group.scratchZone ? ' scratch-section' : '');
        if (!group.collapsed) section.classList.add('open');

        // Header
        const header = document.createElement('div');
        header.className = 'section-header';

        const iconEl = document.createElement('span');
        iconEl.className = 'section-icon';
        iconEl.textContent = group.icon;

        const nameEl = document.createElement('span');
        nameEl.className = 'section-name';
        nameEl.textContent = group.cat;

        const chevron = document.createElement('span');
        chevron.className = 'section-chevron';
        chevron.textContent = '▶';

        const countEl = document.createElement('span');
        countEl.className = 'section-count';
        countEl.textContent = String(group.items.length);

        header.appendChild(iconEl);
        header.appendChild(nameEl);
        header.appendChild(countEl);
        header.appendChild(chevron);
        header.addEventListener('click', () => section.classList.toggle('open'));
        section.appendChild(header);

        const body = document.createElement('div');
        body.className = 'section-body';

        // Determine inner wrapper
        let wrap = body;
        if (group.dangerZone) {
            const box = document.createElement('div');
            box.className = 'danger-zone-wrap';

            const guide = document.createElement('p');
            guide.className = 'danger-guidance';
            guide.textContent = 'These tasks permanently destroy data or infrastructure.'
                + ' Always run workspace:backup first and verify the timestamp.';
            box.appendChild(guide);

            const whenBlock = document.createElement('div');
            whenBlock.className = 'danger-when-block';
            const useLines = group.useWhen.map((s) => '✅ ' + s).join('\n');
            const neverLines = group.neverWhen.map((s) => '❌ ' + s).join('\n');
            whenBlock.textContent = useLines + '\n\n' + neverLines;
            box.appendChild(whenBlock);

            wrap = box;
        } else if (group.scratchZone) {
            const box = document.createElement('div');
            box.className = 'scratch-zone-wrap';

            const note = document.createElement('p');
            note.className = 'scratch-note';
            note.textContent = '⚠ Run these only once on a brand-new cluster.';
            box.appendChild(note);

            const pre = document.createElement('p');
            pre.className = 'scratch-prereq';
            pre.textContent = 'Prerequisites: Docker, k3d, kubectl, kubeseal, and task must be installed locally.'
                + '\nDo NOT run on an existing cluster — re-generating or re-sealing secrets on a live'
                + ' cluster breaks running services until redeployed.';
            box.appendChild(pre);

            wrap = box;
        }

        group.items.forEach((item) => {
            const card = document.createElement('div');
            card.className = 'task-card' + (item.dangerous ? ' dangerous' : '');

            const top = document.createElement('div');
            top.className = 'task-card-top';

            const accentBar = document.createElement('div');
            accentBar.className = 'task-accent';
            accentBar.style.background = item.dangerous ? '#c0392b' : group.accent;

            const info = document.createElement('div');
            info.className = 'task-info';

            const titleEl = document.createElement('div');
            titleEl.className = 'task-title';
            titleEl.textContent = item.title;

            const cmdEl = document.createElement('div');
            cmdEl.className = 'task-cmd';
            cmdEl.textContent = 'task ' + item.cmd;

            info.appendChild(titleEl);
            info.appendChild(cmdEl);
            top.appendChild(accentBar);
            top.appendChild(info);

            if (item.dangerous) {
                const tag = document.createElement('span');
                tag.className = 'task-danger-tag';
                tag.textContent = 'DESTRUCTIVE';
                top.appendChild(tag);
            }
            card.appendChild(top);

            if (item.desc) {
                const descEl = document.createElement('div');
                descEl.className = 'task-desc';
                descEl.textContent = item.desc;
                card.appendChild(descEl);
            }

            if (item.argInputs && item.argInputs.length > 0) {
                const argRow = document.createElement('div');
                argRow.className = 'task-arg-row';

                const inputEls = item.argInputs.map((def) => {
                    const inp = document.createElement('input');
                    inp.type = 'text';
                    inp.className = 'arg-input';
                    inp.id = def.id;
                    inp.placeholder = def.placeholder;
                    argRow.appendChild(inp);
                    return { el: inp, required: !!def.required };
                });

                const runBtn = document.createElement('button');
                runBtn.className = 'run-btn' + (item.dangerous ? ' danger' : '');
                runBtn.textContent = 'Run';
                runBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    for (const { el, required } of inputEls) {
                        if (required && !el.value.trim()) {
                            el.classList.add('error');
                            el.focus();
                            setTimeout(() => el.classList.remove('error'), 1500);
                            return;
                        }
                    }
                    const args = ['--', ...inputEls.map(({ el }) => el.value.trim()).filter(Boolean)];
                    item.dangerous ? showModal(item, args) : runTask(item.cmd, args);
                });
                argRow.appendChild(runBtn);
                card.appendChild(argRow);
            } else {
                card.addEventListener('click', () => {
                    item.dangerous ? showModal(item, []) : runTask(item.cmd, []);
                });
            }

            wrap.appendChild(card);
        });

        if (group.dangerZone || group.scratchZone) body.appendChild(wrap);
        section.appendChild(body);
        sectionsEl.appendChild(section);
    });
```

- [ ] **Step 3: Verify in browser**

```bash
# Reload http://localhost:3000
# ✓ Pipeline section at top with 7 numbered steps and ▶ Start Full Pipeline button
# ✓ From Scratch (collapsed, purple) expands to show guidance note + 5 tasks
# ✓ Danger Zone (collapsed, red) expands to show ✅/❌ guidance + 3 DESTRUCTIVE tasks
# ✓ All other groups work as before — existing argInput tasks still functional
```

- [ ] **Step 4: Commit**

```bash
git add dashboard/public/index.html
git commit -m "feat(dashboard): render pipeline sidebar, from-scratch zone, danger zone with when/never guidance"
```

---

## Task 6: JS — dry-run toggle

**Files:**
- Modify: `dashboard/public/index.html` — script IIFE

- [ ] **Step 1: Add dry-run toggle handler after the GROUPS.forEach block**

After the `GROUPS.forEach(...)` closing `});` and before `// ── Confirmation modal`, insert:

```js
    // ── Dry-run toggle ─────────────────────────────────────────────────────
    let dryRunActive = false;
    const dryrunBtn = document.getElementById('dryrun-btn');

    dryrunBtn.addEventListener('click', () => {
        dryRunActive = !dryRunActive;
        dryrunBtn.classList.toggle('active', dryRunActive);
    });
```

- [ ] **Step 2: Include DRY_RUN in runTask**

Find the existing `runTask` function and replace it with:

```js
    function runTask(command, args) {
        if (running) return;
        running = true;
        setButtons(true);
        stopBtn.style.display = 'inline-block';
        statusEl.className = 'running';
        const envLabel = 'ENV=' + envSelect.value + (dryRunActive ? ', DRY_RUN=true' : '');
        statusEl.textContent = 'Running: task ' + command + '  [' + envLabel + ']';
        termLabel.textContent = 'task ' + command + '  [' + envLabel + ']';
        const envVars = { ENV: envSelect.value };
        if (dryRunActive) envVars.DRY_RUN = 'true';
        socket.emit('run-task', { command, args, envVars });
    }
```

- [ ] **Step 3: Verify dry-run toggle**

```bash
# Reload http://localhost:3000
# Click 📋 DRY RUN → button turns blue, badge shows ON
# Click any task → status bar shows [ENV=dev, DRY_RUN=true]
# Click 📋 DRY RUN again → badge hides, back to normal
```

- [ ] **Step 4: Commit**

```bash
git add dashboard/public/index.html
git commit -m "feat(dashboard): dry-run toggle passes DRY_RUN=true env var when active"
```

---

## Task 7: JS — pipeline state, autorun, skip/abort/retry

**Files:**
- Modify: `dashboard/public/index.html` — script IIFE

- [ ] **Step 1: Add pipeline state and tracker functions after the dry-run block**

After the dry-run block and before `// ── Confirmation modal`, insert:

```js
    // ── Pipeline state & tracker panel ────────────────────────────────────
    const pipeline = {
        active:      false,
        current:     0,
        skipped:     new Set(),
        cdTimer:     null,
        cdRemaining: 0,
    };

    const trackerPanel     = document.getElementById('tracker-panel');
    const trackerSub       = document.getElementById('tracker-sub');
    const trackerStepsEl   = document.getElementById('tracker-steps');
    const countdownBar     = document.getElementById('countdown-bar');
    const cdText           = document.getElementById('cd-text');
    const cdSkipBtn        = document.getElementById('cd-skip');
    const cdRetryBtn       = document.getElementById('cd-retry');
    const cdAbortBtn       = document.getElementById('cd-abort');
    const pipelineStartBtn = document.getElementById('pipeline-start-btn');

    function dotStateClass(i) {
        if (pipeline.skipped.has(i))   return 't-dot-skip';
        if (i < pipeline.current)      return 't-dot-done';
        if (i === pipeline.current)    return 't-dot-run';
        return 't-dot-pend';
    }

    function labelStateClass(i) {
        if (pipeline.skipped.has(i))   return 'skipped';
        if (i < pipeline.current)      return 'done';
        if (i === pipeline.current)    return 'running';
        return '';
    }

    function buildTrackerSteps() {
        trackerStepsEl.textContent = '';
        PIPELINE_STEPS.forEach((step, i) => {
            const div = document.createElement('div');
            div.className = 't-step' + (i < pipeline.current && !pipeline.skipped.has(i) ? ' done' : '');
            div.id = 'ts-' + i;

            const dot = document.createElement('div');
            dot.className = 't-dot ' + dotStateClass(i);
            dot.id = 'td-' + i;
            if (pipeline.skipped.has(i))        dot.textContent = '⊘';
            else if (i < pipeline.current)      dot.textContent = '✓';
            else if (i === pipeline.current)    dot.textContent = '▶';
            else                                dot.textContent = String(i + 1);

            const lbl = document.createElement('div');
            lbl.className = 't-label ' + labelStateClass(i);
            lbl.id = 'tl-' + i;
            lbl.textContent = step.cmd.replace('workspace:', '');

            div.appendChild(dot);
            div.appendChild(lbl);
            trackerStepsEl.appendChild(div);
        });
        trackerSub.textContent = 'Step ' + (pipeline.current + 1) + ' of ' + PIPELINE_STEPS.length;
    }

    function updateSidebarDots() {
        PIPELINE_STEPS.forEach((_, i) => {
            const dot = document.getElementById('ps-dot-' + i);
            if (!dot) return;
            if (pipeline.skipped.has(i)) {
                dot.className = 'ps-dot ps-skip';
                dot.textContent = '⊘';
            } else if (i < pipeline.current) {
                dot.className = 'ps-dot ps-done';
                dot.textContent = '✓';
            } else if (i === pipeline.current) {
                dot.className = 'ps-dot ps-run';
                dot.textContent = '▶';
            } else {
                dot.className = 'ps-dot ps-pend';
                dot.textContent = String(i + 1);
            }
        });
    }

    function clearCountdown() {
        if (pipeline.cdTimer) {
            clearInterval(pipeline.cdTimer);
            pipeline.cdTimer = null;
        }
    }

    function nextNonSkipped(from) {
        let idx = from;
        while (idx < PIPELINE_STEPS.length && pipeline.skipped.has(idx)) idx++;
        return idx;
    }

    function startPipeline() {
        pipeline.active  = true;
        pipeline.current = 0;
        pipeline.skipped = new Set();
        countdownBar.className = 'countdown-bar';
        trackerPanel.classList.add('visible');
        buildTrackerSteps();
        updateSidebarDots();
        runTask(PIPELINE_STEPS[0].cmd, []);
    }

    function startPipelineFrom(index) {
        pipeline.active  = true;
        pipeline.current = index;
        pipeline.skipped = new Set();
        countdownBar.className = 'countdown-bar';
        trackerPanel.classList.add('visible');
        buildTrackerSteps();
        updateSidebarDots();
        runTask(PIPELINE_STEPS[index].cmd, []);
    }

    function advanceToNextStep() {
        const next = nextNonSkipped(pipeline.current);
        if (next >= PIPELINE_STEPS.length) {
            pipelineComplete();
            return;
        }
        pipeline.current = next;
        buildTrackerSteps();
        updateSidebarDots();
        runTask(PIPELINE_STEPS[next].cmd, []);
    }

    function pipelineComplete() {
        pipeline.active = false;
        countdownBar.className = 'countdown-bar';
        trackerSub.textContent = 'Complete ✓';
        updateSidebarDots();
    }

    function abortPipeline() {
        clearCountdown();
        pipeline.active = false;
        countdownBar.className = 'countdown-bar';
        trackerPanel.classList.remove('visible');
        // Reset sidebar dots
        PIPELINE_STEPS.forEach((_, i) => {
            const dot = document.getElementById('ps-dot-' + i);
            if (dot) {
                dot.className = 'ps-dot ps-pend';
                dot.textContent = String(i + 1);
            }
        });
    }

    function startCountdown(success) {
        clearCountdown();
        pipeline.cdRemaining = 5;

        if (success) {
            countdownBar.className = 'countdown-bar success';
            cdSkipBtn.style.display  = 'inline-block';
            cdRetryBtn.style.display = 'none';
        } else {
            countdownBar.className = 'countdown-bar failure';
            cdSkipBtn.style.display  = 'inline-block';
            cdRetryBtn.style.display = 'inline-block';
        }

        const finishedIdx = success ? pipeline.current - 1 : pipeline.current;
        const nextIdx     = success ? nextNonSkipped(pipeline.current) : -1;

        function refreshLabel() {
            const finishedCmd = PIPELINE_STEPS[finishedIdx].cmd;
            if (success) {
                const nextCmd = nextIdx < PIPELINE_STEPS.length
                    ? PIPELINE_STEPS[nextIdx].cmd : null;
                cdText.textContent = nextCmd
                    ? '✓ ' + finishedCmd + ' succeeded — autoruns next: '
                      + nextCmd + ' in ' + pipeline.cdRemaining + ' s'
                    : '✓ ' + finishedCmd + ' succeeded — pipeline complete';
            } else {
                cdText.textContent = '✗ ' + finishedCmd
                    + ' failed — retry or skip?';
            }
        }
        refreshLabel();

        if (success && nextIdx >= PIPELINE_STEPS.length) {
            pipelineComplete();
            return;
        }
        if (!success) return; // no auto-advance on failure

        pipeline.cdTimer = setInterval(() => {
            pipeline.cdRemaining--;
            if (pipeline.cdRemaining <= 0) {
                clearCountdown();
                countdownBar.className = 'countdown-bar';
                advanceToNextStep();
            } else {
                refreshLabel();
            }
        }, 1000);
    }

    // Skip: mark the upcoming step as skipped, advance past it
    cdSkipBtn.addEventListener('click', () => {
        clearCountdown();
        countdownBar.className = 'countdown-bar';
        const upcomingIdx = nextNonSkipped(pipeline.current);
        if (upcomingIdx < PIPELINE_STEPS.length) {
            pipeline.skipped.add(upcomingIdx);
            pipeline.current = upcomingIdx + 1;
        }
        buildTrackerSteps();
        updateSidebarDots();
        const afterSkip = nextNonSkipped(pipeline.current);
        if (afterSkip >= PIPELINE_STEPS.length) {
            pipelineComplete();
        } else {
            pipeline.current = afterSkip;
            buildTrackerSteps();
            updateSidebarDots();
            runTask(PIPELINE_STEPS[afterSkip].cmd, []);
        }
    });

    // Retry: re-run the failed step
    cdRetryBtn.addEventListener('click', () => {
        clearCountdown();
        countdownBar.className = 'countdown-bar';
        buildTrackerSteps();
        updateSidebarDots();
        runTask(PIPELINE_STEPS[pipeline.current].cmd, []);
    });

    cdAbortBtn.addEventListener('click', () => abortPipeline());
```

- [ ] **Step 2: Hook pipeline advancement into task-finished**

Find the existing `socket.on('task-finished', ...)` handler and replace it with:

```js
    socket.on('task-finished', ({ code }) => {
        running = false;
        setButtons(false);
        stopBtn.style.display = 'none';
        statusEl.className = code === 0 ? 'ok' : 'fail';
        statusEl.textContent = code === 0
            ? 'Ready — last task succeeded ✓'
            : 'Ready — last task failed (code ' + code + ')';
        termLabel.textContent = 'Output';

        if (!pipeline.active) return;

        if (code === 0) {
            pipeline.current++;
            buildTrackerSteps();
            updateSidebarDots();
            startCountdown(true);
        } else {
            buildTrackerSteps();
            updateSidebarDots();
            startCountdown(false);
        }
    });
```

- [ ] **Step 3: Disable pipeline start button while a task is running**

Find `function setButtons(disabled)` and replace it with:

```js
    function setButtons(disabled) {
        document.querySelectorAll('.task-card:not(.dangerous), .run-btn').forEach((el) => {
            el.style.pointerEvents = disabled ? 'none' : '';
            el.style.opacity = disabled ? '0.45' : '';
        });
        const psBtn = document.getElementById('pipeline-start-btn');
        if (psBtn) psBtn.disabled = disabled;
    }
```

- [ ] **Step 4: Verify full pipeline flow**

```bash
# Reload http://localhost:3000
# 1. Click ▶ Start Full Pipeline
#    → tracker panel appears, step 1 dot pulses amber, sidebar dot 1 pulses amber
# 2. Stop the running task with ■ Stop (simulates task completion for testing)
#    → code will be non-zero; failure countdown bar appears with Retry + Skip + Abort
# 3. Click ↺ Retry → same task runs again
# 4. Click Skip → → step 1 shows ⊘ in both tracker and sidebar, step 2 starts
# 5. Click ✗ Abort → tracker panel hides, sidebar dots reset to numbers
# 6. Click step 3 directly in sidebar → pipeline starts from step 3
```

- [ ] **Step 5: Commit**

```bash
git add dashboard/public/index.html
git commit -m "feat(dashboard): pipeline autorun, step tracker, skip/abort/retry countdown"
```

---

## Task 8: Final polish and smoke test

**Files:**
- Modify: `dashboard/public/index.html` — QUICK_STEPS constant

- [ ] **Step 1: Update QUICK_STEPS**

Find `const QUICK_STEPS = [` and replace the array with:

```js
    const QUICK_STEPS = [
        { n: 1, title: 'Select ENV in the sidebar',            cmd: '(pick dev / mentolder / korczewski)' },
        { n: 2, title: 'Validate manifests first (optional)',  cmd: 'workspace:validate' },
        { n: 3, title: 'Click Start Full Pipeline',            cmd: '(Full Deploy Pipeline section)' },
        { n: 4, title: 'Skip or abort steps as needed',        cmd: '(countdown bar in main panel)' },
        { n: 5, title: 'Check everything is healthy',          cmd: 'workspace:status' },
    ];
```

- [ ] **Step 2: Full smoke test — open every section manually**

```bash
# Reload http://localhost:3000 and verify each section:
# ✓ Quick Start guide (collapsed toggle) shows 5 steps
# ✓ Full Deploy Pipeline — 7 steps, ▶ Start button, each step clickable
# ✓ Cluster — 5 tasks
# ✓ Workspace — 5 tasks
# ✓ Post-Deploy — 5 tasks
# ✓ Website — 4 tasks
# ✓ ArgoCD — 3 tasks (Bootstrap ArgoCD has DESTRUCTIVE tag)
# ✓ Daily Operations — Tail Logs and Restart Service have text inputs + Run button
# ✓ MCP / Claude Code — Claude Code Setup has text input + Run button
# ✓ User & Data — 3 tasks
# ✓ Backup & Restore — Restore from Backup has 2 inputs + DESTRUCTIVE tag
# ✓ Testing — 3 tasks
# ✓ Environment & Secrets — Generate Secrets and Seal Secrets have DESTRUCTIVE tag
# ✓ From Scratch (purple, collapsed) — expands, guidance note visible, 5 tasks
# ✓ Danger Zone (red, collapsed) — expands, shows ✅/❌ guidance text, 3 DESTRUCTIVE tasks
# ✓ DevTools console: zero errors throughout
```

- [ ] **Step 3: Test confirmation modal**

```bash
# Expand Danger Zone → click Teardown Workspace
# Modal appears with task label and danger message
# Click Cancel → modal closes, no task runs
# Press Escape → same behaviour
```

- [ ] **Step 4: Test arg-input tasks**

```bash
# Daily Operations → Tail Logs → type "nextcloud" → click Run
# Terminal shows: task workspace:logs -- nextcloud  [ENV=dev]
```

- [ ] **Step 5: Test DRY_RUN + pipeline combo**

```bash
# Enable 📋 DRY RUN
# Click ▶ Start Full Pipeline
# Terminal header shows: task workspace:deploy  [ENV=dev, DRY_RUN=true]
```

- [ ] **Step 6: Commit**

```bash
git add dashboard/public/index.html
git commit -m "feat(dashboard): update quick-start guide; all smoke tests pass"
```

---

## Self-Review

### Spec coverage

| Spec requirement | Task |
|---|---|
| Destructive group with when/never guidance | Tasks 4 + 5 |
| Pipeline steps in workspace:up order | Task 4 (PIPELINE_STEPS) |
| Autorun next task with same ENV | Task 7 (startCountdown → advanceToNextStep) |
| Skip button between tasks | Task 7 (cdSkipBtn) |
| Abort pipeline | Task 7 (cdAbortBtn) |
| Retry on failure | Task 7 (cdRetryBtn) |
| From Scratch group with prereq explanation | Tasks 4 + 5 |
| Dry-run global toggle | Tasks 1 + 6 |
| Step tracker panel in main area | Tasks 2 + 3 + 7 |
| New commands in allowlist | Task 1 |

All spec requirements covered. ✓

### Placeholder scan

No TBDs, no "similar to above" shortcuts, all code blocks complete. ✓

### Type/name consistency

- `pipeline.current` used consistently as running-step index across all functions. ✓
- `pipeline.skipped` is a `Set`, used with `.has()` and `.add()` throughout. ✓
- `startPipeline()` and `startPipelineFrom(i)` defined in Task 7 Step 1, called by pipeline-start-btn listener (Task 5 Step 1) — both in same IIFE, listener fires only on click (after full init). ✓
- `pipelineStartBtn` fetched by `getElementById` in Task 7 Step 1; `setButtons` updated in Task 7 Step 3 to use `getElementById` instead — consistent. ✓
- `nextNonSkipped` defined once in Task 7 Step 1, used in `advanceToNextStep`, `startCountdown`, and `cdSkipBtn` handler. ✓
