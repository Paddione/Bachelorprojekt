# Proposal: admin-applications-ssr-bundling-fix

## Why

Beim Aufruf von `https://web.mentolder.de/admin/applications` erhält der Nutzer einen HTTP 404.

### Ursachen-Analyse
1. **SSR-Routen-Kollision:** In Commit `859ab5aa2` (T900233) wurden `applications.ts` und `applications.css` direkt unter `components/website/src/pages/admin/` abgelegt. In Astro wird jede `.ts`-Datei unter `src/pages/` als Server-Endpunkt kompiliert. Dadurch kollidierte `applications.ts` mit `applications.astro` auf derselben Route `/admin/applications`.
2. **Server-Crash durch DOM-Code:** `applications.ts` ist ein reines Client-Skript mit Modul-Ebenen-DOM-Zugriff (`document.addEventListener('DOMContentLoaded', init)`). Wird diese Datei zur Server-Laufzeit (SSR) in Node.js evaluiert, schlägt sie mit `ReferenceError: document is not defined` fehl. Astro fängt den Fehler ab und leitet auf `/404` weiter.
3. **Fehlende Asset-Auflösung:** In `applications.astro` wurden Stylesheet und Skript über `<link href="/admin/applications.css">` und `<script src="/admin/applications.ts">` eingebunden. Dateien in `src/pages/` werden von Astro jedoch nicht als statische Assets an diesen Pfaden ausgeliefert.
4. **Alte Brett-Verlinkungen:** `applications.astro` enthielt Links mit Brett-Bezug (`← Zurück zum Brett` und `Brett-Kanban`). Das Bewerbungs-Cockpit soll jedoch eine eigenständige Admin-Seite sein.
5. **API-Authentifizierung:** Die internen Endpunkte unter `/api/internal/applications/*` akzeptierten bisher ausschließlich `x-internal-token`. Im Browser-Kontext sendet ein eingeloggter Administrator jedoch ein Session-Cookie. Ohne Session-Prüfung würde der Browser HTTP 403 erhalten.

## What

1. **Client-Assets verschieben:**
   - `src/pages/admin/applications.ts` nach `src/scripts/admin/applications.ts` verschieben.
   - `src/pages/admin/applications.css` nach `src/styles/admin/applications.css` verschieben.
2. **Astro-Bundling nutzen:**
   - In `src/pages/admin/applications.astro` die Styles per `import '../../styles/admin/applications.css'` importieren.
   - Das Skript per `<script src="../../scripts/admin/applications.ts"></script>` einbinden, sodass Astro es clientseitig bündelt.
3. **Entkopplung von Brett:**
   - Den Header von `applications.astro` bereinigen: Zurück-Link auf `/admin` ("← Zurück zur Übersicht") setzen und den Link zu "Brett-Kanban" entfernen.
4. **Session-Auth für Applications-API:**
   - Die API-Endpunkte unter `/api/internal/applications/*` (`list.ts`, `detail.ts`, `status.ts`, `timeline.ts`, `timeline_list.ts`, `dossiers.ts`) so erweitern, dass sie neben `x-internal-token` auch eine gültige Admin-Session (`getSession` + `isAdmin`) akzeptieren.
5. **Absicherung:**
   - BATS-Tests in `tests/spec/website-core.bats` stellen sicher, dass keine kollidierenden `.ts`/`.css`-Dateien unter `src/pages/admin/` liegen und `applications.astro` keine Brett-Links mehr enthält.

_Ticket: T900297_
