# Inventory & Migration Plan: `assets/Mentolder/`

> **Status:** Read-only snapshot. Keine Datei wurde verschoben oder gelöscht.
> **Erstellt:** 2026-06-20
> **Gesamtgröße:** 14 MB (in git untracked)
> **Auslöser:** User-Auftrag „in art library speichern, dann vernichten"

## TL;DR

`assets/Mentolder/` enthält drei Kategorien, die unterschiedlich behandelt werden müssen:

1. **Schon migriert / Duplikate** (~450 KB) — können nach Manifest-/CREDITS-Update entfernt werden.
2. **Client-Handoffs / Projekt-Arbeit** (~10 MB) — gehören in `archive/handoffs/mentolder/`, **nicht** in `art-library/`.
3. **Working / Scratch / State** (~3,5 MB) — sicher löschbar.

Das ursprünglich anvisierte Vorgehen **„alles in `art-library/` mergen"** bricht die Pipeline:

- `task test:art-library` validiert genau 19 Assets in `art-library/sets/mentolder/manifest.json`; 14 MB zusätzlicher Input würde die ConfigMap (k8s-Mount unter `/app/public/art-library/` für Brett + Website) mit totem Gewicht fluten.
- 21 Game-Asset-SVGs in `art_library_mentolder/sets/{mentolder,korczewski}/` sind **nicht** im neuen Coaching-Set und werden aktiv vom `Asset Pack 02`-Bundle referenziert. Verschieben weg vom Bundle-Pfad bricht das Bundle.
- `art-library/sets/mentolder/portfolio/CREDITS.md:5` zitiert genau diese Quelldateien als „Source files" — Merge-Ziel unklar.

Empfohlener Pfad: Duplikate entfernen + CREDITS umschreiben, Handoffs archivieren, Working-State weg. **Nichts wandert in `art-library/sets/mentolder/`.**

## Repo-Referenzen auf `assets/Mentolder/`

`git grep -nE 'assets/Mentolder|Assets_mentolder|art_library_mentolder'` ergibt **1 produktiven Treffer** + 12 intra-Datei-Refs:

| Datei | Zeile | Inhalt |
|------|------|------|
| `art-library/sets/mentolder/portfolio/CREDITS.md` | 5 | `Source files: Assets_mentolder/art_library_mentolder/ (archetypes.jsx, assets.jsx, colors_and_type.css).` |
| `assets/Mentolder/Asset Pack 02 - bundle-src.html` | 281–406 (12×) | `<img src="art_library_mentolder/sets/{mentolder,korczewski}/...">` — Bundle ist self-contained, Pfade relativ zu Bundle-Speicherort |

## Aktueller Stand

### Ziel: `art-library/sets/mentolder/` (schon da, validiert)

```
README.md · SKILL.md · manifest.json · colors_and_type.css
portfolio/    characters/ logos/ props/ terrain/ manifest.json CREDITS.md tokens.css
preview/      button.html faq.html hero.html kicker.html portrait.html
              service-row.html slot.html stat.html
styles/website.css
ui_kits/website/
```

`manifest.json` listet 19 Assets (3 characters · 6 props · 6 terrain · 4 logos).
Im Gegensatz zu `korczewski` hat mentolder **kein** `design_handoff_artlibrary/`-Subdir.

### Quelle: `assets/Mentolder/` (14 MB, untracked)

```
_du · _tmp · art_library_mentolder · asset_pack_02 · assets
coaching_studio · design_handoff_homepage_redesign · factory
figure_pack_extension · game_assets_mentolder · icon_assets
kontakt_redesign · print_export · screenshots · uploads
+ 14 Root-HTML · 3 Root-JSX · 1 Root-CSS · 2 Hidden-State-Files · index.html
```

## A) Bereits migriert / Duplikate (sicher entfernbar nach Diff-Check)

