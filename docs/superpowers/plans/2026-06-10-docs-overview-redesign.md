# Docs-Übersicht Redesign — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Docs-Startseite und Kategorie-Unterseiten menschlich nutzbar machen — SVG-Graph raus, Hub+Gruppen rein, 171 → ~86 Skills dedupliziert, 7 Zweck-Kategorien mit JS-Filter.

**Architecture:** Alle Änderungen in den drei Build-Skripten: `templates.mjs` (neue Render-Funktionen), `theme.mjs` (neue CSS-Klassen + Filter-JS), `build-docs.mjs` (neue Renderer verdrahten). Keine neuen Dateien, kein neues Framework. Die generierten HTML-Dateien bleiben statisch.

**Tech Stack:** Node.js 22 (node:test), ESM, Cheerio (nur in build-docs.mjs), CSS Custom Properties (bestehendes Design-System).

---

## Datei-Übersicht

| Datei | Änderung |
|-------|----------|
| `scripts/docs-gen/theme.mjs` | Neue CSS-Klassen + `CAT_FILTER_JS` + `clientJs()` Update |
| `scripts/docs-gen/theme.test.mjs` | Tests für neue Klassen + Filter-JS |
| `scripts/docs-gen/templates.mjs` | `deduplicateSkills`, `categoryForSkill`, `renderSkillsIndex`, `renderAgentsIndex`, `renderDocsIndex`, neues `renderLanding`; Graph-Importe entfernen |
| `scripts/docs-gen/templates.test.mjs` | Tests für alle neuen Funktionen; bestehende `renderLanding`-Tests aktualisieren |
| `scripts/build-docs.mjs` | Neue Renderer für Schritt 7 verdrahten; Dedup-Stats in Build-Report |

---

## Task 1: CSS-Klassen und Filter-JS in theme.mjs

**Files:**
- Modify: `scripts/docs-gen/theme.mjs`
- Test: `scripts/docs-gen/theme.test.mjs`

- [x] **Schritt 1.1: Test schreiben (schlägt fehl)**

Ans Ende von `scripts/docs-gen/theme.test.mjs` hinzufügen:

```js
test('editorialCss: contains hub and skill-filter class hooks', () => {
  const css = editorialCss();
  assert.ok(css.includes('.hub-tiles'), '.hub-tiles grid');
  assert.ok(css.includes('.hub-tile'), '.hub-tile card');
  assert.ok(css.includes('.skill-star'), '.skill-star repo highlight');
  assert.ok(css.includes('.cat-filter-row'), '.cat-filter-row button strip');
  assert.ok(css.includes('.cat-filter-btn'), '.cat-filter-btn button');
  assert.ok(css.includes('.agent-group-header'), '.agent-group-header');
  assert.ok(css.includes('.doc-group-header'), '.doc-group-header');
});

test('clientJs: includes the category filter script', () => {
  const js = clientJs();
  assert.ok(js.includes('cat-filter-btn'), 'category filter JS included');
  assert.ok(js.includes('data-category'), 'references data-category attribute');
});
```

- [x] **Schritt 1.2: Test laufen lassen — muss fehlschlagen**

```bash
node --test scripts/docs-gen/theme.test.mjs
```

Erwartet: FAIL auf den beiden neuen Tests.

- [x] **Schritt 1.3: Neue CSS-Klassen in editorialCss() hinzufügen**

In `scripts/docs-gen/theme.mjs`, direkt vor der Zeile `${GRAPH_CSS}` am Ende der CSS-Template-String in `editorialCss()` einfügen:

```css
/* ── hub landing tiles ── */
.hub-tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin:1.5rem 0 2.2rem}
@media(max-width:600px){.hub-tiles{grid-template-columns:1fr}}
.hub-tile{display:flex;flex-direction:column;align-items:flex-start;background:var(--paper);
  border:1px solid var(--line);border-radius:10px;padding:1.3rem 1.4rem;
  text-decoration:none;color:inherit;transition:border-color .15s,transform .15s}
.hub-tile:hover{border-color:var(--accent-line);transform:translateY(-2px)}
.hub-tile-count{font-family:var(--font-serif);font-size:2rem;font-weight:900;
  color:var(--accent);line-height:1;margin:.15rem 0 .25rem}
.hub-tile-label{font-size:.72rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;
  color:var(--ink-mute)}
.hub-tile-name{font-size:1rem;font-weight:600;color:var(--ink);margin-top:.2rem}

/* ── skill star (repo-eigene Skills) ── */
.skill-star{color:var(--repo-fg);font-size:.8em;margin-right:.2em}
.section-card.skill-repo{border-left:2px solid var(--repo-line)}

/* ── category filter strip (skills.html) ── */
.cat-filter-row{display:flex;flex-wrap:wrap;gap:.5rem;margin:1.2rem 0 1.8rem}
.cat-filter-btn{background:var(--paper-2);border:1px solid var(--line);border-radius:999px;
  padding:.3em .9em;font-size:.78rem;font-weight:600;color:var(--ink-mute);
  cursor:pointer;transition:all .15s;font-family:var(--font-sans)}
.cat-filter-btn:hover{border-color:var(--accent-line);color:var(--accent)}
.cat-filter-btn.active{background:var(--accent-bg);border-color:var(--accent-line);
  color:var(--accent)}

/* ── agent group + doc group headers ── */
.agent-group-header,.doc-group-header{font-size:.72rem;font-weight:700;letter-spacing:.1em;
  text-transform:uppercase;color:var(--ink-mute);margin:2rem 0 .8rem;
  padding-bottom:.4rem;border-bottom:1px solid var(--line-soft)}
.agent-group-header:first-child,.doc-group-header:first-child{margin-top:.5rem}
```

- [x] **Schritt 1.4: CAT_FILTER_JS hinzufügen**

In `scripts/docs-gen/theme.mjs` nach der `SEARCH_JS`-Konstante einfügen:

```js
/** Category filter for skills.html — toggles .section-card visibility by data-category. */
export const CAT_FILTER_JS = `
(function(){
  var btns=document.querySelectorAll('.cat-filter-btn');
  if(!btns.length)return;
  btns.forEach(function(btn){
    btn.addEventListener('click',function(){
      var cat=btn.getAttribute('data-cat');
      btns.forEach(function(b){b.classList.remove('active');});
      btn.classList.add('active');
      document.querySelectorAll('.section-card[data-category]').forEach(function(card){
        card.style.display=(cat==='all'||card.getAttribute('data-category')===cat)?'':'none';
      });
    });
  });
})();`;
```

- [x] **Schritt 1.5: clientJs() updaten**

In `scripts/docs-gen/theme.mjs`, die `clientJs()`-Funktion ändern:

```js
export function clientJs() {
  return [SUBST_JS, COPY_JS, DIAGRAM_JS, SEARCH_JS, CAT_FILTER_JS, GRAPH_JS].join('\n');
}
```

- [x] **Schritt 1.6: Tests laufen lassen — müssen bestehen**

```bash
node --test scripts/docs-gen/theme.test.mjs
```

Erwartet: alle Tests PASS.

- [x] **Schritt 1.7: Commit**

