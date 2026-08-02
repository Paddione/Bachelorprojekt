---
title: Factory Session Reuse
ticket_id: T002072
status: planning
---

# factory-session-reuse — Proposal

## Purpose

Eliminate ~26s prefill cost per factory ticket step by reusing Claude Code sessions across pipeline phases instead of spawning fresh processes.

## Problem

`run-pipeline.mjs` spawns a fresh `claude -p` process per ticket step via `spawnSync`. Each spawn pays ~26s prefill of the ~37k-token system prompt. Additionally, slot-cache-misses on the Bonsai server partly stem from this pattern.

## Requirements

### REQ-1: Session persistence across phases
The pipeline must maintain a Claude session ID per ticket and use `--resume <session-id>` or `--continue` instead of fresh spawns.

### REQ-2: Graceful fallback on session loss
If a session times out or is aborted, the pipeline must fall back to a fresh `claude -p` dispatch without breaking the pipeline.

### REQ-3: Timeout handling
Phase timeouts must work correctly with session reuse — if a resumed session hangs, it should be killed and retried with a fresh spawn.

## Scenarios

### Scenario: Normal session reuse
GIVEN a ticket progressing through phases
WHEN a new phase starts
THEN the pipeline resumes the existing session instead of spawning fresh
AND the prefill cost is eliminated

### Scenario: Session loss fallback
GIVEN a ticket with a lost/expired session
WHEN the pipeline tries to resume
THEN it detects the failure and falls back to a fresh spawn
AND the pipeline continues without interruption