| Pfad (in `assets/Mentolder/`) | Größe | Entsprechung im neuen Set | Aktion |
|------|------|------|------|
| `colors_and_type.css` (root) | 8 KB | byte-identisch zu `art-library/sets/mentolder/colors_and_type.css` (`diff -q` silent) | löschen |
| `art_library_mentolder/logo-mark.svg` | ~4 KB | `art-library/sets/mentolder/portfolio/logos/mark.svg` | diff-verifizieren, dann löschen |
| `art_library_mentolder/logo-lockup-dark.svg` | ~4 KB | `…/logos/lockup-dark.svg` | dito |
| `art_library_mentolder/logo-lockup-light.svg` | ~4 KB | `…/logos/lockup-light.svg` | dito |
| `art_library_mentolder/assets.jsx` | ~16 KB | konsumiert in `design_handoff_artlibrary/` (im korczewski-Set als Vorbild) | archivieren oder löschen — **JSX-Source ist nicht im neuen Set, nur das SVG-Output** |
| `art_library_mentolder/archetypes.jsx` | ~16 KB | dito | dito |
| `art_library_mentolder/colors_and_type.css` | ~8 KB | dito | dito |
| `art_library_mentolder/Portfolio.html` | ~80 KB | nicht im neuen Set, dient nur als historischer Preview | archivieren (Referenz-Charakter) |
| `art_library_mentolder/README.md` | ~4 KB | nicht im neuen Set | archivieren |
| `art_library_mentolder/assets/gerald.jpg` + `assets/icon-{32,48,64,128,512}.svg` | 240 KB | nicht im Manifest, nirgendwo referenziert | löschen |

## B) Game-Asset-SVGs (vom `Asset Pack 02`-Bundle aktiv genutzt, NICHT im neuen Set)

11 mentolder-Game-SVGs + 10 korczewski-Game-SVGs liegen in `art_library_mentolder/sets/{mentolder,korczewski}/{characters,props,terrain}/*.svg` und werden vom `Asset Pack 02 - bundle-src.html` an 12 Stellen via `<img src>` referenziert.

| Subset | Pfade | Rolle |
|------|------|------|
| `sets/mentolder/characters/` | `coachee.{portrait,figurine}.svg`, `team-member-{active,passive}.svg`, `saboteur.svg` | Game-Charaktere (mentolder-Systembrett) |
| `sets/mentolder/props/` | `prop-{target,barrier,balance,shield}.svg` | Game-Items |
| `sets/mentolder/terrain/` | `fog-wash.svg`, `focus-circle.svg` | Game-Terrain |
| `sets/korczewski/characters/` | `sysadmin.svg`, `security-officer.svg`, `product-owner.svg` | Game-Charaktere (korczewski-Systembrett) |
| `sets/korczewski/props/` | `prop-{database,pipeline,firewall,alert}.svg` | Game-Items |
| `sets/korczewski/terrain/` | `subnet-grid.svg`, `namespace-boundary.svg` | Game-Terrain |

**Wichtig:** Diese 21 SVGs sind im aktuellen `art-library/sets/mentolder/portfolio/` **nicht** vorhanden — dort sind Coaching-Archetypen (`digital50`, `leadership`, `consulting`) + Compass/Handshake-Props. Die Game-SVGs sind ein **separater Brand-Slice** (mentolder-game + korczewski-game) für `brett/`. Siehe Offene Frage 1.

## C) Cross-Brand-Kontamination

`assets/Mentolder/uploads/Assets_korczewski/` (8 Dateien, ~80 KB) ist in `mentolder/` gelandet, gehört aber zu **korczewski**:

- `assets.jsx`, `characters.jsx`, `colors_and_type.css`
- `logo-{lockup-dark,lockup-light,mark}.svg`
- `Portfolio.html`, `README.md`

Wahrscheinlich Artefakt aus einer früheren Claude-Session, die in den falschen Ordner entladen hat. Sollte nach `assets/Korczewski/...` (falls existent) oder in `archive/korczewski-uploads/`. Siehe Offene Frage 3.

## D) Client-Handoffs (HTML-Prototypen, eigenständige Apps, ~10 MB)

Diese sind **nicht** library-fähig (es sind lauffähige HTML-Bundles, keine einzelnen Assets) und gehören in `archive/handoffs/mentolder/{html-bundles,prototypes}/`:

