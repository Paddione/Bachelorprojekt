# Proposal: factory-flash-bonsai-gang

## Why

Die T002074-Pipeline (parallele Partialpläne) hat zwei offene, vom User am 2026-07-22/23
bestätigte Follow-ups: den DeepSeek-V4-Flash-opencode-Orchestrator-Trial und Bonsai auf
echten Implement-Tasks. Gleichzeitig zeigt die Recon vom 2026-07-23 (Befunde B1–B10 auf
`.lavish/factory-flash-bonsai-gang-brainstorm.html`):

- **B1/B2:** Weder Stage noch Enqueue wecken die Factory — das Auto-Tick-Wiring ist als
  T002102-p3 (`unified-llm-gateway/tasks.d/p3-factory-wake.md`) fertig geplant, aber nie
  implementiert. Die Direktive »upon staging automatically trigger a factory tick« ist
  damit unerfüllt; Staged-Pläne warten bis zum nächsten `factory.timer`-Intervall.
- **B5/B6:** Es existiert kein `opencode run`-Executor im Repo. Die Ziel-Konfiguration
  (orchestrator auf `opencode-go/deepseek-v4-flash` + 4× `bonsai-8b`-Subagents) liegt
  bereits in der **globalen** opencode-Config (`~/.config/opencode/opencode.jsonc`),
  würde aber von `scripts/opencode-sync-agents.sh` beim nächsten Lauf überschrieben,
  weil sie im Repo-Kanon (`.opencode/agent-models.jsonc`) fehlt.
- **B7:** Die Agent-Configs referenzieren `Ternary-Bonsai-8B-TQ2_0.gguf` — ohne
  CUDA-Kernel im Fork-Build läuft das still auf CPU (12,8 statt 185 tok/s, T002111).
- **B8:** Der llm-proxy serialisiert Requests FIFO pro Backend — eine 4er-Gang liefe
  physisch strikt nacheinander, ohne Konfigurationsmöglichkeit.

## What

Neuer, **opt-in** Factory-Executor-Modus plus das fehlende Stage-Wiring, in 5 disjunkten
Partials:

1. **p1 — Stage-Auto-Tick:** `scripts/vda/ticket/stage-plan.sh` schreibt nach dem
   Status-Update idempotent das `force-tick-requested`-Flag (`factory_control`, brand NULL —
   Konsument existiert: `wakeup.sh:70-83`) und startet `factory.service` (tolerant ohne
   systemd). **Supersedet T002102-p3 Task 1/4/5** (Verweis dort eingetragen).
2. **p2 — Executor-Zweig:** `dispatcher-bridge.sh` verzweigt auf `FACTORY_EXECUTOR`
   (`claude` = Default, `opencode` = neu). Neues `scripts/factory/opencode-exec.sh` ruft
   `opencode run --agent orchestrator` im vorbereiteten Launch-Worktree auf; Prompt trägt
   Ticket-ID, Branch, Plan-Pfad, Partial-Manifest und Trial-Guardrails. Subagent-Telemetrie
   als Phase-Events (`implement`, `detail`-JSON pro Bonsai-Subagent).
3. **p3 — opencode-Kanon:** `orchestrator`-Agent, `bonsai-8b-4` und
   `prompts/orchestrator.md` in den Repo-Kanon (`.opencode/agent-models.jsonc`), damit
   `opencode-sync-agents.sh` die Gang-Config verteilt statt zerstört; Modell-ID-Fix
   TQ2_0→Q2_0; Stale-Doku (»4 parallel« in `AGENTS.md` u. a.) bereinigt.
4. **p4 — llm-proxy `max_inflight`:** Neue Spalte in `tickets.llm_proxy_backends`
   (Default 1 = heutiges Verhalten); `server.mjs` ersetzt die strikte FIFO-Serialisierung
   durch ein per-Backend-Semaphor; `/admin/state` zeigt In-Flight-Zähler. Echte
   Parallelität wird damit ein DB-Update + Server-Restart, keine Code-Änderung.
5. **p5 — Tests:** BATS in `tests/spec/software-factory.bats` (RED zuerst):
   Stage schreibt Flag; Executor-Verzweigung (Dry-Run); Migration + Semaphor-Verhalten.

## Non-Goals

- **Kein Fix des pipeline.js/.mjs-Gang-Drifts (B3/B4)** — eigenes Ticket T002129.
- **Kein Fix des partial-done-Whitelist-Bugs (B10)** — eigenes Ticket T002130.
- **Keine Host-seitige `-np`-Änderung** am Bonsai-Server (Windows-Skript, Cutover-Runbook,
  kein Repo-Diff; Crash-Historie unter 3-4×-Last vom 2026-07-23 spricht gegen sofortiges
  Hochdrehen — D4).
- **Kein Default-Flip auf den opencode-Executor** — Opt-in bis 3 saubere beobachtete
  Zyklen vorliegen (D3, SDLC-Beobachtungs-Goal).

_Ticket: T002128 · Supersedet: T002102-p3 (factory-wake) · Verwandt: T002129, T002130_
