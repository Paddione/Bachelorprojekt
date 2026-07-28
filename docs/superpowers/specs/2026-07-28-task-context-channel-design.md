---
title: Gemeinsamer Task-Kontext-Kanal für Factory und dev-flow-execute
ticket_id: T002420
domains: [factory, test, infra]
status: approved
date: 2026-07-28
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Gemeinsamer Task-Kontext-Kanal

## Purpose

Implementer-Agenten sollen über beide Ausführungspfade denselben, vollständigen Task-Kontext
erhalten. Heute divergieren die Pfade stark, und der Hochdurchsatz-Pfad ist der schlechter
versorgte.

## Ausgangsbefund

Drei Messungen am Bestand (2026-07-28):

1. **Die Pfade versorgen unterschiedlich.** `dev-flow-execute` injiziert `intel.json` als
   Pflicht-Kontext (`SKILL.md:69–72`) plus Plan, Attachments und Ticket-ID. Die Factory kennt
   genau eine Quelle — `scripts/factory/task-source.cjs`: *"OpenSpec tasks.md is the only accepted
   source"*. Der Factory-Worker bekommt den Plan und sonst nichts.

2. **Das Bundle existiert fast nie.** 12 von 127 Changes tragen ein `intel.json` (9 %).

3. **Der Ausfall ist unsichtbar.** `dev-flow-plan-phases.md:114` verschiebt das Bundle mit
   `2>/dev/null || true`. Fehlt es, läuft alles weiter.

Ursache von (2): Es gibt einen *Filter* (`scripts/plan-intel-filter.sh`), aber keinen *Generator*.
Das Befüllen ist Prosa-Anweisung an den LLM-Orchestrator — sechs Quellen von Hand abfragen
(codebase-memory, LSP-Hover, `mcp-postgres`, context7, `wc -l`, `baseline.json`). Das kostet viele
Tool-Calls im teuersten Kontext, der existiert, und wird deshalb übersprungen.

Daraus folgt die Problemstellung: Das ist kein Retrieval-Problem und keine Backend-Frage. Der
Kanal, über den Kontext beim Factory-Agenten ankommt, existiert schlicht nicht.

## Entscheidungen

### E1 — Ein gemeinsamer Kanal für beide Konsumenten

Ein Assembler, den Factory und `dev-flow-execute` aufrufen. Alternative wäre gewesen, nur den
Factory-Pfad zu heilen; das hätte die Divergenz konserviert.

### E2 — Hybrid: statischer Kern, frische Ergänzung

| Teil | Zeitpunkt | Eigenschaft |
|---|---|---|
| Kern (`intel.json`) | Plan-Zeit | committet, im PR reviewbar, deterministisch |
| Ergänzung | Dispatch-Zeit | fail-soft, aktuell |

Begründung: Die Factory retryt (`fix/factory-attempt-counter-T002389`) und besitzt eine
Eval-Infrastruktur (`scripts/factory/eval.mjs`, `eval-replay.mjs`, `eval-context.cjs`). Ein
Kontext, der sich bei jedem Retry ändert, macht Replay bedeutungslos und fehlgeschlagene Partials
unreproduzierbar. Rein statisch wäre dagegen veraltet gewesen — Pläne liegen teils tagelang als
`plan_staged`, bevor die Factory sie zieht.

**Folge für das Failover:** Der statische Kern trägt den Agenten auch bei totem Embedding-Dienst.
Damit ist CPU-Failover-Serving entkoppelt und kein Teil dieses Vorhabens.

### E3 — Generator statt Zwang

Ein Skript füllt die mechanisch ableitbaren Sektionen; das Gate prüft anschließend
Vollständigkeit. Die Alternative (nur ein fail-closed Gate) hätte die Handarbeit nicht verlagert,
sondern erzwungen — mit dem absehbaren Ausweichverhalten, das Bundle pro forma leer zu füllen.

Vier der sechs Sektionen sind ohne LLM ableitbar: `impact_files`/`s1_*` aus `wc -l` +
`baseline.json` + der `_ext_limit`-Tabelle, `db_tables` aus `information_schema`,
`symbols`/`call_graph` aus codebase-memory. Nur `api_contracts` und `external_types` brauchen
Urteilsvermögen und bleiben beim Planner.

### E4 — Kern hart, Ergänzung weich, nichts still

Fehlt oder ist der Kern unvollständig, bricht der Assembler mit Exit 1 ab. Fällt ein frisches
Signal aus, erscheint ein sichtbarer Marker im Output statt einer weggelassenen Sektion.

