# Proposal: g-fe02-bundle-budget

## Why

The website ships a large client-JS bundle — it pulls in React, Svelte, Chart.js, D3 and
Pixi.js, all built into `website/dist/client/`. Today there is no measurement of that bundle
and no guardrail against silent growth: any PR can add another heavy dependency and nobody
notices until page-load performance regresses in production. For the bachelor thesis we want a
deterministic, reviewable performance budget — "no net growth per release" — that is visible in
CI on every PR.

_Ticket: T001207_

## What

1. **Measurement script** — `scripts/check-bundle-size.mjs`: builds the website (or reuses an
   existing `website/dist/client/`), sums the gzipped size of all client-JS assets, and either
   writes the baseline (`--update-baseline`) or compares the current measurement against the
   committed baseline (check mode).
2. **Committed baseline** — `website/bundle-baseline.json`: the recorded total gzip bytes, file
   count and timestamp that the policy compares against.
3. **CI budget gate** — a job/step in `.github/workflows/ci.yml` that builds the website and runs
   the script in check mode. Policy: growth of at most 5 percent emits a **warning** (exit 0),
   growth above 5 percent **fails** the gate (exit 1). The threshold is configurable via
   `--threshold` / `BUNDLE_BUDGET_PCT`.
4. **S4 reachability** — the script is referenced from CI and a `Taskfile.yml` task so the
   orphan-script gate does not flag it.

Out of scope: shrinking the bundle (code-splitting, lazy-loading heavy libs), per-route budgets,
and making the gate a required branch-protection check — those are follow-ups once the baseline
and the gate exist and have been observed for a release cycle.
