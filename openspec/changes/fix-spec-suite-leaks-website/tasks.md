---
slug: fix-spec-suite-leaks-website
ticket: T008635
status: active
---

# Fix: Spec-Suite leakt leeres Top-Level website/

## Problem

Während `bats -r tests/spec/` entsteht ein leeres Top-Level-Verzeichnis `website/`. Der Guard `tests/spec/repo-structure/website-moved.bats` wird dadurch ordnungsabhängig rot — lokal flaky, CI unauffällig.

## Tasks

### Task 1: Verursacher identifizieren

Watcher-Test durchführen:
```bash
while [ ! -d website ]; do sleep 0.2; done &
watcher_pid=$!
bats -r -j 6 --no-parallelize-within-files tests/spec/
kill $watcher_pid 2>/dev/null
```

Verdächtige BATS-Dateien:
- `tests/spec/software-factory/agent-lock-scope-argument.bats`
- `tests/spec/software-factory/brand-is-row-filter-not-namespace.bats`
- `tests/spec/software-factory/canary-and-cleanup.bats`
- `tests/spec/agent-lock-claim-persist.bats`
- `tests/spec/openspec-pgvector/context-retrieve-recall.bats`

### Task 2: Leak-Quelle fixen

Sobald Verursacher identifiziert: `website/` Erstellung verhindern (Cleanup in teardown, oder Pfad-Korrekturen im aufrufenden Skript).

### Task 3: Guard Robustheit

`website-moved.bats` kann als zusätzliche Absicherung ein `rmdir` im teardown bekommen:
```bash
teardown() {
  rmdir website 2>/dev/null || true
}
```

## Acceptance Criteria

- [ ] `bats -r tests/spec/` erstellt kein `website/` Verzeichnis
- [ ] `website-moved.bats` ist nicht mehr flaky
- [ ] Verursacher identifiziert und gefixt
