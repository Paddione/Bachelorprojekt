---
title: "p6 — Report, Gate und Korpus-Export"
ticket_id: T900561
domains: [llm-local-dev, unsloth-eval-harness]
status: active
---

# p6 — Report, Gate und Korpus-Export

Files: `scripts/llm/agent-bench/lib/report.mjs`, `scripts/llm/agent-bench/lib/corpus.mjs` (beide neu, rein
auf Laufdaten unter `$AGENT_BENCH_RUNS/<run-id>/`).

## Task 6.1: Report (`report.mjs`)

`buildReport(runDir)` → `{ json, markdown }`:
- **Marginal-Score** je (Rolle, Modell): Mittel über alle Partner und Varianten ohne `infra_error`; in der Kette ist der Planner-Outcome das Mittel der `execute`-Outcomes seiner Pläne.
- **Kompatibilitätsmatrix** Planner × Ausführung und Code-Worker × Reviewer: Zelle = Mittelwert der Kombination − (Marginal A + Marginal B − Gesamtmittel).
- **Entdeckungen**: Kombinationen, deren Score höher ist als jede homogene Belegung ihrer Mitglieder.
- **Infrastruktur-Fehler** als eigene Tabelle, nie im Score.
- Kopf mit Revision, Scoring-Version, Profil, Seed, `sampled`, Server-Kommandozeilen und dem ausführbaren `bench.mjs run …`-Befehl (Mess-Konvention aus `CLAUDE.md`).

## Task 6.2: Gate

`gate(runDir, baselineDir)`: nur Fälle mit `split: eval`; bei ungleicher `scoring_version` Fehler
(Exit 2 in p4). Je (Rolle, Variante) Differenz neu − alt; Rauschschwelle je Rolle = 2 × Standardabweichung
der Wiederholungen in der Baseline (Minimum 5 Punkte, wenn die Baseline nur 1 Rep hat). Regression, wenn
das Rollenmittel um mehr als die Schwelle sinkt. Rückgabe `{ ok, regressions: [{ role, delta, threshold }] }`.

## Task 6.3: Korpus-Export (`corpus.mjs`)

`exportCorpus(runDirs, outDir)`:
- Nur Fälle mit `split: train` (Split aus `case.json` im Manifest-Snapshot), Requirement "Eval cases never reach the corpus".
- Je (Variante, Rolle): beste Trajektorie mit `outcome === 1 && errors === 0 && detours === 0`, bei Gleichstand weniger Token → `sft.jsonl`, eine Zeile `{ messages, tools, meta: { case, source_ref, perspective, role, model, scoring_version, run_id } }` aus dem Trace (letzte Anfrage + Antwort der Rolle, Tool-Runden vollständig).
- `preferences.jsonl`: `{ prompt_messages, chosen, rejected, meta }` aus bester und schlechtester Trajektorie derselben (Variante, Rolle), wenn sich ihre Scores unterscheiden.
- `gaps.json`: (Variante, Rolle) ohne saubere Trajektorie.
- Bildreferenzen bleiben `image_ref`; Bilddateien werden nach `outDir/images/` kopiert.

Akzeptanz: `node --check`; p9-Tests "Infrastructure error is not blamed on the model", "Mixed
combination is highlighted", "Regression fails the gate", "Mismatched scoring version is refused",
"Eval cases never reach the corpus", "Trajectory with a detour is not exported as ideal".
