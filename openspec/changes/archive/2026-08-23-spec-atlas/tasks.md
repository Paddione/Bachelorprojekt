---
title: "spec-atlas — Implementation Plan"
ticket_id: T015012
domains: [scripts, dev-tooling]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# spec-atlas — Implementation Plan

_Ticket: T015012_

## File Structure

```
scripts/openspec-atlas.sh                            (neu) Generator-Einstieg: Scan + Orchestrierung (Limit 400)
scripts/openspec-atlas-lib.mjs                       (neu) Delta-Grammatik-Parser, gespiegelt von openspec-merge.mjs (Limit 250)
scripts/openspec-atlas-groups.yaml                   (neu) Curatierte Top-10-Gruppierung als View-Metadaten (Limit 80)
docs/spec-atlas.md                                   (neu, generiert) Commit-Artefakt, kein Wall-Clock-Timestamp
Taskfile.yml                                         Task openspec:atlas + Eintrag in freshness:regenerate (Ist 5500)
tests/spec/openspec-workflow/spec-atlas-generator.bats   (neu) Generator-Verhalten: Provenance, fail-open, In-Flight
tests/spec/openspec-workflow/spec-atlas-grammar-parity.bats (neu) Grammatik-Parität Atlas-Parser ↔ Merge-Parser
```

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| P1 | tasks.d/p1-generator.md | implement | scripts/openspec-atlas.sh, scripts/openspec-atlas-lib.mjs, scripts/openspec-atlas-groups.yaml | |
| P2 | tasks.d/p2-wiring.md | implement | Taskfile.yml, docs/spec-atlas.md | P1 |
| P3 | tasks.d/p3-tests.md | tests | tests/spec/openspec-workflow/spec-atlas-generator.bats, tests/spec/openspec-workflow/spec-atlas-grammar-parity.bats | P1,P2 |

Drei Partials mit disjunkten `target_files` (D1). P1 erzeugt den Generator samt
gespiegelter Grammatik; P2 hängt ihn in Freshness ein und committet das erste
Artefakt; P3 sichert Verhalten und Parser-Parität ab und trägt den
STRUCT2-Failing-Test.

## Tasks

- [ ] **P1 — Generator-Kern** (`tasks.d/p1-generator.md`): `openspec-atlas-lib.mjs`
      spiegelt die Sektion-/Heading-Regexes aus `openspec-merge.mjs` (SECTION,
      Requirement-H3, Scenario-H4); `openspec-atlas.sh` scannt Specs, component-map
      (Reverse-Mapping), Archiveinträge (`.ticket` + Delta-Specs, fail-open ohne
      `.ticket`) und aktive Changes; Markdown-Output nach `docs/spec-atlas.md` mit
      Last-Touch-Provenance je Requirement, In-Flight-Warnungen und Gruppen aus der
      YAML-Config (default `ungrouped`). Kein Wall-Clock-Timestamp.
- [ ] **P2 — Freshness-Verdrahtung + Artefakt** (`tasks.d/p2-wiring.md`):
      Taskfile-Task `openspec:atlas` analog `openspec:status-map`, Aufnahme in
      `freshness:regenerate`; erstes `docs/spec-atlas.md` generieren und committen.
- [ ] **P3 — Tests (STRUCT2-Failing)** (`tasks.d/p3-tests.md`): BATS-Suiten gegen
      Fixtures unter OPENSPEC_ROOT; Paritätstest parst dieselben Deltas wie der
      Merge-Parser. Failing-Step vor Implementierungs-Verifikation.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** BATS-Suiten laufen gegen den noch nicht
      vorhandenen Generator:

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow/spec-atlas-generator.bats
```

      expected: FAIL

- [ ] **Finaler Verify-Task.** Nach GREEN:

```bash
task test:changed && task freshness:regenerate && task freshness:check
```
