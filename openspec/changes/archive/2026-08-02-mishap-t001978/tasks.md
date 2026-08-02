---
title: "mishap-t001978 — Implementation Plan"
ticket_id: T001978
domains: [subagent, opencode]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-t001978 — Implementation Plan

_Ticket: T001978_

## File Structure

```
.opencode/plugins/background-agents.ts            # Empty-Output-Detection + Fallback-Dispatch (Task 1)
.opencode/agent-models.jsonc                      # qwen35-hq als Fallback für qwen35-iq4 (Task 1)
tests/spec/background-agents-fallback.bats        # RED-→-GREEN-Test (Task 1)
```

## Tasks

### Task 1: background-agents.ts Empty-Output-Fallback

In `.opencode/plugins/background-agents.ts` (symlinked von `.opencode/skills/dev-flow/background-agents.ts`):

1. **Empty-Output-Detection** im `awaitCompletion`-Handler: Wenn
   `delegation.status === 'complete'` aber `result.text === ''`,
   `delegation.fallback_attempts = 0` setzen und einmaligen Retry mit
   `qwen35-hq` (aus `agent-models.jsonc`) triggern.
2. **Fallback-Retry-Logik**: Vor dem Setzen des `error`-Status, prüfen ob
   `result.text === ''` und `agent === 'qwen35-iq4'` — wenn ja, neuen
   `Delegation`-Record mit `agent: 'qwen35-hq'`, `parentId: <origId>`
   anlegen, nicht als Fehler markieren.
3. **Status-Wechsel** korrekt setzen: Original-Delegation bleibt auf
   `'running'` (nicht `'error'`), bis Fallback terminiert.

In `.opencode/agent-models.jsonc`: keine Schema-Änderung nötig — `qwen35-hq`
ist bereits definiert (Zeile 119).

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** BATS-Test schreiben, der eine leere
      Delegation simuliert und prüft, dass ein Fallback-Delegation-Record
      mit `agent: 'qwen35-hq'` und `parentId: <origId>` erzeugt wird.

```bash
mkdir -p tests/spec
cat > tests/spec/background-agents-fallback.bats <<'EOF'
#!/usr/bin/env bats
load '../../tests/unit/lib/bats-support/load'
load '../../tests/unit/lib/bats-assert/load'

@test "background-agents: empty output triggers qwen35-hq fallback" {
  # expected: FAIL — initial implementation falls through to error status
  run bash -c 'echo "" | node -e "
    const { handleEmptyOutput } = require(\".opencode/plugins/background-agents.ts\");
    const result = handleEmptyOutput({ agent: \"qwen35-iq4\", text: \"\" });
    if (result.fallback && result.fallback.agent === \"qwen35-hq\") process.exit(0);
    process.exit(1);
  "'
  [ "$status" -eq 0 ]
}
EOF
./tests/unit/lib/bats-core/bin/bats tests/spec/background-agents-fallback.bats
# expected: FAIL (handleEmptyOutput existiert noch nicht)
```

- [ ] **Fix-Step (GREEN).** Nach Implementierung von Task 1:
  ```bash
  ./tests/unit/lib/bats-core/bin/bats tests/spec/background-agents-fallback.bats
  # expected: PASS
  ```

- [ ] **Final Verification.** Drei CI-Gates grün:
  ```bash
  task test:changed
  task freshness:regenerate
  task freshness:check
  ```
