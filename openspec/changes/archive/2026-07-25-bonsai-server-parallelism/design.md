---
ticket_id: T002131
plan_ref: openspec/changes/bonsai-server-parallelism/tasks.md
status: active
date: 2026-07-25
---

# Design Spec: Bonsai-Server -np >1 Re-Stabilisierung für echte Gang-Parallelität

## Overview & Purpose
Die Wiederbelebung und Re-Stabilisierung von multi-slot Gang-Parallelität (`-np > 1`, z.B. `-np 4`) für den `llama-server.exe` (Ternary-Bonsai-8B) auf dem GPU-Host.
Damit multiple autonome Subagenten (z.B. Bonsai-8b-1..4) parallel ohne HTTP 500/400 Slot-Kollisionen oder GBNF-Parser-Abstürze auf Port 8093 arbeiten können, während `llm-proxy` über `max_inflight` Semaphore den Durchsatz steuert.

## Context & Architecture Impact
- **GPU-Host Runbook & Startup**: `scripts/llm/start-bonsai-server.ps1` und `scripts/llm-host-setup.sh` steuern die Parameter (`-np 4`, `-c 131072`, `--cache-ram 24576`, `-ngl 99`, `-fa on`, `-ctk q4_0`, `-ctv q4_0`).
- **LLM Proxy Gate**: Database table `tickets.llm_proxy_backends` via `max_inflight` (Migration `2026-07-23-llm-proxy-max-inflight.sql`).
- **Safety Fixups**: `scripts/llm-proxy/fixups.mjs` bereinigt System-Rollen und GBNF-Regex-Escapes (`sanitizeGbnfPattern`).

## Key Requirements & Verification
1. **GPU VRAM & Context Allocation**: VRAM-Messreihe auf Windows GPU Host validiert (-c 131072 für 4 Slots à 32k Token).
2. **Proxy Concurrency Ratchet**: `max_inflight` schrittweise in `tickets.llm_proxy_backends` von 1 auf 2 und schlussendlich 4 anheben.
3. **GBNF & System Role Stability**: Keine Grammatik-Parse-Fehler unter paralleler Last durch `sanitizeGbnfPattern`.
4. **Smoke & Parallel Load Test**: Parallel-Dispatch-Test für 4 simulierte agent-requests via llm-proxy ohne Failures.
