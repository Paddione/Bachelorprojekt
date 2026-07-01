# g-doc04-architecture-adrs

## Purpose

SSOT spec.

## Requirements

### Requirement: ADR-Verzeichnis vorhanden

- REQ-ADR-001: Das Verzeichnis `docs/adr/` existiert im Repository.
- REQ-ADR-002: Der Mess-Command `find docs -ipath '*adr*' -name '*.md' 2>/dev/null | wc -l` liefert reproduzierbar einen Wert von mindestens `5`.

### Requirement: Inhaltliche Vollständigkeit

- REQ-ADR-003: Jede ADR-Datei enthält die Abschnitte Status, Datum, Kontext, Entscheidung und Konsequenzen.
- REQ-ADR-004: Die fünf Pflicht-ADRs decken folgende Entscheidungen ab: Fleet-Konsolidierung (ADR-001), Push-basiertes Deploy (ADR-002), Brand-Namespace-Split (ADR-003), LLM fail-closed (ADR-004), Merge=Abschluss-Ticketmodell (ADR-005).
- REQ-ADR-005: Jede ADR benennt sowohl positive als auch negative Konsequenzen der Entscheidung.

### Requirement: Referenzierbarkeit

- REQ-ADR-006: Die ADR-Dateinamen folgen dem Muster `ADR-NNN-<slug>.md` (dreistellige Nummerierung, Kebab-Case-Slug).
- REQ-ADR-007: Jede ADR nennt ein Datum und einen Status (`Accepted`, `Deprecated` oder `Superseded`).

### Requirement: Health-Goal-Tracking

- REQ-ADR-008: `bash scripts/health-goals-check.sh --only=G-DOC04` gibt nach Erstellung der fünf ADR-Dateien grün zurück.

## Acceptance Criteria

- THEN der Mess-Command `find docs -ipath '*adr*' -name '*.md' 2>/dev/null | wc -l` liefert `5` oder mehr.
- THEN `bash scripts/health-goals-check.sh --only=G-DOC04` gibt grün zurück.
- THEN existiert `docs/adr/ADR-001-fleet-konsolidierung.md` mit den Abschnitten Kontext, Entscheidung und Konsequenzen.
- THEN existiert `docs/adr/ADR-002-push-basiertes-deploy.md` mit den Abschnitten Kontext, Entscheidung und Konsequenzen.
- THEN existiert `docs/adr/ADR-003-brand-namespace-split.md` mit den Abschnitten Kontext, Entscheidung und Konsequenzen.
- THEN existiert `docs/adr/ADR-004-llm-fail-closed.md` mit den Abschnitten Kontext, Entscheidung und Konsequenzen.
- THEN existiert `docs/adr/ADR-005-merge-equals-abschluss.md` mit den Abschnitten Kontext, Entscheidung und Konsequenzen.
- THEN enthält jede ADR-Datei sowohl positive als auch negative Konsequenzen.

<!-- merged from change delta g-doc04-architecture-adrs.md on 2026-07-01 -->