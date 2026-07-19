---
title: "mishap-t001969 — Implementation Plan"
ticket_id: T001969
domains: [devflow, infra, subagent]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-t001969 — Implementation Plan

_Ticket: T001969_

## File Structure

```
.claude/skills/dev-flow-execute/SKILL.md         # Monitor-Verbot (Task 1)
.claude/skills/references/dev-flow-gotchas.md    # bestehende Notes erweitern (Task 1)
k3d/sealed-secrets/ghcr-pull-secret.yaml         # SealedSecret-Definition (Task 2)
k3d/overlays/workspace/ghcr-pull-secret.kustomize.yaml   # OwnerRefs (Task 2)
k3d/base/cronjobs/ghcr-token-expiry-monitor.yaml         # Monitoring-CronJob (Task 2)
.opencode/plugins/background-agents.ts           # Timeout + Fallback (Task 3)
.opencode/agent-models.jsonc                     # qwen35-hq Fallback (Task 3)
```

## Tasks

### Task 1: Implementer-Monitor-Verbot

In `.claude/skills/dev-flow-execute/SKILL.md` unter "Implementer Subagent"
einen Block ergänzen:

> **Hintergrund-Monitore für lange Test-Runs verboten [T001969 Mishap 1].**
> Der Implementer-Subagent darf während der Verifikation **keine**
> Hintergrund-Tasks (`task test:changed`, `gh run watch`, o. ä.) starten
> und auf deren Output warten. Stattdessen synchrone Calls mit explizitem
> Timeout (`timeout 600 task test:changed`). Bei Stop-Events: Task fortsetzen
> oder an Orchestrator eskalieren — nicht "wait for the monitor".

### Task 2: ghcr-pull-secret SealedSecret + Monitoring

- `k3d/sealed-secrets/ghcr-pull-secret.yaml`: SealedSecret-Definition mit
  Token (gleicher Wert wie aktuell, geheimgehalten via SealedSecret-Controller).
- `k3d/overlays/workspace/ghcr-pull-secret.kustomize.yaml`: Kustomize-
  Patches mit OwnerRefs zu allen ~10 referenzierenden Deployments
  (videovault, mediaviewer-widget, docs, studio, brett, einvoice-sidecar,
  collabora, website, brain, downloads, mentolder-web).
- `k3d/base/cronjobs/ghcr-token-expiry-monitor.yaml`: CronJob (alle 6h),
  der `gh auth status` ausführt und bei Token-Ablauf einen Alert postet.

### Task 3: qwen35-iq4 Empty-Output Mitigation

- `.opencode/plugins/background-agents.ts` Zeile 235: `DEFAULT_MAX_RUN_TIME_MS`
  von `15 * 60 * 1000` auf `25 * 60 * 1000` erhöhen.
- `.opencode/agent-models.jsonc`: für `qwen35-iq4` einen `fallback`-Agent
  `qwen35-hq` registrieren, der bei Empty-Output automatisch übernimmt
  (Retry-Logik im Plugin).

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Reproduktion: dev-flow-execute mit
      altem Prompt → Stall dokumentieren. qwen35-iq4 leerer Output zählen.
- [ ] **Fix-Step (GREEN).**
  ```bash
  task test:changed
  task workspace:validate ENV=mentolder
  task freshness:regenerate
  task freshness:check
  ```
- [ ] **Final Verification.** Drei CI-Gates grün.
