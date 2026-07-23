---
ticket_id: T002128
plan_ref: openspec/changes/factory-flash-bonsai-gang/tasks.md
status: active
date: 2026-07-23
---

# Design: factory-flash-bonsai-gang

_Ticket: T002128 · Stand: 2026-07-23 · Brainstorm-Board: `.lavish/factory-flash-bonsai-gang-brainstorm.html`_

## Goals

- Staged Pläne triggern **automatisch** einen Factory-Tick (keine Timer-Wartezeit).
- Neuer opt-in Factory-Executor: opencode-Orchestrator (`opencode-go/deepseek-v4-flash`,
  temp 0.2) dispatcht bis zu 4 `bonsai-8b`-Subagents auf disjunkte Partials derselben
  Implementierung.
- Die Gang-Konfiguration ist **Repo-Kanon** (sync-sicher), nicht nur globale Host-Config.
- Physische Bonsai-Parallelität ist per DB konfigurierbar (`max_inflight`), Default bleibt
  seriell.
- Jeder Subagent-Lauf hinterlässt auswertbare Phase-Events (SDLC-Beobachtungs-Goal).

## Non-Goals

Siehe `proposal.md` — B3/B4-Drift (T002129), B10-Whitelist (T002130), Host-`-np`,
Default-Flip.

## Architektur (gewählter Ansatz A)

Executor-Verzweigung am spätesten sinnvollen Punkt — `dispatcher-bridge.sh` hat Worktree,
Prompt-Kontext und Backgrounding pro Ticket bereits vorbereitet; Scheduling, Slots und
Gang-Claims bleiben unberührt:

```
wakeup.sh → factory-prep → schedule.sh/claim-gang → dispatcher-bridge.sh
                                                        │
                                     FACTORY_EXECUTOR? ─┤
                                          claude (Def.) │ opencode (neu)
                                                        ▼
                                     claude -p …   opencode-exec.sh
                                                        │ opencode run --agent orchestrator
                                                        ▼
                                          orchestrator (deepseek-v4-flash)
                                             │ task-Dispatch, ≤4 parallel
                                   ┌─────────┼─────────┬─────────┐
                                   ▼         ▼         ▼         ▼
                              bonsai-8b-1 …-2      …-3      …-4
                                   └────── llm-proxy :18235 ──────┘
                                          (Semaphor max_inflight,
                                           heute 1 ⇒ physisch seriell)
                                                        ▼
                                              llama.cpp :8093 (-np 1)
```

**Verworfene Ansätze:** (B) `pipeline.mjs`-Modernisierung — koppelt das Feature an eine
riskante Rewrite des Live-Kerns; Drift separat als T002129. (C) Eigener Gang-Service am
Dispatcher vorbei — dupliziert Slot-Logik, Race-Gefahr.

## Entscheidungen

| # | Entscheidung | Begründung / Trade-off |
|---|---|---|
| D1 | Auto-Tick feuert **beim Stagen** (`stage-plan.sh`) | Deckt die User-Direktive wörtlich; Enqueue folgt im Pipeline-Loop ohnehin unmittelbar. Idempotentes Flag ⇒ Doppel-Ticks harmlos. |
| D2 | T002102-p3 wird **supersedet** | Unser p1 implementiert dasselbe Wiring schlanker (Flag + Service-Start statt Poll-Timer-Units); Verweis in beiden Changes verhindert Doppelarbeit. |
| D3 | Rollout **opt-in** (`FACTORY_EXECUTOR=opencode`), Flip nach 3 sauberen Zyklen | Unerprobter Executor + Merge=Abschluss-Konvention: Fehlversuche würden sonst direkt PRs/Closures produzieren. Beobachtungs-Goal liefert die Flip-Evidenz. |
| D4 | Proxy-`max_inflight` bauen, Host bleibt `-np 1` | Crash-Historie unter 3-4×-Last (2026-07-23). Struktur-Parallelität jetzt, physische per DB-Update später — Umschalten ohne Code-Änderung. |
| D5 | TQ2_0→Q2_0-Fix in p3 | 15× Speedup (T002111-belegt), zwei Zeilen in den Provider-Blöcken — separates Ticket wäre Overhead ohne Nutzen. |

## Komponenten

### p1 — Stage-Auto-Tick (`scripts/vda/ticket/stage-plan.sh`)
Nach dem `plan_staged`-UPDATE (heute Z.25-28): idempotenter Upsert
`factory_control(key='force-tick-requested', brand NULL)` + best-effort
`systemctl --user start factory.service 2>/dev/null || true`. Kein neuer Timer, kein
Poll-Skript — der Konsument (`wakeup.sh:70-83`) existiert und löscht das Flag beim Tick.
Fehlerfall DB-Insert: Warnung auf stderr, Stage schlägt NICHT fehl (Tick kommt dann vom
Timer — degradiert auf heutiges Verhalten).