| Pfad | Größe | Rolle |
|------|------|------|
| `Asset Pack 02.html` | 52 KB | Gerenderter Asset-Pack-02-Output (Client-Deliverable) |
| `Asset Pack 02 - bundle-src.html` | 52 KB | Source-Bundle mit `<img src>`-Refs nach B) |
| `Mentolder Asset Pack 02 - Standalone.html` | 788 KB | Single-File-Standalone-Bundle (Duplikat zu `uploads/`-Kopie) |
| `Mentolder Avatars & Sidekick.html` | 1,9 MB | Avatare + Sidekick-Bundle |
| `Mentolder Game Asset Pack.html` | 1,8 MB | Game-Asset-Katalog-Bundle |
| `Business Card Redesign.html` | 8 KB | Print-Handoff |
| `Coaching Vertrag.html` | 32 KB | Vertrags-Template-Handoff |
| `Flyer Redesign.html` | 20 KB | Flyer-Handoff |
| `Homepage Redesign.html` | 36 KB | Homepage-Handoff |
| `Icon Explorations.html` | 24 KB | Icon-Explorations-Handoff |
| `Icon Pack.html` | 16 KB | Icon-Pack-Handoff |
| `Newsletter Template.html` | 12 KB | Newsletter-Handoff |
| `Stripe Brand Kit.html` | 72 KB | Stripe-Brand-Kit-Handoff |
| `Systembrett Template.html` | 40 KB | Systembrett-Print-Handoff |
| `index.html` | 8 KB | Tool-Landing (interaktiver Spielwiese-Einstieg) |
| `avatars.jsx` | 16 KB | Source für Avatare-Bundle |
| `sidekick.jsx` | 20 KB | Source für Sidekick-Bundle |
| `design-canvas.jsx` | 52 KB | Source für Design-Canvas-Tool |
| `coaching_studio/` | 120 KB | Coaching Studio App (`Coaching Studio.html`, `Praesentation.html`, `Export.html`, 5 JSX-Module) |
| `factory/` | 152 KB | Factory Design Tool (`FactoryFloor.html`, `Planungsbüro.html`, `Control Panel.html`, `Analytics.html`, 5 JSX-Module) |
| `kontakt_redesign/` | 2,1 MB | Kontakt-Seite (3 HTML-Varianten + JSX + CSS) |
| `game_assets_mentolder/` | 1,1 MB | Game-Asset-Katalog (`catalog.html`, CSS, README) |
| `print_export/` | 896 KB | Print-fertige HTML-Templates (6 Stück) + README |
| `asset_pack_02/` | 56 KB | `arena/`, `identity/` SVGs (8 Stück, dupliziert in `assets/{branding,game}/`) + `audio/README.md` |
| `design_handoff_homepage_redesign/` | 244 KB | `Homepage Redesign.html` + README |
| `figure_pack_extension/` | 136 KB | `placement_spec.additions.json` |
| `icon_assets/` | 560 KB | `favicon.ico` + README |
| `assets/branding/` | ~80 KB | 5 SVGs (Duplikat zu `asset_pack_02/identity/`) |
| `assets/game/` | ~60 KB | 3 SVGs (Duplikat zu `asset_pack_02/arena/`) |

## E) Working / Scratch / State (sicher löschbar, ~3,5 MB)

| Pfad | Größe | Grund |
|------|------|------|
| `_ds/mentolder-design-system-019dd170-f0a7-74fa-859f-72037be74c3b/` | 164 KB | Claude-Design-System-Session-Artefakt (`_ds_bundle.js`, `system/*.css`, `ui_kits/`, `_ds_manifest.json`, `_adherence.oxlintrc.json`, `README.md`) — wahrscheinlich einmaliger Download |
| `_tmp/flyer-now.jpg` | 40 KB | Temp-Datei |
| `uploads/` (ohne `Assets_korczewski/`) | 2,0 MB | `draw-*.png` (2×), `pasted-*.png` (4×), `Papa.jpeg`, `113.png`, `Coaching_Mustervertrag_mentolder.docx`, `Superpowers Brainstorming.html`, `Mentolder Asset Pack 02 - Standalone.html` (Duplikat vom Root) |
| `screenshots/flyer-check.jpg` | 48 KB | Ein-Screenshot-Snapshot |
| `.thumbnail` | 4 KB | Cache-File |
| `.design-canvas.state.json` | 4 KB | Tool-State |

