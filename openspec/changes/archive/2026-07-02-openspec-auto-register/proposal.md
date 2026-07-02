# Proposal: openspec-auto-register

## Why

Archiving a genuinely-new OpenSpec SSOT component via `scripts/openspec.sh archive
--create-new` (or the upstream `/opsx:archive`) creates `openspec/specs/<slug>.md`
but never registers `<slug>` in `openspec/config.yaml`'s `context.OpenSpec-Komponenten`
list. `scripts/openspec-validate.ts` `checkConfigDrift()` (T001304 drift gate, part of
`task openspec:validate` / CI) hard-fails until a human manually edits `config.yaml`
in a follow-up commit. This happened for `t001363-mishap-bundle` (mishap source
T001367 M2) and is easy to forget every time a new component is created.

## What

`scripts/openspec-merge.mjs` `applyDelta()` gains a `registerComponent()` step that
runs immediately after it creates a brand-new SSOT stub file (the
`!existsSync(ssotPath) && createNew` branch) — never for deltas against an existing
SSOT (MODIFIED/REMOVED/RENAMED). It idempotently appends the new component slug to
`config.yaml`'s `OpenSpec-Komponenten` block-scalar list, preserving the existing
comma+wrapped-line formatting, so `archive --create-new` is fully self-contained and
the CI drift gate passes without a manual follow-up commit.

_Ticket: T001389_
