## ADDED Requirements

### Requirement: `get-timeline` akzeptiert kein `--brand`/`BRAND` mehr

`bash scripts/ticket.sh get-timeline` SOLL `--brand` nicht mehr als
Options-Flag akzeptieren und `BRAND` nicht mehr binden. Grund:
`tickets.tickets.external_id` ist über eine globale Sequenz vergeben (`TEXT
UNIQUE`, kein Per-Brand-Counter) — die Brand-Eingrenzung erfolgt bereits
vollständig transitiv über den `external_id`-Subselect (siehe „`get-timeline`
liefert die Plan-Historie ohne Query-Fehler" oben). Ein zusätzliches
`--brand`-Flag, das seit T900243 nirgends mehr referenziert wird, suggeriert
eine Eingrenzung, die nicht stattfindet, und wird deshalb entfernt statt in
eine Mismatch-Prüfung umgewandelt.

#### Scenario: `get-timeline` funktioniert weiterhin ohne `--brand`

- **GIVEN** ein Ticket mit `external_id = 'T900239'` (brand mentolder)
- **WHEN** `bash scripts/ticket.sh get-timeline --id T900239` läuft (ohne `--brand`)
- **THEN** verhält sich der Aufruf unverändert (Exit 0, Timeline-JSON)

#### Scenario: `get-timeline` lehnt `--brand` als unbekannte Option ab

- **GIVEN** derselbe Aufruf, diesmal mit einem zusätzlichen `--brand <brand>`
- **WHEN** `bash scripts/ticket.sh get-timeline --id T900239 --brand korczewski` läuft
- **THEN** endet der Aufruf mit Exit-Code 2 und der Fehlermeldung `Unknown get-timeline option: --brand` auf stderr