```bash
git add scripts/docs-gen/theme.mjs scripts/docs-gen/theme.test.mjs
git commit -m "feat(docs-gen): hub CSS classes + cat-filter JS"
```

---

## Task 2: Dedup + Kategorisierung in templates.mjs

**Files:**
- Modify: `scripts/docs-gen/templates.mjs`
- Test: `scripts/docs-gen/templates.test.mjs`

- [x] **Schritt 2.1: Tests schreiben (schlagen fehl)**

Ans Ende von `scripts/docs-gen/templates.test.mjs` hinzufügen:

```js
import {
  renderPage,
  provenanceBadge,
  renderSectionIndex,
  renderLanding,
  deduplicateSkills,
  categoryForSkill,
} from './templates.mjs';

// ─── deduplicateSkills ────────────────────────────────────────────────────────

const makeSkillPage = (name, plugin, version, provenance) => ({
  slug: `${plugin}--${name}`,
  type: 'skill',
  provenance: provenance ?? `${plugin}@${version}`,
  name,
  title: name,
  description: '',
  domain: null,
  bodyMarkdown: '',
  sourcePath: `/x/${plugin}/${version}/skills/${name}/SKILL.md`,
  outRelPath: `skills/${plugin}--${name}.html`,
});

test('deduplicateSkills: keeps only the newest version per (plugin, name) pair', () => {
  const old = makeSkillPage('brainstorming', 'superpowers', '4.0.0');
  const newer = makeSkillPage('brainstorming', 'superpowers', '5.1.0');
  const unrelated = makeSkillPage('tdd', 'superpowers', '5.1.0');
  const result = deduplicateSkills([old, newer, unrelated]);
  assert.equal(result.length, 2, 'one entry per unique skill name');
  assert.ok(result.some(p => p.provenance === 'superpowers@5.1.0' && p.name === 'brainstorming'),
    'newer version kept');
  assert.ok(!result.some(p => p.provenance === 'superpowers@4.0.0'),
    'older version removed');
});

test('deduplicateSkills: repo skills are kept as-is (no version conflict)', () => {
  const repoSkill = {
    slug: 'dev-flow-plan',
    type: 'skill',
    provenance: 'repo',
    name: 'dev-flow-plan',
    title: 'dev-flow-plan',
    description: '',
    domain: null,
    bodyMarkdown: '',
    sourcePath: '/x/.claude/skills/dev-flow-plan/SKILL.md',
    outRelPath: 'skills/dev-flow-plan.html',
  };
  const pluginSkill = makeSkillPage('brainstorming', 'superpowers', '5.1.0');
  const result = deduplicateSkills([repoSkill, pluginSkill]);
  assert.equal(result.length, 2, 'both retained');
  assert.ok(result.some(p => p.provenance === 'repo'), 'repo skill kept');
});

test('deduplicateSkills: same skill from two different plugins both kept', () => {
  const a = makeSkillPage('using-git-worktrees', 'superpowers', '5.1.0');
  const b = makeSkillPage('using-git-worktrees', 'update-dependencies', '1.0.0');
  const result = deduplicateSkills([a, b]);
  assert.equal(result.length, 2, 'different plugin → different key → both kept');
});

// ─── categoryForSkill ─────────────────────────────────────────────────────────

test('categoryForSkill: maps known plugin names to correct categories', () => {
  const sup = { ...pluginSkillPage, provenance: 'superpowers@5.1.0', name: 'brainstorming' };
  assert.equal(categoryForSkill(sup), 'dev-workflow');

  const hf = { ...pluginSkillPage, provenance: 'huggingface-skills@1.0.3', name: 'hf-cli' };
  assert.equal(categoryForSkill(hf), 'ki-ml');

  const chrome = { ...pluginSkillPage, provenance: 'chrome-devtools-mcp@1.2.0', name: 'a11y-debugging' };
  assert.equal(categoryForSkill(chrome), 'browser');

  const pluginDev = { ...pluginSkillPage, provenance: 'plugin-dev@1.0.0', name: 'agent-development' };
  assert.equal(categoryForSkill(pluginDev), 'plugin-bau');

  const mcp = { ...pluginSkillPage, provenance: 'mcp-server-dev@1.0.0', name: 'build-mcp-server' };
  assert.equal(categoryForSkill(mcp), 'mcp-api');
});

test('categoryForSkill: mcp-cli from superpowers-lab → mcp-api despite plugin', () => {
  const mcpCli = { ...pluginSkillPage, provenance: 'superpowers-lab@1.0.0', name: 'mcp-cli' };
  assert.equal(categoryForSkill(mcpCli), 'mcp-api');
});

test('categoryForSkill: repo dev-flow skills → dev-workflow', () => {
  const dfp = { slug: 'dev-flow-plan', type: 'skill', provenance: 'repo', name: 'dev-flow-plan',
    title: 'dev-flow-plan', description: '', domain: null, bodyMarkdown: '',
    sourcePath: '/x/SKILL.md', outRelPath: 'skills/dev-flow-plan.html' };
  assert.equal(categoryForSkill(dfp), 'dev-workflow');
});

test('categoryForSkill: repo infra skills → bachelorprojekt-infra', () => {
  const sk = { slug: 'fleet-ops', type: 'skill', provenance: 'repo', name: 'fleet-ops',
    title: 'fleet-ops', description: '', domain: null, bodyMarkdown: '',
    sourcePath: '/x/SKILL.md', outRelPath: 'skills/fleet-ops.html' };
  assert.equal(categoryForSkill(sk), 'bachelorprojekt-infra');
});

test('categoryForSkill: unknown plugin → fallback claude-code', () => {
  const unknown = { ...pluginSkillPage, provenance: 'some-new-plugin@1.0.0', name: 'some-skill' };
  assert.equal(categoryForSkill(unknown), 'claude-code');
});
```

**Hinweis:** Den `import`-Block am Anfang von `templates.test.mjs` um `deduplicateSkills` und `categoryForSkill` erweitern.

- [x] **Schritt 2.2: Tests laufen lassen — müssen fehlschlagen**

```bash
node --test scripts/docs-gen/templates.test.mjs 2>&1 | head -30
```

Erwartet: FAIL mit "deduplicateSkills is not a function" o.ä.

- [x] **Schritt 2.3: Kategorien-Mapping und Hilfsfunktionen in templates.mjs hinzufügen**

Direkt nach den `import`-Zeilen (nach `import { renderGraphSvg } from './graph-svg.mjs';`) in `scripts/docs-gen/templates.mjs` einfügen:

