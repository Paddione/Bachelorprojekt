---
title: "p1 — Intel-Bundle-Generator"
ticket_id: T002420
domains: [factory, infra]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# p1 — Intel-Bundle-Generator

**Zieldatei:** `scripts/plan-intel.sh` (neu, Extension-Limit 500 Zeilen — mit Wachstumsreserve
unter 350 schneiden)

## Zweck

Die mechanisch ableitbaren Sektionen von `intel.json` ohne LLM befüllen. Heute ist das Befüllen
Prosa-Anweisung an den Orchestrator (sechs Quellen von Hand), weshalb das Bundle nur in 12 von 127
Changes existiert.

## Task 1: CLI-Kontrakt

```
scripts/plan-intel.sh <slug> [--target-files <f1,f2,...>] [--out <pfad>]
```

- Ohne `--target-files`: Zieldateien aus dem Partial-Manifest von
  `openspec/changes/<slug>/tasks.md` lesen (`## Partials`-Tabelle, Spalte `target_files`).
- Ohne `--out`: nach `openspec/changes/<slug>/intel.json` schreiben.
- Existiert die Zieldatei bereits, werden `api_contracts` und `external_types` aus ihr
  übernommen — der Generator überschreibt niemals, was der Planner von Hand ergänzt hat.

## Task 2: `impact_files` mit S1-Werten

Pro Zieldatei einen Eintrag mit `path`, `language`, `loc`, `s1_limit`, `s1_baseline`, `s1_budget`.

Die Budget-Arithmetik **nicht neu implementieren**. `scripts/plan-lint.sh` exportiert seine reinen
Funktionen über einen Selbsttest-Hook:

```bash
PLAN_LINT_SELFTEST=1 bash scripts/plan-lint.sh residual_budget <pfad>   # leer = n/a
PLAN_LINT_SELFTEST=1 bash scripts/plan-lint.sh effective_threshold <pfad>
PLAN_LINT_SELFTEST=1 bash scripts/plan-lint.sh _ext_limit <pfad>
```

Leere Ausgabe von `residual_budget` bedeutet „nicht gemessen" (Datei auf `s1.ignore`, ungated und
unbaselined, oder noch nicht existent) — dann `s1_budget: null` schreiben, **nicht** 0. Eine 0
würde vom Plan-Autor als „kein Spielraum" gelesen und einen unnötigen Verkleinerungsschritt
auslösen.

## Task 3: `db_tables`

Nur befüllen, wenn unter den Zieldateien mindestens eine DB-berührende liegt (Heuristik: Treffer
auf `information_schema`, `pg`, `psql`, `query(` im Dateiinhalt). Quelle ist eine read-only Abfrage
auf `information_schema.columns` gemäß dem MCP-Tool-Guide. Sonst `[]`.

## Task 4: `symbols` und `call_graph`

Über codebase-memory für die Zieldateien. Fallback ist `grep` auf Funktionsdefinitionen. Bei
Fallback-Nutzung entsteht ein `risks[]`-Eintrag (siehe Task 5), damit der Konsument weiß, dass die
Symbolliste unvollständig sein kann.

## Task 5: Nicht erreichbare Quellen sichtbar machen

Ist eine Quelle **und** ihr Fallback nicht verfügbar, wird ein `risks[]`-Eintrag mit
`severity: warn` geschrieben, der die Quelle benennt. Die betroffene Sektion bleibt nicht
kommentarlos leer. Der Generator bricht deswegen **nicht** ab — ein unvollständiges Bundle mit
dokumentierter Lücke ist besser als gar keines, und das Vollständigkeits-Gate in p3 entscheidet
anschließend, ob es für einen Plan reicht.

## Task 6: Schema-Konformität

Das Ergebnis muss gegen `.claude/skills/references/schemas/plan-intel-bundle.schema.json`
validieren. Pflichtsektionen sind `meta`, `impact_files` und `symbols`; die übrigen Arrays dürfen
leer sein.

```bash
jq -e . openspec/changes/<slug>/intel.json
bash scripts/plan-intel-filter.sh openspec/changes/<slug>/intel.json <eine-zieldatei>
```

Der zweite Befehl prüft die Interoperabilität mit dem bestehenden Filter: `impact_files` und
`symbols` müssen auf die Zieldatei eingegrenzt werden, `meta`/`db_tables`/`api_contracts`/`risks`
unverändert durchlaufen.

## Task 7: Erreichbarkeit (S4)

Das Skript muss von Taskfile, CI oder einem anderen Skript erreichbar sein, sonst greift die
Orphan-Violation. Die Verdrahtung in `dev-flow-plan-phases.md` erfolgt in p3; dieses Partial legt
zusätzlich einen Taskfile-Eintrag an, falls dort noch keiner existiert.

## Nicht-Ziele

`api_contracts` und `external_types` bleiben beim Planner — sie brauchen Urteilsvermögen, das ein
Skript nicht hat. Der Generator lässt vorhandene Werte unangetastet.
