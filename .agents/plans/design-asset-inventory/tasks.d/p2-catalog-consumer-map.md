# p2 — Classification catalog and consumer map

Files: `docs/design-assets/catalog.md`, `docs/design-assets/consumer-map.md`
(new, additive; grounded in the p1 manifest, no existing file changes).

## Task 1: Write the source/derived classification catalog

Create `docs/design-assets/catalog.md` from the committed manifest. Per
scope root record one row per asset group (not per file where a whole
directory shares one verdict):

- Classification: `source` (edited by hand) or `derived` (generated or
  copied), with the evidence: generator script, GENERATED header, or
  byte-identity with a source file (hash match from the manifest).
- Brand, origin path, rights state: `verified` with the license note, or
  `unverified` where the license is unknown — never invent a license.
- Generator metadata where known (script version, prompt, seed, model and
  model license); otherwise the literal value `unknown`.

Known verdicts to encode: token CSS under the design system is a verbatim
GENERATED copy of the consumer brand CSS; SVG snapshots under the design
system assets directory are copies of the brand logo/prop SVGs; Brett
public asset mirrors are rsync copies of the root audio and game trees.

## Task 2: Write the dependency and consumer map

Create `docs/design-assets/consumer-map.md` mapping every producer to its
consumers, resolved against the real repo files (read-only):

- The sync script mappings: root audio tree to the Brett sfx directory
  (destructive), root game tree to the Brett combat directory (destructive),
  root branding tree to the website brand directory (additive only).
- The design-system build: reads the consumer brand token CSS and inlines
  brand SVGs into cards; note the reversed coupling (source derived from
  consumer) as a deliberate follow-up, not fixed here.
- Website brand directory consumers: which pages or stylesheets reference
  the brand assets (grep evidence, file names quoted).

Close with the target-state rules from the ticket: generated outputs ship
as pinned releases with checksums, consumers never use mutable latest
references or absolute WSL paths, migration stays copy-first with hash
verification.

Commit both files as `docs(T901038): add design-asset classification
catalog and consumer map` and push the branch.

Acceptance for p2: every scope root appears in the catalog with a
source/derived verdict; every known coupling from the ticket appears in
the consumer map with file evidence; no license or generator fact is
stated without a source.
