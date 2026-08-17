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

### Task 2: Script-Bereinigung (optional)

Prüfen ob `LLAMA_DIR=$HOME/opt/llama-b10442` noch aktuell ist und ob das Skript in ein LLM-Benchmark-/Ops-Ticket integriert werden soll.

## Acceptance Criteria

- [x] Script committed in Worktree
- [ ] Script getestet (optional)
