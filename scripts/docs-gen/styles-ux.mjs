// scripts/docs-gen/styles-ux.mjs
// UX-specific CSS fragments: navigation sidebar, full-text search, a11y.
// Imported by theme.mjs — editorialCss() concatenates these after the base styles.
//
// Phase 1.4: placeholder stubs (byte-equivalent to no addition).
// Phase 2.4: searchCss() filled in with <mark> highlight + snippet layout.
// Phase 3.3: navCss() filled in with sidebar + prev/next + responsive collapse.
// Phase 4.2: a11yCss() filled in with focus ring + skip-link + WCAG-AA tokens.
//
// Import direction: leaf module — no project imports.

/**
 * Navigation sidebar, TOC, prev/next navigation, and responsive collapse styles.
 * @returns {string} CSS source
 */
export function navCss() {
  return `
/* ── sidebar (Phase 3) ── */
.doc-layout{display:grid;grid-template-columns:220px 1fr;gap:0;max-width:calc(var(--maxw) + 240px);margin:0 auto}
.sidebar{width:220px;min-height:100vh;background:var(--paper-2);border-right:1px solid var(--line);
  padding:1.5rem 0;position:sticky;top:3.2rem;max-height:calc(100vh - 3.2rem);overflow-y:auto}
.sidebar-section{border:none;background:none;margin:0}
.sidebar-section summary{list-style:none;padding:.5rem 1.2rem;font-size:.75rem;font-weight:700;
  letter-spacing:.06em;text-transform:uppercase;color:var(--ink-mute);cursor:pointer;
  user-select:none;display:flex;align-items:center;justify-content:space-between}
.sidebar-section summary::-webkit-details-marker{display:none}
.sidebar-section summary::after{content:"›";font-size:.9rem;transition:transform .15s}
.sidebar-section[open] summary::after{transform:rotate(90deg)}
.sidebar-section-title{color:var(--ink-mute)}
.sidebar-list{list-style:none;padding:0;margin:0}
.sidebar-item a{display:block;padding:.35rem 1.2rem .35rem 1.5rem;font-size:.82rem;
  color:var(--ink-soft);text-decoration:none;border-left:2px solid transparent;
  transition:color .12s,border-color .12s;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sidebar-item a:hover{color:var(--accent);border-left-color:var(--accent-line)}
.sidebar-item--active a{color:var(--accent);border-left-color:var(--accent);font-weight:600}
/* prev/next */
.prevnext{display:flex;justify-content:space-between;gap:1rem;margin:3rem 0 1rem;
  padding-top:1.5rem;border-top:1px solid var(--line)}
.prevnext-link{display:flex;flex-direction:column;gap:.2rem;text-decoration:none;
  max-width:48%;padding:.6rem .8rem;border:1px solid var(--line);border-radius:8px;
  transition:border-color .12s,background .12s}
.prevnext-link:hover{border-color:var(--accent-line);background:var(--accent-bg)}
.prevnext-label{font-size:.72rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--ink-mute)}
.prevnext-title{font-size:.88rem;color:var(--accent)}
.prevnext-spacer{flex:1}
/* responsive: collapse sidebar on narrow screens */
@media(max-width:820px){
  .doc-layout{grid-template-columns:1fr}
  .sidebar{width:100%;min-height:auto;position:static;max-height:none;border-right:none;
    border-bottom:1px solid var(--line);padding:.5rem 0}
  .sidebar-item a{white-space:normal}
}`;
}

/**
 * Full-text search result <mark>-highlight and snippet layout styles.
 * @returns {string} CSS source
 */
export function searchCss() {
  return `
/* ── search result mark + snippet (Phase 2) ── */
.search-result-item mark{background:var(--accent-bg);color:var(--accent);
  border-radius:2px;padding:0 .1em;font-style:normal}
.search-result-excerpt mark{color:var(--accent-soft)}`;
}

/**
 * Accessibility styles: focus ring, skip-link, reduced-motion, WCAG-AA contrast tweaks.
 * @returns {string} CSS source
 */
export function a11yCss() {
  return `
/* ── a11y: focus ring (Phase 4) ── */
:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:3px}
/* ── a11y: skip-link (Phase 4) ── */
.skip{position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden;
  z-index:9999;background:var(--paper);color:var(--accent);font-weight:700;padding:.5em 1em;
  border:2px solid var(--accent);border-radius:4px;text-decoration:none}
.skip:focus{left:.5rem;top:.5rem;width:auto;height:auto;overflow:visible}
/* ── a11y: reduced motion ── */
@media(prefers-reduced-motion:reduce){
  *,*::before,*::after{animation-duration:.01ms !important;animation-iteration-count:1 !important;
    transition-duration:.01ms !important}
}`;
}
