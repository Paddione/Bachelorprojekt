---
ticket_id: T901645
plan_ref: .agents/plans/e2e-vision-agent-harness/tasks.md
status: active
date: 2026-10-09
---

# Design: e2e-vision-agent-harness

Architektur-Spec zum Brainstorming (Chat, 2026-10-09). Normative Details stehen
in `tasks.md` + Partials; hier die getroffenen Entscheidungen.

## Entschiedene Architektur

**Dünner Runner + Orakel-Modul + JSON-SSOT, kein Framework.** Der Runner
orchestriert nur (Playwright + HTTP-Calls); die Flow-Intelligenz liegt in
`curated.json` (Daten) und `oracle.mjs` (Checks). Modell-Endpunkt ist
parametrisierbar, damit Bench-Läufe nur die URL tauschen.

## Modul-Schnitt

```text
tests/e2e/agent/                  # neu, eigenständig neben specs/
  runner.mjs                      # Agent-Loop: obs -> VLM -> Aktion -> Playwright
  oracle.mjs                      # deterministische Checks (URL/Text/API-State)
  oracle.test.mjs                 # node --test, Fixture-basiert, kein Browser
  curated.json                    # SSOT: 6-8 Flows + Orakel-Referenzen
docs/runbooks/e2e-vision-agents.md  # Serve + Bench-Protokoll + Leitplanke
```

## Kontrakte

- Aktion (striktes JSON, sonst Retry mit Repair-Prompt, max. 2):
  `{"action":"click|fill|goto|assert|done","target":"...","x":0-1000,"y":0-1000,"text":"..."}`
- Observation: Screenshot (PNG, 1280px) + optional A11y-Snapshot
  (`--obs screenshot|hybrid`); Prompt-Schablone versioniert im Runner.
- Orakel-Ergebnis: `{pass, checks:[{name, pass, detail}]}`; ein Flow gilt
  als bestanden bei alle Checks grün UND `done` vom Agenten.
- CLI: `node tests/e2e/agent/runner.mjs --flows curated.json --model URL
  --reps 3 --out bench-<label>.jsonl [--obs hybrid] [--max-turns 12]`
  (Flags angelehnt an `bench-orchestration.mjs`).
- Env: `AGENT_MODEL_URL` (Default `http://127.0.0.1:1931`),
  `AGENT_BASE_URL` (Default `http://localhost:4321`, lokale Dev-Instanz).

## Kurations-Prinzip

Flows kommen aus existierenden Specs (Tags `@smoke`/`@booking`/`@billing`/
`@messaging`/`@content-hub`/`@admin`); jede `curated.json`-Zeile nennt die
Quell-Spec. Kein neuer Flow ohne Quell-Spec (Nachweis, dass der Pfad
scripted existiert). Korczewski ausgenommen (Brand frozen, T002602).

## Test-Strategie

- `oracle.test.mjs` mit `node --test`: Checks gegen Fixture-Seitenstände
  (URL/Text/State-Tripel), Positiv- und Negativfälle, kein Browser.
- Rot→grün-Nachweis im Tests-Partial (`expected: FAIL` + echter Runner).
- Runner selbst wird per Smoke-Flow gegen die lokale Dev-Instanz
  verifiziert (1 Flow, 1 Rep) — kein Mock-Browser.

## Referenzen (exploriert, A.1)

- `scripts/llm/bench-orchestration.mjs` (213 Zeilen, Agent-Bench-Vorbild)
- `tests/e2e/playwright.config.ts` (Projekte website/services/smoke/…),
  `tests/e2e/specs/` (148 Specs, Tags, 49 FA-Blöcke)
- `docs/runbooks/freetoken-native.md` (T900009: FreeToken-HTTP ohne Vision →
  llama-server ist der Serve-Pfad), `scripts/llm/loadouts.json`
- Messevidenz: Unsloth E4B antwortet direkt (287 Tok/5,2 s), Hauhau mit
  ~300–400 Thinking-Overhead (Training-Memory-Ledger, 2026-10-09)
