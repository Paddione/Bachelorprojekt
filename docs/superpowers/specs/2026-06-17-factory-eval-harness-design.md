---
title: "SWE-bench-artige Eval-Harness für die Software Factory"
date: 2026-06-17
status: draft
ticket_id: T000930
plan_ref: null
domains: [factory, test]
---

# SWE-bench-artige Eval-Harness für die Software Factory

## Problem

Die Software Factory ist **orchestrierungsseitig bewiesen** (Scout→Deploy nestet, exit 0 auf
DeepSeek), aber ihre **Build-Qualität ist nie gemessen**. Belege aus der Projekt-Historie:
DeepSeek-Scout lieferte `0 touched_files` auf einem trivialen Real-File-Task; die Memory hält
explizit fest »orchestration proven, build-quality on DeepSeek NOT yet«. `node --check` und
`FA-SF-20` prüfen nur Ladbarkeit, nicht Lösungsgüte. Ohne reproduzierbare Score-Metrik wird
jeder Modell- oder Prompt-Wechsel **blind** getunt — man weiß nicht, ob eine Änderung die
Pipeline besser oder schlechter macht. SWE-agent (19.5k★) und OpenHands (77.4k★) haben genau
das gelöst: eine Eval-Harness, die Agenten-Output gegen bekannte Lösungen **misst**.

## Ziel

- Eine **reproduzierbare Eval-Harness**: kuratierte Fixture-Tickets → Pipeline-Lauf →
  deterministischer **Pass/Fail-Score** pro Fixture + Aggregat-Scorecard.
- **Trend über Zeit** (Scorecard-JSON committed/archiviert), damit Modell-/Prompt-Änderungen
  als +/- sichtbar werden.
- Als Task aufrufbar (`task factory:eval`) und nächtlich/CI-fähig (nicht merge-blockierend).

## Nicht-Ziel

- **Echte SWE-bench-Tasks** (Python-Repos aus GitHub-Issues). Die Factory operiert auf
  **diesem** Repo (Bash/TS/Kustomize), nicht auf beliebigen Fremd-Repos — SWE-benchs
  Fixture-Set überträgt nicht. Wir bauen ein **repo-internes Golden-Set**.
- Live-Prod-Deploys während der Eval (läuft sandboxed/dry, kein `kubectl apply`).
- Automatisches Modell-Tuning/Auto-Promotion auf Basis des Scores (das ist Folge-Arbeit).

## Lösung

### Komponente 1 — Golden-Fixture-Set (`tests/factory-eval/fixtures/`)

Eine kleine, kuratierte Menge **abgeschlossener** Tickets dieses Repos als Regressions-Fixtures.
Jede Fixture ist ein Ordner:

```
tests/factory-eval/fixtures/<id>/
  ticket.json        # synthetisches Ticket (title, description, type) — der Pipeline-Input
  expected.json      # Erwartungen: muss-berührte Dateien (Glob), verbotene Dateien,
                      # erwartete Test-Kommandos, optional Referenz-Diff
  setup.sh           # (optional) stellt den Pre-State her (auf einem sauberen Worktree-Commit)
```

Startset: 3–5 Fixtures, von trivial (eine Datei, ein Helper) bis mittel (Multi-File-Feature mit
Test). Quelle = reale, bereits gemergte Tickets, deren Diff bekannt ist.

### Komponente 2 — Runner (`scripts/factory/eval.mjs`, exponiert als `task factory:eval`)

Pro Fixture:

1. Frischen Eval-Worktree auf einem Pinned-Base-Commit erstellen (`scripts/worktree-create.sh`).
2. Pipeline **sandboxed** über die Fixture als Ticket-Input laufen lassen (dry: Build ja,
   Deploy nein — nutzt den bestehenden `dry_run`-Pfad).
3. Resultierenden Diff einsammeln und gegen `expected.json` scoren (Komponente 3).
4. Worktree verwerfen.

Sequenziell oder begrenzt-parallel (Slot-Cap wie die Factory). Schreibt `scorecard-<ts>.json`.

### Komponente 3 — Scoring (deterministisch, fail-closed)

Mehrdimensionaler Score statt Einzelzahl — bewusst transparent:

| Dimension | Messung |
|---|---|
| **Lokalisierung** | Precision/Recall der berührten Dateien vs. `expected.files` (Glob) |
| **Scope-Disziplin** | Strafpunkte für Treffer in `expected.forbidden` (z. B. Registry-Dateien) |
| **Test-Grün** | Laufen die in `expected.tests` genannten Kommandos grün? (binär, härtester Faktor) |
| **Diff-Nähe** | (optional) Ähnlichkeit zum Referenz-Diff — informativ, nicht Pass-Gate |

`pass = Test-Grün AND Lokalisierungs-Recall ≥ Schwelle AND keine forbidden-Treffer`. Die
Scorecard hält pro Fixture alle Roh-Dimensionen + den Aggregat-Pass-Rate fest.

### Komponente 4 — Trend & Sichtbarkeit

`scorecard-<ts>.json` wird unter `docs/factory-eval/` archiviert; ein schlanker `latest.json`
+ optionaler Cockpit-Badge (»Factory-Build-Score: 4/5«) macht Regressionen sichtbar. Nächtlicher
GH-Action-Lauf (informativ, **nicht** required) hält den Trend fortgeschrieben.

## Offene Entscheidungen (autonom gewählt, hier dokumentiert)

| # | Entscheidung | Gewählt | Alternative |
|---|---|---|---|
| 1 | Fixture-Quelle | **Repo-internes Golden-Set** | Externe SWE-bench-Tasks (verworfen: überträgt nicht) |
| 2 | Pass-Kriterium | **Test-grün + Lokalisierungs-Recall + Scope-Disziplin** | Reine Diff-Ähnlichkeit (verworfen: zu fragil) |
| 3 | Lauf-Ort | **Lokal + nächtlich, nicht merge-blockierend** | Required CI-Gate (verworfen: DeepSeek-Varianz/Kosten) |
| 4 | Pipeline-Modus | **Bestehender `dry_run` (Build, kein Deploy)** | Echte Deploys (verworfen: Prod-Risiko) |

## Erfolgskriterien

- `task factory:eval` läuft das Golden-Set durch und schreibt eine Scorecard mit Pass/Fail je
  Fixture + Aggregat — reproduzierbar (gleiches Modell + gleicher Base-Commit → gleicher Score
  bis auf dokumentierte LLM-Varianz).
- Mindestens **3 Fixtures** (trivial → mittel) aus realen gemergten Tickets vorhanden.
- Ein bewusster Pipeline-Regress (z. B. Scout-Prompt verschlechtern) senkt den Score messbar —
  die Harness ist also **diskriminativ**, nicht immer-grün.
- Runner + Scoring als Tests, in `task test:factory` verdrahtet (offline-safe Scoring-Unit-Tests;
  der echte Pipeline-Lauf bleibt opt-in/nightly).

## Verwandte Tickets

- **T000931 (ACI)** — die ACI-Schicht soll die Scout-/Build-Qualität *heben*; **diese Harness
  ist die Messlatte, an der sich das beweist**. Eng gekoppeltes Paar: ACI ändert, Eval misst.
- T000911 (Scout-Quality-Detector) — heuristischer Inline-Check; die Eval-Harness ist die
  reproduzierbare Offline-Ergänzung dazu.
