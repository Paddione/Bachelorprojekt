## ADDED Requirements

### Requirement: Volltext-Suche über generierte Docs-Seiten

The system SHALL build a zero-dependency inverted full-text search index over the body
content of every generated docs page at build time and SHALL serve a ranked client-side
search experience from it. The generated `search-index.json` artifact SHALL stay at or below
2 MB. Search results SHALL be ranked (term frequency with a title/heading weight boost),
SHALL render a `<mark>`-highlighted snippet, and SHALL link to the matching heading anchor
(`#<headingId>`). The search overlay SHALL expose ARIA semantics: `role="dialog"` on the
overlay, `role="searchbox"` (`type="search"`) on the input, `role="listbox"` with
`aria-live="polite"` on the result list, and `role="option"` on each hit. No new runtime or
build dependency SHALL be introduced (no SSG, search library, or WASM); the tokenizer and
index are first-party Node code.

#### Scenario: Body-Treffer wird gerankt und springt zum Heading

- **GIVEN** eine generierte Docs-Seite, deren Fließtext (nicht der Titel) den Suchbegriff
  enthält, und ein gebautes `search-index.json`
- **WHEN** der Nutzer das Such-Overlay (Ctrl/⌘-K) öffnet und den Begriff eingibt
- **THEN** erscheint die Seite in der nach Score sortierten Trefferliste mit einem
  `<mark>`-hervorgehobenen Snippet, und ein Klick navigiert zum Heading-Anchor
  (`#<headingId>`) statt nur zum Seitenanfang

#### Scenario: Index-Artefakt bleibt unter der Größenschranke

- **GIVEN** der vollständige Docs-Build über alle Quellseiten
- **WHEN** `search-index.json` geschrieben wird
- **THEN** enthält es Body-Tokens (nicht nur Titel/Excerpt) und ist ≤ 2 MB groß

### Requirement: Sektion-fokussierte Navigation, Prev/Next und h3-TOC

The system SHALL derive a deterministic navigation model from the existing page registry and
render-time groups (without new frontmatter or source edits) and SHALL render on every content
page: a section-focused sidebar that expands only the current section, collapses other sections,
and highlights the current page; deterministic previous/next links derived from a global canonical
order; and an in-page table of contents that includes both h2 and h3 headings with anchor IDs.
Pages without a group SHALL fall into an alphabetical "Sonstige" fallback bucket. The sidebar
SHALL collapse into a disclosure control below the 820px breakpoint. The navigation model SHALL
be produced by a pure, side-effect-free module with no import cycles.

#### Scenario: Sidebar hebt aktuelle Seite hervor und Prev/Next ist konsistent

- **GIVEN** eine gerenderte Content-Seite innerhalb einer Sektion mit mehreren Seiten
- **WHEN** die Seite gebaut wird
- **THEN** zeigt die Sidebar die aktuelle Sektion aufgeklappt mit markierter aktueller Seite,
  andere Sektionen kollabiert, und die Prev/Next-Links sind deterministisch (gilt
  `a.next.slug == b.slug`, dann gilt `b.prev.slug == a.slug`)

#### Scenario: h3-Überschriften erscheinen im TOC mit Anchor-IDs

- **GIVEN** eine Markdown-Quelle mit h2- und darunterliegenden h3-Überschriften
- **WHEN** die Seite gerendert wird
- **THEN** tragen die h3-Überschriften umlaut-sichere Anchor-IDs und erscheinen verschachtelt
  unter ihrem h2 im „Auf dieser Seite"-TOC

### Requirement: Lesbarkeit und WCAG-AA-Barrierefreiheit

The system SHALL make the generated dark-theme docs site keyboard- and screenreader-accessible:
a visible-on-focus skip link (`href="#main"`) SHALL be the first body element of every page;
all interactive elements SHALL show a `:focus-visible` focus ring; the dark theme tokens SHALL
meet WCAG-AA contrast (≥ 4.5:1 for body text, ≥ 3:1 for large text) against their background;
and animations SHALL honour `prefers-reduced-motion`. These additions SHALL be composed from a
sibling CSS module so that `theme.mjs` does not net-grow past its 500-line limit.

#### Scenario: Tastatur-Nutzer überspringt zum Inhalt mit sichtbarem Fokus

- **GIVEN** ein gerendertes Docs-HTML-Dokument
- **WHEN** ein Tastatur-Nutzer die Seite lädt und Tab drückt
- **THEN** ist das erste fokussierbare Element ein sichtbarer Skip-Link mit `href="#main"`,
  und fokussierte interaktive Elemente zeigen einen `:focus-visible`-Fokusring

#### Scenario: Dark-Token-Kontrast erfüllt WCAG-AA

- **GIVEN** die Dark-Theme-`:root`-Tokens (u. a. `--muted`, `--faint`, `--ink-mute`)
- **WHEN** Textfarbe gegen den jeweiligen Hintergrund (`--paper`/`--paper-2`) gemessen wird
- **THEN** ist das Kontrastverhältnis ≥ 4.5:1 für Fließtext bzw. ≥ 3:1 für großen Text
