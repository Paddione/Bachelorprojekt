# Brett: Jump + Collision für Figuren — Design

**Datum:** 2026-05-15
**Branch:** `feature/brett-jump-collision`
**Pfad:** feature
**Path-Wahl-Begründung:** Neues, für Nutzer sichtbares Verhalten (Sprung-Mechanik + Inter-Figur-Kollision) in `brett.${PROD_DOMAIN}`.

## Intent

Brett-Figuren (Mannequins) bekommen zwei neue Verhalten:

1. **Jump:** Selektierte/hovered Figur springt parabolisch (Leertaste-Trigger).
2. **Collision (Bounce mit Impuls):** Figuren kollidieren beim Bewegen und beim Landen — angerempelte Figuren werden weggestoßen und kippen sichtbar (Bone-Impuls).

Beide Verhalten sind über den bestehenden Brett-WebSocket (`brett/server.js`) zwischen allen Teilnehmern eines Raums synchronisiert.

## User-Story

> Als Coach im Systembrett-Raum möchte ich eine Figur per Leertaste springen lassen und sehe, wie sie beim Landen eine benachbarte Figur anrempelt, die daraufhin wegrollt und kurz schlackert — damit Bewegung in der Aufstellung erlebbar wird, statt nur statisches Repositionieren per Drag.

## Funktionale Anforderungen

### Jump
- Trigger: `Space` (Keydown), wenn `STATE.selectedId` gesetzt ist **und** kein Input/Textarea fokussiert ist.
- Verhalten: einzelner Sprung (kein Hold-to-charge, kein Double-Jump).
- Physik: parabolisch, lokale Variable pro Figur (`jumpV`, `jumpY` in `fig`).
  - `v0 = 4.5 m/s`, `g = 12 m/s²` → Höhe ≈ 0.85, Dauer ≈ 0.75 s.
  - Pro Frame: `jumpY += jumpV * dt; jumpV -= g * dt; if (jumpY <= 0) { jumpY=0; jumpV=0; jumping=false; }`
- Während Flug: keine erneute Drag-Move-Verarbeitung für diese Figur. Bone-Stiffness bleibt unverändert (Klassik-Variante laut Brainstorming).
- Visualisierung: `root.position.y = baseY + jumpY` (statt der bestehenden Floor-Clamp-Logik bei Line 566).

### Collision (Inter-Figur)
- Geometrie: jede Figur ist ein vertikaler Zylinder im XZ-Plane mit Radius `BODY_RADIUS = 0.30` (≈ Schulterbreite des Mannequins).
- Detektion: pro Frame, pairwise (n²/2). Bei `n ≤ 200` (server-cap) ist das ~20k Vergleiche — vertretbar.
- Auslöser für Bounce:
  1. Drag — wenn die geraderaiselbe Drag-Bewegung zwei Figuren überlappen würde.
  2. Landung — wenn der Lande-Footprint (XZ-Position bei `jumpY → 0`) eine andere Figur überlappt.
- Impuls-Modell:
  - Separation-Vektor: `n = (B.pos - A.pos)` normalisiert in XZ.
  - Overlap: `o = 2*BODY_RADIUS - |B.pos - A.pos|`.
  - Position-Korrektur: angreifende Figur stoppt; getroffene Figur wird um `o + 0.02` entlang `n` verschoben.
  - Kipp-Impuls: alle Bones der getroffenen Figur bekommen `velocity.x += K * n.x`, `velocity.z += K * n.z` mit `K = 6.0` (Tunable). Das nutzt den existierenden Bone-Springer-Loop (`brett/public/index.html:516-549`) — keine neue Physics-Schleife.
  - Bei Landungs-Impact: zusätzlich `K_LAND = 9.0` (stärker als Drag-Push).
- Cascade: wenn die getroffene Figur durch die Position-Korrektur eine dritte berührt, wird in derselben Iteration weiterpropagiert (max. 3 Iterationen pro Frame, dann clip).

### Netzwerk-Sync
- **Neues Event `jump`:** Client sendet `{ type: 'jump', id: '<figId>' }` beim Trigger. Server broadcastet an Raum (nicht persistiert — Jump ist transient).
- **Bestehende `move`-Messages** werden während Drag und nach Bounce gesendet (wie heute), führen auf Empfängerseite zusätzlich zum Kipp-Impuls auf benachbarte Figuren (lokale Collision-Resolution auf jedem Client).
- **Authoritative Position:** der Anstoßende sendet `move` für die getroffene Figur(en). Der Server-State (`figureMaps`) übernimmt das letzte `move`. Race-Conditions (zwei Clients schubsen gleichzeitig) sind akzeptabel — last-write-wins, das ist konsistent mit dem heutigen Verhalten.

## Nicht-Ziele

- Kein Wand-/Floor-Kollisionssystem (Floor-Y bleibt existierend, Brett hat keine Wände).
- Kein Friction-/Rolling-Model: getroffene Figur stoppt sofort nach Position-Korrektur.
- Kein Charge-Jump, kein Mehrfach-Bounce des Springers (nur eine Parabel).
- Kein Sound-FX (separater Feature-Wunsch).

## Akzeptanzkriterien

1. Selektierte Figur springt bei Leertaste sichtbar (Höhe ≥ 0.5 Einheiten, Dauer 0.5–1.0 s).
2. Springende Figur landet wieder auf `y=0` und friert nicht in der Luft.
3. Lädt die Figur direkt über eine andere, wird die getroffene um ≥ `2*BODY_RADIUS` versetzt **und** die Bones kippen sichtbar (>0.1 rad max amplitude) für >0.3 s.
4. Im zweiten Browser (gleicher Raum) sieht man dieselbe Animation samt Bounce-Versatz innerhalb von <500 ms.
5. Keine Figur überlappt nach Drag-Stop dauerhaft mit einer anderen (Position-Korrektur ist persistent).
6. `task brett:build` und `task test:all` bleiben grün.

## Risiken

- **Race-Condition bei gleichzeitigem Bounce zweier Clients:** akzeptiert als last-write-wins. Würde bei häufigem Bounce-Spam zu Jitter führen — Tunable: niedrigere Throttle-Frequenz für Bounce-Moves (z.B. 30 Hz statt jeder Frame).
- **n²-Kollisions-Check bei vielen Figuren:** bei 200 Figuren ≈ 20k Distanzen/Frame. Auf Modern Hardware unkritisch, sollte aber gemessen werden (`performance.now()`).
- **Browser-Event-Fokus:** Leertaste kollidiert mit Scroll-Verhalten. Lösung: `preventDefault()` wenn Brett-Canvas Fokus hat oder kein Input fokussiert.

## Offene Fragen

- Soll auch eine **nicht-selektierte, aber gehoverte** Figur springen? Brainstorming-Antwort war "während Hover/Selection" — wir implementieren beide, mit Selection als Priorität (Hover als Fallback).
- Visualisierungs-Hint im UI, dass Space springt? → kurzer Tooltip "Space = Sprung" am Figur-Panel. Nice-to-have, nicht akzeptanzkritisch.
