/**
 * Shared, read-only Brain Wiki index with BM25 and lifecycle filters.
 * 1:1 port of scripts/brain-index.py to Node.js (stdlib only).
 */

import { readFileSync, statSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";

const RESULT_METADATA = [
  "type",
  "tags",
  "status",
  "source_kind",
  "source_revision",
  "observed_at",
  "upstream_revision",
  "valid_from",
  "valid_until",
  "superseded_by",
];

/**
 * Parse an ISO-8601 date string into a UTC Date.
 * @param {string} value
 * @returns {Date}
 */
export function parseDateTime(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("expected non-empty ISO-8601 string");
  }
  let normalized = value.trim();
  if (normalized.endsWith("Z")) {
    normalized = normalized.slice(0, -1) + "+00:00";
  }
  const parsed = new Date(normalized);
  if (isNaN(parsed.getTime())) {
    throw new Error(`invalid ISO-8601 date: ${value}`);
  }
  // Enforce explicit UTC offset when a date-time separator is present
  if (
    !/\+|-/g.test(value.replace("Z", "")) &&
    (normalized.includes("T") || normalized.includes(" "))
  ) {
    throw new Error("timestamp requires explicit UTC offset");
  }
  return parsed;
}

/**
 * Parse a frontmatter scalar value.
 * @param {string} value
 * @returns {string | string[] | number}
 */
function scalar(value) {
  value = value.trim();
  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map((item) => scalar(item));
  }
  if (value.length >= 2 && value[0] === '"' && value[value.length - 1] === '"') {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }
  return value.replace(/^['"]|['"]$/g, "").trim();
}

/**
 * Parse YAML-like frontmatter between `---` delimiters.
 * @param {string} content
 * @returns {{ frontmatter: Record<string, string | string[]>, body: string }}
 */
export function parseFrontmatter(content) {
  const lines = content.split("\n");
  if (!lines.length || lines[0].trim() !== "---") {
    return { frontmatter: {}, body: content.trim() };
  }
  const closingIndex = lines.findIndex(
    (line, i) => i > 0 && line.trim() === "---",
  );
  if (closingIndex === -1) {
    return { frontmatter: {}, body: content.trim() };
  }
  const metadata = {};
  for (let i = 1; i < closingIndex; i++) {
    const line = lines[i];
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;
    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();
    if (key && value !== undefined) {
      metadata[key] = scalar(value);
    }
  }
  const body = lines.slice(closingIndex + 1).join("\n").trim();
  return { frontmatter: metadata, body };
}

/**
 * Determine freshness relative to an as-of instant.
 * @param {Record<string, string | string[]>} frontmatter
 * @param {Date} asOf
 * @returns {string} "current" | "stale" | "future" | "unknown"
 */
export function freshnessFor(frontmatter, asOf) {
  let start, end;
  try {
    start = frontmatter.valid_from
      ? parseDateTime(String(frontmatter.valid_from))
      : null;
    end = frontmatter.valid_until
      ? parseDateTime(String(frontmatter.valid_until))
      : null;
  } catch {
    return "unknown";
  }
  if (start === null && end === null) return "unknown";
  if (start !== null && asOf < start) return "future";
  if (end !== null && asOf >= end) return "stale";
  return "current";
}

/**
 * Recursively find all .md files under a directory (sync, for 1:1 Python parity).
 * @param {string} dir
 * @returns {string[]}
 */
function findMdFilesSync(dir) {
  const results = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...findMdFilesSync(fullPath));
      } else if (extname(entry.name).toLowerCase() === ".md") {
        results.push(fullPath);
      }
    }
  } catch {
    return [];
  }
  return results.sort();
}

/**
 * In-memory, lazily refreshed index of sorted Markdown pages.
 */
class BrainIndex {
  /**
   * @param {string} wikiDir
   */
  constructor(wikiDir) {
    this.wikiDir = wikiDir.replace(/^~/, process.env.HOME || "");
    this.pages = {};
    this._built = false;
    this._mtimes = {};
    this._buildIndex();
  }

