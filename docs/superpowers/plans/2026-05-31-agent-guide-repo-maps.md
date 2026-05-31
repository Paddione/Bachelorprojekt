---
title: AI-Agent Guide S3 — Repo-Map Surface Implementation Plan
ticket_id: T000378
domains: [infra, test]
status: active
pr_number: null
---

# AI-Agent Guide S3 — Repo-Map Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Generiere aus der Agent-Guide-Registry drei committed Markdown-Karten (`goals-map.md`, `tools-map.md`, `danger-map.md`) unter `docs/agent-guide/maps/`, die ein Agent (und der Operator) grepen kann, um Intention → Weg → Gefahren-Tier → Guardrails deterministisch aufzulösen.

**Architecture:** Ein einzelnes ESM-Emitter-Modul `scripts/agent-guide/emit-maps.mjs` validiert die Registry (F+B `validateRegistry`), lädt sie über den geteilten Reader `scripts/agent-guide/load.mjs` (S1), rendert drei reine String-Templates und schreibt die Karten als committed Artefakte. Eine CI-Freshness-Gate (`git diff --exit-code`) spiegelt das bestehende test-inventory-Muster, und die Karten werden vom Docs-Site-Generator ausgeschlossen.

**Tech Stack:** Node.js ESM (`node --test`), `yaml@^2.8.3` (transitiv über S1/F+B), go-task (`Taskfile.yml`), GitHub Actions (`ci.yml`), Markdown (GFM).

**Spec:** docs/superpowers/specs/2026-05-31-agent-guide-repo-maps-design.md

---

## Prerequisite note (read before starting)

Dieses Surface ist **S3** und hängt von zwei vorgelagerten Merges ab, die im aktuellen Worktree **noch nicht vorhanden sind** (das ist erwartet, kein Defekt):

- **F+B** liefert: `docs/agent-guide/registry/*.yaml` (taxonomy/guardrails/tools/goals/components), `scripts/agent-guide/validate.mjs` mit Export `validateRegistry(dir, repoRoot)`, die root-devDependency `yaml@^2.8.3` und die Taskfile-Task `test:agent-guide` (globt `scripts/agent-guide/*.test.mjs` und ist bereits eine `test:all`-Dependency).
- **S1** liefert: `scripts/agent-guide/load.mjs` mit Export `loadRegistry(dir) -> { goals, tools, components, taxonomy, guardrails }` plus Helfer `tierFor(id)`, `toolById(id)`, `guardrailById(id)` — sowie die Umbrella-Task `agent-guide:emit`, an die S3 seine `agent-guide:maps`-Leaf anhängt.

**Merge-Reihenfolge: S1 → S2 → S3. S3 wird zuletzt gemerged.** Solange S1 nicht gelandet ist, entwickelst Du `emit-maps.mjs` gegen einen **lokalen Stand-in** von `load.mjs` (Task 0 erstellt diesen Stand-in im Worktree, damit der CLI-Pfad lokal lauffähig ist). Vor dem Merge wird der Import auf den echten S1-Pfad umgestellt (Task 9) und der Stand-in entfernt.

Verifiziert in diesem Worktree (Branch `feature/agent-guide-maps`, pre-F+B): `scripts/build-test-inventory.sh` (`REPO_ROOT` aus `BASH_SOURCE` Zeile 5, `echo "Wrote …"` Zeile 49); `.github/workflows/ci.yml` test-inventory-Step Zeilen 38-44 (gefolgt vom Systembrett-Step), im `offline-tests`-Job; `scripts/docs-gen/discover.mjs` (`DOC_EXCLUDE_PREFIXES` 16-19, `excluded()`-Closure 136-140, `discoverDocs`/`walk` 131-155, `.md`-Filter Zeile 148) und `scripts/docs-gen/discover.test.mjs` (specs-Assertion Zeile 70, plans-Assertion Zeile 71; plans-Fixture-Block 53-55; Discovery via `discoverSources({ repoRoot, pluginsRoot, homeDir })`); `Taskfile.yml` (`test:docs-gen` 345-347, `test:all` deps 350-358 — **kein** `test:agent-guide` darin, das verdrahtet F+B, `test:inventory` 360-363); `CLAUDE.md` (Agent-Routing-Tabelle Zeilen 7-14, Security-Zeile 14, danach Leerzeile + `**Before dispatching any agent, inject active plan context:**`; WSL-Link `file:///home/patrick/...` weiter unten); `AGENTS.md -> CLAUDE.md` (Symlink); standalone `GEMINI.md`; `.claude/skills/OVERVIEW.md` (Intro Zeile 3, `---` Zeile 5). `scripts/agent-guide/` existiert noch nicht — kommt via F+B/S1.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `scripts/agent-guide/_load-standin.mjs` | create (temporary) | Throwaway Dev-Stand-in für S1's `load.mjs`, bis S1 merged; in Task 9 entfernt |
| `scripts/agent-guide/emit-maps.mjs` | create | Emitter: validate → load → render 3 Templates → schreibe `docs/agent-guide/maps/*.md`; exportiert `renderGoalsMap`, `renderToolsMap`, `renderDangerMap`, `escapeCell` |
| `scripts/agent-guide/emit-maps.test.mjs` | create | `node --test`-Unit-Tests: Header/Rows/Grouping, transitive Guardrail-Tier-Bucketing, Cell-Escaping, Fail-closed, Determinismus |
| `docs/agent-guide/maps/goals-map.md` | create (generated) | Ziel-Karte (Intention → Weg → Tier → Guardrails → Prompt), committed |
| `docs/agent-guide/maps/tools-map.md` | create (generated) | Werkzeug-Karte, gruppiert Skills/Tasks/Agenten, committed |
| `docs/agent-guide/maps/danger-map.md` | create (generated) | Gefahren-Karte: 4 Tiers + transitive Guardrails, committed |
| `Taskfile.yml` | modify (~363) | Neue Task `agent-guide:maps`; an `agent-guide:emit`-Umbrella (S1) anhängen |
| `.github/workflows/ci.yml` | modify (~44) | Step "Verify agent-guide maps are up to date" im `offline-tests`-Job |
| `scripts/docs-gen/discover.mjs` | modify (16-19) | `join('docs','agent-guide','maps')` zu `DOC_EXCLUDE_PREFIXES` hinzufügen |
| `scripts/docs-gen/discover.test.mjs` | modify (~55 + ~71) | Fixture-Karte + Assertion, dass `docs/agent-guide/maps/` ausgeschlossen ist |
| `CLAUDE.md` | modify (nach Zeile 14) | Eine handgeschriebene repo-relative Pointer-Zeile auf `docs/agent-guide/maps/` |
| `.claude/skills/OVERVIEW.md` | modify (nach Zeile 3) | Eine handgeschriebene Pointer-Zeile auf `docs/agent-guide/maps/goals-map.md` |

---

## Task 0: Lokaler `load.mjs`-Stand-in (throwaway Dev-Scaffolding vor S1-Merge)

