---
ticket_id: T000993
status: archived
date: 2026-06-20
spec_ref: docs/superpowers/specs/2026-06-20-sessions-brainstorm-templates.md
openspec_ref: openspec/changes/sessions-brainstorm-templates/
---

# Proposal: sessions-brainstorm-templates

_Ticket: T000993_
_Spec: docs/superpowers/specs/2026-06-20-sessions-brainstorm-templates.md_

## Why

Brainstorm-Sessions starten heute leer — der Nutzer muss die Fragen-Struktur jedes Mal von
Null aufbauen. Das erzeugt Reibung und ungleichmäßige Qualität: manche Sessions sind
tief durchdacht, andere oberflächlich, je nachdem, welche Fragen dem Moderator spontan
einfallen. Vorinstallierte Vorlagen für die häufigsten Session-Typen (Feature-Intake,
Retro, Grilling, Workshop, Spezifikation) geben einen konsistenten Startpunkt und
reduzieren die Einstiegshürde.

Clone-and-Edit stellt sicher, dass User Vorlagen anpassen können, ohne die Defaults
zu verändern — jeder User baut sich im Laufe der Zeit seine eigene Bibliothek auf,
die Defaults bleiben als verlässliche Basis erhalten.

## What

### Kern-Nutzerflow

Patrick oder gekko öffnet einen neuen Brainstorm-Modal. Er sieht eine Vorlagen-Auswahl
mit 5 vorinstallierten Templates: Feature-Intake, Retro, Grilling, Workshop,
Spezifikation. Er wählt eine Vorlage — die Session startet mit der vordefinierten
Fragen-Struktur. Er kann eine Vorlage clonen, umbenennen, anpassen — seine Custom-Variante
landet als eigener Eintrag in der `sessions.templates`-Tabelle.

Default-Templates sind read-only (nicht löschbar, nicht editierbar), aber clone-and-edit
ist immer möglich.

### Neue Artefakte

- **DB-Migration** `website/src/db/migrations/20260620_create_sessions_templates.sql` —
  erstellt Schema `sessions` + Tabelle `sessions.templates` mit 5 Default-Seeds.
  Anwendung pro Brand (mentolder + korczewski), da beide Namespaces eigene DBs haben.
- **`website/src/lib/sessions/templates.ts`** — CRUD-Logik (list, clone, delete) +
  hardcoded `DEFAULT_TEMPLATES`-Fallback wenn die DB nicht erreichbar ist.
- **`website/src/pages/api/admin/sessions/templates/index.ts`** —
  `GET` (alle Templates für den User), `POST` (Clone erstellen).
- **`website/src/pages/api/admin/sessions/templates/[id].ts`** —
  `DELETE` (Custom-Template löschen, nur eigene).
- **`website/src/components/sessions/TemplatePicker.svelte`** — Auswahl-UI mit
  Default-Badge, Clone-Button, Custom-Liste.
- **`website/src/components/sessions/SessionStart.svelte`** — Modal das den
  TemplatePicker einbindet und bei Auswahl die Session startet.

### GIVEN / WHEN / THEN

**GIVEN** ein Admin öffnet den neuen Brainstorm-Modal
**WHEN** der TemplatePicker lädt
**THEN** sieht er 5 Default-Templates (Feature-Intake, Retro, Grilling, Workshop,
Spezifikation) plus seine eigenen Custom-Templates, falls vorhanden.

**GIVEN** ein Admin klickt "Clone" auf dem Grilling-Default
**WHEN** der Clone-Dialog bestätigt wird
**THEN** wird ein neuer Eintrag in `sessions.templates` mit `is_default=false`,
`owner_id=<user-sub>`, `created_from_template_id=<grilling-id>` erstellt und
erscheint in seiner Custom-Liste.

**GIVEN** die `sessions.templates`-Tabelle ist nicht erreichbar
**WHEN** `templates.ts` versucht, die Templates zu laden
**THEN** fallen die CRUD-Funktionen auf `DEFAULT_TEMPLATES` (hardcoded in `templates.ts`)
zurück — die UI zeigt weiterhin die 5 Defaults, nur Custom-Templates fehlen.

## Akzeptanzkriterien

1. Neue DB-Tabelle `sessions.templates` (id, slug, title, body_markdown, is_default,
   owner_id, created_from_template_id)
2. 5 Default-Templates vorinstalliert (Feature-Intake, Retro, Grilling, Workshop,
   Spezifikation)
3. Vorlagen-Auswahl-UI beim Session-Start
4. Clone-and-Edit: User kann eigene Variante aus Default ableiten
5. Admin + gekko können Vorlagen nutzen und eigene erstellen

## Edge Cases

- User löscht seine Custom-Vorlage: Bestehende Sessions die darauf verweisen, zeigen
  „Vorlage gelöscht" — Session-Inhalt bleibt erhalten (Snapshotted bei Start).
- Default-Vorlage hat Body-Update: Nur Default ändert sich, Custom-Clones bleiben
  unangetastet.
- Zwei User mit gleichem Custom-Vorlagen-Namen: Erlaubt (pro User unique, nicht global).

## Fehlerfall-Behandlung

- `sessions.templates`-Tabelle nicht erreichbar: Fallback auf hardcoded Defaults in
  `templates.ts` (graceful degradation).
- Custom-Vorlage mit Syntax-Fehler: Validierung beim Speichern, Fehlermeldung.

## Erfolgsmetrik

- ≥80% neue Sessions starten mit einer Vorlage (nicht leer).
- 5 Default-Vorlagen werden in den ersten 2 Wochen ≥10× genutzt.

## Technische Constraints

- DB-Tabelle `sessions.templates` (Schemamigration nötig, gilt für beide Namespaces).
- 5 Default-Templates zum Launch.
- Clone + Edit (keine volle Custom-Creation ab Blank).
- Admin + gekko (nicht öffentlich).
