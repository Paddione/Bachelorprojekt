---
title: Factory auf FreeToken Qwen MoE + Muse Spark 1.3 Planung umstellen
status: draft
date: 2026-09-17
---

# Zweck

Die Software Factory dispatcht per Default ueber `claude -p`; der
opencode-Pfad (`opencode-exec.sh` → Orchestrator → lokaler Qwen MoE) ist nur
opt-in. Planung laeuft auf Laguna S 2.1 Free (256k). Dieses Design schaltet den
Default auf opencode um, behaelt die Implementation auf dem FreeToken Qwen MoE
und hebt die Planung auf Muse Spark 1.3 Contributor (free-first, Go-Fallback).
Der Operator kann pro Tick `local | api | mixed` waehlen.

# Kontext (gemessen, nicht geraten)

- Implementation laeuft bereits auf FreeToken Qwen3.6-35B-A3B-NVFP4 via
  llm-proxy `:18235` → FreeToken `:1919`, statischer 200k-KV-Pool, single-flight
  (`--max-running-requests 1`, Proxy queuet ≤3 sequenziell). Handles `local`,
  `reviewer`, `qwen38-primary`, `opencode.jsonc`-Default zeigen alle dorthin;
  Compaction-Trigger 104k auf 200k-Pool.
- Factory-Default heute: `dispatcher-bridge.sh:179`
  `executor="${FACTORY_EXECUTOR:-claude}"`. `opencode-exec.sh` ist opt-in.
- Planung heute: `orchestrator` primary auf
  `opencode-zen/laguna-s-2.1-free` (256k). Kein Muse-Spark-Wiring existiert.
- Muse Spark 1.3 im Katalog verifiziert: `opencode-go/muse-spark-1.3-contributor`
  (1M ctx / 131k out, $0.1/$0.2) und
  `opencode/muse-spark-1.3-contributor-free` (Zen, 1M / 131k, $0/$0,
  Training-Data-Sharing). User-Entscheid: beide mit Fallback (free zuerst),
  Scope = Orchestrator-Switch, Executor-Default = opencode.

# Design

## D1 — Model-Registry (`.opencode/agent-models.jsonc`)

- `opencode-zen`: Eintrag `muse-spark-1.3-contributor-free` (ctx 1048576,
  output 131072, npm `@ai-sdk/openai-compatible`, baseURL unveraendert
  `https://opencode.ai/zen/v1`), mit Mess-Kommentar (Datum + Smoke-Ergebnis).
- `opencode-go`: Eintrag `muse-spark-1.3-contributor` (gleiche Limits,
  baseURL `https://opencode.ai/zen/go/v1`).
- Konvention bleibt: kein ungemessener Modelleintrag, auf den ein Agent zeigt.

## D2 — Orchestrator + Fallback-Planner

- `orchestrator.model`: `opencode-zen/laguna-s-2.1-free` →
  `opencode-zen/muse-spark-1.3-contributor-free`. Description erwaehnt 1M ctx,
  Free-Tier und Training-Data-Sharing.
- Neuer Subagent `planner-muse`: `opencode-go/muse-spark-1.3-contributor`,
  Planungs-Prompt, allow-listed auf `orchestrator`, `big-pickle`,
  `qwen38-primary` (exakte Namen, keine Wildcards, Prinzip T002298).
- `prompts/orchestrator.md` Zeile 1 + Dispatch-Strategie aktualisiert.
- Eskalationskette neu: `local` (2 Versuche) → `planner-muse` (Go, M2) →
  `deepseek-helper-go` → `deepseek-helper` → `pro/pro-direct`.
  Empty-Return-Regel nennt `planner-muse` als M2.

## D3 — Executor-Default + FACTORY_MODE

- `dispatcher-bridge.sh`: `FACTORY_EXECUTOR` default `claude` → `opencode`.
  Unbekannter Wert warnt weiter und faellt auf claude zurueck.
- Neu `FACTORY_MODE=local|api|mixed` (default `mixed`):
  - `local`: opencode-Orchestrator, `FACTORY_DISPATCH_SUBAGENT=local`, keine
    Cloud-Eskalation im Prompt.
  - `api`: Planungs-lastig, Eskalation zu `planner-muse` schon beim ersten
    Stall (kein zweimal-lokal-warten).
  - `mixed` (Default): zweimal lokal, dann `planner-muse`, dann DeepSeek-Rails.
- `opencode-exec.sh`-Prompt traegt den Modus (ein Satz, kein Prompt-Umbau).
- `wakeup.sh`-Header + `AGENTS.md`-Core-Commands-Notiz aktualisiert.

## D4 — Binaer-Aufloesung (nur Env/Doku, keine neue Logik)

- `opencode-exec.sh` loest bereits `OPENCODE_BIN` → PATH →
  `~/.npm-global/bin/opencode` auf (Exit 2 bei Miss). Auf dieser
  Linux-Box liegt kein `opencode` im PATH — Fix per Env (`OPENCODE_BIN`-Export,
  npm-global-PATH in der systemd-Unit) + Install-Notiz, keine Lookup-Logik.

## D5 — Unangetastet

Qwen-Serve-Flags, KV-Pool, Compaction (104k/16k-keep), `opencode.jsonc`-Default,
`local`/`reviewer`/`qwen38-primary`-Handles. Keine neuen dichten Modelle.

# Verifikation

1. JSONC-Parse + `opencode models`-Smoke (free zuerst, Go-Fallback zweitens).
2. `task test:changed` + Factory-BATS (`factory-readiness`, Dispatcher) +
   `task workspace:validate`.
3. Rollback: `FACTORY_EXECUTOR=claude` + Orchestrator-Modell zurueck auf Laguna
   (zwei Env-/Config-Zeilen, kein Code-Rollback noetig).

# Risiken

- Muse Spark 1.3 ungemessen: Vor jedem Agenten-Show auf das Modell stehen
  Smoke-Test und Limit-Kalibrierung (Auto-Compact bei 95% — falsche ctx-Zahl reproduziert
  Overflow-Drops wie bei big-pickle 09-12).
- Zen-free teilt Prompts zum Training: im Design-Doc offengelegt, kein
  Secret-Material in Planungs-Prompts.
- `mixed` ist Default: wer strikt lokal fahren will, setzt `FACTORY_MODE=local`.
