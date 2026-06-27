// scripts/docs-gen/navigation.mjs
// Pure navigation-model builder and classification constants.
// Extracted from templates.mjs (Phase 1.2) to be the SINGLE source of:
//   - skill category mapping (categoryForSkill)
//   - agent group definitions (AGENT_GROUPS)
//   - doc group definitions (DOC_GROUPS)
//   - section ordering (CATEGORY_ORDER)
//
// Import direction (no cycles):
//   build-docs.mjs → navigation.mjs
//   templates.mjs  → navigation.mjs
//   navigation.mjs → registry.mjs  (only)

import { pluginNameOf } from './registry.mjs';

// ─── Skill category classification ───────────────────────────────────────────

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
const SKILL_NAME_OVERRIDES = { 'mcp-cli': 'mcp-api' };

/** Repo skills mapped by skill name → category. */
const REPO_SKILL_CATEGORIES = {
  'dev-flow-plan': 'dev-workflow',
  'dev-flow-execute': 'dev-workflow',
  'dev-flow-iterate': 'dev-workflow',
  'dev-flow-e2e': 'dev-workflow',
  'using-git-worktrees': 'dev-workflow',
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

/** Ordered list of skill category slugs (display order). */
export const CATEGORY_ORDER = [
  'dev-workflow',
  'bachelorprojekt-infra',
  'ki-ml',
  'plugin-bau',
  'browser',
  'mcp-api',
  'claude-code',
];

/** Human-readable labels for skill categories. */
export const CATEGORY_LABELS = {
  'dev-workflow': 'Dev-Workflow',
  'bachelorprojekt-infra': 'Bachelorprojekt-Infra',
  'ki-ml': 'KI / ML',
  'plugin-bau': 'Plugin- & Skill-Bau',
  'browser': 'Browser & Debugging',
  'mcp-api': 'MCP & API',
  'claude-code': 'Claude Code & Tooling',
};

// ─── Agent group definitions ──────────────────────────────────────────────────

/** Map agent slug prefix → display group. Order = display order. */
export const AGENT_GROUPS = [
  {
    key: 'bachelorprojekt',
    label: 'Bachelorprojekt',
    match: (p) => p.name.startsWith('bachelorprojekt'),
  },
  {
    key: 'dev-workflow',
    label: 'Dev-Workflow',
    match: (p) => {
      const plugin = pluginNameOf(p.provenance);
      return ['feature-dev', 'pr-review-toolkit', 'code-simplifier'].some((pfx) => plugin.startsWith(pfx));
    },
  },
  {
    key: 'plugin-bau',
    label: 'Plugin- & Skill-Bau',
    match: (p) => {
      const plugin = pluginNameOf(p.provenance);
      return ['plugin-dev', 'hookify', 'agent-sdk-dev', 'skill-creator'].some((pfx) => plugin.startsWith(pfx));
    },
  },
];

// ─── Doc group definitions ────────────────────────────────────────────────────

/** Static slug-to-group assignment for doc pages. */
export const DOC_GROUPS = [
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

// ─── Classification functions ─────────────────────────────────────────────────

/**
 * Assign a display category to a skill page.
 * @param {object} page
 * @returns {string} category slug
 */
export function categoryForSkill(page) {
  if (SKILL_NAME_OVERRIDES[page.name]) return SKILL_NAME_OVERRIDES[page.name];
  if (page.provenance === 'repo') return REPO_SKILL_CATEGORIES[page.name] ?? 'claude-code';
  const plugin = pluginNameOf(page.provenance);
  return PLUGIN_SKILL_CATEGORIES[plugin] ?? 'claude-code';
}

/**
 * Assign a section key to any page (internal — sectionOf in buildNavModel wraps this).
 * @param {object} page
 * @returns {string}
 */
function sectionKeyOf(page) {
  if (page.type === 'skill') return categoryForSkill(page);
  if (page.type === 'agent') {
    const g = AGENT_GROUPS.find((g) => g.match(page));
    return g ? g.key : 'sonstige';
  }
  if (page.type === 'doc') {
    const g = DOC_GROUPS.find((g) => {
      if (g.slugs) return g.slugs.has(page.slug);
      if (g.matchFn) return g.matchFn(page.slug);
      return false;
    });
    return g ? g.key : 'referenz';
  }
  return 'sonstige';
}

// ─── Section metadata (ordered for display) ───────────────────────────────────

const ALL_SECTION_DEFS = [
  ...CATEGORY_ORDER.map((key) => ({ key, label: CATEGORY_LABELS[key], type: 'skill' })),
  ...AGENT_GROUPS.map((g) => ({ key: g.key, label: g.label, type: 'agent' })),
  { key: 'sonstige', label: 'Sonstige', type: 'agent' },
  ...DOC_GROUPS.map((g) => ({ key: g.key, label: g.label, type: 'doc' })),
  { key: 'referenz', label: 'Referenz', type: 'doc' },
];

// ─── buildNavModel ────────────────────────────────────────────────────────────

/**
 * Build the navigation model from all pages.
 *
 * @param {object[]} pages  All Page objects.
 * @returns {{
 *   sections: Array<{key:string,label:string,type:string,pages:object[]}>,
 *   order: string[],
 *   prevNext: Map<string,{prev:object|null,next:object|null}>,
 *   sectionOf: (page:object) => string
 * }}
 */
export function buildNavModel(pages) {
  // Pre-compute section key for each page (memoized to avoid repeated lookups).
  const keyCache = new Map(pages.map((p) => [p.slug, sectionKeyOf(p)]));
  function sectionOf(page) { return keyCache.get(page.slug) ?? sectionKeyOf(page); }

  // Group pages into section buckets.
  const buckets = new Map(ALL_SECTION_DEFS.map((s) => [s.key, []]));
  for (const page of pages) {
    const key = sectionOf(page);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(page);
  }

  // Build ordered sections (alphabetically sorted within each section).
  const sections = ALL_SECTION_DEFS
    .filter((s) => (buckets.get(s.key) ?? []).length > 0)
    .map((s) => ({
      key: s.key,
      label: s.label,
      type: s.type,
      pages: (buckets.get(s.key) ?? []).slice().sort((a, b) => a.title.localeCompare(b.title)),
    }));

  // Compute prev/next within each section.
  const prevNext = new Map();
  for (const section of sections) {
    const sp = section.pages;
    for (let i = 0; i < sp.length; i++) {
      prevNext.set(sp[i].slug, { prev: i > 0 ? sp[i - 1] : null, next: i < sp.length - 1 ? sp[i + 1] : null });
    }
  }

  return { sections, order: CATEGORY_ORDER, prevNext, sectionOf };
}

// ─── Pure markup helpers (for sidebar and prev/next injection in templates.mjs) ──

/**
 * Render a sidebar `<aside>` from the nav model for a given page.
 * The current section is expanded; others are collapsed via `<details>`.
 * @param {{ sections: object[], sectionOf: function }} navModel
 * @param {object} currentPage
 * @param {string} prefix  Asset path prefix for hrefs ('./' or '../')
 * @returns {string} HTML fragment
 */
export function renderSidebar(navModel, currentPage, prefix) {
  const currentKey = navModel.sectionOf(currentPage);
  const typeSection = navModel.sections.filter((s) => s.type === currentPage.type);
  if (!typeSection.length) return '';

  const items = typeSection.map((section) => {
    const isCurrent = section.key === currentKey;
    const links = section.pages.map((p) => {
      const isActive = p.slug === currentPage.slug;
      const href = prefix + p.outRelPath;
      return `<li class="sidebar-item${isActive ? ' sidebar-item--active' : ''}">` +
        `<a href="${href}"${isActive ? ' aria-current="page"' : ''}>${escSidebar(p.title)}</a></li>`;
    }).join('');
    const open = isCurrent ? ' open' : '';
    return `<details class="sidebar-section"${open}>` +
      `<summary class="sidebar-section-title">${escSidebar(section.label)}</summary>` +
      `<ul class="sidebar-list">${links}</ul></details>`;
  }).join('');

  return `<aside class="sidebar" aria-label="Abschnittsnavigation">\n${items}\n</aside>`;
}

/**
 * Render a prev/next navigation block for a given page slug.
 * @param {Map<string,{prev:object|null,next:object|null}>} prevNext
 * @param {string} currentSlug
 * @param {string} prefix
 * @returns {string} HTML fragment (empty string if no prev or next)
 */
export function renderPrevNext(prevNext, currentSlug, prefix) {
  const nav = prevNext.get(currentSlug);
  if (!nav || (!nav.prev && !nav.next)) return '';
  const prev = nav.prev
    ? `<a class="prevnext-link prevnext-prev" href="${prefix}${nav.prev.outRelPath}">` +
      `<span class="prevnext-label">← Zurück</span><span class="prevnext-title">${escSidebar(nav.prev.title)}</span></a>`
    : '<span class="prevnext-spacer"></span>';
  const next = nav.next
    ? `<a class="prevnext-link prevnext-next" href="${prefix}${nav.next.outRelPath}">` +
      `<span class="prevnext-label">Weiter →</span><span class="prevnext-title">${escSidebar(nav.next.title)}</span></a>`
    : '<span class="prevnext-spacer"></span>';
  return `<nav class="prevnext" aria-label="Seitennavigation">${prev}${next}</nav>`;
}

/** HTML-escape helper (sidebar only — templates.mjs has its own esc()). */
function escSidebar(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
