---
title: "G-FE02: Client-JS-Bundle-Budget messen + CI-Gate"
ticket_id: T001357
status: planning
---

# G-FE02: Client-JS-Bundle-Budget messen + CI-Gate

## Why

Without a bundle-size budget, the client JS bundle can grow unbounded across releases, degrading page-load performance for end users. A measurable budget with a CI gate prevents accidental regressions.

## What

- A Node.js measurement script (`scripts/check-bundle-size.mjs`) that gzips all client JS files in `website/dist/client/` and compares the total against a committed baseline (`website/bundle-baseline.json`).
- Taskfile tasks `website:bundle:check` and `website:bundle:baseline` for dev workflow.
- A CI gate in `.github/workflows/ci.yml` that runs the check after the website build, failing if the bundle grows >5%.

_Ticket: T001357_
