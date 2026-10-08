# Referenzplan f5-dispatch-clean/v-clean

Drei unabhaengige Partials mit disjunkten `target_files`; zwei Worker-Slots
(`slots4b: 2`). Der Orchestrator dispatcht p1 und p2 sofort, p3 nach dem
ersten freien Slot — keine Selbstausfuehrung, keine Abhaengigkeiten.

## Partials

| id | plan | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | p1.md | impl | notes/a.txt | |
| p2 | p2.md | impl | notes/b.txt | |
| p3 | p3.md | impl | notes/c.txt | |
