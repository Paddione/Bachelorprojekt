# Referenzplan f1-store-cleanup/v-ambiguous

Gleiche Loesung wie v-clean (eine Aufloesung `${DATA_DIR:-/tmp/f1-data}` plus
Rest-Waechter) — der Auftrag oben verrat sie nur nicht, deshalb ist die
Rueckfrage die richtige Entscheidung.

## Partials

| id | plan | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | p1.md | impl | store.sh, cleanup.sh | |
