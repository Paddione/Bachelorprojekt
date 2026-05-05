# Quick Attack Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Quick Attack" sidebar section to the local pentest dashboard that lets the user type any domain and/or IP address and fire 9 parameterised recon/vuln probes at it.

**Architecture:** Pure frontend change — one HTML file (`pentest-dashboard/static/index.html`) using Alpine.js. Probe commands are built client-side as strings and submitted to the existing `POST /api/scan/run` endpoint as `custom_command`. No backend changes needed.

**Tech Stack:** Alpine.js 3.14 (CDN, x-data/x-model/x-ref), plain HTML/CSS matching the existing dark terminal theme, Flask backend (unchanged).

---

## File Map

| File | Change |
|------|--------|
| `pentest-dashboard/static/index.html` | All changes — JS const, Alpine state, methods, HTML section |

No new files. No backend changes.

---

## Task 1: Add `QA_PROBES` constant and Alpine state/methods

**Files:**
- Modify: `pentest-dashboard/static/index.html` — `<script>` block

This task adds everything JavaScript-side before touching the HTML template.

- [ ] **Step 1: Add `QA_PROBES` const above `function app()`**

Find the line `function app() {` in the `<script>` block (around line 989) and insert this block immediately before it:

```js
const QA_PROBES = [
  {
    id: 'qa-ping',
    name: 'Ping + HTTP',
    desc: 'ICMP reachability + HTTP status line',
    tool: 'ping/curl',
    build(host, url) {
      return `ping -c 4 "${host}" 2>&1\necho "---"\ncurl -sI --max-time 8 "${url}" 2>&1`;
    },
  },
  {
    id: 'qa-nmap-top',
    name: 'Nmap Top-100',
    desc: 'Service + version scan, top 100 ports',
    tool: 'nmap',
    build(host) {
      return `nmap -sV --open -T4 --top-ports 100 "${host}" 2>&1`;
    },
  },
  {
    id: 'qa-nmap-full',
    name: 'Nmap Full',
    desc: 'Full port range service + script scan (slow)',
    tool: 'nmap',
    build(host) {
      return `nmap -sV -sC --open -p- -T4 "${host}" 2>&1`;
    },
  },
  {
    id: 'qa-headers',
    name: 'HTTP Headers',
    desc: 'Response headers + security header check',
    tool: 'curl',
    build(host, url) {
      return `curl -sI --max-time 8 "${url}" 2>&1`;
    },
  },
  {
    id: 'qa-ssl',
    name: 'SSL/TLS',
    desc: 'Cipher suite + certificate analysis',
    tool: 'sslscan',
    build(host) {
      return `sslscan --no-colour "${host}" 2>&1`;
    },
  },
  {
    id: 'qa-whatweb',
    name: 'WhatWeb',
    desc: 'Technology fingerprinting',
    tool: 'whatweb',
    build(host, url) {
      return `whatweb -a 3 --color=never "${url}" 2>&1`;
    },
  },
  {
    id: 'qa-nikto',
    name: 'Nikto',
    desc: 'Web vulnerability scanner (2 min cap)',
    tool: 'nikto',
    build(host, url) {
      return `nikto -h "${url}" -maxtime 120 -no404 2>&1`;
    },
  },
  {
    id: 'qa-nuclei',
    name: 'Nuclei',
    desc: 'Template-based vuln scan (medium–critical)',
    tool: 'nuclei',
    build(host, url) {
      return `nuclei -target "${url}" -severity medium,high,critical -no-color 2>&1`;
    },
  },
  {
    id: 'qa-gobuster',
    name: 'Dir Brute',
    desc: 'Directory brute-force with dirb/common.txt',
    tool: 'gobuster',
    build(host, url) {
      return `gobuster dir -u "${url}" -w /usr/share/wordlists/dirb/common.txt -t 20 -k --no-error -q 2>&1`;
    },
  },
];
```

- [ ] **Step 2: Add `qaDomain` and `qaIP` to Alpine state**

Find the state block (the object returned by `app()`) — it starts with `section: 'overview',`. Add these two lines after `reportCopied: false,`:

```js
    qaDomain: '',
    qaIP: '',
```

- [ ] **Step 3: Add `qaProbes` reference to state**

In the same state block, add after `qaDomain`/`qaIP`:

```js
    qaProbes: QA_PROBES,
```

- [ ] **Step 4: Add computed getters**

Find the block of `get` properties (starts around `get totalTargets()`). Add these three getters after `get coverageData()`:

