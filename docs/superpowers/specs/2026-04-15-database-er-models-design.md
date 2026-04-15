---
title: "Datenbankmodelle — ER-Diagramme in der Dokumentation"
date: 2026-04-15
status: approved
---

# Design: Datenbankmodelle (ER-Diagramme)

## Ziel

Ergänzung der Dokumentation um Entity-Relationship-Diagramme für alle im Repo definierten
PostgreSQL-Schemas. Zielgruppe: Entwickler und Administratoren, die die Datenhaltung des
Workspace-MVP verstehen oder erweitern möchten.

## Scope

Zwei eigenständige Datenbankschemas sind im Repository vollständig definiert:

| Schema | Datenbank | Definiert in |
|--------|-----------|--------------|
| `public` (Meeting Knowledge Pipeline) | `website` auf `shared-db` | `k3d/website-schema.yaml`, `website/src/lib/website-db.ts` |
| `bachelorprojekt` (Requirements-Tracking) | `postgres` auf `shared-db` | `deploy/tracking/init.sql` |

Nicht im Scope: Schemas von Mattermost, Keycloak, Invoice Ninja, Vaultwarden — diese werden
von Upstream-Projekten verwaltet und sind nicht im Repo definiert.

## Neue Datei: `docs/database.md`

### Struktur

1. **Einleitung** — Überblick über die shared-db, Datenbankbenutzer, Extension-Anforderungen
2. **Website-Datenbank (`website`)** — ER-Diagramm + Tabellenbeschreibungen
3. **Tracking-Schema (`bachelorprojekt`)** — ER-Diagramm + View-Übersicht

### Website-Datenbank — Entitäten und Beziehungen

```
customers (1) ──< meetings (1) ──< transcripts (1) ──< transcript_segments
                        │
                        ├──< meeting_artifacts
                        └──< meeting_insights

meeting_embeddings  (polymorphe Referenz via source_type + source_id
                     auf transcripts / transcript_segments / meeting_artifacts / meeting_insights)

bug_tickets         (eigenständig, kein FK)
service_config      (eigenständig, kein FK)
```

Kardinalitäten:
- `customers` → `meetings`: 1:N (ein Kunde hat beliebig viele Meetings)
- `meetings` → `transcripts`: 1:N (ein Meeting kann mehrere Transkript-Versionen haben)
- `transcripts` → `transcript_segments`: 1:N
- `meetings` → `meeting_artifacts`: 1:N
- `meetings` → `meeting_insights`: 1:N
- `meeting_embeddings`: polymorphe Referenz (kein echter FK — source_type + source_id)

### Tracking-Schema — Entitäten und Beziehungen

```
requirements (1) ──< pipeline
requirements (1) ──< test_results
```

Views (read-only, keine eigenen Tabellen):
- `v_pipeline_status` — aktueller Stage je Anforderung
- `v_progress_summary` — Zählung nach Stage
- `v_open_issues` — offene Anforderungen
- `v_latest_tests` — letztes Testergebnis je Anforderung

## Änderungen an bestehenden Dateien

### `docs/_sidebar.md`

Neuer Eintrag unter **Für Administratoren**:
```
- [Datenbankmodelle](database.md)
```
Platzierung: nach `[Architektur](architecture.md)`.

### `docs/architecture.md`

Kurzer Querverweis im Abschnitt "Datenhaltung":
```markdown
> Die Tabellenstrukturen und Beziehungen sind in [Datenbankmodelle](database.md) dokumentiert.
```

## Format

- Mermaid `erDiagram` für alle Diagramme (konsistent mit bestehenden Mermaid-Diagrammen in der Doku)
- Felder mit Datentyp und kurzer Beschreibung in der Diagramm-Syntax
- Constraints (CHECK, NOT NULL) als Kommentar im Diagramm, nicht inline

## Nicht-Ziele

- Keine Dokumentation von Mattermost-/Keycloak-/Invoice-Ninja-Schemas
- Keine automatische Generierung aus der Datenbank (manuell gepflegt, Source-of-Truth ist der Code)
- Keine Migrationshistorie
