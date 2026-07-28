---
title: "openspec-half-archive-T002428 — Implementation Plan"
ticket_id: T002428
domains: [openspec-workflow]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# openspec-half-archive-T002428 — Implementation Plan

_Ticket: T002428_

## File Structure

```
scripts/openspec-half-archive-check.sh          (neu)      — struktureller Check
scripts/openspec.sh                             (geändert) — mv-Guard vor dem Delta-Merge
Taskfile.yml                                    (geändert) — Check fail-closed in test:openspec
openspec/specs/{llm-local-dev,coaching-sessions-polish-guide,database,
                secrets-deploy-automation,auth-sso,ci-cd}.md  (geändert) — 15 Requirements nachgetragen
openspec/specs/{admin-nav-accordion,agent-behavior}.md        (neu)      — Ziel-Specs fehlten
openspec/changes/<7 Slugs>/                     (entfernt)  — verwaiste offene Quellen
tests/spec/openspec-workflow/half-archive-guard.bats (neu)  — 5 Guards
```

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** Fünf BATS-Tests: mv-Guard (Sandbox mit belegtem Ziel),
      Gegenprobe bei freiem Ziel, Check meldet Doppelung, Check ist grün bei sauberem Baum,
      und der reale `openspec/`-Baum ist sauber.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow/half-archive-guard.bats
# expected: FAIL (rot — 4 von 5; nur der Normalfall lief schon)
```

- [x] **Fix-Step (GREEN).** Guard + Check gebaut, sieben Halbzustände geheilt, fehlende
      Szenarien an der Implementierung nachgetragen.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow/half-archive-guard.bats  # 5/5 ok
task openspec:validate                                                                   # grün
bash scripts/openspec-half-archive-check.sh                                              # rc=0
```

- [ ] **Final Verification.** Die drei verbindlichen CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