S1 ist noch nicht gemerged, also gibt es im Worktree kein `scripts/agent-guide/load.mjs` und keine `validate.mjs`. Damit der **CLI-Pfad** von `emit-maps.mjs` **jetzt** lokal lauffähig ist, erstellst Du einen schmalen Stand-in mit exakt der vereinbarten S1-Signatur (`loadRegistry`, `tierFor`, `toolById`, `guardrailById`).

**Wichtig — Geltungsbereich der „No-YAML-parsing"-Regel:** Der Spec-Invariant (§4 Claim 1, §7.1) „S3 parst kein YAML selbst" gilt für das **ausgelieferte** `emit-maps.mjs` — es routet seine einzige Parse durch S1's `load.mjs`. Dieser Stand-in ist **throwaway Dev-Only-Scaffolding** und ausdrücklich **nicht** von dieser Regel betroffen (Spec §9 sanktioniert explizit einen „local stand-in of the agreed loadRegistry signature"). Er existiert ausschließlich, damit Du vor S1 lokal `node scripts/agent-guide/emit-maps.mjs` ausführen kannst. Die **Tests** nutzen ihn **nicht** (sie übergeben In-Memory-Fixtures direkt an die reinen `render*`-Funktionen). Task 9 ersetzt den Import durch den echten S1-Pfad und **löscht** den Stand-in; das Gate, das beweist, dass der Stand-in vor dem Merge verschwunden ist, ist Task 9 Step 5 (`grep -q "from './load.mjs'"`) + Task 13 Step 5 (`test ! -f .../\_load-standin.mjs`).

**Files:**
- Create: `scripts/agent-guide/_load-standin.mjs`

- [ ] **Step 1: Verzeichnis und Stand-in anlegen**

  Erstelle `scripts/agent-guide/_load-standin.mjs` mit folgendem vollständigen Inhalt. Er parst die YAML-Registry mit der `yaml`-Lib (die F+B als devDependency mitbringt; falls noch nicht installiert, liefert Step 2 die Anweisung) und baut die Helfer. Die Feldsemantik folgt exakt dem F+B-Registry-Kontrakt.

  ```js
  // scripts/agent-guide/_load-standin.mjs
  // THROWAWAY dev-only stand-in for S1's scripts/agent-guide/load.mjs.
  // It IS allowed to parse YAML — the spec's "S3 does no YAML parsing of its own"
  // rule applies to the SHIPPED emit-maps.mjs, not to this temporary scaffolding.
  // Identical export surface: loadRegistry(dir) + tierFor/toolById/guardrailById.
  // Removed in the final task once S1 has merged (the emitter then imports ./load.mjs).
  import { readFileSync } from 'node:fs';
  import { join } from 'node:path';
  import { parse } from 'yaml';

  function readYaml(dir, file) {
    return parse(readFileSync(join(dir, file), 'utf8'));
  }

  /**
   * @param {string} dir  docs/agent-guide/registry
   * @returns {{ goals:any[], tools:any[], components:any[], taxonomy:any[], guardrails:any[],
   *            tierFor:(id:string)=>any, toolById:(id:string)=>any, guardrailById:(id:string)=>any }}
   */
  export function loadRegistry(dir) {
    const taxonomy = readYaml(dir, 'taxonomy.yaml');
    const guardrails = readYaml(dir, 'guardrails.yaml');
    const tools = readYaml(dir, 'tools.yaml');
    const goals = readYaml(dir, 'goals.yaml');
    const components = readYaml(dir, 'components.yaml');

    const taxById = new Map(taxonomy.map((t) => [t.id, t]));
    const toolMap = new Map(tools.map((t) => [t.id, t]));
    const grMap = new Map(guardrails.map((g) => [g.id, g]));

    return {
      goals,
      tools,
      components,
      taxonomy,
      guardrails,
      tierFor: (id) => taxById.get(id),
      toolById: (id) => toolMap.get(id),
      guardrailById: (id) => grMap.get(id),
    };
  }
  ```

- [ ] **Step 2: yaml-Lib sicherstellen**

  Prüfe, ob `yaml` installiert ist (kommt normalerweise via F+B). Falls nicht, installiere es als devDependency, ohne es in `package.json` zu committen (F+B besitzt diesen Eintrag):

  ```bash
  cd /tmp/wt-agent-guide-maps && node -e "require.resolve('yaml')" 2>/dev/null && echo "yaml present" || npm install --no-save yaml@^2.8.3
  ```

  Erwartete Ausgabe: entweder `yaml present` oder eine erfolgreiche `npm install`-Zeile.

- [ ] **Step 3: Commit**

  ```bash
  cd /tmp/wt-agent-guide-maps && git add scripts/agent-guide/_load-standin.mjs && git commit -m "chore(agent-guide): throwaway load.mjs stand-in for S3 dev before S1 merge"
  ```

---

## Task 1: `escapeCell()` — die Tabellen-Sicherheits-Invariante (TDD)

Der subtilste Korrektheitspunkt #1. Jeder Wert, der in eine GFM-Tabellenzelle geht, durchläuft genau eine Escaping-Pass: jeder Whitespace-Run mit Newline → ein Space, `|` → `\|`, trim. Leer/undefined → em-dash-Platzhalter. Wir schreiben den Test zuerst, gegen die **exportierte reine Funktion** — keine Disk-IO, keine echte Registry.

**Files:**
- Create: `scripts/agent-guide/emit-maps.test.mjs`
- Create: `scripts/agent-guide/emit-maps.mjs`
- Test: `scripts/agent-guide/emit-maps.test.mjs`

- [ ] **Step 1: Failing test schreiben**

  Erstelle `scripts/agent-guide/emit-maps.test.mjs` mit dem vollständigen ersten Test:

  ```js
  // scripts/agent-guide/emit-maps.test.mjs
  import { test } from 'node:test';
  import assert from 'node:assert/strict';
  import {
    escapeCell,
    renderGoalsMap,
    renderToolsMap,
    renderDangerMap,
  } from './emit-maps.mjs';

  test('escapeCell: pipe is backslash-escaped', () => {
    assert.equal(escapeCell('a | b'), 'a \\| b');
  });

  test('escapeCell: embedded newline collapses to a single space', () => {
    assert.equal(escapeCell('line one\nline two'), 'line one line two');
    assert.equal(escapeCell('line one\r\nline two'), 'line one line two');
  });

  test('escapeCell: runs of whitespace around a newline collapse to one space', () => {
    assert.equal(escapeCell('a  \n   b'), 'a b');
  });

  test('escapeCell: leading/trailing whitespace trimmed', () => {
    assert.equal(escapeCell('   padded   '), 'padded');
  });

  test('escapeCell: pipe and newline together stay table-safe', () => {
    assert.equal(escapeCell('„Fix |broken|\nlogin“'), '„Fix \\|broken\\| login“');
  });

  test('escapeCell: empty/undefined renders as the em-dash placeholder', () => {
    assert.equal(escapeCell(''), '—');
    assert.equal(escapeCell(undefined), '—');
    assert.equal(escapeCell(null), '—');
  });
  ```