```js
    get qaHost() {
      return this.qaDomain.trim() || this.qaIP.trim();
    },
    get qaUrl() {
      const d = this.qaDomain.trim();
      const ip = this.qaIP.trim();
      if (d) return 'https://' + d;
      if (ip) return 'http://' + ip;
      return '';
    },
    get qaValidTarget() {
      return !!(this.qaDomain.trim() || this.qaIP.trim());
    },
```

- [ ] **Step 5: Add `qaRunProbe` method**

Find the `previewScan(s)` method and add `qaRunProbe` immediately after it:

```js
    qaRunProbe(id) {
      const probe = this.qaProbes.find(p => p.id === id);
      if (!probe || !this.qaValidTarget) return;
      const host = this.qaHost;
      const url = this.qaUrl;
      const cmd = probe.build(host, url);
      this.currentScanName = probe.name + ' → ' + host;
      this.currentScanId = 'custom';
      this.terminalOutput = '';
      this._startScan({ custom_command: cmd });
    },
```

- [ ] **Step 6: Update `_scrollTerminal` to handle the Quick Attack terminal ref**

Find `_scrollTerminal()` — it currently reads:
```js
    _scrollTerminal() {
      const el = this.section === 'custom' ? this.$refs.terminalCustom : this.$refs.terminal;
```

Replace that one line with:
```js
    _scrollTerminal() {
      const el = this.section === 'custom' ? this.$refs.terminalCustom
        : this.section === 'quickattack' ? this.$refs.terminalQuick
        : this.$refs.terminal;
```

- [ ] **Step 7: Update `jumpToBottom` to handle the Quick Attack terminal ref**

Find `jumpToBottom()` — it currently reads:
```js
    jumpToBottom() {
      const el = this.section === 'custom' ? this.$refs.terminalCustom : this.$refs.terminal;
```

Replace that one line with:
```js
    jumpToBottom() {
      const el = this.section === 'custom' ? this.$refs.terminalCustom
        : this.section === 'quickattack' ? this.$refs.terminalQuick
        : this.$refs.terminal;
```

- [ ] **Step 8: Verify JS is syntactically valid**

```bash
node --input-type=module < <(grep -o '<script>.*</script>' /home/patrick/Bachelorprojekt/pentest-dashboard/static/index.html | sed 's/<script>//;s/<\/script>//' ) 2>&1 || true
```

Alternatively, open http://localhost:5000 in a browser and check the DevTools console for errors. There should be none.

