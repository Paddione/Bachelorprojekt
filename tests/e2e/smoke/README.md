# Smoke spec overrides

`scripts/feature-promote.sh` runs a curated Playwright subset between dev and
prod rollouts to gate promotion. Override the built-in pattern per service by
dropping a file here:

    tests/e2e/smoke/<service>.txt

One pattern per line, blanks and `#` comments ignored. Lines are joined with
`|` into a single Playwright `--grep` regex.

Example (`website.txt`):

    fa-fragebogen
    mentolder-auth-setup
    korczewski-auth-setup
    fa-07-

Resolution priority inside the script:

1. `SMOKE_GREP` env var (per-run override)
2. `tests/e2e/smoke/<service>.txt`
3. Built-in default in `feature-promote.sh`
