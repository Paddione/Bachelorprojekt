# T001356 / G-GIT02 — Commit-to-main delivery path analysis

## Paths a commit can take to reach `main`

| Path | Commit message validated? | PR title validated? |
|---|---|---|
| PR squash-merge (GitHub default: "Squash and merge") | **No** — GitHub defaults the squash commit message to a concatenation of all constituent commit subjects/bodies unless the author edits the merge box manually. | Yes, via `commit-lint` job (`amannn/action-semantic-pull-request`, `.github/workflows/ci.yml:289-415`) — but this only checks `github.event.pull_request.title`, not the eventual squash commit body. |
| PR merge commit ("Create a merge commit") | **No** — individual commits keep their original messages as-is. | Yes (PR title only, same as above). |
| Direct push to `main` | **No** — no server-side hook validates commit messages; branch protection only requires status checks to pass (which include `commit-lint`, but that job is scoped `if: github.event_name == 'pull_request'` and does not run on `push`). | N/A (no PR). |
| `release-please` pushes to `main` (via the `release-please--branches--main` push trigger) | **No** — bot-authored, bypasses PR-title validation entirely. | N/A. |

## Root cause

`.githooks/pre-push`'s prior state only ran `task quality:check` (S1-S4
ratchet) plus an advisory BATS/freshness check. Nothing in the local hook
chain, and nothing in CI, validated the *body* of individual commit
messages — only the amannn PR-title action did, and that is a different
string than what actually lands as the commit message on `main`
(especially under squash-merge with the default "combine all commit
messages" behavior). A commit authored with a literal, unfilled template
subject line ("Betreff in main" — German for "subject") therefore reached
`main` undetected, and downstream tracking/timeline tooling that parses
commit history ingested the malformed row.

## Fix (this change)

1. **`scripts/validate-commit-msg.sh`** (new) — shared validator. Parses
   `type(scope)?: subject` against the type list mirrored from the CI
   `commit-lint` job and the scope list read directly from
   `commitlint.config.cjs` (single source of truth). Supports `range`,
   `head`, and `message` invocation modes.
2. **`.githooks/pre-push`** — now runs `validate-commit-msg.sh range
   <remote-sha>..<local-sha>` for every ref update being pushed, blocking
   the push (exit 1) on any non-conventional commit subject. Respects the
   existing `SKIP_CI_CHECK=1` escape hatch for emergencies.
3. **`.github/workflows/ci.yml` `commit-lint` job** — added
   `actions/checkout` (the job previously had none) and a new step that
   runs `validate-commit-msg.sh range <base-sha>..<head-sha>` over every
   commit in the PR, catching pushes that bypass the local hook (e.g.
   `--no-verify`, or environments without hooks installed).
4. **`tests/spec/t001356-git02-conventional-commit.bats`** — reproduces the
   regression (`echo "Betreff in main"`) and asserts the validator rejects
   it, plus coverage for valid/invalid types, scopes, and merge-commit
   exemption.

## Residual gap (not covered by this change)

Direct pushes to `main` and `release-please` pushes are not gated by the
`commit-lint` CI job (it only runs `on: pull_request`) — those paths are
protected by the **local pre-push hook only**. This is an accepted
trade-off: `main` is protected by required-PR branch protection in this
repo (see Development Rules §2 in `CLAUDE.md`), so direct pushes should not
normally occur; `release-please` commits are machine-generated and already
conventional by construction (`chore: release main`, etc.).
