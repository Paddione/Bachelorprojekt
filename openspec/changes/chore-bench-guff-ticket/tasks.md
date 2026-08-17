---
slug: chore-bench-guff-ticket
ticket: T008443
status: active
---

# Chore: GGUF-Benchmark-Skript ticketen

## Problem

`scripts/llm/bench-guff.sh` lag untracked im Hauptcheckout — funktionaler Patch ohne Ticket. Das Skript misst Prompt-Processing und Generation in Tokens/s über die llama-server-OpenAI-API.

## Tasks

### Task 1: Script in Worktree überführen ✅

Das Skript wurde bereits im alten Worktree (chore/bench-guff-T008443) committed. Cherry-pick in den neuen Worktree durchgeführt.

### Task 2: Script-Bereinigung (optional) ✅

`LLAMA_DIR=$HOME/opt/llama-b10442` ist weiterhin aktuell: `llama-b10442/llama-server` (build 10442) ist neuer als `llama-current` (build 10241). Der Default im Skript bleibt korrekt. Das Skript bleibt eigenständig — keine Integration in ein LLM-Benchmark-/Ops-Ticket nötig (Smoke-Test lief erfolgreich, siehe unten).

## Acceptance Criteria

- [x] Script committed in Worktree
- [x] Script getestet (Smoke-Test 2026-08-17: gemma-4-12B-it-qat-UD-Q4_K_XL, CTX=2048, PP 137 Tokens @ 11.4 tps, GEN 32 Tokens @ 4.1 tps, CPU-only, Exit 0)
