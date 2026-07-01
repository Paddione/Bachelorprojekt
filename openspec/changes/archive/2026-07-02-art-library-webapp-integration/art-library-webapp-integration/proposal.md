# Proposal: art-library-webapp-integration

_Ticket: T001033_

## Why

Das mentolder Brand-Asset-Vokabular (`art-library/sets/mentolder/portfolio/`: 3 Archetypen, 6 Props, 6 Terrain, 5 Logos) existiert im Repo, aber die Website nutzt davon nichts. Hero zeigt Initialen statt Archetyp-Portrait; Services zeigen Emojis statt SVG-Props; Admins haben keine Übersicht über verfügbare Brand-Assets.

Das korczewski-Gegenstück ist vollständig verdrahtet: `website/public/brand/korczewski/icons.svg` als SVG-Sprite, `ServiceRow.iconSpriteId` befüllt. Mentolder hat dasselbe Muster, aber nicht angebunden.

## What

1. **Phase 1 — Statische Assets materialisieren**: SVGs aus `art-library/sets/mentolder/portfolio/` als committed static files nach `website/public/brand/mentolder/{characters,props,logos,terrain}/` kopieren. Kein ConfigMap-Mount nötig — `website/public/` wird beim Docker-Build in den Container kopiert.

2. **Phase 2 — SVG-Sprite**: `website/public/brand/mentolder/icons.svg` mit 6 Props als `<symbol id="prop-*">` bauen (identisches Format zu `korczewski/icons.svg`, `currentColor` für Stroke, keine Root-`width`/`height`).

3. **Phase 3 — Verdrahtung**: `mentolderConfig.services[].iconSpriteId` befüllen; `homepage.avatarSrc` → `leadership.portrait.svg`; `ServiceRow.svelte` Default-Bug (hardcode `'korczewski'`) beheben.

4. **Phase 4 — Admin Art-Library-Galerie**: `ArtLibrary.svelte` + `/api/admin/art-library` Endpoint, die den E2E-Kontrakt (`.art-grid`/`.art-card`/`.art-panel`/`.art-palette-row`) aus `tests/e2e/specs/dashboard-art.spec.ts` erfüllen.

5. **Phase 5 — BATS-Test**: mentolder-Set-Validierung analog zu korczewski in `tests/unit/test_art_library_manifest.bats`.

K8s-Manifeste werden nicht geändert (kein ConfigMap-Generator, kein VolumeMount).
