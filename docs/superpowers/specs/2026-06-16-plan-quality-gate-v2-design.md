---
ticket_id: null
plan_ref: null
status: active
date: 2026-06-16
domains: factory, pm, infra
---

# Design: Plan-Quality-Gate v2 — deterministischer fail-closed Plan-Linter

**Datum:** 2026-06-16
**Status:** Entwurf (brainstorming → review-Gate)
**Domains:** factory, pm, infra

## Problem

Die `dev-flow-*`- und Factory-Skills erzeugen Implementierungspläne, deren Qualität
heute am brüchigsten Glied der Kette hängt: dem **DeepSeek-LLM-QA**
(`scripts/plan-qa-check.sh`). Eine Pipeline-Karte (2026-06-16) fand acht konkrete Lücken,
die sich zu zwei Themen bündeln:

**Thema A — Plan-Qualitätsgates schwach, umgehbar, inkonsistent:**

1. **Factory umgeht das Gate komplett.** `scripts/factory/pipeline.js` (Plan-Phase) ruft
   weder `superpowers:writing-plans` noch `plan-qa-check.sh` noch `plan-quality-gates.md`
   auf. Der **autonome Pfad ist der am wenigsten geprüfte**.
2. **LLM-QA fail-opent.** `plan-qa-check.sh` gibt ohne `DEEPSEEK_API_KEY`/`ANTHROPIC_API_KEY`
   Exit 0 (nur Warnung) und „fixt" gefundene Lücken durch **Anhängen einer Prosa-Sektion**
   statt echter Task-Korrektur — ein FAIL→PASS ohne reale Verbesserung.
3. **`dev-flow-chore`** hat null Plan-Gating (nur eine Prosa-Erinnerung an `freshness:check`).
4. **`dev-flow-batch`** lässt die QA pro generiertem Plan aus.
5. **S1–S4-Budgets werden erst in CI/execute geprüft, nie zur Plan-Zeit.** Pläne berichten
   ihre Zeilenbudgets **selbst** (Subagent läuft `wc -l`/`jq baseline`); niemand rechnet
   nach. Ein Plan kann „Budget +10" falsch behaupten und erst in CI auffliegen.

**Thema B — Informationsfluss in/aus Plänen brüchig:**

6. **Frontmatter-Schema wird nicht erzwungen.** Fehlt `title:`, injiziert
   `scripts/plan-context.sh` einen **leeren „Active plan:"-Header** in den Agenten-Kontext
   (stiller Bug — `plan-context.sh` liest `title:` via awk). Reale Pläne driften im Schema
   (`t000885.md` hat `title:`, `ticket-rich-text.md` nicht).

Die **interaktiv** erzeugten Pläne sind tatsächlich gut. Das Risiko: Qualität ist an ein
umgehbares LLM-Gate gekoppelt, und die **autonomen Pfade** (Factory, Batch, Chore) bekommen
sie gar nicht.

## Ziel

Ein **deterministischer, fail-closed Plan-Linter** als erste, nicht umgehbare
Verteidigungslinie — kein LLM nötig, also nicht API-Key-abhängig und nicht skippbar. Das
bestehende LLM-QA bleibt als **optionale, advisory** zweite Schicht obendrauf (bricht nie).
Der Linter wird **einheitlich in alle planerzeugenden Pfade** verdrahtet. Das erzwungene
Frontmatter-Schema repariert den `plan-context.sh`-Injektions-Bug strukturell.

**Designentscheidungen (User-bestätigt):**
- Linter = hartes Gate (fail-closed). LLM-QA = advisory.
- Verdrahtung in **alle** Pfade (dev-flow-plan, dev-flow-batch, Factory, chore-light).
- B1-Budget: **faktisch falsche** Budgetangabe im Plan blockt; die **strategische**
  Entscheidung „Datei über Schwelle, kein Split-Step" wird nur **gewarnt**.

**Nicht-Ziel (YAGNI):**
- Keine Migration der 211 Alt-Specs (separater OpenSpec-Branch).
- Granularität/Code-Vollständigkeit bleiben **Warnungen**, kein Hard-Block
  (False-Positive-Risiko für deterministische Heuristik zu hoch).

## Ansatz

**Gewählt: A — deterministischer Bash-Linter (`scripts/plan-lint.sh`) + LLM advisory.**

Verworfen:
- **B — LLM-QA reparieren statt ersetzen:** behält semantische Tiefe, bleibt aber
  API-Key-abhängig und nicht-deterministisch → widerspricht „fail-closed".
- **C — beide als gleichwertige Pflicht-Gates:** macht den API-Key zur harten Voraussetzung,
  verlangsamt/verteuert die Pipeline.

Der deterministische Ansatz passt zur dokumentierten agentic-first/deterministisch-bevorzugt-
Präferenz und zum bestehenden S1-Gate-Programm (`docs/code-quality/baseline.json`).

## Architektur

### Komponente 1 — `scripts/plan-lint.sh` (neu)

Eingang: ein Plan-Pfad. Ausgang: menschenlesbarer Report + optional `--json`.
**Exit 1 = hartes Gate** (mindestens ein Hard-Fail). Exit 0 = pass (Warnungen erlaubt).

