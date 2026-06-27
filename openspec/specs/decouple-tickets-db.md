# decouple-tickets-db


<!-- merged from change delta decouple-tickets-db.md on 2026-06-27 -->

## Purpose

### Requirement: S2 import cycle between `tickets-db.ts` and `website-db.ts` is removed

The system SHALL break the static import cycle `lib/tickets-db.ts ↔ lib/website-db.ts`
(G-CQ07 cycle #1) so that `npx --yes madge --circular --extensions ts,tsx website/src`
no longer reports that cycle. The other three S2 cycles (transitions / reporter-link /
invoice-pdf ↔ native-billing) SHALL remain untouched by this change and SHALL be
addressed in separate follow-up PRs.

#### Scenario: S2 cycle #1 is absent from `madge --circular` output

- **GIVEN** the workspace contains the four import cycles G-CQ07 enumerates
  (`tickets-db ↔ website-db`, two `tickets/transition` cycles, `invoice-pdf ↔ native-billing`)
- **WHEN** the implementer runs `npx --yes madge --circular --extensions ts,tsx website/src`
  on the merged branch
- **THEN** the output reports exactly the three remaining cycles
  (`lib/website-db.ts > lib/tickets/transition.ts > lib/tickets/reporter-link.ts`,
  the duplicate `lib/website-db.ts > lib/tickets/transition.ts` listing, and
  `lib/invoice-pdf.ts > lib/native-billing.ts`) and the cycle between
  `lib/tickets-db.ts` and `lib/website-db.ts` is absent.

## Requirements

### Requirement: Public API of `tickets-db.ts` is preserved

The system SHALL keep the four public exports of `tickets-db.ts` (re-export of
`MixedEmbeddingModelError`, `ticketEmbeddingModel`, `initTicketsSchema`,
`isFeatureEnabled`) importable via the same module path with identical
signatures, so that no caller outside the three refactor files needs to
change its import statement.

#### Scenario: Existing `import { initTicketsSchema } from './tickets-db'` lines still work

- **GIVEN** call-sites such as `tickets/admin.ts`, `tickets-embed.ts`,
  `systemtest/failure-bridge.ts`, `systemtest/test-run-bridge.ts` and the
  seven test files that import from `./tickets-db`
- **WHEN** the refactor lands on the merged branch
- **THEN** each of those import statements still resolves to a binding of
  the same name and identical signature, and TypeScript reports no
  `TS2305`/`TS2614` errors.

### Requirement: `tickets-db.ts` line count does not grow

The system SHALL ensure that the resulting `tickets-db.ts` has fewer lines
than the baselined 1096 (frozen at commit `8b581ebe` per
`docs/code-quality/baseline.json`), so that the S1-Ratchet
(`task test:code-quality`) does not trip on the baselined file.

#### Scenario: `wc -l` of `tickets-db.ts` is below the baseline

- **GIVEN** the current `tickets-db.ts` is 1096 lines, baselined at 1096
- **WHEN** the implementer runs `wc -l website/src/lib/tickets-db.ts`
  on the merged branch
- **THEN** the reported line count is strictly less than 1096.
