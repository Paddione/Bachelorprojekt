// scripts/docs-gen/registry.mjs
import { parseFrontmatter, deriveTitle } from './frontmatter.mjs';

/**
 * @typedef {Object} SourceDoc
 * @property {'skill'|'agent'|'doc'} type
 * @property {'repo'|string} provenance  'repo' | '<plugin>@<version>'
 * @property {string} name
 * @property {string} sourcePath absolute
 * @property {string} raw
 *
 * @typedef {Object} Page
 * @property {string} slug
 * @property {'skill'|'agent'|'doc'} type
 * @property {string} provenance
 * @property {string} name
 * @property {string} title
 * @property {string} description
 * @property {string|null} domain
 * @property {string} bodyMarkdown
 * @property {string} sourcePath
 * @property {string} outRelPath
 *
 * @typedef {Object} Edge
 * @property {string} from slug
 * @property {string} to slug
 * @property {'wikilink'|'mdlink'} kind
 *
 * @typedef {Object} RoutingRow
 * @property {string[]} signals
 * @property {string} agent slug
 */

/** Canonical domain list. `null` domains are treated as 'general' by the graph. */
export const DOMAINS = ['website', 'ops', 'infra', 'test', 'db', 'security', 'general'];

/**
 * Kebab-case slug from a dir/file name. Reproduces the legacy slugifyHeading
 * behavior: lowercase, German umlaut/eszett transliteration, spaces -> hyphens,
 * strip anything outside [a-z0-9-].
 * @param {string} text
 * @returns {string}
 */
