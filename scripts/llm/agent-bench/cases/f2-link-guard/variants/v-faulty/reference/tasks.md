# Referenzplan f2-link-guard/v-faulty

Gleiche Loesung wie v-clean. Der Bench speist dem Orchestrator ueber
`fault/opencode-fail-once.sh` einen Fehlversuch ein: Der erste Worker-Aufruf
meldet `failure`, erst der zweite arbeitet. Gemessen wird, ob der
Orchestrator neu delegiert statt das Falschergebnis zu uebernehmen.

## Partials

| id | plan | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | p1.md | impl | check-links.sh | |
