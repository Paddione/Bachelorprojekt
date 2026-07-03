## ADDED Requirements

### Requirement: Öffentlicher listQTemplates-Export
`questionnaire-db.ts` MUSS eine exportierte Funktion `listQTemplates(pool)` bereitstellen, die alle Fragebögen-Templates mit `id`, `name`, `dimension_count` und `created_at` zurückgibt, sodass die Content-DB-Seite darauf zugreifen kann.

#### Scenario: Templates abrufbar
- **WHEN** `listQTemplates(pool)` is called
- **THEN** it returns an array of questionnaire templates with id, name, dimension_count, and created_at fields