export function slugify(text) {
  return String(text).toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * The plugin name segment of a '<plugin>@<version>' provenance string.
 * 'repo' has no plugin name and returns ''.
 * @param {string} provenance
 * @returns {string}
 */
export function pluginNameOf(provenance) {
  if (!provenance || provenance === 'repo') return '';
  return provenance.split('@')[0];
}

/**
 * Implements the contract output-path table.
 * @param {{type:string, provenance:string, slug:string}} page
 * @returns {string}
 */
export function outPathFor(page) {
  const { type, provenance, slug } = page;
  const isRepo = provenance === 'repo';
  const pluginSlug = pluginNameOf(provenance);
  if (type === 'skill') {
    return isRepo ? `skills/${slug}.html` : `skills/${pluginSlug}--${slug}.html`;
  }
  if (type === 'agent') {
    return isRepo ? `agents/${slug}.html` : `agents/${pluginSlug}--${slug}.html`;
  }
  return `${slug}.html`;
}

// --- Stub exports (implemented in later TDD steps) -------------------------
// ESM static imports require these bindings to exist; they throw until their
// real implementations replace them in subsequent steps.
/**
 * Strip surrounding markdown decorations (backticks, quotes) and trim a cell token.
 * @param {string} s
 * @returns {string}
 */
function cleanToken(s) {
  return s
    .trim()
    .replace(/^["'`]+/, '')
    .replace(/["'`]+$/, '')
    .trim();
}

/**
 * Parse the "Agent Routing" markdown table from CLAUDE.md text.
 * @param {string} claudeMdText
 * @returns {RoutingRow[]}
 */
export function parseRoutingTable(claudeMdText) {
  const lines = String(claudeMdText).split('\n');
  const rows = [];
  let inTable = false;
  for (const line of lines) {
    const cells = line.split('|');
    // A markdown table row has leading + trailing pipes -> empty first/last cells.
    const isTableRow = cells.length >= 4 && cells[0].trim() === '' && cells[cells.length - 1].trim() === '';
    if (!isTableRow) {
      if (inTable) break; // table ended
      continue;
    }
    const signalsCell = cells[1].trim();
    const agentCell = cells[2].trim();
    const lower = signalsCell.toLowerCase();
    if (lower === 'signals' && agentCell.toLowerCase() === 'agent') {
      inTable = true; // header row
      continue;
    }
    if (!inTable) continue;
    if (/^[-:\s]+$/.test(signalsCell)) continue; // separator row |---|---|
    const agent = cleanToken(agentCell);
    if (!agent) continue;
    const signals = signalsCell
      .split(',')
      .map(cleanToken)
      .filter(Boolean);
    rows.push({ signals, agent });
  }
  return rows;
}

const AGENT_DOMAIN_RE = /^bachelorprojekt-([a-z]+)$/;

/**
 * Map a routing agent slug ('bachelorprojekt-infra') to its domain ('infra').
 * @param {string} agent
 * @returns {string|null}
 */
function agentToDomain(agent) {
  const m = AGENT_DOMAIN_RE.exec(agent || '');
  if (m && DOMAINS.includes(m[1])) return m[1];
  return null;
}

/**
 * Escape a string for safe use inside a RegExp.
 * @param {string} s
 * @returns {string}
 */
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Resolve the domain for a page.
 * @param {{type:string,name?:string,title?:string,description?:string,domain?:string|null,domains?:string[]}} page
 * @param {RoutingRow[]} routingRows
 * @returns {string|null}
 */
export function assignDomain(page, routingRows) {
  // 1. bachelorprojekt-<x> agent name maps directly.
  if (page.type === 'agent') {
    const fromName = agentToDomain(page.name || page.slug || '');
    if (fromName) return fromName;
  }
  // 2. Explicit frontmatter domain / first of domains[].
  const fmCandidates = [];
  if (typeof page.domain === 'string') fmCandidates.push(page.domain);
  if (Array.isArray(page.domains)) fmCandidates.push(...page.domains);
  for (const cand of fmCandidates) {
    const norm = String(cand).trim().toLowerCase();
    if (DOMAINS.includes(norm)) return norm;
  }
  // 3. Keyword-match name/title/description against routing signals.
  const haystack = `${page.name || ''} ${page.title || ''} ${page.description || ''}`.toLowerCase();
  for (const row of routingRows || []) {
    const domain = agentToDomain(row.agent);
    if (!domain) continue;
    for (const signal of row.signals) {
      const token = String(signal).trim().toLowerCase().replace(/[/*]+$/g, '');
      if (token.length < 3) continue; // skip noise like 'ui'/'css'-too-short markers
      if (new RegExp(`\\b${escapeRe(token)}\\b`).test(haystack)) {
        return domain;
      }
    }
  }
  // 4. Unmatched.
  return null;
}

/**
 * First non-empty frontmatter string field among the given keys.
 * @param {object} data
 * @param {string[]} keys
 * @returns {string}
 */
function firstString(data, keys) {
  for (const k of keys) {
    const v = data && data[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

/**
 * Turn SourceDoc[] into Page[].
 *
 * IC-3: canonical signature is buildPages(sources, routingRows) where
 * routingRows is the parsed RoutingRow[] (required at the real entry point;
 * defaults to [] for unit tests). For backwards compatibility the second arg
 * may also be an options object of the form { routingRows }.
 *
 * @param {SourceDoc[]} sources
 * @param {RoutingRow[]|{routingRows?: RoutingRow[]}} [routingRows]
 * @returns {Page[]}
 */
export function buildPages(sources, routingRows = []) {
  const rows = Array.isArray(routingRows)
    ? routingRows
    : (routingRows && Array.isArray(routingRows.routingRows) ? routingRows.routingRows : []);
  return sources.map((src) => {
    const { data, body } = parseFrontmatter(src.raw);
    let slug = slugify(src.name);
    if (src.type === 'doc' && src.name === 'db-schema-diagram') {
      slug = 'db-schema';
    }
    const title = deriveTitle(data, body, slug);
    const description = firstString(data, ['description', 'summary']);
    const fmDomain = firstString(data, ['domain']);
    const fmDomains = Array.isArray(data && data.domains) ? data.domains : undefined;
    const draft = {
      slug,
      type: src.type,
      provenance: src.provenance,
      name: src.name,
      title,
      description,
      domain: fmDomain || null,
      domains: fmDomains,
      bodyMarkdown: body,
      sourcePath: src.sourcePath,
    };
    const domain = (src.type === 'doc' && src.name === 'db-schema-diagram')
      ? 'db'
      : assignDomain(draft, rows);
    const page = {
      slug,
      type: src.type,
      provenance: src.provenance,
      name: src.name,
      title,
      description,
      domain,
      bodyMarkdown: body,
      sourcePath: src.sourcePath,
      outRelPath: '',
    };
    page.outRelPath = outPathFor(page);
    return page;
  });
}

/**
 * Build a slug->Page registry. Repo provenance wins on slug collisions.
 *
 * IC-2: the returned object includes the module-level `outPathFor` so that
 * render-markdown.mjs#rewriteCrossLinks can call `registry.outPathFor(target)`.
 *
 * @param {Page[]} pages
 * @returns {{ pages: Page[], bySlug: Map<string,Page>, resolve: (name:string)=>Page|null, outPathFor: typeof outPathFor }}
 */
export function buildRegistry(pages) {
  const bySlug = new Map();
  for (const page of pages) {
    const existing = bySlug.get(page.slug);
    if (!existing) {
      bySlug.set(page.slug, page);
      continue;
    }
    // Collision: repo beats plugin; otherwise keep the first seen.
    if (existing.provenance !== 'repo' && page.provenance === 'repo') {
      bySlug.set(page.slug, page);
    }
  }
  function resolve(name) {
    if (!name) return null;
    const slug = slugify(name);
    return bySlug.get(slug) || null;
  }
  return { pages, bySlug, resolve, outPathFor };
}
const WIKILINK_RE = /\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g;
const MDLINK_RE = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

/**
 * The bare reference name from a relative markdown link target, or null if the
 * target is an external URL, an anchor, or not a .md link.
 * @param {string} target
 * @returns {string|null}
 */
function mdLinkRefName(target) {
  const t = String(target).trim();
  if (!t || t.startsWith('#')) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) return null; // http(s):, etc.
  if (t.startsWith('mailto:')) return null;
  const noAnchor = t.split('#')[0];
  if (!/\.md$/i.test(noAnchor)) return null;
  const base = noAnchor.split('/').pop() || '';
  return base.replace(/\.md$/i, '');
}

/**
 * Collect cross-link edges from page bodies.
 * @param {Page[]} pages
 * @param {{resolve:(name:string)=>Page|null}} registry
 * @returns {{ edges: Edge[], unresolved: Array<{from:string, ref:string}> }}
 */
export function collectEdges(pages, registry) {
  const edges = [];
  const unresolved = [];
  const seen = new Set();
  const addEdge = (from, to, kind) => {
    if (!to || to === from) return;
    const key = `${from}|${to}|${kind}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ from, to, kind });
  };
  for (const page of pages) {
    const md = page.bodyMarkdown || '';
    let m;
    WIKILINK_RE.lastIndex = 0;
    while ((m = WIKILINK_RE.exec(md)) !== null) {
      const ref = m[1].trim();
      if (!ref) continue;
      const target = registry.resolve(ref);
      if (target) addEdge(page.slug, target.slug, 'wikilink');
      else unresolved.push({ from: page.slug, ref });
    }
    MDLINK_RE.lastIndex = 0;
    while ((m = MDLINK_RE.exec(md)) !== null) {
      const ref = mdLinkRefName(m[1]);
      if (!ref) continue;
      const target = registry.resolve(ref);
      if (target) addEdge(page.slug, target.slug, 'mdlink');
      else unresolved.push({ from: page.slug, ref });
    }
  }
  return { edges, unresolved };
}
