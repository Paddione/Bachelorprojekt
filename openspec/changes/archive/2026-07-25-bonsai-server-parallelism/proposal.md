# Proposal: Bonsai-Server -np >1 re-stabilisieren für echte Gang-Parallelität (Host-Runbook)

## Intent & Goal
Re-stabilisieren von `-np > 1` (Ziel: 4 parallele Dekodierungs-Slots) auf dem GPU-Host für den `llama-server.exe` mit Ternary-Bonsai-8B. Echte Gang-Parallelität für autonome Subagenten erzielen, indem `llm-proxy`'s `max_inflight` schrittweise erhöht wird, ohne Slot-Overlaps oder Grammatik-Parser-Crashes.

## Scope of Changes
1. **Host-Config & Startup Scripting**:
   - `scripts/llm/start-bonsai-server.ps1`: `-np 4`, `-c 131072`, Cache RAM Allocation, `-ngl 99`, `-fa on`.
   - `scripts/llm-host-setup.sh`: Runbook-Doku & Port-Checks für `-np 4`.
2. **LLM-Proxy In-Flight Concurrency & Fixups**:
   - Migration `scripts/migrations/2026-07-23-llm-proxy-max-inflight.sql` für `max_inflight` in DB (mentolder & korczewski).
   - `scripts/llm-proxy/fixups.mjs`: `sanitizeGbnfPattern` & `bonsaiSystemRoleFixup` zur Vermeidung von Parallellast-Grammatikfehlern.
3. **Verification & Testing**:
   - Load-Smoke Test Script für 4 concurrent Subagent-Requests an `llm-proxy` (:8093 / Proxy).
