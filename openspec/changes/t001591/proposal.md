# Proposal: t001591

## Scope Verification (COMPLETED)

- [x] **Ticket:** T001591 — opencode-agent-harness: Spawn-Wrapper mit Lavish-Delegation
- [x] **Namespace:** root (scripts/)
- [x] **Context:** development workflow enhancement
- [x] **Component:** agent orchestration
- [x] **Severity:** low

## Why

**Problem:** Opencode benötigt einen Mechanismus, um "visual" requests automatisch an den Lavish-Agenten zu delegieren. Ohne diese Detection würde der normale spawn flow laufen statt einer visual artefact generation.

**Solution:** Implementierung von `scripts/harness.ts` als spawn-wrapper mit keyword-based detection (visually, diagram, visualize, comparison, etc.) und automatische Delegation an 'lavish' agent.

## What

**Files to create/modify:**
- `scripts/harness.ts` - Spawn-Wrapper mit visual request detection
- `tests/spec/t001591.bats` - BATS tests für harness functionality
- `openspec/changes/t001591/tasks.md` - Implementation plan (completed)

**Implementation Steps:**

1. Implement detectVisualRequest() with keyword matching
2. Implement spawnWithLavishDetection() für delegation flow
3. Add test helper functions für BATS tests
4. Write comprehensive BATS tests (visual detection, standard handling, edge cases)
5. Run CI gates: task test:changed, freshness:regenerate, check

---

### Nächste Schritte

1. tasks.md mit Implementation Steps aktualisieren (COMPLETED ✅)
2. harness.ts implementieren und testen
3. BATS tests schreiben und verifizieren
4. CI gates durchlaufen
