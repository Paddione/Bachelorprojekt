// scripts/docs-gen/tokenize.mjs
// Umlaut-safe tokenizer — the SINGLE source of German character folding.
//
// Both the search index builder (build-docs.mjs) and heading-anchor generator
// (slugifyHeading in render-markdown.mjs) import foldGerman from here so that
// query folding and heading-anchor folding are byte-identical (no drift between
// the token that produced a posting and the heading id linked by the result).
//
// Import direction: tokenize.mjs is a leaf — it imports nothing from this project.

/** Minimum token length; tokens shorter than this are discarded by tokenize(). */
const MIN_LEN = 3;

/**
 * Lowercase + German umlaut/eszett folding: ä→ae, ö→oe, ü→ue, ß→ss.
 *
 * This is the **only** place in the codebase where this substitution lives.
 * Never duplicate it inline — always import foldGerman from this module.
 *
 * @param {string} text
 * @returns {string}
 */
export function foldGerman(text) {
  return String(text ?? '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
}

/**
 * Tokenize text for search indexing.
 *
 * Pipeline:
 *   1. foldGerman (lowercase + umlaut folding)
 *   2. replace non-word / non-hyphen chars with spaces
 *   3. split on whitespace
 *   4. strip leading/trailing hyphens from each token
 *   5. discard tokens shorter than MIN_LEN
 *
 * @param {string} text
 * @returns {string[]}
 */
export function tokenize(text) {
  if (!text) return [];
  return foldGerman(text)
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^-+|-+$/g, ''))
    .filter((t) => t.length >= MIN_LEN);
}