Begründung: Ein still fehlschlagender Pflichtschritt *ist* ein optionaler Schritt — genau das
erzeugt die 9-%-Quote. Und ein Agent, der weiß, dass er blind ist, verhält sich anders als einer,
der Blindheit für Abwesenheit von Gefahr hält. Der Gegenbeleg steht im Repo: `_role_allowlist()`
in `plan-context.sh` fällt bei unbekannter Rolle fail-soft auf `__ALL__` und reichte bei T002322
still *alle* Proposals durch — der Rollenfilter wirkte gar nicht.

## Komponenten

### `scripts/plan-intel.sh <slug>`

Generator für den statischen Kern. Füllt deterministisch:

- `impact_files` + `s1_limit` / `s1_baseline` / `s1_budget` — `wc -l`, `docs/code-quality/baseline.json`, `_ext_limit`
- `db_tables` — `information_schema.columns`, read-only
- `symbols` / `call_graph` — codebase-memory über die Zieldateien

Nicht erreichbare Quelle → `risks[]`-Eintrag mit `severity: warn` (bestehende PIB-Konvention),
nicht stilles Leerlassen.

### `scripts/task-context.sh <slug> [--partial pX]`

Assembler. Gibt einen Markdown-Block aus, den beide Konsumenten vor den Agent-Prompt hängen.

Kern: `intel.json`, zugeschnitten über das bestehende `plan-intel-filter.sh` — das Skript bleibt
unverändert und wird wiederverwendet.

Frische Signale, jedes fail-soft und einzeln mit 5 s Timeout begrenzt (derselbe Wert, den
`plan-context.sh:154` für den Suchaufruf bereits verwendet). Der Assembler darf einen Dispatch
also um höchstens 15 s verzögern:

1. **Parallele Arbeit** — `agent-lock.sh list`, gefiltert auf Locks, deren Branch die eigenen
   `target_files` berührt.
2. **main-Drift** — `git diff --stat <plan-base>..origin/main -- <target_files>`. Beantwortet, ob
   sich der Boden bewegt hat, während der Plan lag.
3. **Ähnliche Changes** — `/api/openspec/search`, der bereits gebaute, aber nirgends aufgerufene
   Pfad aus `plan-context.sh:152–163`.

### plan-lint-Regel I1

Prüft Vollständigkeit statt Existenz: `intel.json` vorhanden, `meta`/`impact_files`/`symbols` nicht
leer, und die `impact_files`-Pfade decken die Union der `target_files` aus dem Partial-Manifest ab.

### Verdrahtung

| Konsument | Änderung |
|---|---|
| Factory | Prompt-Aufbau in `pipeline.mjs` ruft `task-context.sh`. `task-source.cjs` bleibt unangetastet — `tasks.md` ist weiter die Plan-Quelle. |
| `dev-flow-execute` | Schritt 2 ersetzt die Prosa-Anweisung durch den Skript-Aufruf. |
| `dev-flow-plan` | Phase A.1.5 ruft `plan-intel.sh`, statt den Orchestrator die sechs Quellen von Hand abfragen zu lassen. |

## Tests

`tests/spec/dev-flow-plan/task-context.bats` — eigene Datei im Spec-Verzeichnis, **nicht** angehängt
an die Sammeldatei `tests/spec/dev-flow-plan.bats` (T002416, CLAUDE.md:153). Genau dieses Vorhaben
ist der Anlassfall: vier Partials, deren Test-Partial sonst am Dateiende mit jeder Parallelarbeit
kollidiert. Keine ticket-nummerierten Dateien.

Negativtests brauchen einen Positiv-Anker im selben Test (T002356-M1): erst prüfen, dass der
gültige Fall durchläuft, dann die Negativ-Aussage — sonst besteht der Test vakuos gegen eine leere
Kandidatenliste.

`$output`-Matching wird auf die relevante Ausgabezeile eingegrenzt, nicht unqualifiziert gegen
stdout+stderr geprüft (CLAUDE.md, BATS-Konvention): der Worktree-Verzeichnisname leitet sich vom
Change-Slug ab und kann ein `$0`-haltiges Usage-Banner zufällig matchen.

## Ausdrücklich nicht in diesem Vorhaben

| Thema | Begründung |
|---|---|
| ADR „pgvector bleibt" | Eigenes Ticket. Die Embeddings liegen in derselben Postgres wie `tickets` und `knowledge.documents`; ein Wechsel kostet transaktionale Konsistenz und einen zweiten Backup-Pfad, bei ~10⁴–10⁵ Vektoren ohne Gegenwert. Entscheidung, kein Bauvorhaben. |
| CPU-Failover Embedding/Rerank (Hetzner 8C/16GB) | Eigenes Ticket. Durch E2 entkoppelt. |

## Umfang

Vier Partials mit disjunkten Zieldateien: Generator, Assembler, Gate + Verdrahtung, Tests.