```js
import { pluginNameOf } from './registry.mjs';

/**
 * Maps plugin name → skill category slug.
 * Skills without a matching plugin entry fall back to 'claude-code'.
 */
const PLUGIN_SKILL_CATEGORIES = {
  'superpowers': 'dev-workflow',
  'superpowers-lab': 'claude-code',          // mcp-cli overridden per-name below
  'superpowers-chrome': 'browser',
  'superpowers-developing-for-claude-code': 'claude-code',
  'huggingface-skills': 'ki-ml',
  'chrome-devtools-mcp': 'browser',
  'plugin-dev': 'plugin-bau',
  'skill-creator': 'plugin-bau',
  'hookify': 'plugin-bau',
  'mcp-server-dev': 'mcp-api',
  'postman': 'mcp-api',
  'claude-code-setup': 'claude-code',
  'claude-md-management': 'claude-code',
  'remember': 'claude-code',
  'desktop-commander': 'claude-code',
  'frontend-design': 'claude-code',
  'playground': 'claude-code',
};

/** Per-skill overrides that take priority over the plugin mapping. */
const SKILL_NAME_OVERRIDES = {
  'mcp-cli': 'mcp-api',
};

/** Repo skills mapped by skill name → category. */
const REPO_SKILL_CATEGORIES = {
  'dev-flow-plan': 'dev-workflow',
  'dev-flow-execute': 'dev-workflow',
  'dev-flow-iterate': 'dev-workflow',
  'dev-flow-e2e': 'dev-workflow',
  'using-git-worktrees': 'dev-workflow',
  'arena-brett-deploy': 'bachelorprojekt-infra',
  'cluster-deployment': 'bachelorprojekt-infra',
  'database-ops': 'bachelorprojekt-infra',
  'fleet-ops': 'bachelorprojekt-infra',
  'host-node-networking': 'bachelorprojekt-infra',
  'keycloak-realm-sync': 'bachelorprojekt-infra',
  'knowledge-management': 'bachelorprojekt-infra',
  'mishap-tracker': 'bachelorprojekt-infra',
  'operations-management': 'bachelorprojekt-infra',
  'secret-rotation': 'bachelorprojekt-infra',
  'update-dependencies': 'bachelorprojekt-infra',
};

const CATEGORY_LABELS = {
  'dev-workflow': 'Dev-Workflow',
  'bachelorprojekt-infra': 'Bachelorprojekt-Infra',
  'ki-ml': 'KI / ML',
  'plugin-bau': 'Plugin- & Skill-Bau',
  'browser': 'Browser & Debugging',
  'mcp-api': 'MCP & API',
  'claude-code': 'Claude Code & Tooling',
};

const CATEGORY_ORDER = [
  'dev-workflow',
  'bachelorprojekt-infra',
  'ki-ml',
  'plugin-bau',
  'browser',
  'mcp-api',
  'claude-code',
];

/**
 * Assign a display category to a skill page.
 * @param {Page} page
 * @returns {string} category slug
 */
export function categoryForSkill(page) {
  if (SKILL_NAME_OVERRIDES[page.name]) return SKILL_NAME_OVERRIDES[page.name];
  if (page.provenance === 'repo') {
    return REPO_SKILL_CATEGORIES[page.name] ?? 'claude-code';
  }
  const plugin = pluginNameOf(page.provenance);
  return PLUGIN_SKILL_CATEGORIES[plugin] ?? 'claude-code';
}

/**
 * Remove duplicate skill pages: keep only the newest version per (pluginName, skillName) pair.
 * Repo skills have no plugin name and are never deduplicated against each other.
 * @param {Page[]} pages
 * @returns {Page[]}
 */
export function deduplicateSkills(pages) {
  /** @type {Map<string, Page>} */
  const best = new Map();
  for (const page of pages) {
    if (page.type !== 'skill') continue;
    const plugin = pluginNameOf(page.provenance);
    const key = page.provenance === 'repo'
      ? `repo:${page.name}`
      : `${plugin}:${page.name}`;
    const existing = best.get(key);
    if (!existing) {
      best.set(key, page);
      continue;
    }
    // Compare versions: existing vs page. Keep the lexicographically greater one
    // (semver strings like '5.1.0' compare correctly that way for simple cases).
    const existingVer = page.provenance === 'repo' ? '' : (existing.provenance.split('@')[1] ?? '');
    const newVer = page.provenance === 'repo' ? '' : (page.provenance.split('@')[1] ?? '');
    if (newVer > existingVer) best.set(key, page);
  }
  return Array.from(best.values());
}
```

- [x] **Schritt 2.4: Tests laufen lassen — müssen bestehen**

```bash
node --test scripts/docs-gen/templates.test.mjs 2>&1 | grep -E 'pass|fail|ok|not ok' | head -30
```

Erwartet: alle neuen Tests PASS, bestehende Tests unverändert PASS.

- [x] **Schritt 2.5: Commit**

```bash
git add scripts/docs-gen/templates.mjs scripts/docs-gen/templates.test.mjs
git commit -m "feat(docs-gen): skill deduplication + category mapping"
```

---

## Task 3: renderSkillsIndex + verdrahten in build-docs.mjs

**Files:**
- Modify: `scripts/docs-gen/templates.mjs`
- Modify: `scripts/docs-gen/templates.test.mjs`
- Modify: `scripts/build-docs.mjs`

- [x] **Schritt 3.1: Test schreiben**

In `scripts/docs-gen/templates.test.mjs` den Import-Block am Anfang um `renderSkillsIndex` erweitern. Dann ans Ende hinzufügen:

```js
import { ..., renderSkillsIndex } from './templates.mjs';

// ─── renderSkillsIndex ────────────────────────────────────────────────────────

test('renderSkillsIndex: renders 7 category filter buttons + "Alle" button', () => {
  const pages = [
    { ...pluginSkillPage, slug: 'brainstorming', name: 'brainstorming',
      provenance: 'superpowers@5.1.0', outRelPath: 'skills/superpowers--brainstorming.html' },
    { ...pluginSkillPage, slug: 'hf-cli', name: 'hf-cli',
      provenance: 'huggingface-skills@1.0.3', outRelPath: 'skills/huggingface-skills--hf-cli.html' },
  ];
  const html = renderSkillsIndex({ pages });
  assert.ok(html.startsWith('<!DOCTYPE html>'), 'full document');
  assert.ok(html.includes('cat-filter-btn'), 'filter buttons present');
  assert.ok(html.includes('data-cat="all"'), 'Alle button present');
  assert.ok(html.includes('Dev-Workflow'), 'dev-workflow category label');
  assert.ok(html.includes('KI / ML'), 'ki-ml category label');
});

test('renderSkillsIndex: cards have data-category attribute', () => {
  const page = { ...pluginSkillPage, slug: 'brainstorming', name: 'brainstorming',
    provenance: 'superpowers@5.1.0', outRelPath: 'skills/superpowers--brainstorming.html' };
  const html = renderSkillsIndex({ pages: [page] });
  assert.ok(html.includes('data-category="dev-workflow"'), 'card has data-category');
});

test('renderSkillsIndex: deduplicates skills before rendering', () => {
  const old = { ...pluginSkillPage, slug: 'superpowers--brainstorming',
    name: 'brainstorming', provenance: 'superpowers@4.0.0',
    outRelPath: 'skills/superpowers--brainstorming.html' };
  const newer = { ...pluginSkillPage, slug: 'superpowers--brainstorming',
    name: 'brainstorming', provenance: 'superpowers@5.1.0',
    outRelPath: 'skills/superpowers--brainstorming.html' };
  const html = renderSkillsIndex({ pages: [old, newer] });
  const count = (html.match(/superpowers--brainstorming/g) ?? []).length;
  assert.ok(count <= 2, 'skill not listed twice (one card + one href)');
  assert.ok(html.includes('5.1.0'), 'newer version shown');
  assert.ok(!html.includes('4.0.0'), 'older version removed');
});

test('renderSkillsIndex: repo skills have star marker', () => {
  const repoSkill = {
    slug: 'dev-flow-plan', type: 'skill', provenance: 'repo', name: 'dev-flow-plan',
    title: 'dev-flow-plan', description: '', domain: null, bodyMarkdown: '',
    sourcePath: '/x/SKILL.md', outRelPath: 'skills/dev-flow-plan.html',
  };
  const html = renderSkillsIndex({ pages: [repoSkill] });
  assert.ok(html.includes('skill-star'), 'repo skill has star marker');
  assert.ok(html.includes('skill-repo'), 'repo skill has repo CSS class');
});

test('renderSkillsIndex: count in header shows deduplicated number', () => {
  const pages = [
    { ...pluginSkillPage, slug: 'a', name: 'alpha', provenance: 'superpowers@5.0.0',
      outRelPath: 'skills/superpowers--alpha.html' },
    { ...pluginSkillPage, slug: 'b', name: 'alpha', provenance: 'superpowers@5.1.0',
      outRelPath: 'skills/superpowers--alpha.html' },
  ];
  const html = renderSkillsIndex({ pages });
  assert.ok(html.includes('1 '), 'deduplicated count (1) shown, not 2');
});
```

