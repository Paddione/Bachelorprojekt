## REMOVED Requirements

### Requirement: Genau eine SDLC-Fläche im Admin-Menü (E1/E2)

**Grund der Entfernung:** Das Requirement schrieb einen Cockpit-Eintrag im Admin-Menü mit
Ziel `/admin/cockpit` fest. Dieser Pfad wird von `website/src/middleware/redirect-map.ts`
nach `/sdlc/cockpit` umgeleitet, und `website/src/integrations/build-target.mjs` entfernt
alle `/sdlc/`-Routen aus dem Produktions-Manifest (`BUILD_TARGET=prod`, gesetzt in
`.github/workflows/build-website.yml`). Der geforderte Eintrag war im Produktions-Image
damit nicht erreichbar.

Das Requirement stand im Widerspruch zu `openspec/specs/sdlc-isolation.md`, wonach die
SDLC-Oberflächen Development-only sind. Der Widerspruch wurde am 2026-08-11 zugunsten von
`sdlc-isolation` entschieden: das Produktions-Admin-Menü führt **keine** SDLC-Fläche mehr.
Die SDLC-Oberflächen bleiben ausschließlich über die lokale Console (`sdlc.localhost`)
erreichbar.

Die Aussage über die Weiterleitung selbst bleibt von dieser Entfernung unberührt —
`redirect-map.ts` behält seine Einträge, damit gespeicherte Lesezeichen auf `/admin/*`
innerhalb des SDLC-Build-Ziels weiterhin ihr Ziel finden. Entfernt wird allein die
Verpflichtung, im Admin-Menü einen Eintrag darauf zu führen.
