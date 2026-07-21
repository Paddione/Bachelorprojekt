# Proposal: brett-fig-panel-drag-rotate

## Why

Das Figuren-Menü des Systembretts (`#fig-panel`, Zustände „NEUE FIGUR" / „FIGUR BEARBEITEN")
hängt am Topbar-Button und kann auf schmalen Viewports mit dem horizontal scrollenden Topbar
aus dem sichtbaren Bereich rutschen. Gravierender: Figuren lassen sich als Ganzes weder
verschieben (draggable sind nur die IK-Kontaktpunkte, `CONTACT_POINTS` ohne `hips`) noch
drehen — `facingY` ist im Datenmodell frei (Radiant, Server-Pass-Through), aber keine einzige
Client-Interaktion setzt es. Für die Systembrett-Kernaufgabe (Figuren aufstellen und
Blickrichtungen ausdrücken) fehlt damit die zentrale Bedienbarkeit.

## What

1. **Edge-Drawer:** `#fig-panel` wird `position:fixed` am rechten Viewport-Rand unterhalb des
   Topbars verankert (Mobile-Media-Query inklusive); Close-Button, Toggle und Click-outside
   bleiben erhalten.
2. **Auto-Close beim Absetzen:** `addFigure()` ruft `closeFigPanel()` — deckt Placing-Mode
   und Doppelklick-Spawn zentral ab.
3. **Edge-Tab-Button:** Neues Element „Figur bearbeiten" am rechten Rand, sichtbar wenn eine
   Figur selektiert und das Panel geschlossen ist; Klick öffnet das Panel im
   Bearbeiten-Zustand.
4. **Ganzkörper-Drag:** Neuer Drag-Modus `body` (mousedown auf Körper-Mesh einer entsperrten
   Figur → Root-Drag auf der Bodenebene, Grab-Offset, throttled `sendMove`); bestehender
   IK-Gliedmaßen-Drag bleibt unverändert. Drag-Logik wird in ein neues Modul
   `brett/src/client/figure-drag.ts` extrahiert (S1-Budget von `board-boot.ts` ist 74).
5. **360°-Rotation:** Drag am Selektionsring dreht die Figur frei um Y (Radiant, kein Raster);
   zusätzlich Grad-Slider (0–360) im Panel. Sync über bestehendes `move`-Protokoll — kein
   Server-Change.
6. **Touch:** Body-Drag und Ring-Rotation über den bestehenden touch-handler-Pfad.

Spec: `docs/superpowers/specs/2026-07-21-brett-fig-panel-drag-rotate-design.md`

_Ticket: T002050_
