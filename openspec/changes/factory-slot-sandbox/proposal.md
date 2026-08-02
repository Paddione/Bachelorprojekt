# Proposal: Factory Slot Sandbox

## Motivation

Die Software Factory dispatched heute Agent-Sessions als Host-Prozesse (`claude -p` /
`opencode run`) ohne Container-Isolation. `sandbox-run.sh` containerisiert nur
Sub-Commands (`task test:all`), nicht den Agenten selbst. Gleichzeitig existieren zwei
entkoppelte Slot-Begriffe: `pipeline_slot` (1..3) in `tickets.tickets` als reiner
Dispatcher-Lane-Zähler und llama.cpp-interne Slots (0..N-1) als echte KV-Cache-Halter.

## Ziel

Drei Dinge in einem Schritt koppeln:

1. **Slot-Kopplung:** `pipeline_slot` → llama.cpp-Slot-ID zuordnen, sodass ein Ticket
   im pipeline_slot N konsistent llama.cpp-Slot N nutzt
2. **Agent-Containerisierung:** `sandbox-run.sh` von Sub-Command-Wrapper zum
   Agent-Session-Wrapper upgraden (Stufe 2 aus `factory-qa-sandbox-design.md`)
3. **Per-Slot-Isolation:** Jeder pipeline_slot bekommt eigenen Container mit
   cgroups-Limits, Netzwerk-default-deny, und dediziertem TMPDIR

## Design-Entscheidungen (Brainstorming 2026-08-02)

- **Option C (Hybrid):** Ein llama-server mit `-np N -kvu` (geteilter KV-Pool für
  VRAM-Effizienz), N Container für N pipeline_slots
- **llm-proxy-Routing:** pipeline_slot → Backend-Port oder llama.cpp-Slot-ID via
  custom Header (Entscheidung im Design)
- **Sandbox-Upgrade:** `sandbox-run.sh` wrappt die gesamte Agent-Session, nicht nur
  Sub-Commands
- **Blockiert von T002482** (KV-Offload + Slot-Save/Restore) für persistente Kontexte

## Impact

| Bereich | Änderung |
|---------|----------|
| `scripts/factory/sandbox-run.sh` | Upgrade zum Agent-Wrapper (Stufe 2) |
| `scripts/factory/sandbox.Dockerfile` | Image für Agent-Session (node + playwright + task) |
| `scripts/factory/pipeline.mjs` | Agent-Aufruf durch Sandbox wrappen |
| `scripts/llm-proxy/server.mjs` | Slot-Routing (pipeline_slot → Backend/Slot-ID) |
| `scripts/llm/loadouts.json` | Multi-Slot-Loadout aktivieren (gemma-multiagent) |
| `scripts/factory/slots.sh` | pipeline_slot → llama.cpp-Slot-ID Mapping persistieren |
