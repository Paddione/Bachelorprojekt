---
title: "Mishap-Bundle: skills/references, scripts/brain, scripts/vda.sh"
ticket_id: T001583
status: planning
---

## Problem

This bundle aggregates 3 mishap entries reported 2026-07-03:

1. **skills/references drift (already resolved)** — mishap report claimed skill
   snippets referenced the non-existent `ticket.sh comment` verb. Re-verified
   during execution: all active `.claude/skills/**` snippets already use
   `add-comment` consistently (5+ call sites checked, including
   `dev-flow-execute`, `ticket-ops`, `repo-hygiene-ops`). No live drift found
   — likely fixed incidentally by other work between the mishap being logged
   and this ticket's execution. No code change; documented here for
   traceability.
2. **scripts/brain — ingest-sources.yaml filter too coarse** —
   `brain-ingest-worklist.sh` walked the entire repo tree and tagged every
   matching file "docs", including dependency (`node_modules/`) and
   tool-state (`.agy/`, `.claude/commands/`, build caches) trees — verified
   32.5k rows on first run. Unbounded LLM ingest cost, noisy wiki.
3. **scripts/vda.sh oracle — cmd materialization ignores BRAND-only tasks** —
   `oracle --json` always emitted `ENV=<token>` regardless of what the
   selected task's Taskfile.yml `requires: vars:` block actually declares.
   Fleet tasks like `fleet:deploy:brand` require `BRAND=fleet-<brand>`; the
   oracle produced a `cmd` field that looked plausible but silently dropped
   the required var, so any caller executing it blindly would deploy with
   an unset `BRAND` (Taskfile `requires` guard would abort, or worse — with
   defaults — deploy to the wrong target).

## Goal

Fix #2 and #3 with regression coverage; verify and document #1 as already
resolved (no behavior change needed).

## Non-goals

- Broader brain-ingest classification/grouping logic (`group_for()` always
  returning `"docs"`) — out of scope, tracked separately if it becomes a
  problem.
- Fastpath `ENV=`/`BRAND=` structured-syntax parsing in oracle.sh — fastpath
  already lets the caller specify the var name explicitly; only the
  natural-language/LLM-inference path silently guessed wrong.
