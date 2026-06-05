# Phase 0 Spike — Headless Workflow Nesting (Go/No-Go) [T000413]

## Hypothesis
A headless `claude -p --allowedTools 'Workflow …'` session can call the
Workflow tool and nest `workflow({scriptPath:'scripts/factory/pipeline.spike.js'})`
WITHOUT an interactive permission prompt, returning cleanly with 0 agents.

## How to run
`bash scripts/factory/headless-workflow-spike.sh`

## Result: GO (date: 2026-06-06)
- Workflow tool exposed headless: yes
- Nested workflow() ran without permission prompt: yes
- Returned JSON:
```json
{
  "summary": "Throwaway Phase 0 probe",
  "agentCount": 0,
  "logs": [
    "{\"spike\":\"pipeline\",\"nested\":true,\"agents\":0,\"dry_run\":true}"
  ]
}
```

## Decision
- GO  → build the systemd-user-timer dispatcher (Segment F, `scripts/factory/wakeup.sh` + `factory.timer`).
- NO-GO → fall back to local `/loop`; the rest of the spec is unchanged.

## Cleanup
Delete `scripts/factory/pipeline.spike.js` + `headless-workflow-spike.sh` once recorded.
