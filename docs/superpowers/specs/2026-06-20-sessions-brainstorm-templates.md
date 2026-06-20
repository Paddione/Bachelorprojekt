---
ticket_id: T000993
plan_ref: openspec/changes/sessions-brainstorm-templates/tasks.md
status: active
date: 2026-06-20
---

# Spec: Sessions: Brainstorm-Session-Vorlagen

## Kern-Nutzerflow

Patrick oder gekko öffnet einen neuen Brainstorm-Modal. Er sieht eine Vorlagen-Auswahl mit 5 vorinstallierten Templates: Feature-Intake, Retro, Grilling, Workshop, Spezifikation. Er wählt eine Vorlage — die Session startet mit der vordefinierten Fragen-Struktur. Er kann eine Vorlage clonen, umbenennen, anpassen — seine Custom-Variante landet als eigener Eintrag in der sessions.templates-Tabelle.

Default-Templates sind read-only (nicht löschbar, nicht editierbar), aber clone-and-edit ist immer möglich.

## Akzeptanzkriterien

1. Neue DB-Tabelle `sessions.templates` (id, slug, title, body_markdown, is_default, owner_id, created_from_template_id)
2. 5 Default-Templates vorinstalliert (Feature-Intake, Retro, Grilling, Workshop, Spezifikation)
3. Vorlagen-Auswahl-UI beim Session-Start
4. Clone-and-Edit: User kann eigene Variante aus Default ableiten
5. Admin + gekko können Vorlagen nutzen und eigene erstellen

## Edge Cases

- User löscht seine Custom-Vorlage: Bestehende Sessions die darauf verweisen, zeigen „Vorlage gelöscht" — Session-Inhalt bleibt erhalten (Snapshotted bei Start)
- Default-Vorlage hat Body-Update: Nur Default ändert sich, Custom-Clones bleiben unangetastet
- Zwei User mit gleichem Custom-Vorlagen-Namen: Erlaubt (pro User unique, nicht global)

## Fehlerfall-Behandlung

- sessions.templates-Tabelle nicht erreichbar: Fallback auf hardcoded Defaults in grilling.ts (graceful degradation)
- Custom-Vorlage mit Syntax-Fehler: Validierung beim Speichern, Fehlermeldung

## Erfolgsmetrik

- ≥80% neue Sessions starten mit einer Vorlage (nicht leer)
- 5 Default-Vorlagen werden in den ersten 2 Wochen ≥10× genutzt

## Technische Constraints

- DB-Tabelle sessions.templates (Schemamigration nötig)
- 5 Default-Templates zum Launch
- Clone + Edit (keine volle Custom-Creation ab Blank)
- Admin + gekko (nicht öffentlich)

## Betroffene Dateien

- Neue DB-Migration `website/migrations/0XX-sessions-templates.sql`
- Neue `website/src/lib/sessions/templates.ts` — CRUD-Logik
- Neue `website/src/components/sessions/TemplatePicker.svelte` — Auswahl-UI
- `website/src/components/sessions/SessionStart.svelte` — Template-Flow integrieren
