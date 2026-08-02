---
title: plan-intel.sh dedupliziert risks[] beim Regenerieren
ticket_id: T002515
domains: [dev-tooling, plan-authoring]
status: planning
---

# plan-intel.sh dedupliziert risks[] beim Regenerieren

## Purpose

`scripts/plan-intel.sh` haengt bei jedem Lauf denselben generierten `risks[]`-Eintrag erneut
an `openspec/changes/<slug>/intel.json` an. Nach fuenf Laeufen stehen fuenf identische
Eintraege in der Datei. Weil vier von elf Tests in `tests/spec/dev-flow-plan/task-context.bats`
den Generator aufrufen, hinterlaesst jeder Testlauf eine geaenderte, committbare Datei — der
Arbeitsbaum erscheint "dirty", obwohl niemand etwas bearbeitet hat. Das verrauscht den
Vorcheck `git status --porcelain MUSS leer sein` vor jedem Worktree-Remove und verleitet im
schlimmsten Fall dazu, echte ungetrackte Arbeit zu uebersehen.

## Bug-Triage: Symptom, Hypothese, verifizierte Ursache

Die Trennung folgt der Konvention aus T002448-M5 — Symptome sind reproduzierte Fakten,
Ursachen sind belegt, nicht angenommen.

| Ebene | Aussage | Beleg |
|---|---|---|
| Symptom | `risks[]` waechst um genau +1 pro Lauf, alle Eintraege identisch | Reproducer 2026-08-02: drei Laeufe auf einem Sandbox-Slug ergaben `risks.length` = 1, 2, 3, waehrend `[.risks[] \| {note,severity}] \| unique \| length` konstant 1 blieb |
| Hypothese (aus dem Ticket) | fehlende Deduplizierung beim Regenerieren | verifiziert |
| Ursache | `scripts/plan-intel.sh:166` setzt `RISKS` neu auf `[RISK_CODEBASE]`, `:169` haengt `RISKS_EXTRA` an — den kompletten `risks[]`-Block des vorherigen Laufs, der denselben generierten Eintrag bereits enthaelt | Code gelesen, durch den Reproducer bestaetigt |
| Kontrast | `api_contracts` und `external_types` (`:51-52`) werden uebernommen, aber NICHT neu generiert — deshalb wachsen sie nicht | im Reproducer beide stabil `[]` |

Der Defekt ist kein vergessener Dedupe, sondern ein **auf ein generiertes Feld uebertragenes
Merge-Muster**: fuer manuell gepflegte Felder ist "Bestand uebernehmen" korrekt, fuer ein Feld,
das der Generator jeden Lauf neu erzeugt, addiert dieselbe Zeile bei jedem Lauf eine Kopie.

## Entscheidung

`risks[]` wird beim Merge nach `(note, severity)` dedupliziert:

```bash
RISKS="$(echo "$RISKS" | jq --argjson re "$RISKS_EXTRA" '. + $re | unique_by([.note, .severity])')"
```

**Warum nicht ersatzloses Streichen des Merges?** Ein reiner Generator-Ersatz waere der
kleinere Diff, wuerde aber jedes manuell in `intel.json` nachgetragene Risiko bei jedem Lauf
verwerfen. Das Ticket fordert ausdruecklich Deduplizierung "analog zu api_contracts, die
bewusst erhalten bleiben" — Erhaltung des manuell Gepflegten ist die Absicht des Merges, die
Akkumulation ist der Fehler.

**Konsequenz von `unique_by`:** jq sortiert nach dem Vergleichsschluessel. Die Reihenfolge in
`risks[]` wird damit stabil und deterministisch, aber nicht mehr "generierter Eintrag zuerst".
Das ist akzeptabel: das Schema schreibt keine Reihenfolge vor, und Determinismus ist fuer
dieses Artefakt der hoehere Wert (`plan-intel.sh` ist laut Header-Kommentar als
deterministischer Generator angelegt).

## Nicht im Scope

`EXISTING_INTEL` (`:47`) zeigt fest auf `$CHANGE_DIR/intel.json` und ignoriert `--out`; der
Merge liest damit aus einer anderen Datei, als er schreibt. Das ist ein eigenstaendiger Defekt
mit anderen Reproschritten und ist als **T002540** erfasst. Er beruehrt dieselbe Datei und darf
deshalb nicht parallel zu T002515 eingeplant werden.

## Requirements

### Requirement: risks[] is deduplicated across regenerations

The intel bundle generator SHALL deduplicate the `risks[]` array by the `(note, severity)`
pair when merging the previous bundle's risks into a freshly generated one.

#### Scenario: Repeated generator runs do not accumulate identical risks

- **WHEN** `scripts/plan-intel.sh <slug>` is run three times in a row against the same change
  directory
- **THEN** the resulting `intel.json` SHALL contain exactly one `risks[]` entry per distinct
  `(note, severity)` pair
- **AND** the file SHALL be byte-identical between the second and third run

#### Scenario: A manually added risk survives regeneration

- **GIVEN** an `intel.json` whose `risks[]` contains an entry with a `note` that the generator
  does not produce
- **WHEN** the generator is run again
- **THEN** that entry SHALL still be present in the regenerated `risks[]`

#### Scenario: Manually curated sections remain unaffected

- **WHEN** the generator is run repeatedly
- **THEN** the existing behaviour for `api_contracts` and `external_types` SHALL be unchanged —
  entries present before the run SHALL survive it
