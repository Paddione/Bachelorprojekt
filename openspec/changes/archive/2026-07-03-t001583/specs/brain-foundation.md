### Requirement: brain-ingest-worklist.sh SHALL exclude dependency and tool-state trees

`scripts/brain/ingest-sources.yaml` SHALL list `exclude:` prefixes for
dependency (`node_modules/`), VCS (`.git/`), build-cache (`.astro/`,
`dist/`), and tool-state (`.taskmaster/`, `.agy/`, `.antigravitycli/`,
`.design-sync/`, `.claude/commands/`, vendored test libs under
`tests/unit/lib/`, `.venv/`, `__pycache__/`) directories, so that
`scripts/brain-ingest-worklist.sh` does not tag every file under those
trees as a "docs" ingest candidate. Exclude patterns SHALL NOT use a
generic substring that collides with legitimately-named directories (e.g.
`build/` or `coverage/` as bare prefixes, which match `*-rebuild/` or
`*-coverage/` under the worklist's substring-based `is_excluded()`).

#### Scenario: first-run ingest worklist stays bounded

- **GIVEN** the repo tree contains `node_modules/`, `.agy/`, and
  `.claude/commands/` alongside genuine documentation under `docs/` and
  `openspec/`
- **WHEN** `bash scripts/brain-ingest-worklist.sh` runs against the repo
  root with the real manifest
- **THEN** none of the emitted rows have a source path under
  `node_modules/`, `.agy/`, or `.claude/commands/`, and the total row count
  is a small fraction of the unfiltered walk (verified 2026-07-03: ~32.5k
  rows unfiltered, down to low thousands after the fix)

#### Scenario: a legitimately-named directory containing "build" or "coverage" as a substring is not excluded

- **GIVEN** a directory named `mentolder-react-rebuild/` or
  `vitest-coverage/` (both real `openspec/changes/archive/` dirs in this
  repo) contains a matching source file
- **WHEN** the worklist runs
- **THEN** that file still appears in the worklist output — the exclude
  list SHALL NOT contain a bare `build/` or `coverage/` prefix, since
  `is_excluded()` does unanchored substring matching

