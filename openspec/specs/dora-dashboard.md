# dora-dashboard

## Purpose

SSOT spec. The DORA UI surface was retired on 2026-07-02 (T001433) — see the
archived delta `openspec/changes/archive/2026-07-02-admin-redesign/specs/dora-dashboard.md`
for the full REMOVED-requirements history. The DORA/CFR measurement itself is
preserved as a CLI gate (`bash scripts/vda.sh cfr`, gate G-DORA03) and is not
covered by this spec.

## Requirements

<!-- merged from change delta dora-dashboard.md on 2026-07-02 -->

### Requirement: DORA UI Removed (Stub)

The DORA dashboard UI SHALL NOT be re-introduced. Historical DORA metrics
(deployment frequency, lead time, change-failure rate, MTTR) remain available
through the CLI gate `vda.sh cfr` and direct `tickets.pr_events` queries.

#### Scenario: No DORA UI surface

- **GIVEN** an authenticated admin on `/admin`
- **WHEN** the sidebar or shortcuts render
- **THEN** no link to `/admin/dora` is present, and the URL returns a 301
  redirect to `/admin/pipeline?tab=analytics`
