# Combined interpretation workflow and goal candidates

This synthesis combines the user's supplied repo-graph assessment with local K3 inspection on 2026-09-28. The repo-graph engine claims are supplied comparison material, not independently verified here. No engine replacement is required for the following workflow improvements.

## What to keep together

| Area | Combined approach | Practical limit |
|---|---|---|
| Orientation | Check snapshot and scope, then inspect compact architecture/schema for unfamiliar areas. | Summary counts do not establish parser coverage. |
| Failure to code | Map stack frames, test names, and changed lines to qualified symbols and source locations. | Supplied diffs and failures may refer to another checkout. |
| Change impact | Trace every distinct seed; union candidates while retaining seed, edge reason, direction, and depth. | Multiple bounded traversals do not guarantee complete impact. |
| Feature or path | Separate an end-to-end feature explanation from a bounded A-to-B reachability question. | Neither an arbitrary Cypher match nor trace_path guarantees shortest paths. |
| Empty answers | Validate tool parameters first; report observed absence, hypotheses, bounds, and a source check. | An omitted field or tool error is not evidence of no callers. |
| Trust | Navigate with the graph, confirm the anchor, verify relationships supporting impact or safety claims. | Degree, similarity, and hop distance are not runtime usage or business risk. |
| Freshness | Record graph-tool metadata, checkout and upstream SHAs, plus actual diff scope. | Do not call current Git metadata a successful-index receipt without evidence. |
| Discovery | Preserve K1 semantic, K3 structural, and authored-doc routing. | A known literal or single-file lookup can go directly to rg. |

## Correction from the combined review

The initial investigation used `--direction callers` and reported an empty trace for the website's `getSession`. The installed tool's MCP schema specifies `inbound`, `outbound`, and `both`. A corrected query returned **94 caller entries** with tests excluded; source inspection corroborated the `GET` and `POST` calls in `components/website/src/pages/sdlc/api/factory-budget.ts`. This is a tool-usage failure, not evidence of missing call edges. These counts are a dated observation, not a lasting target.

Reproduction at checkout `PRE=523d16e415da800b42ae9c777b38b296e2072d27`:

```bash
codebase-memory-mcp cli trace_path --project home-patrick-Bachelorprojekt --function-name home-patrick-Bachelorprojekt.components.website.src.lib.auth.getSession --direction inbound --mode calls --depth 1
rg -n -F 'getSession(' components/website/src/pages/sdlc/api/factory-budget.ts
```

The earlier architecture summary also included generated/minified hotspots and route candidates without handlers. Treat these as evidence for measuring signal quality, not a proven failure of the whole graph. Inspect query scope, edge types, test filters, and truncation before comparing counts between tools.

## Suggested goals, in execution order

These are proposed objectives with acceptance criteria, not created goals or dispatched tickets. Establish a baseline before claiming improvement. Broader refactors or a new engine should follow measured evidence.

1. **Make graph investigations correct and reproducible.**
   - Assemble 20 concrete cases across symbol lookup, failure/diff resolution, multiple changed symbols, cross-service paths, and empty results. Store input, source-grounded expected findings, checkout SHA, and graph/tool metadata.
   - Require at least 18/20 correctly resolved cases, valid tool arguments in every case, and no unsupported safety or deletion claims. Report unresolved cases separately; a vague caveat alone is not a correct resolution.
   - Include the invalid-direction regression and confirm both a positive caller result and a deliberately absent symbol. This is the first priority because the review found an actual misleading answer caused by a parameter error.
   - Scope: a bounded evaluation corpus and corrections to the runbook/tool adapter where needed; do not redesign the parser to hit the target.

2. **Make freshness reports distinguish fresh, stale, and unknown.**
   - Add a read-only status report showing indexed checkout identity, local HEAD, locally known upstream SHA, unique changed paths, and the last successful index receipt if available.
   - Verify clean checkout, dirty tracked files, untracked files, checkout behind upstream, wrong worktree, missing index, and failed change detection. No failed/missing probe may become a “fresh” result.
   - If no successful-index receipt exists, report unknown and add one at the serialized index wrapper. Then observe whether updates meet the existing hourly refresh intention, allowing measured indexing time.
   - Scope: report and refresh-wrapper correctness; no automatic pulls or changes to production.

3. **Improve the graph's usefulness in one active subsystem.**
   - Start with `components/website/src` and a fixed sample of 20 hotspots/routes. Measure generated-code contamination, ambiguous symbol resolution, and unsupported route candidates.
   - Produce a scoped view where every displayed sample item has a source location and evidence label. Exclude generated/minified items from the production hotspot ranking while retaining explicit access to them.
   - Resolve at least 18/20 sample items to source or explicitly classify them as unsupported with a concrete reason; do not silently remove difficult entries to improve the score. Re-run the original sample after changes.
   - Scope: query filters, reporting, and focused resolver fixes supported by the baseline. Broad K1/K3 reconciliation and engine migration can wait for demonstrated need.

For a compact goal prompt, copy a bold objective together with its acceptance criteria. The local skill does not depend on a particular Goals product or API.
