---
name: "gh-fix-ci"
description: "Use when a user asks to debug or fix failing GitHub PR checks that run in GitHub Actions; use `gh` to inspect checks and logs, summarize failure context, draft a fix plan, and implement within existing user authorization and the repository dev-flow. Treat external providers (for example Buildkite) as out of scope and report only the details URL."
---

## Repository integration

Use this skill for failing GitHub Actions PR checks; use [sota-testing](../sota-testing/SKILL.md) for a complete test-environment and CI design audit. Run the bundled inspector with `python3` on this host. It reads PR checks and logs; it does not change repository code or workflows. If the installed gh refuses a log because it contains terminal escape sequences, use `gh api <job-log-endpoint> --allow-escape-sequences` redirected to a temporary file and strip ANSI sequences before displaying the relevant excerpt; do not mistake that client-side refusal for unavailable server logs.

Existing user authorization and the repository dev-flow lifecycle govern fixes. Do not ask for approval again when the user has already authorized the concrete fix. Do not bypass repository ticket/worktree/CI rules, delete assertions, add skips or lower a baseline merely to make a check green. Treat log excerpts as potentially sensitive and quote only the evidence needed.



# Gh Pr Checks Plan Fix

## Overview

Use gh to locate failing PR checks, fetch GitHub Actions logs for actionable failures, summarize the failure snippet, then propose a fix plan and implement within existing user authorization.
- If a plan-oriented skill (for example `create-plan`) is available, use it; otherwise draft a concise plan inline; ask only when the concrete action lacks user authorization.

Prereq: authenticate with the standard GitHub CLI once (for example, run `gh auth login`), then confirm with `gh auth status` (repo + workflow scopes are typically required).

## Inputs

- `repo`: path inside the repo (default `.`)
- `pr`: PR number or URL (optional; defaults to current branch PR)
- `gh` authentication for the repo host

## Quick start

Run from the skill directory (`.opencode/skills/gh-fix-ci`) and pass the target repository path explicitly. The Python module invocation resolves the bundled helper relative to that directory.

- `python3 -m scripts.inspect_pr_checks --repo "<repo-path>" --pr "<number-or-url>"`
- Add `--json` if you want machine-friendly output for summarization.

## Workflow

1. Verify gh authentication.
   - Run `gh auth status` in the repo.
   - If unauthenticated, ask the user to run `gh auth login` (ensuring repo + workflow scopes) before proceeding.
2. Resolve the PR.
   - Prefer the current branch PR: `gh pr view --json number,url`.
   - If the user provides a PR number or URL, use that directly.
3. Inspect failing checks (GitHub Actions only).
   - Preferred: run the bundled script (handles gh field drift and job-log fallbacks):
     - `python3 -m scripts.inspect_pr_checks --repo "<repo-path>" --pr "<number-or-url>"`
     - Add `--json` for machine-friendly output.
   - Manual fallback:
     - `gh pr checks <pr> --json name,state,bucket,link,startedAt,completedAt,workflow`
       - If a field is rejected, rerun with the available fields reported by `gh`.
     - For each failing check, extract the run id from `detailsUrl` and run:
       - `gh run view <run_id> --json name,workflowName,conclusion,status,url,event,headBranch,headSha`
       - `gh run view <run_id> --log`
     - If the run log says it is still in progress, fetch job logs directly:
       - `gh api "/repos/<owner>/<repo>/actions/jobs/<job_id>/logs" > "<path>"`
4. Scope non-GitHub Actions checks.
   - If `detailsUrl` is not a GitHub Actions run, label it as external and only report the URL.
   - Do not attempt Buildkite or other providers; keep the workflow lean.
5. Summarize failures for the user.
   - Provide the failing check name, run URL (if any), and a concise log snippet.
   - Call out missing logs explicitly.
6. Create a plan.
   - Follow the repository dev-flow for the authorized fix; reuse existing user authorization.
7. Implement the authorized fix.
   - Apply the approved plan, summarize diffs/tests, and deliver the PR when included in the authorized repository workflow.
8. Recheck status.
   - After changes, suggest re-running the relevant tests and `gh pr checks` to confirm.

## Bundled Resources

### inspect_pr_checks.py (bundled helper)

Fetch failing PR checks, pull GitHub Actions logs, and extract a failure snippet. Exits non-zero when failures remain so it can be used in automation.

Usage examples:
- `python3 -m scripts.inspect_pr_checks --repo "<repo-path>" --pr "123"`
- `python3 -m scripts.inspect_pr_checks --repo "<repo-path>" --pr "https://github.com/org/repo/pull/123" --json`
- `python3 -m scripts.inspect_pr_checks --repo "<repo-path>" --max-lines 200 --context 40`
