# Design-Asset-Katalog — Quelle vs. Derivat (T901038)

Baseline: `docs/design-assets/manifest.json` (PRE, 872 Dateien,
20.924.022 Bytes, 238 Duplikat-Gruppen), erzeugt mit
`scripts/design-assets-inventory.sh`. Manifest-SHA-256:
`8000b0571b9941acb9f753aa022000f9b4a05ff7a7cc334ed2960fdf765df094`.

Verdict `source` = von Hand gepflegt; `derived` = generiert oder kopiert, mit
Beleg (Generator-Skript, GENERATED-Kopf oder Hash-Gleichheit aus dem
Manifest). Rechte `verified` nur mit Lizenzbeleg, sonst `unverified` —
Lizenzen werden nie erfunden. Generator-Metadaten (Version, Prompt, Seed,
Modell, Modell-Lizenz) stehen als `unknown`, wo sie nicht belegt sind.

## assets/ (588 Dateien, 14.473.562 Bytes)

| Gruppe | Verdict | Marke | Herkunft | Rechte | Generator | Beleg |
|---|---|---|---|---|---|---|
| assets/audio/ (63) | source | shared/brett | Freesound.org, OpenGameArt.org, FFmpeg-Synthese | verified CC0 (`assets/audio/CREDITS.md`) | unknown (keine Versionen/Seeds belegt) | CREDITS.md; 63/63 byte-identisch nach `components/brett/public/assets/sfx/` gespiegelt |
| assets/game/ (7 × .mjs) | source | brett | handgeschriebene Spielmodule | unverified (kein Lizenzvermerk) | unknown | 7/7 byte-identisch in `components/brett/public/assets/combat/` |
| assets/branding/ (58) | source | korczewski, mentolder, shared | handgepflegte Brand-Baeume | unverified | unknown | rsync-Ursprung laut `scripts/assets-sync.sh`; 56/58 identisch in `components/website/public/brand/`, 2 Token-CSS divergiert |
| assets/brands/ (113) | source | korczewski, mentolder | Arbeitsmaterial (HTML-Bundles, scraps, uploads, screenshots) | unverified | unknown | Verzeichnisinhalt, `assets/brands/mentolder/README.md` beschreibt System ohne Generator-Versionen |
| assets/art-library/ (136) | source | korczewski, mentolder | handgepflegte SVG-Sets + Manifeste + Tooling | unverified (README nennt keine Lizenz) | unknown | `assets/art-library/README.md`, `manifest.schema.json`; Deploy per Kustomize-`configMapGenerator` (README) |
| assets/design-overviews/ (84) | source | korczewski | Screenshots + `kore-design-system`-Bundle | unverified | unknown | Verzeichnisinhalt (`.png`, `.jsx`, `_extracted/`) |
| assets/grilling-brett-admin-panel/ (124) | source | brett | HTML-Design-Bundle + Screenshots | unverified | unknown | Verzeichnisinhalt (`Brett Admin Panel.html`, `Brett Design System/`) |
| assets/feature-intake/ (2), assets/Mentolder/INVENTORY.md | source | — (Doku) | repo-autorierte Dokumente | verified (repo-autoriert, keine Third-Party-Assets) | n/a (Hand) | Dateiinhalt, INVENTORY.md ist Snapshot-Doku vom 2026-06-20 |

Interne Duplikate: 56 Duplikat-Gruppen liegen vollstaendig innerhalb von
`assets/` (gleiche Bytes an mehreren Pfaden) — Konsolidierungspotenzial,
kein Beleg fuer Derivat-Richtung ohne Generator-Nachweis.

## .design-sync/ (7 Dateien, 47.843 Bytes)

| Gruppe | Verdict | Marke | Herkunft | Rechte | Generator | Beleg |
|---|---|---|---|---|---|---|
| .design-sync/design-tokens.css | derived | mentolder | Production-Build von `mentolder-web` (`dist/assets/index-*.css`, Google-Fonts-`@import` vorangestellt, extern, ausserhalb Scope) | unverified (Kompilat + CDN-Import) | unknown (keine Build-Version belegt) | `.design-sync/NOTES.md` (Re-sync-Checkliste) |
| .design-sync/config.json, NOTES.md, overrides/, previews/ | source | mentolder | handgeschriebene Sync-Konfiguration und Doku | verified (repo-autoriert) | n/a (Hand) | Dateiinhalt |

## packages/design-system/ (33 Dateien, 196.384 Bytes)