- [ ] **Step 2: Test laufen lassen, Fehlschlag beobachten**

  ```bash
  cd /tmp/wt-agent-guide-maps && node --test scripts/agent-guide/emit-maps.test.mjs
  ```

  Erwartet: FAIL — `Cannot find module '.../scripts/agent-guide/emit-maps.mjs'` (das Modul existiert noch nicht).

- [ ] **Step 3: Minimal-Implementierung**

  Erstelle `scripts/agent-guide/emit-maps.mjs` mit Header-Konstante und `escapeCell`. Die `render*`-Funktionen kommen in Tasks 2-4 — hier zunächst als Stubs, weil die Test-Datei sie importiert.

  ```js
  // scripts/agent-guide/emit-maps.mjs
  // Emitter for the agent-guide repo-map surface (S3).
  // validateRegistry -> loadRegistry -> render 3 pure templates -> write docs/agent-guide/maps/*.md.
  // No YAML parsing of its own: it depends on S1's scripts/agent-guide/load.mjs.

  export const HEADER =
    '<!-- DO NOT EDIT — generated by scripts/agent-guide/emit-maps.mjs; edit the registry -->';

  export const EMPTY = '—';

  /**
   * Make any value safe inside a GFM table cell.
   * - collapse any whitespace run containing a newline to a single space
   * - replace each `|` with `\|`
   * - trim
   * Empty/undefined renders as the em-dash placeholder.
   * @param {unknown} value
   * @returns {string}
   */
  export function escapeCell(value) {
    if (value === undefined || value === null) return EMPTY;
    let s = String(value);
    s = s.replace(/\s*[\r\n]+\s*/g, ' '); // newline-containing whitespace runs -> one space
    s = s.replace(/\|/g, '\\|');
    s = s.trim();
    return s === '' ? EMPTY : s;
  }

  // Stubs — implemented in later tasks. Present so the test module's imports resolve.
  export function renderGoalsMap() {
    throw new Error('renderGoalsMap not implemented yet');
  }
  export function renderToolsMap() {
    throw new Error('renderToolsMap not implemented yet');
  }
  export function renderDangerMap() {
    throw new Error('renderDangerMap not implemented yet');
  }
  ```

  Die Test-Datei importiert `renderGoalsMap` etc., ruft sie in Task 1 aber **nicht** auf — der Import allein ist unkritisch.

- [ ] **Step 4: Test laufen lassen, grün beobachten**

  ```bash
  cd /tmp/wt-agent-guide-maps && node --test scripts/agent-guide/emit-maps.test.mjs
  ```

  Erwartet: PASS — alle `escapeCell`-Tests grün (`# pass 6`, `# fail 0`).

- [ ] **Step 5: Commit**

  ```bash
  cd /tmp/wt-agent-guide-maps && git add scripts/agent-guide/emit-maps.mjs scripts/agent-guide/emit-maps.test.mjs && git commit -m "feat(agent-guide): escapeCell table-safety invariant for S3 maps"
  ```

---

## Task 2: `renderGoalsMap()` — Ziel-Karte (TDD)

Eine Zeile pro `goals.yaml`-Eintrag, **sortiert nach goal `id`**. Spalten: `Ich will …` (`title_de`), `Weg (Flow)` (`flow[].tool` joined mit ` → `), `Tier` (`tierFor(goal.danger)` → emoji + `label_de`), `Guardrails` (`goal.guardrails[]` joined `, `, leer → `—`), `Prompt` (`example_prompt_de`). Header als Zeile 1, LF, single trailing newline. Alle Freitextzellen durch `escapeCell`.

**Files:**
- Modify: `scripts/agent-guide/emit-maps.test.mjs`
- Modify: `scripts/agent-guide/emit-maps.mjs`
- Test: `scripts/agent-guide/emit-maps.test.mjs`

- [ ] **Step 1: Failing test schreiben**

  Hänge an `scripts/agent-guide/emit-maps.test.mjs` einen Fixture-Builder und die Goals-Tests an. Der Fixture-Builder konstruiert eine kleine In-Memory-Registry mit denselben Helfern, die `loadRegistry` zurückgibt (die `render*`-Funktionen nehmen dieses Objekt direkt entgegen — keine Disk-IO).

  ```js
  // ---- shared fixture builder (in-memory registry, mirrors loadRegistry's return shape) ----
  function makeRegistry({ goals = [], tools = [], taxonomy = [], guardrails = [] } = {}) {
    const taxById = new Map(taxonomy.map((t) => [t.id, t]));
    const toolMap = new Map(tools.map((t) => [t.id, t]));
    const grMap = new Map(guardrails.map((g) => [g.id, g]));
    return {
      goals,
      tools,
      taxonomy,
      guardrails,
      components: [],
      tierFor: (id) => taxById.get(id),
      toolById: (id) => toolMap.get(id),
      guardrailById: (id) => grMap.get(id),
    };
  }

  const FIX_TAXONOMY = [
    { id: 'safe', label_de: 'Sicher', emoji: '🟢', meaning_de: 'Ungefährlich.', enforcement_default: 'allow' },
    { id: 'caution', label_de: 'Vorsicht', emoji: '🟡', meaning_de: 'Mit Bedacht.', enforcement_default: 'warn' },
    { id: 'assisted', label_de: 'Nur mit Hilfe', emoji: '🟠', meaning_de: 'Nur begleitet.', enforcement_default: 'confirm' },
    { id: 'forbidden', label_de: 'Niemals allein', emoji: '🔴', meaning_de: 'Nie allein.', enforcement_default: 'block' },
  ];

  const FIX_GUARDRAILS = [
    { id: 'G-PR-ONLY', name_de: 'Nur per PR' },
    { id: 'G-PULL-FIRST', name_de: 'Erst pullen' },
    { id: 'G-ENV-EXPLICIT', name_de: 'ENV immer explizit' },
  ];

  const FIX_TOOLS = [
    { id: 'dev-flow-execute', name_de: 'Plan ausführen', kind: 'skill', summary_de: 'Setzt einen Plan um.', danger: 'caution', guardrails: ['G-PR-ONLY'] },
    { id: 'dev-flow-plan', name_de: 'Plan erstellen', kind: 'skill', summary_de: 'Erstellt einen Plan.', danger: 'caution', guardrails: ['G-PULL-FIRST'] },
  ];

  test('renderGoalsMap: header on line 1, sorted rows, flow joined, empty guardrails as dash', () => {
    const reg = makeRegistry({
      taxonomy: FIX_TAXONOMY,
      guardrails: FIX_GUARDRAILS,
      tools: FIX_TOOLS,
      goals: [
        // intentionally out of id order to prove sort-by-id
        { id: 'g-status', title_de: 'Ich will wissen, ob ein Dienst läuft', flow: [], danger: 'safe', guardrails: [], example_prompt_de: '„Läuft Nextcloud?“' },
        { id: 'g-change-text', title_de: 'Ich will den Website-Text ändern', flow: [{ tool: 'dev-flow-plan' }, { tool: 'dev-flow-execute' }], danger: 'caution', guardrails: ['G-PULL-FIRST', 'G-PR-ONLY'], example_prompt_de: '„Ändere den Begrüßungstext.“' },
      ],
    });
    const out = renderGoalsMap(reg);
    const lines = out.split('\n');
    assert.equal(lines[0], '<!-- DO NOT EDIT — generated by scripts/agent-guide/emit-maps.mjs; edit the registry -->');
    // sorted by id: g-change-text before g-status
    const idxChange = out.indexOf('Ich will den Website-Text ändern');
    const idxStatus = out.indexOf('Ich will wissen, ob ein Dienst läuft');
    assert.ok(idxChange < idxStatus, 'rows sorted by goal id');
    // flow joined with arrow
    assert.ok(out.includes('dev-flow-plan → dev-flow-execute'), 'flow tool ids joined with arrow');
    // tier emoji + label
    assert.ok(out.includes('🟡 Vorsicht'), 'caution tier rendered');
    assert.ok(out.includes('🟢 Sicher'), 'safe tier rendered');
    // empty guardrails -> dash; non-empty joined by comma-space
    assert.ok(out.includes('G-PULL-FIRST, G-PR-ONLY'), 'guardrail ids joined');
    assert.ok(/\|\s*🟢 Sicher\s*\|\s*—\s*\|/.test(out), 'empty guardrails render as em-dash');
    // single trailing newline, LF only
    assert.ok(out.endsWith('\n'), 'ends with newline');
    assert.ok(!out.endsWith('\n\n'), 'single trailing newline');
    assert.ok(!out.includes('\r'), 'LF line endings only');
  });

  test('renderGoalsMap: free-text cell with a pipe stays table-safe', () => {
    const reg = makeRegistry({
      taxonomy: FIX_TAXONOMY,
      guardrails: FIX_GUARDRAILS,
      tools: FIX_TOOLS,
      goals: [
        { id: 'g-pipe', title_de: 'Ich will a | b', flow: [{ tool: 'dev-flow-plan' }], danger: 'safe', guardrails: [], example_prompt_de: '„Fix |broken|\nlogin“' },
      ],
    });
    const out = renderGoalsMap(reg);
    assert.ok(out.includes('Ich will a \\| b'), 'pipe in title escaped');
    assert.ok(out.includes('„Fix \\|broken\\| login“'), 'pipe+newline in prompt escaped & collapsed');
    // every table data row has exactly the right number of unescaped pipes (6 borders for 5 columns)
    const dataRow = out.split('\n').find((l) => l.includes('Ich will a \\| b'));
    const unescaped = dataRow.replace(/\\\|/g, '');
    assert.equal((unescaped.match(/\|/g) || []).length, 6, 'row keeps 5 columns intact');
  });
  ```