## Migrationsplan (dry-run, nicht ausgeführt)

### Phase 0 — Preflight

1. `task test:art-library` → Baseline grün
2. `du -sh assets/Mentolder/` → Vorher-Wert (14 MB) notieren
3. Sicherheits-Tarball: `tar -czf /tmp/assets-mentolder-pre-cleanup.tgz assets/Mentolder/`
4. `git grep -nE 'assets/Mentolder|Assets_mentolder|art_library_mentolder'` → bestätigen: 1 produktiver Treffer (CREDITS) + 12 intra-Datei

### Phase 1 — Duplikate entfernen (A)

1. `diff -q assets/Mentolder/colors_and_type.css art-library/sets/mentolder/colors_and_type.css` → bestätigen identisch, dann löschen
2. Diff-Checks für die 3 Logo-SVGs (`logo-mark`, `logo-lockup-dark`, `logo-lockup-light`) gegen `portfolio/logos/` → bestätigen identisch, dann löschen
3. `art_library_mentolder/{assets,archetypes}.jsx` + `colors_and_type.css` + `Portfolio.html` + `README.md` archivieren (Source-Code für ggf. SVG-Regeneration)
4. `assets/{gerald.jpg,icon-32.svg,icon-48.svg,icon-64.svg,icon-128.svg,icon-512.svg}` löschen (nie referenziert)

### Phase 2 — Game-SVGs sauber kanalisieren (B)

Vorbedingung: Offene Frage 1 entschieden.

**Option A — Neues Brand-Set `art-library/sets/mentolder-game/`:**
1. `mkdir art-library/sets/{mentolder-game,korczewski-game}/`
2. 11 mentolder-Game-SVGs nach `art-library/sets/mentolder-game/{characters,props,terrain}/` (analog für korczewski)
3. `manifest.json` für beide neuen Sets schreiben (id-Schema, Paletten, File-Pfade)
4. `node art-library/_tooling/validate-manifest.mjs` → grün
5. Kustomize-ConfigMap-Generator in den Overlays registrieren (`prod-fleet/mentolder/` + `prod-fleet/korczewski/`)
6. **Asset Pack 02 Bundle-Pfade updaten:** `<img src="art_library_mentolder/...">` → relative Pfade zum neuen Set
7. `art_library_mentolder/sets/` löschen

**Option B — Lokal in `brett/public/art-library/{mentolder,korczewski}-game/`:**
1. `mkdir -p brett/public/art-library/mentolder-game/{characters,props,terrain}/` (analog korczewski)
2. SVGs kopieren
3. `brett/server.js` Static-Handler-Pfad erweitern (falls nötig)
4. Asset-Pack-02-Bundle-Pfade analog updaten
5. `art_library_mentolder/sets/` löschen

### Phase 3 — Cross-Brand-Korrektur (C)

1. `ls assets/Korczewski/ 2>/dev/null` → wenn existent: `mv assets/Mentolder/uploads/Assets_korczewski/ assets/Korczewski/uploads-source-2026-06-20/`
2. Sonst: `mkdir -p archive/korczewski-uploads/ && mv assets/Mentolder/uploads/Assets_korczewski/* archive/korczewski-uploads/`

### Phase 4 — Handoffs archivieren (D)

1. `mkdir -p archive/handoffs/mentolder/{html-bundles,prototypes}`
2. `git mv` für alle 14 Root-HTML + `index.html` + 3 Root-JSX → `archive/handoffs/mentolder/html-bundles/`
3. `git mv` für die 12 Subdirs aus D) → `archive/handoffs/mentolder/prototypes/`
4. `git mv` für `assets/branding/` + `assets/game/` → `archive/handoffs/mentolder/prototypes/asset_pack_02-svg-mirror/`

