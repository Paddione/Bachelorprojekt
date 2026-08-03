---
title: "factory-attempt-counter-T002389 — Implementation Plan"
ticket_id: T002389
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# factory-attempt-counter-T002389 — Implementation Plan

_Ticket: T002389_

## File Structure

```
CHANGED:
  scripts/factory/pipeline-runner.js    — classify failure as MODEL vs INFRA
  scripts/factory/pipeline.mjs          — pass failure class to attempt counter
  scripts/factory/watchdog.sh           — use failure class for counter increment
NEW:
  tests/spec/factory-attempt-counter-T002389.bats
```

## Tasks

### 1. Failing Test (RED)

BATS-Test der nachweist, dass Infra-Abbruch den Zähler nicht hochzählt.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/factory-attempt-counter-T002389.bats
# expected: FAIL
```

### 2. Failure-Klassifikation (GREEN)

Füge in `pipeline-runner.js` eine Klassifikation ein: Phase-Event geschrieben → MODELL, sonst → INFRA. Übergib die Klasse über den Pipeline-Payload an watchdog.sh.

### 3. Zähler-Logik

In `watchdog.sh`: bei INFRA-Klasse den Zähler nicht inkrementieren, Abbruch auf gleicher Sprosse wiederholen (max N Mal).

### 4. CI-Gates

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
