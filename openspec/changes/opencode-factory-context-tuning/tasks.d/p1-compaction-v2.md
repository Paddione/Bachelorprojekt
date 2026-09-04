---
title: "Add V2 compaction block to opencode.jsonc"
ticket_id: "T900074"
domains: ["config", "llm-local-dev"]
status: "draft"
---

# p1 — V2 Compaction Block (compaction-v2)

## File Structure

```
.opencode/opencode.jsonc    # insert compaction block after "model" key
```

## Problem

The worktree base (`origin/main`) contains **no** `compaction` block in
`.opencode/opencode.jsonc`. The old `reserved`/`preserve_recent_tokens` keys
in the main checkout are V1 keys that V2 ignores. The factory session thus
grows to the context maximum (200k) instead of compacting at ~100k active.

## Target State

A V2-compliant `compaction` block is inserted directly after the `"model"` key:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  // … model comments …
  "model": "freetoken-local/active",
  // ── V2 Compaction (Requirement: V2 Compaction Targets 100K Active Context) ──
  // Factory model: Qwen3.6-35B-A3B, context=200000, output=8192.
  // V2 threshold = 200000 − max(8192, 96000) = 104000
  // → compaction at ~100k active context, keep.tokens: 16000 holds the tail.
  "compaction": {
    "auto": true,
    "keep": { "tokens": 16000 },
    "buffer": 96000
  }
  // ── Third-party opencode plugins …
```

## Implementation Steps

1. **Insert compaction block after the `"model"` line.**
   - Find the `"model": "freetoken-local/active",` line.
   - Insert directly after it: comment lines with the threshold math
     (`200000 − max(8192, 96000) = 104000`), the Requirement reference, and
     the `compaction` key with `auto: true`, `keep.tokens: 16000`,
     `buffer: 96000`.
   - The `// ── Third-party opencode plugins …` comment stays the next block.

2. **Validate JSONC syntax.**
   - The line before the `plugin` key must end with a comma.
   - No V1 keys (`reserved`, `preserve_recent_tokens`) — explicitly omitted.

## Acceptance Criteria

- [ ] `.opencode/opencode.jsonc` contains a `compaction` block with
      `auto: true`, `keep.tokens: 16000`, `buffer: 96000` (V2 schema).
- [ ] The block sits after the `"model"` key, before the `plugin` key.
- [ ] A comment documents the threshold math
      (`200000 − max(8192, 96000) = 104000`) and cites the Requirement.
- [ ] No V1 keys (`reserved`, `preserve_recent_tokens`) in the file.
- [ ] The file remains valid JSONC (comments allowed, structure intact).

## Not in Scope

- **Tests** — p6 owns the test steps. This partial has **no** Failing-Test-Step
  by design.
- Tool restriction, session freshness, AGENTS.md slimming — other partials.
