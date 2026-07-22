# Proposal: parallel-partial-plans

## Why

Die Plan-Phase (`dev-flow-plan`/`opencode-flow-plan`) delegiert heute an einen
einzelnen Plan-Subagenten, und die Factory zerlegt Pläne erst zur Laufzeit —
die Aufteilung ist beim Plan-Review unsichtbar, jeder Agent schleppt den vollen
Kontext, und der lokale Bonsai-Server (llama.cpp, 4 Slots, 262k kv-unified)
bleibt als Parallel-Substrat ungenutzt. Zusätzlich existieren zwei driftende
Spec-Wahrheiten (`docs/superpowers/specs/` vs. `openspec/`).

## What

1. **Plan-Split:** Pläne zerfallen in 1–3 Partialpläne (`tasks.d/p1..p3.md`)
   mit disjunkten Dateilisten; letztes Partial = Tests (trägt den
   Failing-Test), rotiert später zur Review-Rolle. Plan-Subagenten laufen
   parallel, jeder mit minimalem Kontext (jq-gefilterte `intel.json` +
   Embedding-Retrieval).
2. **Gang-Scheduling:** `slot_count`-Spalte + atomarer `claim-gang` in
   `slots.sh`; `schedule.sh` mit Head-of-Line-Blocking. Die Factory startet
   erst, wenn alle Partialpläne einen aktiven Slot bekleiden.
3. **Lifecycle:** Completion als `partial-done`-Phase-Event, Kontext-Freigabe,
   Rollen-Rotation p3 → Reviewer (Prompt-Cache-Reuse auf demselben Server).
4. **Provider:** Bonsai-27B (`:8093`, `-np 4`: 3 Worker + 1 Orchestrator) als
   Provider für `implement` + Review; Scout/Plan unverändert.
5. **SSOT:** Brainstorm-Design lebt als `openspec/changes/<slug>/design.md`;
   `openspec-embed.mjs`-Index als Transfer-Medium für Subagenten-Kontext.
6. **Nachweis:** BATS-Tests (Gang-Claim, plan-lint-Partial-Modus, D1) + E2E
   mit synthetischem Mini-Feature.

Details und verworfene Alternativen: [design.md](design.md).

_Ticket: T002074_
