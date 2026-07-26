---
title: "Bonsai-Server: -np >1 re-stabilisieren für echte Gang-Parallelität (Host-Runbook)"
ticket_id: "T002131"
domains: "ops,infra"
status: "plan_staged"
date: "2026-07-25"
---

# Implementation Plan - Bonsai-Server: -np >1 re-stabilisieren für echte Gang-Parallelität (Host-Runbook)

## File Structure
- `scripts/llm/start-bonsai-server.ps1`
- `scripts/llm-host-setup.sh`
- `scripts/llm-proxy/fixups.mjs`
- `scripts/migrations/2026-07-23-llm-proxy-max-inflight.sql`
- `scripts/llm-proxy/server.test.mjs`

## S1 Quality Budget
- `scripts/llm/start-bonsai-server.ps1`: s1_budget=50 (effective limit 250)
- `scripts/llm-host-setup.sh`: s1_budget=50 (effective limit 250)
- `scripts/llm-proxy/fixups.mjs`: s1_budget=50 (effective limit 250)
- `scripts/migrations/2026-07-23-llm-proxy-max-inflight.sql`: s1_budget=30 (effective limit 250)

## Tasks

### Task 1: Verify & Update GPU Host Scripting (-np 4 + Context Allocation)
- **Target Files**: `scripts/llm/start-bonsai-server.ps1`, `scripts/llm-host-setup.sh`
- **Goal**: Config multi-slot execution `-np 4` with context size `-c 131072` and proper VRAM limits.
- **Verification**:
  - Step 1: Run `vitest run` (expected: FAIL initially if multi-slot behavior assertions fail)
  - Step 2: `powershell -Command "Test-Path scripts/llm/start-bonsai-server.ps1"`
  - Step 3: `bash -n scripts/llm-host-setup.sh`

### Task 2: Validate LLM Proxy Fixups & Concurrency Limit Migration
- **Target Files**: `scripts/llm-proxy/fixups.mjs`, `scripts/migrations/2026-07-23-llm-proxy-max-inflight.sql`
- **Goal**: Ensure `sanitizeGbnfPattern` handles complex patterns cleanly and `max_inflight` schema is applied.
- **Verification**:
  - `node --test scripts/llm-proxy/server.test.mjs`

### Task 3: Final Verification & Pipeline Check (STRUCT3)
- **Target Files**: N/A (Verification)
- **Goal**: Run pre-commit test suite, freshness checks, and workspace validation.
- **Verification**:
  - `task test:changed`
  - `task freshness:regenerate`
  - `task freshness:check`
  - `task workspace:validate`
