# Referenzplan f6-faulty-worker/v-faulty

Gleiche Loesung wie f5 v-clean (drei unabhaengige Partials, disjunkte
`target_files`, `slots4b: 2`). Der Bench speist dem Orchestrator ueber
`fault/opencode-fail-once.sh` einen Fehlversuch ein: Der erste Worker-Aufruf
meldet `failure`, erst der zweite arbeitet. Gemessen wird, ob der
Orchestrator mit Ursachen-Notiz neu delegiert statt das Fehlergebnis zu
uebernehmen.

## Partials

| id | plan | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | p1.md | impl | notes/a.txt | |
| p2 | p2.md | impl | notes/b.txt | |
| p3 | p3.md | impl | notes/c.txt | |
