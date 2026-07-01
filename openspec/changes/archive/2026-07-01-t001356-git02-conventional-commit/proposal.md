---
title: "G-GIT02: Non-conventional commit regression"
ticket_id: T001356
status: planning
---

# G-GIT02: Non-conventional commit regression — commits with Betreff in main

## Why

Non-conventional commits (containing "Betreff" in the subject line) have been observed landing in main. The current validation stack only checks PR titles via the `commit-lint` CI job (`.github/workflows/ci.yml:289-415`) but provides no safeguard against individual commits with non-conventional subjects being merged into main, whether via merge commits, direct pushes, or commit-message edits during squash-merge.

## What

1. Analyse the full commit-to-main delivery path to identify every gap where a non-conventional commit message can reach the main branch.
2. Harden the validation at the earliest enforceable point — either the `.githooks/pre-push` hook (blocking push of non-conventional commits) or an additional CI gate that validates individual commit messages on push-to-main / PR-synchronize events.
3. Verify that the fix prevents the regression and that all CI gates still pass.
