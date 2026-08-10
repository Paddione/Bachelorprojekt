## ADDED Requirements

### Requirement: Plan-QA Reports a Machine-Readable Outcome on Every Path

`scripts/plan-qa-check.sh` SHALL emit exactly one outcome line of the form
`RESULT: <STATUS>` on every terminating path, where `<STATUS>` is one of `PASS`, `FAIL`,
`SKIPPED` or `ERROR`.

- `PASS` / `FAIL` are **verdicts about the plan** and SHALL be emitted only when the model's
  response was understood.
- `SKIPPED` SHALL be emitted whenever the check did not run (payload not buildable, gateway
  not reachable, curl failure, non-200 HTTP status).
- `ERROR` SHALL be emitted whenever the check ran but its result could not be interpreted
  (gateway envelope unparseable, model content not interpretable as the required object).

Rationale: die Pruefung ist advisory und wird als
`bash scripts/plan-qa-check.sh … || true` aufgerufen — ihr Exit-Code traegt keine Information.
Alle Ausfallpfade enden heute mit `exit 0` und sind damit fuer einen Aufrufer von einem
bestandenen Lauf nicht zu unterscheiden: eine uebersprungene Pruefung sieht aus wie eine
bestandene. T002848 haelt diese Klasse fuer alle LLM-gestuetzten Pruefungen im Repo fest.
Die Ergebniszeile trennt „Aussage ueber den Plan" von „die Pruefung hat nicht stattgefunden".

#### Scenario: A skipped check is not readable as a pass

- **GIVEN** no process listens on the gateway port
- **WHEN** `scripts/plan-qa-check.sh` runs against a plan file
- **THEN** its output contains `RESULT: SKIPPED`
- **AND** its output contains no `RESULT: PASS`
- **AND** it exits 0, because the QA stage is advisory and must never break a planning run

#### Scenario: A passing check states its outcome

- **GIVEN** the gateway returns a well-formed verdict object with verdict `PASS`
- **WHEN** `scripts/plan-qa-check.sh` runs against a plan file
- **THEN** its output contains `RESULT: PASS`
- **AND** it exits 0

### Requirement: Plan-QA Tolerates Common Model Response Wrappings

`scripts/plan-qa-check.sh` SHALL extract the verdict object from the model's response content
even when that content is wrapped in a Markdown code fence (```` ```json ```` … ```` ``` ````)
or preceded/followed by prose, and SHALL report the model's actual `missing` items and
`suggestions` in that case.

The verdict, the missing items and the suggestions SHALL be derived from **one** parse of the
content, so that a partial failure cannot yield a verdict without its accompanying findings.

Rationale: der Systemprompt verbietet Fences, Modelle liefern sie dennoch. Beobachtet am
2026-08-09 beim Plan-Stage fuer T003077: `FAIL — Missing criteria: Could not parse missing
items`, ein Formatproblem, das als inhaltlicher Befund ueber den Plan ausgegeben wurde,
waehrend das harte Gate `scripts/plan-lint.sh` PASS lieferte.

#### Scenario: A fenced verdict object is understood

- **GIVEN** the gateway returns content consisting of a ```` ```json ```` fence around a
  well-formed verdict object with verdict `FAIL` and one missing item
- **WHEN** `scripts/plan-qa-check.sh` runs against a plan file
- **THEN** its output contains the text of that missing item
- **AND** its output does not contain `Could not parse missing items`
- **AND** its output contains `RESULT: FAIL`

### Requirement: An Uninterpretable Response Is Not Reported as a Plan Verdict

When the model's response content cannot be interpreted as the required verdict object,
`scripts/plan-qa-check.sh` SHALL report `RESULT: ERROR` together with an excerpt of the actual
response, SHALL NOT report a `PASS` or `FAIL` verdict, and SHALL NOT enter the auto-fix loop
or modify the plan file.

Rationale: der Auto-Fix-Loop haengt bei einem Parse-Ausfall die leere `suggestions` als
Abschnitt `## QA-Ergaenzungen` an den geprueften Plan und laeuft eine zweite, ebenso
ergebnislose Iteration. Eine Stoerung des Pruefwegs darf keine Korrektur an einem Artefakt
ausloesen, ueber das nichts bekannt ist.

#### Scenario: Prose instead of a verdict object surfaces as an error

- **GIVEN** the gateway returns HTTP 200 with content that is prose and contains no JSON object
- **WHEN** `scripts/plan-qa-check.sh` runs against a plan file
- **THEN** its output contains `RESULT: ERROR`
- **AND** its output contains no `RESULT: PASS` and no `RESULT: FAIL`
- **AND** its output contains an excerpt of the response content
- **AND** no auto-fix attempt is reported
- **AND** the plan file is unchanged
