# Proposal: factory-muse-spark-qwen-moe

## Why

Die Software Factory dispatcht per Default über `claude -p`; der
opencode-Pfad (Orchestrator → lokaler FreeToken Qwen MoE) ist nur opt-in,
obwohl die Implementation längst dort läuft. Die Planung hängt auf
Laguna S 2.1 Free (256k), während Muse Spark 1.3 Contributor (1M ctx,
free-first mit Go-Fallback) verfügbar ist. Ziel: Default auf opencode,
Planung auf Muse Spark 1.3, Implementation weiter auf dem lokalen Qwen MoE —
pro Tick wählbar über `FACTORY_MODE=local|api|mixed`.

## What

- `FACTORY_EXECUTOR`-Default `claude` → `opencode` (unbekannter Wert fällt
  weiter auf `claude` zurück; `dsh`-Zweig bleibt).
- Neues `FACTORY_MODE=local|api|mixed` (Default `mixed`) für
  Eskalations-Verhalten (lokal-only vs. früh auf Muse Spark vs. gemischt).
- Orchestrator-Primary auf `opencode-zen/muse-spark-1.3-contributor-free`;
  neuer Fallback-Subagent `planner-muse` auf
  `opencode-go/muse-spark-1.3-contributor`; Eskalationskette und
  Empty-Return-Regel angepasst.
- `OPENCODE_BIN`-Env-Doku (kein `opencode` im PATH dieser Box) statt neuer
  Lookup-Logik.

_Ticket: T900210_
_Design: docs/superpowers/specs/2026-09-17-factory-muse-spark-qwen-moe-design.md_
