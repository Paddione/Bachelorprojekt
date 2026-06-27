# mentolder — Brand Foundations · design-sync notes

Third design-sync target, **foundations** (not a code mirror). 14 self-contained static
HTML cards. No component-compile pipeline — cards are static; `build.mjs` only injects
the token CSS, the shared card CSS, and inline SVG grids.

## Re-build / re-sync
1. `node design-system/build.mjs`  — regenerates `_tokens.css` from the brand SSOT,
   copies SVGs into `assets/`, and re-injects every card (idempotent).
2. `node design-system/validate.mjs`  — lints `@dsCard` markers + injection regions.
3. `node --test design-system/`  — unit tests for build + validate.
4. Push: DesignSync `finalize_plan { writes:["cards/**"], localDir:"design-system" }` → `write_files`.
   Only `cards/**` is uploaded; `_tokens.css` / `_card.css` / `assets/` are local build inputs.

## Quirks
- Token DRYness is guaranteed at the **source** (`build.mjs` copies `colors_and_type.css`
  verbatim); each delivered card is self-contained (tokens inlined). After a token change,
  re-run step 1 to refresh all cards.
- `projectId` lives in `config.json`, set after the first `create_project`.