| ID | Schwere | Check |
|----|---------|-------|
| **F1** | hard | Frontmatter enthält `title`, `ticket_id`, `domains`, `status` |
| **F2** | hard | `domains:` nicht-leer (Rollen-Injektion braucht es) |
| **STRUCT1** | hard | `# … Implementation Plan`-Header + „File Structure"-Sektion vorhanden |
| **STRUCT2** | hard | ≥1 Task mit failing-test-Step (Test-Invocation + `expect FAIL`/rot) |
| **STRUCT3** | hard | Finaler Verify-Task enthält `task test:changed` **und** `task freshness:regenerate` **und** `task freshness:check` |
| **P1** | hard | Keine Platzhalter (`TBD`, `TODO`, `FIXME`, „similar to Task N", „add error handling" als alleinstehender Task) |
| **B1a** | hard | **Budget-Integrität:** für jede im Plan genannte Datei mit selbst-berichtetem Budget die Zahl gegen `baseline.json` + `wc -l` nachrechnen; widerspricht der Plan dem berechneten Wert → FAIL mit Diff |
| **B1b** | warn | **Budget-Strategie:** Datei mit effektivem Restbudget ≤ 0 ohne Split/Shrink-Step → Warnung |
| **G1** | warn | Task berührt >3 Dateien oder hat keinen Code-Block → Granularitäts-Warnung |

**B1-Berechnung (Kernstück):** `baseline.json` hat Keys `S1:<pfad>` mit `metric`
(Ist-Zeilen beim Freeze) und `detail` (z. B. „669 lines > 500 limit (.mjs)"). Für eine
Datei:
- `limit` = aus `detail` geparst (bzw. Default nach Endung, falls nicht gebaselined).
- `effektive_schwelle` = `max(limit, baseline.metric)` — der Ratchet friert auf dem
  gewachsenen Wert ein, jede Netto-Zeile darüber trippt CI.
- `restbudget` = `effektive_schwelle − wc -l(<datei>)`.

Der Linter parst die im Plan behaupteten Budgetzahlen (S1-Tabelle / `Files:`-Zeilen) und
vergleicht sie mit der eigenen Berechnung. **Abweichung = B1a (hard).** `restbudget ≤ 0`
ohne erkennbaren Split/Shrink-Step = B1b (warn).

**Ausgabeformat:** Tabellarisch (`✓`/`⚠`/`✗` pro Check) + abschließende Zeile
`PLAN-LINT: PASS|FAIL (<n> hard, <m> warn)`. `--json` liefert `{verdict, hard:[…], warn:[…]}`
für die Factory-Integration.

### Komponente 2 — Frontmatter-Schema-Enforcement

`scripts/vda.sh frontmatter` (aufgerufen via `plan-frontmatter-hook.sh`-Shim) wird erweitert:
- fehlendes `title:` wird aus dem ersten `# `-H1 des Plans **auto-ergänzt**;
- Schema-Validierung (`title`/`ticket_id`/`domains`/`status` vorhanden) gibt bei Verstoß
  Exit 1. Behebt den stillen `plan-context.sh`-Injektions-Bug strukturell.

### Komponente 3 — Einheitliche Verdrahtung

| Pfad | Integration |
|------|-------------|
| `dev-flow-plan` Schritt 3.8 | `plan-lint.sh` **vor** `plan-qa-check.sh` als hartes Gate; LLM-QA danach advisory (bricht nie) |
| `dev-flow-batch` | `plan-lint.sh` pro generiertem Plan in der Workflow-Pipeline |
| Factory `pipeline.js` Plan-Phase | nach Plan-/Task-Generierung `plan-lint.sh --json` shell-out; bei FAIL eine Fix-Iteration, sonst Enqueue blockiert + Ticket-Kommentar mit den Hard-Fails |
| `dev-flow-chore` | chore-light: bei code-berührendem Chore S1-Budget-Preview der Touched-Files (Chores haben keinen Plan → Diff statt Plan prüfen) |

### Komponente 4 — Tests

BATS-Suite `tests/unit/plan-lint.bats` (offline-safe) mit Fixtures unter
`tests/fixtures/plan-lint/`:
- guter Plan → PASS;
- fehlendes `title:` → F1-Fail;
- falsch behauptetes Budget → B1a-Fail;
- fehlender Verify-Task → STRUCT3-Fail;
- Platzhalter `TODO` → P1-Fail;
- Datei über Schwelle ohne Split → B1b-Warnung (Exit 0, Warn-Count ≥ 1).

Wired in `task test:factory`/`test:all`; nach Test-Add `task test:inventory` + Commit.

## Datenfluss

**In den Linter:** Plan-Markdown · `docs/code-quality/baseline.json` · `wc -l` der Live-Dateien.
**Aus dem Linter:** Exit-Code (Gate) · Text/JSON-Report · (Factory) Ticket-Kommentar bei FAIL.
**Reparierter Fluss:** Frontmatter-`title:` garantiert → `plan-context.sh` injiziert korrekte
„Active plan:"-Header in nachgelagerte Agenten.

## Fehlerbehandlung

- Linter ist **fail-closed**: Parse-Fehler/fehlende `baseline.json` → Hard-Fail mit klarer
  Meldung (nicht still durchlassen).
- LLM-QA bleibt **fail-open** (advisory) — kein Key → übersprungen mit Hinweis.
- Factory: Linter-FAIL nach einer Fix-Iteration → Ticket bleibt aus der Queue, Kommentar
  dokumentiert die Hard-Fails (kein stilles Enqueue eines schlechten Plans).

## Komponentengrenzen

- `plan-lint.sh` ist ein **pures, einzeln testbares CLI** (Plan-Pfad rein → Verdict raus),
  ohne Abhängigkeit zu DB/Cluster/Netz → läuft offline in CI.
- Die Verdrahtungspunkte rufen es nur auf und reagieren auf den Exit-Code; keine Logik-
  Duplikation in den Skills.