- [x] **Schritt 3.2: Test laufen lassen — muss fehlschlagen**

```bash
node --test scripts/docs-gen/templates.test.mjs 2>&1 | grep "renderSkillsIndex" | head -10
```

Erwartet: FAIL mit "renderSkillsIndex is not a function".

- [x] **Schritt 3.3: renderSkillsIndex in templates.mjs implementieren**

In `scripts/docs-gen/templates.mjs` nach der `renderSectionIndex`-Funktion hinzufügen:

```js
/**
 * Skills index page with deduplication, 7 category filter buttons, and repo-star markers.
 * Replaces renderSectionIndex for type='skill'.
 * @param {{ pages: Page[] }} args
 * @returns {string}
 */
export function renderSkillsIndex({ pages }) {
  const deduped = deduplicateSkills(pages);
  const count = deduped.length;

  // Build filter buttons (Alle + one per non-empty category)
  const usedCats = new Set(deduped.map(categoryForSkill));
  const filterBtns = [
    `<button class="cat-filter-btn active" data-cat="all">Alle (${count})</button>`,
    ...CATEGORY_ORDER
      .filter((c) => usedCats.has(c))
      .map((c) => {
        const n = deduped.filter((p) => categoryForSkill(p) === c).length;
        return `<button class="cat-filter-btn" data-cat="${esc(c)}">${esc(CATEGORY_LABELS[c])} (${n})</button>`;
      }),
  ].join('\n');

  // Sort within each category alphabetically
  const sorted = deduped.slice().sort((a, b) => a.name.localeCompare(b.name));

  const cards = sorted.map((page) => {
    const cat = categoryForSkill(page);
    const isRepo = page.provenance === 'repo';
    const star = isRepo ? '<span class="skill-star" aria-label="repo-eigener Skill">★</span>' : '';
    const repoClass = isRepo ? ' skill-repo' : '';
    return `<a class="section-card${repoClass}" href="./${esc(page.outRelPath)}" data-category="${esc(cat)}">
  <span class="section-card-head">
    ${star}<span class="section-card-title">${esc(page.title)}</span>
    ${provenanceBadge(page.provenance)}${domainTag(page.domain)}
  </span>
  <span class="section-card-desc">${esc(page.description)}</span>
</a>`;
  }).join('\n');

  const header = `<header class="page-header">
  <div class="page-header-body">
    <nav class="breadcrumbs"><a href="./index.html">Übersicht</a> <span class="sep">/</span> <span class="crumb-current">Skills</span></nav>
    <h1>Skills</h1>
    <p class="page-desc">${count} Skills (${pages.length - count} Duplikate bereinigt)</p>
  </div>
</header>`;

  return `${documentHead('Skills', './')}
<div id="app">
  <main id="main">
${header}
<div class="cat-filter-row">
${filterBtns}
</div>
<section class="section-grid">
${cards}
</section>
  </main>
</div>
${documentTail('./')}`;
}
```

- [x] **Schritt 3.4: Tests laufen lassen — müssen bestehen**

```bash
node --test scripts/docs-gen/templates.test.mjs 2>&1 | grep -E "renderSkillsIndex|pass|fail" | head -20
```

Erwartet: alle `renderSkillsIndex`-Tests PASS.

- [x] **Schritt 3.5: build-docs.mjs verdrahten**

In `scripts/build-docs.mjs` den Import aus `templates.mjs` um `renderSkillsIndex` erweitern:

```js
import { renderPage, renderSectionIndex, renderSkillsIndex, renderLanding } from './docs-gen/templates.mjs';
```

Im Abschnitt `// (7) Section index pages` in `runBuild()` die Skill-Zeile ersetzen:

```js
// (7) Section index pages.
const sectionDefs = [
  { type: 'agent', title: 'Agents', file: 'agents.html' },
  { type: 'doc', title: 'Docs', file: 'docs.html' },
];
for (const def of sectionDefs) {
  const sectionPages = pages.filter((p) => p.type === def.type);
  const html = renderSectionIndex({ type: def.type, title: def.title, pages: sectionPages });
  writeOut(outDir, def.file, html);
}

// Skills use the new deduplicated + categorized renderer.
const skillPages = pages.filter((p) => p.type === 'skill');
const skillsHtml = renderSkillsIndex({ pages: skillPages });
writeOut(outDir, 'skills.html', skillsHtml);
```

Außerdem Dedup-Stats in `report.counts` hinzufügen (vor `printReport`):

```js
const rawSkillCount = pages.filter((p) => p.type === 'skill').length;
const { deduplicateSkills: _ded } = await import('./docs-gen/templates.mjs');
// deduplicateSkills is already called inside renderSkillsIndex; mirror for the report:
report.counts.skillsDeduplicated = rawSkillCount;
```

**Hinweis:** Da `deduplicateSkills` schon in `renderSkillsIndex` aufgerufen wird, reicht es den Rohwert zu tracken. Die sauberere Lösung: `report.counts.skillsRaw` und `report.counts.skillsUnique` berechnen vor dem Schreiben:

```js
const skillPages = pages.filter((p) => p.type === 'skill');
// Import deduplicateSkills direkt (bereits über templates.mjs importiert):
import { ..., deduplicateSkills } from './docs-gen/templates.mjs';
report.counts.skillsRaw = skillPages.length;
report.counts.skillsUnique = deduplicateSkills(skillPages).length;
```

Den Import am Anfang von `build-docs.mjs` entsprechend erweitern:

```js
import { renderPage, renderSectionIndex, renderSkillsIndex, renderLanding, deduplicateSkills } from './docs-gen/templates.mjs';
```

Und in `printReport`:

```js
console.log(`  skills (raw):       ${c.skillsRaw ?? c.skill}`);
console.log(`  skills (unique):    ${c.skillsUnique ?? '–'}`);
```

