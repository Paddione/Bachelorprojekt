// scripts/docs-gen/frontmatter.mjs
// Frontmatter parsing for the docs generator.
//
// Wraps gray-matter so YAML block scalars (folded `>` and literal `|`) expand
// to their FULL value. This replaces the hand-rolled parser in the old
// scripts/sync-skill-docs.mjs, which split each line on the first colon and so
// captured only ">" for a `description: >` block — truncating every agent
// description.
import matter from 'gray-matter';

/**
 * Parse YAML frontmatter from a markdown/skill/agent source string.
 *
 * @param {string} raw - the full file contents.
 * @returns {{ data: object, body: string }}
 *   `data` is the parsed frontmatter object (empty object when absent);
 *   `body` is the markdown after the frontmatter (the verbatim input when absent).
 */
export function parseFrontmatter(raw) {
  const input = typeof raw === 'string' ? raw : '';
  // gray-matter only treats a leading `---\n...\n---` fence as frontmatter;
  // when there is none it returns the input unchanged as `content` with empty data.
  let parsed;
  try {
    parsed = matter(input);
  } catch {
    // Some real skill/agent frontmatter contains unquoted `description:` scalars
    // with embedded `: "..."` sequences (e.g. `Triggers on: "iterate on dev"`)
    // that strict YAML rejects. Claude's own loader is tolerant; mirror that by
    // falling back to a flat, line-based key:value parse of the fenced block so
    // a single tricky file never aborts the whole build.
    return parseFrontmatterLoose(input);
  }
  const data = parsed.data && typeof parsed.data === 'object' ? parsed.data : {};
  // When there was no frontmatter, return the original string verbatim as body
  // (gray-matter strips a leading newline from `content`, which we don't want).
  const hasFrontmatter = Object.keys(data).length > 0 || parsed.matter !== '';
  // gray-matter leaves a single leading newline on `content` after the closing
  // fence; drop it so the body starts at the first real content line.
  const body = hasFrontmatter ? parsed.content.replace(/^\n/, '') : input;
  return { data, body };
}

/**
 * Tolerant fallback used only when strict YAML parsing of the frontmatter fence
 * throws. Splits the leading `---\n...\n---` block into flat `key: value` pairs
 * (taking the value after the FIRST colon, so embedded colons in the value are
 * preserved verbatim). Returns the same `{ data, body }` shape.
 * @param {string} input
 * @returns {{ data: object, body: string }}
 */
function parseFrontmatterLoose(input) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(input);
  if (!m) return { data: {}, body: input };
  const data = {};
  for (const line of m[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    if (!key || /\s/.test(key)) continue; // skip continuation/block-scalar lines
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    data[key] = value;
  }
  const body = input.slice(m[0].length);
  return { data, body };
}

/**
 * Derive a human-readable page title.
 * Precedence: data.title -> data.name -> first markdown H1 in body -> title-cased slug.
 *
 * @param {object} data - parsed frontmatter object.
 * @param {string} body - markdown body.
 * @param {string} fallbackSlug - kebab-case slug used as the final fallback.
 * @returns {string}
 */
export function deriveTitle(data, body, fallbackSlug) {
  const meta = data && typeof data === 'object' ? data : {};
  if (typeof meta.title === 'string' && meta.title.trim()) return meta.title.trim();
  if (typeof meta.name === 'string' && meta.name.trim()) return meta.name.trim();

  const h1 = typeof body === 'string' ? body.match(/^#\s+(.+?)\s*$/m) : null;
  if (h1) return h1[1].trim();

  return titleCaseSlug(fallbackSlug || '');
}

/**
 * Turn a kebab-case slug into a Title-Cased label ("cluster-deployment" -> "Cluster Deployment").
 * @param {string} slug
 * @returns {string}
 */
function titleCaseSlug(slug) {
  return String(slug)
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
