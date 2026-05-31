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

---

## Filming the Agent-Anleitung for gekko

**No auth or secrets required** — the Agent-Anleitung view is public (mounted in `Layout.astro`).

```bash
# Film against local dev server (start pnpm dev first):
task test:e2e:agent-guide:film

# Film against the live site:
WEBSITE_URL=https://web.mentolder.de task test:e2e:agent-guide:film
```

What you get:
- A headed Chromium window you can screen-record live
- `tests/e2e/test-results/**/video.webm` — Playwright's auto-recorded video
- HTML report: `tests/e2e/playwright-report/index.html`

The same spec runs headless in CI as part of the `website` project (nightly `e2e.yml`).