- [x] **Schritt 3.6: Smoke-Test laufen lassen**

```bash
node --test scripts/docs-gen/build-smoke.test.mjs
```

Erwartet: alle Tests PASS.

- [x] **Schritt 3.7: Commit**

```bash
git add scripts/docs-gen/templates.mjs scripts/docs-gen/templates.test.mjs scripts/build-docs.mjs
git commit -m "feat(docs-gen): renderSkillsIndex — dedup + 7 category filters + repo stars"
```

---

## Task 4: renderAgentsIndex + verdrahten

**Files:**
- Modify: `scripts/docs-gen/templates.mjs`
- Modify: `scripts/docs-gen/templates.test.mjs`
- Modify: `scripts/build-docs.mjs`

- [ ] **Schritt 4.1: Test schreiben**

Import-Block in `templates.test.mjs` um `renderAgentsIndex` erweitern, dann hinzufügen:

```js
// ─── renderAgentsIndex ───────────────────────────────────────────────────────

const makeAgentPage = (name, provenance, domain) => ({
  slug: name,
  type: 'agent',
  provenance: provenance ?? 'repo',
  name,
  title: name,
  description: `Triggers: ${domain ?? 'general'} tasks.`,
  domain: domain ?? null,
  bodyMarkdown: '',
  sourcePath: `/x/.claude/agents/${name}.md`,
  outRelPath: `agents/${name}.html`,
});

test('renderAgentsIndex: Bachelorprojekt group appears first', () => {
  const bp = makeAgentPage('bachelorprojekt-infra', 'repo', 'infra');
  const other = makeAgentPage('feature-dev--code-architect', 'feature-dev@1.0.0', null);
  const html = renderAgentsIndex({ pages: [other, bp] });
  const bpIdx = html.indexOf('bachelorprojekt-infra');
  const otherIdx = html.indexOf('feature-dev--code-architect');
  assert.ok(bpIdx < otherIdx, 'bachelorprojekt agent appears before other agent');
});

test('renderAgentsIndex: shows trigger description on card', () => {
  const bp = makeAgentPage('bachelorprojekt-ops', 'repo', 'ops');
  const html = renderAgentsIndex({ pages: [bp] });
  assert.ok(html.includes('Triggers: ops tasks.'), 'description shown on card');
});

test('renderAgentsIndex: renders group headers', () => {
  const html = renderAgentsIndex({ pages: [
    makeAgentPage('bachelorprojekt-website', 'repo', 'website'),
    makeAgentPage('feature-dev--code-architect', 'feature-dev@1.0.0'),
  ]});
  assert.ok(html.includes('agent-group-header'), 'group headers present');
  assert.ok(html.includes('Bachelorprojekt'), 'Bachelorprojekt header present');
});

test('renderAgentsIndex: is a full HTML5 document with breadcrumbs', () => {
  const html = renderAgentsIndex({ pages: [makeAgentPage('bachelorprojekt-db', 'repo', 'db')] });
  assert.ok(html.startsWith('<!DOCTYPE html>'), 'full document');
  assert.ok(html.includes('Agents'), 'section title');
  assert.ok(html.includes('href="./index.html"'), 'breadcrumb to landing');
});
```

- [ ] **Schritt 4.2: Test laufen lassen — muss fehlschlagen**

```bash
node --test scripts/docs-gen/templates.test.mjs 2>&1 | grep "renderAgentsIndex" | head -5
```

Erwartet: FAIL.

- [ ] **Schritt 4.3: renderAgentsIndex implementieren**

In `scripts/docs-gen/templates.mjs` nach `renderSkillsIndex` hinzufügen:

```js
/** Map agent slug prefix → display group. Order = display order. */
const AGENT_GROUPS = [
  { key: 'bachelorprojekt', label: 'Bachelorprojekt', match: (p) => p.name.startsWith('bachelorprojekt') || (p.provenance === 'repo' && p.name.startsWith('bachelorprojekt')) },
  { key: 'dev-workflow', label: 'Dev-Workflow', match: (p) => {
    const plugin = pluginNameOf(p.provenance);
    return ['feature-dev', 'pr-review-toolkit', 'code-simplifier'].some((pfx) => plugin.startsWith(pfx));
  }},
  { key: 'plugin-bau', label: 'Plugin- & Skill-Bau', match: (p) => {
    const plugin = pluginNameOf(p.provenance);
    return ['plugin-dev', 'hookify', 'agent-sdk-dev', 'skill-creator'].some((pfx) => plugin.startsWith(pfx));
  }},
];

/**
 * Agents index page grouped by plugin family.
 * @param {{ pages: Page[] }} args
 * @returns {string}
 */
export function renderAgentsIndex({ pages }) {
  // Assign each agent to a group; unmatched go to 'Sonstige'
  const buckets = new Map(AGENT_GROUPS.map((g) => [g.key, []]));
  buckets.set('sonstige', []);

  for (const page of pages) {
    const group = AGENT_GROUPS.find((g) => g.match(page));
    buckets.get(group ? group.key : 'sonstige').push(page);
  }

  const allGroups = [
    ...AGENT_GROUPS,
    { key: 'sonstige', label: 'Sonstige' },
  ];

  const sections = allGroups
    .filter((g) => (buckets.get(g.key) ?? []).length > 0)
    .map((g) => {
      const groupPages = (buckets.get(g.key) ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
      const cards = groupPages.map((page) => `<a class="section-card" href="./${esc(page.outRelPath)}">
  <span class="section-card-head">
    <span class="section-card-title">${esc(page.title)}</span>
    ${provenanceBadge(page.provenance)}${domainTag(page.domain)}
  </span>
  <span class="section-card-desc">${esc(page.description)}</span>
</a>`).join('\n');
      return `<h2 class="agent-group-header">${esc(g.label)} (${groupPages.length})</h2>
<section class="section-grid">
${cards}
</section>`;
    }).join('\n');

  const header = `<header class="page-header">
  <div class="page-header-body">
    <nav class="breadcrumbs"><a href="./index.html">Übersicht</a> <span class="sep">/</span> <span class="crumb-current">Agents</span></nav>
    <h1>Agents</h1>
    <p class="page-desc">${pages.length} Agents</p>
  </div>
</header>`;

  return `${documentHead('Agents', './')}
<div id="app">
  <main id="main">
${header}
${sections}
  </main>
</div>
${documentTail('./')}`;
}
```

- [ ] **Schritt 4.4: Tests laufen lassen — müssen bestehen**

```bash
node --test scripts/docs-gen/templates.test.mjs 2>&1 | grep "renderAgentsIndex" | head -10
```

Erwartet: alle PASS.

- [ ] **Schritt 4.5: build-docs.mjs verdrahten**

Import erweitern:
```js
import { renderPage, renderSectionIndex, renderSkillsIndex, renderAgentsIndex, renderLanding, deduplicateSkills } from './docs-gen/templates.mjs';
```

