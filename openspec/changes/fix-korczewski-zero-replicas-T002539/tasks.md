---
title: "fix-korczewski-zero-replicas-T002539 — Implementation Plan"
ticket_id: T002539
domains: [infra, docs]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# fix-korczewski-zero-replicas-T002539 — Implementation Plan

_Ticket: T002539_

## File Structure

```
CLAUDE.md                                              # (fix) "Both brands at 26/26 pods" → korczewski suspended
AGENTS.md                                              # (add) Suspension-Hinweis in Architecture-Section
flux/clusters/fleet/ks-korczewski.yaml                 # (check) suspension comment already correct
tests/spec/workspace-deploy.bats                       # (add) test: CLAUDE.md mentions korczewski suspension
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** CLAUDE.md enthält aktuell die falsche Angabe
      "Both brands at 26/26 pods". Der Test prüft, dass CLAUDE.md stattdessen
      "korczewski: suspended" oder "korczewski: 0 pods" enthält.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/workspace-deploy.bats --filter "T002539"
# expected: FAIL (red — CLAUDE.md still says "26/26 pods")
```

- [ ] **Step 1: CLAUDE.md korrigieren.** In der Architecture-Section die Zeile
      "Both brands at 26/26 pods in workspace and workspace-korczewski" durch
      eine korrekte Angabe ersetzen:
      ```
      mentolder → ns workspace (26/26 pods). korczewski → ns workspace-korczewski
      (suspended since 2026-07-23, T002479 — 0 pods, Flux Kustomization suspend:true).
      ```

- [ ] **Step 2: AGENTS.md ergänzen.** In der Architecture-Section einen
      korczewski-Suspension-Hinweis ergänzen, damit Agents nicht von laufendem
      Betrieb ausgehen.

- [ ] **Step 3 (optional): Website-Fallback.** Ingress/Traefik-Middleware für
      korczewski.de so konfigurieren, dass bei keinen verfügbaren Backends
      ein Redirect auf mentolder.de erfolgt (statt nacktem 503).

- [ ] **Fix-Step (GREEN).** Der BATS-Test muss jetzt passen — CLAUDE.md und
      AGENTS.md enthalten den korrekten Suspension-Hinweis.

- [ ] **Final Verification.**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
