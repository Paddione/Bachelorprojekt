# Proposal: grilling-ui-multichoice

## Why

Das In-Ticket-Grilling (`GrillingStepper`) hat vier Probleme:

1. **Falsche Questionnaire hardcoded**: `[id].astro` übergibt immer `questionnaireId="coaching-sessions-v1"` — auch für reine Software-Dev-Tickets wie T000737.
2. **Kein Multiple-Choice**: `GrillingQuestion` hat kein `choices`-Feld; der Nutzer kann nur Freitext tippen. Für Fragen mit erwartbarem Antwortspektrum fehlen Schnell-Auswahl-Chips.
3. **Garbage-Daten in T000737**: `grilling_answers` enthält Test-Dummy-Werte und alle Fragen sind `dismissed` — muss gelöscht werden.
4. **"Alle anzeigen"-Modus nicht implementiert**: Der Modus-Toggle existiert, aber im `all`-Modus wird dasselbe Einzelfragen-Template gezeigt statt einer Liste.

## What

1. **T000737 Daten-Reset** (operativ, kein Code-Change): `grilling_answers`/`grilling_meta` auf NULL setzen.
2. **`choices?: string[]`** zu `GrillingQuestion` hinzufügen; kuratierte Choice-Listen an ausgewählte Fragen beider Questionnaires.
3. **Choice-Chips** im `GrillingStepper` über dem Textarea; Klick ersetzt den Antworttext, aktiver Chip mit Gold-Border.
4. **All-Modus** als Fragen-Liste (answered/dismissed/open visuell unterschieden, open mit Inline-Input).
5. **Dynamische Questionnaire-Auswahl** in `[id].astro`: aus vorhandenen Answer-Keys (ohne `coaching-sessions-v1`) ableiten, Default `final-grilling-v1`.

Nicht im Scope: Multi-Select, neues DB-Feld `questionnaire_id`, `GrillingAnswersPanel.svelte` (Legacy).

_Ticket: T000737_
