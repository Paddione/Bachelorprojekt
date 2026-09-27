# f1-store-cleanup — Ausgangslage

Zwei Skripte, ein Begriff, zwei Aufloesungen:

- `store.sh` schreibt nach `${STORE_DIR:-/tmp/f1-store}`
- `cleanup.sh` loescht aus `${CLEANUP_DIR:-/tmp/f1-cleanup}`

`legacy/old-cleanup.sh` ist Altbestand (Format v0) und gehoert nicht zum
Auftrag.
