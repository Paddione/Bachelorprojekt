# Proposal: factory-eval-scale

## Why

Änderungen am Agenten-Setup (Modell-Quants, Fallback-Logik, Review-Prompts, AGENTS.md) rollen ungemessen aus — der iq4→hq-Fallback (PR #2976) war reine Symptom-Reaktion. `scripts/factory/eval.mjs` existiert als deterministischer Golden-Fixture-Scorer (3 Fixtures), kann aber weder das aktuelle Agenten-Setup gegen die Fixtures laufen lassen (kein Replay) noch skaliert die Fixture-Erstellung (reine Handarbeit). Öffentliche Benchmarks sind als Entscheidungsbasis unbrauchbar (gesättigt/kontaminiert); lokale GPU-Inferenz macht einen privaten Benchmark praktisch kostenlos (nur Wallclock). Quelle: Agentic-Trends-Radar 2026-07-19, Trend "Eval-getriebene Entwicklung" (Verdict trial, Aufwand M).

## What

Drei Bausteine auf dem bestehenden Harness:

1. **Fixture-Generator** `scripts/factory/eval-gen.mjs` (`task factory:eval:gen -- <TICKET_EXT_ID>`): erzeugt aus einem gemergten Factory-Ticket (`factory_phase_events.driver='factory'`, PR via `ticket_links.kind='pr'`) einen kuratierbaren Fixture-Vorschlag — `ticket.json` aus der DB, `expected.json`-Skeleton aus `gh pr diff --name-only`, `meta.json` mit `base_commit`/`pr_number`. Halbautomatisch: der Mensch kuratiert Schwellwerte/forbidden/tests. ~5 kuratierte Beispiel-Fixtures im PR; Ziel ~25 wächst über den dokumentierten Workflow.
2. **Replay-Modus** `node scripts/factory/eval.mjs --replay [--fixture <id>] [--dry-run]`: pro Fixture ephemerer Worktree auf `meta.base_commit`, Implement über die bestehende Factory-Invocation, Diff scoren, Worktree entsorgen. Default-Verhalten ohne `--replay` bleibt unverändert (FA-SF-58 bleibt grün). Scorecard erhält `mode` und `base_commit`.
3. **Score-Persistierung + advisory Gate**: Eval-Kontext als kompakter JSON-String in `factory_phase_events.detail` (TEXT, keine Migration; Floor zeigt es ohne Frontend-Änderung). CI warnt advisory (`::warning::`), wenn ein PR Agenten-Setup-Dateien ändert (`.opencode/agent-models.jsonc`, `scripts/factory/review-*.prompt.md`, `scripts/factory/provider-router.js`, `AGENTS.md`) — der Replay selbst läuft nur lokal (GPU), Disziplin per Doku in AGENTS.md + `scripts/factory/README.md`. Niemals hartes CI-Gate.

Out of scope: TEXT→JSONB-Migration, Ausführung der `tests`-Kommandos im Replay, Frontend-Änderungen, nightly GPU-Runs. Design-Spec: `docs/superpowers/specs/2026-07-19-factory-eval-scale-design.md`.

_Ticket: T001980_
