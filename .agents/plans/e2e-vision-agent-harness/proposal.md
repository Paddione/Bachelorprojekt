# Proposal: e2e-vision-agent-harness

Ticket: T901645 · Slug: `e2e-vision-agent-harness` · Pfad: feature

## WARUM

148 Playwright-Specs in `tests/e2e/specs/` sind als scripted Suite weder
kuratiert noch agentisch nutzbar. Lokale Vision-Modelle (Gemma-4-E4B, beide
GGUF-Varianten mit mmproj verifiziert) können Browser-Flows fahren — aber es
fehlt der Harness: kuratiertes Flow-Set, Agent-Loop (Screenshot → JSON-Aktion
→ Playwright), deterministische Orakel und ein Bench-Protokoll für
Modellvergleiche.

## WAS (MVP-Schnitt, entschieden)

1. **Agent-Runner `tests/e2e/agent/runner.mjs`**: Playwright-Loop mit
   Observation (Screenshot, optional A11y-Snapshot), VLM-Call via
   OpenAI-kompatiblem Endpunkt (Env `AGENT_MODEL_URL`), strikter
   JSON-Aktionskontrakt (`click/fill/goto/assert/done` + `x/y`-Koordinaten
   0–1000), Turn-Limit, JSONL-Ergebnis pro Lauf. Vorbild:
   `scripts/llm/bench-orchestration.mjs` (Agent-Bench mit deterministischen
   Checks, `--reps`, JSONL-Out).
2. **Orakel `tests/e2e/agent/oracle.mjs`**: deterministische Flow-Checks
   (URL + sichtbarer Text + optional API-State), von Runner und Tests geteilt.
3. **Kuratiertes Set `tests/e2e/agent/curated.json`**: SSOT mit 6–8 Flows
   (Smoke + Money-Paths: Login, Booking, Billing, Messaging, Content-Hub,
   Admin-Inbox), je Start-URL, Zielbedingung, Referenz auf die bestehende
   Scripted-Spec als Orakel-Quelle. Schema-Validierung im Runner.
4. **Runbook `docs/runbooks/e2e-vision-agents.md`**: Serve-Befehle
   (llama-server + mmproj, gemessene Fallstricke: Thinking-Bloat-Budget,
   Template-Override), Bench-Protokoll (sequenziell, Reps, Metriken),
   Leitplanke (Agenten nightly/advisory, scripted Specs bleiben CI-Gate).
5. **Tests `tests/e2e/agent/oracle.test.mjs`** (`node --test`): Orakel-Logik
   gegen Fixtures, kein Browser nötig.

## Nicht-Ziele (MVP)

- Kein Modellvergleich als Code (der Bench-Lauf selbst ist ein Experiment,
  kein Repo-Artefakt — nur das Protokoll liegt im Runbook).
- Keine CI-Integration der Agenten-Läufe (advisory first, Gate erst mit
  Stabilitätsdaten in einem Folge-Ticket).
- Keine Änderungen an `tests/e2e/playwright.config.ts` (Runner ist
  eigenständig, keine neuen Projekte nötig).

## Risiken

- Live-Umgebung als Bench-Ziel ist flakeanfällig → Default ist die lokale
  Dev-Instanz (`astro dev`), Live nur explizit per Env.
- VLM-Latenz macht Läufe langsam (5–8 s/Turn gemessen) → Turn-Limit und
  Reps klein halten (3), Timeout pro Flow.
- Thinking-Bloat (Hauhau: ~300–400 Stripped-Tokens/Call) → Runner setzt
  `max_tokens >= 800` und misst Token-Kosten pro Flow mit.