  _buildIndex() {
    if (!this._isDir(this.wikiDir)) return;
    const pages = {};
    const mtimes = {};
    const paths = findMdFilesSync(this.wikiDir);

    for (const filePath of paths) {
      try {
        const content = readFileSync(filePath, "utf-8");
        const st = statSync(filePath);
        const { frontmatter, body } = parseFrontmatter(content);
        let tags = frontmatter.tags;
        if (typeof tags === "string") tags = [tags];
        if (!Array.isArray(tags)) tags = [];
        const stem = filePath.replace(/\.md$/i, "");
        const title = frontmatter.title
          ? String(frontmatter.title)
          : stem.replace(/.*\//, "").replace(/\.md$/i, "");
        pages[stem] = {
          frontmatter,
          body,
          path: filePath,
          title,
          tags: tags.map(String),
        };
        mtimes[filePath] = st.mtimeMs * 1e6; // ms → ns
      } catch {
        // Skip unreadable files
      }
    }
    this.pages = pages;
    this._mtimes = mtimes;
    this._built = true;
  }

  _isDir(dir) {
    try {
      return statSync(dir).isDirectory();
    } catch {
      return false;
    }
  }

  _wikiChanged() {
    if (!this._isDir(this.wikiDir)) return false;
    try {
      const paths = findMdFilesSync(this.wikiDir);
      const current = {};
      for (const p of paths) {
        current[p] = statSync(p).mtimeMs * 1e6;
      }
      const allPaths = new Set([
        ...Object.keys(current),
        ...Object.keys(this._mtimes),
      ]);
      for (const p of allPaths) {
        if (current[p] !== this._mtimes[p]) return true;
      }
      return false;
    } catch {
      return true;
    }
  }

  _ensureFresh() {
    if (this._isDir(this.wikiDir) && (!this._built || this._wikiChanged())) {
      this._buildIndex();
    }
  }

  /**
   * Tokenize text: lowercase \w+ tokens with length > 1.
   * @param {string} text
   * @returns {string[]}
   */
  static _tokenize(text) {
    const tokens = text.match(/\w+/g) || [];
    return tokens
      .filter((t) => t.length > 1)
      .map((t) => t.toLowerCase());
  }

  /**
   * Extract a snippet from body around the first query term match.
   * @param {string} body
   * @param {string[]} queryTerms
   * @param {number} [radius=100]
   * @returns {string}
   */
  static _extractSnippet(body, queryTerms, radius = 100) {
    const positions = [];
    for (const term of queryTerms) {
      const pos = body.toLowerCase().indexOf(term.toLowerCase());
      if (pos >= 0) positions.push(pos);
    }
    if (positions.length === 0) {
      const truncated = body.slice(0, 200);
      return truncated + (body.length > 200 ? "..." : "");
    }
    const position = Math.min(...positions);
    const start = Math.max(0, position - radius);
    const end = Math.min(body.length, position + radius);
    let snippet = body.slice(start, end);
    if (start > 0) snippet = "\u2026" + snippet;
    if (end < body.length) snippet += "\u2026";
    return snippet;
  }

  /**
   * Apply lifecycle + field filters to a page.
   * @param {Record<string, any>} page
   * @param {{ pageType?: string, tags?: string[], status?: string, sourceKind?: string, asOf?: Date }} filters
   * @returns {boolean}
   */
  static _matches(page, filters) {
    const fm = page.frontmatter;
    if (filters.pageType !== undefined && fm.type !== filters.pageType)
      return false;
    if (filters.status !== undefined && fm.status !== filters.status)
      return false;
    if (filters.sourceKind !== undefined && fm.source_kind !== filters.sourceKind)
      return false;
    if (filters.tags !== undefined) {
      const pageTags = new Set(page.tags.map((t) => t.toLowerCase()));
      for (const tag of filters.tags) {
        if (!pageTags.has(tag.toLowerCase())) return false;
      }
    }
    if (filters.asOf !== undefined) {
      const state = freshnessFor(fm, filters.asOf);
      if (state === "stale" || state === "future") return false;
    }
    return true;
  }

  /**
   * Search pages with BM25 ranking.
   * @param {string} query
   * @param {number} [topK=5]
   * @param {{ pageType?: string, tags?: string[], status?: string, sourceKind?: string, asOf?: string | Date }} [filters]
   * @returns {{ slug: string, score: number, title: string, snippet: string, freshness: string, [key: string]: any }[]}
   */
  search(query, topK = 5, filters = {}) {
    this._ensureFresh();
    const queryTerms = BrainIndex._tokenize(query);
    if (queryTerms.length === 0 || Object.keys(this.pages).length === 0)
      return [];

    const asOf =
      filters.asOf instanceof Date
        ? filters.asOf
        : typeof filters.asOf === "string"
          ? parseDateTime(filters.asOf)
          : null;

    const filtered = {};
    for (const [slug, page] of Object.entries(this.pages)) {
      if (BrainIndex._matches(page, { ...filters, asOf })) {
        filtered[slug] = page;
      }
    }
    if (Object.keys(filtered).length === 0) return [];

    // Compute term frequencies
    const terms = {};
    const lengths = {};
    const frequency = {};

    for (const [slug, page] of Object.entries(filtered)) {
      const text = page.title + " " + page.tags.join(" ") + " " + page.body;
      const tokens = BrainIndex._tokenize(text);
      lengths[slug] = tokens.length;
      const counts = {};
      for (const token of tokens) {
        counts[token] = (counts[token] || 0) + 1;
      }
      terms[slug] = counts;
      for (const token of new Set(tokens)) {
        frequency[token] = (frequency[token] || 0) + 1;
      }
    }

    const count = Object.keys(filtered).length;
    const average =
      Object.values(lengths).reduce((a, b) => a + b, 0) / Math.max(count, 1);

    // BM25 scoring
    const scores = {};
    for (const slug of Object.keys(filtered)) {
      let score = 0.0;
      for (const term of queryTerms) {
        const tf = terms[slug]?.[term] || 0;
        if (!tf) continue;
        const idf = Math.log(
          (count - frequency[term] + 0.5) / (frequency[term] + 0.5) + 1.0,
        );
        score +=
          (idf * tf * 2.5) /
          (tf +
            1.5 *
              (0.25 + 0.75 * lengths[slug] / Math.max(average, 1)));
      }
      if (score > 0) scores[slug] = score;
    }

    const ranked = Object.entries(scores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK);

    const freshnessInstant = asOf || new Date();
    const results = [];
    for (const [slug, score] of ranked) {
      const page = filtered[slug];
      const result = {
        slug,
        score: Math.round(score * 10000) / 10000,
        title: page.title,
        snippet: BrainIndex._extractSnippet(page.body, queryTerms),
        freshness: freshnessFor(page.frontmatter, freshnessInstant),
      };
      for (const key of RESULT_METADATA) {
        if (key in page.frontmatter) {
          result[key] = page.frontmatter[key];
        }
      }
      results.push(result);
    }
    return results;
  }

  /**
   * Read a complete page by slug.
   * @param {string} slug
   * @returns {{ slug: string, frontmatter: Record<string, any>, body: string, path: string } | null}
   */
  readPage(slug) {
    this._ensureFresh();
    const page = this.pages[slug];
    if (!page) return null;
    return {
      slug,
      frontmatter: page.frontmatter,
      body: page.body,
      path: page.path,
    };
  }
}

export { BrainIndex };
