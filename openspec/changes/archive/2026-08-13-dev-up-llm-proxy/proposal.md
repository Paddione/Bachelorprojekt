# Proposal: dev-up-llm-proxy

**Ticket:** T002656 | **Typ:** feat | **Effort:** klein | **Priorität:** hoch

## Why

Fragment des geschlossenen EPIC T002650 (one-command-dev-environment). Das
Kind-Ticket T002655 hat `sdlc:up` / `sdlc:down` / `sdlc:dev` gebaut: Cluster →
Stack → llm-proxy → `health-gate.sh`. Was fehlt, ist der llm-Teil des Epics:

- `sdlc:up` startet den **Proxy** (Port 18235), aber keine **lokalen Modelle**.
  Der Proxy bedient Anfragen erst, wenn ein Chat-Loadout läuft; der
  Loadout-Autostart greift nur auf Anfrage (T002336/T002616) — ein frischer
  Cold Start antwortet also mit 404/503, bis die erste Anfrage ein Loadout
  startet.
- Der `health-gate.sh` prüft den Proxy nur per `/livez` (Liveness). Ob der
  Proxy **ready** ist (Prio-1-Backend da, `/health` ≠ 503) und ob das
  Chat-Loadout tatsächlich läuft und healthy ist, steht nirgends — ein
  „kompletter Stack“ kann grün melden, während kein Modell bedienbar ist.

## What

1. **Lokale Modelle in `sdlc:up` starten:** Nach dem Proxy-Start wird das
   konfigurierte Chat-Loadout der `chat-gpu`-Gruppe idempotent gestartet
   (via Proxy-Admin-API). Konfigurierbar über `SDLC_LLM_LOADOUT`, Default
   `gemma26-throughput` (T003204: die Agenten wurden auf gemma26-throughput
   umgehängt; loadouts.json: 159–169 tok/s, schnellstes Chat-Loadout).
2. **Health-Check vertiefen:** `health-gate.sh` bekommt zwei weitere Proben —
   Proxy-Readiness (`GET /health` → `ready: true`) und Loadout-Status
   (`GET /admin/loadouts/status` → running + healthy). Fehlende Komponente
   wird benannt (bestehende Fail-fast-Semantik der Spec).
3. **`sdlc:down` vervollständigen:** Das Chat-Loadout wird vor dem Proxy-Stopp
   gestoppt (best-effort) — die systemd-run-Loadout-Units überleben sonst den
   Proxy-Prozess.
4. **Tests:** Neue BATS-Datei unter `tests/spec/sdlc-isolation/` (eigene Datei
   pro Vorgang, T002416).

## Entscheidungen (Brainstorming)

- **Kein `dev:up`-Task.** Die SSOT-Spec `openspec/specs/sdlc-isolation.md`
  (Requirement „The `dev:` Task Namespace Stays Reserved for the Staging
  Stack“) reserviert den `dev:`-Namespace für den Staging-Stack
  (Taskfile.dev-stack.yml) und verbietet `dev:up`/`dev:down` explizit —
  Prior-Art aus T002623/T002655. Die Ticket-Formulierung „Integration in task
  dev:up“ ist durch diese spätere SSOT-Entscheidung überholt; integriert wird
  in **`sdlc:up`**. Bestehende Entscheidung beibehalten, nicht ersetzen.
- **Loadout-Start statt systemd-Units.** Das Epic-Design plante
  `systemctl --user start llama-gemma26.service`; diese Units existieren nie.
  Der etablierte Weg ist die Loadout-Verwaltung des Proxys (systemd-run mit
  `Restart=on-failure`, Konfliktregel `exclusiveGroup` T002616). Keine neuen
  Units.
- **Genau ein Loadout.** Alle Chat-Loadouts teilen `exclusiveGroup: chat-gpu`
  — nur eines kann laufen. „Alle lokalen Modelle starten“ würde 409-Konflikte
  erzeugen; gestartet wird das konfigurierte Standard-Loadout.
- **Kein Proxy-Verhaltens-Change.** `/health`-Semantik, Auto-Start und
  Queue bleiben unangetastet; geändert wird nur die Dev-Orchestrierung.

## Nicht im Scope

- Änderungen an `scripts/llm-proxy/*` (Proxy-Verhalten)
- `dev:up` / `dev:down`-Tasks (SSOT-Verbot, s. o.)
- Remote/GPU-Host-Provisions (Windows-Seite, wg-gpu) — die lokalen Modelle
  laufen als WSL-llama.cpp-Prozesse (modelRoots `~/models/gguf`)

## Abhängigkeiten

- T002650 (EPIC, done) — Scope und Design-Quelle
- T002655 (done) — `sdlc:up`/`sdlc:down`/`health-gate.sh`, auf denen dieser
  Change aufbaut
- SSOT-Specs: `openspec/specs/sdlc-isolation.md` (Delta-Ziel),
  `openspec/specs/local-llm-proxy.md` (Proxy-Verhalten, unverändert)
