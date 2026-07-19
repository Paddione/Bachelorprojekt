---
ticket_id: T001980
plan_ref: openspec/changes/factory-eval-scale/tasks.md
status: active
date: 2026-07-19
---

# factory-eval-scale — Design Spec

## Kontext & Warum

Quelle: Agentic-Trends-Radar 2026-07-19, Trend "Eval-getriebene Entwicklung" (Verdict: trial, Aufwand M), Ticket T001980.

Änderungen am Agenten-Setup (Modell-Quants, Fallback-Logik, Review-Prompts, AGENTS.md) rollen heute ungemessen aus — der iq4→hq-Fallback (PR #2976) war reine Symptom-Reaktion. `scripts/factory/eval.mjs` existiert als deterministischer Golden-Fixture-Scorer (167 Z., 3 Fixtures), hat aber drei Lücken: (a) `touchedFiles` kommen aus dem Live-Git-Diff statt aus einem reproduzierbaren Lauf, (b) die `tests`-Kommandos der Fixtures werden nicht ausgeführt (`testResults` hartcodiert `[true]`, eval.mjs:125), (c) es gibt keinen Weg, das Agenten-Setup *gegen* die Fixtures laufen zu lassen (Replay).

## Was gebaut wird

Drei Bausteine, die den bestehenden Harness zu einem nutzbaren privaten Benchmark machen:

1. **Fixture-Generator** `scripts/factory/eval-gen.mjs` — halbautomatisch aus gemergten Factory-Tickets.
2. **Replay-Modus** in `eval.mjs` — Factory-Implement auf Fixture-Ticket im Worktree@`base_commit`, Diff scoren.
3. **Score-Persistierung** als verify-Phase-Event + Doku als advisory Pflicht-Schritt.

### Entscheidungen (Brainstorming-Ergebnis)

| # | Entscheidung | Begründung |
|---|---|---|
| E1 | **Generator ist halbautomatisch:** `task factory:eval:gen -- <TICKET_EXT_ID>` erzeugt einen Fixture-Vorschlag (`ticket.json` aus DB-Ticket, `expected.json.files` aus `gh pr diff --name-only` des verlinkten PRs, `base_commit` = Merge-Base des PR), den der Mensch kuratiert (min_recall/min_precision, forbidden, tests). Kein Bulk-Vollautomat. | Vollautomatik riskiert Fixture-Müll und Overfitting (Radar-Risiko). Quellen-Selektion: Tickets mit `factory_phase_events.driver='factory'` und PR-Link (`ticket_links.kind='pr'`). Bevorzugt Bug-Tickets. |
| E2 | **Fixture-Schema wird erweitert** um `meta.json` (`{ base_commit, pr_number, generated_at, source: "eval-gen" }`) neben den bestehenden `ticket.json`/`expected.json` — bestehende 3 Fixtures bleiben gültig (meta optional, Fallback: aktueller HEAD). | Abwärtskompatibel; `base_commit` ist die Voraussetzung für reproduzierbares Replay (Radar-Risiko "Replays brauchen den damaligen Base-Commit, sonst falsch-negativ"). |
| E3 | **Replay-Modus `node scripts/factory/eval.mjs --replay [--fixture <id>]`:** pro Fixture ephemerer Worktree auf `meta.base_commit` (via `git worktree add --detach`), dann Implement-Aufruf über die bestehende Factory-Implement-Maschinerie (opencode-Run mit Implementer-Agent, gleiche Invocation wie `pipeline.js` sie nutzt), danach `git diff --name-only` im Worktree scoren, Worktree entsorgen. Ohne `--replay` bleibt das heutige Verhalten (Live-Diff scoren) unverändert. | Replay ist der einzige Weg, das *aktuelle* Agenten-Setup zu messen. Wiederverwendung der pipeline.js-Invocation statt Parallel-Implementierung. Default-Verhalten bleibt stabil (FA-SF-58-Tests brechen nicht). |
| E4 | **Advisory, niemals hartes CI-Gate.** CI bekommt nur einen billigen Hinweis-Step: wenn ein PR `.opencode/agent-models.jsonc`, `scripts/factory/review-*.prompt.md`, `scripts/factory/provider-router.js` oder `AGENTS.md` ändert → `::warning:: Agenten-Setup geändert — lokal 'task factory:eval:replay' ausführen`. Der Replay selbst läuft nur lokal (GPU) — Ergebnis-Disziplin per Doku (AGENTS.md + git-workflow-Skill-Verweis), nicht per CI-Zwang. | 25 Replays = Stunden Wallclock; CI-Runner haben keine GPU/LM-Studio. Radar-Constraint. |
| E5 | **Score-Persistierung ohne Schema-Migration:** Replay-Läufe schreiben pro Gesamtlauf ein Event `ticket.sh phase <ext_id> verify done --detail 'eval: {"overall":0.72,"pass":18,"fail":4,"fixtures":22}' --driver devflow` auf ein dediziertes Eval-Tracking-Ticket ODER — einfacher und gewählt — die Scorecard bleibt SSOT in `docs/factory-eval/scorecard-*.json` + `latest.json`, und `pipeline.js` schreibt beim regulären Verify zusätzlich den Per-Ticket-Eval-Kontext, WENN eine Fixture zum Ticket existiert. Konkret: `factory_phase_events.detail` ist TEXT — der Score wird als kompakter JSON-String eingebettet; der Factory-Floor (`getTicketDetail`, factory-floor.ts:383-395) zeigt ihn ohne Frontend-Änderung. | Keine TEXT→JSONB-Migration nötig (Aufwandsdeckelung M); Floor-Sichtbarkeit gratis. |
| E6 | **`tests`-Ausführung bleibt out of scope** (testResults weiterhin nicht ausgeführt, aber als bekannte Lücke im README dokumentiert). | Scope-Deckelung: Test-Ausführung im Replay-Worktree erfordert Umgebungs-Setup pro historischem Commit — eigenes Follow-up, wenn der Benchmark sich bewährt. |
| E7 | **Ziel ~25 Fixtures ist Kurations-Arbeit, nicht Teil dieses PRs.** Der PR liefert Generator + Replay + Doku + ~5 neu generierte, kuratierte Beispiel-Fixtures als Proof; der Rest wächst über den dokumentierten Workflow. | Ehrliche Abgrenzung — 22 Fixtures in einem PR wären ungeprüfte Massenware (Radar-Risiko "Fixture-Müll"). |

### Ausdrücklich NICHT in Scope

- TEXT→JSONB-Migration von `factory_phase_events.detail`.
- Ausführung der `tests`-Kommandos im Replay (E6, Follow-up).
- Frontend-Änderungen am Factory-Floor.
- Hartes CI-Gate / nightly GPU-Runs (spätere Option, wenn sich der Benchmark bewährt).

## Betroffene Dateien

| Datei | Zeilen (ist) | Änderung |
|---|---|---|
| `scripts/factory/eval-gen.mjs` | neu | Generator (~120-160 Z.) |
| `scripts/factory/eval.mjs` | 167 | `--replay`-Modus, meta.json-Support (Achtung S1-Budget) |
| `Taskfile.factory.yml` | 135 | `factory:eval:gen`, `factory:eval:replay` |
| `.github/workflows/ci.yml` | 521 | Advisory Hinweis-Step bei Agenten-Setup-Pfaden |
| `scripts/factory/pipeline.js` | 767 | verify-phaseEvent mit Eval-Kontext bei vorhandener Fixture (Achtung: Datei groß, zeilenneutral arbeiten oder minimal) |
| `scripts/factory/README.md` | 243 | Eval-Sektion (fehlt heute) |
| `AGENTS.md` | 258 | Advisory Pflicht-Schritt dokumentieren |
| `tests/local/FA-SF-*.bats` → `tests/spec/software-factory.bats` | 3520 | Generator-/Replay-Struktur-Tests (neben FA-SF-58) |
| `tests/factory-eval/fixtures/*` | — | ~5 neue kuratierte Fixtures + meta.json |
| `openspec/changes/factory-eval-scale/specs/software-factory.md` | neu | Delta-Spec (Parent-SSOT: software-factory) |

## Akzeptanzkriterien

1. `task factory:eval:gen -- T000725` erzeugt einen Fixture-Vorschlag mit `ticket.json`, `expected.json`-Skeleton (files aus PR-Diff) und `meta.json` (base_commit, pr_number) — ohne bestehende Fixtures zu überschreiben.
2. `node scripts/factory/eval.mjs` (ohne Flags) verhält sich exakt wie heute (FA-SF-58 bleibt grün).
3. `node scripts/factory/eval.mjs --replay --fixture <id> --dry-run` baut den Worktree@base_commit auf und wieder ab, ohne LLM-Aufruf (dry-run-Pfad für Tests).
4. Scorecard enthält pro Fixture `mode: "replay"|"live"` und `base_commit`.
5. PR, der `agent-models.jsonc` ändert → CI-`::warning::` mit Replay-Hinweis; PR ohne Agenten-Setup-Dateien → kein Hinweis.
6. README + AGENTS.md dokumentieren den Workflow (wann Replay Pflicht ist, wie Fixtures kuratiert werden).

## Risiken

- Fixture-Pflege als Solo-Dev → Generator senkt die Kosten, Kurations-Pflicht bleibt (E1/E7).
- Overfitting auf den Benchmark / File-Set als grober Proxy → im README als Caveat dokumentieren: Trace-Reading bleibt Pflicht (Sentry-Caveat aus dem Radar).
- Replay-Worktrees mit git-crypt: Worktree-Erstellung MUSS `scripts/worktree-create.sh`-Semantik bzw. detached-read-only-Pfad nutzen, sonst Secrets-Smudge-Fehler.
- pipeline.js ist 767 Zeilen — Änderungen dort minimal halten (S1-Ratchet).
