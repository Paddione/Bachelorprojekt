// scripts/docs-gen/legacy.mjs
// Re-wrap committed hand-built docs pages (migrated to docs/legacy-html/) into
// the new editorial shell. Extracts the meaningful body from a legacy page and
// hands the inner HTML back to templates.renderPage. Pages whose body cannot be
// extracted are returned verbatim (mode 'copied') for byte-faithful passthrough.
import * as cheerio from 'cheerio';

/**
 * Strip the trailing " — Workspace MVP" site suffix from a <title>.
 * Tolerates both em-dash and hyphen separators.
 * @param {string} t
 * @returns {string}
 */
function stripTitleSuffix(t) {
  return t
    .replace(/\s*[—–-]\s*Workspace MVP\s*$/u, '')
    .trim();
}

/**
 * Derive a human title for a legacy page.
 * Order: <h1> (hero-title or first) text -> <title> minus suffix -> slug.
 * @param {import('cheerio').CheerioAPI} $
 * @param {string} slug
 * @returns {string}
 */
function deriveLegacyTitle($, slug) {
  const h1 = $('h1.hero-title').first().text().trim()
    || $('h1').first().text().trim();
  if (h1) return h1;
  const titleTag = $('title').first().text().trim();
  if (titleTag) {
    const stripped = stripTitleSuffix(titleTag);
    if (stripped) return stripped;
  }
  return slug;
}

/**
 * Re-wrap a committed legacy HTML page.
 *
 * Extraction preference: main.content -> #main -> <body> (minus chrome).
 * Inline <style>, <script>, the top nav, the page header and any footer are
 * dropped — they belong to the OLD shell and are re-supplied by templates.mjs.
 * If no meaningful content can be extracted, the original html is returned
 * verbatim with mode 'copied'.
 *
 * @param {string} html  Raw committed legacy page HTML.
 * @param {string} slug  Target bare slug (used for the fallback title).
 * @returns {{ title: string, innerHtml: string, mode: 'rewrapped'|'copied' }}
 */
export function rewrapLegacyPage(html, slug) {
  const $ = cheerio.load(html, { xmlMode: false });
  const title = deriveLegacyTitle($, slug);

  // Pick the content root in preference order.
  let $root = $('main.content').first();
  if (!$root.length) $root = $('#main').first();
  if (!$root.length) {
    const $body = $('body').first();
    if ($body.length) {
      // Whole body minus the old chrome.
      $body.find('nav, header, footer, script, style').remove();
      $root = $body;
    }
  } else {
    // Inside the chosen root, drop any nested chrome / inline assets.
    $root.find('nav, header, footer, script, style').remove();
  }

  if ($root && $root.length) {
    // Always strip inline assets that may live directly inside the root.
    $root.find('style, script').remove();
    const innerHtml = $root.html();
    // Require actual content: non-empty markup AND some text/media, otherwise
    // an empty wrapper (e.g. a bare <div></div>) would falsely "rewrap".
    const hasMeaningfulContent = Boolean(
      innerHtml && innerHtml.trim() &&
      ($root.text().trim() || $root.find('img, svg, pre, code, table').length),
    );
    if (hasMeaningfulContent) {
      return { title, innerHtml, mode: 'rewrapped' };
    }
  }

  // No extractable body -> verbatim passthrough.
  return { title, innerHtml: html, mode: 'copied' };
}
