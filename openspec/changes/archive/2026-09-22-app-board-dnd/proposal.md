# Proposal: Drag & Drop für Applications Board (Kanban-Buckets)

## Why

Das Applications Board (Bewerbungs-Cockpit) ist ein 5-Spalten-Kanban-Brett.
Der Status einer Bewerbung kann derzeit nur über den Timeline-Form auf jeder Card
eingetragen werden, nicht aber durch Verschieben in eine andere Spalte.
Operator:innen möchten Bewerbungen per Drag & Drop zwischen den Buckets
(found → drafting → applied → interviewing → offered) verschieben, um den
Status schnell zu ändern — analog zu bekannten Kanban-Tools (Trello, Jira).

## What

Native HTML5 Drag & Drop auf den Application Cards im Brett-Applications Board:

- Jede Card wird zum draggable Quell-Element (`draggable="true"`)
- Jede Column wird zum Drop-Ziel mit visuellem Feedback (Highlight)
- Beim Drop wird der Status über die existierende API aktualisiert:
  `PUT /api/applications/:id/status` mit `{ status: "<new>" }`
- Nach erfolgreicher API-Antwort wird das Board neu geladen
- Bei API-Fehlern: visuelles Feedback (Banner/Alert), Card bleibt in alter Position
- Drag-Indikator (Opacity-Change) während des Ziehens
- Kein externes D&D-Dependency — alles native Web API

## Out of scope

- Touch-gestütztes Drag & Drop auf mobilen Geräten
- Undo / Reverse-Action nach dem Drop
- Umordnung der Spalten (fixe Reihenfolge bleibt)
- D&D-Animationen (Flip-Transition über Column-Grenzen hinweg)

## Risiko & Annahmen

- Die API `PUT /api/applications/:id/status` existiert bereits (Brett → Website)
  und nimmt die fünf Kanban-Status plus rejected/withdrawn.
- Das Board läuft im Brett-HTML-Container (kein React/Vue) — HTML5 D&D API ist
  der natürliche Ansatz.
- Die HTML5 D&D API ist nicht-touch-freundlich; mobile Nutzung ist ein bekannter
  Trade-off (T000606 Touch-Handling im Brett ist für die 3D-Figuren, nicht für D&D).

## Referenzen

- Ticket: [T900304](https://github.com/Paddione/Bachelorprojekt/issues/T900304)
- Anwendungen-Board-Code: `components/brett/src/client/ui/applications-board.ts`
- Status-API: `components/brett/src/server/routes/applications.ts` (`updateJobStatus`)
- Prior-Art (D&D-Muster im Brett): Figure Drag (`figure-drag.ts`, `touch-controls.ts`)
  — andere Domäne (Three.js), aber bestätigt, dass Brett D&D-Prinzipien kennt