- [ ] **Step 9: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add pentest-dashboard/static/index.html
git commit -m "feat(pentest): add Quick Attack JS state, probes, and methods"
```

---

## Task 2: Add nav item and Quick Attack HTML section

**Files:**
- Modify: `pentest-dashboard/static/index.html` — nav array + HTML section

**Context for this task:** The Alpine.js state, getters, and `qaRunProbe` method were added in Task 1. This task only touches the HTML template. The existing sections follow the pattern `<div x-show="section==='<id>'">`. The nav is a JS array `nav: [...]` inside `app()`. The terminal ref pattern is `x-ref="terminal"` / `x-ref="terminalCustom"`.

- [ ] **Step 1: Add nav item**

Find the `nav: [` array in the JS state. It currently ends with:
```js
      { id: 'timeline', icon: '📋',  label: 'Timeline' },
```

Insert the Quick Attack item between `custom` and `report`:
```js
      { id: 'quickattack', icon: '⚔️',  label: 'Quick Attack' },
```

So the order becomes: `…custom → quickattack → report → timeline`.

- [ ] **Step 2: Add Quick Attack HTML section**

Find the closing `</div>` of the Custom section (it ends around line 789 with the terminalCustom div). After that closing `</div>` and before the Report section comment `<!-- ── Report ── -->`, insert:

```html
    <!-- ── Quick Attack ── -->
    <div x-show="section==='quickattack'">
      <div class="section-title">⚔️ Quick Attack
        <span class="text-muted text-sm">Arbitrary domain or IP — no hardcoded scope</span>
      </div>

      <!-- Target inputs -->
      <div class="card mb-4">
        <div class="grid-2" style="gap:12px">
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label">Domain / Hostname</label>
            <input class="form-input" type="text" x-model="qaDomain"
                   placeholder="e.g. example.com"
                   @input="terminalOutput=''">
          </div>
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label">IPv4 / IPv6</label>
            <input class="form-input" type="text" x-model="qaIP"
                   placeholder="e.g. 1.2.3.4 or ::1"
                   @input="terminalOutput=''">
          </div>
        </div>
        <div class="mt-2 text-xs" x-show="qaValidTarget">
          <span class="text-muted">Target: </span><span class="text-blue" x-text="qaHost"></span>
          <span class="text-muted"> · URL: </span><span class="text-blue" x-text="qaUrl"></span>
        </div>
        <div class="mt-2 text-xs text-muted" x-show="!qaValidTarget">
          Fill at least one field to enable probes.
        </div>
      </div>

      <!-- Probe grid -->
      <div class="grid-3 mb-4">
        <template x-for="probe in qaProbes" :key="probe.id">
          <div class="scan-card">
            <div class="flex items-center justify-between">
              <span class="scan-name" x-text="probe.name"></span>
              <span class="badge badge-cyan scan-tool" x-text="probe.tool"></span>
            </div>
            <div class="scan-desc" x-text="probe.desc"></div>
            <div class="flex gap-2 mt-1">
              <button class="btn btn-green btn-sm"
                      @click="qaRunProbe(probe.id)"
                      :disabled="scanning || !qaValidTarget">
                <span x-show="!(scanning && currentScanName.startsWith(probe.name))">▶ Run</span>
                <span x-show="scanning && currentScanName.startsWith(probe.name)" class="running-indicator">Running…</span>
              </button>
            </div>
          </div>
        </template>
      </div>

      <!-- Terminal -->
      <div x-show="terminalOutput || scanning">
        <div class="terminal-header">
          <div class="terminal-dot t-red"></div>
          <div class="terminal-dot t-yellow"></div>
          <div class="terminal-dot t-green"></div>
          <div class="terminal-title">
            <span x-text="currentScanName || 'Quick Attack'"></span>
            <span x-show="scanning" class="running-indicator"> ● live</span>
            <span x-show="!scanning && terminalOutput" class="text-muted"> ● done</span>
          </div>
          <button x-show="scanning" class="btn btn-red btn-xs" @click="killScan()">Kill</button>
          <button x-show="!scanning && terminalOutput" class="btn btn-ghost btn-xs" @click="terminalOutput=''">Clear</button>
          <button x-show="!scanning && terminalOutput" class="btn btn-blue btn-xs" @click="saveOutputAsFinding()">→ Finding</button>
        </div>
        <div class="terminal terminal-with-header" style="height:420px"
             x-ref="terminalQuick"
             @scroll="_onTerminalScroll($el)"
             x-html="ansiToHtml(terminalOutput)"></div>
        <div x-show="userScrolledUp && scanning" style="position:relative">
          <button class="btn btn-ghost btn-xs"
                  style="position:absolute;bottom:8px;right:8px;z-index:10;background:var(--bg3);border-color:var(--border)"
                  @click="jumpToBottom()">↓ new output</button>
        </div>
      </div>
    </div>
```

- [ ] **Step 3: Browser verification**

The dashboard server is already running at http://localhost:5000 (Flask, no hot-reload). Restart it:

```bash
pkill -f 'python3 app.py' 2>/dev/null || true
cd /home/patrick/Bachelorprojekt/pentest-dashboard && python3 app.py &
sleep 2
```

Then open http://localhost:5000 and verify:
1. **Nav:** "⚔️ Quick Attack" appears between Custom and Report in the sidebar.
2. **Target inputs:** Both fields render; helper text "Fill at least one field…" shows when both empty.
3. **Probes disabled:** All 9 Run buttons are greyed out with empty inputs.
4. **Type a domain** (e.g. `example.com`): helper text changes to show target + URL; all 9 Run buttons become active.
5. **Run "HTTP Headers":** terminal appears, curl output streams in, "● done" shown when complete. Timeline entry logged.
6. **Kill works:** Start Nmap Full, click Kill — stream stops, `[killed by user]` appended.
7. **→ Finding works:** After a completed run, click "→ Finding" — switches to Findings section with pre-filled title.
8. **IP-only mode:** Clear domain, type `1.2.3.4`. URL shows `http://1.2.3.4`. Run a probe to confirm.
9. **DevTools console:** No JS errors.

- [ ] **Step 4: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add pentest-dashboard/static/index.html
git commit -m "feat(pentest): add Quick Attack panel — arbitrary domain/IP probes"
```

---

## Self-Review Notes

- **Spec coverage:** All 9 probe cards ✓, domain field ✓, IPv4/IPv6 field ✓, derived URL ✓, terminal with kill/clear/finding ✓, timeline logging (via existing `_startScan` + `log_timeline` in backend) ✓, no backend changes ✓.
- **Placeholders:** None.
- **Type consistency:** `qaHost`, `qaUrl`, `qaValidTarget`, `qaRunProbe`, `qaProbes`, `terminalQuick` — all names consistent between Task 1 and Task 2.
- **Edge case — both fields filled:** `qaHost` returns `qaDomain` (domain wins); `qaUrl` uses `https://<domain>`. Correct — domain is more useful for HTTP tools.