| Gruppe | Verdict | Marke | Herkunft | Rechte | Generator | Beleg |
|---|---|---|---|---|---|---|
| packages/design-system/_tokens.css | derived | mentolder | GENERATED-Kopie von `components/website/public/brand/mentolder/colors_and_type.css` — aktuell STALE (2 Hunks Drift: Font-Import, `--on-brass`) | unverified (erbt Brand-Quelle) | `packages/design-system/build.mjs` `extractTokens()`, Version unknown | GENERATED-Kopf; `diff` gegen Brand-CSS zeigt Drift |
| packages/design-system/assets/props/, assets/logos/ (11 × .svg) | derived | mentolder | Snapshots der Brand-SVGs | unverified | `build.mjs` `copyAssets()`, Version unknown | 11/11 byte-identisch zu `components/website/public/brand/mentolder/{props,logos}/` und zu `assets/branding/`-Originalen |
| packages/design-system/cards/*.html (14) | derived | mentolder | assemblierte Karten (Tokens + Card-CSS + SVG-Grids injiziert) | unverified | `build.mjs` `assembleCard()`, Version unknown | `tokens:start`-Regionen in allen Karten vorhanden |
| packages/design-system/build.mjs, validate.mjs, _card.css, config.json, NOTES.md, *.test.mjs | source | mentolder | handgeschrieben (Build/Validate/Tests/Doku) | verified (repo-autoriert) | n/a (Hand) | Dateiinhalt; `config.json` nennt `tokenSource: website/public/brand/mentolder/colors_and_type.css` |

## design/leitstand-ds/ (20 Dateien, 85.122 Bytes)

| Gruppe | Verdict | Marke | Herkunft | Rechte | Generator | Beleg |
|---|---|---|---|---|---|---|
| design/leitstand-ds/_tokens.css | derived | leitstand | GENERATED-Kopie von `components/website/src/styles/sdlc-leitstand.css` (ausserhalb Inventur-Scope) — aktuell IN SYNC | unverified | `design/leitstand-ds/build.mjs` `extractTokens()`, Version unknown | GENERATED-Kopf; Body byte-identisch zur Quelle |
| design/leitstand-ds/assets/icons/ (6 × .svg) | derived | leitstand | Kopien von `components/website/public/cockpit/*.svg` (ausserhalb Scope) | unverified | `build.mjs` `copyAssets()`, Version unknown | 6/6 byte-identisch (`health-{green,amber,red}.svg`, `chip-{open,blocked,done}.svg`) |
| design/leitstand-ds/cards/*.html (6) | derived | leitstand | assemblierte Karten | unverified | `build.mjs` `assembleCard()`, Version unknown | `tokens:start`-Regionen vorhanden |
| design/leitstand-ds/build.mjs, validate.mjs, check-sync.mjs, _card.css, config.json, NOTES.md, *.test.mjs | source | leitstand | handgeschrieben | verified (repo-autoriert) | n/a (Hand) | Dateiinhalt; `config.json` nennt externe `tokenSource` |

## components/website/public/brand/ (89 Dateien, 3.778.665 Bytes)

| Gruppe | Verdict | Marke | Herkunft | Rechte | Generator | Beleg |
|---|---|---|---|---|---|---|
| components/website/public/brand/ — 79 Dateien mit Hash-Zwilling in `assets/` | derived | korczewski, mentolder, shared | rsync-Kopien aus `assets/branding/` (teils unter anderem Relativpfad) | unverified | `scripts/assets-sync.sh`, Version n/a | Hash-Gleichheit im Manifest; Mapping `assets/branding/` → `components/website/public/brand/` |
| components/website/public/brand/{korczewski,mentolder}/colors_and_type.css | source | korczewski, mentolder | consumer-seitig kanonische Token-CSS ( divergiert vom `assets/branding/`-Original) | unverified | unknown | kein Hash-Zwilling; dient `build.mjs` als Extraktions-Input (umgekehrte Kopplung) |
| components/website/public/brand/massage/ (2), korczewski/starters/*.html (2), mentolder/{icons.svg,og-*.png} (4) | source | massage, korczewski, mentolder | consumer-seitig ohne `assets/`-Ursprung | unverified | unknown | kein Hash-Zwilling im Manifest |

## components/brett/public/assets/ (135 Dateien, 2.342.446 Bytes)

| Gruppe | Verdict | Marke | Herkunft | Rechte | Generator | Beleg |
|---|---|---|---|---|---|---|
| components/brett/public/assets/sfx/ (63) | derived | brett | Spiegel von `assets/audio/` | verified CC0 (erbt `assets/audio/CREDITS.md`) | `scripts/assets-sync.sh` (`--delete`-Mapping) | 63/63 byte-identisch |
| components/brett/public/assets/combat/ (7 × .mjs) | derived | brett | Spiegel von `assets/game/` | unverified (erbt Quelle) | `scripts/assets-sync.sh` (`--delete`-Mapping) | 7/7 byte-identisch |
| components/brett/public/assets/ — 46 weitere Dateien mit Hash-Zwilling in `assets/` | derived | brett | Spiegel von `assets/`-Baeumen (characters, figure-pack, props, terrain) | unverified (erbt Quelle) | `scripts/assets-sync.sh` bzw. Hash-Beleg | Hash-Gleichheit im Manifest |
| components/brett/public/assets/coaching/*.mjs (8) | source | brett | consumer-seitig handgeschriebene Brett-Logik | verified (repo-autoriert) | n/a (Hand) | kein Hash-Zwilling; `coaching/brand.mjs` wird von `components/brett/src/client/ui/persons.ts` importiert |
| components/brett/public/assets/figure-pack/{faces,accessories}/*.png (10), placement_spec.json | source | brett | consumer-seitig ohne `assets/`-Ursprung; `portrait-*.png` sehen nach privaten Portraits aus | unverified — Portraits nicht ohne Consent weiterverteilen (Ticket-Verbot) | unknown | kein Hash-Zwilling im Manifest |

## Offene Punkte (keine erfundenen Fakten)

- Lizenzlage von `assets/art-library/`, `assets/brands/`, `assets/design-overviews/`,
  `assets/grilling-brett-admin-panel/` und allen Brand-/Brett-Derivaten ist
  `unverified` — Klaerung vor jeder Designs-Repo-Migration noetig.
- Generator-Versionen, Prompts, Seeds und Modell-Lizenzen sind nirgends im
  Scope belegt — durchgehend `unknown`.
- Driftfaelle (Derivat weicht von Quelle ab): `packages/design-system/_tokens.css`
  vs. Brand-CSS, Brand-Token-CSS vs. `assets/branding/`-Originale. Re-Sync ist
  Follow-up, nicht Teil dieser Inventur.