In Schritt 7 (`sectionDefs`) die Agents-Zeile ersetzen:
```js
const sectionDefs = [
  { type: 'doc', title: 'Docs', file: 'docs.html' },
];
for (const def of sectionDefs) {
  const sectionPages = pages.filter((p) => p.type === def.type);
  const html = renderSectionIndex({ type: def.type, title: def.title, pages: sectionPages });
  writeOut(outDir, def.file, html);
}

const agentPages = pages.filter((p) => p.type === 'agent');
writeOut(outDir, 'agents.html', renderAgentsIndex({ pages: agentPages }));
```

- [ ] **Schritt 4.6: Smoke-Test**

```bash
node --test scripts/docs-gen/build-smoke.test.mjs
```

Erwartet: PASS.

- [ ] **Schritt 4.7: Commit**

```bash
git add scripts/docs-gen/templates.mjs scripts/docs-gen/templates.test.mjs scripts/build-docs.mjs
git commit -m "feat(docs-gen): renderAgentsIndex — grouped by plugin family"
```

---

## Task 5: renderDocsIndex + verdrahten

**Files:**
- Modify: `scripts/docs-gen/templates.mjs`
- Modify: `scripts/docs-gen/templates.test.mjs`
- Modify: `scripts/build-docs.mjs`

- [ ] **Schritt 5.1: Test schreiben**

Import-Block um `renderDocsIndex` erweitern, dann hinzufügen:

```js
// ─── renderDocsIndex ─────────────────────────────────────────────────────────

const makeDocPage = (slug, description) => ({
  slug,
  type: 'doc',
  provenance: 'repo',
  name: slug,
  title: slug,
  description: description ?? '',
  domain: null,
  bodyMarkdown: '',
  sourcePath: `/x/docs/${slug}.md`,
  outRelPath: `${slug}.html`,
});

test('renderDocsIndex: renders group headers', () => {
  const pages = [
    makeDocPage('benutzerhandbuch', 'Anleitung für Endnutzer'),
    makeDocPage('architecture', 'Übersicht der Systemarchitektur'),
    makeDocPage('decision-log', ''),
  ];
  const html = renderDocsIndex({ pages });
  assert.ok(html.includes('doc-group-header'), 'group headers present');
  assert.ok(html.startsWith('<!DOCTYPE html>'), 'full document');
  assert.ok(html.includes('Handbücher'), 'Handbücher group present');
});

test('renderDocsIndex: generates fallback description for empty description', () => {
  const page = makeDocPage('decision-log', '');
  const html = renderDocsIndex({ pages: [page] });
  assert.ok(html.includes('decision-log'), 'slug present in output');
  // The card should not have an empty description span (either hidden or replaced)
  const emptyDescMatch = html.match(/<span class="section-card-desc"><\/span>/);
  assert.ok(!emptyDescMatch, 'empty description not rendered as empty span');
});

test('renderDocsIndex: is a full HTML5 document with correct breadcrumbs', () => {
  const html = renderDocsIndex({ pages: [makeDocPage('architecture', 'arch doc')] });
  assert.ok(html.startsWith('<!DOCTYPE html>'), 'full document');
  assert.ok(html.includes('href="./index.html"'), 'breadcrumb to landing');
  assert.ok(html.includes('Docs'), 'section title present');
});
```

- [ ] **Schritt 5.2: Test laufen lassen — muss fehlschlagen**

```bash
node --test scripts/docs-gen/templates.test.mjs 2>&1 | grep "renderDocsIndex" | head -5
```

Erwartet: FAIL.

- [ ] **Schritt 5.3: renderDocsIndex implementieren**

In `scripts/docs-gen/templates.mjs` nach `renderAgentsIndex` hinzufügen:

```js
/** Static slug-to-group assignment for doc pages. */
const DOC_GROUPS = [
  {
    key: 'handbuecher',
    label: 'Handbücher',
    slugs: new Set(['benutzerhandbuch', 'adminhandbuch', 'claude-code', 'contributing', 'readme']),
  },
  {
    key: 'architektur',
    label: 'Architektur & Bausteine',
    slugs: new Set(['architecture', 'bereitstellungsdetails', 'db-schema', 'datamodel-workflow',
      '30-bausteine', '20-werkzeuge', '10-ziele', '00-anleitung']),
  },
  {
    key: 'audits',
    label: 'Audits & Reports',
    matchFn: (slug) => /^\d{4}-\d{2}-\d{2}/.test(slug) || ['findings', 'db-audit'].includes(slug),
  },
  {
    key: 'entscheidungen',
    label: 'Entscheidungen',
    slugs: new Set(['decision-log', 'decisions', 'CHANGELOG']),
  },
];

/** Fallback description derived from slug when page.description is empty. */
function fallbackDescription(slug) {
  const MAP = {
    'decision-log': 'Protokoll getroffener Architektur- und Designentscheidungen',
    'decisions': 'Entscheidungsübersicht',
    'CHANGELOG': 'Versionshistorie und Änderungsprotokoll',
    'architecture': 'Übersicht der Systemarchitektur und ihrer Komponenten',
    'bereitstellungsdetails': 'Server-Topologie und Bereitstellungsdetails',
    'db-schema': 'Datenbankschema-Diagramm',
    'datamodel-workflow': 'Datenmodell und Workflow-Dokumentation',
    'contributing': 'Beitragsleitfaden für Entwickler',
    'backup': 'Backup- und Wiederherstellungsdokumentation',
    'dsgvo': 'DSGVO-Konformität und Datenschutzdokumentation',
  };
  return MAP[slug] ?? slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Docs index page with group headers and fallback descriptions.
 * @param {{ pages: Page[] }} args
 * @returns {string}
 */
export function renderDocsIndex({ pages }) {
  // Assign slugs to groups; unmatched go to 'Referenz'
  const buckets = new Map(DOC_GROUPS.map((g) => [g.key, []]));
  buckets.set('referenz', []);

  for (const page of pages) {
    const group = DOC_GROUPS.find((g) => {
      if (g.slugs) return g.slugs.has(page.slug);
      if (g.matchFn) return g.matchFn(page.slug);
      return false;
    });
    buckets.get(group ? group.key : 'referenz').push(page);
  }

  const allGroups = [
    ...DOC_GROUPS,
    { key: 'referenz', label: 'Referenz' },
  ];

  const sections = allGroups
    .filter((g) => (buckets.get(g.key) ?? []).length > 0)
    .map((g) => {
      const groupPages = (buckets.get(g.key) ?? []).slice().sort((a, b) => a.title.localeCompare(b.title));
      const cards = groupPages.map((page) => {
        const desc = page.description || fallbackDescription(page.slug);
        return `<a class="section-card" href="./${esc(page.outRelPath)}">
  <span class="section-card-head">
    <span class="section-card-title">${esc(page.title)}</span>
    ${provenanceBadge(page.provenance)}${domainTag(page.domain)}
  </span>
  <span class="section-card-desc">${esc(desc)}</span>
</a>`;
      }).join('\n');
      return `<h2 class="doc-group-header">${esc(g.label)}</h2>
<section class="section-grid">
${cards}
</section>`;
    }).join('\n');

  const header = `<header class="page-header">
  <div class="page-header-body">
    <nav class="breadcrumbs"><a href="./index.html">Übersicht</a> <span class="sep">/</span> <span class="crumb-current">Docs</span></nav>
    <h1>Docs</h1>
    <p class="page-desc">${pages.length} Seiten</p>
  </div>