- [ ] **Step 2: Test laufen lassen, Fehlschlag beobachten**

  ```bash
  cd /tmp/wt-agent-guide-maps && node --test scripts/agent-guide/emit-maps.test.mjs
  ```

  Erwartet: FAIL — `renderGoalsMap not implemented yet` (Stub wirft).

- [ ] **Step 3: Minimal-Implementierung**

  Ersetze in `scripts/agent-guide/emit-maps.mjs` den `renderGoalsMap`-Stub durch die echte Funktion plus die geteilten Tabellen-Helfer.

  Ersetze diesen Block:

  ```js
  // Stubs — implemented in later tasks. Present so the test module's imports resolve.
  export function renderGoalsMap() {
    throw new Error('renderGoalsMap not implemented yet');
  }
  ```

  durch:

  ```js
  // Render one GFM table row from already-escaped cell strings.
  function row(cells) {
    return `| ${cells.join(' | ')} |`;
  }

  // Resolve a danger id to "emoji label_de" via tierFor; throw (fail-closed) if unknown.
  function tierLabel(reg, dangerId) {
    const t = reg.tierFor(dangerId);
    if (!t) throw new Error(`render: danger id "${dangerId}" has no taxonomy entry`);
    return `${t.emoji} ${t.label_de}`;
  }

  // Join guardrail ids (validating each resolves), em-dash for empty.
  function guardrailIds(reg, ids) {
    if (!ids || ids.length === 0) return EMPTY;
    for (const id of ids) {
      if (!reg.guardrailById(id)) throw new Error(`guardrail id "${id}" has no guardrails.yaml entry`);
    }
    return ids.join(', ');
  }

  /**
   * Render goals-map.md from an in-memory registry (shape of loadRegistry()).
   * @param {ReturnType<import('./load.mjs').loadRegistry>} reg
   * @returns {string}
   */
  export function renderGoalsMap(reg) {
    const goals = [...reg.goals].sort((a, b) => a.id.localeCompare(b.id));
    const out = [];
    out.push(HEADER);
    out.push('');
    out.push('# Ziel-Karte (Goals Map)');
    out.push('');
    out.push('Diese Datei ist die Routing-Karte für Agenten und Operator: Intention → Weg → Gefahr → Regeln.');
    out.push('Die Tier-Emojis (🟢🟡🟠🔴) sind in `danger-map.md` erklärt, die Werkzeug-Ids in `tools-map.md`.');
    out.push('');
    out.push(row(['Ich will …', 'Weg (Flow)', 'Tier', 'Guardrails', 'Prompt']));
    out.push(row(['---', '---', '---', '---', '---']));
    for (const g of goals) {
      const flowIds = (g.flow || []).map((f) => {
        if (!reg.toolById(f.tool)) throw new Error(`renderGoalsMap: flow tool id "${f.tool}" has no tools.yaml entry`);
        return f.tool;
      });
      const flowCell = flowIds.length ? flowIds.join(' → ') : EMPTY;
      out.push(
        row([
          escapeCell(g.title_de),
          escapeCell(flowCell),
          escapeCell(tierLabel(reg, g.danger)),
          escapeCell(guardrailIds(reg, g.guardrails)),
          escapeCell(g.example_prompt_de),
        ])
      );
    }
    return out.join('\n') + '\n';
  }
  ```

  Hinweis: `tierLabel`, `guardrailIds` und `row` sind absichtlich generisch benannt und werden in Tasks 3-4 wiederverwendet; ihre Throw-Strings sind in den Fail-closed-Tests (Task 5) per Regex gepinnt.

- [ ] **Step 4: Test laufen lassen, grün beobachten**

  ```bash
  cd /tmp/wt-agent-guide-maps && node --test scripts/agent-guide/emit-maps.test.mjs
  ```

  Erwartet: PASS — alle `escapeCell`- und `renderGoalsMap`-Tests grün.

- [ ] **Step 5: Commit**

  ```bash
  cd /tmp/wt-agent-guide-maps && git add scripts/agent-guide/emit-maps.mjs scripts/agent-guide/emit-maps.test.mjs && git commit -m "feat(agent-guide): renderGoalsMap for S3 goals-map"
  ```

---

## Task 3: `renderToolsMap()` — gruppiert Skills / Tasks / Agenten (TDD)

Eine Zeile pro `tools.yaml`-Eintrag, in **drei** Sektionen in fester Reihenfolge: **Skills** (`kind: skill`), **Tasks** (`kind: task`), **Agenten** (`kind: agent`). Innerhalb jeder Sektion sortiert nach tool `id`. Spalten: `Id`, `Name` (`name_de`), `Art` (`kind`), `Tier` (`tierFor(tool.danger)`), `Wofür` (`summary_de`), `Guardrails`. So landet `task-oracle` (kind:task) unter "Tasks" und die 6 Routing-Agenten unter "Agenten".

