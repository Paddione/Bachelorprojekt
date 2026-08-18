## ADDED Requirements

### Requirement: Finalizer liest plan_ref ohne Leerzeichen zu zerstören

`scripts/devflow-post-merge-finalize.sh` SHALL extract the `plan_ref` ticket field with a reader
that preserves whitespace inside the value. The field carries a composite value of the form
`FACTORY-PLAN-REF branch=<branch> plan=<path>`; the space separating `branch=` from `plan=` is
significant, because the branch and plan are recovered with space-delimited patterns.

The derived `$BRANCH` SHALL be the branch name alone, and the derived `$PLAN_FILE` SHALL be the
plan path alone, with neither carrying a fragment of the other field. This SHALL hold when the
script is invoked without an explicit `--branch` flag — the invocation form used by
`dev-flow-execute`.

The whitespace-stripping reader SHALL remain available for fields whose values carry no
significant whitespace (`status`, `type`), and its restriction SHALL be documented at its
definition so a future field with a composite value is not read through it.

#### Scenario: plan_ref mit branch und plan wird korrekt zerlegt

- **GIVEN** ein Ticket, dessen `plan_ref` den Wert
  `FACTORY-PLAN-REF branch=fix/<slug>-T012240 plan=openspec/changes/<slug>/tasks.md` trägt
- **WHEN** der Finalizer ohne `--branch` läuft und Schritt 2 auswertet
- **THEN** ist `$BRANCH` gleich `fix/<slug>-T012240` und `$PLAN_FILE` endet auf
  `openspec/changes/<slug>/tasks.md`, ohne dass einer der Werte ein Fragment des anderen enthält

#### Scenario: Felder ohne Leerzeichen bleiben unverändert lesbar

- **GIVEN** dasselbe Ticket-JSON mit `status` und `type`
- **WHEN** der Finalizer Schritt 1 auswertet
- **THEN** liefert er die unveränderten Werte dieser beiden Felder
