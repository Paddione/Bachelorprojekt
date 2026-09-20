# Proposal: get-timeline-plan-brand-column

## Why

`bash scripts/ticket.sh get-timeline --id <id>` bricht mit Exit 3 ab
("ERROR: column tp.brand does not exist"). Ursache ist ein Tippfehler in der
`plan_events`-CTE von `cmd_get_timeline` (`scripts/ticket.sh`): sie filtert
`tickets.ticket_plans` zusätzlich auf `tp.brand`, eine Spalte, die auf dieser
Tabelle nicht existiert (`tp.branch` ist eine real existierende, aber
semantisch andere Spalte — der Git-Branch-Name des Plans).

Folgebefund aus T900239 (PR #5771): dort wurde behoben, dass `_exec_sql` den
SQL-Fehler stumm verschluckte. Der Fehler ist dadurch sichtbar geworden, aber
nicht behoben — dieses Ticket behebt die Query selbst.

## What

Die fehlerhafte Bedingung `AND tp.brand = :'brand'` wird aus der
`plan_events`-CTE ersatzlos entfernt (nicht durch `tp.branch` ersetzt — das
wäre syntaktisch grün, aber semantisch falsch: `branch` ist kein
Brand-Diskriminator). Die CTE bleibt bereits über
`tp.ticket_id = (SELECT id FROM tickets.tickets WHERE external_id = :'ext_id')`
auf genau ein Ticket eingeschränkt, und `external_id` ist pro Brand
eindeutig — ein zusätzlicher Brand-Filter auf dem Plan-Datensatz ist
redundant und war an der falschen Stelle verankert. Die Schwester-CTEs
(`comments`, `phase_events`, `pr_links`) filtern bereits ausschließlich über
diesen Ticket-Subselect, ohne eigenen Brand-Filter.

_Ticket: T900243_
