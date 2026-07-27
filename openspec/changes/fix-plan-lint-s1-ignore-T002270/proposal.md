# Proposal: fix-plan-lint-s1-ignore-T002270

## Why

`docs/code-quality/gates.yaml` beschreibt das S1-Gate in **zwei** Sektionen:
`s1.limits` (Zeilenlimit je Dateiendung) und `s1.ignore` (Dateien, die das Gate
bewusst **nicht** misst). `scripts/plan-lint.sh` liest davon nur die erste — der
Loader `_load_s1_limits` fragt ausschließlich `.s1.limits` ab.

Für eine Datei auf der Ignore-Liste rechnet `effective_threshold` deshalb weiter
gegen das statische Endungs-Limit. Und weil genau diese Dateien *auf der Liste
stehen, weil sie das Limit überschreiten*, fällt das Ergebnis stark negativ aus:

| Datei | Zeilen | Limit | berechnetes Budget |
|-------|--------|-------|--------------------|
| `scripts/ticket.sh` | 866 | 500 | −366 |
| `website/src/lib/billing-db.ts` | 618 | 600 | −18 |
| `scripts/factory/pipeline.js` | monolithisch | 600 | negativ |

Die Folge: B1b verlangt für jede dieser Dateien einen Split- oder Shrink-Schritt.
Die `gates.yaml`-Kommentare daneben sagen das Gegenteil — `scripts/ticket.sh` ist
dort als sanktioniertes Einzeldatei-CLI mit dem Vermerk „do not split" geführt,
`pipeline.js` als Workflow-Skript, das wegen `meta`-first und fehlendem
dynamischen `import()` gar nicht aufteilbar ist. Der Linter drängt Plan-Autoren
also zu genau der Änderung, die das Repo an anderer Stelle ausdrücklich
ausgeschlossen hat.

Zusätzlich prüft B1a die behauptete Budget-Zahl gegen den falschen Rechenwert:
ein Plan, der für `scripts/ticket.sh` korrekterweise gar kein Budget angibt, ist
in Ordnung — ein Plan, der die vom Linter erwartete −366 einträgt, dokumentiert
eine Schwelle, die es nicht gibt.

## What

`plan-lint.sh` liest künftig auch `s1.ignore` und behandelt gelistete Dateien als
ungated: `residual_budget` liefert für sie einen leeren Wert — dieselbe Antwort
wie für eine nicht existierende Datei. Da B1a und B1b bereits heute leere
Rechenwerte überspringen, entfällt damit sowohl der Split-Zwang als auch die
Budget-Prüfung, ohne dass die Prüflogik selbst umgebaut werden muss.

**Getroffene Design-Entscheidung** (Brainstorming 2026-07-27): das Überspringen
ist nicht ganz stumm. Behauptet ein Plan trotzdem eine Budget-**Zahl** für eine
ignorierte Datei, gibt es eine neue Warnung `W4` mit dem Hinweis, dass die Angabe
bedeutungslos ist. So lernt der Plan-Autor die richtige Notation, ohne dass CI
rot wird — ein Hard-Fail wäre unverhältnismäßig für eine reine Tabellenspalte.

Nicht-Ziele: Die Ignore-Liste selbst wird nicht verändert, und `check.mjs` (das
eigentliche S1-Gate) bleibt unangetastet — es wertet `s1.ignore` bereits korrekt
aus. Diese Änderung gleicht den Linter an das Gate an, nicht umgekehrt.

_Ticket: T002270_
