---
title: Factory Session Reuse
ticket_id: T002072
domains: [factory, ci]
status: planning
---

# factory-session-reuse — Implementation Plan

## File Structure

```
openspec/changes/factory-session-reuse/
├── proposal.md
├── tasks.md
├── .ticket              ← T002072
├── specs/
│   └── factory-session-reuse.md
└── (test files in tests/unit/scripts/)
```

## Task 1: Refactor runClaudeSubagent for session reuse

**Target files:** `scripts/factory/run-pipeline.mjs`

Modify the `runClaudeSubagent` function to:
1. Accept and pass through a `sessionId` parameter
2. Use `claude -p --resume <sessionId>` when a session ID is available
3. Extract the session ID from the output (look for session reference in response)
4. Return the session ID alongside the result for the next phase

```javascript
// Pseudocode for the change:
async function runClaudeSubagent(prompt, { sessionId, timeout }) {
  const args = sessionId
    ? ['-p', '--resume', sessionId, '--output-format', 'json']
    : ['-p', '--output-format', 'json'];
  
  const result = spawnSync('claude', args, { input: prompt, timeout, ... });
  
  // Extract session_id from response for reuse
  const sessionMatch = result.stdout.match(/"session_id"\s*:\s*"([^"]+)"/);
  return { output: result.stdout, sessionId: sessionMatch?.[1] ?? sessionId };
}
```

## Task 2: Thread session ID through pipeline phases

**Target files:** `scripts/factory/run-pipeline.mjs`

Modify the pipeline loop to:
1. Initialize `currentSessionId = null` per ticket
2. Pass `currentSessionId` to each `runClaudeSubagent` call
3. Update `currentSessionId` from the return value
4. Reset to `null` on phase transition (different ticket)

## Task 3: Add session-loss fallback

**Target files:** `scripts/factory/run-pipeline.mjs`

When a `--resume` fails (session not found, timeout):
1. Log the failure: `console.warn('Session %s lost, falling back to fresh spawn', sessionId)`
2. Retry with a fresh `claude -p` (no `--resume`)
3. Update `currentSessionId` from the fresh spawn result

```javascript
try {
  result = await runClaudeSubagent(prompt, { sessionId: currentSessionId, timeout });
} catch (e) {
  if (e.message.includes('session') || e.code === 'ETIMEDOUT') {
    console.warn(`Session ${currentSessionId} lost, falling back to fresh spawn`);
    result = await runClaudeSubagent(prompt, { sessionId: null, timeout });
  } else throw e;
}
currentSessionId = result.sessionId ?? null;
```

## Task 4: Failing test — session reuse fallback

**Target files:** `tests/unit/scripts/run-pipeline.test.mjs` (or new test file)

Write a vitest test that verifies session-loss triggers a fresh fallback:

```javascript
test('session loss triggers fresh spawn fallback', async () => {
  // Mock spawnSync to fail on first call (session lost) and succeed on second
  const { runClaudeSubagent } = await import('../../scripts/factory/run-pipeline.mjs');
  
  // Setup: session ID exists but resume fails
  const result = await runClaudeSubagent('test prompt', { sessionId: 'lost-session', timeout: 30000 });
  
  // expected: FAIL (before fix — no fallback exists, just crashes)
  expect(result).toBeDefined();
  expect(result.output).toBeTruthy();
});
```

This test **expected: FAIL** before the fix is applied — the current code crashes on session loss.
After Task 3 (fallback logic), this test should pass.

## Task 5: Verify

- Run `task test:changed` to confirm no regressions
- Run `task freshness:regenerate && task freshness:check`
- Manual test: run a pipeline with session reuse and observe reduced prefill time in logs
