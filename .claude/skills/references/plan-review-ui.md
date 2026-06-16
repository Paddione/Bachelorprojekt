# Plan-Review-UI — Render → Review → Verdict → (Revise | Execute)

## Overview

The Plan Review UI lets you visually review a plan file line-by-line in a local
browser, annotate changes (strike/replace/insert lines, comment), and submit a
verdict (`approve` or `request-changes`) over the existing loopback `/submit`
channel. No external service, no DB, no network.

## Flow

1. **Render**
   ```bash
   bash scripts/plan-review/plan-review.sh render docs/superpowers/plans/<plan.md>
   ```
   → Opens the plan in the Companion board with line-numbered HTML.

2. **Review & annotate** in the browser:
   - Select text → sidebar op buttons (Durchstreichen, Ersetzen, Einfügen, Kommentar)
   - Annotations appear in the sidebar (removable)
   - Submit ✓ Approve or ↺ Änderungen anfordern

3. **Read verdict**
   ```bash
   bash scripts/plan-review/plan-review.sh result
   ```
   → `jq`-formatted `{kind, verdict, annotations, plan}`
   - `approve` → proceed with execution
   - `request-changes` → apply annotations, 1 revision round, re-render

## Files

| File | Role |
|------|------|
| `scripts/plan-review/render-plan.mjs` | Pure Node Markdown→HTML renderer |
| `scripts/plan-review/annotate-client.js` | Vanilla-JS annotation client (embedded in HTML) |
| `scripts/plan-review/plan-review.sh` | CLI wrapper: `render` / `result` |
| `tests/unit/superpowers-submit-patch.bats` | Server patch smoke tests (plan-review fields) |

## Security

- **Loopback-only gate**: the annotation client activates only on
  `http://localhost|127.0.0.1` with `__BRAINSTORM_SUBMIT_PORT` set (injected by
  server). Public pages (https via funnel) never see the annotation UI.
- **Server-side**: the plan-review fields (`annotations`, `verdict`) are added
  only when `ev.kind === 'plan-review'`. Regular brainstorm submit payloads are
  unaffected.
- **No hardcoded hostnames**: the board host comes from `brainstorm.sh`; the
  submit port from the server-injected `__BRAINSTORM_SUBMIT_PORT`.

## Payload Contract

POST `http://localhost:<submitPort>/submit`:
```json
{
  "kind": "plan-review",
  "plan": "Plan title",
  "verdict": "approve|request-changes",
  "annotations": [
    {"op": "strike|replace|insert|comment", "fromLine": 3, "toLine": 5,
     "text": "…", "reason": "…", "position": "before|after"}
  ],
  "nonce": "<unique>",
  "screen": "<path>",
  "markdown": "«PLAN-REVIEW»\\nVerdict: approve\\n..."
}
```
