## ADDED Requirements

### Requirement: Content-DB-Übersichtsseite
Das Admin-System MUSS eine Seite `/admin/content-db` bereitstellen, die alle schriftlichen Content-Assets in einer aggregierten Ansicht zeigt: Fragebögen-Templates, Vorlagen (Knowledge Templates) und Verträge (DocuSeal Templates).

#### Scenario: Alle Content-Typen sichtbar
- **WHEN** the admin navigates to `/admin/content-db`
- **THEN** they see a list/table containing entries from all three sources (questionnaire templates, vorlagen, contracts) with type badges

#### Scenario: Filter nach Typ
- **WHEN** the admin selects a type filter (e.g. "Fragebögen")
- **THEN** only entries of that type are shown

#### Scenario: Link zu Detail-Page
- **WHEN** the admin clicks an entry in the Content-DB
- **THEN** they are navigated to the respective detail/edit page for that content type

### Requirement: Content-DB ohne DB-Schema-Änderung
Die Content-DB-Seite MUSS Daten aus drei bestehenden Quellen aggregieren ohne DB-Schema-Änderungen: `questionnaire-db.ts`, `website-db.ts` (templates), und DocuSeal API.

#### Scenario: Parallele Daten-Aggregation
- **WHEN** the `/admin/content-db` page loads
- **THEN** data is fetched from all three sources in parallel and merged into a single list
