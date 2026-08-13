---
title: "fix-sdlc-navigation-redirects — Implementation Plan"
ticket_id: T003737
domains: [website]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# fix-sdlc-navigation-redirects — Implementation Plan

_Ticket: T003737 — SDLC-Navigation nach Routen-Cutover: Redirect-Ketten und 404_

## File Structure

```
website/src/lib/redirect-map.ts                              # /admin/tickets → /sdlc/cockpit, /admin/pipeline-Eintrag entfernen
website/src/pages/sdlc/bugs.astro                           # Rueckwaerts-Redirect entfernen
website/src/pages/sdlc/pipeline.astro                       # Rueckwaerts-Redirect entfernen
website/src/components/admin/AdminSidebarNav.astro           # SDLC-Links auf /sdlc/* umstellen
website/src/components/sdlc/FactoryFloor.svelte             # /admin/planungsbuero → /sdlc/planungsbuero
website/src/components/sdlc/factory/KiRoutingPanel.svelte   # /admin/ki-konfiguration → /sdlc/ki-konfiguration
website/src/pages/sdlc/tickets/[id].astro                   # /admin/tickets-Referenzen → /sdlc/cockpit
website/src/pages/sdlc/systemtest/board.astro               # window.open /admin/tickets → /sdlc/cockpit
tests/spec/sdlc-cockpit/navigation-no-dead-links.bats       # Guard: kein Link endet in 404
<!-- vitest: kein neuer Vitest-Test nötig — Navigation wird durch BATS-Guard abgesichert, keine neue Geschäftslogik -->
```

## Tasks

### P1: Redirect-Karte bereinigen

**Dateien:** `website/src/lib/redirect-map.ts`, `website/src/pages/sdlc/bugs.astro`, `website/src/pages/sdlc/pipeline.astro`

- `REDIRECT_MAP['/admin/tickets']` von `/sdlc/tickets` auf `/sdlc/cockpit` aendern (Ticketliste lebt im Cockpit seit T000752).
- `/admin/pipeline`-Eintrag aus REDIRECT_MAP entfernen (Kommentar sagt er sei nicht drin, Code widerspricht).
- Rueckwaerts-Redirects in `bugs.astro` (301→/admin/tickets→404) und `pipeline.astro` (301→/admin/cockpit→/sdlc/cockpit) entfernen.

### P2: Interne Links auf /sdlc/* umstellen

**Dateien:** `AdminSidebarNav.astro`, `FactoryFloor.svelte`, `KiRoutingPanel.svelte`, `tickets/[id].astro`, `systemtest/board.astro`

Alle 8 SDLC-Links in der Sidebar und alle 4 Verweise in Komponenten von `/admin/*` auf `/sdlc/*` umstellen. Kein Link darf ueber einen 301-Hop laufen.

### P3: Navigation-Guard-Test

**Datei:** `tests/spec/sdlc-cockpit/navigation-no-dead-links.bats`

Guard-Test: Sammelt alle href- und redirect-Ziele aus `website/src/components/sdlc/`, `website/src/pages/sdlc/` und `AdminSidebarNav.astro`, loest sie durch REDIRECT_MAP auf und prueft, dass am Ende eine Seitendatei unter `website/src/pages/` steht. Positiv-Anker: ein gueltiges Ziel besteht die Pruefung.

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** Guard-Test laeuft und findet 404-Ziele.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-cockpit/navigation-no-dead-links.bats
# expected: FAIL (rot — /sdlc/tickets ist 404, Redirects erzeugen Ketten)
```

- [x] **Fix-Step (GREEN).** Alle Redirects und Links korrigiert.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-cockpit/navigation-no-dead-links.bats
# expected: PASS (gruen — kein Link endet in 404, keine Kette laenger als 1 Hop)
```

- [x] **Final Verification.**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

> test:changed: 4469 Tests gruen, genau 2 Fehlschlaege — vorbestehender
> T003205-Testdefekt in `bge-role-routes.bats` ($output wird vom Zwischen-run
> ueberschrieben), in diesem PR mitgefixt (a42484439) und unter laufendem
> Proxy als 3/3 gruen verifiziert; gesamte `local-llm-proxy`-Spec (151 Tests)
> gruen. freshness:regenerate + freshness:check gruen.