</header>`;

  return `${documentHead('Docs', './')}
<div id="app">
  <main id="main">
${header}
${sections}
  </main>
</div>
${documentTail('./')}`;
}
```

- [ ] **Schritt 5.4: Tests laufen lassen**

```bash
node --test scripts/docs-gen/templates.test.mjs 2>&1 | grep "renderDocsIndex" | head -10
```

Erwartet: alle PASS.

- [ ] **Schritt 5.5: build-docs.mjs verdrahten**

Import erweitern und Schritt 7 komplett ersetzen:

```js
import {
  renderPage, renderSkillsIndex, renderAgentsIndex, renderDocsIndex, renderLanding, deduplicateSkills,
} from './docs-gen/templates.mjs';
```

```js
// (7) Section index pages (specialized renderers replace renderSectionIndex).
const skillPages = pages.filter((p) => p.type === 'skill');
const agentPages = pages.filter((p) => p.type === 'agent');
const docPages = pages.filter((p) => p.type === 'doc');

report.counts.skillsRaw = skillPages.length;
report.counts.skillsUnique = deduplicateSkills(skillPages).length;

writeOut(outDir, 'skills.html', renderSkillsIndex({ pages: skillPages }));
writeOut(outDir, 'agents.html', renderAgentsIndex({ pages: agentPages }));
writeOut(outDir, 'docs.html', renderDocsIndex({ pages: docPages }));
```

`renderSectionIndex` aus dem Import entfernen, da nicht mehr gebraucht.

`printReport` in `build-docs.mjs` aktualisieren:

```js
console.log(`  skills (raw):       ${c.skillsRaw ?? c.skill}`);
console.log(`  skills (unique):    ${c.skillsUnique ?? '–'}`);
```

- [ ] **Schritt 5.6: Smoke-Test**

```bash
node --test scripts/docs-gen/build-smoke.test.mjs
```

Erwartet: PASS.

- [ ] **Schritt 5.7: Commit**

```bash
git add scripts/docs-gen/templates.mjs scripts/docs-gen/templates.test.mjs scripts/build-docs.mjs
git commit -m "feat(docs-gen): renderDocsIndex — groups + fallback descriptions"
```

---

## Task 6: Neues renderLanding (Hub) — Graph raus

**Files:**
- Modify: `scripts/docs-gen/templates.mjs`
- Modify: `scripts/docs-gen/templates.test.mjs`

- [ ] **Schritt 6.1: Bestehende renderLanding-Tests updaten**

In `scripts/docs-gen/templates.test.mjs` den Test `'renderLanding: embeds graph SVG, fallback section list, and legend marker'` ersetzen:

```js
test('renderLanding: hub has 3 tiles with counts and links to section pages', () => {
  const pages = [
    { slug: 'bachelorprojekt-ops', type: 'agent', provenance: 'repo',
      name: 'bachelorprojekt-ops', title: 'Ops Agent', description: 'ops things',
      domain: 'ops', bodyMarkdown: '', sourcePath: '/x/ops.md',
      outRelPath: 'agents/bachelorprojekt-ops.html' },
    { slug: 'database-ops', type: 'skill', provenance: 'repo',
      name: 'database-ops', title: 'Database Ops', description: 'db runbook',
      domain: 'db', bodyMarkdown: '', sourcePath: '/x/database-ops/SKILL.md',
      outRelPath: 'skills/database-ops.html' },
    { slug: 'wsl-bootstrap', type: 'doc', provenance: 'repo',
      name: 'wsl-bootstrap', title: 'WSL Bootstrap', description: 'setup doc',
      domain: 'general', bodyMarkdown: '', sourcePath: '/x/WSL-BOOTSTRAP.md',
      outRelPath: 'wsl-bootstrap.html' },
  ];
  const registry = { bySlug: new Map(), resolve: () => null };
  const html = renderLanding({ pages, registry });

  assert.ok(html.startsWith('<!DOCTYPE html>'), 'full document');
  assert.ok(!html.includes('<svg'), 'no SVG graph in hub mode');
  assert.ok(!html.includes('graph-legend'), 'no graph legend');
  assert.ok(html.includes('hub-tile'), 'hub tiles present');
  assert.ok(html.includes('href="./skills.html"'), 'links to skills section');
  assert.ok(html.includes('href="./agents.html"'), 'links to agents section');
  assert.ok(html.includes('href="./docs.html"'), 'links to docs section');
  assert.ok(/1/.test(html), 'counts present');
});
```

Den Test `'renderLanding: contains per-type section counts'` lassen wie er ist — er prüft Counts und hrefs, was weiterhin gelten soll.

- [ ] **Schritt 6.2: Geänderten Test laufen lassen — muss fehlschlagen**

```bash
node --test scripts/docs-gen/templates.test.mjs 2>&1 | grep "hub has 3 tiles" | head -5
```

Erwartet: FAIL (weil aktuelles `renderLanding` noch den SVG-Graph ausgibt).

- [ ] **Schritt 6.3: renderLanding in templates.mjs ersetzen**

Die gesamte `renderLanding`-Funktion in `scripts/docs-gen/templates.mjs` ersetzen:

```js
/**
 * Hub landing page: 3 Kacheln (Skills/Agents/Docs) + Skills-Vorschau mit Kategorien
 * + Bachelorprojekt-Agents-Vorschau. Kein SVG-Graph.
 *
 * @param {object} args
 * @param {Page[]} args.pages
 * @param {object} args.registry  (unused in Hub mode, kept for API compat)
 * @param {Array} [args.edges]     (unused in Hub mode, kept for API compat)
 * @param {Array} [args.routingRows] (unused in Hub mode, kept for API compat)
 * @returns {string} full HTML5 document
 */
export function renderLanding({ pages, registry: _registry, edges: _edges, routingRows: _routingRows }) {
  const skills = pages.filter((p) => p.type === 'skill');
  const agents = pages.filter((p) => p.type === 'agent');
  const docs = pages.filter((p) => p.type === 'doc');

  const uniqueSkills = deduplicateSkills(skills);
  const skillCount = uniqueSkills.length;
  const agentCount = agents.length;
  const docCount = docs.length;

  // ── 3 Kacheln ──
  const tiles = `<div class="hub-tiles">
  <a class="hub-tile" href="./skills.html">
    <span class="hub-tile-label">Skills</span>
    <span class="hub-tile-count">${skillCount}</span>
    <span class="hub-tile-name">Tools &amp; Workflows</span>
  </a>
  <a class="hub-tile" href="./agents.html">
    <span class="hub-tile-label">Agents</span>
    <span class="hub-tile-count">${agentCount}</span>
    <span class="hub-tile-name">Spezialisierte KI-Agents</span>
  </a>
  <a class="hub-tile" href="./docs.html">
    <span class="hub-tile-label">Docs</span>
    <span class="hub-tile-count">${docCount}</span>
    <span class="hub-tile-name">Handbücher &amp; Referenz</span>
  </a>
