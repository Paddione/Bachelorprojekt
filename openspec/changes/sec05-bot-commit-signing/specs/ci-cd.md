# sec05-bot-commit-signing

## Purpose

Enforce that git commits on the main branch must be signed, with an exclusion for automated commits made by github-actions[bot] which cannot be signed due to GitHub limitations.

## ADDED Requirements

### Requirement: Commit signing health check excludes bot commits

The health check for unsigned commits (G-SEC05) SHALL exclude commits authored by github-actions[bot].
- REQ-1: Commits where the author email contains `github-actions[bot]` are ignored when calculating the unsigned commit count.
- REQ-2: The check evaluates the last 50 commits on the main branch.
- REQ-3: A dedicated BATS test checks that the adjusted count of unsigned commits on main is <= 2.