**Files:**
- Modify: `scripts/agent-guide/emit-maps.test.mjs`
- Modify: `scripts/agent-guide/emit-maps.mjs`
- Test: `scripts/agent-guide/emit-maps.test.mjs`

- [ ] **Step 1: Failing test schreiben**

  Hänge an `scripts/agent-guide/emit-maps.test.mjs` an:

  ```js
  test('renderToolsMap: three sections in fixed order Skills/Tasks/Agenten, sorted within', () => {
    const reg = makeRegistry({
      taxonomy: FIX_TAXONOMY,
      guardrails: FIX_GUARDRAILS,
      tools: [
        { id: 'agent-security', name_de: 'Security-Agent', kind: 'agent', summary_de: 'Secrets & Auth.', danger: 'forbidden', guardrails: ['G-ENV-EXPLICIT'] },
        { id: 'agent-ops', name_de: 'Ops-Agent', kind: 'agent', summary_de: 'Status & Logs.', danger: 'safe', guardrails: [] },
        { id: 'task-oracle', name_de: 'Task-Orakel', kind: 'task', summary_de: 'Findet die richtige Task.', danger: 'safe', guardrails: [] },
        { id: 'dev-flow-plan', name_de: 'Plan erstellen', kind: 'skill', summary_de: 'Erstellt einen Plan.', danger: 'caution', guardrails: ['G-PULL-FIRST'] },
        { id: 'dev-flow-execute', name_de: 'Plan ausführen', kind: 'skill', summary_de: 'Setzt einen Plan um.', danger: 'caution', guardrails: ['G-PR-ONLY'] },
      ],
    });
    const out = renderToolsMap(reg);
    assert.equal(out.split('\n')[0], '<!-- DO NOT EDIT — generated by scripts/agent-guide/emit-maps.mjs; edit the registry -->');

    const iSkills = out.indexOf('## Skills');
    const iTasks = out.indexOf('## Tasks');
    const iAgenten = out.indexOf('## Agenten');
    assert.ok(iSkills > -1 && iTasks > -1 && iAgenten > -1, 'all three sections present');
    assert.ok(iSkills < iTasks && iTasks < iAgenten, 'sections in order Skills < Tasks < Agenten');

    // task-oracle lands under Tasks (between iTasks and iAgenten)
    const iOracle = out.indexOf('task-oracle');
    assert.ok(iOracle > iTasks && iOracle < iAgenten, 'task-oracle is in the Tasks section');

    // within Skills, sorted by id: dev-flow-execute before dev-flow-plan
    const iExec = out.indexOf('dev-flow-execute');
    const iPlan = out.indexOf('dev-flow-plan');
    assert.ok(iExec > iSkills && iExec < iTasks, 'dev-flow-execute in Skills section');
    assert.ok(iExec < iPlan, 'skills sorted by id');

    // within Agenten, sorted by id: agent-ops before agent-security
    const iOps = out.indexOf('agent-ops');
    const iSec = out.indexOf('agent-security');
    assert.ok(iOps > iAgenten && iOps < iSec, 'agenten sorted by id');

    // tier + guardrails rendering
    assert.ok(out.includes('🔴 Niemals allein'), 'forbidden tier rendered');
    assert.ok(out.includes('G-ENV-EXPLICIT'), 'tool guardrail id rendered');
    assert.ok(/\|\s*🟢 Sicher\s*\|.*\|\s*—\s*\|/.test(out), 'empty tool guardrails render as em-dash');

    assert.ok(out.endsWith('\n') && !out.endsWith('\n\n'), 'single trailing newline');
    assert.ok(!out.includes('\r'), 'LF only');
  });
  ```

- [ ] **Step 2: Test laufen lassen, Fehlschlag beobachten**

  ```bash
  cd /tmp/wt-agent-guide-maps && node --test scripts/agent-guide/emit-maps.test.mjs
  ```

  Erwartet: FAIL — `renderToolsMap not implemented yet`.

