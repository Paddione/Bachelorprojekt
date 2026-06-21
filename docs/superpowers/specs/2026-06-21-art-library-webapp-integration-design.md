---
title: Art Library — Brand-Asset-Vokabular in Webapp importieren
slug: art-library-webapp-integration
date: 2026-06-21
ticket_id: T001033
plan_ref: openspec/changes/art-library-webapp-integration/tasks.md
status: draft
brand: mentolder
domains: [website, admin]
---

# Art Library — Brand-Asset-Vokabular in Webapp importieren

## Kontext & Ausgangslage

Das Repo hat unter `art-library/sets/mentolder/portfolio/` ein vollständiges Brand-Asset-Vokabular:
- **3 Coaching-Archetypen** (digital50, leadership, consulting) als Portrait-SVGs
- **6 Service-Props** (compass, handshake, briefcase, bookmark, chat, spark)
- **6 Terrain-Swatches** (sur-01..06)
- **5 Logos** (mark, lockup-dark, lockup-light, app-icon, brass-pulse)

Die Website nutzt davon **nichts**. Stattdessen:
- Hero zeigt Initialen (`avatarType: 'initials'`) statt den Archetypen-Portrait
- ServiceRow-Kacheln haben Emoji-Icons (💻, 🎯, 🦭, 🏢, 🤖) statt SVG-Props
- Es gibt keine Admin-Übersicht über die vorhandenen Brand-Assets

Korczewski hat das Ziel-Muster bereits vollständig: `website/public/brand/korczewski/icons.svg` als SVG-Sprite, `ServiceRow.iconSpriteId` + `iconSpriteBrand` verdrahtet. Für mentolder fehlt dieses Muster komplett.

Ein bekannter Bug: `ServiceRow.svelte` hat `let iconSpriteBrand = 'korczewski'` als Default (Zeile ~33), was für eine mentolder-Brand korrekt übergeben wird (`iconSpriteBrand={BRAND_ID}` in index.astro), aber wenn `iconSpriteId` nicht gesetzt ist, fällt es auf Emoji zurück — das ist konsistent, aber der Default ist irreführend.

## Ziel (WARUM)

1. **Icons**: mentolder Services zeigen Brand-konforme SVG-Prop-Icons statt Emojis
2. **Portrait**: Hero zeigt den coaching-archetype `leadership.portrait.svg` statt Initialen
3. **Admin-Gallery**: Admins können alle Asset-Einträge aus dem mentolder Manifest browsen (`.art-grid`/`.art-card`/`.art-panel`/`.art-palette-row` E2E-Kontrakt aus `tests/e2e/specs/dashboard-art.spec.ts`)
4. **CI-Test**: mentolder-Set wird analog zu korczewski vom BATS-Validator geprüft

## Was gebaut wird (WAS)

### Phase 1 — Statische Assets materialisieren

