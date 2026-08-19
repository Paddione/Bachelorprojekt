## ADDED Requirements

### Requirement: Runner-Zuordnung nach belegter lokaler Abhängigkeit

The system SHALL place every CI job on GitHub-hosted runners unless that job has a
demonstrable dependency on local infrastructure — a GPU, cluster access, or a service
reachable only from own hardware. Self-hosted capacity SHALL be reserved for exactly those
jobs.

Portability SHALL be the default and SHALL NOT require justification; the exception is what
carries the burden of proof. A job that runs self-hosted SHALL name the local dependency that
places it there.

The repository being public makes GitHub-hosted standard runners available without a usage
limit, so throughput SHALL NOT by itself justify self-hosted placement. Queue pressure on the
self-hosted pool SHALL be resolved by moving portable jobs to GitHub-hosted runners, not by
adding capacity to the pool.

#### Scenario: Portabler Job wird self-hosted platziert

- **GIVEN** ein Job in einer Workflow-Datei ohne belegte lokale Abhängigkeit
- **WHEN** er self-hosted Kapazität anfordert
- **THEN** schlägt der Zuordnungs-Guard fehl und benennt Datei und Jobnamen

#### Scenario: Job mit lokaler Abhängigkeit bleibt zulässig

- **GIVEN** ein Job, der die lokale GPU benötigt
- **WHEN** der Zuordnungs-Guard über die Workflow-Dateien läuft
- **THEN** besteht er, weil die Abhängigkeit über ein Capability-Label ausgewiesen ist

---

### Requirement: Self-hosted Kapazität wird über Capability-Labels adressiert

The system SHALL require every job that requests self-hosted capacity to address it through a
**capability label** naming the local dependency, never through the generic labels alone. A
`runs-on` value consisting only of `self-hosted`, `linux` and `x64` SHALL be rejected.

The set of permitted capability labels SHALL be declared in a single place together with the
local dependency each one denotes. A label used in a workflow but absent from that
declaration SHALL fail the guard, and so SHALL a declared label carrying no stated
dependency.

The reason is that generic labels match any self-hosted runner that happens to be registered.
Placement then depends on the runner inventory rather than on the workflow definition, and a
job can silently acquire a host nobody assigned to it.

#### Scenario: Generischer Pool wird angefordert

- **GIVEN** ein Job deklariert `runs-on: [self-hosted, linux, x64]`
- **WHEN** der Zuordnungs-Guard läuft
- **THEN** schlägt er fehl, weil kein Capability-Label die lokale Abhängigkeit benennt

#### Scenario: Unbekanntes Capability-Label

- **GIVEN** ein Job verwendet ein Capability-Label, das in der Deklaration fehlt
- **WHEN** der Zuordnungs-Guard läuft
- **THEN** schlägt er fehl und benennt das unbekannte Label

#### Scenario: Neu hinzugefügter Job wird miterfasst

- **GIVEN** eine Workflow-Datei erhält einen bisher nicht existierenden Job auf generischem self-hosted
- **WHEN** der Zuordnungs-Guard läuft, ohne dass eine Jobliste gepflegt wurde
- **THEN** schlägt er fehl — der Guard iteriert über alle Jobs, statt bekannte Namen abzuhaken

---

### Requirement: Keine self-hosted Runner ohne zugewiesene Aufgabe

The system SHALL NOT keep a self-hosted Actions runner registered that no workflow addresses.
A registered runner carrying the generic labels accepts any job that reaches the generic
pool, so an unused runner is precisely the condition under which a misplaced job succeeds
instead of failing visibly.

The runner inventory SHALL therefore be reconcilable against the workflow definitions: every
registered self-hosted runner SHALL carry a capability label that at least one job addresses,
or SHALL be deregistered.

Deregistration SHALL be an explicit, documented act rather than a side effect, because it
removes capacity that a workflow could later need.

#### Scenario: Registrierter Runner ohne adressierenden Job

- **GIVEN** ein self-hosted Runner ist registriert, aber kein Job fordert eines seiner Capability-Labels an
- **WHEN** die Runner-Inventur gegen die Workflow-Definitionen abgeglichen wird
- **THEN** wird er als unzugewiesen ausgewiesen und zur Deregistrierung oder Zuweisung benannt

#### Scenario: Abgleich benennt die Fundstelle

- **GIVEN** die Inventur findet eine Abweichung zwischen Runner-Labels und Jobanforderungen
- **WHEN** sie ihr Ergebnis ausgibt
- **THEN** nennt sie Runnernamen und die betroffenen Labels, statt nur eine Anzahl zu melden
