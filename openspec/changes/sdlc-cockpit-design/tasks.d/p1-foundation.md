# Partial p1 — Foundation: tokens.css + document.css
**Role:** implementation | **Ticket:** T002460 | **Depends:** none

## Goal: Create layers 1+2 of the design kit

Files: `.lavish/kit/tokens.css` (only CSS custom properties, no selectors), `.lavish/kit/document.css` (document building blocks, imports tokens.css).

## tokens.css — Design Tokens

Color system: dark surfaces (E20), text hierarchy, single accent #58a6ff, status colors (ok/warn/err/info), borders. Typography: font-ui (system sans-serif) + font-mono for data. Modular scale 1.25 base 14px. Spacing 4px unit. Radii (sm/md/lg/full). Motion durations + easings. ALL values as `--custom-properties` in `:root {}`. NO selectors, NO media queries.

## document.css — Building Blocks

`@import url('./tokens.css')` at top. Reset box-sizing. html: font-ui, text-sm, bg-base, text-primary, antialiased. body: max-width 52rem, centered, space-8 top, space-4 sides. Headings h1-h6: text-3xl down to text-sm, weight-semibold/bold, leading-tight. Body text p/li/dd: text-sm, leading-relaxed, text-secondary. Code blocks: font-mono, bg-inset, radius-md, padding. Tables: border-default, space-3 padding, text-sm. `.decision-block`: bg-elevated, border-left accent, radius-md, space-4 padding. `[data-lavish-question]`: bg-accent-muted, 3px left border accent, space-3/4 padding. blockquote: border-left accent, bg-elevated.

## Acceptance

- tokens.css: ONLY `:root { --var: value; }` blocks, zero selectors
- document.css: NO hardcoded hex, px, rem values — every property references a `--var`
- `data-lavish-question` styled per E9
- code/pre in font-mono (E20)
- Both files in `.lavish/kit/`, no build step, no npm, no JS