- [ ] **Step 3: Minimal-Implementierung**

  Ersetze in `scripts/agent-guide/emit-maps.mjs` den `renderToolsMap`-Stub:

  ```js
  export function renderToolsMap() {
    throw new Error('renderToolsMap not implemented yet');
  }
  ```

  durch:

  ```js
  // Fixed section order with German headings; key is tool.kind.
  const TOOL_SECTIONS = [
    { kind: 'skill', heading: 'Skills' },
    { kind: 'task', heading: 'Tasks' },
    { kind: 'agent', heading: 'Agenten' },
  ];

  /**
   * Render tools-map.md from an in-memory registry.
   * @param {ReturnType<import('./load.mjs').loadRegistry>} reg
   * @returns {string}
   */
  export function renderToolsMap(reg) {
    const out = [];
    out.push(HEADER);
    out.push('');
    out.push('# Werkzeug-Karte (Tools Map)');
    out.push('');
    out.push('Kompakte Referenz der Skills, Tasks und Routing-Agenten: Id, Art, Gefahren-Tier, Wofür.');
    out.push('Die Tier-Emojis (🟢🟡🟠🔴) sind in `danger-map.md` erklärt.');
    for (const section of TOOL_SECTIONS) {
      const rows = reg.tools
        .filter((t) => t.kind === section.kind)
        .sort((a, b) => a.id.localeCompare(b.id));
      out.push('');
      out.push(`## ${section.heading}`);
      out.push('');
      out.push(row(['Id', 'Name', 'Art', 'Tier', 'Wofür', 'Guardrails']));
      out.push(row(['---', '---', '---', '---', '---', '---']));
      for (const t of rows) {
        out.push(
          row([
            escapeCell(t.id),
            escapeCell(t.name_de),
            escapeCell(t.kind),
            escapeCell(tierLabel(reg, t.danger)),
            escapeCell(t.summary_de),
            escapeCell(guardrailIds(reg, t.guardrails)),
          ])
        );
      }
    }
    return out.join('\n') + '\n';
  }
  ```

  Hinweis: `tierLabel`, `row`, `guardrailIds`, `EMPTY` und `escapeCell` existieren bereits aus Task 1/2. `tierLabel`'s Throw-Meldung beginnt mit `render: danger id …` (generisch, nicht `renderGoalsMap:`-spezifisch) — die Fail-closed-Tests in Task 5 pinnen genau diesen Wortlaut.

- [ ] **Step 4: Test laufen lassen, grün beobachten**

  ```bash
  cd /tmp/wt-agent-guide-maps && node --test scripts/agent-guide/emit-maps.test.mjs
  ```

  Erwartet: PASS — Goals- und Tools-Tests grün.

- [ ] **Step 5: Commit**

  ```bash
  cd /tmp/wt-agent-guide-maps && git add scripts/agent-guide/emit-maps.mjs scripts/agent-guide/emit-maps.test.mjs && git commit -m "feat(agent-guide): renderToolsMap grouped Skills/Tasks/Agenten for S3"
  ```

---

## Task 4: `renderDangerMap()` — transitive Guardrail-Tier-Ableitung (TDD)

Der subtilste Korrektheitspunkt #2. Die 4 Tiers in kanonischer Reihenfolge `safe → caution → assisted → forbidden`, jeweils als Sektion mit Heading (`emoji label_de` + `meaning_de`), einer `enforcement_default`-Zeile, einer Bullet-Liste der **Goals** des Tiers, der **Tools** des Tiers und der **Guardrails**, die **transitiv** unter das Tier fallen — also jede Guardrail, die von mindestens einem Goal oder Tool dieses Tiers referenziert wird (id + `name_de`), sortiert nach guardrail id, **innerhalb des Tiers de-dupliziert**. Eine Guardrail, die von zwei Tiers referenziert wird, erscheint unter **beiden**.

**Files:**
- Modify: `scripts/agent-guide/emit-maps.test.mjs`
- Modify: `scripts/agent-guide/emit-maps.mjs`
- Test: `scripts/agent-guide/emit-maps.test.mjs`

- [ ] **Step 1: Failing test schreiben**

  Hänge an `scripts/agent-guide/emit-maps.test.mjs` an. Die Fixture konstruiert bewusst eine Guardrail (`G-PULL-FIRST`), die ein 🟡-Goal **und** ein 🔴-Tool nutzen → sie muss unter beiden Tiers erscheinen; und eine Guardrail (`G-DUP`), die von zwei verschiedenen Goals desselben Tiers genutzt wird → de-dupliziert auf genau ein Vorkommen pro Tier.

  ```js
  test('renderDangerMap: 4 tiers in canonical order, transitive guardrail bucketing, de-dup', () => {
    const reg = makeRegistry({
      taxonomy: FIX_TAXONOMY,
      guardrails: [
        { id: 'G-PR-ONLY', name_de: 'Nur per PR' },
        { id: 'G-PULL-FIRST', name_de: 'Erst pullen' },
        { id: 'G-ENV-EXPLICIT', name_de: 'ENV immer explizit' },
        { id: 'G-DUP', name_de: 'Doppelt referenziert' },
      ],
      tools: [
        // a forbidden tool that references G-PULL-FIRST + G-ENV-EXPLICIT
        { id: 'agent-security', name_de: 'Security-Agent', kind: 'agent', summary_de: 'Secrets.', danger: 'forbidden', guardrails: ['G-PULL-FIRST', 'G-ENV-EXPLICIT'] },
      ],
      goals: [
        // caution goal referencing G-PULL-FIRST (so G-PULL-FIRST appears under caution AND forbidden)
        { id: 'g-change', title_de: 'Ich will Text ändern', flow: [], danger: 'caution', guardrails: ['G-PULL-FIRST', 'G-PR-ONLY'], example_prompt_de: 'x' },
        // two caution goals both referencing G-DUP -> de-dup within caution
        { id: 'g-a', title_de: 'A', flow: [], danger: 'caution', guardrails: ['G-DUP'], example_prompt_de: 'x' },
        { id: 'g-b', title_de: 'B', flow: [], danger: 'caution', guardrails: ['G-DUP'], example_prompt_de: 'x' },
        // a safe goal with no guardrails
        { id: 'g-status', title_de: 'Ich will Status', flow: [], danger: 'safe', guardrails: [], example_prompt_de: 'x' },
      ],
    });
    const out = renderDangerMap(reg);
    assert.equal(out.split('\n')[0], '<!-- DO NOT EDIT — generated by scripts/agent-guide/emit-maps.mjs; edit the registry -->');

    // canonical tier order
    const iSafe = out.indexOf('🟢 Sicher');
    const iCaution = out.indexOf('🟡 Vorsicht');
    const iAssisted = out.indexOf('🟠 Nur mit Hilfe');
    const iForbidden = out.indexOf('🔴 Niemals allein');
    assert.ok(iSafe < iCaution && iCaution < iAssisted && iAssisted < iForbidden, 'tiers in canonical order');

    // enforcement_default surfaced
    assert.ok(out.includes('enforcement_default'), 'enforcement default labeled');
    assert.ok(out.includes('block'), 'forbidden enforcement_default rendered');

    // helper: slice the section text for a tier (from its heading to the next tier heading or EOF)
    const sliceTier = (label) => {
      const start = out.indexOf(label);
      const nexts = ['🟢 Sicher', '🟡 Vorsicht', '🟠 Nur mit Hilfe', '🔴 Niemals allein']
        .map((l) => out.indexOf(l)).filter((i) => i > start);
      const end = nexts.length ? Math.min(...nexts) : out.length;
      return out.slice(start, end);
    };

    const caution = sliceTier('🟡 Vorsicht');
    const forbidden = sliceTier('🔴 Niemals allein');

    // transitive: G-PULL-FIRST appears under BOTH caution and forbidden
    assert.ok(caution.includes('G-PULL-FIRST'), 'G-PULL-FIRST under caution (via goal)');
    assert.ok(forbidden.includes('G-PULL-FIRST'), 'G-PULL-FIRST under forbidden (via tool)');

    // de-dup: G-DUP appears exactly once within caution
    assert.equal((caution.match(/G-DUP/g) || []).length, 1, 'G-DUP de-duplicated within caution');

    // goals/tools bucketed under their own tier
    assert.ok(caution.includes('g-change') && caution.includes('Ich will Text ändern'), 'caution goal listed');
    assert.ok(forbidden.includes('agent-security'), 'forbidden tool listed');

    // sorted by guardrail id within forbidden: G-ENV-EXPLICIT before G-PULL-FIRST
    assert.ok(forbidden.indexOf('G-ENV-EXPLICIT') < forbidden.indexOf('G-PULL-FIRST'), 'guardrails sorted by id');

    assert.ok(out.endsWith('\n') && !out.endsWith('\n\n'), 'single trailing newline');
    assert.ok(!out.includes('\r'), 'LF only');
  });
  ```

- [ ] **Step 2: Test laufen lassen, Fehlschlag beobachten**

  ```bash
  cd /tmp/wt-agent-guide-maps && node --test scripts/agent-guide/emit-maps.test.mjs
  ```

  Erwartet: FAIL — `renderDangerMap not implemented yet`.

- [ ] **Step 3: Minimal-Implementierung**

  Ersetze in `scripts/agent-guide/emit-maps.mjs` den `renderDangerMap`-Stub:

  ```js
  export function renderDangerMap() {
    throw new Error('renderDangerMap not implemented yet');
  }
  ```

  durch:

  ```js
  // Canonical tier order, independent of taxonomy.yaml file order.
  export const TIER_ORDER = ['safe', 'caution', 'assisted', 'forbidden'];

  /**
   * Render danger-map.md from an in-memory registry.
   * Guardrail tiers are derived transitively from referencing goals/tools.
   * @param {ReturnType<import('./load.mjs').loadRegistry>} reg
   * @returns {string}
   */
  export function renderDangerMap(reg) {
    const out = [];
    out.push(HEADER);
    out.push('');
    out.push('# Gefahren-Karte (Danger Map)');
    out.push('');
    out.push('Die vier Gefahren-Stufen und was unter jede fällt — die Vorschau auf den Enforcement-Kontrakt.');
    out.push('Hinweis: Eine Guardrail hat **keine** eigene Stufe; sie erscheint unter **jeder** Stufe, deren');
    out.push('Ziele/Werkzeuge sie referenzieren (transitiv) — also ggf. unter mehreren Stufen.');

    for (const tierId of TIER_ORDER) {
      const tier = reg.tierFor(tierId);
      if (!tier) throw new Error(`renderDangerMap: taxonomy has no entry for tier "${tierId}"`);

      const goalsHere = reg.goals
        .filter((g) => g.danger === tierId)
        .sort((a, b) => a.id.localeCompare(b.id));
      const toolsHere = reg.tools
        .filter((t) => t.danger === tierId)
        .sort((a, b) => a.id.localeCompare(b.id));

      // transitive, de-duplicated guardrail ids referenced by goals/tools of this tier
      const grSet = new Set();
      for (const g of goalsHere) for (const id of g.guardrails || []) grSet.add(id);
      for (const t of toolsHere) for (const id of t.guardrails || []) grSet.add(id);
      const grIds = [...grSet].sort((a, b) => a.localeCompare(b));

      out.push('');
      out.push(`## ${tier.emoji} ${tier.label_de} — ${tier.meaning_de}`);
      out.push('');
      out.push(`**enforcement_default:** \`${tier.enforcement_default}\``);
      out.push('');
      out.push('**Ziele:**');
      if (goalsHere.length === 0) {
        out.push('- —');
      } else {
        for (const g of goalsHere) out.push(`- \`${g.id}\` — ${escapeCell(g.title_de)}`);
      }
      out.push('');
      out.push('**Werkzeuge:**');
      if (toolsHere.length === 0) {
        out.push('- —');
      } else {
        for (const t of toolsHere) out.push(`- \`${t.id}\` — ${escapeCell(t.name_de)}`);
      }
      out.push('');
      out.push('**Guardrails (transitiv):**');
      if (grIds.length === 0) {
        out.push('- —');
      } else {
        for (const id of grIds) {
          const gr = reg.guardrailById(id);
          if (!gr) throw new Error(`renderDangerMap: guardrail id "${id}" has no guardrails.yaml entry`);
          out.push(`- \`${id}\` — ${escapeCell(gr.name_de)}`);
        }
      }
    }
    return out.join('\n') + '\n';
  }
  ```

  Hinweis: `TIER_ORDER` wird exportiert, damit der CLI-Pfad (Task 6) seine `Wrote N tiers`-Zählung konsistent aus derselben Konstante zieht.

- [ ] **Step 4: Test laufen lassen, grün beobachten**

  ```bash
  cd /tmp/wt-agent-guide-maps && node --test scripts/agent-guide/emit-maps.test.mjs
  ```

  Erwartet: PASS — Goals-, Tools- und Danger-Tests grün.

- [ ] **Step 5: Commit**

  ```bash
  cd /tmp/wt-agent-guide-maps && git add scripts/agent-guide/emit-maps.mjs scripts/agent-guide/emit-maps.test.mjs && git commit -m "feat(agent-guide): renderDangerMap with transitive guardrail-tier derivation"
  ```

---

## Task 5: Fail-closed + Determinismus (Regression-/Characterization-Pin)

**Diese Task hat bewusst keine Rot-Phase.** Die hier gepinnten Invarianten — Fail-closed-Throws (dangling `flow.tool`, fehlendes `goal.danger`-Tier, fehlende Guardrail-id) und Byte-Determinismus — werden bereits durch die Implementierung in Tasks 2-4 garantiert (die Throws leben in `tierLabel`, `guardrailIds` und dem flow-Loop; Determinismus folgt aus den stabilen `localeCompare`-Sorts). Diese Task ist eine **Regression-/Characterization-Pin**: Sie friert das Verhalten als ausführbare Spezifikation ein (Spec §8.1 listet Fail-closed und Determinismus als First-Class-Test-Pflichten). Die Tests müssen daher **direkt grün** sein — schlägt eine Fehlermeldung nicht an, ist eine der `throw new Error(...)`-Strings aus Task 2/4 abgewichen und muss an die Regex angeglichen werden (nicht umgekehrt).

Der Determinismus-Test ist gehärtet: Er rendert aus **zwei separat konstruierten Registries**, deren Goal-Arrays in **unterschiedlicher** Eingabereihenfolge stehen — das beweist, dass `sort-by-id` die Reihenfolge normalisiert, nicht bloß, dass `render` eine reine Funktion **eines** Objekts ist.

**Files:**
- Modify: `scripts/agent-guide/emit-maps.test.mjs`
- Test: `scripts/agent-guide/emit-maps.test.mjs`

- [ ] **Step 1: Regression-Pin-Tests schreiben**

  Hänge an `scripts/agent-guide/emit-maps.test.mjs` an:

  ```js
  test('fail-closed: a flow.tool with no tools.yaml entry throws', () => {
    const reg = makeRegistry({
      taxonomy: FIX_TAXONOMY,
      guardrails: FIX_GUARDRAILS,
      tools: [],
      goals: [
        { id: 'g-x', title_de: 'X', flow: [{ tool: 'does-not-exist' }], danger: 'safe', guardrails: [], example_prompt_de: 'x' },
      ],
    });
    assert.throws(() => renderGoalsMap(reg), /flow tool id "does-not-exist" has no tools\.yaml entry/);
  });

  test('fail-closed: a goal.danger with no taxonomy entry throws', () => {
    const reg = makeRegistry({
      taxonomy: [],
      guardrails: FIX_GUARDRAILS,
      tools: [],
      goals: [
        { id: 'g-x', title_de: 'X', flow: [], danger: 'nonexistent-tier', guardrails: [], example_prompt_de: 'x' },
      ],
    });
    assert.throws(() => renderGoalsMap(reg), /danger id "nonexistent-tier" has no taxonomy entry/);
  });

  test('fail-closed: a guardrail id with no guardrails.yaml entry throws', () => {
    const reg = makeRegistry({
      taxonomy: FIX_TAXONOMY,
      guardrails: [],
      tools: [],
      goals: [
        { id: 'g-x', title_de: 'X', flow: [], danger: 'safe', guardrails: ['G-MISSING'], example_prompt_de: 'x' },
      ],
    });
    assert.throws(() => renderGoalsMap(reg), /guardrail id "G-MISSING" has no guardrails\.yaml entry/);
  });

  test('determinism: two separately-constructed registries with different input order render byte-identically', () => {
    const goalsA = [
      { id: 'g-b', title_de: 'B', flow: [{ tool: 'dev-flow-plan' }], danger: 'caution', guardrails: ['G-PULL-FIRST'], example_prompt_de: 'x' },
      { id: 'g-a', title_de: 'A', flow: [], danger: 'safe', guardrails: [], example_prompt_de: 'y' },
    ];
    // same goals, DIFFERENT input order — proves sort-by-id normalizes order, not mere purity
    const goalsB = [
      { id: 'g-a', title_de: 'A', flow: [], danger: 'safe', guardrails: [], example_prompt_de: 'y' },
      { id: 'g-b', title_de: 'B', flow: [{ tool: 'dev-flow-plan' }], danger: 'caution', guardrails: ['G-PULL-FIRST'], example_prompt_de: 'x' },
    ];
    const toolsA = [
      { id: 'dev-flow-execute', name_de: 'Plan ausführen', kind: 'skill', summary_de: 'Setzt einen Plan um.', danger: 'caution', guardrails: ['G-PR-ONLY'] },
      { id: 'dev-flow-plan', name_de: 'Plan erstellen', kind: 'skill', summary_de: 'Erstellt einen Plan.', danger: 'caution', guardrails: ['G-PULL-FIRST'] },
    ];
    const toolsB = [toolsA[1], toolsA[0]]; // reversed input order
    const regA = makeRegistry({ taxonomy: FIX_TAXONOMY, guardrails: FIX_GUARDRAILS, tools: toolsA, goals: goalsA });
    const regB = makeRegistry({ taxonomy: FIX_TAXONOMY, guardrails: FIX_GUARDRAILS, tools: toolsB, goals: goalsB });
    assert.equal(renderGoalsMap(regA), renderGoalsMap(regB));
    assert.equal(renderToolsMap(regA), renderToolsMap(regB));
    assert.equal(renderDangerMap(regA), renderDangerMap(regB));
  });
  ```

- [ ] **Step 2: Test laufen lassen, grün beobachten (kein Rot — Regression-Pin)**

  ```bash
  cd /tmp/wt-agent-guide-maps && node --test scripts/agent-guide/emit-maps.test.mjs
  ```

  Erwartet: PASS — alle Tests grün. (Falls eine Fehlermeldung nicht matcht, passe die `throw new Error(...)`-Strings in `emit-maps.mjs` an die Regex an — sie sind in Task 2/4 exakt so geschrieben; ändere die Tests nicht.)

- [ ] **Step 3: Commit**

  ```bash
  cd /tmp/wt-agent-guide-maps && git add scripts/agent-guide/emit-maps.test.mjs && git commit -m "test(agent-guide): fail-closed + sort-normalizing determinism pins for S3 emitter"
  ```

---

## Task 6: CLI-Pfad des Emitters (validate → load → write)

Jetzt verdrahtest Du den ausführbaren Teil: Pfadauflösung relativ zum Modul (wie `build-test-inventory.sh` `REPO_ROOT` aus `BASH_SOURCE` Zeile 5 ableitet), `validateRegistry` zuerst (Fail-closed vor jedem Write), dann `loadRegistry`, dann die drei Renderer schreiben, plus eine `Wrote …`-Zusammenfassungszeile pro Datei (wie `build-test-inventory.sh` Zeile 49). Solange S1 nicht gemerged ist, importiert der CLI-Teil den Stand-in aus Task 0 und überspringt `validateRegistry` (auskommentiert); Task 9 schaltet beides scharf.

**Files:**
- Modify: `scripts/agent-guide/emit-maps.mjs`

- [ ] **Step 1: CLI-Block + Imports anhängen**

  Füge am **Anfang** von `scripts/agent-guide/emit-maps.mjs` (direkt unter dem einleitenden Kommentar, vor `export const HEADER`) die Imports und den Stand-in-Hinweis ein:

  ```js
  import { mkdir, writeFile } from 'node:fs/promises';
  import { dirname, join } from 'node:path';
  import { fileURLToPath, pathToFileURL } from 'node:url';

  // S1's shared reader. Until S1 merges, we use the local stand-in (Task 0); the final
  // task switches this import to './load.mjs' and deletes the stand-in. Keep ONE of the two.
  import { loadRegistry } from './_load-standin.mjs';
  // import { loadRegistry } from './load.mjs';            // <-- enable after S1 merges
  // import { validateRegistry } from './validate.mjs';    // <-- enable after F+B/S1 (see Task 9)
  ```

  Füge am **Ende** der Datei den CLI-Block an. Die `danger-map`-Zählung nutzt `TIER_ORDER.length` (immer 4) — das ist exakt das, was `renderDangerMap` emittiert, anders als `reg.taxonomy.length`, das bei Drift irreführend wäre.

  ```js
  /**
   * Build all three maps and write them under docs/agent-guide/maps/.
   * Validation happens at the CLI entrypoint (fail-closed), not here.
   * @param {{ registryDir: string, mapsDir: string }} paths
   */
  export async function emitAll({ registryDir, mapsDir }) {
    const reg = loadRegistry(registryDir);
    const files = [
      { name: 'goals-map.md', body: renderGoalsMap(reg), count: reg.goals.length, unit: 'goal rows' },
      { name: 'tools-map.md', body: renderToolsMap(reg), count: reg.tools.length, unit: 'tool rows' },
      { name: 'danger-map.md', body: renderDangerMap(reg), count: TIER_ORDER.length, unit: 'tiers' },
    ];
    await mkdir(mapsDir, { recursive: true });
    for (const f of files) {
      const dest = join(mapsDir, f.name);
      await writeFile(dest, f.body, 'utf8');
      console.log(`Wrote ${f.count} ${f.unit} to ${dest}`);
    }
  }

  // CLI entrypoint (robust against paths with spaces via pathToFileURL).
  if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const here = dirname(fileURLToPath(import.meta.url));        // scripts/agent-guide
    const repoRoot = join(here, '..', '..');                    // repo root
    const registryDir = join(repoRoot, 'docs', 'agent-guide', 'registry');
    const mapsDir = join(repoRoot, 'docs', 'agent-guide', 'maps');

    // Fail-closed: validate before writing anything (once validateRegistry is wired in Task 9).
    // try {
    //   await validateRegistry(registryDir, repoRoot);
    // } catch (err) { console.error(err.message); process.exit(1); }

    emitAll({ registryDir, mapsDir }).catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
  }
  ```

  Wichtig: Der Test-Pfad (`scripts/agent-guide/emit-maps.test.mjs`) ruft ausschließlich die reinen `render*`/`escapeCell`-Funktionen und nie den CLI-Block oder `emitAll` auf — die Tests bleiben damit unabhängig von der echten Registry und vom Stand-in.

- [ ] **Step 2: Tests laufen weiter grün**

  ```bash
  cd /tmp/wt-agent-guide-maps && node --test scripts/agent-guide/emit-maps.test.mjs
  ```

  Erwartet: PASS — die reinen Funktionen sind unverändert; die neuen Imports/CLI berühren die Tests nicht.

- [ ] **Step 3: CLI lokal smoke-testen (gegen den Stand-in)**

  Nur möglich, wenn die F+B-Registry bereits im Worktree liegt; vor F+B existiert `docs/agent-guide/registry/` nicht. Prüfe defensiv:

  ```bash
  cd /tmp/wt-agent-guide-maps && if [ -f docs/agent-guide/registry/taxonomy.yaml ]; then node scripts/agent-guide/emit-maps.mjs && echo "CLI OK (stand-in)"; else echo "registry not present yet (pre-F+B) — CLI smoke deferred to Task 9/10"; fi
