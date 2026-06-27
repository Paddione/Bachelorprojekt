# react-homepage-blocks


<!-- merged from change delta react-homepage-blocks.md on 2026-06-21 -->

## Purpose

### Requirement: Block-Dokument-Schema (Zod)

The system SHALL define a Zod-validated homepage block document of shape
`{ schemaVersion: number, blocks: Block[] }`, where each `Block` is
`{ id: string, type: BlockType, props: <typ-spezifisch> }` as a discriminated union over
`type`. The union SHALL cover the seven catalog types (`hero`, `stats`, `services`, `whyMe`,
`process`, `faq`, `cta`) and the three generic types (`richText`, `image`, `spacer`).
The `services` block's `items[].icon` SHALL be a closed `z.enum` containing exactly the
`iconRegistry` keys (`fuehrung`, `digitalisierung`, `team`, `strategie`, `kommunikation`,
`resilienz`), and `items[].meta` SHALL be an optional string (matching the existing
`Service` interface, unused in the P1 seed). The `whyMe` block's `intro` SHALL be structured
as `{ prefix, emphasis, suffix }` so that the `<em>` emphasis renders deterministically at the
same position as today. The current schema version SHALL be exposed as a single exported
`SCHEMA_VERSION` constant (not duplicated).

#### Scenario: Valid document round-trips through the schema
- **GIVEN** a homepage block document whose blocks each carry a valid `id`, `type`, and
  type-matching `props`
- **WHEN** the document is parsed with `HomepageBlocksDocument.parse`
- **THEN** parsing succeeds and the parsed result is structurally equal to the input
  (round-trip), preserving block order

#### Scenario: Unknown service icon is rejected
- **GIVEN** a `services` block whose `items[].icon` is a value not in the `iconRegistry` keys
- **WHEN** the document is validated against the schema
- **THEN** validation fails (the icon enum is enforced, no free-string icons accepted)

#### Scenario: Optional service meta is accepted or omitted
- **GIVEN** a `services` block whose `items[]` either include or omit the optional `meta` string
- **WHEN** the document is validated against the schema
- **THEN** validation succeeds in both cases (the schema is not narrower than the `Service`
  interface)

## Requirements

### Requirement: Block-getriebenes Homepage-Rendering mit Parität (Null-Diff)

The system SHALL render the `react.mentolder.de` homepage exclusively through a `BlockRenderer`
that maps each `block.type` to a presentational block component and renders the blocks in order.
The rendered output SHALL be visually and DOM-identical to the homepage as rendered before this
change (Null-Diff). `HomePage.tsx` SHALL NOT contain inline homepage content and SHALL NOT
directly import homepage content fields from `content.ts`. Block components SHALL be purely
presentational (props in, no fetch, no `content.ts` import).

#### Scenario: Homepage renders all seven sections from the seed
- **GIVEN** the committed homepage block seed document
- **WHEN** `HomePage` renders via `BlockRenderer`
- **THEN** all seven catalog sections (hero, stats, services, whyMe, process, faq, cta) are
  rendered in the current order

#### Scenario: Full-page snapshot is unchanged after the refactor
- **GIVEN** a full-page render snapshot of the homepage taken before the block refactor
- **WHEN** the homepage is rendered through `BlockRenderer` + seed after the refactor
- **THEN** the new full-page snapshot is identical to the pre-refactor snapshot (Null-Diff)

#### Scenario: Block components receive content only via props
- **GIVEN** the block components under `src/blocks/`
- **WHEN** the source is inspected for imports
- **THEN** no block component imports `content.ts`; all content arrives through props

### Requirement: Fail-closed Schema-Versionierung

The system SHALL validate the incoming block document with Zod at render time. When the
document fails validation OR its `schemaVersion` does not equal the current `SCHEMA_VERSION`,
the `BlockRenderer` SHALL fall back to the committed seed document (fail-closed), rendering
neither garbage nor crashing.

#### Scenario: Version mismatch falls back to the seed
- **GIVEN** a block document whose `schemaVersion` differs from `SCHEMA_VERSION`
- **WHEN** it is passed to the `BlockRenderer`
- **THEN** the renderer renders the committed seed content instead, and does not throw

#### Scenario: Invalid document falls back to the seed
- **GIVEN** a block document that fails Zod `safeParse`
- **WHEN** it is passed to the `BlockRenderer`
- **THEN** the renderer renders the committed seed content instead, and does not throw

### Requirement: Committeter Seed = heutiger gerenderter Content

The system SHALL commit a static seed module (`mentolder-web/src/blocks/seed.ts`) exporting a
`HomepageBlocksDocument` that reproduces the content as rendered today. The content source SHALL
be `content.ts` plus the literals held inline in `HomePage.tsx`; on conflict the inline-rendered
value SHALL win over the (currently unrendered) `content.ts` value. The seed SHALL include the
inline testimonial (`Dr. M. Albers` / `CTO · mittelständisches SaaS-Unternehmen`) and the inline
WhyMe points, which map to no `content.ts` field and SHALL NOT be silently lost. The seed's
`whyMe.intro` SHALL carry the emphasis as `{ prefix, emphasis, suffix }` so the `<em>` renders
at the same position as today. The seed SHALL validate against the block schema.

#### Scenario: Seed validates against the schema
- **GIVEN** the committed seed document
- **WHEN** it is parsed with `HomepageBlocksDocument.parse`
- **THEN** parsing succeeds and the seed contains the seven catalog sections in current order

#### Scenario: Inline-only content survives extraction
- **GIVEN** the inline testimonial and inline WhyMe points from `HomePage.tsx`
- **WHEN** the seed is built and rendered
- **THEN** the testimonial text, `Dr. M. Albers`, the role line, and the four WhyMe points are
  present in the rendered output (tie-break: inline wins over `content.ts`)

### Requirement: Test-Stack für mentolder-web

The system SHALL introduce a runnable test stack (vitest + React Testing Library, jsdom) for
`mentolder-web`, including resolution of the `@` path alias and a mock for `*.svg?react`
imports, exposed via a `test` script in `package.json`. The suite SHALL include a Zod
round-trip test, a seed-validates-against-schema test, per-block render snapshots, and a
full-page Null-Diff snapshot. Because the repository's `task test:changed` smart-selection does
NOT match `mentolder-web/`, the mentolder-web suite SHALL be run as a separate, explicit
verification step (`pnpm --filter mentolder-web test` + typecheck + build), which is the actual
parity assertion.

#### Scenario: Test runner executes without an SVG resolve error
- **GIVEN** components that import SVGs via `?react`
- **WHEN** the vitest suite runs
- **THEN** the `*.svg?react` imports resolve to a stub and do not break the runner, and the
  smoke test passes

#### Scenario: New tests are registered in the inventory
- **GIVEN** the newly added block tests
- **WHEN** `task test:inventory` regenerates `website/src/data/test-inventory.json`
- **THEN** the inventory reflects the new tests and the committed file matches the regenerated one

#### Scenario: mentolder-web suite runs as an explicit step outside test:changed
- **GIVEN** a change set that touches only `mentolder-web/`, `openspec/`, `tests/spec/*.bats`,
  and `website/src/data/test-inventory.json`
- **WHEN** verification runs `task test:changed`
- **THEN** the mentolder-web vitest suite is NOT executed by `test:changed`, and therefore
  `pnpm --filter mentolder-web test` (plus typecheck and build) is run separately as the
  mandatory parity gate