### Phase 5 — Working-Cleanup (E)

1. `rm -rf assets/Mentolder/_ds/ assets/Mentolder/_tmp/ assets/Mentolder/uploads/ assets/Mentolder/screenshots/`
2. `rm -f assets/Mentolder/.thumbnail assets/Mentolder/.design-canvas.state.json`
3. Cross-Check: `uploads/Assets_korczewski/` muss in Phase 3 schon weg sein

### Phase 6 — Manifest + CREDITS update

1. `art-library/sets/mentolder/portfolio/CREDITS.md:5` umschreiben — entweder Verweis auf `art-library/sets/mentolder/portfolio/` selbst (da SVGs aus dem Redesign stammen) oder auf den neuen Game-Set-Pfad, falls dort gemerged
2. Falls Phase 2 Option A: `art-library/sets/{mentolder-game,korczewski-game}/manifest.json` registrieren
3. `task test:art-library` → grün
4. `task workspace:validate` → k8s-Build unverändert (außer bei Phase 2 Option A: ConfigMap-Generator ergänzen)

### Phase 7 — Verifikation

- `du -sh assets/Mentolder/` → muss `0` sein (Verzeichnis kann komplett entfernt werden)
- `du -sh archive/handoffs/mentolder/` → Nachher-Wert (~10 MB)
- `git grep -nE 'assets/Mentolder|Assets_mentolder|art_library_mentolder'` → muss leer sein (außer diesem `INVENTORY.md` selbst, das wir committen)
- `task freshness:check` → manuell `assets/Mentolder/INVENTORY.md` zur Ignore-List hinzufügen, falls nötig

## Rollback

- `tar -xzf /tmp/assets-mentolder-pre-cleanup.tgz -C .` stellt Originalzustand wieder her
- Alle `git mv`-Operationen sind via `git reset --hard HEAD~N` trivial rückgängig
- Tarball-Sicherung in Phase 0 ist die primäre Recoverability-Garantie

## Offene Fragen für Reviewer

1. **Game-SVGs (B):** Soll `art-library/sets/{mentolder-game,korczewski-game}/` als **neue Brand-Sets** entstehen (Manifest-validiert, in ConfigMap für die jeweilige Brand) — oder lokal in `brett/public/art-library/` bleiben (außerhalb des Cluster-Asset-Systems)?
2. **Asset Pack 02 Bundle-Pfade:** Bleiben die HTML-Bundles erhalten und werden ihre `img src`-Pfade umgeschrieben — oder werden die Bundles als „ausgeliefert, tot" markiert und nur die Source-Bundles archiviert?
3. **Cross-Brand-Uploads (C):** Existiert `assets/Korczewski/`? Falls nein, bleibt `archive/korczewski-uploads/` als einzige Heimat. Bitte bestätigen, wohin die 8 Korczewski-Source-Files gehören.
4. **Archive-Lokation (D):** `archive/handoffs/mentolder/` im Repo (auffindbar, versioniert, ~10 MB zusätzlicher Repo-Footprint) — oder außerhalb (S3 / lokaler Tarball, nicht versioniert)? Im-Repo-Variante ist transparenter für Reviewer und Handoff-Empfänger.
5. **`_ds/`-Bundle (E):** War das ein Claude-Design-System-Session-Download (`_ds_bundle.js` + `system/*.css` + `ui_kits/`), der ggf. in `claude-sessions/` oder `docs/sessions/` gehört? Falls „Wegwerf-Artefakt": löschen. Falls „aufheben": umziehen.
6. **`uploads/Coaching_Mustervertrag_mentolder.docx`:** Privater Vertrags-Entwurf? Falls ja, gehört das **nicht** ins Repo-Archive — bitte vor `git rm` aus `uploads/` herausnehmen und lokal sichern.
7. **`Mentolder Asset Pack 02 - Standalone.html` Duplikat:** Liegt sowohl im Root als auch in `uploads/`. Nach Cleanup sollte nur das Root-Original existieren (oder umgekehrt) — bitte bestätigen, welche Version kanonisch ist.
