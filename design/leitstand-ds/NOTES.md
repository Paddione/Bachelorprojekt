# SDLC Leitstand Design System -- design-sync notes

Viertes design-sync-Ziel im Repo, Foundations-Stil wie `design-system/` -- statische
HTML-Karten, keine Component-Compile-Pipeline.

## Re-build / re-sync

1. `node design/leitstand-ds/build.mjs` -- kopiert die Token-CSS verbatim nach
   `_tokens.css`, kopiert die 6 Cockpit-Glyphen nach `assets/icons/`, injiziert
   Tokens+Card-CSS+Icon-Grid in jede Karte (idempotent).
2. `node design/leitstand-ds/validate.mjs` -- prueft `@dsCard`-Marker + Regionen.
3. `node --test design/leitstand-ds/` -- Unit-Tests (setzt Schritt 1 voraus).
4. Push (interaktiv): `create_project` "SDLC Leitstand Design System" ->
   `finalize_plan { writes:["cards/**"], localDir:"design/leitstand-ds" }` ->
   `write_files`. Nur `cards/**` wird hochgeladen. `projectId` danach in `config.json`
   eintragen.

## Quirks

- Token-DRYness ist an der Quelle garantiert -- nach Token-Aenderung Schritt 1 erneut
  ausfuehren.
- Die Icon-Glyphen sind bereits T000756-konform (currentColor, kein Root-width/height) --
  reine Kopie, keine Neuzeichnung.
- DesignSync-Push ist interaktiv; nicht verfuegbar -> Schritt ueberspringen, das Bundle
  bleibt committed und der Push kann spaeter nachgeholt werden.