SVGs aus `art-library/sets/mentolder/portfolio/` nach `website/public/brand/mentolder/` kopieren — **committed static files** (kein ConfigMap-Mount nötig, website/public/* wird beim Docker-Build in den Container kopiert).

- `website/public/brand/mentolder/characters/` ← `portfolio/characters/*.svg`
- `website/public/brand/mentolder/props/` ← `portfolio/props/*.svg`
- `website/public/brand/mentolder/logos/` ← `portfolio/logos/*.svg`
- `website/public/brand/mentolder/terrain/` ← `portfolio/terrain/*.svg`

### Phase 2 — SVG-Sprite-File bauen

`website/public/brand/mentolder/icons.svg` — SVG-Sprite mit 6 Props als `<symbol>`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" style="display:none">
  <symbol id="prop-compass" viewBox="0 0 24 24">...</symbol>
  <symbol id="prop-handshake" viewBox="0 0 24 24">...</symbol>
  <!-- ... 4 more props ... -->
</svg>
```

Format: identisch zu `website/public/brand/korczewski/icons.svg` — `<symbol>` mit `id` ohne `width`/`height` Root-Attribute, `currentColor` für Stroke.

### Phase 3 — Verdrahtung in Komponenten

**`website/src/config/brands/mentolder.ts`**:
- `homepage.avatarType` → `'image'`
- `homepage.avatarSrc` → `/brand/mentolder/characters/leadership.portrait.svg`
- `services[].iconSpriteId` → `prop-compass`, `prop-handshake`, … (je nach Service-Semantik)
- `services[].icon` (Emoji-Fallback) bleibt erhalten für non-SVG-Umgebungen

**`website/src/components/ServiceRow.svelte`**:
- Default-Bug fix: `let iconSpriteBrand = props.brand ?? 'mentolder'` statt Hardcode `'korczewski'`
  (ODER belassen, da index.astro `iconSpriteBrand={BRAND_ID}` explizit übergibt — zu verifizieren)

### Phase 4 — Admin Art-Library-Galerie

**`website/src/pages/api/admin/art-library.ts`** — GET-Endpoint, liest manifest.json serverseitig:
```typescript
// Returns: { brand: string, assets: Asset[] }
```

**`website/src/components/admin/ArtLibrary.svelte`** — Browsable Galerie:
- `.art-grid` — Kachel-Grid
- `.art-card` — pro Asset: Thumbnail + Name
- `.art-panel` — Seitenleiste bei Klick (Details + Palette)
- `.art-palette-row` — Farb-Swatches aus Asset-Palette
- `.art-empty` — Fallback wenn keine Library konfiguriert

Integration in `website/src/pages/admin/assets.astro` (neuer Tab oder Seite).

### Phase 5 — BATS-Test

`tests/unit/test_art_library_manifest.bats`:
```bash
@test "mentolder art-library manifest validates" {
  run node art-library/_tooling/validate-manifest.mjs mentolder
  [ "$status" -eq 0 ]
}
```

## Strategie-Entscheidung: CSR URL-basiert (kein ConfigMap)

Die Webapp-Integration braucht **keinen** K8s-ConfigMap-Mount. Begründung:
- `website/public/` wird beim `docker build` in den Container kopiert → Assets sind zur Buildzeit im Image
- ConfigMap-Generator ist nur nötig, wenn Brett (separater Service) SVGs zur Laufzeit über den Brett-Proxy liest — das ist eine Brett-interne Sache, nicht die Webapp
- Der korczewski-Precedent bestätigt: rein statische Dateien in `website/public/brand/`

K8s-Manifeste `k3d/kustomization.yaml` und `k3d/website.yaml` werden **nicht geändert**.

## Dateien

| Datei | Action | S1-Status |
|---|---|---|
| `website/public/brand/mentolder/icons.svg` | NEU | — |
| `website/public/brand/mentolder/characters/*.svg` | NEU (copy) | — |
| `website/public/brand/mentolder/props/*.svg` | NEU (copy) | — |
| `website/public/brand/mentolder/logos/*.svg` | NEU (copy) | — |
| `website/public/brand/mentolder/terrain/*.svg` | NEU (copy) | — |
| `website/src/config/brands/mentolder.ts` | EDIT | nicht baselined |
| `website/src/components/ServiceRow.svelte` | EDIT (1-Zeiler Bug) | nicht baselined |
| `website/src/components/admin/ArtLibrary.svelte` | NEU | — |
| `website/src/pages/api/admin/art-library.ts` | NEU | — |
| `tests/unit/test_art_library_manifest.bats` | EDIT (+@test) | nicht baselined |

## Acceptance Criteria

- [ ] `GET /api/admin/art-library` liefert 19 Asset-Einträge für mentolder
- [ ] Mentolder Homepage-Hero zeigt `leadership.portrait.svg` Portrait statt Initialen
- [ ] ServiceRow-Kacheln zeigen Props-SVG-Icons (prop-compass etc.) für alle 5 Services
- [ ] Admin Art-Library-Tab zeigt `.art-grid` mit `.art-card` Elementen
- [ ] E2E: `dashboard-art.spec.ts` Tests laufen durch (kein `.art-empty` für mentolder)
- [ ] BATS: `test_art_library_manifest.bats` mentolder-Test grün
- [ ] `node art-library/_tooling/validate-manifest.mjs` bleibt grün