### p2 — Executor-Zweig (`dispatcher-bridge.sh` + neu `scripts/factory/opencode-exec.sh`)
`FACTORY_EXECUTOR` (env, Default `claude`) verzweigt pro Ticket-Launch. `opencode-exec.sh`:
baut den Orchestrator-Prompt (Ticket-ID, Branch, Worktree-Pfad, Plan-Pfad,
`## Partials`-Manifest, Guardrails: kein Auto-Merge, `pr-ready`-Gate respektieren), ruft
`opencode run --agent orchestrator --format json` **im Launch-Worktree** auf, parst das
Ergebnis und schreibt Phase-Events (`implement entered/done/blocked`, `detail`-JSON:
`{executor:"opencode", subagent:"bonsai-8b-N", partial:"pX", duration_s, exit}`).
Exit ≠ 0 ⇒ `blocked`-Event + stderr-Log; **kein** stiller Fallback auf `claude -p`
(Beobachtbarkeit vor Bequemlichkeit; Watchdog greift).

### p3 — opencode-Kanon (`.opencode/agent-models.jsonc`, `.opencode/prompts/orchestrator.md`, `AGENTS.md`)
Orchestrator (mode primary, temp 0.2, steps 50, `permission.task: bonsai-8b-*|deepseek-helper`),
`bonsai-8b-4` (temp 0.4, analog 1-3) und der Prompt wandern in den Repo-Kanon — Quelle für
`opencode-sync-agents.sh`, damit Sync die Config **verteilt statt löscht**. Modell-ID beider
Provider-Blöcke auf `Ternary-Bonsai-8B-Q2_0.gguf`. Doku-Drift (»4 parallel«, `-np`-Behauptungen)
in `AGENTS.md` + jsonc-Kommentaren auf den Ist-Zustand (`-np 1`, seriell via Proxy) korrigiert.

### p4 — llm-proxy Semaphor (`scripts/llm-proxy/server.mjs`, `backends.mjs`, Migration)
Migration: `ALTER TABLE tickets.llm_proxy_backends ADD COLUMN max_inflight int NOT NULL DEFAULT 1`.
`server.mjs`: FIFO-Queue pro Backend bleibt, aber bis zu `max_inflight` Requests gleichzeitig
in-flight (Semaphor); `/admin/state` ergänzt `{inflight, max_inflight}` pro Backend.
Default 1 ⇒ byte-identisches Verhalten zu heute; `/health` bleibt unverändert (Gang-Gating
nutzt `/admin/state`, dokumentiert im Orchestrator-Prompt).

### p5 — Tests (`tests/spec/software-factory.bats`)
RED zuerst: (1) `stage-plan` schreibt `force-tick-requested` (DB-Mock/Fixture wie bestehende
FA-SF-Tests); (2) `dispatcher-bridge` mit `FACTORY_EXECUTOR=opencode` ruft `opencode-exec.sh`
(Dry-Run-Stub) statt `claude`; (3) Migration vorhanden + `server.mjs` respektiert
`max_inflight` (Unit-Ebene, Node-Testaufruf analog bestehender llm-proxy-Tests).

## Fehlerbehandlung

- Stage-Flag-Fehler: degradiert auf Timer-Tick (warn, non-fatal).
- Orchestrator-Fehlschlag: `blocked`-Phase-Event, Ticket bleibt claimed, Watchdog-Pfad;
  kein Auto-Retry im Trial.
- Bonsai-Subagent-Timeout: Orchestrator-Prompt weist an, nach 2 Fehlversuchen pro Partial
  an `deepseek-helper` zu eskalieren (bestehende Eskalations-Konvention der globalen Config).
- DSGVO-Randnotiz: deepseek-v4-flash ist eine Cloud-API — Code verlässt On-Prem. Bereits
  historisch so im Autopilot (autopilot.env-Backups); opt-in-Executor begrenzt Exposition.
  Bewusste Akzeptanz, im Board dokumentiert.

## Beobachtbarkeit (SDLC-Goal-Anbindung)

Alle Executor-Läufe erzeugen `factory_phase_events` mit strukturiertem `detail`
(Executor, Subagent, Partial, Dauer, Exit). Auswertung pro Zyklus →
Memory `project_sdlc-agent-observation-goal.md` Beobachtungslog.