</div>`;

  // ── Skills-Vorschau: 7 Kategorie-Buttons + je 3 Beispiel-Chips ──
  const usedCats = new Set(uniqueSkills.map(categoryForSkill));
  const previewBtns = [
    `<button class="cat-filter-btn active" data-cat="all">Alle</button>`,
    ...CATEGORY_ORDER
      .filter((c) => usedCats.has(c))
      .map((c) => `<button class="cat-filter-btn" data-cat="${esc(c)}">${esc(CATEGORY_LABELS[c])}</button>`),
  ].join('\n');

  const skillPreviewCards = uniqueSkills
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 6)
    .map((p) => {
      const cat = categoryForSkill(p);
      const isRepo = p.provenance === 'repo';
      const star = isRepo ? '<span class="skill-star">★</span>' : '';
      return `<a class="section-card${isRepo ? ' skill-repo' : ''}" href="./${esc(p.outRelPath)}" data-category="${esc(cat)}">
  <span class="section-card-head">
    ${star}<span class="section-card-title">${esc(p.title)}</span>
  </span>
</a>`;
    }).join('\n');

  const skillsPreview = `<section class="hub-section">
  <h2 class="hub-section-title">Skills <a class="arrow" href="./skills.html">alle anzeigen →</a></h2>
  <div class="cat-filter-row">
${previewBtns}
  </div>
  <section class="section-grid" id="hub-skills-grid">
${skillPreviewCards}
  </section>
</section>`;

  // ── Agents-Vorschau: Bachelorprojekt-Agents ──
  const bpAgents = agents
    .filter((p) => p.name.startsWith('bachelorprojekt'))
    .sort((a, b) => a.name.localeCompare(b.name));

  const agentCards = bpAgents.map((p) => `<a class="section-card" href="./${esc(p.outRelPath)}">
  <span class="section-card-head">
    <span class="section-card-title">${esc(p.title)}</span>
    ${domainTag(p.domain)}
  </span>
  <span class="section-card-desc">${esc(p.description)}</span>
</a>`).join('\n');

  const agentsPreview = bpAgents.length > 0 ? `<section class="hub-section">
  <h2 class="hub-section-title">Bachelorprojekt-Agents <a class="arrow" href="./agents.html">alle anzeigen →</a></h2>
  <section class="section-grid">
${agentCards}
  </section>
</section>` : '';

  const header = `<header class="page-header landing-hero">
  <div class="page-header-body">
    <p class="kicker">Workspace MVP</p>
    <h1>Dokumentation</h1>
    <p class="page-desc">Skills, Agents und Handbücher für die Plattform. Ctrl+K zum Suchen.</p>
  </div>
</header>`;

  return `${documentHead('Dokumentation', './')}
<div id="app">
  <main id="main">
${header}
${tiles}
${skillsPreview}
${agentsPreview}
  </main>
</div>
${documentTail('./')}`;
}
```

- [ ] **Schritt 6.4: Ungenutzte Graph-Importe aus templates.mjs entfernen**

Die drei Zeilen am Anfang von `scripts/docs-gen/templates.mjs` entfernen:

```js
// Diese drei Zeilen löschen:
import { buildGraph } from './graph-data.mjs';
import { layoutGraph } from './graph-layout.mjs';
import { renderGraphSvg } from './graph-svg.mjs';
```

- [ ] **Schritt 6.5: CSS für `.hub-section` und `.hub-section-title` in theme.mjs hinzufügen**

In `editorialCss()` nach dem `.hub-tile`-Block hinzufügen:

```css
.hub-section{margin:2.5rem 0}
.hub-section-title{font-family:var(--font-serif);font-size:1.4rem;font-weight:700;
  color:var(--ink);display:flex;align-items:baseline;gap:.8rem;margin:0 0 .8rem;
  padding-bottom:.5rem;border-bottom:1px solid var(--line)}
.hub-section-title .arrow{font-family:var(--font-sans);font-size:.85rem;font-weight:600;
  color:var(--accent);text-decoration:none;margin-left:auto}
.hub-section-title .arrow:hover{color:var(--accent-soft)}
```

- [ ] **Schritt 6.6: Alle Tests laufen lassen**

```bash
node --test scripts/docs-gen/templates.test.mjs
```

Erwartet: alle Tests PASS (inkl. der neuen Hub-Tests und der angepassten Graph-Tests).

- [ ] **Schritt 6.7: Smoke-Test**

```bash
node --test scripts/docs-gen/build-smoke.test.mjs
```

Erwartet: PASS.

- [ ] **Schritt 6.8: Vollständiger Docs-Build — prüfen ob HTML generiert wird**

```bash
node scripts/build-docs.mjs 2>&1 | tail -20
```

Erwartet: Build-Report ohne Fehler, `skills (unique)` in der Ausgabe.

- [ ] **Schritt 6.9: Commit**

```bash
git add scripts/docs-gen/templates.mjs scripts/docs-gen/templates.test.mjs scripts/docs-gen/theme.mjs
git commit -m "feat(docs-gen): replace SVG graph landing with Hub — tiles + category preview"
```

---

## Task 7: Alle Tests + Full CI-Check

- [ ] **Schritt 7.1: Alle docs-gen-Tests laufen lassen**

```bash
node --test scripts/docs-gen/*.test.mjs
```

Erwartet: alle Tests PASS, keine Fehler.

- [ ] **Schritt 7.2: Vollständigen CI-Test laufen lassen**

```bash
bash scripts/task-oracle.sh 'run all offline tests'
```

Erwartet: `task test:all` läuft durch ohne Fehler.

- [ ] **Schritt 7.3: Generierten Build manuell prüfen**

```bash
node scripts/build-docs.mjs 2>&1
```

Dann kurz in `k3d/docs-content-built/index.html` prüfen:

```bash
grep -c 'hub-tile\|svg\|graph-hero' k3d/docs-content-built/index.html
```

Erwartet: `hub-tile` kommt vor, `svg` und `graph-hero` kommen **nicht** vor.

```bash
grep -c 'cat-filter-btn\|data-category' k3d/docs-content-built/skills.html
```

Erwartet: beide Strings mehrfach vorhanden.

- [ ] **Schritt 7.4: Finalen Commit der generierten Dateien**

```bash
git add k3d/docs-content-built/
git commit -m "chore(docs): rebuild — hub landing, deduplicated skills, grouped agents+docs"
```

---

## Task 8: CI-Freshness prüfen und PR erstellen

- [ ] **Schritt 8.1: Freshness-Check**

```bash
bash scripts/task-oracle.sh 'check freshness / stale generated files'
```

Falls `repo-index.json` regeneriert werden muss:

```bash
bash scripts/task-oracle.sh 'regenerate repo-index.json'
git add website/src/data/repo-index.json
git commit -m "chore: regenerate repo-index.json"
```

- [ ] **Schritt 8.2: PR erstellen**

```bash
gh pr create \
  --title "feat(docs): hub landing + skill dedup + grouped agents/docs" \
  --body "Redesigns docs overview: replaces SVG graph with hub landing (3 tiles + preview), deduplicates skills 171→~86, adds 7 category filters, groups agents by family, groups docs with headers. See spec: docs/superpowers/specs/2026-06-10-docs-overview-redesign-design.md"
```
