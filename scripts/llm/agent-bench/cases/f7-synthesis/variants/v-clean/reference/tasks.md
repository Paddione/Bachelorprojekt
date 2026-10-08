# Referenzplan f7-synthesis/v-clean

Gestufter Plan: p1 und p2 unabhaengig mit disjunkten `target_files`, p3 ist
der Synthese-Schritt (`depends_on: p1, p2`, `slots4b: 2`). Der Orchestrator
dispatcht p1 und p2 sofort, p3 erst nach beiden. Pass erst bei Vollsynthese:
alle Partials `done` und Checks gruen.

## Partials

| id | plan | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | p1.md | impl | notes/a.txt | |
| p2 | p2.md | impl | notes/b.txt | |
| p3 | p3.md | impl | SUMMARY.md | p1, p2 |
