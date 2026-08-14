# openspec-embedding Delta — Embed-Completeness-Slug-Scope

## MODIFIED Requirements

### Requirement: Wrapper success check fails on a completeness-gate warning

`scripts/openspec-embed-local.sh` SHALL treat `openspec-embed.mjs` output as a failure (exit
non-zero) whenever the output contains a `WARN: completeness gate` line **that names the
embedded slug itself in its missing list**. A completeness warning that names only foreign
slugs (e.g. active plans living in other worktrees) SHALL NOT negate the success of the
embedded slug — the wrapper exits zero when the output contains both `indexed slug='<slug>'`
and a warning naming only other slugs. When no slug argument is given, the wrapper SHALL keep
the previous behavior (any completeness warning fails the check). `.githooks/post-commit-embed`
remains non-fatal on wrapper failure — safety-net semantics unchanged.

#### Scenario: Completeness-gate warning names the embedded slug

- **GIVEN** `openspec-embed.mjs` output contains `indexed slug='demo'` and a
  `WARN: completeness gate` line whose missing list contains `demo`
- **WHEN** `embed_output_is_success` evaluates the output with slug `demo`
- **THEN** the check exits non-zero (real defect — the slug was not fully covered)

#### Scenario: Completeness-gate warning names only foreign slugs

- **GIVEN** `openspec-embed.mjs` output contains `indexed slug='demo'` and a
  `WARN: completeness gate` line whose missing list contains only other slugs
  (e.g. `other-slug-1, other-slug-2` from other worktrees)
- **WHEN** `embed_output_is_success` evaluates the output with slug `demo`
- **THEN** the check exits zero — the embedded slug's success is not negated by foreign gaps

#### Scenario: Call without a slug argument stays backward-compatible

- **GIVEN** `embed_output_is_success` is called with only the output text (no slug)
- **WHEN** the output contains both `indexed slug='…'` and any `WARN: completeness gate` line
- **THEN** the check exits non-zero — previous behavior is preserved exactly
