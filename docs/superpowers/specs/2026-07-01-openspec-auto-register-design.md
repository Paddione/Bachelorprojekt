---
ticket_id: T001389
status: planning
plan_ref: openspec/changes/openspec-auto-register/tasks.md
---

# Design: OpenSpec auto-registers new components in config.yaml

## Root Cause

`scripts/openspec-merge.mjs` `applyDelta()` is the single place where a genuinely-new
OpenSpec SSOT spec file is created (the `!existsSync(ssotPath) && createNew` branch,
called from `scripts/openspec.sh cmd_archive` via `--create-new`). It writes the new
`openspec/specs/<slug>.md` file but never touches `openspec/config.yaml`'s
`context.OpenSpec-Komponenten` block-scalar list of component slugs.

`scripts/openspec-validate.ts` `checkConfigDrift()` (the T001304 drift gate, run by
`task openspec:validate` / `test:openspec` and wired into CI) hard-fails
(`ok:false`) for every `openspec/specs/*.md` file whose slug is absent from that
list. Because nothing populates the list automatically, every `archive --create-new`
leaves the CI gate red until a human manually edits `config.yaml` in a follow-up
commit — exactly what happened for `t001363-mishap-bundle` (mishap source T001367 M2).

## Fix Approach

Add a new exported function `registerComponent(openspecRoot, slug)` to
`scripts/openspec-merge.mjs`, called immediately after the new-SSOT-file branch in
`applyDelta()` (only when the file did not previously exist — never for
MODIFIED/REMOVED/RENAMED deltas against an existing SSOT, since those don't
introduce a new component).

`registerComponent`:
1. Reads `openspec/config.yaml`.
2. Locates the `OpenSpec-Komponenten: |` header line via line-scan (mirrors the
   existing `findBlocks`-style line scanning already used in this file — no new
   YAML-parsing dependency).
3. Collects the indented body lines that follow (until a non-indented / blank
   line), splits on `[\n,]+` the same way `checkConfigDrift()` does, to get the
   existing slug set.
4. **Idempotent no-op** if `slug` is already present.
5. Otherwise: ensures the last body line ends with a trailing comma, then
   inserts a new indented line `    <slug>` right after it, and writes the file
   back. This preserves the existing comma+wrapped-line formatting style without
   needing a YAML writer.
6. If the header line can't be found (unexpected config.yaml shape), it's a
   **best-effort no-op** — it must never corrupt `config.yaml` or abort the
   archive. A test covers this fallback path.

`applyDelta()` computes `openspecRoot` from `ssotPath` (`openspec/specs/<slug>.md`
→ two levels up) and the slug from `basename(ssotPath, '.md')`, then calls
`registerComponent(openspecRoot, slug)` right after `writeFileSync` creates the
new SSOT stub — wrapped so a failure here does not abort the archive (best-effort,
matching the file's existing `_embed_slug`/best-effort philosophy in
`openspec.sh`), but a successful append is what closes the CI gate automatically.

## Non-Goals

- Not re-sorting or reformatting the existing `OpenSpec-Komponenten` list.
- Not touching `scripts/openspec.sh` (all logic lives in the Node merge script,
  which already owns SSOT-file creation).
- Not addressing T001385 (delta-spec directory structure suggestions) — confirmed
  no file overlap with this change (`scripts/openspec.sh`, `scripts/openspec-merge.mjs`,
  `openspec/config.yaml` vs. whatever T001385 touches; verified via `git branch -a`
  / `git worktree list` showing no live branch/worktree for T001385 at time of work).

## Testing

New `scripts/openspec-merge.test.mjs` (vitest, matching the existing
`openspec-embed.test.mjs` style — this repo has no prior unit test file for
`openspec-merge.mjs`), covering:
1. `registerComponent` appends a new slug and fixes up the trailing comma on the
   previously-last entry.
2. `registerComponent` is idempotent — calling it twice with the same slug only
   appends once.
3. `registerComponent` is a no-op (returns falsy, doesn't throw) when the header
   line is absent from a malformed `config.yaml` fixture.
4. `applyDelta()` end-to-end: archiving a delta against a non-existent SSOT with
   `createNew=true` results in the slug being present in the fixture config.yaml's
   `OpenSpec-Komponenten` list afterwards.
5. `applyDelta()` against an *existing* SSOT (MODIFIED) does not touch config.yaml.

Additionally: a BATS regression in `tests/spec/openspec-workflow.bats` (or the
closest matching existing spec test file) exercising the `scripts/openspec.sh
archive --create-new` CLI path end-to-end against a temp `OPENSPEC_ROOT` fixture,
asserting `openspec:validate`/`checkConfigDrift` passes afterward without manual
edits.
