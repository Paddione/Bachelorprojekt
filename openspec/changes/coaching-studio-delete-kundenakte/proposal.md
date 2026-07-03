## Why

Der coaching-studio-Admin-Prototyp (`website/public/coaching-studio/`) bietet aktuell keine Möglichkeit, eine Kundenakte zu löschen — weder über ein Menü noch über einen Button. `CUSTOMERS` ist ein statisches, modul-globales Array ohne React State, sodass jede zukünftige Mutation ohnehin kein Re-Render auslösen würde. Nutzer:innen des Prototyps können angelegte/vorhandene Klient:innen nicht wieder entfernen.

## What Changes

- `CUSTOMERS` wird in echten React State gehoben (`useState` in `app.jsx`), initialisiert aus `localStorage` mit Fallback auf das statische Array.
- Löschen-Button (Trash-Icon) an zwei Stellen: Dashboard-Kundenkachel (Karten-Root wird von `<button>` zu `<div role="button" tabIndex={0}>` umgebaut) und Kundenakte-Detailansicht (Seitenkopf).
- Zweistufige Inline-Bestätigung („Wirklich löschen? Ja/Abbrechen") statt neuem Modal-System; zusätzlicher Warnhinweis bei aktiven/pausierten Sessions.
- Undo-Toast (5s-Zeitfenster) nach dem Löschen.
- Persistenz über `localStorage` (Key `coaching-studio-customers`), überlebt Seiten-Reloads.
- Nach Löschen aus der Detailansicht: automatische Navigation zurück zum Dashboard.
- Alle `CUSTOMERS[0]`-Fallback-Stellen (app.jsx, workspace.jsx, screens_core.jsx, screens_more.jsx) werden `undefined`-sicher gemacht (Empty-State statt Crash bei leerem Array).

## Capabilities

### New Capabilities
- `coaching-studio-kundenakte`: Verwaltung (insbesondere Löschen) von Kundenakten im coaching-studio-Admin-Prototyp, inkl. State-Modell, Bestätigungs-UX und Persistenz.

### Modified Capabilities
(keine — der coaching-studio-Prototyp hat bisher keinen eigenen SSOT-Spec; die bestehende Spec `coaching-sessions-polish-guide` betrifft den produktiven SessionWizard, ein anderes, unabhängiges Feature.)

## Impact

- Betroffene Dateien: `website/public/coaching-studio/{app,screens_core,workspace,screens_more}.jsx` (client-seitiges React ohne Build-Step/Modulsystem, eingebunden via `website/src/pages/admin/coaching/studio.astro`).
- Kein Backend-/DB-Zugriff, keine API-Änderungen — rein clientseitige Logik (localStorage).
- Keine Auswirkung auf produktive Coaching-Features (SessionWizard, `coaching.session_steps`, `assistant_messages`) — der Prototyp ist ein isoliertes Admin-Demo-Tool.
