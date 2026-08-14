---
title: Design: Erfolgsfilter des Factory-Trace-Kollektors (pass vs. done)
ticket_id: T006282
domains: [website, db, test]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Design: Erfolgsfilter des Factory-Trace-Kollektors (pass vs. done)

_Ticket: T006282_

## Symptom (Fakt, reproduzierbar)

`scripts/finetune/collect_factory_traces.py` verwirft jeden Ticket-Lauf, der kein
`phase == 'verify' AND state == 'pass'`-Event hat. In der Live-DB
(`tickets.factory_phase_events`, brand mentolder) kommt `'pass'` jedoch nie vor —
der Korpus wäre mit dem echten DB-Pfad LEER, obwohl 354 Tickets mit `verify`/`done`
abgeschlossen sind.

## Root-Cause (Hypothese, verifiziert)

Der Docstring des Skripts (Z. 23–27) behauptet, `state == 'pass'` sei "die
dokumentierte Konvention fuer Quality-Gate-Ergebnisse, siehe CLAUDE.md
'Merge = Abschluss'". **Diese Referenz ist falsch**: CLAUDE.md nennt `'pass'`
nirgends; dort steht nur, dass Quality-Gate-Ergebnisse als `verify`-Phase-Events
mit strukturiertem `detail` erfasst werden. Die tatsächliche Aufnahme-Mechanik
erlaubt ausschließlich `state IN ('entered', 'done', 'blocked')` (+ `partial-done`):

- `openspec/specs/software-factory.md` (REQ-SF-EXECUTOR-002, Z. ~2171):
  "Phase-Events schreiben (`phase=implement`, `state=entered|done|blocked` —
  KEINE neuen State-Werte, vgl. T002130)"
- `openspec/specs/phase-events.md`: akzeptiert zusätzlich `partial-done`
- ticket-mcp `record_phase_event`: Enum `entered|done|blocked`

Der Docstring hat eine Konvention erfunden, die die Factory nie geschrieben hat.
Die MESSUNG belegt das:

```bash
# MESSUNG (2026-08-15, mcp-postgres READ-ONLY, brand mentolder, gegen Live-DB)
SELECT state, COUNT(*) FROM tickets.factory_phase_events
WHERE phase='verify' GROUP BY state ORDER BY count DESC;
# => done: 408, entered: 266, pass: 0, blocked: 0
```

Der Bug sitzt also in der Leseseite (Kollektor + Fixture), nicht in der
Aufnahme-Mechanik.

## Optionen-Abwägung

### Option A — Predicate auf `state == 'done'` umstellen (+ Fixture/Doku angleichen)

- Referenz bleibt die dokumentierte Aufnahme-Mechanik (`entered|done|blocked`);
  `verify/done` ist das reale Erfolgssignal (408× belegt).
- Minimaler Diff: eine Bedingung in `is_successful()`, zwei Fixture-Zeilen im
  BATS-Test, Docstring im Skript und Header-Kommentar des Tests korrigieren.
- Präzise Semantik: kein stilles Mitnehmen hypothetischer Fremd-Zustände.

### Option B — Predicate tolerant machen ('pass' ODER 'done')

- 0× `'pass'` im gesamten Bestand → toter Code-Pfad, der eine nie geschriebene
  Konvention am Leben hält.
- Verschwommene Semantik: Der Filter akzeptiert dann Zustände, die die
  Aufnahme-Mechanik nicht kennt; künftige Drift (z. B. neuer State-Wert) würde
  still mitgezählt statt zu failen.
- Docstring bliebe irreführend.

### Entscheidung: Option A

Die Aufnahme-Mechanik ist die dokumentierte Referenz (Auftrag T006282).
`verify/done` ist das einzige real vorkommende Erfolgssignal. Ein toleranter
Filter (B) würde eine nicht existierende Konvention festschreiben.

## Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `scripts/finetune/collect_factory_traces.py` | `is_successful()`: `state == 'pass'` → `state == 'done'`; Docstring (Z. 23–27) auf die reale Konvention (`entered|done|blocked`, Aufnahme-Mechanik) korrigieren |
| `tests/spec/unsloth-training-env/factory-traces.bats` | Fixture: `verify/state` `'pass'` → `'done'` (Positiv), `'fail'` → `'entered'` (Negativ, real 266× vorkommend); Header-Kommentar angleichen |

Keine weiteren Stellen referenzieren `'pass'` (geprüft: `grep -rn "'pass'|\"pass\"" scripts/finetune/` trifft nur Docstring + Predicate).

## Edge-Cases

- **`verify/entered`** (266× real): Lauf hat verify betreten, aber nie
  abgeschlossen → kein Erfolg, wird verworfen (Negativ-Fall im Test).
- **`verify/blocked`**: Quality-Gate blockiert → kein Erfolg.
- **`partial-done`**: nur in `implement`-Phasen gültig; für `verify` irrelevant,
  wird vom Filter korrekt nicht als Erfolg gewertet.
- **Mehrere verify-Events pro Ticket**: `any()` bleibt korrekt — ein einziges
  `verify/done` genügt.

## Teststrategie (Rot-Grün)

RED: Fixture auf `verify/done` (Positiv) / `verify/entered` (Negativ) umstellen —
mit dem heutigen Code wird der Positiv-Lauf verworfen, `grep -c "Erfolgreicher
Lauf"` liefert 0 statt 1 → Test rot. Positiv-Anker vor Negativ-Aussage
(T002356-M1). Output-Verifikation (T002448-M4): Test führt den Kollektor aus und
prüft das Ergebnis (Exit-Code, Korpusinhalt), kein Source-Grep.

GREEN: Predicate auf `done` — Test grün.

## Offene Fragen

Keine. Die Messung ist verifiziert, die Referenz-Konvention dokumentiert
(software-factory.md, phase-events.md, record_phase_event).
