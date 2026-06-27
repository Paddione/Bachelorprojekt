# Proposal: g-cq08-knip-dead-code

## Why

The `website/` codebase (Astro 6 + Svelte 5 + TypeScript 6) has accumulated dead
code: exported symbols that are never imported and source files that are never
referenced anywhere in the entry graph. There is currently **no tooling** to
detect or quantify this. Dead exports inflate the public surface of internal
modules, slow type-checking, and make refactoring riskier — an "API" that nobody
calls still has to be reasoned about during every change.

G-CQ08 introduces [knip](https://knip.dev) as the measurement tool, establishes a
reproducible baseline of unused exports + unused files in `website/src`, and
removes **50 %** of the detected items as a first, deliberately-safe pass. The
remaining ~50 % is paid down in follow-up tickets, so the new CI gate stays
**advisory** (warn, never fail) for now.

## What

- Add `knip` as a `website/` devDependency and a `website/knip.json` config tuned
  for the Astro page / Svelte component / API-route entry graph.
- Measure the baseline (count of unused exports + unused files + unused exported
  types in `website/src`) and record it in `docs/code-quality/knip-baseline.json`.
- Remove **50 %** of the detected items, safest tranche first: unused exports in
  non-public `src/lib` TypeScript modules, then genuinely unused files. Removing
  dead exports shrinks the affected files, so S1 line budgets only improve.
- Add an **advisory** knip step to CI (`continue-on-error`) so dead-code
  regressions are visible without blocking merges.
- A BATS regression (`tests/spec/g-cq08-knip-dead-code.bats`) locks in the
  configuration and the ≥ 50 % reduction.

_Ticket: T001205_
