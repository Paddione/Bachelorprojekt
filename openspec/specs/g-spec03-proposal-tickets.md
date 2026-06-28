# g-spec03-proposal-tickets

## Purpose

SSOT spec.

## Requirements

### Requirement: Der Measure-Command `m=0; for d in openspec/changes/*/; do b

The system SHALL der Measure-Command `m=0; for d in openspec/changes/*/; do b=$(basename "$d"); [ "$b" = archive ] && continue; [ -f "$d/.ticket" ] || m=$((m+1)); done; echo "no-ticket=$m"` ist jederzeit reproduzierbar ausführbar und liefert einen numerischen Wert.
- REQ-2: Jeder nicht-archivierte Change unter `openspec/changes/` (ausgenommen das Verzeichnis `archive/` selbst) enthält eine Datei `.ticket` mit einer nicht-leeren Ticket-ID.
- REQ-3: Changes, die ausschließlich aus einem leeren Skelett bestehen (kein `proposal.md`, kein `tasks.md`) und deren archiviertes Pendant bereits unter `openspec/changes/archive/` existiert, werden aus dem aktiven Verzeichnis entfernt.

## Acceptance Criteria

- THEN liefert der Measure-Command `no-ticket=0`.
- THEN gibt `bash scripts/health-goals-check.sh --only=G-SPEC03` einen grünen Status aus.
- THEN existiert für jeden nicht-archivierten Change in `openspec/changes/` eine `.ticket`-Datei mit einer nicht-leeren Ticket-ID.
- THEN ist `openspec/changes/g-dep01-npm-vuln/` nicht mehr vorhanden und `openspec/changes/archive/2026-06-28-g-dep01-npm-vuln/` weiterhin vorhanden.

<!-- merged from change delta g-spec03-proposal-tickets.md on 2026-06-28 -->