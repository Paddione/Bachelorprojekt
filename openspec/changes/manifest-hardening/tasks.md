---
title: "manifest-hardening — Implementation Plan"
ticket_id: T014553
domains: [infra, security, monitoring, test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# manifest-hardening — Implementation Plan

_Ticket: T014553 (Batch-Anker; Kind-Tickets T014547/T014548/T014549 schließen einzeln)_

Batch aus drei System-Audit-Befunden (SA-GR-04/05/06) auf einem Branch. Kontext und
verifizierte Evidence: `proposal.md`; Anforderungen: `specs/*.md`. Die Audit-Evidence
war bei GR-04/GR-06 teilweise veraltet — der Plan bildet den verifizierten Ist-Stand ab.

## File Structure

```
k3d/rustdesk-stack/hbbs.yaml                      # p1: Non-Root-Härtung + workingDir
k3d/rustdesk-stack/hbbr.yaml                      # p1: dito
k3d/README.md                                     # p1: NetPol-Ausnahme-Doku
prod/monitoring/resource-limits-patch.yaml        # p2: Limits für alle Hauptcontainer
k3d/sessions-server.yaml                          # p3: Unprivileged-Nginx (8080)
k3d/llm-gpu.yaml                                  # p4: runAsNonRoot bge-embed/bge-rerank
tests/spec/rustdesk-server.bats                   # p5: Assertions GR-04+06 rustdesk
tests/spec/sessions-server.bats                   # p5: Assertions Port 8080/non-root
tests/spec/llm-pipeline.bats                      # p5: Assertions llm-gpu non-root
tests/spec/monitoring-alerts.bats                 # p5: Assertions Patch-Coverage
components/website/src/data/test-inventory.json   # p5: regeneriert, falls geändert
```

Alle YAML-/Markdown-/Bats-Dateien sind nicht gebaselinet (config/markdown/test — kein
S1-Ratchet-Risiko, Budgets laut intel.json `s1_budget: null`).

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-rustdesk-hardening.md | impl | k3d/rustdesk-stack/hbbs.yaml, k3d/rustdesk-stack/hbbr.yaml, k3d/README.md | |
| p2 | tasks.d/p2-monitoring-limits.md | impl | prod/monitoring/resource-limits-patch.yaml | |
| p3 | tasks.d/p3-sessions-server-nonroot.md | impl | k3d/sessions-server.yaml | |
| p4 | tasks.d/p4-llm-gpu-nonroot.md | impl | k3d/llm-gpu.yaml | |
| p5 | tasks.d/p5-tests.md | tests | tests/spec/rustdesk-server.bats, tests/spec/sessions-server.bats, tests/spec/llm-pipeline.bats, tests/spec/monitoring-alerts.bats | p1,p2,p3,p4 |

Partials sind disjunkt (D1); p5 trägt den RED-Failing-Test gegen den Stand vor p1–p4.
Kein Partial berührt eine Datei eines anderen.

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED), Partial p5 Task 1:** die neuen BATS-Assertions in
      `tests/spec/rustdesk-server.bats` laufen gegen den Branch-Stand vor der
      Implementierung:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/rustdesk-server.bats
# expected: FAIL (red — Härtung aus p1 noch nicht angewendet)
```

- [x] **Fix-Steps (GREEN):** p1–p4 setzen die Manifest-Änderungen um; danach laufen
      alle vier Spec-Bats grün:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/rustdesk-server.bats
tests/unit/lib/bats-core/bin/bats tests/spec/sessions-server.bats
tests/unit/lib/bats-core/bin/bats tests/spec/llm-pipeline.bats
tests/unit/lib/bats-core/bin/bats tests/spec/monitoring-alerts.bats
task workspace:validate
```

- [x] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
